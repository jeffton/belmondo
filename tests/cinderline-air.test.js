import { test, after } from "node:test";
import assert from "node:assert/strict";
import { makeTrack, clamp, mod } from "../src/track.js";
import { Race } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";

const track = makeTrack(5);
const terrain = createTerrain(track);
after(() => terrain.geometries.forEach((geometry) => geometry.dispose()));
const angle = (value) => Math.atan2(Math.sin(value), Math.cos(value));

// External player-input controller: no AI identity, body repositioning, speed
// override or physics changes. Both variants keep exactly the same service
// brake law. Air taps supplement saturated steering, then release immediately.
function inputs(race, airEnabled, { acceleration, steeringGain }) {
  const r = race.player;
  const pace = race.classSpec.pace;
  const u = mod(r.contactS, track.length) / track.length;
  const [start, end] = track.config.split;
  const branch =
    u > start - 0.04 &&
    u < start + (end - start) * 0.3 &&
    (!r.branch || track.bounds(r.contactS, r.branch).connected)
      ? -1
      : r.branch;
  const look = track.frame(
    r.contactS + Math.max(18, (r.speed * 0.8) / pace),
    branch,
  );
  const error = angle(
    Math.atan2(look.p.x - r.position.x, look.p.z - r.position.z) - r.yaw,
  );
  const curve = Math.max(
    ...[0.25, 0.6, 1].map((t) =>
      Math.abs(track.curvature(r.contactS + (r.speed * t) / pace, branch)),
    ),
  );
  const cornerSpeed = Math.sqrt(
    (acceleration * pace * pace) / Math.max(curve, 0.0001),
  );
  const demand = error * steeringGain - (r.yawRate * 0.25) / pace;
  const steer = clamp(demand, -1, 1);
  return {
    throttle: true,
    steer,
    air: airEnabled ? clamp((demand - steer) * 1.8, -1, 1) : 0,
    brake: Math.max(
      clamp((r.speed - cornerSpeed) / (30 * pace), 0, 1),
      Math.abs(error) > 0.7 ? 1 : 0,
    ),
  };
}

function drive(speedClass, airEnabled, tuning) {
  const race = new Race(track, 0, "trial", speedClass, terrain);
  race.countdown = 0;
  let walls = 0;
  let recoveries = 0;
  let airSeconds = 0;
  let brakeSeconds = 0;
  let start = null;
  let end = null;
  for (let step = 0; step < 14400 && race.player.lap < 2; step++) {
    const control = inputs(race, airEnabled, tuning);
    airSeconds += Math.abs(control.air) / 120;
    brakeSeconds += control.brake / 120;
    race.update(1 / 120, control);
    const r = race.player;
    walls += Number(r.wallTouched);
    recoveries += Number(r.recoveredThisStep);
    if (start === null && r.contactS > 0.17 * track.length) start = race.time;
    if (end === null && r.contactS > 0.34 * track.length) end = race.time;
  }
  return {
    time: race.time,
    sector: end - start,
    airSeconds,
    brakeSeconds,
    walls,
    recoveries,
    shield: race.player.shield,
    lap: race.player.lap,
  };
}

test("CINDERLINE: compound valley holds two asymmetric opposing bends inside a tapered deck", () => {
  let first = 0;
  let second = 0;
  for (let u = 0.17; u < 0.245; u += 0.0001) {
    const curve = track.curvature(u * track.length);
    first = Math.max(first, curve);
    second = Math.min(second, curve);
    assert.equal(track.frame(u * track.length).width, 12);
  }
  assert(first > 1 / 180 && first < 1 / 130);
  assert(second < -1 / 115 && second > -1 / 95);
  for (const u of [0.1, 0.3, 0.52, 0.56, 0.65])
    assert.equal(track.frame(u * track.length).width, 20);
});

// Best clean references from a bounded sweep of braking aggressiveness and
// steering gains. No-air was independently tuned, rather than
// merely removing air from the air-enabled driver's inputs. This is a CPU
// control experiment, not a claim of an absolute human lap-time optimum.
for (const speedClass of [0, 2]) {
  test(`CINDERLINE: class ${speedClass + 1} Striker earns a clean competitive air-brake advantage`, (t) => {
    const tuning = [
      { acceleration: 220, steeringGain: 6 },
      { acceleration: 110, steeringGain: 8 },
      { acceleration: 105, steeringGain: 8 },
      { acceleration: 100, steeringGain: 8 },
    ];
    function bestClean(enabled) {
      const clean = tuning
        .map((parameters) => drive(speedClass, enabled, parameters))
        .filter(
          (run) =>
            run.lap === 2 &&
            run.shield === 100 &&
            run.walls === 0 &&
            run.recoveries === 0,
        )
        .sort((a, b) => a.time - b.time);
      assert(clean.length > 0, "a clean ordinary player-input lap is feasible");
      assert(clean[0].brakeSeconds > 0, "service braking stays enabled");
      return clean[0];
    }
    const air = bestClean(true);
    const noAir = bestClean(false);
    assert(air.airSeconds > 0);
    assert.equal(noAir.airSeconds, 0);
    assert(air.sector < noAir.sector);
    assert(air.time < noAir.time);
    t.diagnostic(JSON.stringify({ air, noAir }));
  });
}
