import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { TRACKS, makeTrack } from "../src/track.js";
import { Race } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";

// Exact complete configuration snapshots from main d9e86c6, not only IDs.
const unchanged = {
  0: "5aa22f84e77d8866bc8f970a6191500ca8a8964373590df5e2b50c40e34546b7",
  1: "65904238fda6ac54a165a7e3db2f24d9dbc29445fa3e6f7105f5ce7d37b77da8",
  2: "0ed50c5e9e67597f8f01cc3f21cfe37e5a2c6d953a0944b9b2f6379976067160",
  3: "9b5ee8b38010d2bca751f7f1c513c0bc1575a5790ba64987f4bf62e2fd7b6bcc",
  5: "abed34f0b015ad47414600cfe4e539d42fffb67761e4da754faeb5d4b78fb7da",
};
test("Monsoon reauthoring leaves all five other configurations exactly intact", () => {
  for (const [index, hash] of Object.entries(unchanged))
    assert.equal(
      createHash("sha256").update(JSON.stringify(TRACKS[index])).digest("hex"),
      hash,
    );
});

const track = makeTrack(4);
const terrain = createTerrain(track);
after(() => terrain.geometries.forEach((geometry) => geometry.dispose()));
test("spillway is a steep continuous dry descent with a low curved lock and climbing fork", () => {
  assert.equal(track.config.layoutId, "monsoon-2");
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
      assert(Math.abs(track.curvature(u * track.length, branch)) <= 1 / 150);
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
    Math.abs(track.curvature(0.5 * track.length)) > 1 / 500,
    "lock is a physical bend, not a straight trench",
  );
  for (const branch of [-1, 1]) {
    assert(
      track.frame(0.86 * track.length, branch).p.y -
        track.frame(0.68 * track.length, branch).p.y >
        130,
    );
    assert(Math.abs(track.frame(0.8 * track.length, branch).bank) > 0.02);
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
    for (const turboAt of [null, 0.1, 0.15, 0.22, 0.68, 0.8]) {
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
            u > 0.68 &&
            u < 0.86 &&
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
