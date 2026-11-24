import * as THREE from "three";
import { clamp } from "./track.ts";
import type { Track } from "./track.ts";
import { roadFrame, roadStrip, roadStations } from "./road-cross-section.ts";

export {
  roadFrame,
  roadStrip,
  roadStations,
  roadPoint,
} from "./road-cross-section.ts";
export type { RoadSurfaceFrame } from "./road-cross-section.ts";

export interface RoadSurfaceContact {
  /** Modulo-lap station; the caller maintains the physical lap winding. */
  s: number;
  branch: number;
  /** Stable physical top triangle, for restricted finite contact settling. */
  faceId: number;
  /** Point on the actual deck, not the hull centre or hover target. */
  point: THREE.Vector3;
  up: THREE.Vector3;
  fraction: number;
}

export interface RoadContactHull {
  faces: readonly (readonly number[])[];
  radius: number;
}

export interface FiniteRoadContact extends RoadSurfaceContact {
  /** Signed normal clearance of the lowest hull surface over this finite face. */
  distance: number;
  hullPoint: THREE.Vector3;
}

/** Immutable view of an indexed physical top face for visual projection. */
export interface RoadSurfaceTriangle {
  readonly a: Readonly<THREE.Vector3Like>;
  readonly b: Readonly<THREE.Vector3Like>;
  readonly c: Readonly<THREE.Vector3Like>;
  readonly up: Readonly<THREE.Vector3Like>;
  readonly sa: number;
  readonly sb: number;
  readonly sc: number;
  readonly branch: number;
}

interface SurfaceTriangle {
  id: number;
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  up: THREE.Vector3;
  sa: number;
  sb: number;
  sc: number;
  branch: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface SurfaceNode {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  triangle?: SurfaceTriangle;
  left?: SurfaceNode;
  right?: SurfaceNode;
}

function indexTriangles(triangles: SurfaceTriangle[]): SurfaceNode {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const triangle of triangles) {
    minX = Math.min(minX, triangle.minX);
    maxX = Math.max(maxX, triangle.maxX);
    minZ = Math.min(minZ, triangle.minZ);
    maxZ = Math.max(maxZ, triangle.maxZ);
  }
  if (triangles.length === 1)
    return { minX, maxX, minZ, maxZ, triangle: triangles[0] };
  const xAxis = maxX - minX >= maxZ - minZ;
  triangles.sort((a, b) =>
    xAxis
      ? a.minX + a.maxX - b.minX - b.maxX
      : a.minZ + a.maxZ - b.minZ - b.maxZ,
  );
  const middle = Math.floor(triangles.length / 2);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    left: indexTriangles(triangles.slice(0, middle)),
    right: indexTriangles(triangles.slice(middle)),
  };
}

function visit(
  node: SurfaceNode,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  action: (triangle: SurfaceTriangle) => void,
) {
  if (
    node.maxX < minX ||
    node.minX > maxX ||
    node.maxZ < minZ ||
    node.minZ > maxZ
  )
    return;
  if (node.triangle) action(node.triangle);
  else {
    visit(node.left!, minX, maxX, minZ, maxZ, action);
    visit(node.right!, minX, maxX, minZ, maxZ, action);
  }
}

/** Barycentric containment in the road's nonvertical XZ triangle. */
function coordinates(triangle: SurfaceTriangle, point: THREE.Vector3Like) {
  const { a, b, c } = triangle;
  return barycentric2([a.x, a.z], [b.x, b.z], [c.x, c.z], [point.x, point.z]);
}

function contact(
  triangle: SurfaceTriangle,
  weights: number[],
  point: THREE.Vector3,
  fraction: number,
): RoadSurfaceContact {
  return {
    s:
      triangle.sa * weights[0] +
      triangle.sb * weights[1] +
      triangle.sc * weights[2],
    branch: triangle.branch,
    faceId: triangle.id,
    point,
    up: triangle.up.clone(),
    fraction,
  };
}

/** Physical top faces only: route eligibility and checkpoints belong to Race. */
export class RoadSurface {
  readonly lowestRoadY: number;
  private readonly root: SurfaceNode;
  private readonly triangles: readonly SurfaceTriangle[];

