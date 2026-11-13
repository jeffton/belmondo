import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { MenuPreview } from "../src/menu-preview.js";
import { makeTrack, TRACKS } from "../src/track.js";
import { createCraft } from "../src/craft.js";
import { SPEED_CLASSES } from "../src/speed-classes.js";
import { localRecordKey } from "../src/records.js";

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
    render(scene) {
      this.lastScene = scene;
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

test("hidden menu/tab and offscreen preview do not render; all three stages reuse renderer", () => {
  const { preview, renderer, document, setBounds } = fixture();
  preview.setTrack(makeTrack(0));
  preview.setStage("track");
  preview.draw(1);
  assert.equal(renderer.info.render.frame, 1);
  preview.setClass(0);
  preview.setStage("class");
  preview.draw(1);
  assert.equal(renderer.info.render.frame, 2);
  assert.equal(renderer.lastScene, preview.classScene);
  preview.setStage("track");
  document.hidden = true;
  preview.draw(1);
  document.hidden = false;
  setBounds(rect(0, 0, 0, 0));
  preview.draw(1);
  setBounds(rect(1500, 0, 300, 200));
  preview.draw(1);
  assert.equal(renderer.info.render.frame, 2);
  setBounds(rect(0, 0, 300, 200));
  preview.draw(1);
  assert.equal(renderer.info.render.frame, 3);
  assert.equal(renderer.lastScene, preview.trackScene);
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
  preview.setStage("craft");
  preview.draw(0.25);
  assert.equal(preview.renderer.lastScene, preview.craftScene);
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

test("class sculptures are distinct spatial silhouettes, cached and disposed without creating extra contexts", () => {
  const { preview, calls, renderer } = fixture();
  const signatures = new Set();
  const releases = new Map();
  for (let i = 0; i < 3; i++) {
    const previous = preview.classModel;
    preview.setClass(i);
    if (previous) assert.equal(previous.visible, false);
    assert.equal(preview.classModel.visible, true);
    assert.equal(preview.classModel.name, SPEED_CLASSES[i].name);
    assert.equal(
      preview.classModel.children[0].children.length,
      4,
      "four merged material batches per sculpture",
    );
    const box = new THREE.Box3().setFromObject(preview.classModel);
    const size = box.getSize(new THREE.Vector3());
    assert.ok(
      size.x > 0.8 && size.y > 0.8 && size.z > 0.3,
      "actual volumes, not planar logos",
    );
    const meshes = preview.classModel.children[0].children;
    signatures.add(
      meshes
        .map((mesh) => {
          const position = mesh.geometry.getAttribute("position");
          const samples = Array.from(position.array).filter(
            (_, j) => j % 9 === 0,
          );
          return `${position.count}:${samples.reduce((sum, value) => sum + value * value, 0).toFixed(4)}`;
        })
        .join("/"),
    );
    for (const mesh of meshes)
      for (const resource of [mesh.geometry, mesh.material]) {
        releases.set(resource, 0);
        resource.addEventListener("dispose", () =>
          releases.set(resource, releases.get(resource) + 1),
        );
      }
    preview.draw(0.5);
    assert.equal(preview.renderer, renderer);
    assert.ok(preview.classModel.rotation.y > 0);
  }
  assert.equal(
    signatures.size,
    3,
    "geometry differs, not only material colors",
  );
  const first = preview.classes.get(0);
  preview.setClass(0);
  assert.equal(preview.classModel, first);
  assert.equal(calls.filter((call) => call === "create").length, 1);
  preview.dispose();
  assert.ok([...releases.values()].every((count) => count === 1));
  assert.equal(preview.classes.size, 0);
});

test("resonance has an open fork notch while singularity stays a filled volume through rotation", () => {
  const { preview } = fixture();
  const ray = new THREE.Raycaster(
    new THREE.Vector3(0, 0.2, 3),
    new THREE.Vector3(0, 0, -1),
  );
  preview.setClass(1);
  preview.classModel.updateMatrixWorld(true);
  assert.equal(
    ray.intersectObject(preview.classModel, true).length,
    0,
    "the fork has a broad clear notch, not a tangle around a center jewel",
  );
  preview.setClass(2);
  for (let i = 0; i < 8; i++) {
    preview.classModel.rotation.y = (i * Math.PI) / 4;
    preview.classModel.updateMatrixWorld(true);
    assert.ok(
      ray
        .intersectObject(preview.classModel, true)
        .some(({ object }) => object.name === "shell"),
      `the solid gravity seed cannot turn into a hollow cage at heading ${i}`,
    );
  }
  preview.dispose();
});

test("course switches preserve compiled-material ownership and release only replaced geometry", () => {
  const { preview } = fixture();
  preview.setTrack(makeTrack(0));
  const materials = preview.course.children.map((mesh) => mesh.material);
  const materialDisposals = new Map(materials.map((material) => [material, 0]));
  for (const material of materials)
    material.addEventListener("dispose", () =>
      materialDisposals.set(material, materialDisposals.get(material) + 1),
    );
  for (let i = 1; i < TRACKS.length; i++) {
    const replaced = preview.course.children.map((mesh) => mesh.geometry);
    let disposed = 0;
    for (const geometry of replaced)
      geometry.addEventListener("dispose", () => disposed++);
    const track = makeTrack(i);
    preview.setTrack(track);
    assert.equal(disposed, 2, "old deck and edge buffers are released");
    for (const [j, mesh] of preview.course.children.entries())
      assert.equal(mesh.material, materials[j]);
    assert.equal(
      preview.trackMaterials.edge.color.getHex(),
      track.config.color,
    );
    assert.ok([...materialDisposals.values()].every((count) => count === 0));
  }
  preview.dispose();
  assert.ok([...materialDisposals.values()].every((count) => count === 1));
});

test("class identity and record scopes survive the field-tech naming", () => {
  assert.deepEqual(
    SPEED_CLASSES.map(({ name }) => name),
    ["INDUCTION", "RESONANCE", "SINGULARITY"],
  );
  for (let i = 0; i < 3; i++) {
    assert.equal(
      localRecordKey("layout", 2, "trial", SPEED_CLASSES[i], 5),
      [
        "layout-2-trial-c1-5laps-pace1.2",
        "layout-2-trial-c2-5laps-pace1.4",
        "layout-2-trial-c3-5laps-pace1.6",
      ][i],
    );
  }
});
