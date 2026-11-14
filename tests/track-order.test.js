import { test } from "node:test";
import assert from "node:assert/strict";
import { TRACKS, TRACK_INDEX } from "../src/track.js";
import { trackIsUnlocked, trackProgress } from "../src/progression.js";

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