  constructor(track: Track) {
    const triangles: SurfaceTriangle[] = [];
    const stations = roadStations(track);
    for (let i = 0; i < stations.length - 1; i++) {
      const u = stations[i];
      if (track.gap(u)) continue;
      const split = u >= track.config.split[0] && u < track.config.split[1];
      for (const branch of split ? [-1, 1] : [0]) {
        const a = roadFrame(track, u * track.length, branch);
        const bStation =
          stations[i + 1] * track.length -
          (stations[i + 1] === track.config.jump ? 0.000001 : 0);
        const b = roadFrame(track, bStation, branch);
        const leftA = clamp(-a.width, a.clipMin, a.clipMax);
        const rightA = clamp(a.width, a.clipMin, a.clipMax);
        const leftB = clamp(-b.width, b.clipMin, b.clipMax);
        const rightB = clamp(b.width, b.clipMin, b.clipMax);
        if (leftA === rightA && leftB === rightB) continue;
        const divisions = track.config.name === "NOCTILUCENT" ? 8 : 1;
        for (let strip = 0; strip < divisions; strip++) {
          const x0 =
            strip === 0
              ? leftA
              : THREE.MathUtils.lerp(leftA, rightA, strip / divisions);
          const x1 =
            strip + 1 === divisions
              ? rightA
              : THREE.MathUtils.lerp(leftA, rightA, (strip + 1) / divisions);
          const x2 =
            strip + 1 === divisions
              ? rightB
              : THREE.MathUtils.lerp(leftB, rightB, (strip + 1) / divisions);
          const x3 =
            strip === 0
              ? leftB
              : THREE.MathUtils.lerp(leftB, rightB, strip / divisions);
          const geometry = roadStrip(
            track,
            a,
            b,
            [x0, x1, x2, x3],
            0,
            [strip / divisions, (strip + 1) / divisions],
            true,
          );
          const points = geometry.p;
          // Match the renderer's Float32BufferAttribute, diagonal and winding.
          for (const p of points)
            p.set(Math.fround(p.x), Math.fround(p.y), Math.fround(p.z));
          const s = geometry.ends.map((end) =>
            end ? bStation : u * track.length,
          );
          for (
            let triangle = 0;
            triangle < geometry.indices.length;
            triangle += 3
          ) {
            const indices = geometry.indices.slice(triangle, triangle + 3);
            const [p, q, r] = indices.map((j) => points[j]);
            const up = new THREE.Vector3().crossVectors(
              q.clone().sub(p),
              r.clone().sub(p),
            );
            if (up.y === 0) continue;
            up.normalize();
            triangles.push({
              id: triangles.length,
              a: p,
              b: q,
              c: r,
              up,
              sa: s[indices[0]],
              sb: s[indices[1]],
              sc: s[indices[2]],
              branch,
              minX: Math.min(p.x, q.x, r.x),
              maxX: Math.max(p.x, q.x, r.x),
              minZ: Math.min(p.z, q.z, r.z),
              maxZ: Math.max(p.z, q.z, r.z),
            });
          }
        }
      }
    }
    this.lowestRoadY = triangles.reduce(
      (minimum, t) => Math.min(minimum, t.a.y, t.b.y, t.c.y),
      Infinity,
    );
    this.triangles = [...triangles];
    this.root = indexTriangles(triangles);
  }

  /** Visit existing top faces overlapping a footprint; the static index is shared. */
  forEachTriangle(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    action: (triangle: RoadSurfaceTriangle) => void,
  ): void {
    visit(this.root, minX, maxX, minZ, maxZ, action);
  }

  /** Local suspension support, not permission to acquire another route. */
  beneath(
    position: THREE.Vector3,
    minHeight: number,
    maxHeight: number,
  ): RoadSurfaceContact | null {
    let best: RoadSurfaceContact | null = null;
    visit(
      this.root,
      position.x,
      position.x,
      position.z,
      position.z,
      (triangle) => {
        const weights = coordinates(triangle, position);
        if (!weights) return;
        const y =
          triangle.a.y * weights[0] +
          triangle.b.y * weights[1] +
          triangle.c.y * weights[2];
        const height = position.y - y;
        if (height < 0 || height < minHeight || height > maxHeight) return;
        if (best && best.point.y >= y) return;
        best = contact(
          triangle,
          weights,
          new THREE.Vector3(position.x, y, position.z),
          0,
        );
      },
    );
    return best;
  }

