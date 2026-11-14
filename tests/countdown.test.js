import test from "node:test";
import assert from "node:assert/strict";
import { countdownBoardStage } from "../src/start-gantry.js";
import { Race } from "../src/race.js";
import { makeTrack, TRACK_INDEX } from "../src/track.js";

test("race clock crosses each physical countdown stage once, with no wall timer", () => {
  const race = new Race(makeTrack(TRACK_INDEX.COAST), 0, "trial");
  let previous = countdownBoardStage(race);
  const announcements = [];
  const tick = () => {
    const stage = countdownBoardStage(race);
    if (stage !== previous) announcements.push(stage);
    previous = stage;
  };
  // Five seconds of real race updates, plus half a second paused, includes
  // the two-second armed approach and all three spoken countdown stages.
  for (let frame = 0; frame < 660; frame++) {
    // Pausing is the main loop withholding race updates. Rendering continues.
    if (frame < 100 || frame >= 160) race.update(1 / 120, {});
    tick();
  }
  assert.deepEqual(announcements, [3, 2, 1]);
  while (race.countdown > 0) {
    race.update(1 / 120, {});
    tick();
  }
  for (let frame = 0; frame < 120; frame++) tick();
  assert.deepEqual(announcements, [3, 2, 1, "GO"]);
  assert.equal(countdownBoardStage({ countdown: 3.00001 }), "armed");
  for (const countdown of [3, 2, 1])
    assert.equal(countdownBoardStage({ countdown }), countdown);
  assert.equal(countdownBoardStage({ countdown: 0, time: 0 }), "GO");
  assert.equal(countdownBoardStage({ countdown: 0, time: 1.2 }), "idle");
});
