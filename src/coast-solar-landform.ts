import * as THREE from "three";
import type { Track, TrackFrame } from "./track.ts";
import { createNearestPointIndex } from "./nearest-point-index.ts";

export function retainsCoastGallery(start: number) {
  return start < 0.47 || start >= 0.9;
}

export function placeStations(start: number, end: number, step: number) {
  const count = Math.ceil((end - start) / step);
  return Array.from(
    { length: count + 1 },
    (_, i) => start + ((end - start) * i) / count,
  );
}

/** Bake once beside terrain samples. Apply to landHeight before grid sampling,
 * road grading, terrain meshes and collision queries are derived from that grid. */
export function createCoastSolarLandform(track: Track, samples: TrackFrame[]) {
  const coast = track.config.name === "KAISEKI COAST";
  if (!coast && track.config.name !== "SOLAR ARRAY")
    return (_x: number, _z: number, base: number) => base;
  const nearest = createNearestPointIndex(samples.map((f) => f.p));
  const ranges = coast
    ? [{ start: 0.47, end: 0.695, side: -1, branch: 0, width: 170 }]
    : [
        { start: 0.055, end: 0.19, side: 1, branch: 0, width: 240 },
        { start: 0.285, end: 0.46, side: 1, branch: 1, width: 240 },
        { start: 0.16, end: 0.195, side: -1, branch: 0, width: 145 },
        { start: 0.345, end: 0.39, side: -1, branch: -1, width: 145 },
        { start: 0.74, end: 0.815, side: -1, branch: 0, width: 145 },
        { start: 0.88, end: 0.935, side: -1, branch: 0, width: 100 },
      ];
  const patches = ranges.flatMap((range) =>
    placeStations(range.start, range.end, 0.005).map((u) => {
      const f = track.frame(u * track.length, range.branch);
      const forward = new THREE.Vector3(
        f.tangent.x,
        0,
        f.tangent.z,
      ).normalize();
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      const center = f.p
        .clone()
        .addScaledVector(right, range.side * (f.width + 20 + range.width / 2));
      return {
        center,
        right,
        forward,
        width: range.width,
        y: f.p.y - 8,
        slope: f.tangent.y / Math.hypot(f.tangent.x, f.tangent.z),
      };
    }),
  );
  return (x: number, z: number, base: number) => {
    const f = samples[nearest(x, z)];
    const roadDistance = Math.hypot(x - f.p.x, z - f.p.z);
    // Protect every route's grade, not only the branch owning a terrace.
    const shoulder = THREE.MathUtils.smoothstep(
      roadDistance,
      f.width + 14,
      f.width + 42,
    );
    let height = base;
    for (const patch of patches) {
      const dx = x - patch.center.x,
        dz = z - patch.center.z;
      const across = Math.abs(dx * patch.right.x + dz * patch.right.z);
      const along = dx * patch.forward.x + dz * patch.forward.z;
      const weight =
        (1 -
          THREE.MathUtils.smoothstep(
            across,
            patch.width / 2 - 24,
            patch.width / 2 + 30,
          )) *
        (1 - THREE.MathUtils.smoothstep(Math.abs(along), 35, 90)) *
        shoulder;
      const target = patch.y + patch.slope * along;
      height = Math.max(
        height,
        THREE.MathUtils.lerp(base, Math.max(base, target), weight),
      );
    }
    // The runway becomes a real headland-to-mole crossing. Lower the bay, not
    // the road; final grid grading still owns all deck-clearance constraints.
    if (coast && f.u > 0.78 && f.u < 0.915) {
      const along =
        THREE.MathUtils.smoothstep(f.u, 0.78, 0.805) *
        (1 - THREE.MathUtils.smoothstep(f.u, 0.89, 0.915));
      const bay = 1 - THREE.MathUtils.smoothstep(roadDistance, 160, 300);
      height = THREE.MathUtils.lerp(height, Math.min(height, -26), along * bay);
    }
    return height;
  };
}
