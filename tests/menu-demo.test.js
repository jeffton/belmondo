import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Race } from "../src/race.ts";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { World } from "../src/world.ts";
import { createTerrain } from "../src/terrain.ts";
import { createCraft } from "../src/craft.ts";
import { buildSceneryActivity } from "../src/scenery-activity.ts";

test("returning an all-DNF field to the menu restores demo hulls without resurrecting racers", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const scene = new THREE.Scene();
  const track = makeTrack(TRACK_INDEX.COAST);
  const race = new Race(track);
  race.countdown = 0;
  for (const racer of race.racers) race.damage(racer, 200);
  assert(race.complete);

  // Exercise the production draw method with real Three transforms, but no GPU.
  const terrain = createTerrain(track);
  const environment = { terrain, heightAt: terrain.heightAt };
  const scenery = buildSceneryActivity(scene, track, environment);
  const world = Object.assign(Object.create(World.prototype), {
    track,
    environment,
    scenery,
    time: 0,
    view: "chase",
    scene,
    camera: new THREE.PerspectiveCamera(),
    city: { update() {} },
    startGantry: { update() {} },
    finishDistrict: { update() {} },
    weaponEffects: { update() {} },
    impactSparks: { update() {} },
    lighting: { update() {} },
    renderer: { render() {} },
    sparkData: [],
    sparks: {
      instanceMatrix: {},
      computeBoundingSphere() {},
    },
    ships: race.racers.map((racer) =>
      createCraft(scene, 0xffffff, racer.craft),
    ),
  });

  world.draw(race, 1 / 60);
  assert(world.ships.every((ship) => !ship.visible));
  const surveyPlane = scenery.root.getObjectByName("scenery-moving-part");
  const beforeDemo = surveyPlane.parent.position.clone();
  world.draw(race, 1 / 60, true);
  assert(world.ships.every((ship) => ship.visible));
  assert(!surveyPlane.parent.position.equals(beforeDemo));
  assert(race.racers.every((racer) => racer.eliminated && racer.shield === 0));
  world.draw(race, 1 / 60);
  assert(world.ships.every((ship) => !ship.visible));
});
