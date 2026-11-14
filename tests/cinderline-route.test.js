import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NEW_COURSES } from "../src/course-layouts.js";
import { TRACKS, makeTrack, TRACK_INDEX } from "../src/track.js";
import { Race } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";

const track = makeTrack(TRACK_INDEX.CINDERLINE);
const terrain = createTerrain(track);
after(() => terrain.geometries.forEach((geometry) => geometry.dispose()));

test("CINDERLINE: integrated Whiteout and Monsoon configurations match accepted fixtures", () => {
  // Intentional Whiteout-2 and Monsoon-4 integration snapshot.
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(NEW_COURSES.slice(0, 2)))
      .digest("hex"),
    "d33dad62aaad8ab195bdb4de7596510988609eafe2f1836566422c1294744843",
  );
  assert.equal(
    TRACKS[TRACK_INDEX.CINDERLINE].layoutId,
    "cinderline-2-finish-end",
  );
});

test("CINDERLINE: visible setup, real gap, downhill landing and asymmetric fork", () => {
  const { jump, gapLength, ramp, sections, split, branchWidths } = track.config;
  assert(sections.runway[0] < ramp.start);
  assert.equal(ramp.start + ramp.length, jump);
  assert(gapLength * track.length > 100);
  assert((sections.runway[1] - jump - gapLength) * track.length > 800);
  const launch = track.frame((jump - 0.001) * track.length);
  const landing = track.frame((jump + gapLength + 0.002) * track.length);
  assert(launch.tangent.y > 0, "real uphill launch velocity");
  assert(landing.tangent.y < -0.03, "aligned downhill landing");
  assert(
    launch.tangent
      .clone()
      .setY(0)
      .normalize()
      .dot(landing.tangent.clone().setY(0).normalize()) > 0.9999,
  );
  assert(branchWidths[0] + 8 < branchWidths[1]);
  assert(track.physicalLengths[-1] + 100 < track.physicalLengths[1]);
  const midpoint = ((split[0] + split[1]) / 2) * track.length;
  assert(track.frame(midpoint, 1).p.y > track.frame(midpoint, -1).p.y + 30);
  for (let u = 0; u < 1; u += 0.0002)
    for (const branch of [-1, 1])
      assert(
        Math.abs(track.curvature(u * track.length, branch)) <=
          1 / (u >= 0.17 && u <= 0.34 ? 95 : 150),
      );
});

for (let speedClass = 0; speedClass < 3; speedClass++) {
  for (let craft = 0; craft < 3; craft++) {
    for (const branch of [-1, 1]) {
      for (const turbo of [false, true]) {
        test(`CINDERLINE: class ${speedClass + 1}, craft ${craft}, fork ${branch}, TURBO ${turbo} earns flight and landing`, () => {
          const race = new Race(track, craft, "trial", speedClass, terrain);
          race.countdown = 0;
          const r = race.player;
          r.id = branch === -1 ? 1 : 2;
          r.aiFire = Infinity;
          let fired = false;
          let gapAir = 0;
          let landed = false;
          let airborne = false;
          let forkFrames = 0;
          let lastGate = r.gate;
          for (let step = 0; step < 14400 && r.lap < 2; step++) {
            if (turbo && !fired && r.contactS > 0.512 * track.length) {
              r.weapon = "TURBO";
              race.fire(r);
              fired = true;
            }
            race.update(1 / 120, {});
            assert.equal(r.recoveredThisStep, false);
            assert(r.gate >= lastGate && r.gate <= lastGate + 1);
            lastGate = r.gate;
            assert(r.position.toArray().every(Number.isFinite));
            const u = r.contactS / track.length;
            if (track.gap(u) && !r.grounded) {
              gapAir++;
              airborne = true;
            }
            if (
              airborne &&
              r.grounded &&
              u > track.config.jump + track.config.gapLength &&
              u < 0.65
            )
              landed = true;
            if (u > 0.79 && u < 0.87) {
              assert.equal(r.branch, branch);
              forkFrames++;
            }
          }
          assert.equal(r.lap, 2);
          assert.equal(r.gate, 33);
          assert(gapAir > 15, "actual body spends time in the missing deck");
          assert(landed, "actual body lands on the aligned downhill deck");
          assert(forkFrames > 20);
          assert(r.shield > 0, "the stock AI completes without a wipeout");
          assert.equal(fired, turbo);
          assert(
            r.surge < 3,
            "finite TURBO timer, not a permanent speed override",
          );
        });
      }
    }
  }
}
