import * as THREE from "three";

// Small, deterministic nearest-filtered surfaces: no image downloads or canvas.
// The palette comes from the material/vertex colours, not baked monochrome blobs.
export function weaponTexture(kind) {
  const size = 32;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const noise = ((x * 73 + y * 151 + x * y * 19) % 97) / 97;
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      let light;
      let alpha = 1;
      if (kind === "metal") {
        const seam = x % 16 < 2 || y % 16 < 1;
        const scratch = (x + y * 7) % 31 === 0;
        light = seam ? 0.23 : scratch ? 0.95 : 0.58 + noise * 0.3;
      } else if (kind === "exhaust") {
        const edge = Math.max(0, 1 - Math.abs(u * 2 - 1));
        alpha = Math.pow(edge, 1.5) * Math.pow(v, 0.65);
        light = 0.5 + noise * 0.5;
        alpha *= 0.55 + noise * 0.45;
      } else {
        const radius = Math.hypot(u * 2 - 1, v * 2 - 1);
        alpha = Math.max(0, 1 - radius) * (0.3 + noise * 0.7);
        light = 0.42 + noise * 0.4;
      }
      const offset = (y * size + x) * 4;
      pixels[offset] =
        pixels[offset + 1] =
        pixels[offset + 2] =
          Math.round(light * 255);
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
