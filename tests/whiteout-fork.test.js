import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { makeTrack, mod, clamp } from "../src/track.js";
import { Race } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";
import { buildNewCourseDistricts } from "../src/new-course-environments.js";
import { getTrackPickups } from "../src/pickups.js";

const track = makeTrack(3);
const terrain = createTerrain(track);
after(() => terrain.geometries.forEach((geometry) => geometry.dispose()));
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("WHITEOUT: public spiral, base deck and existing fork stations are preserved", () => {
  assert.equal(track.config.layoutId, "whiteout-2-finish-end");
  assert.deepEqual(track.config.split, [0.74, 0.87]);
  // Captured from d026dd3: every authored point and the full unsplit deck,
  // including the beloved descending basin spiral, not just its section name.
  assert.equal(
    hash(track.config.points),
    "b648dcc87bb7ea44566829127f54630603f5103fa42a3cce2846e6f733dc655d",
  );
  assert.equal(
    hash(
      Array.from({ length: 1500 }, (_, i) =>
        track.frame((i / 1500) * track.length),
      ),
    ),
    "ab50ac3fa3004241767fb709a15c5b9c61b3d0eeda52cd733011499c76822903",
  );
});

test("WHITEOUT: a real exposed ridge and sheltered ice cut share continuous level junctions", () => {
  const [start, end] = track.config.split;
  const midpoint = ((start + end) / 2) * track.length;
  const upper = track.frame(midpoint, -1);
  const lower = track.frame(midpoint, 1);
  assert(Math.abs(upper.p.y - lower.p.y - 55) < 0.01);
  assert.equal(upper.width, 20);
  assert.equal(lower.width, 17);
  for (const u of [start, end]) {
    assert(
      track
        .frame(u * track.length, -1)
        .p.distanceTo(track.frame(u * track.length, 1).p) < 0.002,
    );
    assert(track.bounds(u * track.length, -1).connected);
  }
  for (let i = 0; i <= 1200; i++) {
    const s = (start + ((end - start) * i) / 1200) * track.length;
    const a = track.frame(s, -1);
    const b = track.frame(s, 1);
    const axis = track.frame(s).right;
    const gap = b.p.clone().sub(a.p).dot(axis) - a.width - b.width;
    if (Math.abs(a.p.y - b.p.y) > 0.05) {
      assert(gap > 10, "rise begins only after decks separate laterally");
    }
    for (const f of [a, b]) {
      for (const lateral of [-f.width, 0, f.width]) {
        const p = f.p.clone().addScaledVector(f.right, lateral);
        assert(
          p.y - terrain.heightAt(p.x, p.z) > 3.5,
          "both real road decks clear rendered terrain",
        );
      }
    }
  }
  // The low route is excavated into the same broad glacial shoulder that
  // carries the ridge. It is not a lower ribbon floating beside another road.
  const cutWall = lower.p.clone().addScaledVector(lower.right, 110);
  assert(terrain.heightAt(cutWall.x, cutWall.z) > lower.p.y + 10);
  const ridgeOutside = upper.p.clone().addScaledVector(upper.right, -110);
  assert(terrain.heightAt(ridgeOutside.x, ridgeOutside.z) < upper.p.y - 10);
});

test("WHITEOUT: branch-specific grounded landmarks and rewards match the two experiences", () => {
  const scene = new THREE.Scene();
  buildNewCourseDistricts(
    scene,
    track,
    { concrete: null },
    {
      terrain,
      heightAt: terrain.heightAt,
      naturalMap: null,
    },
  );
  const root = scene.getObjectByName("polar-districts");
  for (const [name, branch] of [
    ["RIDGE ARRAY", -1],
    ["BLUE ICE CUT", 1],
  ]) {
    const footprint = root.userData.footprints.find((f) => f.name === name);
    assert(footprint);
    assert.equal(footprint.branch, branch);
    for (const road of terrain.samples) {
      const d = road.p.clone().sub(footprint.center);
      const x = Math.max(
        0,
        Math.abs(d.dot(footprint.right)) - footprint.width / 2,
      );
      const z = Math.max(
        0,
        Math.abs(d.dot(footprint.forward)) - footprint.depth / 2,
      );
      assert(Math.hypot(x, z) > road.width + 10, "landmark clears both routes");
    }
    for (const contact of footprint.contacts)
      assert(contact.y >= footprint.bottom && contact.y < footprint.deck);
  }
  const rewards = getTrackPickups(track).filter((p) => p.branch);
  assert(rewards.some((p) => p.branch === -1 && p.type === "boost"));
  assert(rewards.some((p) => p.branch === 1 && p.type === "weapon"));
  const geometries = new Set(),
    materials = new Set();
  root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) materials.add(o.material);
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
});

