import test from "node:test";
import assert from "node:assert/strict";
import { createCircuitTestAccess } from "../src/circuit-test-access.ts";

test("the five-tap opt-in only enables its current page instance", () => {
  const changes = [];
  const access = createCircuitTestAccess((value) => changes.push(value));
  assert.equal(access.enabled, false);
  for (let i = 0; i < 4; i++) access.tapLogo();
  assert.equal(access.enabled, false);
  access.tapLogo();
  assert.equal(access.enabled, true);
  assert.equal(createCircuitTestAccess().enabled, false);
  access.toggle();
  assert.deepEqual(changes, [true, false]);
});
