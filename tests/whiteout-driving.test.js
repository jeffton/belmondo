import { after, test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack, clamp, mod } from "../src/track.js";
import { Race } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";

const track = makeTrack(3);
const terrain = createTerrain(track);
after(() => terrain.geometries.forEach((geometry) => geometry.dispose()));

test("WHITEOUT: descending counterturns and crest esses demand substantial steering reversals", () => {
  for (const section of ["iceCounterturn", "crestEsses"]) {
    const [start, end] = track.config.sections[section];
    let previous = 0;
    let reversals = 0;
    const heading = { "-1": 0, 1: 0 };
    for (let u = start; u < end; u += 0.0002) {
      const f = track.frame(u * track.length);
      const curvature = track.curvature(u * track.length);
      const sign = Math.abs(curvature) > 1 / 700 ? Math.sign(curvature) : 0;
      if (sign) {
        if (previous && sign !== previous) reversals++;
        previous = sign;
        heading[sign] += Math.abs(curvature) * track.length * 0.0002 * f.metric;
      }
    }
    assert(reversals >= 2, `${section}: linked opposite-lock turns`);
    assert(
      heading[-1] > 0.35 && heading[1] > 0.35,
      `${section}: real heading changes`,
    );
  }
  assert(
    track.frame(0.15 * track.length).p.y -
      track.frame(0.33 * track.length).p.y >
      80,
  );
  assert(
    track.config.sections.returnValley[0] >= 0.6,
    "return is a compact crest/turn sequence, not half a lap of empty valley",
  );
});

test("WHITEOUT: rim gallery trades a longer broad line for the narrower low shortcut", () => {
  const [start, end] = track.config.split;
  const mid = ((start + end) / 2) * track.length;
  const low = track.frame(mid, 1);
  const high = track.frame(mid, -1);
  assert(Math.abs(high.p.y - low.p.y - 72) < 0.1);
  assert(high.width - low.width >= 3.9);
  assert(track.physicalLengths[-1] - track.physicalLengths[1] > 300);
  for (const u of [start, end]) {
    assert(
      track
        .frame(u * track.length, -1)
        .p.distanceTo(track.frame(u * track.length, 1).p) < 0.001,
    );
  }
});

test("WHITEOUT: both routes keep broad readable curvature, continuous banks and terrain clearance", () => {
  for (const branch of [-1, 1]) {
    for (let i = 0; i < 5000; i++) {
      const s = (i / 5000) * track.length;
      const f = track.frame(s, branch);
      const next = track.frame(s + 3, branch);
      assert(
        Math.abs(track.curvature(s, branch)) <= 1 / 85,
        `radius at ${f.u}, branch ${branch}`,
      );
      assert(
        f.p.distanceTo(track.frame(s + 0.01, branch).p) < 0.02,
        "no positional discontinuity in the continuous deck",
      );
      assert(f.tangent.dot(next.tangent) > 0.995, "continuous road heading");
      assert(Math.abs(f.bank - next.bank) < 0.02);
      assert.equal(track.gap(f.u), false);
      if (i % 10 === 0) {
        for (const side of [-0.75, 0, 0.75]) {
          const p = f.p.clone().addScaledVector(f.right, side * f.width);
          assert(
            terrain.heightAt(p.x, p.z) < p.y - 1,
            `terrain clearance at ${f.u}, branch ${branch}`,
          );
        }
      }
    }
  }
});

test("WHITEOUT: C3 ordinary-input airbrakes reward a clean faster lap with service braking available in both runs", (t) => {
  function lap(airEnabled) {
    const race = new Race(track, 0, "trial", 2, terrain);
    race.countdown = 0;
    const r = race.player;
    let steps = 0;
    let railFrames = 0;
    for (; steps < 180 * 120 && r.lap < 2; steps++) {
      const pace = race.classSpec.pace;
      const u = mod(r.contactS, track.length) / track.length;
      const [start, end] = track.config.split;
      const choosing = u > start - 0.04 && u < start + (end - start) * 0.3;
      const branch =
        choosing && (!r.branch || track.bounds(r.contactS, r.branch).connected)
          ? -1
          : r.branch;
      const look = track.frame(
        r.contactS + Math.max(18, (r.speed * 0.65) / pace),
        branch,
      );
      const heading = Math.atan2(
        look.p.x - r.position.x,
        look.p.z - r.position.z,
      );
      const error = Math.atan2(
        Math.sin(heading - r.yaw),
        Math.cos(heading - r.yaw),
      );
      const curvature = Math.max(
        ...[0.25, 0.6, 1].map((dt) =>
          Math.abs(track.curvature(r.contactS + (r.speed * dt) / pace, branch)),
        ),
      );
      const cornerSpeed = Math.sqrt(
        (82 * pace * pace) / Math.max(curvature, 0.0001),
      );
      // Identical ordinary controls and service-brake policy. Only the paired
      // airbrake ability changes; neither run disables the service brake.
      race.update(1 / 120, {
        throttle: true,
        steer: clamp(error * 2.5 - (r.yawRate * 0.25) / pace, -1, 1),
        air: airEnabled ? clamp(error * 0.8, -1, 1) : 0,
        brake: Math.max(
          clamp((r.speed - cornerSpeed) / (30 * pace), 0, 1),
          Math.abs(error) > 0.7 ? 1 : 0,
        ),
      });
      assert.equal(r.recoveredThisStep, false);
      if (r.wallTouched) railFrames++;
    }
    assert.equal(r.lap, 2);
    return { seconds: steps / 120, shield: r.shield, railFrames };
  }
  const withAir = lap(true);
  const withoutAir = lap(false);
  t.diagnostic(JSON.stringify({ withAir, withoutAir }));
  assert.equal(withAir.railFrames, 0);
  assert(withoutAir.railFrames > 0);
  assert(withAir.shield > withoutAir.shield);
  assert(withAir.seconds < withoutAir.seconds);
});

for (let speedClass = 0; speedClass < 3; speedClass++) {
  for (const branch of [-1, 1]) {
    for (const boostAt of [null, 0.19, 0.42, 0.7]) {
      test(`WHITEOUT: class ${speedClass + 1}, fork ${branch}, TURBO ${boostAt} earns a real terrain-aware lap`, () => {
        const race = new Race(track, 0, "trial", speedClass, terrain);
        race.countdown = 0;
        const r = race.player;
        r.id = branch === -1 ? 1 : 2;
        r.aiFire = Infinity;
        let fired = false;
        let separated = 0;
        let lastGate = r.gate;
        for (let step = 0; step < 180 * 120 && r.lap < 2; step++) {
          if (
            boostAt !== null &&
            !fired &&
            r.contactS >= boostAt * track.length
          ) {
            r.weapon = "TURBO";
            race.fire(r);
            fired = true;
          }
          race.update(1 / 120, {});
          assert.equal(r.recoveredThisStep, false, "no checkpoint rescue");
          assert(
            r.gate >= lastGate && r.gate <= lastGate + 1,
            "consecutive physical gates only",
          );
          lastGate = r.gate;
          const u = r.contactS / track.length;
          if (
            u > track.config.split[0] + 0.04 &&
            u < track.config.split[1] - 0.04
          ) {
            assert.equal(r.branch, branch);
            separated++;
          }
        }
        assert.equal(r.lap, 2);
        assert.equal(r.gate, 33);
        assert(separated > 20);
        assert(r.shield > 95, "no sustained rail collisions");
        if (boostAt !== null) assert(fired);
      });
    }
  }
}