  /**
   * Complete vertex/face and edge/edge events for linearly moving endpoint
   * vertices. Pose rotation is linearized over the caller's physics step, not
   * treated as an exact rotational arc. Transient finite-face overlap counts.
   * New top entry requires nonnegative initial clearance over the finite face.
   * A hull already penetrating it cannot acquire it by rotating or exiting;
   * existing-contact penetration is handled separately by finiteContact. A hull
   * initially intersecting any finite road top cannot acquire a neighbor face.
   */
  sweep(
    from: THREE.Vector3,
    to: THREE.Vector3,
    hull: RoadContactHull,
    verticesAt: (fraction: number) => readonly THREE.Vector3[],
  ): RoadSurfaceContact | null {
    const relativeBefore = verticesAt(0),
      relativeAfter = verticesAt(1);
    let worldBefore: THREE.Vector3[] | null = null,
      worldAfter: THREE.Vector3[] | null = null;
    const topology = hullTopology(hull);
    let best: RoadSurfaceContact | null = null;
    let initialIntersection: boolean | null = null;
    const startsInsideRoad = (): boolean => {
      if (initialIntersection !== null) return initialIntersection;
      initialIntersection = false;
      visit(
        this.root,
        from.x - hull.radius,
        from.x + hull.radius,
        from.z - hull.radius,
        from.z + hull.radius,
        (triangle) => {
          if (initialIntersection) return;
          let minimum = Infinity,
            maximum = -Infinity;
          for (const p of relativeBefore) {
            const d =
              (from.x - triangle.a.x + p.x) * triangle.up.x +
              (from.y - triangle.a.y + p.y) * triangle.up.y +
              (from.z - triangle.a.z + p.z) * triangle.up.z;
            minimum = Math.min(minimum, d);
            maximum = Math.max(maximum, d);
          }
          if (minimum >= 0 || maximum <= 0) return;
          const vertices = (worldBefore ??= relativeBefore.map((p) =>
            p.clone().add(from),
          ));
          const range = finiteRange(triangle, vertices, hull);
          if (range && range.minimum < 0 && range.maximum > 0)
            initialIntersection = true;
        },
      );
      return initialIntersection;
    };
    visit(
      this.root,
      Math.min(from.x, to.x) - hull.radius,
      Math.max(from.x, to.x) + hull.radius,
      Math.min(from.z, to.z) - hull.radius,
      Math.max(from.z, to.z) + hull.radius,
      (triangle) => {
        // Ordinary hover never materializes world vertices or per-face arrays.
        // Linear endpoint vertex motion makes scalar min/max separation safe
        // for the entire step, including transient footprint overlap.
        const distance = (p: THREE.Vector3, centre: THREE.Vector3) =>
          (centre.x - triangle.a.x + p.x) * triangle.up.x +
          (centre.y - triangle.a.y + p.y) * triangle.up.y +
          (centre.z - triangle.a.z + p.z) * triangle.up.z;
        let minimum = Infinity,
          maximum = -Infinity,
          minimumBefore = Infinity;
        for (let i = 0; i < relativeBefore.length; i++) {
          const a = distance(relativeBefore[i], from),
            b = distance(relativeAfter[i], to);
          minimum = Math.min(minimum, a, b);
          maximum = Math.max(maximum, a, b);
          minimumBefore = Math.min(minimumBefore, a);
        }
        if (minimum > 0 || maximum < 0) return;
        // A global support point below the plane may hang over a gap while
        // the finite road remains clear. Clip only this rare ambiguous start.
        // No footprint plus a below-plane hull is not an above-deck approach.
        if (minimumBefore < 0) {
          const initial = this.finiteContact(
            triangle.id,
            from,
            hull,
            relativeBefore,
          );
          if (!initial || initial.distance < 0) return;
        }
        const before = (worldBefore ??= relativeBefore.map((p) =>
          p.clone().add(from),
        ));
        const after = (worldAfter ??= relativeAfter.map((p) =>
          p.clone().add(to),
        ));
        const distancesBefore = relativeBefore.map((p) => distance(p, from));
        const distancesAfter = relativeAfter.map((p) => distance(p, to));
        best = sweepTriangle(
          triangle,
          hull,
          topology,
          before,
          after,
          distancesBefore,
          distancesAfter,
          startsInsideRoad,
          best,
        );
      },
    );
    return best;
  }

