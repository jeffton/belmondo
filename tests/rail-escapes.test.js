import test from "node:test";
import assert from "node:assert/strict";
import { Race } from "../src/race.ts";
import { railBounds } from "../src/rail-profile.ts";
import {
  projectRoad,
  ROAD_LOOK_AHEAD,
  ROAD_LOOK_BEHIND,
} from "../src/road-projection.ts";
import { createTerrain } from "../src/terrain.ts";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";

test("the same banked rail has the same clearance when the anchor or lap changes", () => {
  const track = makeTrack(TRACK_INDEX.COAST);
  for (const u of [0.0001, 54.5 / 120, 0.9999]) {
    const s = u * track.length;
    const frame = track.frame(s);
    const position = frame.p.clone().addScaledVector(frame.right, 17);
    position.y += 2.2;
    const hull = { yaw: Math.atan2(frame.tangent.x, frame.tangent.z) };
    const expected = railBounds(
      hull,
      projectRoad(track, position, s, 0),
      position,
    );
    for (const lap of [-1, 0, 1]) {
      for (const shift of [-3.1, 2.3]) {
        const projected = projectRoad(
          track,
          position,
          s + lap * track.length + shift,
          0,
        );
        const actual = railBounds(hull, projected, position);
        assert(Math.abs(actual.max - expected.max) < 1e-8);
        assert(Math.abs(actual.min - expected.min) < 1e-8);
      }
    }
  }
});

test("a fixed rail chord cannot admit a projection outside the local search window", () => {
  const track = makeTrack(TRACK_INDEX.COAST);
  const anchor = track.length * 0.13;
  for (const offset of [-ROAD_LOOK_BEHIND - 2, ROAD_LOOK_AHEAD + 2]) {
    const position = track.frame(anchor + offset).p;
    const projected = projectRoad(track, position, anchor, 0);
    assert(projected.s >= anchor - ROAD_LOOK_BEHIND - 1e-8);
    assert(projected.s <= anchor + ROAD_LOOK_AHEAD + 1e-8);
  }
});

function startAtRail(t, index, u, branch, side, height = 2.2) {
  const track = makeTrack(index);
  const terrain = createTerrain(track);
  t.after(() => terrain.geometries.forEach((geometry) => geometry.dispose()));
  const race = new Race(track, 1, "trial", 2, terrain);
  race.countdown = 0;
  const racer = race.player;
  const s = u * track.length;
  const frame = track.frame(s, branch);
  racer.position.copy(frame.p);
  racer.position.y += height;
  racer.s = racer.contactS = s;
  racer.branch = branch;
  racer.gate = Math.floor(((s - track.finishS) / track.length) * 32) + 1;
  racer.yaw = Math.atan2(frame.tangent.x, frame.tangent.z) + side * 0.32;
  racer.pitch = -Math.asin(frame.tangent.y);
  racer.pitchRate = 0;
  racer.velocity
    .copy(frame.tangent)
    .multiplyScalar(110)
    .addScaledVector(frame.right, side * 45);
  // Put the whole hull just inside the authored face on this bank. Offset
  // along its slope and reproject rather than assuming vertical world walls.
  for (let iteration = 0; iteration < 4; iteration++) {
    const road = projectRoad(track, racer.position, s, branch);
    const bounds = railBounds(racer, road, racer.position);
    const edge = side > 0 ? bounds.max : bounds.min;
    racer.position.addScaledVector(road.right, edge - road.x - side * 0.12);
  }
  return race;
}

for (const [name, index, u, branch] of [
  ["Vesper's separated branch", TRACK_INDEX.VESPER, 42.5 / 120, 1],
  ["Palm Breaker's bank transition", TRACK_INDEX.COAST, 54.5 / 120, 0],
]) {
  test(`${name}: pressing the outside rail scrapes rather than falling through and respawning`, (t) => {
    const race = startAtRail(t, index, u, branch, 1);
    const racer = race.player;
    const start = racer.contactS;
    let scrapes = 0;
    for (let step = 0; step < 180; step++) {
      race.update(1 / 120, { throttle: true, steer: 1, air: 1 });
      assert(!racer.recoveredThisStep, `false rescue at step ${step}`);
      assert(racer.grounded, `hover lost against a solid rail at step ${step}`);
      scrapes += Number(racer.wallTouched);
    }
    assert(scrapes > 100, "sustained pressure actually engages the barrier");
    assert(racer.contactS - start > 20, "normal forward motion continues");
    assert(racer.shield < 95, "scraping the rail still costs shield");
  });
}

test("a craft airborne above a Palm Breaker rail can leave the deck and legitimately respawn", (t) => {
  const race = startAtRail(t, TRACK_INDEX.COAST, 54.5 / 120, 0, 1, 8.2);
  const racer = race.player;
  racer.grounded = false;
  racer.flight = true;
  let recovered = false;
  for (let step = 0; step < 180; step++) {
    race.update(1 / 120, { throttle: true, steer: 1, air: 1 });
    assert(!racer.wallTouched, "an overflight is not pulled back to the face");
    if (racer.recoveredThisStep) {
      recovered = true;
      break;
    }
  }
  assert(
    recovered,
    "an actual off-course fall still costs a checkpoint return",
  );
  assert.equal(racer.shield, 76);
});
