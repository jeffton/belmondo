import * as THREE from "three";

export type ShadowBounds = readonly [number, number, number, number];

/** Structural view of RoadSurface's read-only BVH query. */
export interface ShadowTriangle {
  readonly a: THREE.Vector3Like;
  readonly b: THREE.Vector3Like;
  readonly c: THREE.Vector3Like;
  readonly sa: number;
  readonly sb: number;
  readonly sc: number;
}

export interface ShadowSurface {
  beneath(
    position: THREE.Vector3,
    minHeight: number,
    maxHeight: number,
  ): { s: number; point: THREE.Vector3Like } | null;
  forEachTriangle(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    visit: (triangle: ShadowTriangle) => void,
  ): void;
}

interface TriangleTopology {
  trackLength: number;
  edges: string[];
  transverse: {
    station: number;
    a: THREE.Vector3Like;
    b: THREE.Vector3Like;
    key: string;
  }[];
}

// Surface triangles are immutable and shared by all eight projectors. Cache
// world/station keys once instead of rebuilding long strings each render frame.
const topology = new WeakMap<ShadowTriangle, TriangleTopology>();
function triangleTopology(
  triangle: ShadowTriangle,
  trackLength: number,
): TriangleTopology {
  const existing = topology.get(triangle);
  if (existing && existing.trackLength === trackLength) return existing;
  const points = [triangle.a, triangle.b, triangle.c];
  const stations = [triangle.sa, triangle.sb, triangle.sc].map(
    (s) => ((s % trackLength) + trackLength) % trackLength,
  );
  const vertices = points.map((p, i) => `${p.x},${p.y},${p.z},${stations[i]}`);
  const edges = vertices.map((a, i) => {
    const b = vertices[(i + 1) % 3];
    return a < b ? `${a}/${b}` : `${b}/${a}`;
  });
  const result: TriangleTopology = { trackLength, edges, transverse: [] };
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    if (stations[i] === stations[j])
      result.transverse.push({
        station: stations[i],
        a: points[i],
        b: points[j],
        key: edges[i],
      });
  }
  topology.set(triangle, result);
  return result;
}

interface Vertex {
  x: number;
  y: number;
  z: number;
  u: number;
  v: number;
}

function clip(
  polygon: Vertex[],
  distance: (vertex: Vertex) => number,
): Vertex[] {
  const result: Vertex[] = [];
  let previous = polygon[polygon.length - 1];
  if (!previous) return result;
  let before = distance(previous);
  for (const current of polygon) {
    const after = distance(current);
    if (before < 0 !== after < 0) {
      const t = before / (before - after);
      result.push({
        x: THREE.MathUtils.lerp(previous.x, current.x, t),
        y: THREE.MathUtils.lerp(previous.y, current.y, t),
        z: THREE.MathUtils.lerp(previous.z, current.z, t),
        u: THREE.MathUtils.lerp(previous.u, current.u, t),
        v: THREE.MathUtils.lerp(previous.v, current.v, t),
      });
    }
    if (after >= 0) result.push(current);
    previous = current;
    before = after;
  }
  return result;
}

function contains(triangle: ShadowTriangle, point: THREE.Vector3Like): boolean {
  const { a, b, c } = triangle;
  const bx = b.x - a.x,
    bz = b.z - a.z,
    cx = c.x - a.x,
    cz = c.z - a.z,
    px = point.x - a.x,
    pz = point.z - a.z,
    determinant = bx * cz - bz * cx;
  const v = (px * cz - pz * cx) / determinant;
  const w = (bx * pz - bz * px) / determinant;
  // Beneath's interpolation and the plane interpolation differ at roundoff.
  const epsilon = Number.EPSILON * 64;
  const y = a.y + (b.y - a.y) * v + (c.y - a.y) * w;
  return (
    v >= -epsilon &&
    w >= -epsilon &&
    v + w <= 1 + epsilon &&
    Math.abs(y - point.y) <=
      epsilon * Math.max(1, Math.abs(y), Math.abs(point.y))
  );
}

