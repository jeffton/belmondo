import * as THREE from "three";

/** Ocean-only tiling; local world-scaled water shares the unmodified atlas. */
export function createOceanGeometry(shore?: (x: number, z: number) => number) {
  // Put the vertices in the coastal basin, not out on the open horizon.
  // The outer rows connect to the unbroken coarse ocean at ±6000 m.
  const divisions = shore ? 27 : 1;
  const geometry = new THREE.PlaneGeometry(12000, 12000, divisions, divisions);
  if (shore) {
    const positions = geometry.attributes.position;
    const coordinate = (i: number, low: number, high: number) =>
      i === 0
        ? -6000
        : i === divisions
          ? 6000
          : THREE.MathUtils.lerp(low, high, (i - 1) / (divisions - 2));
    for (let j = 0; j <= divisions; j++) {
      for (let i = 0; i <= divisions; i++) {
        const index = j * (divisions + 1) + i;
        const x = coordinate(i, -3000, 450);
        const y = -coordinate(j, -1750, 1750);
        positions.setXYZ(index, x, y, 0);
        geometry.attributes.uv.setXY(index, x / 12000 + 0.5, y / 12000 + 0.5);
      }
    }
  }
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) * 250, uv.getY(i) * 250);
  if (shore) {
    const position = geometry.attributes.position;
    const color = new THREE.Float32BufferAttribute(position.count * 3, 3);
    const deep = new THREE.Color(0x2b91ad);
    const shelf = new THREE.Color(0x55d9c0);
    const tint = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = -position.getY(i);
      const depth = -16 - shore(x, z);
      const shoal = 1 - THREE.MathUtils.smoothstep(depth, 1.5, 25);
      const ripples = 0.045 * Math.sin(x * 0.017 + z * 0.005);
      tint.copy(deep).lerp(shelf, Math.min(1, shoal * (0.76 + ripples)));
      color.setXYZ(i, tint.r, tint.g, tint.b);
    }
    geometry.setAttribute("color", color);
  }
  return geometry;
}