  /** Signed support over an already acquired finite triangle; never reacquires a deck. */
  finiteContact(
    faceId: number,
    centre: THREE.Vector3,
    hull: RoadContactHull,
    relativeVertices: readonly THREE.Vector3[],
  ): FiniteRoadContact | null {
    const triangle = this.triangles[faceId];
    const vertices = relativeVertices.map((p) => p.clone().add(centre));
    if (vertices.every((p) => p.clone().sub(triangle.a).dot(triangle.up) < 0))
      return null;
    const range = finiteRange(triangle, vertices, hull);
    if (!range) return null;
    const { lowest, minimum: distance } = range;
    // Clipping already proves finite membership. Re-testing its rounded edge
    // point as an independent containment query can reject valid support far
    // from the world origin. Close its barycentrics on the triangle instead.
    const { a, b, c } = triangle;
    const bx = b.x - a.x,
      bz = b.z - a.z;
    const cx = c.x - a.x,
      cz = c.z - a.z;
    const px = lowest.x - a.x,
      pz = lowest.z - a.z;
    const determinant = bx * cz - bz * cx;
    const v = (px * cz - pz * cx) / determinant;
    const w = (bx * pz - bz * px) / determinant;
    const weights = [1 - v - w, v, w].map((x) => clamp(x, 0, 1));
    const sum = weights[0] + weights[1] + weights[2];
    for (let i = 0; i < 3; i++) weights[i] /= sum;
    const point = a
      .clone()
      .multiplyScalar(weights[0])
      .addScaledVector(b, weights[1])
      .addScaledVector(c, weights[2]);
    return {
      ...contact(triangle, weights, point, 0),
      distance,
      hullPoint: lowest,
    };
  }
}

function sweepTriangle(
  triangle: SurfaceTriangle,
  hull: RoadContactHull,
  topology: HullTopology,
  before: THREE.Vector3[],
  after: THREE.Vector3[],
  distancesBefore: number[],
  distancesAfter: number[],
  startsInsideRoad: () => boolean,
  best: RoadSurfaceContact | null,
) {
  const centreBefore = before
    .reduce((sum, p) => sum.add(p), new THREE.Vector3())
    .divideScalar(before.length);
  const centreAfter = after
    .reduce((sum, p) => sum.add(p), new THREE.Vector3())
    .divideScalar(after.length);
  const lowerFaceAt = (face: readonly number[], fraction: number) => {
    const a = before[face[0]].clone().lerp(after[face[0]], fraction);
    const b = before[face[1]].clone().lerp(after[face[1]], fraction);
    const c = before[face[2]].clone().lerp(after[face[2]], fraction);
    const normal = new THREE.Vector3().crossVectors(b.sub(a), c.sub(a));
    const centre = centreBefore.clone().lerp(centreAfter, fraction);
    if (normal.dot(a.clone().sub(centre)) < 0) normal.negate();
    return normal.dot(triangle.up) < 0;
  };
  const accept = (
    fraction: number,
    point: THREE.Vector3,
    velocity: THREE.Vector3,
  ) => {
    if ((best && fraction >= best.fraction) || velocity.dot(triangle.up) >= 0)
      return;
    const onPlane = point
      .clone()
      .addScaledVector(
        triangle.up,
        -point.clone().sub(triangle.a).dot(triangle.up),
      );
    const weights = coordinates(triangle, onPlane);
    // Entering a clean neighboring triangle is not a new landing if the
    // hull already intersects another actual finite top face. Existing
    // support settling is separate; gaps and overhead decks add no block.
    if (weights && !startsInsideRoad())
      best = contact(triangle, weights, onPlane, fraction);
  };
  for (let i = 0; i < before.length; i++) {
    const a = distancesBefore[i],
      b = distancesAfter[i];
    if (a < 0 || b > 0 || a <= b) continue;
    const fraction = a / (a - b);
    if (
      hull.faces.length &&
      !topology.vertexFaces.get(i)!.some((face) => lowerFaceAt(face, fraction))
    )
      continue;
    accept(
      fraction,
      before[i].clone().lerp(after[i], fraction),
      after[i].clone().sub(before[i]),
    );
  }
  const touchesPlane = (indices: readonly number[]) =>
    !(
      indices.every((i) => distancesBefore[i] > 0 && distancesAfter[i] > 0) ||
      indices.every((i) => distancesBefore[i] < 0 && distancesAfter[i] < 0)
    );
  const faces = topology.faces.filter(touchesPlane);
  const roadVertices = [triangle.a, triangle.b, triangle.c];
  for (const point of roadVertices) {
    for (const face of faces) {
      const a = face.map((i) => before[i]);
      const b = face.map((i) => after[i]);
      if (!boundsOverlap([...a, ...b], [point])) continue;
      for (const fraction of coplanarTimes(point, a, b)) {
        if (best && fraction >= best.fraction) continue;
        const vertices = a.map((p, i) => p.clone().lerp(b[i], fraction));
        const weights = faceCoordinates(vertices, point);
        if (!weights) continue;
        if (!lowerFaceAt(face, fraction)) continue;
        const velocity = a.reduce(
          (sum, p, i) => sum.addScaledVector(b[i].clone().sub(p), weights[i]),
          new THREE.Vector3(),
        );
        accept(fraction, point, velocity);
      }
    }
  }
  for (const edge of topology.edges) {
    const [i, j] = edge.vertices;
    if (!touchesPlane(edge.vertices)) continue;
    for (let k = 0; k < 3; k++) {
      const c = roadVertices[k],
        d = roadVertices[(k + 1) % 3];
      if (!boundsOverlap([before[i], after[i], before[j], after[j]], [c, d]))
        continue;
      for (const fraction of edgeTimes(
        before[i],
        after[i],
        before[j],
        after[j],
        c,
        d,
      )) {
        if (
          (best && fraction >= best.fraction) ||
          !edge.faces.some((face) => lowerFaceAt(face, fraction))
        )
          continue;
        const a = before[i].clone().lerp(after[i], fraction);
        const b = before[j].clone().lerp(after[j], fraction);
        const intersection = edgeIntersection(a, b, c, d);
        if (!intersection) continue;
        const velocity = after[i]
          .clone()
          .sub(before[i])
          .lerp(after[j].clone().sub(before[j]), intersection.along);
        accept(fraction, intersection.point, velocity);
      }
    }
  }
  return best;
}

