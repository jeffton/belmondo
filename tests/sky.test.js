import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { TRACKS } from "../src/track.js";
import { createSky, paintSky } from "../src/sky.js";
import { celestialDirection } from "../src/track-lighting.js";

const pixel = (image, x, y) => [
  ...image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4),
];

for (const config of TRACKS) {
  test(`${config.name}: seamless full sphere with fog-matched lower hemisphere`, () => {
    const image = paintSky(config, config.fog, 512, 256);
    const fog = [
      (config.fog >> 16) & 255,
      (config.fog >> 8) & 255,
      config.fog & 255,
      255,
    ];
    for (let y = 0; y < image.height; y++) {
      assert.deepEqual(
        pixel(image, 0, y),
        pixel(image, image.width - 1, y),
        "longitude seam",
      );
      for (let x = 0; x < image.width; x++) {
        const p = pixel(image, x, y);
        assert.equal(p[3], 255);
        if (y < image.height / 2) assert.deepEqual(p, fog);
        if (y === image.height - 1)
          assert.deepEqual(
            p,
            pixel(image, 0, y),
            "north pole has no azimuth pinching",
          );
      }
    }
    const latitude = Math.round(image.height * 0.525);
    const horizon = Array.from({ length: image.width }, (_, x) =>
      pixel(image, x, latitude).join(","),
    );
    assert(new Set(horizon).size > 2, "layered horizon rather than a gradient");
    assert(
      horizon.filter((value, x) => x && value !== horizon[x - 1]).length > 8,
      "authored silhouettes remain distinct around the full horizon",
    );
  });

  test(`${config.name}: sun or moon lower limb has a clear painted sky pocket`, () => {
    const image = paintSky(config, config.fog, 512, 256);
    const direction = celestialDirection(config.name);
    const x = Math.round(
      (Math.atan2(direction.z, direction.x) / (Math.PI * 2) + 0.5) *
        (image.width - 1),
    );
    const center = Math.asin(direction.y);
    // The body radius is at most 34/950 radians; sample through its whole disc.
    // A ridge or cloud edge would create a discontinuity across neighboring rows.
    const bottom = Math.ceil(
      ((center - 0.04) / Math.PI + 0.5) * (image.height - 1),
    );
    const top = Math.floor(
      ((center + 0.04) / Math.PI + 0.5) * (image.height - 1),
    );
    for (let y = bottom; y <= top; y++) {
      const a = pixel(image, x, y),
        b = pixel(image, x, y + 1);
      assert(
        Math.max(...a.map((v, i) => Math.abs(v - b[i]))) < 8,
        "painted geometry cannot silhouette over celestial disc",
      );
    }
  });
}

test("all course skies use the same filtered panorama budget", () => {
  for (const name of TRACKS.map((course) => course.name)) {
    const config = TRACKS.find((course) => course.name === name);
    const texture = createSky(config, config.fog);
    assert.equal(texture.image.width, 2048, `${name} width`);
    assert.equal(texture.image.height, 1024, `${name} height`);
    assert.equal(texture.magFilter, THREE.LinearFilter);
    assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
    const image = texture.image;
    for (let y = 0; y < image.height; y++)
      assert.deepEqual(pixel(image, 0, y), pixel(image, image.width - 1, y));
    assert.deepEqual(
      pixel(image, 0, image.height - 1),
      pixel(image, image.width - 1, image.height - 1),
    );
    const fog = [
      (config.fog >> 16) & 255,
      (config.fog >> 8) & 255,
      config.fog & 255,
      255,
    ];
    for (let x = 0; x < image.width; x++)
      assert.deepEqual(pixel(image, x, 0), fog);
    const direction = celestialDirection(config.name);
    const sunX = Math.round(
      (Math.atan2(direction.z, direction.x) / (Math.PI * 2) + 0.5) *
        (image.width - 1),
    );
    const sunY = Math.round(
      (Math.asin(direction.y) / Math.PI + 0.5) * (image.height - 1),
    );
    assert.notDeepEqual(pixel(image, sunX, sunY), fog);
    let disposed = 0;
    texture.addEventListener("dispose", () => disposed++);
    texture.dispose();
    assert.equal(disposed, 1);
  }
});

test("Cinderline shallow distant ridge does not jump a full contrast row", () => {
  const config = TRACKS.find((course) => course.name === "CINDERLINE");
  const image = paintSky(config, 0x998888, 2048, 1024);
  // Shallow descending far ridge, away from the sun, clouds and works. This
  // reproduces the long horizontal stairs visible in the user's chase view.
  // A hard silhouette row cutoff produces a 53-level jump in this region.
  for (const [layer, x0, x1, y0, y1, limit] of [
    ["far", 205, 320, 532, 546, 20],
    // Near ridge climbing under the far ridge: hard cutoffs jump 43 levels.
    ["near", 1050, 1120, 533, 541, 8],
  ]) {
    let largestStep = 0;
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const offset = (y * image.width + x) * 4;
        for (let channel = 0; channel < 3; channel++) {
          largestStep = Math.max(
            largestStep,
            Math.abs(
              image.data[offset + channel] - image.data[offset - 4 + channel],
            ),
          );
        }
      }
    }
    assert(largestStep < limit, `${layer} ridge contrast step: ${largestStep}`);
  }
});

test("course paintings are deterministic and distinct", () => {
  const hashes = TRACKS.map((config) => {
    const a = paintSky(config, config.fog, 256, 128);
    assert.deepEqual(a.data, paintSky(config, config.fog, 256, 128).data);
    return createHash("sha256").update(a.data).digest("hex");
  });
  assert.equal(new Set(hashes).size, TRACKS.length);
});

test("sky source textures are independently owned and disposable across course changes", () => {
  const a = createSky(TRACKS[0], TRACKS[0].fog),
    b = createSky(TRACKS[0], TRACKS[0].fog);
  assert.notEqual(a.image.data, b.image.data);
  assert.equal(a.mapping, THREE.EquirectangularReflectionMapping);
  assert.equal(a.colorSpace, THREE.SRGBColorSpace);
  assert.equal(a.flipY, false, "DataTexture rows are authored south to north");
  let disposed = 0;
  a.addEventListener("dispose", () => disposed++);
  a.dispose();
  assert.equal(disposed, 1);
  assert(b.version > 0);
  b.dispose();
});
