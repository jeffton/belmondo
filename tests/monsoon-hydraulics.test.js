import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.js";
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
  const track = makeTrack(TRACK_INDEX.MONSOON),
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
  const terrainSurface = scene.getObjectByName("terrain-surface");
  assert(terrainSurface);
  const water = root.getObjectByName("visible-gravity-spillway");
  assert.deepEqual(water.userData.range, track.config.sections.spillwayDive);
  assert(water.geometry.attributes.position.count > 100);
  root.updateMatrixWorld(true);
  terrainSurface.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const positions = water.geometry.attributes.position;
  const terrainRay = new THREE.Raycaster();
  terrainRay.near = 0;
  for (let i = 0; i < positions.count; i += 3) {
    const triangle = [0, 1, 2].map((corner) =>
      new THREE.Vector3().fromBufferAttribute(positions, i + corner),
    );
    const samples = [
      ...triangle,
      triangle[0]
        .clone()
        .add(triangle[1])
        .add(triangle[2])
        .multiplyScalar(1 / 3),
      triangle[0].clone().add(triangle[1]).multiplyScalar(0.5),
      triangle[1].clone().add(triangle[2]).multiplyScalar(0.5),
      triangle[2].clone().add(triangle[0]).multiplyScalar(0.5),
    ];
    for (const point of samples)
      assert(
        point.y - environment.heightAt(point.x, point.z) > 1,
        `actual triangulated land remains below spillway water at ${point.x}/${point.z}`,
      );
    if (i % 96 === 0) {
      const point = samples[3];
      terrainRay.set(
        point.clone().add(new THREE.Vector3(0, 150, 0)),
        new THREE.Vector3(0, -1, 0),
      );
      terrainRay.far = 300;
      const hit = terrainRay.intersectObject(terrainSurface, true)[0];
      assert(
        hit,
        `rendered terrain exists beneath spillway at ${point.x}/${point.z}`,
      );
      assert(
        point.y - hit.point.y > 1,
        `rendered terrain mesh stays below spillway water at ${point.x}/${point.z}`,
      );
      assert(
        Math.abs(hit.point.y - environment.heightAt(point.x, point.z)) < 0.001,
        "heightAt and the rendered terrain triangle share the same surface",
      );
    }
  }
  const [flumeStart, flumeEnd] = track.config.sections.spillwayDive;
  for (let i = 0; i < 24; i++) {
    const u = flumeStart + ((flumeEnd - flumeStart) * (i + 0.5)) / 24;
    const frame = track.frame(u * track.length);
    const right = new THREE.Vector3(
      frame.tangent.z,
      0,
      -frame.tangent.x,
    ).normalize();
    for (const offset of [frame.width + 12, frame.width + 62]) {
      const from = frame.p
        .clone()
        .addScaledVector(right, offset)
        .setY(frame.p.y - 1);
      ray.set(from, right.clone().multiplyScalar(-1));
      ray.far = 5;
      assert(
        ray.intersectObject(root, true).length > 0,
        `flume retaining wall contains water at ${u}/${offset}`,
      );
    }
  }
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
