import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack } from "../src/track.js";
import { Race, CRAFT } from "../src/race.js";
import { projectRoad } from "../src/road-projection.js";

// Authored v4 world routes, including Coast's accepted 12 m launch lip.
const authoredPhysical = [11032.065614, 11325.463411, 11203.418633];
for (let index = 0; index < 3; index++)
  test(`course ${index} gains real length, hills and a continuous finish straight`, () => {
    const track = makeTrack(index);
    assert.equal(
      track.config.layoutId,
      ["coast-4-finish-end", "solar-4-finish-end", "noctilucent-4-finish-end"][
        index
      ],
    );
    let length = 0,
      last = track.frame(0).p,
      low = Infinity,
      high = -Infinity;
    for (let i = 1; i <= 12000; i++) {
      const f = track.frame((track.length * i) / 12000);
      length += f.p.distanceTo(last);
      last = f.p;
      low = Math.min(low, f.p.y);
      high = Math.max(high, f.p.y);
    }
    assert(
      Math.abs(length - authoredPhysical[index]) < 4,
      "measured world distance matches the frozen authored v4 course",
    );
    assert(
      Math.abs(length - track.physicalLength) < 4,
      "reported physical polyline follows the authored world route",
    );
    assert(high - low > (index === 0 ? 65 : 120));
    const [start, end] = track.config.sections.finishStraight;
    const a = track.frame(start * track.length),
      b = track.frame(end * track.length);
    const axis = b.p.clone().sub(a.p).normalize();
    assert(a.p.distanceTo(b.p) > 450);
    for (let i = 1; i < 30; i++) {
      const f = track.frame((start + ((end - start) * i) / 30) * track.length);
      const delta = f.p.clone().sub(a.p);
      assert(
        delta.clone().addScaledVector(axis, -delta.dot(axis)).length() < 0.05,
      );
      assert(f.tangent.dot(axis) > 0.999);
    }
  });

test("Night's overpass is a true XZ crossing with open, separated physical levels", () => {
  const track = makeTrack(2),
    [crossing] = track.config.sections.crossings;
  const lower = track.frame(crossing.lowerU * track.length),
    upper = track.frame(crossing.upperU * track.length);
  assert(Math.hypot(lower.p.x - upper.p.x, lower.p.z - upper.p.z) < 0.001);
  assert(crossing.clearance > 100);
  for (let c = 0; c < 3; c++) {
    const race = new Race(track, 0, "race", c);
    race.countdown = 0;
    race.racers = race.racers.slice(0, 2);
    for (const [r, u] of [
      [race.racers[0], crossing.lowerU],
      [race.racers[1], crossing.upperU],
    ]) {
      const s = u * track.length,
        f = track.frame(s);
      r.position.copy(f.p);
      r.position.y += 2.2;
      r.s = r.contactS = s;
      r.gate = Math.floor((s / track.length) * 32) + 1;
      r.checkpoint = { s, branch: 0, gate: r.gate };
      r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
      r.velocity
        .copy(f.tangent)
        .multiplyScalar(CRAFT[r.craft].speed * race.classSpec.pace);
      r.speed = r.velocity.length();
      r.aiFire = Infinity;
    }
    const anchors = race.racers.map((r) => r.contactS);
    for (let i = 0; i < 12; i++) {
      race.update(1 / 120, { throttle: true, steer: 0, air: 0 });
      for (const [r, k] of race.racers.map((r, k) => [r, k])) {
        assert(
          Math.abs(r.contactS - anchors[k]) < 45,
          "projection cannot jump to the other crossing level",
        );
        assert.equal(
          r.shield,
          100,
          "ships and walls on another level cannot collide",
        );
      }
    }
  }
});

test("Night has an authored steep fall with a smooth low landing/runout", () => {
  const track = makeTrack(2);
  let steepest = 0;
  for (let u = 0.84; u < 0.9; u += 0.0005) {
    const f = track.frame(u * track.length);
    steepest = Math.max(
      steepest,
      -Math.atan2(f.tangent.y, Math.hypot(f.tangent.x, f.tangent.z)),
    );
  }
  assert(steepest > (43 * Math.PI) / 180 && steepest < (44 * Math.PI) / 180);
  for (let u = 0.905; u < 0.955; u += 0.005)
    assert(Math.abs(track.frame(u * track.length).tangent.y) < 0.01);
});

test("fast descending hulls land on their selected crossing level, not through the deck", () => {
  const track = makeTrack(2),
    [crossing] = track.config.sections.crossings;
  for (let c = 0; c < 3; c++)
    for (const u of [crossing.lowerU, crossing.upperU]) {
      const race = new Race(track, 0, "trial", c);
      race.countdown = 0;
      const r = race.player,
        s = u * track.length,
        f = track.frame(s),
        pace = race.classSpec.pace;
      r.s = r.contactS = s;
      r.gate = Math.floor((s / track.length) * 32) + 1;
      r.position.copy(f.p);
      r.position.y += 27.2;
      r.velocity.set(0, -400 * pace, 0);
      r.grounded = false;
      r.flight = true;
      race.update(0.1 / pace, { throttle: false, steer: 0, air: 0 });
      assert(r.grounded);
      assert(Math.abs(r.position.y - f.p.y - 2.2) < 0.2);
      assert(Math.abs(r.contactS - s) < 8);
      assert.equal(r.shield, 100);
    }
});

test("being below the upper bridge cannot snap a hull to that deck or steal progression", () => {
  const track = makeTrack(2),
    [crossing] = track.config.sections.crossings;
  const lower = track.frame(crossing.lowerU * track.length),
    s = crossing.upperU * track.length;
  const race = new Race(track, 0, "trial");
  race.countdown = 0;
  const r = race.player;
  r.s = r.contactS = s;
  r.gate = Math.floor((s / track.length) * 32) + 1;
  r.checkpoint = { s, branch: 0, gate: r.gate };
  r.position.copy(lower.p);
  r.position.y += 2.2;
  r.grounded = false;
  const gate = r.gate;
  race.update(1 / 120, { throttle: false });
  assert.equal(r.gate, gate);
  assert.equal(r.lap, 1);
  assert.equal(race.laps.length, 0);
  const road = projectRoad(track, lower.p, s, 0);
  assert(
    road.point.y > lower.p.y + 100,
    "contact search retains its connected upper-level anchor",
  );
});

test("a diagonal arrival cannot earn a gate crossed outside its finite road width", () => {
  const track = {
    length: 1000,
    config: { split: [0.8, 0.9], jump: 0.95 },
    gap: () => false,
    curvature: () => 0,
    frame: (s) => ({
      p: new THREE.Vector3(0, 30, s),
      tangent: new THREE.Vector3(0, 0, 1),
      right: new THREE.Vector3(1, 0, 0),
      width: 18,
      metric: 1,
      u: s / 1000,
    }),
  };
  const race = new Race(track, 0, "trial");
  race.countdown = 0;
  const r = race.player;
  r.position.set(30, 32.2, 29);
  r.contactS = r.s = 29;
  r.velocity.set(-300, 0, 100);
  race.update(0.1, { throttle: false });
  assert(
    r.contactS > track.length / 32,
    "endpoint really is beyond the next gate",
  );
  assert.equal(
    r.gate,
    1,
    "crossing occurred far outside the deck even though the endpoint is inside",
  );
});
