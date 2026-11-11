import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACKS } from "../src/track.js";
import { Race } from "../src/race.js";

const neutral = { throttle: true, brake: false, air: 0, steer: 0 };
function autopilot(race) {
  const p = race.player;
  const curve = race.track.curvature(p.s, p.branch);
  return {
    ...neutral,
    steer: Math.max(
      -1,
      Math.min(
        1,
        -p.x * 0.23 - p.vx * 0.13 + (curve * p.speed * p.speed * 0.25) / 29,
      ),
    ),
    brake: Math.abs(curve) > 0.014 && p.speed > 68,
  };
}
for (const [index, config] of TRACKS.entries()) {
  test(`${config.name}: full race completes, jump lands, routes merge, AI stays finite`, () => {
    const track = makeTrack(index),
      race = new Race(track);
    race.countdown = 0;
    let flew = false,
      landed = false,
      split = false;
    for (let step = 0; step < 120 * 240 && !race.finished; step++) {
      const wasAir = race.player.h > 0;
      race.update(1 / 120, autopilot(race));
      if (race.player.h > 1) flew = true;
      if (wasAir && race.player.h === 0) landed = true;
      if (race.player.branch !== 0) split = true;
      for (const r of race.racers)
        assert(
          Number.isFinite(r.s) && Number.isFinite(r.x) && Number.isFinite(r.h),
        );
    }
    assert(race.finished, "three laps completed within four minutes");
    assert(flew && landed, "ballistic flight and touchdown");
    assert(split, "actual route selected");
    assert.equal(race.laps.length, 3);
    const start = track.frame(0).p,
      end = track.frame(track.length).p;
    assert(start.distanceTo(end) < 0.001);
    const middle = ((config.split[0] + config.split[1]) / 2) * track.length;
    assert(
      track.frame(middle, -1).p.distanceTo(track.frame(middle, 1).p) > 60,
      "routes physically separate",
    );
    assert(
      track
        .frame((config.split[1] + 0.001) * track.length, -1)
        .p.distanceTo(
          track.frame((config.split[1] + 0.001) * track.length, 1).p,
        ) < 0.001,
      "routes reconnect",
    );
  });
}
test("throttle, inertial steering, airbrake, pause-independent fixed simulation", () => {
  const race = new Race(makeTrack(0), 0, "trial");
  race.countdown = 0;
  for (let i = 0; i < 120 * 3; i++) race.update(1 / 120, neutral);
  assert(race.player.speed > 65);
  for (let i = 0; i < 30; i++) race.update(1 / 120, { ...neutral, steer: 1 });
  assert(race.player.vx > 0);
  const vx = race.player.vx;
  race.update(1 / 120, neutral);
  assert(
    race.player.vx > 0 && race.player.vx < vx,
    "lateral velocity persists after release",
  );
  const before = race.player.speed;
  for (let i = 0; i < 120; i++)
    race.update(1 / 120, { ...neutral, brake: true });
  assert(race.player.speed < before);
});
test("one pickup, shield protection, pulse collision, mine owner immunity", () => {
  const race = new Race(makeTrack(0));
  race.countdown = 0;
  const p = race.player;
  p.weapon = "SHIELD";
  race.fire();
  assert.equal(p.weapon, null);
  race.damage(p, 50);
  assert.equal(p.shield, 100);
  p.protect = 0;
  p.weapon = "PULSE";
  race.racers[1].s = p.s + 25;
  race.racers[1].x = p.x;
  const shield = race.racers[1].shield;
  race.fire();
  assert(race.racers[1].shield < shield);
  p.weapon = "MINE";
  race.fire();
  assert.equal(race.mines[0].owner, 0);
  p.weapon = "SURGE";
  race.fire();
  assert(p.surge > 2);
});
for (const boundary of ["start", "end"]) {
  test(`seeker pursues a moving target across the split ${boundary}`, () => {
    const track = makeTrack(0),
      race = new Race(track);
    race.countdown = 0;
    const s = track.config.split[boundary === "start" ? 0 : 1] * track.length;
    const p = race.player,
      target = race.racers[1];
    Object.assign(p, {
      s: s - 100,
      x: 3,
      speed: 100,
      branch: boundary === "start" ? 0 : 1,
      weapon: "SEEKER",
    });
    Object.assign(target, { s: s - 20, x: 3, speed: 100, branch: p.branch });
    race.fire();
    let crossedAlive = false;
    for (let i = 0; i < 240; i++) {
      race.update(1 / 120, neutral);
      const shot = race.shots[0];
      if (shot && shot.s > s && target.shield === 100) {
        crossedAlive = true;
        assert.equal(shot.branch, boundary === "start" ? 1 : 0);
      }
    }
    assert(crossedAlive, "missile crosses the boundary before hitting");
    assert(
      target.shield < 100,
      "locked missile follows the connected route and hits",
    );
    assert.equal(race.shots.length, 0);
  });
}

test("jump below launch velocity triggers rescue rather than falling forever", () => {
  const track = makeTrack(0),
    race = new Race(track, 0, "trial");
  race.countdown = 0;
  race.player.s = (track.config.jump + 0.005) * track.length;
  for (let i = 0; i < 120 * 3; i++)
    race.update(1 / 120, { throttle: false, brake: false, air: 0, steer: 0 });
  assert(race.player.s > (track.config.jump + 0.016) * track.length);
  assert(race.player.h >= 0);
});
