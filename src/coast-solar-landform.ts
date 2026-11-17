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
    ? [
        {
          start: 0.47,
          end: 0.695,
          side: -1,
          branch: 0,
          width: 170,
          setback: 20,
          offset: -8,
          cut: true,
        },
      ]
    : [
        {
          start: 0.055,
          end: 0.19,
          side: 1,
          branch: 0,
          width: 240,
          setback: 45,
          offset: -8,
          cut: true,
        },
        {
          start: 0.285,
          end: 0.46,
          side: 1,
          branch: 1,
          width: 240,
          setback: 45,
          offset: -8,
          cut: true,
        },
        {
          start: 0.16,
          end: 0.195,
          side: -1,
          branch: 0,
          width: 145,
          setback: 20,
          offset: -8,
          cut: false,
        },
        {
          start: 0.345,
          end: 0.39,
          side: -1,
          branch: -1,
          width: 145,
          setback: 20,
          offset: -8,
          cut: false,
        },
        {
          start: 0.74,
          end: 0.815,
          side: -1,
          branch: 0,
          width: 145,
          setback: 20,
          offset: -8,
          cut: false,
        },
        {
          start: 0.88,
          end: 0.935,
          side: -1,
          branch: 0,
          width: 100,
          setback: 20,
          offset: -8,
          cut: false,
        },
        {
          start: 0.14,
          end: 0.195,
          side: -1,
          branch: 0,
          width: 170,
          setback: 24,
          offset: 36,
          cut: false,
        },
        {
          start: 0.815,
          end: 0.89,
          side: 1,
          branch: 0,
          width: 180,
          setback: 24,
          offset: 42,
          cut: false,
        },
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
        .addScaledVector(
          right,
          range.side * (f.width + range.setback + range.width / 2),
        );
      return {
        center,
        right,
        forward,
        width: range.width,
        y: f.p.y + range.offset,
        cut: range.cut,
        field: !coast && range.cut,
        fieldNear: range.width / 2 + range.setback - 52,
        slope: f.tangent.y / Math.hypot(f.tangent.x, f.tangent.z),
      };
    }),
  );
  const dockFrame = coast ? track.frame(0.735 * track.length) : null;
  const dockForward = dockFrame
    ? new THREE.Vector3(dockFrame.tangent.x, 0, dockFrame.tangent.z).normalize()
    : null;
  const dockRight = dockForward
    ? new THREE.Vector3(dockForward.z, 0, -dockForward.x)
    : null;
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
    let cutSum = 0;
    let cutWeights = 0;
    let cutCoverage = 0;
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
      const cross = dx * patch.right.x + dz * patch.right.z;
      const target =
        patch.y +
        patch.slope * along +
        (patch.field ? (cross + patch.fieldNear) * 0.42 : 0);
      if (patch.cut) {
        cutSum += target * weight;
        cutWeights += weight;
        cutCoverage = Math.max(cutCoverage, weight);
      } else {
        height = Math.max(
          height,
          THREE.MathUtils.lerp(base, Math.max(base, target), weight),
        );
      }
    }
    // The collector hillside climbs away from the road into its forward view.
    // Shared grading keeps its broad bands off separate foundation podiums.
    if (cutWeights > 0)
      height = THREE.MathUtils.lerp(height, cutSum / cutWeights, cutCoverage);
    if (dockFrame && dockRight && dockForward) {
      const dx = x - dockFrame.p.x,
        dz = z - dockFrame.p.z;
      const across =
        dx * dockRight.x + dz * dockRight.z - dockFrame.width - 234;
      const along = dx * dockForward.x + dz * dockForward.z;
      const basin =
        (1 - THREE.MathUtils.smoothstep(Math.abs(across), 190, 235)) *
        (1 - THREE.MathUtils.smoothstep(Math.abs(along), 40, 90)) *
        shoulder;
      height = THREE.MathUtils.lerp(height, Math.min(height, -26), basin);
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
