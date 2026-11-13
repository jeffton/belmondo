import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { makeTrack } from "../src/track.js";
import { buildEnvironment } from "../src/environment.js";
import { buildCity } from "../src/city.js";
import { buildFinishDistrict } from "../src/finish-district.js";

// Legacy-v4 branch worlds, composed prop groups, finish-end districts and Solar's ridged mountain.
// Exact output includes authored wet/mineral ground-map pixels; independent
// clearance/terrain contracts and visual acceptance cover the driving corridors.
const BASELINE = [
  "55b8a32ed440ac7312bcd91eee705a1542eb7100514dbfd272d3e9e13e81f13d",
  "66570cc219144ef9c333c92a8e0ba9f1dbef9f300f0eb6ca1ee4e591f1a2ad49",
  "08db65ece27874d1620796e4b215696e5d9e6fa0df2fed43c1b23ae677dd1cb9",
];
export function environmentDigest(index) {
  const scene = new THREE.Scene();
  const track = makeTrack(index);
  const textures = {
    concrete: null,
    rock: null,
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
