import * as THREE from "three";

/** Tileable mineral coordinates shared by biome and legacy terrain palettes. */
export function mineralGroundTexture(sample) {
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const u = (x / 64) * Math.PI * 2;
      const v = (y / 64) * Math.PI * 2;
      const fold = Math.sin(u + Math.sin(v) * 0.7);
      const basin = Math.cos(v + Math.sin(u) * 0.5);
      const value = Math.round(sample(u, v, fold, basin));
      pixels.set([value, value, value, 255], (y * 64 + x) * 4);
    }
  const texture = new THREE.DataTexture(pixels, 64, 64);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
