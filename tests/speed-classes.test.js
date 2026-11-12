import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Race, CRAFT, SPEED_CLASSES } from "../src/race.js";
import { makeTrack } from "../src/track.js";
import { createTerrain } from "../src/terrain.js";

const neutral = { throttle: true, steer: 0, air: 0, brake: 0 };
function straight(width = 100) {
  return {
    length: 1_000_000,
    finishS: 0,
    config: { split: [0.9, 0.95], jump: 0.99 },
    curvature: () => 0,
    gap: () => false,
    frame: (s) => ({
      p: new THREE.Vector3(0, 30, s),
      tangent: new THREE.Vector3(0, 0, 1),
      right: new THREE.Vector3(1, 0, 0),
      width,
      metric: 1,
      u: s / 1_000_000,
    }),
  };
}
function setup(speedClass, track = straight(), craft = 0, mode = "trial") {
  const race = new Race(track, craft, mode, speedClass);
  race.countdown = 0;
  return race;
}
function matchedDrive(race, seconds, controls = neutral) {
  const dt = 1 / 120 / race.classSpec.pace;
  for (let i = 0; i < seconds * 120; i++) race.update(dt, controls);
}
function near(actual, expected, tolerance = 1e-7) {
  assert(Math.abs(actual - expected) < tolerance, `${actual} vs ${expected}`);
}

test("class pace accelerates physical motion, not the race/countdown clocks", () => {
  for (let c = 0; c < 3; c++) {
    const race = new Race(straight(), 0, "trial", c);
    race.update(1, { ...neutral, launchIntent: false });
    near(race.countdown, 4.2);
    assert.equal(race.time, 0);
    assert.equal(race.player.speed, 0);
    race.update(4.2, neutral);
    assert.equal(race.launch.success, false);
    matchedDrive(race, 12);
    const pace = SPEED_CLASSES[c].pace;
    near(race.time, 12 / pace);
    assert(race.player.speed > 150 * pace && race.player.speed < 161 * pace);
  }
});

test("all craft retain their acceleration and handling distinctions across classes", () => {
  for (let c = 0; c < 3; c++) {
    const racers = CRAFT.map((_, craft) => setup(c, straight(), craft));
    for (const race of racers) matchedDrive(race, 20);
    assert(racers[1].player.speed > racers[0].player.speed + 10);
    assert(racers[0].player.speed > racers[2].player.speed + 20);
    for (const race of racers)
      matchedDrive(race, 0.2, { ...neutral, steer: 1 });
    assert(racers[2].player.yawRate > racers[0].player.yawRate);
    assert(racers[0].player.yawRate > racers[1].player.yawRate);
  }
});

test("boost, pitch, braking, yaw and inertia share the same geometric envelope", () => {
  const races = SPEED_CLASSES.map((_, c) => setup(c));
  for (const race of races) {
    matchedDrive(race, 3);
    race.player.weapon = "TURBO";
    race.fire();
    matchedDrive(race, 0.5, { ...neutral, steer: 0.2, pitch: -0.5 });
    matchedDrive(race, 0.5, {
      ...neutral,
      brake: 0.5,
      airLeft: 0.6,
      airRight: 0.3,
    });
  }
  const base = races[0].player;
  for (const race of races) {
    const p = race.player,
      pace = race.classSpec.pace;
    assert(p.position.distanceTo(base.position) < 1e-7);
    near(p.speed / pace, base.speed);
    near(p.yaw, base.yaw);
    near(p.yawRate / pace, base.yawRate);
    near(p.boost, base.boost);
    near(p.surge, base.surge);
    const slip = setup(race.speedClass);
    matchedDrive(slip, 3);
    matchedDrive(slip, 0.2, { ...neutral, steer: 1 });
    const heading = new THREE.Vector3(
      Math.sin(slip.player.yaw),
      0,
      Math.cos(slip.player.yaw),
    );
    assert(
      slip.player.velocity.clone().normalize().distanceTo(heading) > 0.01,
      "class handling cannot align velocity to the ship's heading",
    );
  }
});

