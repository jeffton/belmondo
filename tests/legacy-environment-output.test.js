import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { makeTrack } from "../src/track.js";
import { buildEnvironment } from "../src/environment.js";
import { buildCity } from "../src/city.js";
import { buildFinishDistrict } from "../src/finish-district.js";

// Legacy-v4 branch worlds, finish-end districts and Solar's ridged mountain.
// Exact output includes authored wet/mineral ground-map pixels; independent
// clearance/terrain contracts and visual acceptance cover the driving corridors.
const BASELINE = [
  "069a3b56de873b4f0899ebd81ceddcb96081c80f1fa05831b0494e58a95b51ca",
  "7123459c27ab2ebd313e49fd96250bd687c628bb6f1c0815e8d842de1744085e",
  "d7b7634f882f3809e7dc4897d739b196408dfecefbda4e27794628e30b25fd1a",
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