/**
 * A yawed hull mask vertically projected onto one connected physical road deck.
 * No hovering quad, raycaster, route eligibility or synthetic gap bridge.
 */
export class CraftShadow {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly bounds: ShadowBounds;
  private capacity = 0;

  constructor(texture: THREE.Texture, bounds: ShadowBounds) {
    this.bounds = bounds;
    this.mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        map: texture,
        color: 0x000000,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    // Vertices are world-space and updated per racer; no stale bounding sphere.
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  update(
    surface: ShadowSurface,
    position: THREE.Vector3,
    yaw: number,
    trackLength: number,
  ): void {
    const { mesh } = this;
    mesh.visible = false;
    mesh.geometry.setDrawRange(0, 0);
    const contact = surface.beneath(position, 0, Infinity);
    if (!contact) return;
    const height = position.y - contact.point.y;
    // Gaussian penumbra attenuation: continuous at every physical height.
    mesh.material.opacity = 0.27 * Math.exp(-((height / 10) ** 2));
    const [minX, maxX, minZ, maxZ] = this.bounds;
    const cos = Math.cos(yaw),
      sin = Math.sin(yaw);
    const corners = [
      [minX, minZ],
      [maxX, minZ],
      [maxX, maxZ],
      [minX, maxZ],
    ].map(([x, z]) => ({
      x: position.x + cos * x + sin * z,
      z: position.z - sin * x + cos * z,
    }));
    const triangles: ShadowTriangle[] = [];
    surface.forEachTriangle(
      Math.min(...corners.map((p) => p.x)),
      Math.max(...corners.map((p) => p.x)),
      Math.min(...corners.map((p) => p.z)),
      Math.max(...corners.map((p) => p.z)),
      (triangle) => triangles.push(triangle),
    );

    // Connectivity, not branch identity or a station-distance quota, selects the
    // receiving deck. Station-bearing edges distinguish coincident crossings;
    // lap normalization connects the actual finish seam.
    const edges = new Map<string, number[]>();
    const triangleEdges: string[][] = [];
    const transverse = new Map<
      number,
      {
        index: number;
        a: THREE.Vector3Like;
        b: THREE.Vector3Like;
        key: string;
      }[]
    >();
    for (let i = 0; i < triangles.length; i++) {
      const data = triangleTopology(triangles[i], trackLength);
      for (const key of data.edges) {
        const neighbors = edges.get(key);
        if (neighbors) neighbors.push(i);
        else edges.set(key, [i]);
      }
      triangleEdges.push([...data.edges]);
      for (const edge of data.transverse) {
        const group = transverse.get(edge.station) ?? [];
        group.push({ index: i, a: edge.a, b: edge.b, key: edge.key });
        transverse.set(edge.station, group);
      }
    }
    // At a fork tip one incoming transverse edge meets two outgoing half-edges.
    // Their shared station and overlapping physical segment establish continuity
    // even when the triangulations do not share identical complete edges.
    for (const candidates of transverse.values()) {
      // Exact shared edges are already stitched. Only unmatched boundaries can
      // need the fork-tip half-edge test; interior strip subdivisions need none.
      const group = candidates.filter(
        (edge) => edges.get(edge.key)!.length === 1,
      );
      for (let i = 0; i < group.length; i++) {
        const a = group[i];
        const start = new THREE.Vector3().copy(a.a);
        const direction = new THREE.Vector3().copy(a.b).sub(start);
        const length = direction.length();
        if (!length) continue;
        direction.divideScalar(length);
        for (let j = i + 1; j < group.length; j++) {
          const b = group[j];
          if (a.index === b.index) continue;
          const scale = Math.max(
            1,
            ...[a.a, a.b, b.a, b.b].flatMap((p) => [
              Math.abs(p.x),
              Math.abs(p.y),
              Math.abs(p.z),
            ]),
          );
          // Surface vertices are Float32: allow only their quantization error.
          const tolerance = 4 * 2 ** (Math.floor(Math.log2(scale)) - 23);
          const p = new THREE.Vector3().copy(b.a).sub(start);
          const q = new THREE.Vector3().copy(b.b).sub(start);
          const alongP = p.dot(direction),
            alongQ = q.dot(direction);
          if (
            p.addScaledVector(direction, -alongP).length() > tolerance ||
            q.addScaledVector(direction, -alongQ).length() > tolerance
          )
            continue;
          if (
            Math.min(length, Math.max(alongP, alongQ)) -
              Math.max(0, Math.min(alongP, alongQ)) <=
            tolerance
          )
            continue;
          const key = `tip:${a.index}:${b.index}`;
          edges.set(key, [a.index, b.index]);
          triangleEdges[a.index].push(key);
          triangleEdges[b.index].push(key);
        }
      }
    }
    const selected = new Set<number>();
    const queue: number[] = [];
    for (let i = 0; i < triangles.length; i++) {
      const t = triangles[i];
      // Contact station also disambiguates exactly coplanar, nonlocal roads.
      const lo = Math.min(t.sa, t.sb, t.sc),
        hi = Math.max(t.sa, t.sb, t.sc);
      const station = contact.s < lo ? contact.s + trackLength : contact.s;
      if (station >= lo && station <= hi && contains(t, contact.point)) {
        selected.add(i);
        queue.push(i);
      }
    }
    for (let head = 0; head < queue.length; head++) {
      for (const edge of triangleEdges[queue[head]]) {
        for (const neighbor of edges.get(edge)!) {
          if (selected.has(neighbor)) continue;
          selected.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    const positions: number[] = [],
      uvs: number[] = [];
    for (const index of selected) {
      const t = triangles[index];
      let polygon = [t.a, t.b, t.c].map((p) => {
        const dx = p.x - position.x,
          dz = p.z - position.z;
        return {
          x: p.x,
          y: p.y,
          z: p.z,
          u: (cos * dx - sin * dz - minX) / (maxX - minX),
          // PNG top is the hull's nose (+Z); TextureLoader flips image Y.
          v: (sin * dx + cos * dz - minZ) / (maxZ - minZ),
        };
      });
      for (const distance of [
        (v: Vertex) => v.u,
        (v: Vertex) => 1 - v.u,
        (v: Vertex) => v.v,
        (v: Vertex) => 1 - v.v,
        (v: Vertex) => position.y - v.y,
      ])
        polygon = clip(polygon, distance);
      for (let j = 1; j + 1 < polygon.length; j++) {
        for (const v of [polygon[0], polygon[j], polygon[j + 1]]) {
          positions.push(v.x, v.y, v.z);
          uvs.push(v.u, v.v);
        }
      }
    }
    const count = positions.length / 3;
    if (!count) return;
    if (count > this.capacity) {
      this.capacity = 2 ** Math.ceil(Math.log2(count));
      // Dispose while old attributes are attached so Three releases their GPU buffers.
      mesh.geometry.dispose();
      mesh.geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(this.capacity * 3), 3),
      );
      mesh.geometry.setAttribute(
        "uv",
        new THREE.BufferAttribute(new Float32Array(this.capacity * 2), 2),
      );
    }
    const positionAttribute = mesh.geometry.getAttribute("position");
    const uvAttribute = mesh.geometry.getAttribute("uv");
    (positionAttribute.array as Float32Array).set(positions);
    (uvAttribute.array as Float32Array).set(uvs);
    positionAttribute.needsUpdate = true;
    uvAttribute.needsUpdate = true;
    mesh.geometry.setDrawRange(0, count);
    mesh.visible = true;
  }

  /** The caller owns the shared silhouette texture. */
  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