function cleanLap(speedClass, fork) {
  const race = new Race(track, 0, "trial", speedClass, terrain);
  race.countdown = 0;
  const r = race.player;
  let sectorStart = null,
    sectorEnd = null,
    gate = r.gate,
    chosenFrames = 0;
  let railFrames = 0,
    recoveries = 0;
  for (let step = 0; step < 180 * 120 && r.lap < 2; step++) {
    const pace = race.classSpec.pace;
    const u = mod(r.contactS, track.length) / track.length;
    const [start, end] = track.config.split;
    const choosing = u > start - 0.04 && u < start + (end - start) * 0.3;
    const branch =
      choosing && (!r.branch || track.bounds(r.contactS, r.branch).connected)
        ? fork
        : r.branch;
    const look = track.frame(
      r.contactS + Math.max(18, (r.speed * 0.8) / pace),
      branch,
    );
    const yaw = Math.atan2(look.p.x - r.position.x, look.p.z - r.position.z);
    const error = Math.atan2(Math.sin(yaw - r.yaw), Math.cos(yaw - r.yaw));
    const curvature = Math.max(
      ...[0.25, 0.6, 1].map((dt) =>
        Math.abs(track.curvature(r.contactS + (r.speed * dt) / pace, branch)),
      ),
    );
    const crest = Math.max(
      0,
      ...[0.25, 0.6, 1].map((dt) => {
        const s = r.contactS + (r.speed * dt) / pace;
        const a = track.frame(s - 6, branch),
          b = track.frame(s + 6, branch);
        return (a.tangent.y - b.tangent.y) / a.p.distanceTo(b.p);
      }),
    );
    const cornerSpeed = Math.min(
      Math.sqrt((82 * pace * pace) / Math.max(curvature, 0.0001)),
      Math.sqrt((25 * pace * pace) / Math.max(crest, 0.0001)),
    );
    // Ordinary player controls; no AI identity, body teleport or route lock.
    race.update(1 / 120, {
      throttle: true,
      steer: clamp(error * 2.5 - (r.yawRate * 0.25) / pace, -1, 1),
      air: clamp(error * 0.8, -1, 1),
      brake: Math.max(
        clamp((r.speed - cornerSpeed) / (30 * pace), 0, 1),
        Math.abs(error) > 0.7 ? 1 : 0,
      ),
    });
    if (r.wallTouched) railFrames++;
    if (r.recoveredThisStep) recoveries++;
    assert(
      r.gate >= gate && r.gate <= gate + 1,
      "gates earned in physical sequence",
    );
    gate = r.gate;
    if (r.contactS >= start * track.length && sectorStart === null)
      sectorStart = race.time;
    if (r.contactS >= end * track.length && sectorEnd === null)
      sectorEnd = race.time;
    if (u > start + 0.04 && u < end - 0.04) {
      assert.equal(r.branch, fork);
      chosenFrames++;
    }
  }
  assert.equal(r.lap, 2);
  assert.equal(r.gate, 33);
  assert.equal(railFrames, 0);
  assert.equal(recoveries, 0);
  assert.equal(r.shield, 100);
  assert(chosenFrames > 100);
  return { lap: race.time, fork: sectorEnd - sectorStart };
}

for (const speedClass of [0, 2]) {
  test(`WHITEOUT: C${speedClass + 1} real-control clean times for both distinct routes`, (t) => {
    const ridge = cleanLap(speedClass, -1);
    const cut = cleanLap(speedClass, 1);
    t.diagnostic(
      JSON.stringify({ ridge, cut, forkRatio: ridge.fork / cut.fork }),
    );
    // Visible physical tradeoff, not fake equal lengths or hidden speed forces.
    assert(track.physicalLengths[-1] > track.physicalLengths[1]);
    assert(ridge.fork > cut.fork);
  });
}