test("missiles catch moving targets with class-independent reach, damage and normalized timing", () => {
  const results = SPEED_CLASSES.map((_, c) => {
    const race = setup(c, straight(), 0, "race");
    race.racers = race.racers.slice(0, 2);
    const target = race.racers[1],
      pace = race.classSpec.pace;
    target.position.set(0, 32.2, 80);
    target.contactS = target.s = 80;
    target.velocity.set(0, 0, 140 * pace);
    target.speed = 140 * pace;
    target.aiFire = Infinity;
    race.player.weapon = "MISSILE";
    race.fire();
    near(race.shots[0].velocity.length(), 320 * pace);
    for (let i = 0; i < 360 && race.shots.length; i++)
      race.update(1 / 120 / pace, neutral);
    assert.equal(race.shots.length, 0);
    assert(target.shield < 100, "missile must hit, not merely expire");
    assert(target.stun > 0);
    return {
      time: race.time * pace,
      shield: target.shield,
      stun: target.stun,
      position: target.position,
    };
  });
  for (const r of results) {
    near(r.time, results[0].time);
    near(r.shield, results[0].shield);
    near(r.stun, results[0].stun);
    assert(r.position.distanceTo(results[0].position) < 1e-7);
  }
});

test("contact impulses and shield consequences remain fair at corresponding class speeds", () => {
  const results = SPEED_CLASSES.map((_, c) => {
    const race = setup(c, straight(), 0, "race");
    race.racers = race.racers.slice(0, 2);
    const [a, b] = race.racers,
      pace = race.classSpec.pace;
    a.position.set(-3, 32.2, 0);
    b.position.set(3, 32.2, 0);
    a.velocity.set(20 * pace, 0, 90 * pace);
    b.velocity.set(-20 * pace, 0, 90 * pace);
    b.aiFire = Infinity;
    race.update(1 / 120 / pace, { ...neutral, throttle: false });
    assert(a.shield < 100 && b.shield < 100);
    return race.racers.map((r) => ({
      shield: r.shield,
      velocity: r.velocity.clone().divideScalar(pace),
      position: r.position,
    }));
  });
  for (const pair of results)
    for (let i = 0; i < 2; i++) {
      near(pair[i].shield, results[0][i].shield);
      assert(pair[i].position.distanceTo(results[0][i].position) < 1e-7);
      assert(pair[i].velocity.distanceTo(results[0][i].velocity) < 1e-7);
    }
});

test("protection, weapon lifetime and off-road rescue follow class time", () => {
  for (let c = 0; c < 3; c++) {
    const race = setup(c),
      p = race.player;
    p.protect = 5;
    p.stun = 0.6;
    p.weapon = "MINE";
    race.fire();
    matchedDrive(race, 0.25);
    near(p.protect, 4.75);
    near(p.stun, 0.35);
    near(race.mines[0].life, 13.75);
    p.position.y += 1000;
    p.grounded = false;
    matchedDrive(race, 3.1, { ...neutral, throttle: false });
    assert(p.grounded, "off-road timeout returns the hull to its checkpoint");
    assert.equal(p.shield, 76);
  }
});

