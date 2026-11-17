import * as THREE from "three";
import { ConvexHull } from "three/addons/math/ConvexHull.js";
import { buildHull } from "./craft.ts";

interface Hull {
  yaw: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

const HALF_WIDTH = 3.1;
const HALF_LENGTH = 4.25;
export const HULL_HEIGHT = 2.2;

export interface CraftContactHull {
  readonly points: readonly THREE.Vector3[];
  readonly faces: readonly (readonly [number, number, number])[];
  readonly radius: number;
}
const contactHulls = new Map<number, CraftContactHull>();

export function contactHull(craft: number): CraftContactHull {
  let shape = contactHulls.get(craft);
  if (!shape) {
    const cloud: THREE.Vector3[] = [];
    for (const geometry of Object.values(buildHull(craft))) {
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++)
        cloud.push(new THREE.Vector3().fromBufferAttribute(positions, i));
      geometry.dispose();
    }
    // Only extreme vertices can touch a plane. The cached convex support has
    // the exact same extrema as the solid visible hull, without scanning every
    // render vertex during a collision query.
    const hull = new ConvexHull().setFromPoints(cloud);
    const extremes = new Set<THREE.Vector3>();
    for (const face of hull.faces) {
      let edge = face.edge;
      do {
        extremes.add(edge.head().point);
        edge = edge.next;
      } while (edge !== face.edge);
    }
    const points = [...extremes];
    const indices = new Map(points.map((point, index) => [point, index]));
    const faces = hull.faces.map((face): [number, number, number] => [
      indices.get(face.edge.head().point)!,
      indices.get(face.edge.next.head().point)!,
      indices.get(face.edge.next.next.head().point)!,
    ]);
    shape = {
      points,
      faces,
      radius: Math.sqrt(Math.max(...points.map((point) => point.lengthSq()))),
    };
    contactHulls.set(craft, shape);
  }
  return shape;
}

// Deck contact uses the real solid ship, including its physical yaw and pitch.
// The broad pair/rail box is not a symmetric vertical landing hull: its empty
// lower corners would hit a ramp before the visible nose ever reaches it.
export function craftSupport(
  r: { craft: number; yaw: number; pitch: number },
  axis: THREE.Vector3,
): number {
  const sinYaw = Math.sin(r.yaw),
    cosYaw = Math.cos(r.yaw),
    sinPitch = Math.sin(r.pitch),
    cosPitch = Math.cos(r.pitch);
  const localX = axis.x * cosYaw - axis.z * sinYaw;
  const yawZ = axis.x * sinYaw + axis.z * cosYaw;
  const localY = axis.y * cosPitch + yawZ * sinPitch;
  const localZ = -axis.y * sinPitch + yawZ * cosPitch;
  let minimum = Infinity;
  for (const point of contactHull(r.craft).points)
    minimum = Math.min(
      minimum,
      point.x * localX + point.y * localY + point.z * localZ,
    );
  return -minimum;
}

export function writeCraftVertices(
  r: { craft: number; yaw: number; pitch: number },
  target: THREE.Vector3[],
): void {
  const points = contactHull(r.craft).points;
  const cosPitch = Math.cos(r.pitch),
    sinPitch = Math.sin(r.pitch);
  const cosYaw = Math.cos(r.yaw),
    sinYaw = Math.sin(r.yaw);
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const y = point.y * cosPitch - point.z * sinPitch;
    const z = point.y * sinPitch + point.z * cosPitch;
    target[i].set(
      point.x * cosYaw + z * sinYaw,
      y,
      -point.x * sinYaw + z * cosYaw,
    );
  }
}

export function hullExtent(r: Pick<Hull, "yaw">, axis: THREE.Vector3): number {
  const sin = Math.sin(r.yaw),
    cos = Math.cos(r.yaw);
  return (
    HALF_WIDTH * Math.abs(axis.x * cos - axis.z * sin) +
    HALF_LENGTH * Math.abs(axis.x * sin + axis.z * cos)
  );
}

function axes(r: Pick<Hull, "yaw">): [THREE.Vector3, THREE.Vector3] {
  return [
    new THREE.Vector3(Math.cos(r.yaw), 0, -Math.sin(r.yaw)),
    new THREE.Vector3(Math.sin(r.yaw), 0, Math.cos(r.yaw)),
  ];
}

// Eight hulls need only 28 pairs. Iterating also transmits pressure through a pack.
export function solveContacts<T extends Hull>(
  racers: T[],
  constrainWall: (hull: T) => void,
  impact: (a: T, b: T, closing: number) => void,
): void {
  const hulls: [THREE.Vector3, THREE.Vector3][] = racers.map(axes);
  for (let iteration = 0; iteration < 6; iteration++) {
    for (let i = 0; i < racers.length; i++) {
      const a = racers[i];
      for (let j = i + 1; j < racers.length; j++) {
        const b = racers[j];
        if (Math.abs(a.position.y - b.position.y) >= HULL_HEIGHT) continue;
        const delta = b.position.clone().sub(a.position);
        let depth = Infinity,
          normal!: THREE.Vector3;
        for (const axis of [...hulls[i], ...hulls[j]]) {
          const extent = (hull: [THREE.Vector3, THREE.Vector3]) =>
            Math.abs(axis.dot(hull[0])) * HALF_WIDTH +
            Math.abs(axis.dot(hull[1])) * HALF_LENGTH;
          const distance = delta.dot(axis);
          const overlap =
            extent(hulls[i]) + extent(hulls[j]) - Math.abs(distance);
          if (overlap <= 0) {
            depth = 0;
            break;
          }
          if (overlap < depth) {
            depth = overlap;
            normal = axis.clone().multiplyScalar(distance >= 0 ? 1 : -1);
          }
        }
        if (depth === 0) continue;
        a.position.addScaledVector(normal!, -depth * 0.5);
        b.position.addScaledVector(normal!, depth * 0.5);
        const relative = b.velocity.clone().sub(a.velocity);
        const closing = -relative.dot(normal!);
        if (closing > 0) {
          const impulse = closing * 0.54; // equal masses, low restitution
          a.velocity.addScaledVector(normal!, -impulse);
          b.velocity.addScaledVector(normal!, impulse);
          const tangent = new THREE.Vector3(-normal!.z, 0, normal!.x);
          const friction = Math.max(
            -impulse * 0.12,
            Math.min(impulse * 0.12, relative.dot(tangent) * 0.5),
          );
          a.velocity.addScaledVector(tangent, friction);
          b.velocity.addScaledVector(tangent, -friction);
          impact(a, b, closing);
        }
        constrainWall(a);
        constrainWall(b);
      }
    }
  }
}
