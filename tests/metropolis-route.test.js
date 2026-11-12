import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { METROPOLIS_COURSE } from "../src/metropolis-course.js";
import { TRACKS, makeTrack } from "../src/track.js";
import { Race, CRAFT, SPEED_CLASSES } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function physicalCurvature(track, s, branch) {
  const a = track.frame(s - 6, branch);
  const b = track.frame(s + 6, branch);
  return (
    Math.atan2(
      a.tangent.z * b.tangent.x - a.tangent.x * b.tangent.z,
      a.tangent.dot(b.tangent),
    ) / a.p.distanceTo(b.p)
  );
}
function drive(
  track,
  r,
  branch,
  speedClass,
  {
    airEnabled = true,
    line = 0,
    lateralAcceleration = 44,
    speedTarget = null,
  } = {},
) {
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
  const curveAhead = physicalCurvature(track, s + look, selected);
  const offset = selected ? 0 : line * Math.tanh(curveAhead * 350);
  const targetPoint = f.p.clone().addScaledVector(f.right, offset);
  const yaw = Math.atan2(
    targetPoint.x - r.position.x,
    targetPoint.z - r.position.z,
  );
  const error = Math.atan2(Math.sin(yaw - r.yaw), Math.cos(yaw - r.yaw));
  const curvature = physicalCurvature(track, s + look, selected);
  const rate = curvature * speed + error * 3.2 - r.yawRate * 0.2;
  const air = airEnabled ? clamp((rate / pace) * 0.45, -1, 1) : 0;
  const steer = clamp(
    (rate / pace - air * 0.5) / (0.9 * CRAFT[r.craft].handling),
    -1,
    1,
  );
  let target = 145 * pace;
  for (let ahead = 0; ahead <= 180; ahead += 15) {
    const curve = Math.abs(physicalCurvature(track, s + ahead, selected));
    const corner =
      Math.sqrt(lateralAcceleration / Math.max(curve, 0.0001)) * pace;
    target = Math.min(
      target,
      Math.sqrt(corner ** 2 + 65 * pace * pace * ahead),
    );
  }
  if (speedTarget) {
    target = speedTarget(s);
    return {
      throttle: speed < target + 0.2 * pace,
      steer,
      air,
      brake: clamp((speed - target) / (2 * pace), 0, 1),
    };
  }
  return {
    throttle: speed < target + 3 * pace,
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
const terrain = createTerrain(track);
after(() => terrain.geometries.forEach((geometry) => geometry.dispose()));

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
  const s =
    ((track.config.split[0] + track.config.split[1]) / 2) * track.length;
  const lower = track.frame(s, -1);
  const upper = track.frame(s, 1);
  assert(upper.p.y - lower.p.y > 47);
  assert(upper.p.distanceTo(lower.p) > 130);
  assert.equal(track.bounds(s, -1).connected, false);
  assert.equal(track.bounds(s, 1).connected, false);
  for (const u of track.config.split) {
    const a = track.frame(u * track.length, -1);
    const b = track.frame(u * track.length, 1);
    assert(a.p.distanceTo(b.p) < 0.01, "fork endpoints meet the common deck");
    assert(
      a.tangent.dot(b.tangent) > 0.999,
      "no endpoint heading discontinuity",
    );
  }
});

test("VESPER: both full-width fork edges always advance along their carriageway", () => {
  for (const branch of [-1, 1]) {
    for (
      let s = track.config.split[0] * track.length;
      s <= track.config.split[1] * track.length;
      s += 1
    ) {
      const frame = track.frame(s, branch);
      for (const side of [-1, 1]) {
        const a = track.frame(s - 0.1, branch);
        const b = track.frame(s + 0.1, branch);
        const edgeA = a.p.clone().addScaledVector(a.right, side * a.width);
        const edgeB = b.p.clone().addScaledVector(b.right, side * b.width);
        assert(
          edgeB.sub(edgeA).dot(frame.tangent) > 0,
          `fork ${branch} edge ${side} folds at ${s / track.length}`,
        );
      }
    }
  }
});

test("VESPER: a poor rooftop A exit carries a physical cost into B", (t) => {
  const results = [];
  for (const poorExit of [false, true]) {
    const race = new Race(track, 1, "trial", 0, terrain);
    race.countdown = 0;
    let firstImpact = null;
    for (
      let step = 0;
      step < 45 * 120 && race.player.contactS < track.length * 0.2;
      step++
    ) {
      const r = race.player;
      const line = poorExit && r.contactS < track.length * 0.14 ? -8 : 8;
      race.update(
        1 / 120,
        drive(track, r, 1, 0, { line, lateralAcceleration: 64 }),
      );
      assert.equal(r.recoveredThisStep, false);
      if (r.wallTouched) firstImpact ??= r.contactS / track.length;
    }
    assert(race.player.contactS >= track.length * 0.2);
    results.push({
      poorExit,
      firstImpact,
      seconds: race.time,
      shield: race.player.shield,
    });
  }
  assert.equal(results[0].firstImpact, null, "correct setup is clean");
  assert(
    results[1].firstImpact > 0.14 && results[1].firstImpact < 0.165,
    "bad A exit hits B after the same correct B controls are restored",
  );
  assert(
    results[1].seconds > results[0].seconds,
    "an exit mistake loses real elapsed time",
  );
  t.diagnostic(JSON.stringify(results));
});

