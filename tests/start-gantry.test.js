import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildStartGantry } from "../src/start-gantry.js";
import { makeTrack } from "../src/track.js";

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map((part) => {
    const channel = parseInt(part, 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

// Canvas recording keeps this lifecycle/contrast check independent of a GPU.
test("physical start signal stays dark and legible across real countdown boundaries", async () => {
  const originalDocument = globalThis.document;
  const originalImage = globalThis.Image;
  const operations = [];
  const context = new Proxy(
    {
      fillRect(...args) {
        operations.push({ kind: "rect", args, color: this.fillStyle });
      },
      fillText(text, ...args) {
        operations.push({ kind: "text", text, args, color: this.fillStyle });
      },
      drawImage() {
        operations.push({ kind: "image", filter: this.filter });
      },
    },
    { get: (target, key) => (key in target ? target[key] : () => {}) },
  );
  globalThis.document = {
    createElement: () => ({ getContext: () => context }),
    fonts: { load: async () => [] },
  };
  globalThis.Image = class {
    set src(value) {
      queueMicrotask(() => this.onload());
    }
  };
  try {
    const scene = new THREE.Scene();
    const signal = buildStartGantry(scene, makeTrack(0));
    await Promise.resolve();
    await Promise.resolve();
    const display = signal.assembly.getObjectByName("grid-signal-display");
    assert.equal(display.material.toneMapped, false);
    const placement = display.position.clone();
    const stages = [
      [{ countdown: 3.2, time: 0 }, "READY"],
      [{ countdown: 3, time: 0 }, "3"],
      [{ countdown: 2, time: 0 }, "2"],
      [{ countdown: 1, time: 0 }, "1"],
      [{ countdown: 0, time: 0 }, "GO"],
      [{ countdown: 0, time: 1.2 }, "B/"],
    ];
    for (const [race, expected] of stages) {
      operations.length = 0;
      const originalRace = structuredClone(race);
      signal.update(race);
      assert.deepEqual(race, originalRace);
      const background = operations.find(
        (op) => op.kind === "rect" && op.args[2] === 1024 && op.args[3] === 256,
      );
      assert.ok(background, `stage ${expected} repaints the board`);
      assert.ok(
        luminance(background.color) < 0.025,
        `stage ${expected} has a dark panel`,
      );
      const inset = operations.find(
        (op) => op.kind === "rect" && op.args[0] === 283,
      );
      const glyph = operations.find(
        (op) => op.kind === "text" && op.text === expected,
      );
      assert.ok(glyph, `actual countdown displays ${expected}`);
      const contrast =
        (luminance(glyph.color) + 0.05) / (luminance(inset.color) + 0.05);
      assert.ok(contrast >= 4.5, `${expected} contrast ${contrast.toFixed(2)}`);
      assert.ok(
        operations.find(
          (op) =>
            op.kind === "image" && op.filter === "brightness(0) invert(1)",
        ),
      );
      assert.ok(display.position.equals(placement));
      const version = display.material.map.version;
      signal.update(race);
      assert.equal(
        display.material.map.version,
        version,
        "unchanged stage reuses its texture",
      );
    }
    signal.update({ countdown: 2, time: 0 });
    operations.length = 0;
    signal.update({ countdown: 2, time: 0 }, true);
    assert.ok(operations.find((op) => op.kind === "text" && op.text === "B/"));
    scene.traverse((object) => {
      object.geometry?.dispose();
      object.material?.map?.dispose();
      object.material?.dispose();
    });
  } finally {
    globalThis.document = originalDocument;
    globalThis.Image = originalImage;
  }
});
