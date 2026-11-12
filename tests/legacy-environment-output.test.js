import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { makeTrack } from "../src/track.js";
import { buildEnvironment } from "../src/environment.js";
import { buildCity } from "../src/city.js";
import { buildFinishDistrict } from "../src/finish-district.js";

// Legacy-v4 branch worlds with finish-end timing stripe/approach signs
// (96251d6) and Solar's ridged bored mountain (e11b2f1). Exact emitted-output
// regression; separate clearance/terrain contracts and visual acceptance remain.
const BASELINE = [
  "8a63bb605ac41802b407b4bd85031da4512953c6b411256bf767eb77e2af0ab4",
  "4fd1bc958c3ccdcbb32bd60a3917f987aed357e24444958e6686ae38067234fe",
  "298a092be875552f65e24c3a0f5734479939d6923b3d8314955092386bf0e2d2",
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
