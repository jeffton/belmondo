import * as THREE from "three";

/** The excavation is cut out of a living ridge, not an island in a sea. */
export const FAULTLINE_PIT = {
  x: 0,
  z: -80,
  radiusX: 1530,
  radiusZ: 1630,
  floor: -118,
};

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
  const reclaimed = z < -1650 || (z < -650 && r > 0.65) || r > 0.955;
  if (reclaimed && slope < 0.8) {
    color.setHSL(
      0.27 + 0.025 * Math.sin(z * 0.002),
      0.32,
      0.32 + variation + Math.max(0, y - 300) * 0.00018,
    );
  } else if (reclaimed && slope < 1.4) {
    color.setHSL(0.235, 0.28, 0.41 + variation);
  } else {
    const seam = Math.sin(y * 0.135) > 0.58;
    color.setHSL(0.115, seam ? 0.13 : 0.18, (seam ? 0.54 : 0.67) + variation);
  }
}
