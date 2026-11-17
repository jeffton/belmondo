import test from "node:test";
import assert from "node:assert/strict";
import {
  integrateHover as integrateWorldY,
  hoverReaction,
  integratePitch,
} from "../src/hover-support.ts";

function integrateHover(height, velocity, dt, pace, gravity) {
  return integrateWorldY(height, velocity, dt, gravity, (_, h, v) =>
    hoverReaction(h, v, pace),
  );
}

function close(actual, expected, tolerance = 1e-10) {
  assert(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
}

function advance(height, velocity, seconds, hz, pace) {
  let reactionDelta = 0;
  for (let i = 0; i < seconds * hz; i++) {
    const step = integrateHover(
      height,
      velocity,
      1 / hz,
      pace,
      35 * pace * pace,
    );
    height = step.height;
    velocity = step.velocity;
    reactionDelta += step.reactionDelta;
  }
  return { height, velocity, reactionDelta };
}

test("powered suspension preserves the existing static equilibrium without a floor", () => {
  for (const pace of [1.2, 1.4, 1.6]) {
    const step = integrateHover(-35 / 90, 0, 1 / 120, pace, 35 * pace * pace);
    close(step.height, -35 / 90);
    close(step.velocity, 0);
    close(step.reactionDelta, (35 * pace * pace) / 120);
    assert(step.height < -0.35);
  }
});

test("120 and 240 Hz landing trajectories converge toward the fine-step solution", () => {
  for (const pace of [1.2, 1.4, 1.6]) {
    const fine = advance(12, -90, 0.5, 3840, pace);
    const coarse = advance(12, -90, 0.5, 120, pace);
    const half = advance(12, -90, 0.5, 240, pace);
    const error = (step) =>
      Math.hypot(step.height - fine.height, step.velocity - fine.velocity);
    assert(
      error(half) < error(coarse) / 3,
      "midpoint has second-order convergence",
    );
    assert(error(coarse) < 0.2, "120 Hz preserves the landing trajectory");
  }
});

test("an inactive field is ballistic rather than attracting the hull", () => {
  const height = 100;
  const velocity = 10;
  const pace = 1.2;
  const gravity = 35 * pace * pace;
  const dt = 1 / 120;
  const step = integrateHover(height, velocity, dt, pace, gravity);
  close(step.height, height + velocity * dt - (gravity * dt * dt) / 2);
  close(step.velocity, velocity - gravity * dt);
  close(step.reactionDelta, 0);
});

test("fast descent is cushioned above the old capture band without erasing momentum", () => {
  const height = 12;
  const velocity = -90;
  const pace = 1.2;
  const gravity = 35 * pace * pace;
  const dt = 1 / 120;
  const step = integrateHover(height, velocity, dt, pace, gravity);
  assert(height > 1.2);
  assert(step.reactionDelta > 0);
  assert(step.velocity > velocity - gravity * dt);
  assert(step.velocity < 0, "support does not snap descent to zero");
  assert(step.height < height);
  close(step.velocity - velocity, step.reactionDelta - gravity * dt);
});

test("the distant field never attracts a hull but near-road hover retains restoring force", () => {
  assert(integrateHover(0, 100, 1 / 120, 1.2, 35 * 1.2 ** 2).reactionDelta < 0);
  for (const height of [2, 12, 100])
    for (const velocity of [-100, 0, 100]) {
      const step = integrateHover(
        height,
        velocity,
        1 / 120,
        1.2,
        35 * 1.2 ** 2,
      );
      assert(step.reactionDelta >= 0);
    }
});

test("zero elapsed time leaves height, velocity and support impulse unchanged", () => {
  const step = integrateHover(0.7, -80, 0, 1.6, 35 * 1.6 ** 2);
  close(step.height, 0.7);
  close(step.velocity, -80);
  close(step.reactionDelta, 0);
});

test("touchdown torque cannot instantaneously overwrite pitch or angular velocity", () => {
  const pitch = 0.48;
  const pitchRate = 0.2;
  const target = 0.045;
  const unchanged = integratePitch(pitch, pitchRate, target, 0, 1.2);
  close(unchanged.pitch, pitch);
  close(unchanged.pitchRate, pitchRate);
  const tinyStep = integratePitch(pitch, pitchRate, target, 1e-7, 1.2);
  close((tinyStep.pitch - pitch) / 1e-7, pitchRate, 0.00001);
  const firstStep = integratePitch(pitch, pitchRate, target, 1 / 120, 1.2);
  assert(Math.abs(firstStep.pitch - pitch) < 0.001);
  assert(
    firstStep.pitchRate < pitchRate,
    "contact torque opposes nose-down descent",
  );
  assert(
    firstStep.pitch > target,
    "the collision hull retains its flight attitude",
  );
});

test("physical pitch response is independent of timestep partition for a fixed target", () => {
  for (const pace of [1.2, 1.4, 1.6]) {
    const whole = integratePitch(0.48, 0.2, 0.045, 1 / 30, pace);
    let pitch = 0.48;
    let pitchRate = 0.2;
    for (let i = 0; i < 4; i++) {
      const step = integratePitch(pitch, pitchRate, 0.045, 1 / 120, pace);
      pitch = step.pitch;
      pitchRate = step.pitchRate;
    }
    close(pitch, whole.pitch);
    close(pitchRate, whole.pitchRate);
  }
});

test("critically damped pitch converges without angle or rate clamps", () => {
  const pitch = 4;
  const target = -3;
  const step = integratePitch(pitch, 0, target, 2, 1.2);
  assert(step.pitch > target && step.pitch < pitch);
  close(step.pitch, target, 0.0001);
  close(step.pitchRate, 0, 0.001);
});
