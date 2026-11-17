import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { collectCraftResources } from "../src/craft.ts";
import { World } from "../src/world.ts";

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

const values = (resources) =>
  Object.values(resources).flatMap((set) => [...set]);

test("grid switches retire projection buffers but retain hulls and masks until course teardown", (t) => {
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
    impactSparks: { reset() {} },
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
    const disposalCounts = new Map();
    const observe = () => {
      for (const resource of values(attachedResources(world.scene))) {
        if (disposalCounts.has(resource)) continue;
        assert(
          !previouslyDisposed.has(resource),
          "new course needs fresh resources",
        );
        disposalCounts.set(resource, 0);
        resource.addEventListener("dispose", () => {
          disposalCounts.set(resource, disposalCounts.get(resource) + 1);
        });
      }
    };
    world.setupRacers(grid, specs);
    observe();
    const hulls = world.ships
      .slice(0, 3)
      .map((ship) => ship.children[0].geometry);
    const masks = world.ships
      .slice(0, 3)
      .map((ship) => ship.userData.shadow.material.map);
    assert.equal(
      new Set(masks).size,
      3,
      "each airframe has its own shared mask",
    );
    const retired = world.ships.flatMap((ship) => [
      ship.userData.shadow.geometry,
      ship.userData.shadow.material,
    ]);
    world.setupRacers(trial, specs);
    observe();
    for (const resource of retired)
      assert.equal(disposalCounts.get(resource), 1);
    for (const resource of [...hulls, ...masks])
      assert.equal(disposalCounts.get(resource), 0);
    world.setupRacers(grid, specs);
    observe();
    for (let variant = 0; variant < 3; variant++) {
      assert.equal(world.ships[variant].children[0].geometry, hulls[variant]);
      assert.equal(
        world.ships[variant].userData.shadow.material.map,
        masks[variant],
      );
    }
    world.setupRacers(trial, specs);
    observe();
    const disposal = attachedResources(world.scene);
    collectCraftResources(world.scene, disposal);
    for (const resource of values(disposal)) {
      assert.equal(
        disposalCounts.get(resource),
        0,
        "retired projections are not disposed twice",
      );
      resource.dispose();
    }
    assert([...disposalCounts.values()].every((count) => count === 1));
    for (const resource of disposalCounts.keys())
      previouslyDisposed.add(resource);
    const released = {
      geometries: new Set(),
      materials: new Set(),
      textures: new Set(),
    };
    collectCraftResources(world.scene, released);
    assert(values(released).length === 0);
  }
});
