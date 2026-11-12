import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { TRACKS, makeTrack } from "../src/track.js";
import { Race } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";
import { getJumpMarkingLayout } from "../src/jump-markings.js";
import { projectRoad } from "../src/road-projection.js";

// Accepted legacy-v4 routes d3f8eb8, universal fork correction ed9de33 and
// Coast launch 0d0509a. Includes frames, bounds, gaps and tunnel decisions.
const originalHashes = [
  "3fb907ffd5b6aebb6d9500cdc2bc362541c2b66f2430e293477fea96abf02d9c",
  "d2be34d1fcaee87b1edca63e0fd9f094786db15d6f432e87912d3a1dbb93d142",
  "44251c842a0f69edb88d9959b0ec4b45c6bb81951bac666829262d95314a2123",
];
for (let index = 0; index < 3; index++) {
  test(`legacy-v4 course ${index}: sampled physical outputs match the accepted route`, () => {
    const track = makeTrack(index);
    const rows = [track.length, track.physicalLengths];
    for (let j = 0; j < 300; j++) {
      for (const branch of [-1, 0, 1]) {
        const s = (j / 300) * track.length;
        rows.push(
          track.frame(s, branch),
          track.bounds(s, branch),
          track.gap(j / 300),
          track.isTunnel(s, branch),
        );
      }
    }
    assert.equal(
      createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
      originalHashes[index],
    );
  });
}

for (const index of [3, 4, 5]) {
  const config = TRACKS[index];
  const terrain = createTerrain(makeTrack(index));
  after(() => terrain.geometries.forEach((geometry) => geometry.dispose()));
  test(`${config.name}: authored deck, broad turns and explicit jump/tunnel metadata`, () => {
    const track = makeTrack(index);
    assert.equal(
      new Set(TRACKS.map((course) => course.layoutId)).size,
      TRACKS.length,
    );
    if (index !== 4) assert.equal(config.tunnel, null);
    if (index !== 5) {
      assert.equal(config.jump, null);
      assert.equal(config.ramp, null);
      assert.equal(config.sections.runway, null);
      assert.deepEqual(getJumpMarkingLayout(track), []);
    } else {
      assert(getJumpMarkingLayout(track).length > 0);
    }
    for (let i = 0; i < 10000; i++) {
      const u = i / 10000;
      const s = u * track.length;
      assert.equal(
        track.gap(u),
        index === 5 && u >= config.jump && u < config.jump + config.gapLength,
      );
      for (const branch of u > config.split[0] && u < config.split[1]
        ? [-1, 1]
        : [0]) {
        const frame = track.frame(s, branch);
        const next = track.frame(s + 3, branch);
        if (index !== 5)
          assert(
            frame.p.distanceTo(next.p) < 4.5,
            "continuous connected deck outside the physical gap",
          );
        assert(
          Math.abs(track.curvature(s, branch)) <=
            1 / (index === 4 ? 80 : index === 5 && u >= 0.17 && u <= 0.34 ? 95 : 150),
          `radius below authored readable-turn envelope at ${u}, branch ${branch}`,
        );
        assert.equal(
          track.isTunnel(s, branch),
          index === 4 && branch === -1 && frame.u > 0.81 && frame.u < 0.9,
        );
        if (i % 100 === 0) {
          const body = frame.p.clone().addScaledVector(frame.up, 2.2);
          const road = projectRoad(track, body, s, branch);
          if (!track.gap(u))
            assert(
              Math.abs(road.s - s) < 4,
              "projection stays in its connected local route",
            );
        }
      }
    }
    if (index === 5) {
      // Probe both sides of every generated frame-segment boundary, including
      // the wrap. Normalized station spacing is not physical deck spacing.
      const segments = Math.ceil(track.length / 3);
      for (let i = 0; i <= segments; i++) {
        const s = (i / segments) * track.length;
        if (Math.abs(s - config.jump * track.length) < 0.0001) continue;
        for (const branch of [-1, 0, 1])
          assert(
            track
              .frame(s - 0.0001, branch)
              .p.distanceTo(track.frame(s + 0.0001, branch).p) < 0.001,
            "authored segments meet continuously outside the launch lip",
          );
      }
    }
    const [start, end] = config.sections.finishStraight;
    const a = track.frame(start * track.length).p;
    const b = track.frame(end * track.length).p;
    const axis = b.clone().sub(a).normalize();
    for (let j = 0; j <= 20; j++) {
      const p = track.frame(
        (start + ((end - start) * j) / 20) * track.length,
      ).p;
      const offset = p.sub(a);
      assert(
        offset.clone().addScaledVector(axis, -offset.dot(axis)).length() < 0.05,
      );
    }
  });

  for (let speedClass = 0; speedClass < 3; speedClass++) {
    for (const branch of [-1, 1]) {
      for (const boostAt of [
        null,
        ...[
          [0.275, 0.49],
          [0.3, 0.58],
          [0.5, 0.7],
        ][index - 3],
      ]) {
        test(`${config.name}: class ${speedClass + 1}, fork ${branch}, ${boostAt === null ? "ordinary" : `TURBO at ${boostAt}`} earns a whole lap`, () => {
          const track = makeTrack(index);
          const race = new Race(track, 0, "trial", speedClass, terrain);
          race.countdown = 0;
          const r = race.player;
          // Use the real AI's input through the same body physics. Odd/even AI
          // identities select both forks from the normal grid, with no reseeding.
          r.id = branch === -1 ? 1 : 2;
          r.aiFire = Infinity;
          let separated = 0;
          let lastGate = r.gate;
          let fired = false;
          for (let step = 0; step < 120 * 120 && r.lap < 2; step++) {
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
            assert.equal(
              r.recoveredThisStep,
              false,
              "lap cannot rely on checkpoint rescue",
            );
            assert(
              r.gate >= lastGate && r.gate <= lastGate + 1,
              "only consecutive gates are earned",
            );
            lastGate = r.gate;
            const u = r.contactS / track.length;
            if (
              u > config.split[0] &&
              u < config.split[1] &&
              !track.bounds(r.contactS, branch).connected
            ) {
              assert.equal(r.branch, branch);
              separated++;
            }
          }
          assert.equal(r.lap, 2, "the body physically completes its first lap");
          assert.equal(r.gate, 33);
          assert(r.contactS >= track.length);
          assert(
            separated > 20,
            "the selected separated carriageway was actually driven",
          );
          if (boostAt === null) {
            if (index === 5)
              assert(r.shield > 0, "technical Cinderline AI finishes alive");
            else
              assert(
                r.shield > 95,
                "ordinary driving avoids repeated wall impacts",
              );
          } else {
            assert(fired, "the signature TURBO was actually fired");
          }
        });
      }
    }
  }
}

