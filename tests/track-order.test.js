import { test } from "node:test";
import assert from "node:assert/strict";
import { TRACKS, TRACK_INDEX } from "../src/track.ts";
import {
  loadProgression,
  speedClassIsUnlocked,
  trackIsUnlocked,
  trackProgress,
} from "../src/progression.ts";
import { localRecordKey } from "../src/records.ts";
import { SPEED_CLASSES } from "../src/speed-classes.ts";

const previousLayoutIds = [
  "whiteout-2-finish-end",
  "monsoon-4-finish-end",
  "coast-4-finish-end",
  "solar-4-finish-end",
  "faultline-1-finish-end",
  "cinderline-2-finish-end",
  "noctilucent-4-finish-end",
  "vesper-1-finish-end",
];
const previousTracks = previousLayoutIds.map((layoutId) => ({ layoutId }));
const readSave = (data) =>
  loadProgression({ getItem: () => JSON.stringify(data) });

test("course menu swaps only PALM BREAKER and WHITEOUT, keeping their record IDs", () => {
  assert.deepEqual(
    TRACKS.map(({ name, layoutId }) => [name, layoutId]),
    [
      ["PALM BREAKER", previousLayoutIds[2]],
      ["MONSOON", previousLayoutIds[1]],
      ["WHITEOUT", previousLayoutIds[0]],
      ["SOLAR ARRAY", previousLayoutIds[3]],
      ["FAULTLINE", previousLayoutIds[4]],
      ["CINDERLINE", previousLayoutIds[5]],
      ["NOCTILUCENT", previousLayoutIds[6]],
      ["VESPER CIRCUIT", previousLayoutIds[7]],
    ],
  );
  assert.equal(TRACKS[0].subtitle, "01 / Sunshine air coast");
  assert.equal(TRACKS[2].subtitle, "03 / Polar observatory");
  const key = (layoutId) =>
    localRecordKey(layoutId, 1, "trial", SPEED_CLASSES[2], 5);
  const savedTimes = new Map([
    [key(previousLayoutIds[0]), 78.25],
    [key(previousLayoutIds[2]), 84.5],
  ]);
  assert.equal(savedTimes.get(key(TRACKS[TRACK_INDEX.COAST].layoutId)), 84.5);
  assert.equal(
    savedTimes.get(key(TRACKS[TRACK_INDEX.WHITEOUT].layoutId)),
    78.25,
  );
});

test("legacy v1 and v2 saves keep the same accessible courses and speed classes", () => {
  // Include sparse wins and inherited course access, not just complete prefixes.
  for (let mask = 0; mask < 1 << previousTracks.length; mask++) {
    for (const version of [1, 2]) {
      const save = { version, classes: {} };
      for (const [i, { id }] of SPEED_CLASSES.entries()) {
        if (version === 1 && id === "c4") continue;
        save.classes[id] = Object.fromEntries(
          previousLayoutIds.map((layoutId, index) => {
            const won = Boolean(
              mask & (1 << ((index + i) % previousTracks.length)),
            );
            return [layoutId, { bestPosition: won ? 1 : 2 + i, won }];
          }),
        );
      }
      if (version === 2)
        save.unlocked = {
          c1: [previousLayoutIds[5]],
          c3: [previousLayoutIds[6]],
        };
      const loaded = readSave(save);
      const before = JSON.stringify(loaded);
      for (const { id } of SPEED_CLASSES) {
        const available = (courses) =>
          courses
            .filter(({ layoutId }, index) =>
              trackIsUnlocked(loaded, id, layoutId, index, courses),
            )
            .map(({ layoutId }) => layoutId)
            .sort();
        assert.deepEqual(available(TRACKS), available(previousTracks));
        assert.equal(
          speedClassIsUnlocked(loaded, id, TRACKS, false),
          speedClassIsUnlocked(loaded, id, previousTracks, false),
        );
      }
      assert.deepEqual(loaded.classes, save.classes);
      assert.equal(JSON.stringify(loaded), before);
    }
  }
});

const accessible = (data, classId, index) =>
  trackIsUnlocked(data, classId, TRACKS[index].layoutId, index, TRACKS);

test("difficulty progression opens three courses, then requires all earlier class wins", () => {
  const data = { version: 1, classes: { c1: {} } };
  for (let index = 0; index < TRACKS.length; index++)
    assert.equal(accessible(data, "c1", index), index < 3);
  for (const track of TRACKS.slice(0, 3))
    data.classes.c1[track.layoutId] = { bestPosition: 1, won: true };
  assert(accessible(data, "c1", TRACK_INDEX.SOLAR));
  assert(!accessible(data, "c1", TRACK_INDEX.CINDERLINE));
  assert(!accessible(data, "c2", TRACK_INDEX.SOLAR));
});

test("stored wins and medals retain their actual course after canonical reordering", () => {
  const data = {
    version: 1,
    classes: {
      c1: {
        "coast-4-finish-end": { bestPosition: 1, won: true },
        "solar-4-finish-end": { bestPosition: 2, won: false },
        "noctilucent-4-finish-end": { bestPosition: 3, won: false },
      },
    },
  };
  const before = JSON.stringify(data);
  for (let index = 0; index < TRACKS.length; index++)
    accessible(data, "c1", index);
  assert.equal(
    trackProgress(data, "c1", TRACKS[TRACK_INDEX.COAST].layoutId).bestPosition,
    1,
  );
  assert.equal(
    trackProgress(data, "c1", TRACKS[TRACK_INDEX.SOLAR].layoutId).bestPosition,
    2,
  );
  assert.equal(
    trackProgress(data, "c1", TRACKS[TRACK_INDEX.NOCTILUCENT].layoutId)
      .bestPosition,
    3,
  );
  assert.equal(
    trackProgress(data, "c1", TRACKS[TRACK_INDEX.WHITEOUT].layoutId),
    null,
  );
  assert.equal(JSON.stringify(data), before);
});
