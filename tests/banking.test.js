import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack } from "../src/track.js";
import { Race, SPEED_CLASSES } from "../src/race.js";
import { projectRoad, roadHeight } from "../src/road-projection.js";
import { hullExtent } from "../src/contacts.js";
import { getTrackPickups, pickupPoint, crossesPickup } from "../src/pickups.js";

function bends(track) {
  const frames = Array.from({ length: 500 }, (_, i) => {
    const s = (i / 500) * track.length;
    return { s, ...track.frame(s) };
  });
  return [
    frames.reduce((a, b) => (a.bank > b.bank ? a : b)),
    frames.reduce((a, b) => (a.bank < b.bank ? a : b)),
  ].filter((f) => Math.abs(f.bank) > 0.04);
}

for (let index = 0; index < 3; index++) {
  test(`course ${index}: composed banks are smooth, inward, and absent at forks/jumps/start`, () => {
    const track = makeTrack(index);
    let previous = track.frame(0);
    for (let s = 1; s < track.length; s += 1) {
      const f = track.frame(s);
      assert(Math.abs(f.bank) <= 0.18 + 1e-12);
      assert(
        Math.abs(f.bank - previous.bank) < 0.008,
        "no roll step between road samples",
      );
      assert(Math.abs(f.up.dot(f.right)) < 1e-10);
      assert(Math.abs(f.up.dot(f.tangent)) < 1e-10);
      assert(Math.abs(f.right.dot(f.tangent)) < 1e-10);
      if (Math.abs(f.bank) > 0.04) {
        const right = new THREE.Vector3(
          f.tangent.z,
          0,
          -f.tangent.x,
        ).normalize();
        assert(
          f.up.dot(right) * f.bank > 0,
          "road normal leans toward the turn's inside",
        );
      }
      previous = f;
    }
    for (const branch of [-1, 0, 1])
      for (let i = 0; i <= 80; i++) {
        const u =
          track.config.split[0] +
          ((track.config.split[1] - track.config.split[0]) * i) / 80;
        assert.equal(Math.abs(track.frame(u * track.length, branch).bank), 0);
      }
    for (const u of [
      0,
      0.99,
      track.config.jump - 0.018,
      track.config.jump,
      track.config.jump + 0.07,
    ])
      assert.equal(Math.abs(track.frame(u * track.length).bank), 0);
    assert(bends(track).length >= 1, "course has a meaningful banked turn");
  });

  test(`course ${index}: elevated shoulders, plane normals and real rail contact agree in every class`, () => {
    const track = makeTrack(index);
    for (const f of bends(track))
      for (let c = 0; c < SPEED_CLASSES.length; c++)
        for (const side of [-1, 1]) {
          const race = new Race(track, 0, "trial", c);
          race.countdown = 0;
          const p = race.player,
            pace = race.classSpec.pace;
          p.yaw = Math.atan2(f.right.x * side, f.right.z * side);
          const x =
            side *
            (f.width -
              hullExtent(
                p,
                new THREE.Vector3(f.right.x, 0, f.right.z).normalize(),
              ) /
                Math.cos(f.bank) -
              0.1);
          p.position.copy(f.p).addScaledVector(f.right, x);
          p.position.y += 2.2;
          p.s = p.contactS = f.s;
          p.gate = Math.floor((f.s / track.length) * 32) + 1;
          const road = projectRoad(track, p.position, f.s, 0);
          assert(Math.abs(road.x - x) < 0.08);
          assert(
            Math.abs(p.position.y - roadHeight(road, p.position) - 2.2) < 0.08,
          );
          assert(road.up.dot(f.up) > 0.999);
          p.velocity
            .set(f.right.x, 0, f.right.z)
            .normalize()
            .multiplyScalar(side * 65 * pace);
          race.update(1 / 120, { throttle: false, steer: 0, air: 0 });
          assert(
            p.wallTouched,
            `bank${f.bank} class${c} side${side} must hit visible rail`,
          );
          assert(p.shield < 100);
          const contact = projectRoad(track, p.position, p.contactS, p.branch);
          assert(
            Math.abs(contact.x) <=
              contact.width - hullExtent(p, contact.wallAxis) + 0.05,
          );
          assert(
            p.grounded,
            "banked rail contact cannot turn hover into a fall",
          );
        }
  });

  test(`course ${index}: banked hover provides physical support without rotating a passive ship`, () => {
    const track = makeTrack(index);
    for (const f of bends(track))
      for (let c = 0; c < 3; c++) {
        const race = new Race(track, 0, "trial", c);
        race.countdown = 0;
        const p = race.player;
        p.position.copy(f.p).addScaledVector(f.right, f.width * 0.4);
        p.position.y += 2.2;
        p.contactS = p.s = f.s;
        p.gate = Math.floor((f.s / track.length) * 32) + 1;
        p.yaw = Math.atan2(f.tangent.x, f.tangent.z);
        const yaw = p.yaw;
        for (let i = 0; i < 24; i++)
          race.update(1 / 120, { throttle: false, steer: 0, air: 0 });
        assert.equal(
          p.yaw,
          yaw,
          "bank support must not steer or align heading",
        );
        assert.equal(p.shield, 100);
        assert(p.grounded);
        const road = projectRoad(track, p.position, p.contactS, p.branch);
        assert(
          Math.abs(p.position.y - roadHeight(road, p.position) - 2.2) < 0.5,
        );
      }
  });

  test(`course ${index}: banked pickup silhouettes sit on their real road plane`, () => {
    const track = makeTrack(index);
    const pads = getTrackPickups(track).filter(
      (p) => Math.abs(track.frame(p.s, p.branch).bank) > 0.02,
    );
    assert(pads.length > 0);
    for (const pad of pads) {
      const f = track.frame(pad.s, pad.branch),
        point = pickupPoint(track, pad, 0, 0, 0.14);
      const road = projectRoad(track, point, pad.s, pad.branch);
      assert(Math.abs(point.y - roadHeight(road, point) - 0.14 * f.up.y) < 0.2);
      const before = pickupPoint(track, pad, 0, -pad.length, 2.2);
      const after = pickupPoint(track, pad, 0, pad.length, 2.2);
      assert(crossesPickup(track, pad, before, after, pad.branch));
    }
  });
}

test("banked corners cover both left and right turn directions", () => {
  const banks = [0, 1, 2]
    .flatMap((i) => bends(makeTrack(i)))
    .map((f) => f.bank);
  assert(banks.some((b) => b > 0.04));
  assert(banks.some((b) => b < -0.04));
});
