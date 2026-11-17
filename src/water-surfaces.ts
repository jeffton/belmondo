import * as THREE from "three";

/** Ocean-only tiling; local world-scaled water shares the unmodified atlas. */
export function createOceanGeometry() {
  const geometry = new THREE.PlaneGeometry(12000, 12000, 1, 1);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) * 250, uv.getY(i) * 250);
  return geometry;
}
