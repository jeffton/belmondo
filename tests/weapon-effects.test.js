import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { WeaponEffects } from "../src/weapon-effects.ts";

const race = () => ({ shots: [], mines: [], racers: [] });
const shot = (type) => ({
  type,
  position: new THREE.Vector3(2, 3, 4),
  velocity: new THREE.Vector3(0, 0, 100),
  direction: new THREE.Vector3(0, 0, 1),
  life: 0.35,
});

test("weapon visuals do not mutate simulation and pool textured slots across repeated impacts", () => {
  const scene = new THREE.Scene();
  const fx = new WeaponEffects(scene);
  const state = race();
  const missile = shot("MISSILE");
  const original = JSON.stringify(missile);
  for (let i = 0; i < 20; i++) {
    state.shots = [missile];
    fx.update(state, 0.016, i);
    const slot = fx.active.get(missile);
    assert.equal(slot.root.visible, true);
    assert.equal(slot.root.children[1].material.map, fx.exhaustTexture);
    state.shots = [];
    fx.update(state, 0.016, i);
    fx.update(state, 0.6, i);
  }
  assert.equal(JSON.stringify(missile), original);
  assert.equal(fx.pools.get("MISSILE").length, 1);
  assert.equal(fx.pools.get("BLAST").length, 1);
  assert.equal(fx.blasts.length, 0);
  scene.traverse((object) => {
    if (!object.isMesh) return;
    for (const number of object.geometry.attributes.position.array)
      assert.ok(Number.isFinite(number));
    if (object.material.map) assert.ok(object.geometry.attributes.uv);
  });
});

test("mine/missile impacts reset their orientation and tint when sharing a blast slot", () => {
  const fx = new WeaponEffects(new THREE.Scene());
  const state = race();
  const mine = { position: new THREE.Vector3() };
  state.mines = [mine];
  fx.update(state, 0, 0);
  state.mines = [];
  fx.update(state, 0.25, 0.25);
  const blast = fx.blasts[0];
  assert.equal(blast.root.children[1].rotation.x, Math.PI / 2);
  assert(blast.root.position.equals(mine.position));
  assert.equal(blast.root.children.length, 3);
  assert(blast.root.children[0].visible);
  fx.update(state, 0.09, 0.34);
  assert.equal(blast.root.children[0].visible, false);
  assert(blast.root.children[1].scale.x < 5);
  fx.update(state, 0.12, 0.46);
  assert.equal(blast.root.visible, false);
  assert.equal(fx.blasts.length, 0);
  const mineTint = blast.root.children[1].material.color.getHex();
  fx.update(state, 0.6, 0);
  state.shots = [shot("MISSILE")];
  fx.update(state, 0, 0);
  state.shots = [];
  fx.update(state, 0.1, 0);
  assert.equal(fx.blasts[0], blast);
  assert.equal(blast.root.children[0].visible, true);
  assert.equal(blast.root.children[0].material.opacity, 1);
  assert.equal(blast.root.children[1].rotation.x, 0);
  assert.notEqual(blast.root.children[1].material.color.getHex(), mineTint);
  assert(blast.root.position.equals(shot("MISSILE").position));
  fx.reset();
  for (const pool of fx.pools.values())
    for (const slot of pool) assert.equal(slot.root.visible, false);
});

test("boost wakes stay paired and local to the nozzles, ramp smoothly and reuse the same meshes", () => {
  const fx = new WeaponEffects(new THREE.Scene());
  const state = race();
  const racer = {
    position: new THREE.Vector3(3, 12, 4),
    yaw: Math.PI / 2,
    pitch: 0.1,
    yawRate: 0,
    pulseHit: 0,
    boost: 0,
  };
  state.racers = [racer];
  fx.update(state, 0, 0);
  const slot = fx.pools.get("TURBO")[0];
  assert.equal(slot.root.visible, false);
  racer.boost = 0.35;
  fx.update(state, 0, 0.1);
  assert.equal(slot.root.visible, true);
  assert(slot.root.position.equals(racer.position));
  assert.equal(slot.root.children.length, 2);
  const firstWake = slot.root.children[0];
  const ramp = firstWake.material.opacity;
  const rampLength = firstWake.scale.z;
  assert(firstWake.position.x < 0 && slot.root.children[1].position.x > 0);
  assert(firstWake.position.z < 0);
  assert.notEqual(firstWake.geometry, fx.streakGeometry);
  assert(firstWake.geometry.attributes.position.count > 12);
  assert.equal(firstWake.material.depthWrite, false);
  assert.equal(firstWake.material.depthTest, true);
  assert.equal(firstWake.material.forceSinglePass, true);
  racer.boost = 1;
  fx.update(state, 0, 0.2);
  assert(firstWake.scale.z > rampLength && firstWake.scale.z < 18);
  assert(firstWake.material.opacity > ramp && ramp > 0);
  assert.equal(fx.pools.get("TURBO")[0].root.children[0], firstWake);
  racer.boost = 0.1;
  fx.update(state, 0, 0.3);
  assert.equal(slot.root.visible, false);
});
