import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { createTerrain } from "../src/terrain.ts";
import { projectRoad } from "../src/road-projection.ts";
import { Race } from "../src/race.ts";

const track = makeTrack(TRACK_INDEX.COAST);

// Accepted d377354 entry/exit necks, outside the independently authored interior.
const necks = [
  [0.3, -1, [-1326.4037518336625, 112.8491221991486, 684.0497631166312]],
  [0.3, 1, [-1328.2927242874212, 112.8491221991486, 694.2413742384917]],
  [0.31, -1, [-1435.0435882200961, 144.25467749151906, 666.2772529631293]],
  [0.31, 1, [-1434.7329229352622, 144.25467749151906, 693.6079321499153]],
  [0.42, -1, [-2324.6492997069245, 255.56911717075556, 1300.9151325739317]],
  [0.42, 1, [-2328.9329508470087, 255.56911717075556, 1327.9100750431437]],
];

test("Coast's distinct routes retain the accepted common necks and progression identity", () => {
  assert.equal(track.config.layoutId, "coast-4-finish-end");
  assert.deepEqual(track.config.split, [0.285, 0.445]);
  for (const [u, branch, p] of necks)
    assert(
      track
        .frame(u * track.length, branch)
        .p.distanceTo(new THREE.Vector3(...p)) < 1e-8,
    );
  for (const u of track.config.split) {
    const a = track.frame(u * track.length, -1),
      b = track.frame(u * track.length, 1);
    assert(a.p.distanceTo(b.p) < 0.002);
    assert(a.tangent.dot(b.tangent) > 0.9999);
    assert(track.bounds(u * track.length, -1).connected);
    assert(track.bounds(u * track.length, 1).connected);
  }
});

test("Coast has separate headland-bore and inlet-flyover itineraries, not neighbouring spline offsets", () => {
  let divergentHeadings = 0;
  for (let u = 0.345; u <= 0.39; u += 0.001) {
    const a = track.frame(u * track.length, -1),
      b = track.frame(u * track.length, 1);
    assert(
      b.p.y - a.p.y > 100,
      "different vertical journeys persist through the interior",
    );
    assert(
      Math.hypot(b.p.x - a.p.x, b.p.z - a.p.z) > 250,
      "the other road is not alongside the pilot",
    );
    const angle = a.tangent
      .clone()
      .setY(0)
      .normalize()
      .angleTo(b.tangent.clone().setY(0).normalize());
    if (angle > (25 * Math.PI) / 180) divergentHeadings++;
  }
  assert(
    divergentHeadings > 20,
    "actual driving headings differ, not just the scenery",
  );
  for (let u = 0.315; u <= 0.415; u += 0.0005) {
    for (const branch of [-1, 1]) {
      const f = track.frame(u * track.length, branch);
      assert(
        Math.abs(track.curvature(u * track.length, branch)) < 0.01,
        "no abrupt hairpin joins",
      );
      assert(
        f.metric > 0.8 && f.metric < 1.4,
        "stations remain local enough for projection and physical gates",
      );
      const p = f.p.clone().add(new THREE.Vector3(0, 2.2, 0));
      assert.equal(
        projectRoad(track, p, u * track.length, branch).branch,
        branch,
      );
    }
  }
});

test("Coast's real sea inlet, full road envelopes and broad merge apron stay unobstructed", () => {
  const terrain = createTerrain(track);
  try {
    for (let u = 0.285; u <= 0.47; u += 0.0005) {
      for (const branch of u < 0.445 ? [-1, 1] : [0]) {
        const f = track.frame(u * track.length, branch);
        for (const x of [-f.width, 0, f.width]) {
          const p = f.p.clone().addScaledVector(f.right, x);
          assert(
            terrain.heightAt(p.x, p.z) < p.y - 1,
            "land clears each actual banked deck edge",
          );
        }
      }
    }
    const flyover = track.frame(0.37 * track.length, 1);
    assert(terrain.heightAt(flyover.p.x, flyover.p.z) < -16);
    assert(terrain.bridgeAt(0.37, 1));
    assert(
      track.frame(0.447 * track.length).width > 21,
      "a real common apron gives both approaches merge space",
    );
  } finally {
    terrain.geometries.forEach((geometry) => geometry.dispose());
  }
});

test("Coast TURBO approaches earn both routes and the common merge for every craft/class", () => {
  const terrain = createTerrain(track);
  const [start, end] = track.config.split;
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
          const racer = race.player;
          racer.id = branch < 0 ? 1 : 2;
          let fired = false;
          let merged = false;
          let gate = racer.gate;
          for (let step = 0; step < 180 * 120; step++) {
            if (!fired && racer.contactS > (start - 0.025) * track.length) {
              racer.weapon = "TURBO";
              race.fire(racer);
              fired = true;
            }
            race.update(1 / 120, {});
            assert(racer.gate >= gate && racer.gate <= gate + 1);
            gate = racer.gate;
            if (!fired) continue;
            assert.equal(racer.wallTouched, false);
            assert.equal(racer.recoveredThisStep, false);
            assert.equal(racer.shield, 100);
            if (racer.contactS >= clear) {
              assert(racer.gate >= expectedGate);
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
