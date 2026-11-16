import * as THREE from "three";
interface Terrain {
  step: number;
  extent: number;
  heightAt(x: number, z: number): number;
}

/** Exact height extrema of a rectangle on the rendered, indexed terrain grid. */
export function terrainFootprint(
  terrain: Terrain,
  center: THREE.Vector3,
  right: THREE.Vector3,
  forward: THREE.Vector3,
  width: number,
  depth: number,
): THREE.Vector3[] {
  const point = (x: number, z: number): THREE.Vector3 =>
    center.clone().addScaledVector(right, x).addScaledVector(forward, z);
  const corners = [
    point(-width / 2, -depth / 2),
    point(width / 2, -depth / 2),
    point(width / 2, depth / 2),
    point(-width / 2, depth / 2),
  ];
  const points = [...corners];
  const { step, extent, heightAt } = terrain;
  // A linear heightfield triangle has no interior extremum. Check contained
  // grid vertices and every footprint-edge intersection with triangle edges.
  const lowX = Math.min(...corners.map((p) => p.x)),
    highX = Math.max(...corners.map((p) => p.x));
  const lowZ = Math.min(...corners.map((p) => p.z)),
    highZ = Math.max(...corners.map((p) => p.z));
  for (
    let ix = Math.ceil((lowX + extent) / step);
    ix <= Math.floor((highX + extent) / step);
    ix++
  )
    for (
      let iz = Math.ceil((lowZ + extent) / step);
      iz <= Math.floor((highZ + extent) / step);
      iz++
    ) {
      const p = new THREE.Vector3(-extent + ix * step, 0, -extent + iz * step);
      const d = p.clone().sub(center);
      if (
        Math.abs(d.dot(right)) <= width / 2 &&
        Math.abs(d.dot(forward)) <= depth / 2
      )
        points.push(p);
    }
  for (let i = 0; i < 4; i++) {
    const a = corners[i],
      b = corners[(i + 1) % 4];
    for (const [from, to, offset] of [
      [a.x, b.x, extent],
      [a.z, b.z, extent],
      [a.x + a.z, b.x + b.z, 2 * extent],
    ]) {
      if (from === to) continue;
      for (
        let n = Math.ceil((Math.min(from, to) + offset) / step);
        n <= Math.floor((Math.max(from, to) + offset) / step);
        n++
      ) {
        const t = (-offset + n * step - from) / (to - from);
        if (t > 0 && t < 1) points.push(a.clone().lerp(b, t));
      }
    }
  }
  return points.map((p) => p.clone().setY(heightAt(p.x, p.z)));
}
