import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Race } from "../src/race.js";
import { makeTrack } from "../src/track.js";
import { World } from "../src/world.js";

test("returning an all-DNF field to the menu restores demo hulls without resurrecting racers", () => {
  const track = makeTrack(0);
  const race = new Race(track);
  race.countdown = 0;
  for (const racer of race.racers) race.damage(racer, 200);
  assert(race.complete);

  // Exercise the production draw method with real Three transforms, but no GPU.
  const world = Object.assign(Object.create(World.prototype), {
    track,
    time: 0,
    view: "chase",
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    city: { update() {} },
    startGantry: { update() {} },
    finishDistrict: { update() {} },
    weaponEffects: { update() {} },
    lighting: { update() {} },
    renderer: { render() {} },
    sparkData: [],
    sparks: {
      instanceMatrix: {},
      computeBoundingSphere() {},
    },
    ships: race.racers.map(() => {
      const ship = new THREE.Object3D();
      ship.userData = {
        shield: new THREE.Object3D(),
        shadow: new THREE.Object3D(),
        updateExhaust() {},
      };
      return ship;
    }),
  });

  world.draw(race, 1 / 60);
  assert(world.ships.every((ship) => !ship.visible));
  world.draw(race, 1 / 60, true);
  assert(world.ships.every((ship) => ship.visible));
  assert(race.racers.every((racer) => racer.eliminated && racer.shield === 0));
  world.draw(race, 1 / 60);
  assert(world.ships.every((ship) => !ship.visible));
});
