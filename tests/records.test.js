import { test } from "node:test";
import assert from "node:assert/strict";
import { localRecordKey } from "../src/records.ts";
import { SPEED_CLASSES } from "../src/speed-classes.ts";
import { TRACKS } from "../src/track.ts";
import { CRAFT } from "../src/race.ts";

test("course insertion keeps existing records attached to their course and never shares FAULTLINE times", () => {
  const originalLayouts = [
    "whiteout-2-finish-end",
    "monsoon-4-finish-end",
    "coast-4-finish-end",
    "solar-4-finish-end",
    "cinderline-2-finish-end",
    "noctilucent-4-finish-end",
    "vesper-1-finish-end",
  ];
  const saved = {};
  for (const layoutId of originalLayouts)
    for (let craft = 0; craft < CRAFT.length; craft++)
      for (const mode of ["race", "trial"])
        for (const [index, speedClass] of SPEED_CLASSES.entries())
          saved[localRecordKey(layoutId, craft, mode, speedClass, index + 3)] =
            Object.keys(saved).length + 1;
  const keys = new Set();
  for (const track of TRACKS)
    for (let craft = 0; craft < CRAFT.length; craft++)
      for (const mode of ["race", "trial"])
        for (const [index, speedClass] of SPEED_CLASSES.entries()) {
          const key = localRecordKey(
            track.layoutId,
            craft,
            mode,
            speedClass,
            index + 3,
          );
          assert(!keys.has(key));
          keys.add(key);
          if (originalLayouts.includes(track.layoutId)) assert(saved[key] > 0);
          else assert.equal(saved[key], undefined);
        }
  assert.equal(keys.size, 8 * CRAFT.length * 2 * SPEED_CLASSES.length);
  assert.equal(
    originalLayouts.filter((layoutId) =>
      TRACKS.some((track) => track.layoutId === layoutId),
    ).length,
    7,
  );
});

test("changed physical pace cannot reuse a class record or collide with another tier", () => {
  const keys = new Set();
  for (const spec of SPEED_CLASSES) {
    const old = `coast-2-0-trial-${spec.id}-5laps`;
    const current = localRecordKey("coast-2", 0, "trial", spec, 5);
    const future = localRecordKey(
      "coast-2",
      0,
      "trial",
      { ...spec, pace: spec.pace + 0.2 },
      5,
    );
    assert.notEqual(current, old);
    assert.notEqual(current, future);
    keys.add(current);
    keys.add(future);
    keys.add(localRecordKey("coast-3", 0, "trial", spec, 5));
    keys.add(localRecordKey("coast-2", 1, "trial", spec, 5));
    keys.add(localRecordKey("coast-2", 0, "race", spec, 5));
    keys.add(localRecordKey("coast-2", 0, "trial", spec, 3));
  }
  assert.equal(keys.size, SPEED_CLASSES.length * 6);
});