test("VESPER: full-width racing-line search compares normal controls with and without airbrakes", (t) => {
  // This is a bounded search, not a claim of a globally optimal racing line.
  // Both drivers get the same preview/speed objective; the airless driver can
  // use the entire steering range and ordinary brake. Every trial starts on
  // the real grid, and follows the linked rooftop corners, not a reseeded arc.
  const results = [];
  for (const lateralAcceleration of [48, 56, 64, 80]) {
    for (const airEnabled of [true, false]) {
      const lines = [];
      for (const line of [-16, -8, 0, 8, 16]) {
        const race = new Race(track, 1, "trial", 0, terrain);
        race.countdown = 0;
        const r = race.player;
        let touches = 0;
        let recovered = false;
        let samples = 0;
        let speedSum = 0;
        let firstImpactSpeed = null;
        let beyondSteerFrames = 0;
        for (
          let step = 0;
          step < 70 * 120 && r.contactS < track.length * 0.22;
          step++
        ) {
          const controls = drive(track, r, 1, 0, {
            airEnabled,
            line,
            lateralAcceleration,
          });
          if (
            Math.abs(
              controls.steer * 0.9 * CRAFT[1].handling + controls.air * 0.5,
            ) >
            0.9 * CRAFT[1].handling
          )
            beyondSteerFrames++;
          race.update(1 / 120, controls);
          recovered ||= r.recoveredThisStep;
          if (r.wallTouched) {
            touches++;
            firstImpactSpeed ??= r.speed;
          }
          if (r.contactS > track.length * 0.14) {
            samples++;
            speedSum += r.speed;
          }
        }
        lines.push({
          line,
          seconds: race.time,
          meanTechnicalSpeed: speedSum / samples,
          firstImpactSpeed,
          beyondSteerFrames,
          touches,
          shield: r.shield,
          recovered,
          completed: r.contactS >= track.length * 0.22,
        });
      }
      const clean = lines.filter(
        (entry) =>
          entry.completed &&
          !entry.recovered &&
          !entry.touches &&
          entry.shield > 99.9,
      );
      const fastest = clean.sort((a, b) => a.seconds - b.seconds)[0] ?? null;
      results.push({ lateralAcceleration, airEnabled, fastest, lines });
    }
  }
  assert(
    results[0].fastest,
    "normal controls must physically clear the searched section cleanly",
  );
  const cleanAir = results
    .filter((result) => result.airEnabled && result.fastest)
    .map((result) => result.fastest)
    .sort((a, b) => a.seconds - b.seconds)[0];
  const cleanNoAir = results
    .filter((result) => !result.airEnabled && result.fastest)
    .map((result) => result.fastest)
    .sort((a, b) => a.seconds - b.seconds)[0];
  assert(
    cleanNoAir,
    "independently tuned ordinary brakes must yield a genuinely clean no-air reference",
  );
  assert(
    cleanAir.beyondSteerFrames > 0,
    "clean fast lap uses air yaw beyond maximum ordinary steering",
  );
  assert(
    cleanAir.seconds < cleanNoAir.seconds,
    "rotation control earns a clean pace advantage within the searched family",
  );
  t.diagnostic(JSON.stringify({ cleanAir, cleanNoAir, results }));
});

