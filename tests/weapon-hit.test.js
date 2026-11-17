import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Race } from "../src/race.ts";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { shakeHitShip, shakeHitCockpit } from "../src/weapon-hit.ts";

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
      for (let i = 0; i < 60; i++) race.update(1 / 120, input);
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
    const remaining = Math.max(0, 0.42 - frame / 60);
    shakeHitShip(ship, remaining);
    shakeHitCockpit(camera, remaining);
    assert.ok(camera.position.equals(cameraPosition));
    assert.ok(ship.position.distanceTo(target.position) <= 0.220001);
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
