import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Race } from "../src/race.ts";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import {
  shakeHitShip,
  shakeHitCockpit,
  WEAPON_HIT_DURATION,
} from "../src/weapon-hit.ts";

const track = makeTrack(TRACK_INDEX.COAST);
const input = { throttle: false, steer: 0, air: 0 };
function setup(weapon, targetId = 1) {
  const race = new Race(track, 0, "race");
  race.countdown = 0;
  race.pickups = [];
  race.racers = race.racers.slice(0, 3);
  const shooter = race.racers[targetId === 0 ? 1 : 0];
  const target = race.racers[targetId];
  const s = track.length * 0.02;
  for (const r of race.racers) {
    const station =
      s +
      (r === target ? (weapon === "MINE" ? -7 : 30) : r === shooter ? 0 : 160);
    const f = track.frame(station);
    r.s = r.contactS = station;
    r.position.copy(f.p);
    r.position.y += 2.2;
    r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
    r.velocity.set(0, 0, 0);
    r.speed = 0;
    r.aiFire = Infinity;
  }
  shooter.weapon = weapon;
  return { race, shooter, target };
}

for (const weapon of ["PULSE", "MISSILE", "MINE"]) {
  for (const targetId of [0, 1]) {
    test(`${weapon} actual impact recoils only the struck ${targetId === 0 ? "player" : "NPC"} and settles`, () => {
      const { race, shooter, target } = setup(weapon, targetId);
      race.fire(shooter);
      for (let i = 0; i < 90 && !target.weaponHit; i++)
        race.update(1 / 120, input);
      assert.ok(target.shield < 100, "real weapon damage");
      assert.ok(target.weaponHit > 0);
      assert.ok(
        race.racers.filter((r) => r !== target).every((r) => r.weaponHit === 0),
      );
      race.shots = [];
      race.mines = [];
      for (let i = 0; i < 61; i++) race.update(1 / 120, input);
      assert.equal(target.weaponHit, 0);
    });
  }
  test(`${weapon} protection and misses do not claim a damaging hit`, () => {
    for (const protectedTarget of [true, false]) {
      const { race, shooter, target } = setup(weapon);
      if (protectedTarget) target.protect = 5;
      else {
        target.position.y += 50;
        target.h = 50;
      }
      race.fire(shooter);
      // Inspect the immediate pulse and the actual first missile/mine sweep.
      race.update(1 / 120, input);
      assert.ok(race.racers.every((r) => r.weaponHit === 0));
    }
  });
}

test("weapon damage scales planar speed without altering vertical speed or steering state", () => {
  for (const weapon of ["PULSE", "MISSILE", "MINE"]) {
    const { race, target } = setup(weapon);
    target.velocity.set(60, -24, 80);
    target.yawRate = 0.62;
    target.pitchRate = -0.23;
    race.damage(target, 5, weapon);
    assert.equal(target.speed, 68);
    assert.equal(target.velocity.y, -24);
    assert.equal(target.yawRate, 0.62);
    assert.equal(target.pitchRate, -0.23);
    assert.equal(target.stun, 0);
  }
});

test("visual recoil is pose-local, finite, and never changes simulation or camera transport", () => {
  const { race, target } = setup("PULSE");
  const original = JSON.stringify(target);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(5, 8, 10);
  const cameraPosition = camera.position.clone();
  const ship = new THREE.Object3D();
  for (let frame = 0; frame <= 60; frame++) {
    ship.position.copy(target.position);
    ship.rotation.set(target.pitch, target.yaw, 0, "YXZ");
    camera.rotation.set(0, 0, 0);
    const remaining = Math.max(0, WEAPON_HIT_DURATION - frame / 60);
    shakeHitShip(ship, remaining);
    shakeHitCockpit(camera, remaining);
    assert.ok(camera.position.equals(cameraPosition));
    const shift = ship.position.distanceTo(target.position);
    assert.ok(shift <= 0.650001);
    if (frame === 0) assert.ok(shift > 0.6 && camera.rotation.z > 0.025);
    if (!remaining) {
      assert.ok(ship.position.equals(target.position));
      assert.equal(camera.rotation.z, 0);
    }
  }
  assert.equal(JSON.stringify(target), original);
  race.damage(target, 1);
  assert.equal(
    target.weaponHit,
    0,
    "generic/nonweapon damage is not weapon feedback",
  );
});
