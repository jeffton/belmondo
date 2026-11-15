import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.js";
import { projectRoad } from "../src/road-projection.js";
import { railHeight } from "../src/rail-geometry.js";
import { RAIL_PROFILE } from "../src/rail-profile.js";
import { Race } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";

const track = makeTrack(TRACK_INDEX.WHITEOUT);
const [start, end] = track.config.split;
const station = (phase) => (start + (end - start) * phase) * track.length;

test("Whiteout snowbridge crosses above the ice route and exits on the opposite side", () => {
  for (const phase of [0.3, 0.7]) {
    const s = station(phase);
    const delta = track.frame(s, 1).p.sub(track.frame(s, -1).p);
    assert.equal(
      Math.sign(delta.dot(track.frame(s).right)),
      phase < 0.5 ? 1 : -1,
    );
  }
  const upper = track.frame(station(0.5), -1);
  const lower = track.frame(station(0.5), 1);
  assert(Math.hypot(upper.p.x - lower.p.x, upper.p.z - lower.p.z) < 0.01);
  assert(Math.abs(upper.p.y - lower.p.y - 55) < 0.01);
  assert(upper.width > lower.width);
  assert(
    upper.tangent.dot(lower.tangent) < 0.95,
    "two independent crossing alignments, not parallel painted lanes",
  );
});

test("Whiteout crossing retains independent collision rails and branch projection", () => {
  for (let phase = 0.38; phase <= 0.62; phase += 0.005) {
    const s = station(phase);
    for (const branch of [-1, 1]) {
      const f = Object.assign(track.frame(s, branch), track.bounds(s, branch), {
        branch,
      });
      assert.equal(f.connected, false);
      assert.equal(railHeight(f, -1), RAIL_PROFILE.height);
      assert.equal(railHeight(f, 1), RAIL_PROFILE.height);
      for (const x of [-f.width + 5, 0, f.width - 5]) {
        const p = f.p
          .clone()
          .addScaledVector(f.right, x)
          .add(new THREE.Vector3(0, 2.2, 0));
        const road = projectRoad(track, p, s, branch);
        assert.equal(
          road.branch,
          branch,
          "the nearby other deck cannot steal road contact",
        );
        assert(Math.abs(road.point.y - f.p.y) < 1);
      }
    }
  }
});

test("Whiteout's shared noses remain level, open and tangent-aligned on both sides", () => {
  for (const phase of [0, 1]) {
    const s = station(phase);
    const a = track.frame(s, -1),
      b = track.frame(s, 1);
    assert(a.p.distanceTo(b.p) < 0.002);
    assert(a.tangent.dot(b.tangent) > 0.9999);
    for (const branch of [-1, 1]) assert(track.bounds(s, branch).connected);
  }
});

test("Whiteout TURBO approaches retain both crossing routes and earn every gate for every craft/class", () => {
  const terrain = createTerrain(track);
  const clear = (end + 0.015) * track.length;
  const expectedGate =
    Math.floor(((clear - track.finishS) / track.length) * 32) + 1;
  try {
    for (let speedClass = 0; speedClass < 3; speedClass++) {
      for (let craft = 0; craft < 3; craft++) {
        for (const branch of [-1, 1]) {
          const race = new Race(track, craft, "trial", speedClass, terrain);
          race.countdown = 0;
          race.pickups = [];
          const r = race.player;
          r.id = branch < 0 ? 1 : 2;
          let fired = false;
          let merged = false;
          let gate = r.gate;
          for (let step = 0; step < 180 * 120; step++) {
            if (!fired && r.contactS > (start - 0.025) * track.length) {
              r.weapon = "TURBO";
              race.fire(r);
              fired = true;
            }
            race.update(1 / 120, {});
            assert(r.gate >= gate && r.gate <= gate + 1);
            gate = r.gate;
            if (!fired) continue;
            assert.equal(r.wallTouched, false);
            assert.equal(r.recoveredThisStep, false);
            assert.equal(r.shield, 100);
            if (r.contactS > station(0.25) && r.contactS < station(0.75))
              assert.equal(r.branch, branch);
            if (r.contactS >= clear) {
              assert(r.gate >= expectedGate);
              merged = true;
              break;
            }
          }
          assert(fired && merged, `${craft}/${speedClass}/${branch}`);
        }
      }
    }
  } finally {
    terrain.geometries.forEach((geometry) => geometry.dispose());
  }
});
