import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { METROPOLIS_COURSE } from "../src/metropolis-course.js";
import { TRACKS, makeTrack } from "../src/track.js";
import { Race, CRAFT, SPEED_CLASSES } from "../src/race.js";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function drive(track, r, branch, speedClass) {
  const pace = SPEED_CLASSES[speedClass].pace;
  const s = r.contactS;
  const u = (((s / track.length) % 1) + 1) % 1;
  const selected =
    u > track.config.split[0] - 0.04 && u < track.config.split[1] + 0.01
      ? branch
      : 0;
  const speed = Math.hypot(r.velocity.x, r.velocity.z);
  const look = 18 + (speed / pace) * 0.12;
  const f = track.frame(s + look, selected);
  const yaw = Math.atan2(f.p.x - r.position.x, f.p.z - r.position.z);
  const error = Math.atan2(Math.sin(yaw - r.yaw), Math.cos(yaw - r.yaw));
  const curvature = track.curvature(s + look, selected);
  const rate = curvature * speed + error * 3.2 - r.yawRate * 0.2;
  const air = clamp((rate / pace) * 0.45, -1, 1);
  const steer = clamp(
    (rate / pace - air * 0.5) / (0.9 * CRAFT[r.craft].handling),
    -1,
    1,
  );
  let target = 145 * pace;
  for (const ahead of [0, 35, 75, 120, 175]) {
    const curve = Math.abs(track.curvature(s + ahead, selected));
    const corner = Math.sqrt(48 / Math.max(curve, 0.0001)) * pace;
    target = Math.min(
      target,
      Math.sqrt(corner ** 2 + 65 * pace * pace * ahead),
    );
  }
  return {
    throttle: true,
    steer,
    air,
    brake: clamp((speed - target) / (18 * pace), 0, 1),
  };
}

// Exercise the isolated route through the real registry/factory; production
// registration is the integration owner's responsibility.
const registered = TRACKS.findIndex(
  (config) => config.name === METROPOLIS_COURSE.name,
);
if (registered === -1) TRACKS.push(METROPOLIS_COURSE);
const track = makeTrack(registered === -1 ? TRACKS.length - 1 : registered);
if (registered === -1) TRACKS.pop();

test("VESPER: the six accepted routes retain every sampled physical output", () => {
  const hashes = [
    "c72ae886b6a2b0b570c24158f3fe152dfd68cbb420e75d4b2746112c9de47b3b",
    "9cf01f56225f0a9feba93fbc71e4192111bdbd9536e64dafff244978502b0747",
    "b097f5bdced2d53944797bc261c173e08643d647a36af32485e0b1359e82ba63",
    "2b86400d7dfb95d2e7a285647eab6fa1a24b409554033df821de796383cbff09",
    "ef632880e5a08fa1b4fa6407292c938a7ef9a5258db2e8cd5735cc5af8322895",
    "bad81edd2f8fd9501e1a6ba2665c034aaa27804e72d2f933b35010f18699d38b",
  ];
  for (let i = 0; i < hashes.length; i++) {
    const previous = makeTrack(i);
    const rows = [previous.length, previous.physicalLengths];
    for (let j = 0; j < 300; j++) {
      for (const branch of [-1, 0, 1]) {
        const s = (j / 300) * previous.length;
        rows.push(
          previous.frame(s, branch),
          previous.bounds(s, branch),
          previous.gap(j / 300),
          previous.isTunnel(s, branch),
        );
      }
    }
    assert.equal(
      createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
      hashes[i],
    );
  }
});

