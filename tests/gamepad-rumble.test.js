import { test } from "node:test";
import assert from "node:assert/strict";
import { GamepadRumble } from "../src/gamepad-rumble.js";
import { gamepadFlightControls } from "../src/gamepad-controls.js";

function device() {
  const calls = [];
  return {
    calls,
    index: 0,
    id: "Virtual standard controller",
    buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })),
    vibrationActuator: {
      effects: ["dual-rumble"],
      playEffect: (...args) => {
        calls.push(args);
        return Promise.resolve("complete");
      },
      reset: () => {
        calls.push(["reset"]);
        return Promise.resolve("complete");
      },
    },
  };
}

test("A is deliberate throttle; triggers are independent analog airbrakes", () => {
  const pad = device();
  pad.buttons[6].value = 0.27;
  pad.buttons[7].value = 0.81;
  assert.deepEqual(gamepadFlightControls(pad), {
    throttle: 0,
    airLeft: 0.27,
    airRight: 0.81,
  });
  pad.buttons[0].pressed = true;
  assert.equal(gamepadFlightControls(pad).throttle, 1);
  assert.equal(gamepadFlightControls(pad, true).throttle, 0);
  pad.buttons[0].pressed = false;
  assert.equal(gamepadFlightControls(pad).throttle, 0);
});

test("gameplay pulses differ in weight and sharpness; strongest event wins a frame", () => {
  const pad = device();
  const rumble = new GamepadRumble();
  rumble.connect(pad, true);
  rumble.events([{ kind: "scrape" }, { kind: "hit" }], 0);
  assert.equal(pad.calls.length, 1);
  const hit = pad.calls[0][1];
  rumble.events([{ kind: "scrape" }], 20);
  assert.equal(pad.calls.length, 1);
  rumble.events([{ kind: "fire", text: "PULSE" }], 300);
  const pulse = pad.calls[1][1];
  assert.ok(hit.strongMagnitude > pulse.strongMagnitude);
  assert.ok(pulse.weakMagnitude > hit.weakMagnitude);
  rumble.events([{ kind: "fire", text: "PULSE" }], 350);
  assert.equal(pad.calls.length, 2);
  rumble.events([{ kind: "boost" }], 600);
  rumble.events([{ kind: "land" }], 900);
  rumble.events([{ kind: "launch" }], 1300);
  assert.equal(pad.calls.length, 5);
  for (const [type, effect] of pad.calls) {
    assert.equal(type, "dual-rumble");
    assert.ok(effect.duration <= 240);
    assert.ok(effect.strongMagnitude <= 1 && effect.weakMagnitude <= 1);
  }
});

test("scrapes are rate-limited, heavy hits interrupt light feedback", () => {
  const pad = device();
  const rumble = new GamepadRumble();
  rumble.connect(pad, true);
  rumble.events([{ kind: "scrape" }], 0);
  rumble.events([{ kind: "hit" }], 10);
  rumble.events([{ kind: "scrape" }], 100);
  rumble.events([{ kind: "scrape" }], 270);
  assert.equal(pad.calls.length, 3);
});

test("pause, device switch, disconnect and explicit stop cancel and gate effects", () => {
  const pad = device();
  const rumble = new GamepadRumble();
  rumble.connect(pad, true);
  rumble.events([{ kind: "boost" }], 0);
  rumble.connect(pad, false);
  assert.deepEqual(pad.calls.at(-1), ["reset"]);
  rumble.events([{ kind: "hit" }], 300);
  assert.equal(pad.calls.length, 2);
  rumble.connect(pad, true);
  const next = device();
  next.index = 1;
  rumble.connect(next, true);
  assert.deepEqual(pad.calls.at(-1), ["reset"]);
  rumble.events([{ kind: "hit" }], 400);
  rumble.connect(null, false);
  assert.deepEqual(next.calls.at(-1), ["reset"]);
  rumble.events([{ kind: "hit" }], 800);
  assert.equal(next.calls.length, 2);
});

test("missing or unsupported haptics are quiet; API failures are reported once", async () => {
  const errors = [];
  const rumble = new GamepadRumble((error) => errors.push(error.message));
  rumble.connect({ index: 0, id: "no haptics" }, true);
  rumble.events([{ kind: "hit" }], 0);
  const pad = device();
  pad.id = "unsupported";
  pad.vibrationActuator.effects = ["trigger-rumble"];
  rumble.connect(pad, true);
  rumble.events([{ kind: "hit" }], 100);
  assert.equal(pad.calls.length, 0);
  pad.id = "rejected";
  pad.vibrationActuator.effects = ["dual-rumble"];
  pad.vibrationActuator.playEffect = () =>
    Promise.reject(new Error("device lost"));
  rumble.connect(pad, true);
  rumble.events([{ kind: "hit" }], 200);
  await Promise.resolve();
  await Promise.resolve();
  rumble.events([{ kind: "hit" }], 600);
  assert.deepEqual(errors, ["device lost"]);
});
