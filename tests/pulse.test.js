import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Race, CRAFT } from "../src/race.js";
import { WeaponEffects } from "../src/weapon-effects.js";

const track = {
  length: 100_000,
  finishS: 0,
  config: { split: [0.9, 0.95], jump: 0.99 },
  curvature: () => 0,
  gap: () => false,
  frame: (s) => ({
    p: new THREE.Vector3(0, 30, s),
    tangent: new THREE.Vector3(0, 0, 1),
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    width: 30,
    metric: 1,
    u: s / 100_000,
  }),
};

function setup() {
  const race = new Race(track);
  race.countdown = 0;
  // Keep real AI code active, but remove unrelated racers/contact/pickups.
  race.racers = race.racers.slice(0, 2);
  race.pickups = [];
  for (const [i, r] of race.racers.entries()) {
    r.position.set(0, 32.2, i * 45);
    r.velocity.set(0, 0, 160);
    r.speed = 160;
    r.yaw = 0;
    r.s = r.contactS = i * 45;
    r.aiFire = 100;
  }
  race.player.weapon = "PULSE";
  return race;
}

const throttle = { throttle: true, steer: 0, air: 0 };

test("actual PULSE fire damages and slows AI, with temporary engine disruption that expires", () => {
  const race = setup();
  const target = race.racers[1];
  race.fire();
  assert.equal(race.player.weapon, null);
  assert.equal(target.shield, 100 - 18 / CRAFT[target.craft].armor);
  assert.equal(target.speed, 160 * 0.78);
  assert.equal(target.stun, 0.6);
  assert.ok(target.pulseHit > 0);
  assert.equal(target.velocity.x, 0);
  assert.equal(target.velocity.y, 0);

  // Identical already-damaged AI without electrical attenuation: the difference
  // must come from engine force, not a fake speed/HUD value or extra impulse.
  const control = setup();
  const comparison = control.racers[1];
  comparison.shield = target.shield;
  comparison.velocity.copy(target.velocity);
  comparison.speed = target.speed;
  comparison.stun = target.stun;
  race.update(1 / 120, throttle);
  control.update(1 / 120, throttle);
  assert.ok(target.velocity.z < comparison.velocity.z);
  assert.ok(Math.abs(target.velocity.z - 160 * 0.78) < 1);
  assert.ok(target.s > 45);
  for (let i = 0; i < 90; i++) race.update(1 / 120, throttle);
  assert.equal(target.pulseHit, 0);
  assert.ok(target.speed > 160 * 0.78);
});

test("AI PULSE hits player under the same damage and disruption rules", () => {
  const race = setup();
  const ai = race.racers[1];
  ai.position.z = -45;
  ai.s = ai.contactS = -45;
  ai.weapon = "PULSE";
  race.fire(ai);
  assert.equal(race.player.shield, 82);
  assert.equal(race.player.speed, 160 * 0.78);
  assert.ok(race.player.pulseHit > 0);
  assert.ok(race.events.some((event) => event.kind === "hit"));
});

test("protected, behind, distant, lateral and different-height racers get no PULSE response", () => {
  for (const condition of [
    "protected",
    "behind",
    "distant",
    "lateral",
    "height",
  ]) {
    const race = setup();
    const target = race.racers[1];
    if (condition === "protected") target.protect = 2;
    if (condition === "behind") target.position.z = target.contactS = -45;
    if (condition === "distant") target.position.z = target.contactS = 100;
    if (condition === "lateral") target.position.x = 15;
    if (condition === "height") target.position.y += 20;
    race.fire();
    assert.equal(target.shield, 100, condition);
    assert.equal(target.speed, 160, condition);
    assert.equal(target.stun, 0, condition);
    assert.equal(target.pulseHit, 0, condition);
  }
});

test("PULSE cannot cross a split median or strike a nearby disconnected deck", () => {
  const race = setup();
  const target = race.racers[1];
  race.track = {
    ...track,
    config: { ...track.config, split: [0, 1] },
    frame: (s, branch = 0) => ({
      ...track.frame(s),
      p: new THREE.Vector3(branch === 1 ? 8 : 0, 30, s),
      width: 3,
    }),
  };
  race.player.branch = -1;
  target.branch = 1;
  target.position.x = 8;
  race.fire();
  assert.equal(target.shield, 100);
  assert.equal(target.pulseHit, 0);

  const deck = setup();
  const upper = deck.racers[1];
  upper.position.y += 11;
  upper.contactS = 500;
  deck.fire();
  assert.equal(upper.shield, 100);
  assert.equal(upper.pulseHit, 0);
});

test("connected split entry and merge remain legitimate PULSE hits", () => {
  for (const [sourceBranch, targetBranch] of [
    [0, 1],
    [-1, 1],
    [1, 0],
  ]) {
    const race = setup();
    race.track = { ...track, config: { ...track.config, split: [0, 1] } };
    race.player.branch = sourceBranch;
    race.racers[1].branch = targetBranch;
    race.fire();
    assert.ok(race.racers[1].shield < 100);
    assert.ok(race.racers[1].pulseHit > 0);
  }
});

test("lethal PULSE permanently eliminates and clears electrical disruption", () => {
  const race = setup();
  const target = race.racers[1];
  target.shield = 1;
  race.fire();
  assert.equal(target.shield, 0);
  assert.equal(target.eliminated, true);
  assert.equal(target.protect, 0);
  assert.equal(target.pulseHit, 0);
  const position = target.position.clone();
  for (let step = 0; step < 90; step++) race.update(1 / 120, throttle);
  assert(target.position.equals(position));
  assert.equal(target.shield, 0);
});

test("PULSE electrical arcs follow only genuine struck hulls and reuse slots after reset", () => {
  const race = setup();
  const fx = new WeaponEffects(new THREE.Scene());
  const target = race.racers[1];
  fx.update(race, 0, 0);
  const slot = fx.pools.get("PULSE_HIT")[1];
  assert.equal(slot.root.visible, false);
  race.fire();
  fx.update(race, 0, 0);
  assert.equal(slot.root.visible, true);
  assert.equal(fx.pools.get("PULSE_HIT")[0].root.visible, false);
  target.position.z += 8;
  target.s = target.contactS = target.position.z;
  fx.update(race, 0, 0.1);
  assert.ok(slot.root.position.equals(target.position));
  assert.ok(slot.root.children.every((arc) => arc.material.opacity > 0));
  target.pulseHit = 0;
  fx.update(race, 0, 1);
  assert.equal(slot.root.visible, false);
  race.player.weapon = "PULSE";
  race.fire();
  fx.update(race, 0, 1.1);
  assert.equal(fx.pools.get("PULSE_HIT")[1], slot);
  assert.equal(slot.root.visible, true);
  assert.equal(fx.pools.get("PULSE_HIT").length, 2);
  fx.reset();
  assert.equal(slot.root.visible, false);
});