function boundsOverlap(
  a: readonly THREE.Vector3[],
  b: readonly THREE.Vector3[],
) {
  for (const axis of ["x", "y", "z"] as const) {
    if (
      Math.max(...a.map((p) => p[axis])) < Math.min(...b.map((p) => p[axis])) ||
      Math.max(...b.map((p) => p[axis])) < Math.min(...a.map((p) => p[axis]))
    )
      return false;
  }
  return true;
}

interface HullTopology {
  faces: number[][];
  vertexFaces: Map<number, (readonly number[])[]>;
  edges: { vertices: [number, number]; faces: (readonly number[])[] }[];
}
const topologies = new WeakMap<RoadContactHull, HullTopology>();
function hullTopology(hull: RoadContactHull): HullTopology {
  let topology = topologies.get(hull);
  if (!topology) {
    const faces: number[][] = [];
    const vertexFaces = new Map<number, (readonly number[])[]>();
    const edges = new Map<
      string,
      { vertices: [number, number]; faces: (readonly number[])[] }
    >();
    for (const face of hull.faces) {
      for (const vertex of face) {
        const adjacent = vertexFaces.get(vertex) ?? [];
        adjacent.push(face);
        vertexFaces.set(vertex, adjacent);
      }
      for (let i = 1; i + 1 < face.length; i++)
        faces.push([face[0], face[i], face[i + 1]]);
      for (let i = 0; i < face.length; i++) {
        const a = face[i],
          b = face[(i + 1) % face.length];
        const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
        let edge = edges.get(key);
        if (!edge) {
          edge = { vertices: [a, b], faces: [] };
          edges.set(key, edge);
        }
        edge.faces.push(face);
      }
    }
    topology = { faces, vertexFaces, edges: [...edges.values()] };
    topologies.set(hull, topology);
  }
  return topology;
}

