import { after, test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack, clamp, mod } from "../src/track.js";
import { Race } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";

const track = makeTrack(4);
const terrain = createTerrain(track);
after(() => terrain.geometries.forEach((geometry) => geometry.dispose()));

test("Monsoon outlet has opposite readable technical turns separated by a real 220m setup", () => {
  const first = track.frame(0.629 * track.length);
  const second = track.frame(0.69 * track.length);
  assert(track.curvature(0.629 * track.length) > 1 / 120);
  assert(track.curvature(0.69 * track.length) < -1 / 125);
  assert(
    first.p.y > 20 && second.p.y > first.p.y,
    "technical sequence climbs after the plunge",
  );
  assert(Math.abs(first.bank) > 0.1 && Math.abs(second.bank) > 0.1);
  const points = track.config.points;
  const a = points.findIndex(([x, , z]) => x === -140 && z === -710);
  assert(a >= 0);
  assert.equal(
    Math.hypot(
      points[a + 1][0] - points[a][0],
      points[a + 1][2] - points[a][2],
    ),
    220,
  );
  for (let u = 0.653; u < 0.67; u += 0.0005)
    assert(
      Math.abs(track.curvature(u * track.length)) < 1 / 200,
      "setup is not another disguised hairpin",
    );
  assert(
    track.config.sections.technicalOutlet[1] + 0.03 < track.config.split[0],
    "fork choice follows the technical exit, not its apex",
  );
});

// Same production AI feedback law and authored pickup approach in both arms;
// only air authority differs. Service brakes stay active in BOTH. This fixed-
// controller boosted-entry regression does not establish optimal no-air pace.
function controls(race, branch, airEnabled) {
  const r = race.player;
  const pace = race.classSpec.pace;
  const u = mod(r.contactS, track.length) / track.length;
  const [start, end] = track.config.split;
  const intended =
    u > start - 0.04 && u < start + (end - start) * 0.3 ? branch : r.branch;
  const look = track.frame(
    r.contactS + Math.max(18, (r.speed * 0.65) / pace),
    intended,
  );
  // Take the optional edge boost through ordinary steering, then release back
  // toward the centre before the technical entry. Both arms follow this line.
  const smooth = (value, start, end) => {
    const t = clamp((value - start) / (end - start), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const boostLane =
    smooth(look.u, 0.52, 0.55) * (1 - smooth(look.u, 0.585, 0.605));
  look.p.addScaledVector(look.right, -9 * boostLane);
  const heading = Math.atan2(look.p.x - r.position.x, look.p.z - r.position.z);
  const error = Math.atan2(
    Math.sin(heading - r.yaw),
    Math.cos(heading - r.yaw),
  );
  const curve = Math.max(
    ...[0.25, 0.6, 1].map((t) =>
      Math.abs(track.curvature(r.contactS + (r.speed * t) / pace, intended)),
    ),
  );
  const cornerSpeed = Math.sqrt((82 * pace * pace) / Math.max(curve, 0.0001));
  return {
    throttle: true,
    steer: clamp(error * 2.5 - (r.yawRate * 0.25) / pace, -1, 1),
    air: airEnabled ? clamp(error * 0.8, -1, 1) : 0,
    brake: Math.max(
      clamp((r.speed - cornerSpeed) / (30 * pace), 0, 1),
      Math.abs(error) > 0.7 ? 1 : 0,
    ),
  };
}

function lap(speedClass, branch, airEnabled) {
  const race = new Race(track, 0, "trial", speedClass, terrain);
  race.countdown = 0;
  let start = null,
    end = null,
    brakeUse = 0,
    maxSteer = 0,
    separated = 0,
    wallSteps = 0,
    shieldLoss = 0,
    entry = null,
    firstWall = null;
  const boost = race.pickups.find((pad) => pad.u === 0.585);
  assert.equal(boost.type, "boost");
  assert.equal(boost.lateral, -7);
  let previousGate = race.player.gate;
  for (let step = 0; step < 120 * 120 && race.player.lap < 2; step++) {
    const input = controls(race, branch, airEnabled);
    const previousShield = race.player.shield;
    race.update(1 / 120, input);
    const r = race.player;
    shieldLoss += Math.max(0, previousShield - r.shield);
    assert.equal(r.recoveredThisStep, false);
    assert(r.gate >= previousGate && r.gate <= previousGate + 1);
    previousGate = r.gate;
    if (r.contactS > 0.6 * track.length && start === null) {
      start = race.time;
      assert(
        r.collectedPickups.has(`1:${boost.id}`),
        "the real optional edge pad was physically crossed",
      );
      assert(
        r.surge > 0,
        "the boosted entry was earned, not assigned by the test",
      );
      entry = { speed: r.speed, x: r.x, surge: r.surge, boost: r.boost };
    }
    if (r.contactS > 0.74 * track.length && end === null) end = race.time;
    if (start !== null && end === null) {
      brakeUse += input.brake;
      maxSteer = Math.max(maxSteer, Math.abs(input.steer));
      assert(r.grounded, "the technical sector remains on its real road deck");
      if (r.wallTouched) {
        wallSteps++;
        if (firstWall === null) {
          const frame = track.frame(r.contactS, r.branch);
          firstWall = {
            u: r.contactS / track.length,
            position: r.position.toArray(),
            deck: frame.p.toArray(),
            terrainY: terrain.heightAt(r.position.x, r.position.z),
            x: r.x,
            halfWidth: frame.width,
            bank: frame.bank,
            shieldLoss: previousShield - r.shield,
          };
        }
      }
    }
    const u = r.contactS / track.length;
    if (
      u > track.config.split[0] &&
      u < track.config.split[1] &&
      !track.bounds(r.contactS, branch).connected
    ) {
      assert.equal(r.branch, branch);
      separated++;
    }
  }
  assert.equal(race.player.lap, 2);
  assert.equal(race.player.gate, 33);
  assert(separated > 20);
  assert(start !== null && end !== null);
  assert(brakeUse > 100, "ordinary service braking was genuinely exercised");
  return {
    sector: end - start,
    time: race.time,
    shield: race.player.shield,
    brakeUse,
    maxSteer,
    boostPad: boost.id,
    entry,
    wallSteps,
    shieldLoss,
    firstWall,
  };
}

for (let speedClass = 0; speedClass < 3; speedClass++) {
  for (const branch of [-1, 1]) {
    test(`class ${speedClass + 1}, fork ${branch}: actual edge-boost entry rewards air with service brakes in both arms`, (t) => {
      const air = lap(speedClass, branch, true);
      const steerOnly = lap(speedClass, branch, false);
      assert.equal(air.boostPad, steerOnly.boostPad);
      assert(
        air.shield > 99,
        "air-assisted boosted entry avoids substantial rail damage",
      );
      assert(
        air.sector < steerOnly.sector * 0.96,
        "this boosted-entry controller regression retains its >4% air advantage",
      );
      assert(
        steerOnly.maxSteer > 0.99 && air.maxSteer < 0.9,
        "ordinary steering saturates where air adds yaw authority",
      );
      t.diagnostic(JSON.stringify({ air, steerOnly }));
    });
  }
}