test("WHITEOUT: original basin plan descends through a real 270-degree spiral", () => {
  const spiral = TRACKS[3].points.slice(6, 19);
  let turn = 0;
  for (let i = 0; i < spiral.length; i++) {
    const [x, y, z] = spiral[i];
    assert(Math.hypot(x, z) >= 275 && Math.hypot(x, z) <= 350);
    if (i) {
      const [px, py, pz] = spiral[i - 1];
      turn += Math.atan2(px * z - pz * x, px * x + pz * z);
      assert(y < py);
    }
  }
  assert(Math.abs(turn + 1.5 * Math.PI) < 0.01);
});

test("MONSOON: technical fork is physically shorter than the outside line", () => {
  const track = makeTrack(4);
  assert(track.physicalLengths[-1] + 100 < track.physicalLengths[1]);
  const [start, end] = track.config.sections.dryLock;
  for (let u = start + 0.06; u < end; u += 0.01)
    assert(
      track.frame(u * track.length).p.y < 15,
      "dry lock sits far below the 115m upper route",
    );
});

test("CINDERLINE: the ballistic crest has a straight aligned downhill landing", () => {
  const track = makeTrack(5);
  for (const [start, end] of [[0.52, 0.538]]) {
    let top = { y: -Infinity, s: 0 };
    for (let u = start; u < end; u += 0.0005) {
      const s = u * track.length;
      const y = track.frame(s).p.y;
      if (y > top.y) top = { y, s };
    }
    assert(top.y > 110);
    assert(
      Math.abs(track.curvature(top.s)) < 1 / 600,
      "crest is not a blind tightening corner",
    );
    assert.equal(track.gap(top.s / track.length), false);
  }
});
