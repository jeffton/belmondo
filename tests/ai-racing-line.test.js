import { test } from "node:test";
import assert from "node:assert/strict";
import { racingLine, followingBrake } from "../src/ai-racing-line.js";

test("closing traffic requests real braking, but a clear adjacent passing lane does not", () => {
  assert(followingBrake([{ front: 10, lane: 0, closing: 20 }], 0, 1.2) > 0);
  assert.equal(
    followingBrake([{ front: 10, lane: 7, closing: 20 }], 0, 1.2),
    0,
  );
  assert.equal(
    followingBrake([{ front: 10, lane: 0, closing: -2 }], 0, 1.2),
    0,
  );
});

function driver(id = 1) {
  return { id, contactS: 100, aiLane: 0 };
}

test("a blocked driver selects clear passing space instead of tracking the leader", () => {
  const racer = driver();
  const traffic = [
    { front: 35, lane: 0 },
    { front: 10, lane: -7 },
  ];
  for (let i = 0; i < 120; i++) racingLine(racer, traffic, 18, 0, 1 / 120);
  assert(racer.aiLane > 4);
  const chosen = racer.aiPassLane;
  racingLine(racer, [{ front: 36, lane: 0.1 }], 18, 0, 1 / 120);
  assert.equal(racer.aiPassLane, chosen);
});

test("passing respects a neighbouring hull and a narrow road", () => {
  const racer = driver();
  racer.aiPassLane = 7;
  racer.aiPassTime = 1;
  const traffic = [{ front: 1, lane: 7 }];
  for (let i = 0; i < 120; i++) racingLine(racer, traffic, 10, 0, 1 / 120);
  assert(racer.aiLane <= 3);
  assert(racer.aiLane >= -5);
});

test("a displaced driver does not cross an alongside hull to regain its target", () => {
  const racer = driver();
  racer.aiLane = 6;
  racer.aiPassLane = 6;
  racer.aiPassTime = 1;
  const lane = racingLine(racer, [{ front: 0, lane: 0 }], 18, 0, 1 / 120, -6);
  assert(lane < 0);
});

test("drivers maintain distinct cruising lines and return after a completed pass", () => {
  const drivers = Array.from({ length: 7 }, (_, i) => driver(i + 1));
  for (let i = 0; i < 360; i++) {
    for (const racer of drivers) racingLine(racer, [], 18, 0, 1 / 120);
  }
  assert(
    Math.max(...drivers.map((r) => r.aiLane)) -
      Math.min(...drivers.map((r) => r.aiLane)) >
      5,
  );
  const racer = driver();
  racingLine(racer, [{ front: 30, lane: 0 }], 18, 0, 1 / 120);
  for (let i = 0; i < 360; i++) racingLine(racer, [], 18, 0, 1 / 120);
  assert.equal(racer.aiPassTime, 0);
  assert(Math.abs(racer.aiLane) < 5);
});

test("real connected fork lanes sense opposite-branch traffic but not separated decks", async () => {
  const { makeTrack } = await import("../src/track.js");
  const { Race } = await import("../src/race.js");

  function approach(condition) {
    const track = makeTrack(0);
    const s = (track.config.split[0] + 0.0001) * track.length;
    assert(track.bounds(s, -1).connected);
    assert(track.bounds(s + 15, 1).connected);
    if (condition === "disconnected") {
      const bounds = track.bounds.bind(track);
      track.bounds = (...args) => ({ ...bounds(...args), connected: false });
    }
    const race = new Race(track, 0, "race", 0);
    race.countdown = 0;
    race.racers = race.racers.slice(1, 3);
    race.player = race.racers[0];
    for (const [index, racer] of race.racers.entries()) {
      racer.contactS = racer.s = s + index * 15;
      racer.branch = index ? 1 : -1;
      const frame = track.frame(racer.s, racer.branch);
      racer.position.copy(frame.p);
      racer.position.y += 2.2 + (condition === "other-deck" && index ? 30 : 0);
      racer.velocity.set(0, 0, 0);
      racer.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
      racer.aiLane = 0;
      racer.aiFire = Infinity;
    }
    race.update(1 / 120, {});
    return race.player.aiPassTime;
  }

  assert(approach("connected") > 0, "the opposite-branch leader is sensed");
  assert.equal(approach("disconnected"), 0, "separated lanes are excluded");
  assert.equal(
    approach("other-deck"),
    0,
    "vertically separated traffic is excluded",
  );
});
