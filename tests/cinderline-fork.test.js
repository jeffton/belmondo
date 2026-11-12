import { after, test } from "node:test";
import assert from "node:assert/strict";
import { MathUtils } from "three";
import { makeTrack, clamp, mod } from "../src/track.js";
import { Race } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";

const track = makeTrack(5);
const terrain = createTerrain(track);
after(() => terrain.geometries.forEach((geometry) => geometry.dispose()));

function controls(race, targetBranch, aimPickup) {
  const r = race.player;
  const pace = race.classSpec.pace;
  const u = mod(r.contactS, track.length) / track.length;
  const [start, end] = track.config.split;
  const branch =
    u > start - 0.04 &&
    u < start + (end - start) * 0.3 &&
    (!r.branch || track.bounds(r.contactS, r.branch).connected)
      ? targetBranch
      : r.branch;
  const lookDistance = Math.max(18, (r.speed * 0.8) / pace);
  const look = track.frame(r.contactS + lookDistance, branch);
  if (aimPickup) {
    const ahead = (r.contactS + lookDistance) / track.length;
    const station = targetBranch === -1 ? 0.79 : 0.83;
    const aim =
      MathUtils.smoothstep(ahead, station - 0.035, station - 0.01) *
      (1 - MathUtils.smoothstep(ahead, station + 0.01, station + 0.035));
    // Aim the lookahead to account for the body's turning inertia; the actual
    // hull must still cross the ordinary shared pickup polygon.
    look.p.addScaledVector(look.right, (targetBranch === -1 ? -7 : 10) * aim);
  }
  const heading = Math.atan2(look.p.x - r.position.x, look.p.z - r.position.z);
  const error = Math.atan2(
    Math.sin(heading - r.yaw),
    Math.cos(heading - r.yaw),
  );
  const curve = Math.max(
    ...[0.25, 0.6, 1].map((t) =>
      Math.abs(track.curvature(r.contactS + (r.speed * t) / pace, branch)),
    ),
  );
  const demand = error * 6 - (r.yawRate * 0.25) / pace;
  const steer = clamp(demand, -1, 1);
  const cornerSpeed = Math.sqrt((220 * pace * pace) / Math.max(curve, 0.0001));
  return {
    throttle: true,
    steer,
    air: clamp((demand - steer) * 1.8, -1, 1),
    brake: Math.max(
      clamp((r.speed - cornerSpeed) / (30 * pace), 0, 1),
      Math.abs(error) > 0.7 ? 1 : 0,
    ),
  };
}

function run(speedClass, branch, aimPickup) {
  const race = new Race(track, 0, "trial", speedClass, terrain);
  race.countdown = 0;
  let enter = null;
  let exit = null;
  let walls = 0;
  let recoveries = 0;
  for (let step = 0; step < 14400 && race.player.lap < 2; step++) {
    race.update(1 / 120, controls(race, branch, aimPickup));
    const r = race.player;
    const u = r.contactS / track.length;
    if (enter === null && u >= 0.75) enter = race.time;
    if (exit === null && u >= 0.91) exit = race.time;
    walls += Number(r.wallTouched);
    recoveries += Number(r.recoveredThisStep);
  }
  assert.equal(race.player.lap, 2);
  assert.equal(race.player.shield, 100);
  assert.equal(walls, 0);
  assert.equal(recoveries, 0);
  return {
    sector: exit - enter,
    time: race.time,
    pickups: [...race.player.collectedPickups],
  };
}

for (const speedClass of [0, 2]) {
  test(`CINDERLINE: C${speedClass + 1} upper-rim boost earns back distance against lower-cut armament`, (t) => {
    const lower = run(speedClass, -1, true);
    const upper = run(speedClass, 1, true);
    const missedUpper = run(speedClass, 1, false);
    assert(
      lower.pickups.includes("1:CINDERLINE:5"),
      "lower weapon silhouette was crossed",
    );
    assert(!lower.pickups.includes("1:CINDERLINE:6"));
    assert(
      upper.pickups.includes("1:CINDERLINE:6"),
      "upper boost was physically collected",
    );
    assert(!upper.pickups.includes("1:CINDERLINE:5"));
    assert(!missedUpper.pickups.includes("1:CINDERLINE:6"));
    assert(upper.sector < missedUpper.sector);
    assert(
      Math.abs(upper.sector - lower.sector) <
        Math.abs(missedUpper.sector - lower.sector),
    );
    t.diagnostic(JSON.stringify({ lower, upper, missedUpper }));
  });
}
