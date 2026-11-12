import * as THREE from "three";

/** Low-contrast stone/ice grain without architectural seams, holes or panels. */
export function biomeGroundTexture(biome) {
  const pixels = new Uint8Array(64 * 64 * 4);
  let seed = { polar: 4417, hydraulic: 7187, volcanic: 9173, metropolis: 6197 }[
    biome
  ];
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      seed = (seed * 16807) % 2147483647;
      const grain = (seed % 31) - 15;
      const strata =
        Math.sin((y * Math.PI) / 8 + Math.sin((x * Math.PI) / 16) * 0.7) * 6;
      const value = 211 + grain + Math.round(strata);
      pixels.set([value, value, value, 255], (y * 64 + x) * 4);
    }
  const texture = new THREE.DataTexture(pixels, 64, 64);
  texture.name = `${biome}-natural-grain`;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
