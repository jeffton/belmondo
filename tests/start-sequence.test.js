import test from "node:test";
import assert from "node:assert/strict";
import { Race } from "../src/race.js";
import { makeTrack, TRACK_INDEX } from "../src/track.js";
import { gridApproachBlend } from "../src/start-sequence.js";
import { countdownBoardStage } from "../src/start-gantry.js";

const released = { throttle: 0, launchIntent: false };
const pressed = { throttle: 1, launchIntent: true };

test("camera approach is two smooth seconds before the untouched launch window", () => {
  const race = new Race(makeTrack(TRACK_INDEX.COAST), 0, "trial");
  const position = race.player.position.clone();
  assert.equal(race.countdown, 5.2);
  assert.equal(gridApproachBlend(race.countdown), 1);
  race.update(1, released);
  assert(Math.abs(gridApproachBlend(race.countdown) - 0.5) < 1e-10);
  assert.equal(
    race.launch.ready,
    true,
    "intro release arms a deliberate press",
  );
  race.update(1, pressed);
  assert.equal(race.countdown, 3.2);
  assert.equal(gridApproachBlend(race.countdown), 0);
  assert.equal(countdownBoardStage(race), "armed");
  assert.equal(race.launch.level, 0, "intro never charges launch boost");
  assert.equal(race.time, 0);
  assert(race.player.position.equals(position));
  race.update(0.2, pressed);
  assert.equal(countdownBoardStage(race), 3);
  assert(Math.abs(race.launch.level - 0.25) < 1e-10);
  assert.equal(gridApproachBlend(0), 0);
});

test("approach expiry and launch charging are independent of frame boundaries and restart", () => {
  for (const step of [1 / 30, 1 / 60, 1 / 120, 0.137]) {
    const race = new Race(makeTrack(TRACK_INDEX.COAST), 0, "trial");
    let elapsed = 0;
    while (elapsed < 2.5) {
      const dt = Math.min(step, 2.5 - elapsed);
      race.update(dt, elapsed < 0.5 ? released : pressed);
      elapsed += dt;
    }
    assert(Math.abs(race.launch.level - 0.625) < 1e-9);
    assert.equal(race.time, 0);
    assert.equal(countdownBoardStage(race), 3);
    const restarted = new Race(race.track, 0, "trial");
    assert.equal(restarted.countdown, 5.2);
    assert.equal(restarted.launch.ready, false);
    assert.equal(restarted.launch.level, 0);
  }
});
