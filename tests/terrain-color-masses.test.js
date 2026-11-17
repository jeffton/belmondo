import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { createTerrain } from "../src/terrain.ts";

function terrainSamples(t, name) {
  const terrain = createTerrain(makeTrack(TRACK_INDEX[name]));
  t.after(() => terrain.geometries.forEach((geometry) => geometry.dispose()));
  const stride = (terrain.extent * 2) / terrain.step + 1;
  const heights = terrain.prepared.heights;
  const samples = new Map();
  for (const geometry of terrain.geometries) {
    const positions = geometry.attributes.position;
    const colors = geometry.attributes.color;
    for (let i = 0; i < positions.count; i++) {
      const ix = Math.round(
        (positions.getX(i) + terrain.extent) / terrain.step,
      );
      const iz = Math.round(
        (positions.getZ(i) + terrain.extent) / terrain.step,
      );
      const dx =
        heights[iz * stride + Math.min(stride - 1, ix + 1)] -
        heights[iz * stride + Math.max(0, ix - 1)];
      const dz =
        heights[Math.min(stride - 1, iz + 1) * stride + ix] -
        heights[Math.max(0, iz - 1) * stride + ix];
      const color = new THREE.Color().fromBufferAttribute(colors, i);
      const sample = {
        ix,
        iz,
        color,
        hsl: color.getHSL({}),
        luminance: color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722,
        slope: Math.hypot(dx, dz) / (terrain.step * 2),
      };
      const key = `${ix}:${iz}`;
      if (samples.has(key))
        assert(
          samples.get(key).color.equals(color),
          "shared chunk boundaries retain identical baked terrain colours",
        );
      samples.set(key, sample);
    }
  }
  return { samples: [...samples.values()], stride, step: terrain.step };
}

function mean(samples, value) {
  assert(samples.length > 0, "the actual heightfield contains this material");
  return (
    samples.reduce((sum, sample) => sum + value(sample), 0) / samples.length
  );
}

test("Whiteout has quiet bright snow shelves and distinctly cooler, darker exposed ice cuts", (t) => {
  const { samples } = terrainSamples(t, "WHITEOUT");
  const snow = samples.filter((sample) => sample.slope < 0.2);
  const ice = samples.filter((sample) => sample.slope > 0.95);
  assert(
    mean(snow, (sample) => sample.luminance) >
      mean(ice, (sample) => sample.luminance) + 0.2,
    "snow and ice remain separate large value masses before scene lighting",
  );
  assert(
    mean(ice, (sample) => sample.hsl.s) > mean(snow, (sample) => sample.hsl.s),
  );
  assert(ice.every(({ color }) => color.b > color.g && color.g > color.r));
  assert(
    snow.every((sample) => sample.color.equals(snow[0].color)),
    "plateau snow has no altitude bands or per-vertex noise",
  );
});

test("Monsoon separates dark green uplands from earthy excavated banks", (t) => {
  const { samples } = terrainSamples(t, "MONSOON");
  const uplands = samples.filter((sample) => sample.slope < 0.2);
  const banks = samples.filter((sample) => sample.slope > 0.95);
  assert(uplands.length > 0 && banks.length > 0);
  assert(uplands.every(({ color }) => color.g > color.r && color.g > color.b));
  assert(banks.every(({ color }) => color.r > color.g && color.g > color.b));
  assert(
    mean(uplands, (sample) => sample.luminance) <
      mean(banks, (sample) => sample.luminance),
    "dark vegetation supports the lighter mineral banks",
  );
  assert(
    uplands.every((sample) => sample.color.equals(uplands[0].color)),
    "green masses are quiet rather than speckled",
  );
});

test("Cinderline keeps cool dark basalt dominant around broad, brighter sulfur zones", (t) => {
  const { samples, stride, step } = terrainSamples(t, "CINDERLINE");
  const isSulfur = (sample) => sample.hsl.h > 0.1 && sample.hsl.h < 0.2;
  const sulfur = samples.filter(isSulfur);
  const basalt = samples.filter((sample) => sample.hsl.h > 0.55);
  assert(
    basalt.length > sulfur.length * 4,
    "sulfur is an accent within predominantly cool basalt, not a second full biome",
  );
  assert(
    mean(sulfur, (sample) => sample.luminance) >
      mean(basalt, (sample) => sample.luminance) * 2,
  );
  assert(basalt.every(({ color }) => color.b > color.r && color.b > color.g));
  const grid = new Map(
    samples.map((sample) => [`${sample.ix}:${sample.iz}`, sample]),
  );
  let widestZone = 0;
  for (let iz = 0; iz < stride; iz++) {
    let run = 0;
    for (let ix = 0; ix < stride; ix++) {
      run = isSulfur(grid.get(`${ix}:${iz}`)) ? run + step : 0;
      widestZone = Math.max(widestZone, run);
    }
  }
  assert(
    widestZone > 230,
    "mineral colour forms a broad landscape zone, not fine periodic stripes",
  );
});
