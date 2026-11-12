import test from "node:test";
import assert from "node:assert/strict";
import { Race, LAPS } from "../src/race.js";
import { makeTrack } from "../src/track.js";
import { AudioEngine } from "../src/audio.js";

function place(track, racer, s, speed = 80) {
  const frame = track.frame(s);
  racer.lap = Math.floor(s / track.length) + 1;
  racer.s = racer.contactS = s;
  racer.gate = Math.floor((s / track.length) * 32) + 1;
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
    const track = makeTrack(0);
    const race = new Race(track);
    race.countdown = 0;
    const line = LAPS * track.length;
    place(track, race.player, line - 0.1);
    for (const racer of race.racers.slice(1))
      place(
        track,
        racer,
        racer.id < rank
          ? line + 100 + racer.id * 20
          : line - 100 - racer.id * 20,
      );
    for (let step = 0; step < 120 && !race.finished; step++)
      race.update(1 / 120, {});
    assert(race.finished);
    assert.equal(race.player.lap, LAPS + 1);
    assert.equal(race.position, rank);
    const events = race.events.filter((event) => event.kind === "finish");
    assert.equal(events.length, 1);
    const { audio, spoken } = recorder();
    audio.raceEvent(events[0], race, LAPS);
    audio.raceEvent(events[0], race, LAPS);
    assert.deepEqual(spoken, [{ key: `voice:result:${rank}`, priority: 4 }]);
    race.update(1, {});
    assert.equal(
      race.events.filter((event) => event.kind === "finish").length,
      1,
    );
  });
}

test("finish rank is captured after the later AI update, including a shared finish step", () => {
  const track = makeTrack(0);
  const race = new Race(track);
  race.countdown = 0;
  const line = LAPS * track.length;
  place(track, race.player, line - 0.1, 80);
  place(track, race.racers[1], line - 0.11, 160);
  for (const racer of race.racers.slice(2))
    place(track, racer, line - 100 - racer.id * 20);
  assert.equal(race.position, 1, "player leads before the final update");
  race.update(1 / 120, {});
  assert(race.finished);
  assert.equal(race.racers[1].lap, LAPS + 1, "AI crosses in the same step");
  assert.equal(race.position, 2);
  const { audio, spoken } = recorder();
  const event = race.events.find((event) => event.kind === "finish");
  audio.raceEvent(event, race, LAPS);
  assert.deepEqual(
    spoken,
    [{ key: "voice:result:2", priority: 4 }],
    "voice reads final player placement after the full simulation update",
  );
});

test("trial uses its actual rank one; mute consumes the result without replay", () => {
  const track = makeTrack(0);
  const race = new Race(track, 0, "trial");
  race.countdown = 0;
  place(track, race.player, LAPS * track.length - 0.1);
  race.update(1 / 120, {});
  assert(race.finished);
  const event = race.events.find((event) => event.kind === "finish");
  const first = recorder();
  first.audio.raceEvent(event, race, LAPS);
  assert.deepEqual(first.spoken, [{ key: "voice:result:1", priority: 4 }]);
  const second = recorder();
  second.audio.muted = true;
  second.audio.raceEvent(event, race, LAPS);
  second.audio.muted = false;
  second.audio.raceEvent(event, race, LAPS);
  assert.deepEqual(second.spoken, []);
});

test("AI final crossing cannot emit a player finish result", () => {
  const track = makeTrack(0);
  const race = new Race(track);
  race.countdown = 0;
  place(track, race.racers[1], LAPS * track.length - 0.1);
  race.update(1 / 120, {});
  assert.equal(race.racers[1].lap, LAPS + 1);
  assert(!race.finished);
  assert(!race.events.some((event) => event.kind === "finish"));
});
