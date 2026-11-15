import { after, test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACK_INDEX } from "../src/track.js";
import { Race } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";

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
