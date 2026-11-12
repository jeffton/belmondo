import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Race } from "../src/race.js";
import { makeTrack } from "../src/track.js";
import { projectRoad } from "../src/road-projection.js";
import {
  railBounds,
  railFaceNormal,
  respondToRail,
  RAIL_PROFILE,
} from "../src/rail-profile.js";
import { hullExtent, HULL_HEIGHT } from "../src/contacts.js";

const controls = { throttle: true, steer: 0, air: 0 };
function straight() {
  return {
    length: 100000,
    finishS: 0,
    config: { split: [0.8, 0.9], jump: 0.95 },
    gap: () => false,
    curvature: () => 0,
    frame: (s) => ({
      p: new THREE.Vector3(0, 30, s),
      tangent: new THREE.Vector3(0, 0, 1),
      right: new THREE.Vector3(1, 0, 0),
      width: 18,
      metric: 1,
      u: s / 100000,
    }),
  };
}
function planeClearance(r, road, side) {
  const normal = railFaceNormal(road, side);
  return (
    normal.dot(r.position.clone().sub(road.point)) +
    hullExtent(r, normal) +
    (HULL_HEIGHT / 2) * Math.abs(normal.y) -
    (side === 1 ? road.wallMax : -road.wallMin)
  );
}

test("outward sloped rails do not hide an early vertical wall at the road edge", () => {
  for (let c = 0; c < 3; c++) {
    const race = new Race(straight(), 0, "trial", c);
    race.countdown = 0;
    const r = race.player;
    r.position.x = 18 - 3.0;
    r.velocity.z = 100 * race.classSpec.pace;
    for (let i = 0; i < 60; i++) {
      race.update(1 / 120, controls);
      assert(!r.wallTouched, "this hull clears the actual sloped face");
    }
    assert.equal(r.shield, 100);
    assert(r.grounded);
  }
});

test("sloped face hull support matches contact and dissipates side impact without catapulting", () => {
  for (let c = 0; c < 3; c++)
    for (const side of [-1, 1]) {
      const race = new Race(straight(), 0, "trial", c);
      race.countdown = 0;
      const r = race.player,
        pace = race.classSpec.pace;
      const road = projectRoad(race.track, r.position, 0, 0),
        bounds = railBounds(r, road, r.position);
      r.position.x = (side === 1 ? bounds.max : bounds.min) - side * 0.05;
      r.velocity.set(side * 45 * pace, 0, 100 * pace);
      race.update(1 / 120, controls);
      assert(r.wallTouched);
      assert(r.shield < 100);
      assert(r.grounded);
      const contact = projectRoad(race.track, r.position, r.contactS, 0);
      assert(
        planeClearance(r, contact, side) < 0.03,
        "no wing penetrates the rendered sloped plane",
      );
      assert(
        r.velocity.y <= 0.1,
        "the barrier cannot inject upward launch energy",
      );
    }
});

test("sustained steering against sloped rails cannot climb through or grind through their face", () => {
  for (let c = 0; c < 3; c++)
    for (const side of [-1, 1]) {
      const race = new Race(straight(), 0, "trial", c);
      race.countdown = 0;
      const r = race.player,
        pace = race.classSpec.pace;
      r.position.x = side * 14;
      r.velocity.z = 150 * pace;
      let contacts = 0;
      for (let i = 0; i < 240; i++) {
        race.update(1 / 120, { ...controls, steer: side, air: side });
        const road = projectRoad(race.track, r.position, r.contactS, 0);
        assert(planeClearance(r, road, side) < 0.06);
        assert(
          r.position.y < 33,
          "ordinary rail pressure cannot launch the hull over the top",
        );
        if (r.wallTouched) contacts++;
      }
      assert(contacts > 5);
      assert(r.shield < 100);
    }
});

test("descending impacts cannot create kinetic energy in any class", () => {
  const road = {
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
  };
  for (const pace of [1, 1.2, 1.4])
    for (const side of [-1, 1]) {
      const hull = {
        velocity: new THREE.Vector3(0, -60, 100).multiplyScalar(pace),
      };
      const energy = hull.velocity.lengthSq();
      respondToRail(hull, road, side);
      assert(hull.velocity.lengthSq() <= energy + 1e-8);
      assert(hull.velocity.y <= 0);
    }
});

test("inner split faces taper in the shared median instead of intersecting the opposite route", () => {
  for (let index = 0; index < 3; index++) {
    const track = makeTrack(index),
      [start, end] = track.config.split;
    let tapered = false;
    for (let i = 0; i <= 1500; i++) {
      const s = (start + ((end - start) * i) / 1500) * track.length;
      const first = track.frame(s, -1),
        second = track.frame(s, 1);
      const firstBounds = track.bounds(s, -1),
        secondBounds = track.bounds(s, 1);
      if (firstBounds.connected || Math.abs(first.p.y - second.p.y) > 0.05)
        continue;
      const left = firstBounds.innerSide === 1 ? first : second,
        right = firstBounds.innerSide === 1 ? second : first,
        lb = firstBounds.innerSide === 1 ? firstBounds : secondBounds,
        rb = firstBounds.innerSide === 1 ? secondBounds : firstBounds;
      const gap = right.p
        .clone()
        .addScaledVector(right.right, -right.width)
        .sub(left.p.clone().addScaledVector(left.right, left.width))
        .dot(track.frame(s).right);
      const h = lb.railMaxHeight;
      assert.equal(h, rb.railMinHeight);
      assert(h >= 0 && h <= RAIL_PROFILE.height);
      const axis = track.frame(s).right;
      const expansion =
        left.up.dot(axis) -
        right.up.dot(axis) +
        (RAIL_PROFILE.topOutset / RAIL_PROFILE.height) *
          (left.right.dot(axis) + right.right.dot(axis));
      assert(h * expansion <= gap + 1e-6);
      if (h > 0 && h < RAIL_PROFILE.height) tapered = true;
    }
    assert(
      tapered,
      "continuous fork has a low sloped nose before full-height containment",
    );
  }
});
