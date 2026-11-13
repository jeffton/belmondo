import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { MenuPreview } from "../src/menu-preview.js";
import { makeTrack, TRACKS } from "../src/track.js";
import { createCraft } from "../src/craft.js";

const rect = (left, top, width, height) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

function fixture() {
  const calls = [];
  const target = {
    name: "original-target",
    viewport: new THREE.Vector4(20, 30, 40, 50),
    scissor: new THREE.Vector4(60, 70, 80, 90),
    scissorTest: true,
  };
  const renderer = {
    autoClear: true,
    target,
    cube: 3,
    mip: 2,
    viewport: new THREE.Vector4(1, 2, 3, 4),
    scissor: new THREE.Vector4(5, 6, 7, 8),
    scissorTest: false,
    domElement: { getBoundingClientRect: () => rect(10, 20, 1000, 600) },
    getRenderTarget() {
      return this.target;
    },
    getActiveCubeFace() {
      return this.cube;
    },
    getActiveMipmapLevel() {
      return this.mip;
    },
    getViewport(out) {
      return out.copy(this.viewport);
    },
    getScissor(out) {
      return out.copy(this.scissor);
    },
    getScissorTest() {
      return this.scissorTest;
    },
    getSize(out) {
      return out.set(550, 330);
    },
    setRenderTarget(value, cube = 0, mip = 0) {
      this.target = value;
      this.cube = cube;
      this.mip = mip;
      this.activeViewport = (value ? value.viewport : this.viewport).clone();
      this.activeScissor = (value ? value.scissor : this.scissor).clone();
      this.activeScissorTest = value ? value.scissorTest : this.scissorTest;
    },
    setViewport(...args) {
      if (args[0].isVector4) this.viewport.copy(args[0]);
      else this.viewport.set(...args);
      this.activeViewport = this.viewport.clone();
      calls.push(["viewport", ...this.viewport]);
    },
    setScissor(...args) {
      if (args[0].isVector4) this.scissor.copy(args[0]);
      else this.scissor.set(...args);
      this.activeScissor = this.scissor.clone();
      calls.push(["scissor", ...this.scissor]);
    },
    setScissorTest(value) {
      this.scissorTest = value;
      this.activeScissorTest = value;
    },
    clearDepth() {
      calls.push(["depth"]);
    },
    render() {
      calls.push(["render"]);
    },
  };
  const element = { getBoundingClientRect: () => rect(-90, 120, 400, 200) };
  const preview = new MenuPreview({ renderer }, element);
  preview.setTrack(makeTrack(0));
  return { preview, renderer, calls, target };
}

function approximate(actual, expected) {
  assert.equal(actual[0], expected[0]);
  for (let i = 1; i < expected.length; i++)
    assert.ok(Math.abs(actual[i] - expected[i]) < 1e-8);
}

test("inset clips to canvas at retro size and restores renderer state even on render failure", () => {
  const { preview, renderer, calls, target } = fixture();
  preview.setStage("track");
  renderer.render = () => {
    assert.equal(renderer.autoClear, false);
    assert.equal(renderer.target, null);
    throw new Error("render failed");
  };
  assert.throws(() => preview.draw(0.1), /render failed/);
  approximate(calls[0], ["viewport", -55, 165, 220, 110]);
  approximate(calls[1], ["scissor", 0, 165, 165, 110]);
  assert.equal(renderer.target, target);
  assert.equal(renderer.cube, 3);
  assert.equal(renderer.mip, 2);
  assert.deepEqual(renderer.viewport.toArray(), [1, 2, 3, 4]);
  assert.deepEqual(renderer.scissor.toArray(), [5, 6, 7, 8]);
  assert.equal(renderer.scissorTest, false);
  assert.equal(renderer.autoClear, true);
  assert.deepEqual(renderer.activeViewport, target.viewport);
  assert.deepEqual(renderer.activeScissor, target.scissor);
  assert.equal(renderer.activeScissorTest, target.scissorTest);
  preview.dispose();
});

test("class stage leaves the live World untouched", () => {
  const { preview, calls } = fixture();
  preview.draw(1);
  assert.deepEqual(calls, []);
  preview.dispose();
});

test("all course previews contain actual elevated deck geometry and both split routes", () => {
  const { preview } = fixture();
  for (let i = 0; i < TRACKS.length; i++) {
    const track = makeTrack(i);
    preview.setTrack(track);
    const positions =
      preview.course.children[0].geometry.getAttribute("position");
    const points = new Set();
    let low = Infinity,
      high = -Infinity;
    for (let j = 0; j < positions.count; j++) {
      low = Math.min(low, positions.getY(j));
      high = Math.max(high, positions.getY(j));
      points.add(
        `${positions.getX(j).toFixed(2)},${positions.getY(j).toFixed(2)},${positions.getZ(j).toFixed(2)}`,
      );
    }
    assert.ok(high - low > 20, track.config.name);
    const count = Math.ceil(track.length / 5);
    const u =
      Math.round(
        (track.config.split[0] + track.config.split[1]) * 0.5 * count,
      ) / count;
    for (const branch of [-1, 1]) {
      const f = track.frame(u * track.length, branch);
      const bounds = track.bounds(u * track.length, branch);
      const side = bounds.innerSide === -1 ? 1 : -1;
      const p = f.p
        .clone()
        .addScaledVector(f.right, side < 0 ? bounds.clipMin : bounds.clipMax);
      assert.ok(
        points.has(`${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`),
        `${track.config.name}: branch ${branch}`,
      );
    }
  }
  preview.dispose();
});

test("preview craft caches and disposal never own World's craft resources", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const worldScene = new THREE.Scene();
  const worldCraft = createCraft(worldScene, 0xf04d35, 0);
  let worldDisposals = 0;
  worldCraft.children[0].geometry.addEventListener(
    "dispose",
    () => worldDisposals++,
  );
  const { preview } = fixture();
  const previewResources = new Set();
  for (let i = 0; i < 3; i++) {
    preview.setCraft(i);
    assert.equal(preview.craft.children[0].userData.variant, i);
    assert.equal(preview.craft.children[0].userData.shadow.visible, false);
  }
  const first = preview.crafts.get(0);
  preview.setCraft(0);
  assert.equal(preview.craft, first);
  preview.craftScene.traverse((object) => {
    if (object.geometry) previewResources.add(object.geometry);
    if (object.material) {
      previewResources.add(object.material);
      if (object.material.map) previewResources.add(object.material.map);
    }
  });
  const counts = new Map(
    [...previewResources].map((resource) => [resource, 0]),
  );
  for (const resource of previewResources)
    resource.addEventListener("dispose", () =>
      counts.set(resource, counts.get(resource) + 1),
    );
  preview.dispose();
  assert.ok([...counts.values()].every((count) => count === 1));
  assert.equal(worldDisposals, 0);
});
