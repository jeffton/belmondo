import { test } from "node:test";
import assert from "node:assert/strict";
import { localRecordKey } from "../src/records.js";
import { SPEED_CLASSES } from "../src/speed-classes.js";

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
