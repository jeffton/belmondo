import * as THREE from "three";
import type { Track } from "./track.ts";

/** The excavation is cut out of a living ridge, not an island in a sea. */
export const FAULTLINE_PIT = {
  x: 0,
  z: -80,
  radiusX: 1530,
  radiusZ: 1630,
  floor: -118,
};

/** Route-authored retained reservoir on the outer BENCH, shared with collision land. */
export function faultlineFloodedCut(track: Track) {
  const frame = track.frame(0.29 * track.length, 1);
  const right = new THREE.Vector3(
    frame.tangent.z,
    0,
    -frame.tangent.x,
  ).normalize();
  const forward = new THREE.Vector3(
    frame.tangent.x,
    0,
    frame.tangent.z,
  ).normalize();
  const outward = Math.sign(right.x * frame.p.x + right.z * frame.p.z);
  const center = frame.p
    .clone()
    .addScaledVector(right, outward * (frame.width + 115));
  return {
    center,
    right,
    forward,
    width: 140,
    length: 260,
    water: frame.p.y - 5,
  };
}

export function faultlineRadius(x: number, z: number) {
  return Math.hypot(
    (x - FAULTLINE_PIT.x) / FAULTLINE_PIT.radiusX,
    (z - FAULTLINE_PIT.z) / FAULTLINE_PIT.radiusZ,
  );
}

export function faultlineLandHeight(x: number, z: number) {
  const r = faultlineRadius(x, z);
  const angle = Math.atan2(z - FAULTLINE_PIT.z, x - FAULTLINE_PIT.x);
  const irregular =
    r + 0.024 * Math.sin(angle * 5) + 0.012 * Math.cos(angle * 9);
  // Eight broad working benches with steep, readable pale excavation faces.
  const bench = Math.max(0, Math.min(8, (irregular - 0.16) * 9.2));
  const whole = Math.floor(bench);
  const face = THREE.MathUtils.smoothstep(bench - whole, 0.73, 0.96);
  const quarry = FAULTLINE_PIT.floor + (whole + face) * 52;
  const ridge =
    315 +
    90 * Math.sin(x * 0.0007 + z * 0.00035) ** 2 +
    55 * Math.cos(z * 0.001 + 0.4) ** 2;
  const farHills = 80 * Math.sin(x * 0.0012 - z * 0.0006) ** 2;
  const shoulder = THREE.MathUtils.smoothstep(irregular, 0.98, 1.18);
  const reclaimedLowland = THREE.MathUtils.smoothstep(-z, 1650, 2300);
  const highland = THREE.MathUtils.lerp(
    ridge + farHills,
    175 + 38 * Math.sin(x * 0.0015 - z * 0.0006) ** 2,
    reclaimedLowland,
  );
  let height = THREE.MathUtils.lerp(quarry, highland, shoulder);
  // A cleared extraction floor gives the operating machine a genuine footprint.
  const machineApron = Math.hypot((x - 220) / 350, (z + 350) / 220);
  height = THREE.MathUtils.lerp(
    height,
    FAULTLINE_PIT.floor,
    1 - THREE.MathUtils.smoothstep(machineApron, 0.82, 1.15),
  );
  // Rain collects in the abandoned central cut; the active machine apron stays dry.
  const sump = Math.hypot((x + 190) / 250, (z + 25) / 220);
  height = THREE.MathUtils.lerp(
    height,
    -151,
    1 - THREE.MathUtils.smoothstep(sump, 0.65, 1.1),
  );
  // Long grassy buttresses break up the outer skyline without erasing the benches.
  const upland = THREE.MathUtils.smoothstep(r, 0.98, 1.25);
  height +=
    upland *
    (18 * Math.sin(x * 0.006 + z * 0.003) +
      12 * Math.cos(x * 0.003 - z * 0.008));
  return height;
}

export function faultlineGroundColor(
  x: number,
  y: number,
  z: number,
  color: THREE.Color,
  slope = 0,
) {
  const r = faultlineRadius(x, z);
  const variation =
    Math.sin(x * 0.015 + z * 0.006) * Math.cos(z * 0.019) * 0.025;
  const reclaimed = z < -1650 || (z < -650 && r > 0.65) || r > 0.88;
  // Moss and grasses recolonise horizontal ledges even inside the working pit.
  const meadow = reclaimed || (slope < 0.22 && y > -50);
  if (meadow && slope < 0.8) {
    const heather = Math.sin(x * 0.007 - z * 0.004) > 0.72;
    color.setHSL(
      heather ? 0.205 : 0.285 + 0.025 * Math.sin(z * 0.002),
      heather ? 0.37 : 0.43,
      0.34 + variation + Math.max(0, y - 300) * 0.00018,
    );
  } else if (reclaimed && slope < 1.35) {
    color.setHSL(0.225, 0.38, 0.43 + variation);
  } else {
    // Two oblique fractures displace and tilt whole beds. In any one cut
    // the pilot sees an ochre cap, thick clay and a few recessed shale faces,
    // not an endless cycle of equally prominent painted colour bands.
    const block = z + x * 0.43 > 180 ? 1 : x - z * 0.28 < -420 ? -1 : 0;
    const bed = y + (0.08 + block * 0.055) * x + 46 * block;
    const exposed = Math.sin(x * 0.008 + z * 0.004) * 13;
    if (bed + exposed > 225) color.setHSL(0.095, 0.24, 0.55 + variation);
    else if (bed > 137) color.setHSL(0.06, 0.28, 0.44 + variation);
    else if (bed + exposed > 94) color.setHSL(0.12, 0.12, 0.47 + variation);
    else if (bed > 12) color.setHSL(0.59, 0.12, 0.34 + variation);
    else color.setHSL(0.075, 0.31, 0.41 + variation);
  }
}