// Arithmetic error bounds, not a world-space contact skin or capture tolerance.
function arithmeticError(terms: readonly number[], operations: number) {
  const gamma =
    (operations * Number.EPSILON) / (1 - operations * Number.EPSILON);
  return gamma * terms.reduce((sum, x) => sum + Math.abs(x), 0);
}
function barycentric2(a: number[], b: number[], c: number[], p: number[]) {
  const bx = b[0] - a[0],
    bz = b[1] - a[1];
  const cx = c[0] - a[0],
    cz = c[1] - a[1];
  const px = p[0] - a[0],
    pz = p[1] - a[1];
  const determinant = bx * cz - bz * cx;
  if (determinant === 0) return null;
  const v = px * cz - pz * cx;
  const w = bx * pz - bz * px;
  const u = determinant - v - w;
  const error = arithmeticError(
    [bx * cz, bz * cx, px * cz, pz * cx, bx * pz, bz * px],
    16,
  );
  const sign = Math.sign(determinant);
  if (sign * u < -error || sign * v < -error || sign * w < -error) return null;
  const weights = [u, v, w].map((x) => Math.max(0, x / determinant));
  const sum = weights[0] + weights[1] + weights[2];
  return weights.map((x) => x / sum);
}
function faceCoordinates(vertices: THREE.Vector3[], point: THREE.Vector3) {
  const normal = new THREE.Vector3().crossVectors(
    vertices[1].clone().sub(vertices[0]),
    vertices[2].clone().sub(vertices[0]),
  );
  const axis =
    Math.abs(normal.x) >= Math.abs(normal.y) &&
    Math.abs(normal.x) >= Math.abs(normal.z)
      ? "x"
      : Math.abs(normal.y) >= Math.abs(normal.z)
        ? "y"
        : "z";
  const flatten = (p: THREE.Vector3) =>
    axis === "x" ? [p.y, p.z] : axis === "y" ? [p.x, p.z] : [p.x, p.y];
  return barycentric2(
    flatten(vertices[0]),
    flatten(vertices[1]),
    flatten(vertices[2]),
    flatten(point),
  );
}

