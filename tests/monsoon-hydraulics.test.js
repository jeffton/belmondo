import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack } from "../src/track.js";
import { buildEnvironment } from "../src/environment.js";
import { buildCity } from "../src/city.js";
import {
  biomeLandHeight,
  NEW_COURSE_RECIPES,
} from "../src/new-course-recipes.js";

test("Monsoon rounded uplands do not quantize neighboring samples into twelve-metre cubes", () => {
  const heights = Array.from({ length: 300 }, (_, i) =>
    biomeLandHeight(NEW_COURSE_RECIPES.MONSOON, 1100 + i * 2, 200, {}),
  );
  assert(
    Math.max(...heights.slice(1).map((h, i) => Math.abs(h - heights[i]))) < 1,
  );
  assert(new Set(heights.map((h) => h.toFixed(3))).size > 250);
});

test("Monsoon's visible spillway and sluice machinery keep the real driving corridor clear", () => {
  const track = makeTrack(4),
    scene = new THREE.Scene();
  const textures = Object.fromEntries(
    ["concrete", "road", "paint", "edge", "facade"].map((name) => [
      name,
      new THREE.Texture(),
    ]),
  );
  const environment = buildEnvironment(scene, track, textures);
  buildCity(scene, track, textures, environment);
  const root = scene.getObjectByName("monsoon-dam-raceway");
  assert(root);
  const water = root.getObjectByName("visible-gravity-spillway");
  assert.deepEqual(water.userData.range, track.config.sections.spillwayDive);
  assert(water.geometry.attributes.position.count > 100);
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (let u = 0.075; u <= 0.55; u += 0.001) {
    const frame = track.frame(u * track.length);
    for (const x of [-frame.width + 3, 0, frame.width - 3]) {
      const origin = frame.p
        .clone()
        .addScaledVector(frame.right, x)
        .addScaledVector(frame.up, 0.4);
      ray.set(origin, frame.up);
      ray.near = 0;
      ray.far = 7;
      assert.equal(
        ray.intersectObject(root, true).length,
        0,
        `machinery cannot invade the hull corridor at ${u}/${x}`,
      );
    }
  }
  const geometries = new Set(),
    materials = new Set(),
    maps = new Set();
  scene.traverse((object) => {
    if (object.isInstancedMesh) object.dispose();
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
  });
  for (const material of materials) {
    if (material.map) maps.add(material.map);
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const map of maps) map.dispose();
});
