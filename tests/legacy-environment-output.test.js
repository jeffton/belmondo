import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { makeTrack } from "../src/track.js";
import { buildEnvironment } from "../src/environment.js";
import { buildCity } from "../src/city.js";
import { buildFinishDistrict } from "../src/finish-district.js";

// Legacy-v4 world acceptance: d3f8eb8 routes, 0d0509a Coast launch and exact
// gallery basement grading. Covers emitted geometry, instances and materials.
const BASELINE = [
  "65584c2696e2012a7ccf16f1a68114a9c9e84c4a779c77ea5aae179d1d9291ac",
  "cc401ac64a7277f281ab3dbafbb9926670b913321c710d4dd77c26c6120aba52",
  "944fa0b05065fe72b9c466282690d6baa25212031a667e3d0e4d85fca2f2147c",
];
export function environmentDigest(index) {
  const scene = new THREE.Scene();
  const track = makeTrack(index);
  const textures = {
    concrete: null,
    road: null,
    paint: null,
    facade: null,
    edge: null,
  };
  const environment = buildEnvironment(scene, track, textures);
  buildCity(scene, track, textures, environment);
  buildFinishDistrict(scene, track, textures, environment);
  const hash = createHash("sha256");
  const geometries = new Set(),
    materials = new Set(),
    maps = new Set();
  const bytes = (array) =>
    hash.update(
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength),
    );
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    hash.update(o.name);
    if (!o.isMesh) return;
    bytes(
      o.matrixWorld.elements instanceof Float32Array
        ? o.matrixWorld.elements
        : new Float64Array(o.matrixWorld.elements),
    );
    for (const name of Object.keys(o.geometry.attributes).sort()) {
      hash.update(name);
      bytes(o.geometry.attributes[name].array);
    }
    if (o.geometry.index) bytes(o.geometry.index.array);
    if (o.isInstancedMesh) bytes(o.instanceMatrix.array);
    const m = o.material;
    hash.update(
      JSON.stringify([
        m.type,
        m.color?.getHex(),
        m.vertexColors,
        m.side,
        m.opacity,
        m.transparent,
      ]),
    );
    if (m.map?.image?.data) bytes(m.map.image.data);
    geometries.add(o.geometry);
    materials.add(m);
    if (m.map) maps.add(m.map);
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  maps.forEach((m) => m.dispose());
  return hash.digest("hex");
}
for (let index = 0; index < 3; index++)
  test(`legacy-v4 course ${index}: exact environment output matches world acceptance`, () => {
    assert.equal(environmentDigest(index), BASELINE[index]);
  });
