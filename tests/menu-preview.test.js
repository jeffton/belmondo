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
  const view = { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2 };
  let bounds = rect(700, 180, 600.5, 500.5);
  const document = { hidden: false, defaultView: view };
  const children = [{ label: "kicker" }, { label: "name" }];
  const element = {
    ownerDocument: document,
    getBoundingClientRect: () => bounds,
    prepend(canvas) {
      children.unshift(canvas);
    },
  };
  const canvas = {
    style: {},
    width: 0,
    height: 0,
    hidden: false,
    getBoundingClientRect: () => bounds,
    setAttribute(name, value) {
      this[name] = value;
    },
    remove() {
      children.splice(children.indexOf(this), 1);
      calls.push("remove");
    },
  };
  const renderer = {
    domElement: canvas,
    info: {
      memory: { geometries: 0, textures: 0 },
      render: { calls: 0, frame: 0 },
    },
    setDrawingBufferSize(width, height, pixelRatio) {
      canvas.width = Math.floor(width * pixelRatio);
      canvas.height = Math.floor(height * pixelRatio);
      calls.push(["resize", width, height, pixelRatio]);
    },
    render() {
      this.info.render.frame++;
      calls.push("render");
    },
    dispose() {
      calls.push("dispose");
    },
    forceContextLoss() {
      calls.push("loseContext");
    },
  };
  const preview = new MenuPreview(element);
  preview.createRenderer = () => {
    calls.push("create");
    return renderer;
  };
  return {
    preview,
    calls,
    renderer,
    canvas,
    document,
    view,
    children,
    setBounds(value) {
      bounds = value;
    },
  };
}

test("native inset lazily creates one canvas below labels, tracks CSS size/DPR and releases its context", () => {
  const { preview, calls, canvas, view, children, setBounds } = fixture();
  preview.setTrack(makeTrack(0));
  preview.draw(1);
  assert.deepEqual(calls, []);
  assert.deepEqual(preview.resources, {
    geometries: 0,
    textures: 0,
    width: 0,
    height: 0,
    pixelRatio: 0,
    renderCalls: 0,
    frames: 0,
  });
  preview.setStage("track");
  preview.draw(1);
  assert.deepEqual(calls, ["create", ["resize", 600.5, 500.5, 2], "render"]);
  assert.equal(canvas.width, 1201);
  assert.equal(canvas.height, 1001);
  assert.equal(canvas["aria-hidden"], "true");
  assert.equal(canvas.style.pointerEvents, "none");
  assert.equal(canvas.style.width, "100%");
  assert.equal(children[0], canvas);
  assert.equal(children[1].label, "kicker");
  preview.draw(1);
  assert.equal(calls.filter((call) => Array.isArray(call)).length, 1);
  view.devicePixelRatio = 3;
  setBounds(rect(20, 110, 312, 262));
  preview.draw(1);
  assert.equal(canvas.width, 936);
  assert.equal(canvas.height, 786);
  assert.equal(preview.resources.pixelRatio, 3);
  assert.equal(preview.resources.frames, 3);
  assert.equal(calls.filter((call) => call === "create").length, 1);
  preview.dispose();
  assert.deepEqual(calls.slice(-3), ["dispose", "loseContext", "remove"]);
  assert.equal(children.length, 2);
  assert.equal(preview.renderer, null);
});

test("class, hidden menu/tab and offscreen preview do not render; returning to track reuses renderer", () => {
  const { preview, renderer, canvas, document, setBounds } = fixture();
  preview.setTrack(makeTrack(0));
  preview.setStage("track");
  preview.draw(1);
  assert.equal(renderer.info.render.frame, 1);
  preview.setStage("class");
  assert.equal(canvas.hidden, true);
  preview.draw(1);
  assert.equal(renderer.info.render.frame, 1);
  preview.setStage("track");
  assert.equal(canvas.hidden, false);
  document.hidden = true;
  preview.draw(1);
  document.hidden = false;
  setBounds(rect(0, 0, 0, 0));
  preview.draw(1);
  setBounds(rect(1500, 0, 300, 200));
  preview.draw(1);
  assert.equal(renderer.info.render.frame, 1);
  setBounds(rect(0, 0, 300, 200));
  preview.draw(1);
  assert.equal(renderer.info.render.frame, 2);
  assert.equal(preview.renderer, renderer);
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
