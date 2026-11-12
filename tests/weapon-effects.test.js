import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { WeaponEffects } from "../src/weapon-effects.js";

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
  fx.update(state, 0.1, 0);
  const blast = fx.blasts[0];
  assert.equal(blast.root.children[1].rotation.x, Math.PI / 2);
  const mineTint = blast.root.children[1].material.color.getHex();
  fx.update(state, 0.6, 0);
  state.shots = [shot("MISSILE")];
  fx.update(state, 0, 0);
  state.shots = [];
  fx.update(state, 0.1, 0);
  assert.equal(fx.blasts[0], blast);
  assert.equal(blast.root.children[1].rotation.x, 0);
  assert.notEqual(blast.root.children[1].material.color.getHex(), mineTint);
  fx.reset();
  for (const pool of fx.pools.values())
    for (const slot of pool) assert.equal(slot.root.visible, false);
});