test("VESPER: linked reversals, roof elevation and a genuinely separate elevated fork", () => {
  let previousSign = 0;
  let reversals = 0;
  let technicalMeters = 0;
  let high = -Infinity;
  let low = Infinity;
  for (let s = 0; s < track.length; s += 3) {
    const frame = track.frame(s);
    const next = track.frame(s + 0.001);
    assert(
      frame.p.distanceTo(next.p) < 0.01,
      "a millimetre station step cannot cross a position discontinuity",
    );
    const curve = track.curvature(s);
    if (Math.abs(curve) > 1 / 180) {
      const sign = Math.sign(curve);
      if (previousSign && previousSign !== sign) reversals++;
      previousSign = sign;
      technicalMeters += 3;
    }
    high = Math.max(high, frame.p.y);
    low = Math.min(low, frame.p.y);
    assert.equal(track.gap(s / track.length), false);
  }
  assert(
    reversals >= 6,
    "multiple consequential direction changes, not an oval",
  );
  assert(
    technicalMeters > 2400,
    "technical corners occupy substantial lap distance",
  );
  assert(high - low > 140, "roof descent and climb have real elevation");
  const s = 0.37 * track.length;
  const lower = track.frame(s, -1);
  const upper = track.frame(s, 1);
  assert(upper.p.y - lower.p.y > 47);
  assert(upper.p.distanceTo(lower.p) > 130);
  assert.equal(track.bounds(s, -1).connected, false);
  assert.equal(track.bounds(s, 1).connected, false);
  for (const u of [0.31, 0.435]) {
    const a = track.frame(u * track.length, -1);
    const b = track.frame(u * track.length, 1);
    assert(a.p.distanceTo(b.p) < 0.01, "fork endpoints meet the common deck");
    assert(
      a.tangent.dot(b.tangent) > 0.999,
      "no endpoint heading discontinuity",
    );
  }
});

for (let speedClass = 0; speedClass < 3; speedClass++) {
  for (let craft = 0; craft < CRAFT.length; craft++) {
    for (const branch of [-1, 1]) {
      test(`VESPER: class ${speedClass + 1} ${CRAFT[craft].name}, fork ${branch}, physically earns a clean lap`, (t) => {
        const race = new Race(track, craft, "trial", speedClass);
        race.countdown = 0;
        const r = race.player;
        // Feedback supplies normal player controls only: no position, velocity,
        // contact, checkpoint, progress or branch assignment after the grid.
        let previousGate = r.gate;
        let forkFrames = 0;
        let touches = 0;
        let minShield = 100;
        let airFrames = 0;
        let brakeFrames = 0;
        let maxSpeed = 0;
        for (let step = 0; step < 180 * 120 && r.lap === 1; step++) {
          const controls = drive(track, r, branch, speedClass);
          if (Math.abs(controls.air) > 0.1) airFrames++;
          if (controls.brake > 0.1) brakeFrames++;
          race.update(1 / 120, controls);
          maxSpeed = Math.max(maxSpeed, r.speed);
          assert.equal(
            r.recoveredThisStep,
            false,
            `no checkpoint rescue at u=${r.contactS / track.length}, branch=${r.branch}, speed=${r.speed}`,
          );
          assert(
            r.gate >= previousGate && r.gate <= previousGate + 1,
            "gates earned consecutively",
          );
          previousGate = r.gate;
          minShield = Math.min(minShield, r.shield);
          if (r.wallTouched) touches++;
          const u = r.contactS / track.length;
          if (u > 0.355 && u < 0.385) {
            assert.equal(r.branch, branch);
            forkFrames++;
          }
        }
        assert.equal(
          r.lap,
          2,
          "a full body-physics lap, not progress teleportation",
        );
        assert.equal(r.gate, 33);
        assert(r.contactS >= track.length);
        assert(forkFrames > 20, "separated route was actually traversed");
        assert(
          minShield > 99.9,
          `clean means no damaging impacts; minimum shield ${minShield}, rail frames ${touches}`,
        );
        assert.equal(touches, 0, "clean means no rail scraping");
        assert(
          airFrames > 500,
          "technical route uses substantial rotation control",
        );
        assert(brakeFrames > 500, "braking is part of the driven lap");
        t.diagnostic(
          JSON.stringify({
            seconds: race.time,
            minShield,
            touches,
            maxSpeed,
            airFrames,
            brakeFrames,
          }),
        );
      });
    }
  }
}
