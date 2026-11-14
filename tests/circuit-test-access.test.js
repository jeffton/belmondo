import test from "node:test";
import assert from "node:assert/strict";
import {
  createCircuitTestAccess,
  TEST_ACCESS_KEY,
} from "../src/circuit-test-access.js";

function storage(values = {}) {
  return {
    values,
    getItem(key) {
      return values[key] ?? null;
    },
    setItem(key, value) {
      values[key] = value;
    },
  };
}

test("secret gesture is local opt-in, persists, and never touches saved results", () => {
  const saved = storage({
    "nv-progression": '{"classes":{}}',
    "nv-records": '{"old":42}',
  });
  const changes = [];
  const access = createCircuitTestAccess(saved, (value) => changes.push(value));
  assert.equal(access.enabled, false);
  for (let i = 0; i < 4; i++) access.tapLogo();
  assert.equal(access.enabled, false);
  access.tapLogo();
  assert.equal(access.enabled, true);
  assert.equal(createCircuitTestAccess(saved).enabled, true);
  access.toggle();
  assert.equal(saved.values[TEST_ACCESS_KEY], "off");
  assert.deepEqual(changes, [true, false]);
  assert.equal(saved.values["nv-records"], '{"old":42}');
  assert.equal(saved.values["nv-progression"], '{"classes":{}}');
});
