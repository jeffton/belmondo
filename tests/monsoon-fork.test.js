import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeTrack, clamp, mod } from "../src/track.js";
import { Race } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";

const track = makeTrack(4);
const terrain = createTerrain(track);
after(() => terrain.geometries.forEach((geometry) => geometry.dispose()));

test("Monsoon fork changes no crest, spillway, lock, outlet or shared base frames", () => {
  const rows = Array.from({ length: 1000 }, (_, i) =>
    track.frame((i * track.length) / 1000, 0),
  );
  assert.equal(
    createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    "acd548bf47f2ff2b2f0d743a16b0ed3fb97f0d489ab735abfdb947d29ea914ed",
  );
  assert.equal(track.config.layoutId, "monsoon-4");
});

test("low pressure conduit and exposed reservoir route are distinct physical levels with level shared noses", () => {
  for (let u = 0.79; u <= 0.92; u += 0.0005) {
    const low = track.frame(u * track.length, -1);
    const high = track.frame(u * track.length, 1);
    if (track.bounds(u * track.length, -1).connected)
      assert(
        Math.abs(high.p.y - low.p.y) < 0.05,
        "vertical split begins only after physical deck separation",
      );
    if (u >= 0.85 && u <= 0.865) {
      assert(high.p.y - low.p.y > 79, "not merely adjacent same-height lanes");
      assert(track.isTunnel(u * track.length, -1));
      assert.equal(track.isTunnel(u * track.length, 1), false);
      assert.equal(track.isTunnel(u * track.length, 0), false);
    }
    for (const f of [low, high])
      assert(f.p.y - Math.abs(f.right.y * f.width) > 5);
  }
});

// A second, independently tuned steering policy follows each route's real
// optional pickup lane. No surge, speed, position or physical force is assigned.
function pickupLine(race, branch) {
  const r = race.player,
    pace = race.classSpec.pace;
  const u = mod(r.contactS, track.length) / track.length;
  const [start, end] = track.config.split;
  const route =
    u > start - 0.04 && u < start + (end - start) * 0.3 ? branch : r.branch;
  const f = track.frame(
    r.contactS + Math.max(18, (r.speed * 0.85) / pace),
    route,
  );
  const smooth = (value, a, b) => {
    const t = clamp((value - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const lane = smooth(f.u, 0.785, 0.8) * (1 - smooth(f.u, 0.84, 0.86));
  f.p.addScaledVector(f.right, (branch === 1 ? 12 : -4) * lane);
  const heading = Math.atan2(f.p.x - r.position.x, f.p.z - r.position.z);
  const error = Math.atan2(
    Math.sin(heading - r.yaw),
    Math.cos(heading - r.yaw),
  );
  const curve = Math.max(
    ...[0.25, 0.6, 1].map((t) =>
      Math.abs(track.curvature(r.contactS + (r.speed * t) / pace, route)),
    ),
  );
  const target = Math.sqrt((95 * pace * pace) / Math.max(curve, 0.0001));
  return {
    throttle: true,
    steer: clamp(error * 5 - (r.yawRate * 0.15) / pace, -1, 1),
    air: clamp(error * 0.8, -1, 1),
    brake: Math.max(
      clamp((r.speed - target) / (30 * pace), 0, 1),
      Math.abs(error) > 0.7 ? 1 : 0,
    ),
  };
}

function lap(speedClass, branch, turboAt = null, targetPickups = false) {
  const race = new Race(track, 0, "trial", speedClass, terrain);
  race.countdown = 0;
  const r = race.player;
  // Production AI supplies ordinary steering, air and service braking to the
  // same physical body. IDs select the intended fork; movement is never seeded.
  r.id = targetPickups ? 0 : branch === -1 ? 1 : 2;
  r.aiFire = Infinity;
  let start = null,
    end = null,
    forkStart = null,
    forkEnd = null,
    fired = false;
  let covered = 0,
    exposed = 0,
    previousGate = r.gate;
  for (let step = 0; step < 120 * 120 && r.lap < 2; step++) {
    if (turboAt !== null && !fired && r.contactS >= turboAt * track.length) {
      r.weapon = "TURBO";
      race.fire(r);
      fired = true;
    }
    race.update(1 / 120, targetPickups ? pickupLine(race, branch) : {});
    assert.equal(r.recoveredThisStep, false);
    assert(r.gate >= previousGate && r.gate <= previousGate + 1);
    previousGate = r.gate;
    const u = r.contactS / track.length;
    if (u > 0.725 && start === null) start = race.time;
    if (u > 0.97 && end === null) end = race.time;
    if (u > track.config.split[0] && forkStart === null) forkStart = race.time;
    if (u > track.config.split[1] && forkEnd === null) forkEnd = race.time;
    if (u > 0.79 && u < 0.92) {
      if (!track.bounds(r.contactS, branch).connected)
        assert.equal(r.branch, branch);
      assert(
        r.grounded,
        "the actual covered roof remains safely above a grounded hull, including under TURBO",
      );
      assert.equal(r.wallTouched, false);
      if (track.isTunnel(r.contactS, r.branch)) covered++;
      else exposed++;
    }
  }
  assert.equal(r.lap, 2);
  assert.equal(r.gate, 33);
  assert.equal(r.shield, 100);
  assert(
    start !== null && end !== null && forkStart !== null && forkEnd !== null,
  );
  if (branch === -1) assert(covered > 200);
  else assert.equal(covered, 0);
  assert(exposed > 20);
  if (turboAt !== null) assert(fired);
  if (targetPickups) {
    const branchPad = race.pickups.find((pad) => pad.branch === branch);
    assert(
      r.collectedPickups.has(`1:${branchPad.id}`),
      "the measured pickup tradeoff is physically earned on both routes",
    );
  }
  const highBoost = race.pickups.find(
    (pad) => pad.branch === 1 && pad.type === "boost",
  );
  if (branch === 1)
    assert(
      r.collectedPickups.has(`1:${highBoost.id}`),
      "upper-route acceleration is actually collected, not a theoretical balancing bonus",
    );
  return {
    approachAndFork: end - start,
    forkOnly: forkEnd - forkStart,
    fullLap: race.time,
    shield: r.shield,
    covered,
    exposed,
    pads: [...r.collectedPickups],
  };
}

for (const speedClass of [0, 2]) {
  test(`class ${speedClass + 1}: genuinely different forks earn comparable real times with their authored pickups`, (t) => {
    const low = lap(speedClass, -1);
    const high = lap(speedClass, 1);
    // This is a route fairness budget, not a speed multiplier or forced equality.
    assert(
      Math.abs(high.approachAndFork - low.approachAndFork) <
        0.5 / (speedClass === 0 ? 1 : 1.4),
      "neither route is a super-shortcut",
    );
    t.diagnostic(JSON.stringify({ low, high }));
  });
}
for (const speedClass of [0, 2]) {
  test(`class ${speedClass + 1}: deliberate weapon/boost lines remain clean and balanced with independent steering tuning`, (t) => {
    const low = lap(speedClass, -1, null, true);
    const high = lap(speedClass, 1, null, true);
    assert(
      Math.abs(high.approachAndFork - low.approachAndFork) <
        0.5 / (speedClass === 0 ? 1 : 1.4),
    );
    t.diagnostic(JSON.stringify({ low, high }));
  });
}

for (const branch of [-1, 1]) {
  test(`class 3, fork ${branch}: crest and merge retain real deck contact under apex TURBO`, (t) => {
    t.diagnostic(JSON.stringify(lap(2, branch, 0.845)));
  });
}
