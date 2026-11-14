import test from "node:test";
import assert from "node:assert/strict";
import { Race } from "../src/race.js";
import { makeTrack, TRACKS } from "../src/track.js";

function approach(race, racer, distance = 2) {
  const s = race.track.finishS + race.lapCount * race.track.length - distance;
  const frame = race.track.frame(s);
  racer.lap = race.lapCount;
  racer.gate = race.lapCount * 32;
  racer.s = racer.contactS = s;
  racer.x = 0;
  racer.branch = 0;
  racer.position.copy(frame.p);
  racer.position.y += 2.2;
  racer.speed = 100 * race.classSpec.pace;
  racer.velocity.copy(frame.tangent).multiplyScalar(racer.speed);
  racer.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
  racer.yawRate = racer.pitchTrim = racer.stun = 0;
  racer.grounded = true;
  racer.checkpoint = { s, branch: 0, gate: racer.gate };
}

function cross(race, racer) {
  for (let i = 0; i < 20 && !racer.finished; i++) race.update(1 / 120, {});
  assert(racer.finished, "near-line fixture earns a real swept final crossing");
}

function results(race) {
  return JSON.stringify({
    resultTime: race.resultTime,
    resultPosition: race.resultPosition,
    bestLap: race.bestLap,
    laps: race.laps,
    lapStart: race.lapStart,
    finishers: race.finishers.map((r) => [
      r.id,
      r.finishTime,
      r.finalPosition,
      r.lap,
      r.gate,
      r.shield,
    ]),
    eliminations: race.eliminations.map((r) => [
      r.id,
      r.eliminationTime,
      r.finalPosition,
    ]),
  });
}

for (const [course, config] of TRACKS.entries()) {
  for (let speedClass = 0; speedClass < 3; speedClass++) {
    test(`${config.name} class ${speedClass}: real finish continues beyond another full lap without changing results`, () => {
      const race = new Race(makeTrack(course), 1, "trial", speedClass);
      race.countdown = 0;
      approach(race, race.player);
      const before = race.player.position.clone();
      cross(race, race.player);
      assert(race.complete);
      assert(race.player.speed > 50, "crossing keeps momentum");
      assert(race.player.position.distanceTo(before) < 5);
      const snapshot = results(race);
      const finishTime = race.time;
      const start = race.player.contactS;
      const previous = race.player.position.clone();
      // Real final-plane crossing above, then visual autopilot at 30 Hz. Cover
      // every section, split, crest and jump after the result is already final.
      while (race.player.contactS < start + race.track.length * 1.1) {
        race.update(1 / 30, { throttle: 0, steer: 1, airLeft: 1 });
        const r = race.player;
        assert(r.position.toArray().every(Number.isFinite));
        assert(
          r.position.distanceTo(previous) < 20,
          "no teleport at a split or wrap",
        );
        previous.copy(r.position);
        const bounds = race.track.bounds(r.contactS, r.branch);
        assert(r.x >= bounds.wallMin && r.x <= bounds.wallMax);
      }
      assert.equal(results(race), snapshot);
      assert.equal(
        race.time,
        finishTime,
        "completed event clock remains final",
      );
      assert.equal(race.events.filter((e) => e.kind === "finish").length, 1);
      assert.equal(
        race.events.length,
        1,
        "cooldown cannot trigger pickups, laps or hits",
      );
      assert.equal(race.player.weapon, null);
    });
  }
}

test("AI finishers leave the line while the player races; player then continues through the result screen", () => {
  const race = new Race(makeTrack(0), 0, "race");
  race.countdown = 0;
  const npc = race.racers[1];
  approach(race, npc);
  cross(race, npc);
  assert(!race.finished);
  const npcStart = npc.position.clone();
  for (let i = 0; i < 120; i++) race.update(1 / 120, { throttle: 1 });
  assert(npc.position.distanceTo(npcStart) > 50);
  approach(race, race.player);
  cross(race, race.player);
  assert.equal(race.resultPosition, 2);
  const snapshot = results(race);
  const playerStart = race.player.position.clone();
  for (let i = 0; i < 120; i++) race.update(1 / 120, {});
  assert(race.player.position.distanceTo(playerStart) > 50);
  assert.equal(results(race), snapshot);
  assert(!race.complete, "unfinished field still races");
});

test("finished hulls cannot block or damage an unfinished ship; eliminated ships stay stopped", () => {
  const track = makeTrack(0);
  const race = new Race(track);
  race.countdown = 0;
  const finisher = race.racers[1];
  approach(race, finisher);
  cross(race, finisher);
  const dead = race.racers[2];
  race.eliminate(dead);
  const deadPosition = dead.position.clone();
  const deadResult = dead.finalPosition;
  // Put an unfinished player exactly inside the finished hull. Compare a
  // physically identical race without that rendered hull in the same place.
  approach(race, race.player, 20);
  finisher.contactS = race.player.contactS;
  finisher.x = race.player.x;
  finisher.position.copy(race.player.position);
  finisher.finishOffset.set(0, 0, 0);
  const control = new Race(track);
  control.countdown = 0;
  approach(control, control.player, 20);
  for (const npc of control.racers.slice(1)) control.eliminate(npc);
  race.update(1 / 120, { throttle: 1 });
  control.update(1 / 120, { throttle: 1 });
  assert(race.player.position.distanceTo(control.player.position) < 1e-9);
  assert.equal(race.player.shield, control.player.shield);
  for (let i = 0; i < 120; i++) race.update(1 / 120, {});
  assert(dead.position.equals(deadPosition));
  assert.equal(dead.velocity.length(), 0);
  assert.equal(dead.finalPosition, deadResult);
  assert(!dead.finished);
});

test("all eight finishers keep circulating after the last crossing, with frozen order and no pile at the line", () => {
  const race = new Race(makeTrack(0));
  race.countdown = 0;
  for (const racer of [...race.racers.slice(1), race.player]) {
    approach(race, racer);
    cross(race, racer);
    // Leave space between earned finishes, rather than teleporting all hulls
    // to the same fixture in one physics step.
    for (let i = 0; i < 60; i++) race.update(1 / 120, {});
  }
  assert(race.complete);
  assert.equal(race.resultPosition, 8);
  const snapshot = results(race);
  const starts = race.racers.map((r) => r.position.clone());
  const startS = race.player.contactS;
  const branches = new Set();
  while (race.player.contactS < startS + race.track.length * 1.1) {
    const positions = race.racers.map((r) => r.position.clone());
    race.update(1 / 30, {});
    for (const racer of race.racers) {
      branches.add(racer.branch);
      assert(racer.position.distanceTo(positions[racer.id]) < 20);
      assert(racer.position.toArray().every(Number.isFinite));
    }
  }
  assert(
    branches.has(-1) && branches.has(1),
    "cooldown follows both fork routes",
  );
  for (const racer of race.racers) {
    assert(racer.position.distanceTo(starts[racer.id]) > 50);
    assert(racer.speed > 0);
  }
  assert.equal(results(race), snapshot);
});
