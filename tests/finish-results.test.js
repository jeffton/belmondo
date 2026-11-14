import test from "node:test";
import assert from "node:assert/strict";
import { Race, LAPS_BY_CLASS } from "../src/race.js";
import { makeTrack, TRACK_INDEX } from "../src/track.js";
import { AudioEngine } from "../src/audio.js";

function place(track, racer, s, speed = 80) {
  const frame = track.frame(s);
  racer.lap = Math.floor((s - track.finishS) / track.length) + 1;
  racer.s = racer.contactS = s;
  racer.gate = Math.floor(((s - track.finishS) / track.length) * 32) + 1;
  racer.checkpoint = { s, branch: 0, gate: racer.gate };
  racer.position.copy(frame.p);
  racer.position.y += 2.2;
  racer.velocity.copy(frame.tangent).multiplyScalar(speed);
  racer.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
  racer.grounded = true;
}

function recorder() {
  const audio = new AudioEngine();
  audio.started = true;
  audio.context = { currentTime: 0 };
  const spoken = [];
  audio.announce = (key, priority) => spoken.push({ key, priority });
  return { audio, spoken };
}

for (let rank = 1; rank <= 8; rank++) {
  test(`earned finish announces final field rank ${rank} once`, () => {
    const track = makeTrack(TRACK_INDEX.COAST);
    const race = new Race(track, 0, "race", 2);
    race.countdown = 0;
    const line = track.finishS + race.lapCount * track.length;
    // Earlier finishers must earn their terminal positions by crossing the
    // real plane; merely placing an active body beyond it is not a finish.
    for (const racer of race.racers.slice(1, rank)) {
      place(track, racer, line - 0.1);
      race.update(1 / 120, {});
      assert(racer.finished);
    }
    place(track, race.player, line - 0.1);
    for (const racer of race.racers.slice(rank))
      if (racer !== race.player)
        place(track, racer, line - 100 - racer.id * 20);
    for (let step = 0; step < 120 && !race.finished; step++)
      race.update(1 / 120, {});
    assert(race.finished);
    assert.equal(race.player.lap, race.lapCount + 1);
    assert.equal(race.position, rank);
    const events = race.events.filter((event) => event.kind === "finish");
    assert.equal(events.length, 1);
    const { audio, spoken } = recorder();
    audio.raceEvent(events[0], race, race.lapCount);
    audio.raceEvent(events[0], race, race.lapCount);
    assert.deepEqual(spoken, [{ key: `voice:result:${rank}`, priority: 4 }]);
    race.update(1, {});
    assert.equal(
      race.events.filter((event) => event.kind === "finish").length,
      1,
    );
  });
}

test("finish rank is captured after the later AI update, including a shared finish step", () => {
  const track = makeTrack(TRACK_INDEX.COAST);
  const race = new Race(track, 0, "race", 2);
  race.countdown = 0;
  const line = track.finishS + race.lapCount * track.length;
  place(track, race.player, line - 0.1, 80);
  place(track, race.racers[1], line - 0.11, 160);
  for (const racer of race.racers.slice(2))
    place(track, racer, line - 100 - racer.id * 20);
  assert.equal(race.position, 1, "player leads before the final update");
  race.update(1 / 120, {});
  assert(race.finished);
  assert.equal(
    race.racers[1].lap,
    race.lapCount + 1,
    "AI crosses in the same step",
  );
  assert.equal(race.position, 2);
  const { audio, spoken } = recorder();
  const event = race.events.find((event) => event.kind === "finish");
  audio.raceEvent(event, race, race.lapCount);
  assert.deepEqual(
    spoken,
    [{ key: "voice:result:2", priority: 4 }],
    "voice reads final player placement after the full simulation update",
  );
});

test("trial uses its actual rank one; mute consumes the result without replay", () => {
  const track = makeTrack(TRACK_INDEX.COAST);
  const race = new Race(track, 0, "trial", 2);
  race.countdown = 0;
  place(track, race.player, track.finishS + race.lapCount * track.length - 0.1);
  race.update(1 / 120, {});
  assert(race.finished);
  const event = race.events.find((event) => event.kind === "finish");
  const first = recorder();
  first.audio.raceEvent(event, race, race.lapCount);
  assert.deepEqual(first.spoken, [{ key: "voice:result:1", priority: 4 }]);
  const second = recorder();
  second.audio.muted = true;
  second.audio.raceEvent(event, race, race.lapCount);
  second.audio.muted = false;
  second.audio.raceEvent(event, race, race.lapCount);
  assert.deepEqual(second.spoken, []);
});

test("AI final crossing cannot emit a player finish result", () => {
  const track = makeTrack(TRACK_INDEX.COAST);
  const race = new Race(track, 0, "race", 2);
  race.countdown = 0;
  place(
    track,
    race.racers[1],
    track.finishS + race.lapCount * track.length - 0.1,
  );
  race.update(1 / 120, {});
  assert.equal(race.racers[1].lap, race.lapCount + 1);
  assert(!race.finished);
  assert(!race.events.some((event) => event.kind === "finish"));
});

test("each speed class completes its configured lap count and final-lap voice", () => {
  for (const [speedClass, lapCount] of LAPS_BY_CLASS.entries()) {
    const track = makeTrack(TRACK_INDEX.COAST);
    const race = new Race(track, 0, "trial", speedClass);
    race.countdown = 0;
    const line = track.finishS + lapCount * track.length;
    place(track, race.player, line - 0.1);
    race.update(1 / 120, {});
    assert(
      race.finished,
      `class ${speedClass} finishes after ${lapCount} laps`,
    );
    assert.equal(race.player.lap, lapCount + 1);
    assert(race.events.some((event) => event.kind === "finish"));
  }
});

test("eliminations announce eliminated rather than their last-place voice", () => {
  const race = new Race(makeTrack(TRACK_INDEX.COAST));
  race.damage(race.player, 200);
  assert(race.player.eliminated);
  const event = race.events.find((entry) => entry.kind === "finish");
  const { audio, spoken } = recorder();
  audio.raceEvent(event, race, race.lapCount);
  assert.deepEqual(spoken, [{ key: "voice:result:eliminated", priority: 4 }]);
});
