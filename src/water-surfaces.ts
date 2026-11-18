import * as THREE from "three";

/** Ocean-only tiling; local world-scaled water shares the unmodified atlas. */
export function createOceanGeometry(shore?: (x: number, z: number) => number) {
  const divisions = shore ? 100 : 1;
  const geometry = new THREE.PlaneGeometry(12000, 12000, divisions, divisions);
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
