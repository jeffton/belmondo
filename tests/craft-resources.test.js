import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { collectCraftResources } from "../src/craft.js";
import { World } from "../src/world.js";

function attachedResources(scene) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      materials.add(object.material);
      if (object.material.map) textures.add(object.material.map);
    }
  });
  return { geometries, materials, textures };
}

test("grid/trial switches retain craft caches; course teardown releases detached variants once", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const world = Object.create(World.prototype);
  Object.assign(world, {
    ships: [],
    sparkData: [],
    weaponEffects: { reset() {} },
  });
  const specs = [0xe95a42, 0x577bda, 0x9bb846].map((color) => ({ color }));
  const grid = {
    racers: Array.from({ length: 8 }, (_, id) => ({ craft: id % 3 })),
  };
  const trial = { racers: [{ craft: 1 }] };
  const previouslyDisposed = new Set();

  for (let course = 0; course < 4; course++) {
    world.scene = new THREE.Scene();
    world.ships = [];
    world.setupRacers(grid, specs);
    const allocated = attachedResources(world.scene);
    assert.deepEqual(
      Object.values(allocated).map((set) => set.size),
      [16, 8, 2],
    );
    const disposalCounts = new Map();
    for (const resource of Object.values(allocated).flatMap((set) => [
      ...set,
    ])) {
      assert(
        !previouslyDisposed.has(resource),
        "rebuilt courses need fresh resources",
      );
      disposalCounts.set(resource, 0);
      resource.addEventListener("dispose", () => {
        disposalCounts.set(resource, disposalCounts.get(resource) + 1);
      });
    }
    const hulls = world.ships
      .slice(0, 3)
      .map((ship) => ship.children[0].geometry);
    world.setupRacers(trial, specs);
    assert.equal(attachedResources(world.scene).geometries.size, 8);
    world.setupRacers(grid, specs);
    for (let variant = 0; variant < 3; variant++) {
      assert.equal(world.ships[variant].children[0].geometry, hulls[variant]);
    }
    assert([...disposalCounts.values()].every((count) => count === 0));
    world.setupRacers(trial, specs);

    // The world traversal sees only the trial's hull. The cache contributes the
    // other airframes and liveries to the same deduplicated disposal sets.
    const disposal = attachedResources(world.scene);
    collectCraftResources(world.scene, disposal);
    assert.deepEqual(
      Object.values(disposal).map((set) => set.size),
      [16, 8, 2],
    );
    for (const resource of Object.values(disposal).flatMap((set) => [...set])) {
      resource.dispose();
      previouslyDisposed.add(resource);
    }
    assert([...disposalCounts.values()].every((count) => count === 1));
    const released = {
      geometries: new Set(),
      materials: new Set(),
      textures: new Set(),
    };
    collectCraftResources(world.scene, released);
    assert(Object.values(released).every((set) => set.size === 0));
  }
});
