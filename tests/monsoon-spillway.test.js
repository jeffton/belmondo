import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { TRACKS, makeTrack, TRACK_INDEX } from "../src/track.js";
import { Race } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";

// Intentional integrated legacy-v4, Whiteout-2, Cinderline-2 and Vesper configs.
const unchanged = {
  [TRACK_INDEX.COAST]:
    "ccb3d5351736806ceef9ce3d89231eff87b121a9cbe1e53c829a400c3e6702ba",
  [TRACK_INDEX.SOLAR]:
    "d1a4f918838d752ec499ab451d58502eb0ea2722df44186d5a0ab42c06393be4",
  [TRACK_INDEX.NOCTILUCENT]:
    "e6fb6ea0c7709b5f1d71ab5901bf381cf9f1bbabc324a9fb81e4c3bb4c300ef5",
  [TRACK_INDEX.WHITEOUT]:
    "40cfe755a8ac3d13b07c34c573fbbe04ee664f854ba1508d124aa3ac64261e8f",
  [TRACK_INDEX.CINDERLINE]:
    "7d68b1bb0ed934cf222faa78fdb5e403dad98e0fb2c281615e376fa36debab56",
  [TRACK_INDEX.VESPER]:
    "344855ae9bcd3c7a939c68cb6d520778f96df9f96b914eb48366622896b266ae",
};
test("the other six integrated course configurations match their accepted authored versions", () => {
  for (const [index, hash] of Object.entries(unchanged))
    assert.equal(
      createHash("sha256").update(JSON.stringify(TRACKS[index])).digest("hex"),
      hash,
    );
});

const track = makeTrack(TRACK_INDEX.MONSOON);
const terrain = createTerrain(track);
after(() => terrain.geometries.forEach((geometry) => geometry.dispose()));
test("spillway is a steep continuous dry descent with a low curved lock and climbing fork", () => {
  assert.equal(track.config.layoutId, "monsoon-4-finish-end");
  assert.equal(track.config.jump, null);
  let steepest = 0;
  for (let i = 0; i < 12000; i++) {
    const u = i / 12000;
    for (const branch of [-1, 0, 1]) {
      const f = track.frame(u * track.length, branch);
      assert(
        f.p.y - Math.abs(f.right.y * f.width) >= 5,
        "both banked deck edges stay clear of the ocean plane",
      );
      assert(Math.abs(track.curvature(u * track.length, branch)) <= 1 / 80);
      assert.equal(track.gap(u), false);
      if (u >= 0.12 && u <= 0.2)
        steepest = Math.max(steepest, -Math.asin(f.tangent.y));
      if (u >= 0.25 && u <= 0.56)
        assert(f.p.y < 12, "dry lock lies below retained water at 42m");
    }
  }
  assert(steepest > (25 * Math.PI) / 180 && steepest < (30 * Math.PI) / 180);
  const [diveStart, diveEnd] = track.config.sections.spillwayDive;
  for (let u = diveStart; u < diveEnd; u += 0.0005) {
    const current = track.frame(u * track.length);
    const next = track.frame((u + 0.0005) * track.length);
    assert(
      next.p.y < current.p.y,
      "authored spillway descent is continuously downhill",
    );
  }
  assert(track.frame(0.1 * track.length).p.y > 190);
  assert(track.frame(0.2 * track.length).p.y < 10);
  assert(
    track
      .frame(0.4 * track.length)
      .tangent.angleTo(track.frame(0.55 * track.length).tangent) > 0.8,
    "lock is a physical bend, not a straight trench",
  );
  for (const branch of [-1, 1]) {
    assert(
      track.frame(track.config.split[1] * track.length, branch).p.y -
        track.frame(track.config.split[0] * track.length, branch).p.y >
        65,
    );
    assert(Math.abs(track.frame(0.83 * track.length, branch).bank) > 0.02);
  }
});

for (let speedClass = 0; speedClass < 3; speedClass++) {
  test(`class ${speedClass + 1}: unpowered hull physically descends the spillway`, () => {
    const race = new Race(track, 0, "trial", speedClass, terrain);
    race.countdown = 0;
    const r = race.player;
    const s = 0.15 * track.length;
    const f = track.frame(s);
    r.position.copy(f.p).addScaledVector(f.up, 2.2);
    r.s = r.contactS = s;
    r.gate = Math.floor((s / track.length) * 32) + 1;
    r.checkpoint = { s, branch: 0, gate: r.gate };
    r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
    const initialSpeed = 25 * race.classSpec.pace;
    r.velocity.copy(f.tangent).multiplyScalar(initialSpeed);
    r.speed = initialSpeed;
    for (let step = 0; step < 30; step++)
      race.update(1 / 120, { throttle: false });
    assert.equal(r.recoveredThisStep, false);
    assert.equal(r.shield, 100);
    assert(
      r.position.y < f.p.y - 0.5,
      "the body loses real height without engine thrust",
    );
    assert(r.velocity.y < -5 * race.classSpec.pace);
    assert(
      r.contactS > s + 4,
      "motion follows the slope rather than falling through it",
    );
  });
  for (const branch of [-1, 1]) {
    for (const turboAt of [null, 0.1, 0.15, 0.22, 0.63, 0.68, 0.8]) {
      test(`class ${speedClass + 1}, fork ${branch}, TURBO ${turboAt}: real-terrain full lap`, (t) => {
        const race = new Race(track, 0, "trial", speedClass, terrain);
        race.countdown = 0;
        const r = race.player;
        r.id = branch === -1 ? 1 : 2;
        r.aiFire = Infinity;
        let fired = false,
          separated = 0,
          airborne = 0,
          previousGate = r.gate;
        for (let step = 0; step < 120 * 120 && r.lap < 2; step++) {
          if (
            turboAt !== null &&
            !fired &&
            r.contactS >= turboAt * track.length
          ) {
            r.weapon = "TURBO";
            race.fire(r);
            fired = true;
          }
          race.update(1 / 120, {});
          assert.equal(
            r.recoveredThisStep,
            false,
            "no checkpoint rescue substitutes for driving",
          );
          assert(r.gate >= previousGate && r.gate <= previousGate + 1);
          previousGate = r.gate;
          if (!r.grounded) airborne++;
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
        assert.equal(r.lap, 2);
        assert.equal(r.gate, 33);
        assert(separated > 20);
        assert.equal(
          airborne,
          0,
          "crest and compression retain contact even under TURBO",
        );
        assert(
          r.shield > 95,
          "the dramatic line remains clean even when boosted",
        );
        if (turboAt !== null) assert(fired);
        t.diagnostic(
          JSON.stringify({ time: race.time, shield: r.shield, airborne }),
        );
      });
    }
  }
}
