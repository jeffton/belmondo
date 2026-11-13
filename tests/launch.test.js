import { test } from "node:test";
import assert from "node:assert/strict";
import { Launch } from "../src/launch.js";
import { Race } from "../src/race.js";
import { makeTrack } from "../src/track.js";

const idle = {
  throttle: 0,
  launchIntent: false,
  steer: 0,
  airLeft: 0,
  airRight: 0,
};
const press = { ...idle, throttle: 1, launchIntent: true };

function advance(target, seconds, input, step = 1 / 120) {
  let remaining = seconds;
  while (remaining > 0) {
    const dt = Math.min(step, remaining);
    if (target instanceof Launch)
      target.update(dt, input.throttle, input.launchIntent);
    else target.update(dt, input);
    remaining -= dt;
  }
}

function launchAt(segments, step) {
  const launch = new Launch();
  for (const [seconds, input] of segments)
    advance(launch, seconds, input, step);
  launch.resolve();
  return launch;
}

test("idle input and thrust held from the start cannot win a launch", () => {
  for (const input of [
    idle,
    { ...press, launchIntent: false },
    press,
    { ...press, throttle: 0.18 },
    { ...press, throttle: 0.7 },
  ]) {
    const launch = launchAt([[3.2, input]]);
    assert.equal(launch.success, false);
    assert.equal(launch.level, 0);
  }
});

test("late digital throttle earns a launch; too early and too late do not", () => {
  for (const step of [1 / 30, 1 / 60, 1 / 120, 0.137]) {
    const good = launchAt(
      [
        [2.62, idle],
        [0.58, press],
      ],
      step,
    );
    assert.equal(good.success, true);
    assert(Math.abs(good.level - 0.725) < 1e-10);
    assert.equal(
      launchAt(
        [
          [2.2, idle],
          [1, press],
        ],
        step,
      ).success,
      false,
    );
    assert.equal(
      launchAt(
        [
          [3, idle],
          [0.2, press],
        ],
        step,
      ).success,
      false,
    );
  }
});

test("analog throttle and a deliberate touch thrust hold share the timing model", () => {
  const analog = launchAt([
    [2.04, idle],
    [1.16, { ...press, throttle: 0.5 }],
  ]);
  const touch = launchAt([
    [2.62, idle],
    [0.58, press],
  ]);
  assert.equal(analog.success, true);
  assert.equal(touch.success, true);
  assert(Math.abs(analog.level - touch.level) < 1e-10);
});

test("released thrust decays and GO locks the outcome against later input", () => {
  const launch = launchAt([
    [1.85, idle],
    [1, press],
    [0.35, idle],
  ]);
  assert.equal(launch.success, true);
  assert(Math.abs(launch.level - 0.72) < 1e-10);
  launch.update(2, 1, true);
  launch.resolve();
  assert.equal(launch.success, true);
  assert(Math.abs(launch.level - 0.72) < 1e-10);
});

test("Race samples precisely at GO, keeps the grid still, and accelerates smoothly", () => {
  const race = new Race(makeTrack(0), 0, "trial");
  const start = race.player.position.clone();
  // Choose an exact final countdown slice so crossing GO can be tested separately.
  race.update(4.6, idle);
  race.update(0.58, press);
  assert.equal(race.launch.resolved, false);
  assert.equal(race.time, 0);
  assert.equal(race.player.speed, 0);
  assert(race.player.position.equals(start));
  race.update(0.12, press);
  assert.equal(race.countdown, 0);
  assert.equal(race.launch.success, true);
  assert(Math.abs(race.launch.level - 0.75) < 1e-10);
  assert(Math.abs(race.time - 0.1) < 1e-10);
  assert(race.player.surge > 0);
  assert(race.player.boost > 0 && race.player.boost < 1);
  assert(race.player.speed > 0 && race.player.speed < 20);
  const level = race.launch.level;
  race.update(0.01, idle);
  assert.equal(race.launch.level, level);
});

test("GO timing and reward are independent of countdown update frequency", () => {
  for (const step of [1 / 30, 1 / 60, 1 / 120, 0.137]) {
    const race = new Race(makeTrack(0), 0, "trial");
    advance(race, 4.62, idle, step);
    advance(race, 0.59, press, step);
    assert.equal(race.launch.resolved, true);
    assert.equal(race.launch.success, true);
    assert(Math.abs(race.launch.level - 0.725) < 1e-10);
    assert(Math.abs(race.time - 0.01) < 1e-10);
    assert(race.player.surge > 1.78 && race.player.surge < 1.8);
  }
});

test("held throttle produces a normal start without launch or repeated rewards", () => {
  const race = new Race(makeTrack(0), 0, "trial");
  race.update(5.2, press);
  assert.equal(race.launch.success, false);
  assert.equal(race.player.surge, 0);
  assert.equal(race.player.speed, 0);
  race.update(1 / 120, press);
  assert(race.player.speed > 0);
  assert.equal(race.player.boost, 0);
  assert.equal(race.player.surge, 0);
});
