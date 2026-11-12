import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { makeTrack } from "../src/track.js";
import { buildEnvironment } from "../src/environment.js";
import { buildCity } from "../src/city.js";
import { buildFinishDistrict } from "../src/finish-district.js";

// Baseline ab0109e: protects the original courses' emitted geometry, instance
// transforms, materials and generated textures, rather than only recipe data.
const BASELINE = [
  "df485a9c8a046147d96db5632f3ef3c0a417aa76d7c6f351f4ad29e6facc50e9",
  "a8818e919a65b48210a4659c5a4ede70b8554b59cca4b8dedb03562af7825100",
  "adb951a857697a59c936f299be8a0c03c6dee81f32072a0f6c7aeb5bae1fc5fc",
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
  test(`legacy course ${index}: exact environment output matches ab0109e`, () => {
    assert.equal(environmentDigest(index), BASELINE[index]);
  });
