import { test } from "node:test";
import assert from "node:assert/strict";
import { Race } from "../src/race.js";
import { makeTrack, TRACK_INDEX } from "../src/track.js";
import { createTerrain } from "../src/terrain.js";

test("armed Night pack keeps its physical descent without rear-contact rescues", () => {
  const track = makeTrack(TRACK_INDEX.NOCTILUCENT);
  const terrain = createTerrain(track);
  try {
    const race = new Race(track, 0, "race", 1, terrain);
    // Normal countdown, neutral player and unmodified AI/combat. The faster
    // rear ship must leave clearance instead of shoving a Wraith off the crest.
    while (race.time < 110) {
      race.update(1 / 120, { throttle: false });
      assert.equal(race.complete, false, "the live pack keeps advancing time");
      for (const racer of race.racers.slice(1)) {
        assert.notEqual(racer.recoveredThisStep, true, `rescue: ${racer.id}`);
        assert.notEqual(racer.wallTouched, true, `rail: ${racer.id}`);
        assert.equal(racer.eliminated, false, `eliminated: ${racer.id}`);
      }
      race.events.length = 0;
    }
    assert(race.racers.slice(1).every((racer) => racer.lap >= 2));
  } finally {
    terrain.geometries.forEach((geometry) => geometry.dispose());
  }
});
