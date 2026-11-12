import * as THREE from "three";
import { RAIL_PROFILE } from "./rail-profile.js";

export const RAIL_FACE_PATTERN = Object.freeze({
  sectionLength: 8,
  width: 128,
  height: 64,
});

const PALETTES = {
  "KAISEKI COAST": { light: 0xe3e1cc, dark: 0x314b5b },
  "SOLAR ARRAY": { light: 0xe7d5b0, dark: 0x61483f },
  NOCTILUCENT: { light: 0xd1d2e7, dark: 0x3e3c59 },
  WHITEOUT: { light: 0xdbe6e5, dark: 0x385c75 },
  MONSOON: { light: 0xc9d6b4, dark: 0x285b53 },
  CINDERLINE: { light: 0xdfd8bd, dark: 0x46444e },
};

/** Original mineral-paint panels, with the rhythm on the actual impact face. */
export function railFacePixels(course) {
  const { width, height } = RAIL_FACE_PATTERN;
  const palette = PALETTES[course];
  const pixels = new Uint8Array(width * height * 4);
  let seed = 3187;
  for (let y = 0; y < height; y++) {
    const skew = Math.round((y / (height - 1) - 0.5) * 10);
    for (let x = 0; x < width; x++) {
      seed = (seed * 16807) % 2147483647;
      const phase = (((x + skew) % width) + width) % width;
      const color = phase < width / 2 ? palette.light : palette.dark;
      const grain = (seed % 19) - 9;
      const joint = phase % (width / 2) < 2 ? 0.63 : 1;
      const grime = y < 9 ? 0.72 + y * 0.028 : 1;
      const scrape = (x * 13 + y * 7) % 89 < 3 ? -24 : 0;
      const index = (y * width + x) * 4;
      pixels[index] = Math.max(
        0,
        Math.min(255, ((color >> 16) & 255) * joint * grime + grain + scrape),
      );
      pixels[index + 1] = Math.max(
        0,
        Math.min(255, ((color >> 8) & 255) * joint * grime + grain + scrape),
      );
      pixels[index + 2] = Math.max(
        0,
        Math.min(255, (color & 255) * joint * grime + grain + scrape),
      );
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

export function createRailFaceTexture(course) {
  const { width, height } = RAIL_FACE_PATTERN;
  const texture = new THREE.DataTexture(railFacePixels(course), width, height);
  texture.name = `rail-face-${course}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Whole-lap cycles avoid a phase jump at s=0; forks retain the same station phase. */
export function railFaceUV(u, height, trackLength) {
  const repeats = Math.round(
    trackLength / (RAIL_FACE_PATTERN.sectionLength * 2),
  );
  return [u * repeats, height / RAIL_PROFILE.height];
}