for (let trackIndex = 0; trackIndex < 3; trackIndex++) {
  test(`all physical AI craft earn laps with real terrain on production track ${trackIndex} in every class`, () => {
    const track = makeTrack(trackIndex),
      terrain = createTerrain(track);
    for (let c = 0; c < 3; c++) {
      const race = setup(c, track, 0, "race");
      race.terrain = terrain;
      const visits = new Map(race.racers.slice(1).map((r) => [r.id, 0]));
      const separated = new Set();
      const routes = new Set();
      // Production uses a fixed 120 Hz real-time step in every class.
      for (let step = 0; step < 100 * 120; step++) {
        race.update(1 / 120, { ...neutral, throttle: false });
        for (const r of race.racers.slice(1)) {
          const u =
            (((r.contactS % track.length) + track.length) % track.length) /
            track.length;
          const split =
            u > track.config.split[0] + 1e-7 &&
            u < track.config.split[1] - 1e-7;
          if (!split) {
            separated.delete(r.id);
            continue;
          }
          assert(
            r.branch === -1 || r.branch === 1,
            `AI cannot simulate the phantom centre branch: ${JSON.stringify({ c, step, id: r.id, u, contactS: r.contactS, checkpoint: r.checkpoint, recovered: r.recoveredThisStep, grounded: r.grounded })}`,
          );
          const bounds = track.bounds(r.contactS, r.branch);
          if (bounds.connected) {
            separated.delete(r.id);
            continue;
          }
          routes.add(r.branch);
          if (!separated.has(r.id)) visits.set(r.id, visits.get(r.id) + 1);
          separated.add(r.id);
          if (r.grounded) {
            const f = track.frame(r.contactS, r.branch);
            const x = r.position.clone().sub(f.p).dot(f.right);
            assert(
              x >= bounds.wallMin - 0.15 && x <= bounds.wallMax + 0.15,
              "grounded AI must occupy an actual separated deck, not its empty central gap",
            );
          }
        }
      }
      assert(
        [...visits.values()].every((n) => n >= 1),
        "every craft physically traverses the split",
      );
      assert(
        [...visits.values()].some((n) => n >= 2),
        "actual AI repeats the fork and rejoin",
      );
      assert(routes.size >= 1, "AI traverses a real separated route");
      for (const r of race.racers.slice(1)) {
        assert(
          r.lap >= 2,
          `class ${c}, pilot ${r.id}, craft ${r.craft}: earned lap`,
        );
        assert(
          Number.isFinite(r.position.length()) &&
            Number.isFinite(r.velocity.length()),
        );
      }
    }
  });
}

for (let trackIndex = 0; trackIndex < 3; trackIndex++) {
  test(`class-scaled boost/pitch jumps land on production track ${trackIndex} without rescue`, () => {
    const track = makeTrack(trackIndex),
      terrain = createTerrain(track);
    for (let craft = 0; craft < 3; craft++)
      for (const pitch of [-1, 0, 1]) {
        const results = SPEED_CLASSES.map((_, c) => {
          const race = setup(c, track, craft),
            p = race.player,
            pace = race.classSpec.pace;
          race.terrain = terrain;
          const s = (track.config.jump - 0.018) * track.length;
          const f = track.frame(s);
          p.position.copy(f.p);
          p.position.y += 2.2;
          p.contactS = p.s = s;
          p.yaw = Math.atan2(f.tangent.x, f.tangent.z);
          p.gate = Math.floor((s / track.length) * 32) + 1;
          p.velocity.copy(f.tangent).multiplyScalar(CRAFT[craft].speed * pace);
          p.surge = 2.4;
          let flew = false,
            landed = false,
            steps = 0;
          const recover = race.recover.bind(race);
          race.recover = (r) => {
            assert.fail(
              `unexpected rescue class${c} craft${craft} pitch${pitch}`,
            );
            recover(r);
          };
          for (; steps < 120 * 5; steps++) {
            const wasGrounded = p.grounded;
            race.update(1 / 120 / pace, { ...neutral, pitch });
            if (wasGrounded && !p.grounded) flew = true;
            if (flew && p.grounded) {
              landed = true;
              break;
            }
          }
          assert(landed, `class${c} craft${craft} pitch${pitch} must land`);
          assert.equal(p.shield, 100);
          return { range: p.contactS - s, steps };
        });
        for (const result of results) {
          near(result.range, results[0].range, 1e-5);
          assert.equal(result.steps, results[0].steps);
        }
      }
  });
}
