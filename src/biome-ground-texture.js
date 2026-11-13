import * as THREE from "three";

/** Broad, tileable mineral masses; terrain vertex colours retain biome identity. */
export function biomeGroundTexture(biome) {
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const u = (x / 64) * Math.PI * 2;
      const v = (y / 64) * Math.PI * 2;
      const fold = Math.sin(u + Math.sin(v) * 0.7);
      const basin = Math.cos(v + Math.sin(u) * 0.5);
      let value;
      if (biome === "polar") {
        // Quiet wind-scoured snow; exposed rock belongs to the terrain palette,
        // not a repeating hard-edged stripe painted across every mountain.
        value = 225 + basin * 5 + fold * 4 + Math.sin(u * 3 + v * 2) * 2;
      } else if (biome === "hydraulic") {
        // Damp silt basins against drier mineral ledges, not mottled noise.
        value = basin + fold * 0.45 > 0.15 ? 223 : 193;
        value += Math.sin(v * 3 + fold) * 4;
      } else if (biome === "volcanic") {
        // Basalt beds, with a quiet ash-filled joint at each broad stratum.
        const bed = Math.sin(v * 3 + fold * 1.2);
        value = 211 + basin * 7 + fold * 5 - (bed > 0.92 ? 21 : 0);
      } else {
        // Urban foundations: broad dry/wet transitions beneath the buildings.
        value = 218 + basin * 7 + fold * 5;
      }
      value = Math.round(value);
      pixels.set([value, value, value, 255], (y * 64 + x) * 4);
    }
  const texture = new THREE.DataTexture(pixels, 64, 64);
  texture.name = `${biome}-natural-grain`;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
