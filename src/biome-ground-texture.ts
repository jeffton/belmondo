import { mineralGroundTexture } from "./mineral-ground-texture.ts";

/** Broad, tileable mineral masses; terrain vertex colours retain biome identity. */
export function biomeGroundTexture(biome: string) {
  const texture = mineralGroundTexture(
    (u: number, v: number, fold: number, basin: number) => {
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
      return value;
    },
  );
  texture.name = `${biome}-natural-grain`;
  return texture;
}
