import test from "node:test";
import assert from "node:assert/strict";
import { TRACKS } from "../src/track.ts";
import { SPEED_CLASSES } from "../src/speed-classes.ts";
import {
  PROGRESSION_STORAGE_KEY,
  loadProgression,
  recordProgressionResult,
  trackIsUnlocked,
  trackProgress,
} from "../src/progression.ts";

const tracks = Array.from({ length: 8 }, (_, index) => ({
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
    [true, true, true, false, false, false, false, false],
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

const originalLayouts = [
  "whiteout-2-finish-end",
  "monsoon-4-finish-end",
  "coast-4-finish-end",
  "solar-4-finish-end",
  "cinderline-2-finish-end",
  "noctilucent-4-finish-end",
  "vesper-1-finish-end",
];

function storageFor(progression) {
  return {
    getItem: (key) =>
      key === PROGRESSION_STORAGE_KEY ? JSON.stringify(progression) : null,
  };
}

test("inserting FAULTLINE preserves every previously open course without inventing wins", () => {
  // Exercise every old unlock boundary, independently in every speed class.
  for (let wonCount = 0; wonCount <= originalLayouts.length; wonCount++) {
    const old = { version: 1, classes: {} };
    for (const [classIndex, { id }] of SPEED_CLASSES.entries()) {
      const count = Math.max(0, wonCount - classIndex);
      old.classes[id] = Object.fromEntries(
        originalLayouts
          .slice(0, count)
          .map((layoutId) => [layoutId, { bestPosition: 1, won: true }]),
      );
    }
    const migrated = loadProgression(storageFor(old));
    assert.equal(migrated.version, 2);
    assert.deepEqual(migrated.classes, old.classes);
    for (const { id } of SPEED_CLASSES) {
      for (const [oldIndex, layoutId] of originalLayouts.entries()) {
        const previouslyOpen =
          oldIndex < 3 ||
          originalLayouts
            .slice(0, oldIndex)
            .every((previous) => old.classes[id][previous]?.won);
        const index = TRACKS.findIndex((track) => track.layoutId === layoutId);
        assert(index >= 0, `${layoutId} keeps its identity`);
        assert.equal(
          trackIsUnlocked(migrated, id, layoutId, index, TRACKS),
          previouslyOpen,
          `${id}: ${layoutId}, ${wonCount} old wins`,
        );
      }
      const index = TRACKS.findIndex((track) => track.name === "FAULTLINE");
      assert(index >= 0);
      const layoutId = TRACKS[index].layoutId;
      assert.equal(trackProgress(migrated, id, layoutId), null);
      assert.equal(
        trackIsUnlocked(migrated, id, layoutId, index, TRACKS),
        TRACKS.slice(0, index).every(
          (track) => old.classes[id][track.layoutId]?.won,
        ),
      );
    }
    assert.deepEqual(loadProgression(storageFor(migrated)), migrated);
  }
});

test("fresh progression unlocks all eight in course order rather than inheriting veteran access", () => {
  const progression = loadProgression({ getItem: () => null });
  assert.equal(progression.version, 2);
  for (let index = 0; index < TRACKS.length; index++) {
    const track = TRACKS[index];
    assert(trackIsUnlocked(progression, "c1", track.layoutId, index, TRACKS));
    if (index >= 3 && index + 1 < TRACKS.length)
      assert(
        !trackIsUnlocked(
          progression,
          "c1",
          TRACKS[index + 1].layoutId,
          index + 1,
          TRACKS,
        ),
      );
    recordProgressionResult(progression, result(), { config: track });
  }
  assert.equal(Object.keys(progression.classes.c1).length, 8);
  assert(!trackIsUnlocked(progression, "c2", TRACKS[3].layoutId, 3, TRACKS));
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