test("VESPER: measured-speed replay isolates air yaw from air drag", (t) => {
  const reference = new Race(track, 1, "trial", 0, terrain);
  reference.countdown = 0;
  const profile = [];
  for (
    let step = 0;
    step < 70 * 120 && reference.player.contactS < track.length * 0.22;
    step++
  ) {
    const r = reference.player;
    profile[Math.floor(r.contactS / 5)] = r.speed;
    reference.update(
      1 / 120,
      drive(track, r, 1, 0, { line: 8, lateralAcceleration: 64 }),
    );
    assert.equal(r.wallTouched, false, "measured reference is clean");
    assert.equal(r.recoveredThisStep, false);
  }
  assert(
    reference.player.contactS >= track.length * 0.22,
    "reference section completed within simulation deadline",
  );
  profile.push(reference.player.speed);
  assert(
    profile.every(Number.isFinite),
    "speed reference contains measured finite samples",
  );
  const speedTarget = (s) =>
    profile[Math.min(profile.length - 1, Math.max(0, Math.floor(s / 5)))];
  const results = [];
  for (const line of [-16, -8, 0, 8, 16]) {
    const race = new Race(track, 1, "trial", 0, terrain);
    race.countdown = 0;
    let maxSpeedError = 0;
    let squaredError = 0;
    let squaredRelativeError = 0;
    let samples = 0;
    let firstRail = null;
    let saturatedFrames = 0;
    for (
      let step = 0;
      step < 70 * 120 && race.player.contactS < track.length * 0.22;
      step++
    ) {
      const r = race.player;
      const controls = drive(track, r, 1, 0, {
        airEnabled: false,
        line,
        speedTarget,
      });
      if (Math.abs(controls.steer) > 0.999) saturatedFrames++;
      if (r.contactS > track.length * 0.14 && firstRail === null) {
        const error = r.speed - speedTarget(r.contactS);
        maxSpeedError = Math.max(maxSpeedError, Math.abs(error));
        squaredError += error ** 2;
        squaredRelativeError += (error / speedTarget(r.contactS)) ** 2;
        samples++;
      }
      race.update(1 / 120, controls);
      if (r.wallTouched || r.recoveredThisStep) {
        firstRail = {
          u: r.contactS / track.length,
          speed: r.speed,
          target: speedTarget(r.contactS),
          recovered: r.recoveredThisStep,
          shield: r.shield,
        };
        break;
      }
    }
    const completed = race.player.contactS >= track.length * 0.22;
    assert(
      completed || firstRail,
      "replay must finish or report a physical failure, not stall silently",
    );
    results.push({
      line,
      firstRail,
      completed,
      samples,
      maxSpeedError,
      rmsSpeedError: samples ? Math.sqrt(squaredError / samples) : null,
      rmsRelativeSpeedError: samples
        ? Math.sqrt(squaredRelativeError / samples)
        : null,
      saturatedFrames,
    });
  }
  const optimizedLine = results.find((result) => result.line === 8);
  assert(
    optimizedLine.samples > 100,
    "optimized line reached the technical phrase",
  );
  assert(
    optimizedLine.firstRail,
    "matching the clean air pace causes a real rail impact without air",
  );
  assert(
    optimizedLine.rmsRelativeSpeedError < 0.02,
    "pre-impact speed is matched to within two percent RMS",
  );
  assert(
    optimizedLine.saturatedFrames > 0,
    "airless comparison uses maximum available steering",
  );
  t.diagnostic(JSON.stringify(results));
});

for (let speedClass = 0; speedClass < 3; speedClass++) {
  for (let craft = 0; craft < CRAFT.length; craft++) {
    for (const branch of [-1, 1]) {
      test(`VESPER: class ${speedClass + 1} ${CRAFT[craft].name}, fork ${branch}, physically earns a clean lap`, (t) => {
        const race = new Race(track, craft, "trial", speedClass, terrain);
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
        let firstRailU = null;
        let maxSurge = 0;
        let firstRailState = null;
        let forkEntryTime = null;
        let forkExitTime = null;
        for (let step = 0; step < 180 * 120 && r.lap === 1; step++) {
          const controls = drive(track, r, branch, speedClass);
          if (Math.abs(controls.air) > 0.1) airFrames++;
          if (controls.brake > 0.1) brakeFrames++;
          race.update(1 / 120, controls);
          maxSpeed = Math.max(maxSpeed, r.speed);
          maxSurge = Math.max(maxSurge, r.surge);
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
          if (r.wallTouched) {
            touches++;
            firstRailU ??= r.contactS / track.length;
            firstRailState ??= {
              speed: r.speed,
              surge: r.surge,
              boost: r.boost,
              grounded: r.grounded,
              x: r.x,
              brake: controls.brake,
            };
          }
          const u = r.contactS / track.length;
          if (u >= track.config.split[0]) forkEntryTime ??= race.time;
          if (u >= track.config.split[1]) forkExitTime ??= race.time;
          const forkPhase =
            (u - track.config.split[0]) /
            (track.config.split[1] - track.config.split[0]);
          if (forkPhase > 0.45 && forkPhase < 0.55) {
            assert.equal(r.branch, branch);
            forkFrames++;
          }
        }
        t.diagnostic(
          JSON.stringify({
            firstRailState,
            firstRailU,
            maxSurge,
            forkSeconds: forkExitTime - forkEntryTime,
          }),
        );
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
          `clean means no damaging impacts; minimum shield ${minShield}, rail frames ${touches}, first u ${firstRailU}`,
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
