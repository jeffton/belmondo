import * as THREE from "three";

const HALF_WIDTH = 3.1;
const HALF_LENGTH = 4.25;
export const HULL_HEIGHT = 2.2;

export function hullExtent(r, axis) {
  const sin = Math.sin(r.yaw),
    cos = Math.cos(r.yaw);
  return (
    HALF_WIDTH * Math.abs(axis.x * cos - axis.z * sin) +
    HALF_LENGTH * Math.abs(axis.x * sin + axis.z * cos)
  );
}

function axes(r) {
  return [
    new THREE.Vector3(Math.cos(r.yaw), 0, -Math.sin(r.yaw)),
    new THREE.Vector3(Math.sin(r.yaw), 0, Math.cos(r.yaw)),
  ];
}

// Eight hulls need only 28 pairs. Iterating also transmits pressure through a pack.
export function solveContacts(racers, constrainWall, impact) {
  const hulls = racers.map(axes);
  for (let iteration = 0; iteration < 6; iteration++) {
    for (let i = 0; i < racers.length; i++) {
      const a = racers[i];
      for (let j = i + 1; j < racers.length; j++) {
        const b = racers[j];
        if (Math.abs(a.position.y - b.position.y) >= HULL_HEIGHT) continue;
        const delta = b.position.clone().sub(a.position);
        let depth = Infinity,
          normal;
        for (const axis of [...hulls[i], ...hulls[j]]) {
          const extent = (hull) =>
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
        a.position.addScaledVector(normal, -depth * 0.5);
        b.position.addScaledVector(normal, depth * 0.5);
        const relative = b.velocity.clone().sub(a.velocity);
        const closing = -relative.dot(normal);
        if (closing > 0) {
          const impulse = closing * 0.54; // equal masses, low restitution
          a.velocity.addScaledVector(normal, -impulse);
          b.velocity.addScaledVector(normal, impulse);
          const tangent = new THREE.Vector3(-normal.z, 0, normal.x);
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
