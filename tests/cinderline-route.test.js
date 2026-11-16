import { test, after } from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { Race } from "../src/race.ts";
import { createTerrain } from "../src/terrain.ts";

const track = makeTrack(TRACK_INDEX.CINDERLINE);
const terrain = createTerrain(track);
after(() => terrain.geometries.forEach((geometry) => geometry.dispose()));

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
  assert(branchWidths[0] < branchWidths[1], "gorge is narrower than the rim");
  assert(
    track.physicalLengths[-1] < track.physicalLengths[1],
    "shorter technical gorge competes with the longer flowing rim",
  );
  const midpoint = ((split[0] + split[1]) / 2) * track.length;
  assert(track.frame(midpoint, 1).p.y > track.frame(midpoint, -1).p.y + 30);
  // Accepted d615c52 deck positions preserve this existing corner and the
  // +/-6-station window used by curvature; they are not a relaxed radius bound.
  const acceptedCorner = [
    [0.1485, -6, 949.6233223265536, 34.9638993704017, 1100.1190917646582],
    [0.1485, 0, 946.1472698193111, 34.63854501667729, 1101.172324789052],
    [0.1485, 6, 942.6842330073791, 34.329522127325994, 1102.133028600525],
    [0.14875, -6, 948.3318701468588, 34.84146789901864, 1100.5195178928143],
    [0.14875, 0, 944.8605989183965, 34.522219479539274, 1101.5381022183924],
    [0.14875, 6, 941.4025208296847, 34.21913408152838, 1102.4653108389775],
    [0.149, -6, 947.0421069831049, 34.72122860125672, 1100.9074867054624],
    [0.149, 0, 943.5756819649016, 34.408028076472156, 1101.8918222127356],
    [0.149, 6, 939.7031807041125, 34.07621389953477, 1102.8858434352926],
  ];
  for (const [u, offset, ...expected] of acceptedCorner)
    for (const branch of [-1, 1])
      assert.deepEqual(
        track.frame(u * track.length + offset, branch).p.toArray(),
        expected,
        "the accepted common-deck corner remains unchanged",
      );
  // Integer sampling includes the exception boundary without accumulated drift.
  for (let i = 0; i < 5000; i++) {
    const u = i / 5000;
    for (const branch of [-1, 1]) {
      const reported = Math.abs(track.curvature(u * track.length, branch));
      if (u >= 0.1485 && u <= 0.149) {
        const s = u * track.length;
        const a = track.frame(s - 6, branch);
        const b = track.frame(s, branch);
        const c = track.frame(s + 6, branch);
        const ab = b.p.clone().sub(a.p).setY(0);
        const bc = c.p.clone().sub(b.p).setY(0);
        const ac = c.p.clone().sub(a.p).setY(0);
        const oracle =
          (2 * Math.abs(ab.x * bc.z - ab.z * bc.x)) /
          (ab.length() * bc.length() * ac.length());
        const stationRate =
          Math.abs(
            Math.atan2(
              a.tangent.z * c.tangent.x - a.tangent.x * c.tangent.z,
              a.tangent.dot(c.tangent),
            ),
          ) / 12;
        assert(
          Math.abs(reported - oracle) < Math.abs(stationRate - oracle),
          "physical curvature agrees better with the position-only circle than station rate",
        );
      } else {
        assert(reported <= 1 / (u >= 0.17 && u <= 0.34 ? 95 : 150));
      }
    }
  }
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
