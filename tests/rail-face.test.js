import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.js";
import {
  railFacePixels,
  createRailFaceTexture,
  railFaceUV,
  RAIL_FACE_PATTERN,
} from "../src/rail-face.js";
import { RAIL_PROFILE } from "../src/rail-profile.js";

function averagePanel(pixels, start, end) {
  const { width, height } = RAIL_FACE_PATTERN;
  const channels = [0, 0, 0];
  let count = 0;
  for (let y = 12; y < height - 4; y++)
    for (let x = start; x < end; x++) {
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++)
        channels[channel] += pixels[offset + channel] / 255;
      count++;
    }
  return channels.map((value) => value / count);
}

function luminance(channels) {
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

for (const [index, config] of TRACKS.entries()) {
  test(`${config.name}: weathered face panels retain a strong opaque light/dark rhythm`, () => {
    const pixels = railFacePixels(config.name);
    const light = averagePanel(pixels, 16, 48),
      dark = averagePanel(pixels, 80, 112);
    const contrast = (luminance(light) + 0.05) / (luminance(dark) + 0.05);
    assert(
      contrast > 4,
      `paint contrast must survive distant PS1/mobile minification: ${contrast}`,
    );
    for (let i = 3; i < pixels.length; i += 4)
      assert.equal(
        pixels[i],
        255,
        "paint must not become a translucent banner",
      );
    const texture = createRailFaceTexture(config.name);
    assert(texture.isDataTexture);
    assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
    assert.equal(
      texture.wrapT,
      THREE.ClampToEdgeWrapping,
      "a top cap cannot wrap back into the dirty foot of the face",
    );
    assert.equal(
      texture.minFilter,
      THREE.LinearMipmapLinearFilter,
      "fine paint wear needs mipmaps instead of distant shimmer",
    );
    assert(texture.generateMipmaps);
    texture.dispose();
  });

  test(`${config.name}: panel phase follows course stations through banks, forks and the lap seam`, () => {
    const track = makeTrack(index);
    const cycles = railFaceUV(1, RAIL_PROFILE.height, track.length)[0];
    assert.equal(
      cycles,
      Math.round(cycles),
      "the pattern must close at the timing seam",
    );
    const sectionLength = track.length / (cycles * 2);
    assert(
      Math.abs(sectionLength - RAIL_FACE_PATTERN.sectionLength) < 0.03,
      "paint rhythm remains about eight physical metres",
    );
    const before = railFaceUV(0.9999, RAIL_PROFILE.height, track.length);
    const after = railFaceUV(1, RAIL_PROFILE.height, track.length);
    assert(
      after[0] > before[0] && after[0] - before[0] < 0.1,
      "last road quad cannot smear a whole lap of paint",
    );
    for (let i = 0; i < 400; i++) {
      const u = i / 400;
      for (const branch of [-1, 0, 1]) {
        const bounds = track.bounds(u * track.length, branch);
        for (const h of [bounds.railMinHeight, bounds.railMaxHeight]) {
          const uv = railFaceUV(u, h, track.length);
          assert.equal(
            uv[0],
            railFaceUV(u, 0, track.length)[0],
            "colour phase cannot reset on a bank or split tip",
          );
          assert(
            uv[1] >= 0 && uv[1] <= 1,
            "tapered dividers sample their real face height without stretching",
          );
        }
      }
    }
  });
}

test("course paint identities are distinct mineral palettes, not one recoloured neon strip", () => {
  const dark = TRACKS.map((course) =>
    averagePanel(railFacePixels(course.name), 80, 112),
  );
  assert(dark[0][2] > dark[0][0], "coast uses deep petrol-blue paint");
  assert(dark[1][0] > dark[1][2], "sandstone course uses oxide paint");
  assert(dark[2][2] > dark[2][1], "night course uses lilac-ink paint");
});
