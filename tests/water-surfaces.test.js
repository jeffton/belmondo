import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createOceanGeometry } from "../src/water-surfaces.ts";
import { makeTrack, TRACKS } from "../src/track.ts";
import { buildEnvironment } from "../src/environment.ts";
import { buildCity } from "../src/city.ts";

// The same texture transform must remain usable by local world-scaled water.
test("ocean-only geometry tiling preserves its former mapping and texture offset", () => {
  const original = new THREE.PlaneGeometry(12000, 12000, 1, 1);
  const ocean = createOceanGeometry();
  const second = createOceanGeometry();
  assert.notEqual(ocean, second, "each ocean owns its geometry");
  assert.deepEqual(
    ocean.attributes.position.array,
    original.attributes.position.array,
  );
  assert.deepEqual(ocean.index.array, original.index.array);
  const texture = new THREE.Texture();
  const local = new THREE.Vector2(64 / 32, 96 / 32);
  const oldTransform = new THREE.Matrix3().setUvTransform(
    0.17,
    0.31,
    250,
    250,
    0,
    0,
    0,
  );
  texture.offset.set(0.17, 0.31);
  texture.updateMatrix();
  for (let i = 0; i < ocean.attributes.uv.count; i++) {
    const before = new THREE.Vector2()
      .fromBufferAttribute(original.attributes.uv, i)
      .applyMatrix3(oldTransform);
    const after = new THREE.Vector2()
      .fromBufferAttribute(ocean.attributes.uv, i)
      .applyMatrix3(texture.matrix);
    assert(before.distanceTo(after) < 0.000001);
  }
  assert.deepEqual(texture.repeat.toArray(), [1, 1]);
  assert.deepEqual(
    local.clone().applyMatrix3(texture.matrix).toArray(),
    [2.17, 3.31],
  );
});

test("active Monsoon reservoir water uses its own atlas role and 32-unit world UV", () => {
  const index = TRACKS.findIndex((t) => t.name === "MONSOON");
  const track = makeTrack(index);
  const scene = new THREE.Scene();
  const textures = Object.fromEntries(
    ["concrete", "paint", "water", "facade", "road", "edge", "rock"].map(
      (role) => [role, new THREE.Texture()],
    ),
  );
  const environment = buildEnvironment(scene, track, textures);
  buildCity(scene, track, textures, environment);
  const lock = scene.getObjectByName("curved-dry-lock-reservoirs");
  assert(lock, "the original retained reservoir is still active");
  assert.equal(lock.material[0].map, textures.concrete);
  assert.equal(lock.material[1].map, textures.water);
  assert(lock.material.every((m) => m.transparent === false));
  const geometry = lock.geometry;
  const [walls, water] = geometry.groups;
  const range = track.config.sections.dryLock;
  const stations = Math.ceil(
    ((range[1] - range[0] - 0.02) * track.length) / 14,
  );
  assert.equal(geometry.attributes.position.count, stations * 7 * 6 + 24);
  assert.equal(water.count, stations * 6);
  assert.equal(walls.start, 0);
  assert.equal(walls.count, water.start);
  assert.equal(water.materialIndex, 1);
  assert.equal(water.start + water.count, geometry.attributes.position.count);
  for (let i = water.start; i < water.start + water.count; i++) {
    assert(
      Math.abs(
        geometry.attributes.uv.getX(i) -
          geometry.attributes.position.getX(i) / 32,
      ) < 0.00001,
    );
    assert(
      Math.abs(
        geometry.attributes.uv.getY(i) -
          geometry.attributes.position.getZ(i) / 32,
      ) < 0.00001,
    );
    assert.equal(
      geometry.attributes.position.getY(i),
      lock.userData.waterLevel,
    );
  }
  let localPools = 0;
  scene.traverse((mesh) => {
    if (!mesh.isInstancedMesh || mesh.material.map !== textures.water) return;
    localPools++;
    assert.equal(
      mesh.geometry.attributes.architectureDimensions.count,
      mesh.count,
    );
  });
  assert(
    localPools > 0,
    "active local water-box batches use physical instance UV",
  );
  assert.deepEqual(textures.water.repeat.toArray(), [1, 1]);
});
