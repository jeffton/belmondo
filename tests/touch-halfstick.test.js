import test from "node:test";
import assert from "node:assert/strict";
import { halfstickPosition } from "../src/touch-halfstick.js";
import { Race } from "../src/race.js";
import { makeTrack } from "../src/track.js";

test("halfstick preserves analog travel, projects diagonals to its arc and excludes up", () => {
  assert.deepEqual(halfstickPosition(-0.3, 0.4), { x: -0.3, y: 0.4 });
  assert.deepEqual(halfstickPosition(0.6, 0.8), { x: 0.6, y: 0.8 });
  assert.deepEqual(halfstickPosition(0, -4), { x: 0, y: 0 });
  assert.deepEqual(halfstickPosition(-0.5, -1), { x: -0.5, y: 0 });
  assert.deepEqual(halfstickPosition(4, 0), { x: 1, y: 0 });
  assert.deepEqual(halfstickPosition(0, 4), { x: 0, y: 1 });
  const diagonal = halfstickPosition(-3, 4);
  assert.equal(diagonal.x, -0.6);
  assert.equal(diagonal.y, 0.8);
});

test("omitted throttle remains finite and identical to explicit coast through countdown and racing", () => {
  const track = makeTrack(0);
  const omitted = new Race(track, 0, "trial");
  const coast = new Race(track, 0, "trial");
  for (let step = 0; step < 1200; step++) {
    omitted.update(1 / 120, {});
    coast.update(1 / 120, { throttle: 0 });
    for (const race of [omitted, coast]) {
      for (const value of [
        ...race.player.position.toArray(),
        ...race.player.velocity.toArray(),
        race.player.speed,
        race.player.yaw,
        race.player.shield,
        race.time,
        race.countdown,
      ])
        assert(
          Number.isFinite(value),
          `finite simulation state at step ${step}`,
        );
    }
    assert.deepEqual(omitted.player, coast.player);
    assert.equal(omitted.countdown, coast.countdown);
    assert.equal(omitted.time, coast.time);
    assert.deepEqual(omitted.launch, coast.launch);
  }
  assert.equal(omitted.countdown, 0);
  assert(omitted.time > 4);
});

test("partial touch thrust scales engine force without changing coast drag or boolean input", () => {
  const track = makeTrack(0);
  const velocity = (throttle) => {
    const race = new Race(track, 0, "trial");
    race.countdown = 0;
    const forward = race.player.velocity
      .clone()
      .set(Math.sin(race.player.yaw) * 40, 0, Math.cos(race.player.yaw) * 40);
    race.player.velocity.copy(forward);
    race.update(1 / 120, { throttle });
    return race.player.velocity.clone();
  };
  const coast = velocity(0);
  const half = velocity(0.5);
  const full = velocity(1);
  assert(half.clone().sub(coast).length() > 0);
  assert(
    full
      .clone()
      .sub(coast)
      .multiplyScalar(0.5)
      .distanceTo(half.clone().sub(coast)) < 1e-10,
  );
  assert(velocity(false).distanceTo(coast) < 1e-10);
  assert(velocity(true).distanceTo(full) < 1e-10);
});
