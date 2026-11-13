import assert from "node:assert/strict";
import test from "node:test";
import { World } from "../src/world.js";

test("standalone render dimensions follow the full canvas, not the shortened layout viewport", () => {
  const calls = [];
  const world = Object.create(World.prototype);
  world.quality = "retro";
  world.renderer = {
    domElement: { clientWidth: 393, clientHeight: 852 },
    setSize: (...args) => calls.push(args),
  };
  world.camera = { updateProjectionMatrix() {} };
  world.resize();
  assert.deepEqual(calls, [[216, 469, false]]);
  assert.equal(world.camera.aspect, 393 / 852);
  world.renderer.domElement.clientWidth = 852;
  world.renderer.domElement.clientHeight = 393;
  world.resize();
  assert.deepEqual(calls[1], [469, 216, false]);
  assert.equal(world.camera.aspect, 852 / 393);
});
