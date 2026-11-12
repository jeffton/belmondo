import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildStartGantry } from "../src/start-gantry.js";
import { makeTrack, TRACKS } from "../src/track.js";
import { Race, LAPS } from "../src/race.js";

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
    const resources = signal.assembly.children.map((mesh) => ({
      mesh,
      geometry: mesh.geometry,
      material: mesh.material,
      texture: mesh.material.map,
    }));
    const stages = [
      [{ countdown: 3.2, time: 0 }, "READY"],
      [{ countdown: 3, time: 0 }, "3"],
      [{ countdown: 2, time: 0 }, "2"],
      [{ countdown: 1, time: 0 }, "1"],
      [{ countdown: 0, time: 0 }, "GO"],
      [{ countdown: 0, time: 1.2, player: { lap: 1 } }, "LAP 1"],
      [{ countdown: 0, time: 40, player: { lap: 2 } }, "LAP 2"],
      [{ countdown: 0, time: 100, player: { lap: LAPS } }, `LAP ${LAPS}`],
      [
        { countdown: 0, time: 120, player: { lap: LAPS + 1 }, finished: true },
        "FINISH",
      ],
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
      if (!expected.startsWith("LAP") && expected !== "FINISH")
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
    // Production Race objects, seeded just before a timing gate: these are
    // bounded CPU transition fixtures, not claims of complete human-driven laps.
    for (let course = 0; course < TRACKS.length; course++) {
      const race = new Race(makeTrack(course), 0, "trial");
      race.countdown = 0;
      race.time = 10;
      const player = race.player;
      const courseSignal = buildStartGantry(scene, race.track);
      let painted = [];
      const draw = (expected, demo = false) => {
        operations.length = 0;
        courseSignal.update(race, demo);
        if (operations.length) painted = [...operations];
        assert.ok(
          painted.some((op) => op.text === expected),
          expected,
        );
      };
      draw("LAP 1");
      for (let lap = 1; lap <= LAPS; lap++) {
        player.lap = lap;
        player.s =
          (lap - 1 + race.track.config.sections.finishStraight[0]) *
            race.track.length -
          1;
        draw(`LAP ${lap}`);
        player.s = lap * race.track.length - 100;
        draw(lap === LAPS ? "FINISH" : `LAP ${lap + 1}`);
        assert.equal(race.finished, false, "preview does not finish the race");
        assert.ok(
          painted.some((op) => op.text === (lap === LAPS ? "LINE" : "NEXT")),
        );
        assert.ok(!painted.some((op) => op.text === "COMPLETE"));
        // AI progress cannot alter the player's upcoming lap/finish preview.
        const version = courseSignal.assembly.getObjectByName(
          "grid-signal-display",
        ).material.map.version;
        race.racers.push({ lap: LAPS + 1, s: race.track.length * (LAPS + 1) });
        courseSignal.update(race);
        assert.equal(
          courseSignal.assembly.getObjectByName("grid-signal-display").material
            .map.version,
          version,
        );
        race.racers.pop();
        const s = lap * race.track.length - 1;
        const frame = race.track.frame(s);
        player.lap = lap;
        player.s = s;
        player.contactS = s;
        player.gate = lap * 32;
        player.position.copy(frame.p);
        player.position.y += 2.2;
        player.velocity.copy(frame.tangent).multiplyScalar(50);
        player.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
        for (let step = 0; step < 120 && player.lap === lap; step++)
          race.update(1 / 120, {});
        assert.equal(
          player.lap,
          lap + 1,
          `course ${course} timing gate advances player`,
        );
        assert.equal(race.finished, lap === LAPS);
        draw(lap === LAPS ? "FINISH" : `LAP ${lap + 1}`);
        assert.ok(
          painted.some(
            (op) => op.text === (lap === LAPS ? "COMPLETE" : "CURRENT"),
          ),
        );
      }
      draw("B/", true);
      draw("FINISH");
      operations.length = 0;
      courseSignal.update(new Race(makeTrack(course), 0, "trial"));
      assert.ok(operations.some((op) => op.text === "READY"));
    }
    assert.equal(signal.assembly.children.length, resources.length);
    for (const { mesh, geometry, material, texture } of resources) {
      assert.equal(mesh.geometry, geometry, "state transitions reuse geometry");
      assert.equal(
        mesh.material,
        material,
        "state transitions reuse materials",
      );
      assert.equal(
        mesh.material.map,
        texture,
        "one canvas texture serves every state",
      );
    }
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
