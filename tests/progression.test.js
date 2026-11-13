import test from "node:test";
import assert from "node:assert/strict";
import {
  PROGRESSION_STORAGE_KEY,
  loadProgression,
  recordProgressionResult,
  trackIsUnlocked,
  trackProgress,
} from "../src/progression.js";

const tracks = Array.from({ length: 7 }, (_, index) => ({
  layoutId: `course-${index}`,
  config: { layoutId: `course-${index}` },
}));
function result({ mode = "race", rank = 1, eliminated = false } = {}) {
  return {
    mode,
    position: rank,
    classSpec: { id: "c1" },
    player: { finished: true, eliminated },
  };
}

test("first three tracks are open and later tracks require every earlier class win", () => {
  const progression = { version: 1, classes: {} };
  assert.deepEqual(
    tracks.map((track, index) =>
      trackIsUnlocked(progression, "c1", track.layoutId, index, tracks),
    ),
    [true, true, true, false, false, false, false],
  );
  progression.classes.c1 = {};
  for (const track of tracks.slice(0, 3))
    progression.classes.c1[track.layoutId] = { bestPosition: 1, won: true };
  assert(trackIsUnlocked(progression, "c1", tracks[3].layoutId, 3, tracks));
  assert(!trackIsUnlocked(progression, "c2", tracks[3].layoutId, 3, tracks));
  assert(!trackIsUnlocked(progression, "c1", tracks[4].layoutId, 4, tracks));
});

test("only combat finishes record class-specific best places and wins", () => {
  const progression = { version: 1, classes: {} };
  assert(recordProgressionResult(progression, result({ rank: 3 }), tracks[0]));
  assert.equal(
    trackProgress(progression, "c1", tracks[0].layoutId).bestPosition,
    3,
  );
  assert.equal(trackProgress(progression, "c1", tracks[0].layoutId).won, false);
  recordProgressionResult(progression, result({ rank: 5 }), tracks[0]);
  assert.equal(
    trackProgress(progression, "c1", tracks[0].layoutId).bestPosition,
    3,
  );
  recordProgressionResult(progression, result({ rank: 1 }), tracks[0]);
  assert.equal(trackProgress(progression, "c1", tracks[0].layoutId).won, true);
  assert.equal(
    trackProgress(progression, "c1", tracks[0].layoutId).bestPosition,
    1,
  );
  assert.equal(
    recordProgressionResult(progression, result({ mode: "trial" }), tracks[1]),
    false,
  );
  assert.equal(
    recordProgressionResult(
      progression,
      result({ rank: 1, eliminated: true }),
      tracks[1],
    ),
    false,
  );
  assert.equal(
    recordProgressionResult(
      progression,
      { ...result(), player: { finished: false, eliminated: false } },
      tracks[1],
    ),
    false,
  );
  assert.equal(trackProgress(progression, "c1", tracks[1].layoutId), null);
});

test("progression uses separate persistent storage and leaves lap-time records intact", () => {
  const values = new Map([["nv-records", '{"legacy-time":12.5}']]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const progression = loadProgression(storage);
  recordProgressionResult(progression, result(), tracks[0]);
  storage.setItem(PROGRESSION_STORAGE_KEY, JSON.stringify(progression));
  assert.equal(values.get("nv-records"), '{"legacy-time":12.5}');
  assert.deepEqual(loadProgression(storage), progression);
});