/** Roots on [0,1], split at derivative roots so a short-lived event cannot hide. */
function polynomialRoots(coefficients: number[]): number[] {
  const p = [...coefficients];
  while (p.length > 1 && p[p.length - 1] === 0) p.pop();
  if (p.length === 1) return [];
  if (p.length === 2) {
    const t = -p[0] / p[1];
    return t >= 0 && t <= 1 ? [t] : [];
  }
  const evaluate = (t: number) => p.reduceRight((sum, c) => sum * t + c, 0);
  const errorAt = (t: number) =>
    arithmeticError(
      p.map((c, i) => c * t ** i),
      2 * p.length,
    );
  const cuts = [
    0,
    ...polynomialRoots(p.slice(1).map((c, i) => c * (i + 1))).filter(
      (t) => t > 0 && t < 1,
    ),
    1,
  ];
  const roots: number[] = [];
  for (const t of cuts) if (Math.abs(evaluate(t)) <= errorAt(t)) roots.push(t);
  for (let i = 0; i + 1 < cuts.length; i++) {
    let left = cuts[i],
      right = cuts[i + 1];
    let a = evaluate(left),
      b = evaluate(right);
    if (a === 0 || b === 0 || Math.sign(a) === Math.sign(b)) continue;
    while (true) {
      const middle = (left + right) / 2;
      if (middle === left || middle === right) break;
      const value = evaluate(middle);
      if (value === 0) {
        left = right = middle;
        break;
      }
      if (Math.sign(value) === Math.sign(a)) {
        left = middle;
        a = value;
      } else {
        right = middle;
        b = value;
      }
    }
    roots.push(
      Math.abs(evaluate(left)) <= Math.abs(evaluate(right)) ? left : right,
    );
  }
  return [...new Set(roots)].sort((a, b) => a - b);
}
function coplanarTimes(
  point: THREE.Vector3,
  a: THREE.Vector3[],
  b: THREE.Vector3[],
) {
  const v = a.map((p, i) => b[i].clone().sub(p));
  const x = a[0].clone().sub(point),
    dx = v[0];
  const y = a[1].clone().sub(a[0]),
    dy = v[1].clone().sub(v[0]);
  const z = a[2].clone().sub(a[0]),
    dz = v[2].clone().sub(v[0]);
  const n0 = new THREE.Vector3().crossVectors(y, z);
  const n1 = new THREE.Vector3()
    .crossVectors(y, dz)
    .add(new THREE.Vector3().crossVectors(dy, z));
  const n2 = new THREE.Vector3().crossVectors(dy, dz);
  return polynomialRoots([
    x.dot(n0),
    dx.dot(n0) + x.dot(n1),
    dx.dot(n1) + x.dot(n2),
    dx.dot(n2),
  ]);
}
function edgeTimes(
  a: THREE.Vector3,
  endA: THREE.Vector3,
  b: THREE.Vector3,
  endB: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
) {
  const velocityA = endA.clone().sub(a),
    velocityB = endB.clone().sub(b);
  const x = c.clone().sub(a),
    dx = velocityA.clone().negate();
  const y = b.clone().sub(a),
    dy = velocityB.sub(velocityA);
  const edge = d.clone().sub(c);
  const n0 = new THREE.Vector3().crossVectors(y, edge);
  const n1 = new THREE.Vector3().crossVectors(dy, edge);
  return polynomialRoots([x.dot(n0), dx.dot(n0) + x.dot(n1), dx.dot(n1)]);
}
function edgeIntersection(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
) {
  const u = b.clone().sub(a),
    v = d.clone().sub(c),
    w = a.clone().sub(c);
  const uu = u.dot(u),
    uv = u.dot(v),
    vv = v.dot(v),
    uw = u.dot(w),
    vw = v.dot(w);
  const determinant = uu * vv - uv * uv;
  if (determinant === 0) return null;
  const along = (uv * vw - vv * uw) / determinant;
  const other = (uu * vw - uv * uw) / determinant;
  const error =
    arithmeticError(
      [uu * vv, uv * uv, uv * vw, vv * uw, uu * vw, uv * uw],
      16,
    ) / Math.abs(determinant);
  if (
    along < -error ||
    along > 1 + error ||
    other < -error ||
    other > 1 + error
  )
    return null;
  const fraction = clamp(along, 0, 1);
  return { along: fraction, point: a.clone().addScaledVector(u, fraction) };
}
function clipToRoad(polygon: THREE.Vector3[], triangle: SurfaceTriangle) {
  const corners = [triangle.a, triangle.b, triangle.c];
  const orientation = Math.sign(
    (triangle.b.x - triangle.a.x) * (triangle.c.z - triangle.a.z) -
      (triangle.b.z - triangle.a.z) * (triangle.c.x - triangle.a.x),
  );
  let result = polygon;
  for (let i = 0; i < 3 && result.length; i++) {
    const a = corners[i],
      b = corners[(i + 1) % 3];
    const distance = (p: THREE.Vector3) =>
      orientation * ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x));
    const input = result;
    result = [];
    let previous = input[input.length - 1],
      previousDistance = distance(previous);
    for (const current of input) {
      const currentDistance = distance(current);
      if (previousDistance >= 0 !== currentDistance >= 0)
        result.push(
          previous
            .clone()
            .lerp(
              current,
              previousDistance / (previousDistance - currentDistance),
            ),
        );
      if (currentDistance >= 0) result.push(current);
      previous = current;
      previousDistance = currentDistance;
    }
  }
  return result;
}

/** Actual finite hull surfaces above/below a top face, not infinite-plane extent. */
function finiteRange(
  triangle: SurfaceTriangle,
  vertices: readonly THREE.Vector3[],
  hull: RoadContactHull,
) {
  let lowest: THREE.Vector3 | null = null,
    minimum = Infinity,
    maximum = -Infinity;
  for (const face of hull.faces) {
    for (const point of clipToRoad(
      face.map((i) => vertices[i]),
      triangle,
    )) {
      const distance = point.clone().sub(triangle.a).dot(triangle.up);
      if (distance < minimum) {
        minimum = distance;
        lowest = point;
      }
      maximum = Math.max(maximum, distance);
    }
  }
  return lowest ? { lowest, minimum, maximum } : null;
}

const surfaces = new WeakMap<Track, RoadSurface>();

/** The expensive static geometry/index is built once, only when first needed. */
export function getRoadSurface(track: Track): RoadSurface {
  let surface = surfaces.get(track);
  if (!surface) {
    surface = new RoadSurface(track);
    surfaces.set(track, surface);
  }
  return surface;
}
