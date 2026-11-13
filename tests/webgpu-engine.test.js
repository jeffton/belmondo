import test from "node:test";
import assert from "node:assert/strict";
import { MeshLambertMaterial, MeshBasicMaterial, DoubleSide } from "three";
import {
  BelmondoNodeLibrary,
  createWebGPURenderer,
} from "../src/webgpu-engine.js";

test("WebGPU rejects an unavailable API without allocating a WebGL context", async () => {
  await assert.rejects(createWebGPURenderer({}), /WebGPU is unavailable/);
});

test("WebGPU crowd material preserves textured instancing and animated position", () => {
  const source = new MeshLambertMaterial({
    alphaTest: 0.4,
    side: DoubleSide,
    flatShading: true,
  });
  const clock = { value: 3 };
  source.userData.finishCrowdTime = clock;
  const mapped = new BelmondoNodeLibrary().fromMaterial(source);
  assert.ok(mapped.isMeshLambertNodeMaterial);
  assert.ok(mapped.positionNode);
  assert.equal(mapped.alphaTest, 0.4);
  assert.equal(mapped.side, DoubleSide);
  assert.equal(mapped.flatShading, true);
  assert.equal(mapped.userData.finishCrowdTime, clock);
  source.dispose();
  mapped.dispose();
});

test("ordinary scene materials retain Three's standard node mapping", () => {
  const source = new MeshBasicMaterial({
    color: 0xabc123,
    transparent: true,
    opacity: 0.6,
  });
  const mapped = new BelmondoNodeLibrary().fromMaterial(source);
  assert.ok(mapped.isMeshBasicNodeMaterial);
  assert.equal(mapped.positionNode, null);
  assert.equal(mapped.color, source.color);
  assert.equal(mapped.opacity, 0.6);
  assert.equal(mapped.transparent, true);
  source.dispose();
  mapped.dispose();
});
