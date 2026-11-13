import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { Race } from "../src/race.js";
import { makeTrack } from "../src/track.js";
import { steeringBank, updateShipBank } from "../src/ship-bank.js";

function trajectory(steer, digital, fps = 120) {
  const race = new Race(makeTrack(0), 0, "trial");
  race.countdown = 0;
  let lean = 0;
  const samples = [];
  for (let i = 0; i < fps * 3; i++) {
    race.update(1 / fps, { steer: steer(i / fps), throttle: true });
    const target = steeringBank(race.player.yawRate);
    lean = updateShipBank(lean, target, 1 / fps, digital);
    samples.push({ lean, target, yaw: race.player.yaw });
  }
  return samples;
}

function variation(samples, key) {
  return samples
    .slice(1)
    .reduce(
      (sum, sample, i) => sum + Math.abs(sample[key] - samples[i][key]),
      0,
    );
}

test("repeated digital taps reduce visual roll oscillation without changing physical heading", () => {
  const taps = (t) => (t < 1.5 && t % 0.2 < 0.1 ? 1 : 0);
  const digital = trajectory(taps, true);
  const direct = trajectory(taps, false);
  assert(variation(digital, "lean") < variation(digital, "target") * 0.8);
  assert.deepEqual(
    digital.map((s) => s.yaw),
    direct.map((s) => s.yaw),
  );
  assert(
    Math.abs(digital.at(-1).lean) < 0.025,
    "no sustained lean after release",
  );
});

test("digital turn-in begins on the first rendered frame and sustained holds reach the physical bank", () => {
  const hold = trajectory((t) => (t < 1 ? 1 : 0), true);
  assert(hold[0].lean < 0, "immediate visible response");
  assert(Math.abs(hold[119].lean - hold[119].target) < 0.005);
  const reverse = updateShipBank(-0.3, 0.3, 1 / 60, true);
  assert(reverse > -0.2, "reversals use fast turn-in rather than slow release");
});

test("touch stick and gamepad analog trajectories retain direct yaw-derived hull bank", () => {
  for (const steer of [
    (t) => Math.sin(t * 4) * 0.6,
    (t) => (t % 0.2 < 0.1 ? 1 : 0),
  ]) {
    const analog = trajectory(steer, false);
    assert(analog.every((s) => s.lean === s.target));
  }
});

test("actual input routing distinguishes keyboard taps from touch/gamepad analog, including release", () => {
  const source = readFileSync(
    new URL("../src/main.js", import.meta.url),
    "utf8",
  );
  const inputFunction = source.slice(
    source.indexOf("function input() {"),
    source.indexOf("const mapCtx ="),
  );
  let pad = null;
  const context = vm.createContext({
    keys: new Set(),
    held: new Set(),
    touchSteer: 0,
    touchPitch: 0,
    steerPointer: null,
    touch: false,
    race: { countdown: 0 },
    paused: false,
    padPause: false,
    padFire: false,
    padView: false,
    previousPadInput: [],
    // This fixture isolates bank routing; full browser tests cover mode transitions.
    setInputMode: () => {},
    navigator: { getGamepads: () => [pad] },
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  });
  vm.runInContext(
    `let steeringKind = "digital"; ${inputFunction}; globalThis.read = input;`,
    context,
  );
  for (let i = 0; i < 4; i++) {
    context.keys.add("ArrowRight");
    assert.equal(context.read().steeringKind, "digital");
    context.keys.clear();
    assert.equal(context.read().steeringKind, "digital");
  }
  context.steerPointer = 1;
  context.touchSteer = 0.4;
  assert.equal(context.read().steeringKind, "analog");
  context.steerPointer = null;
  context.touchSteer = 0;
  assert.equal(context.read().steeringKind, "analog");
  context.steerPointer = 2;
  context.keys.add("KeyA");
  assert.equal(
    context.read().steeringKind,
    "digital",
    "centered touch does not override a keyboard turn",
  );
  context.steerPointer = null;
  context.keys.clear();
  pad = { axes: [0.65, 0], buttons: [] };
  assert.equal(context.read().steeringKind, "analog");
  pad.axes[0] = 0;
  assert.equal(context.read().steeringKind, "analog");
});

test("render damping is frame-rate independent, and paused digital lean is frozen", () => {
  for (const fps of [30, 60, 120]) {
    let lean = 0;
    for (let i = 0; i < fps; i++)
      lean = updateShipBank(lean, 0.4, 1 / fps, true);
    assert(Math.abs(lean - 0.4 * (1 - Math.exp(-1 / 0.07))) < 1e-12);
    assert.equal(updateShipBank(lean, 0, 0, true), lean);
    assert.equal(
      updateShipBank(lean, 0, 0, false),
      lean,
      "switching to analog cannot change a paused cockpit",
    );
  }
});
