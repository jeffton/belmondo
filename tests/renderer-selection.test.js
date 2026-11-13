import test from "node:test";
import assert from "node:assert/strict";
import { selectedRenderer, rendererURL } from "../src/renderer-selection.js";

const storage = (value) => ({ getItem: () => value });

test("WebGL stays the explicit default and WebGPU requires selection", () => {
  assert.equal(selectedRenderer(storage(null), ""), "webgl");
  assert.equal(selectedRenderer(storage("webgpu"), ""), "webgpu");
  assert.equal(selectedRenderer(storage("webgpu"), "?renderer=webgl"), "webgl");
  assert.equal(
    selectedRenderer(storage("webgl"), "?renderer=webgpu"),
    "webgpu",
  );
});

test("changing backend preserves the rest of the address and never navigates to a new origin", () => {
  assert.equal(
    rendererURL(
      "webgl",
      "https://belmondo.roybot.se/?renderer=webgpu&test=1#craft",
    ),
    "https://belmondo.roybot.se/?renderer=webgl&test=1#craft",
  );
});
