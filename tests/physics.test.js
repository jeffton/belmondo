import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { Race, SPEED_CLASSES } from "../src/race.ts";
import { projectRoad } from "../src/road-projection.ts";
import { hullExtent } from "../src/contacts.ts";
import { railBounds } from "../src/rail-profile.ts";
import {
  neutral,
  circuit,
  straight,
  setup,
  drive,
  driver,
} from "./physics-fixtures.js";

test("passive throttle cannot rotate around a curve; a yaw controller can race it", () => {
  const passive = setup(),
    active = setup();
  const initialYaw = passive.player.yaw;
  drive(passive, 5);
  assert.equal(
    passive.player.yaw,
    initialYaw,
    "wall response does not align the ship heading",
  );
  drive(passive, 15);
  drive(active, 20, driver);
  assert(passive.player.shield < 90, "wall contact is costly");
  assert(
    active.player.s > passive.player.s + 600,
    "steering, not track projection, earns progression",
  );
  assert(
    active.player.shield > 95,
    "a fair-radius turn is driveable without wall damage",
  );
});

test("engines reach distinct physical cruising speeds without clamping excess momentum", () => {
  const expected = [159, 174, 131];
  for (let craft = 0; craft < 3; craft++) {
    const race = new Race(straight(), craft, "trial");
    race.countdown = 0;
    drive(race, 25);
    assert(
      Math.abs(race.player.speed / race.classSpec.pace - expected[craft]) < 2,
    );
    assert(
      race.player.position.z > expected[craft] * race.classSpec.pace * 20,
      "actual world distance, not a HUD speed multiplier",
    );
    race.player.velocity.z = 230;
    race.update(1 / 120, neutral);
    assert(
      race.player.speed > 229,
      "excess velocity decelerates through drag, not a speed cap",
    );
  }
});

test("boost spools force gradually and carries momentum through its smooth tail", () => {
  const race = new Race(straight(), 1, "trial");
  race.countdown = 0;
  drive(race, 25);
  const cruise = race.player.speed;
  race.player.surge = 1.15;
  race.update(1 / 120, neutral);
  assert(race.player.boost > 0 && race.player.boost < 0.03);
  assert(race.player.speed - cruise < 0.05, "no instant speed step");
  const pace = race.classSpec.pace;
  drive(race, 0.99 / pace);
  const beforeEnd = race.player.speed;
  drive(race, 0.25 / pace);
  assert.equal(race.player.surge, 0);
  assert(
    race.player.boost > 0.8,
    "force decays rather than cutting off at the timer",
  );
  assert(
    race.player.speed > beforeEnd,
    "inertia and residual force continue accelerating after the pad timer",
  );
  drive(race, 0.5 / pace);
  const peak = race.player.speed;
  assert(peak > cruise + 35 * pace);
  drive(race, 2.25 / pace);
  assert(race.player.speed < peak && race.player.speed > cruise + 10 * pace);
  assert(race.player.boost > 0 && race.player.boost < 0.1);
});

test("held pitch changes a real jump's height, range and landing without pose teleports", () => {
  const results = [];
  for (const pitch of [-1, 0, 1]) {
    const track = makeTrack(TRACK_INDEX.COAST),
      race = new Race(track, 1, "trial"),
      p = race.player;
    race.countdown = 0;
    const s = (track.config.jump - 0.01) * track.length,
      frame = track.frame(s);
    p.position.copy(frame.p);
    p.position.y += 2.2;
    p.velocity.copy(frame.tangent).multiplyScalar(160);
    p.contactS = p.s = s;
    p.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    p.pitch = -Math.asin(frame.tangent.y);
    p.pitchRate = 0;
    p.gate = Math.floor((s / track.length) * 32) + 1;
    let flew = false,
      apex = p.position.y,
      takeoff = 0,
      landing = null,
      climbingSpeed;
    for (let step = 0; step < 120 * 3; step++) {
      const previous = p.position.clone(),
        wasGrounded = p.grounded,
        impact = p.velocity.y;
      race.update(1 / 120, { ...neutral, pitch });
      assert(
        p.position.distanceTo(previous) < 2,
        "pitch only changes integrated velocity, never position directly",
      );
      apex = Math.max(apex, p.position.y);
      if (wasGrounded && !p.grounded) {
        flew = true;
        takeoff = step / 120;
      }
      if (flew && climbingSpeed === undefined && step / 120 - takeoff >= 0.2)
        climbingSpeed = p.speed;
      if (flew && p.grounded) {
        landing = { time: step / 120 - takeoff, range: p.contactS - s, impact };
        break;
      }
    }
    assert(landing, "even sustained nose-up must land");
    assert.equal(p.shield, 100, "jump contact remains coherent");
    results.push({ apex, landing, climbingSpeed, pitch: p.pitch });
  }
  const [up, neutralJump, down] = results;
  assert(up.pitch < neutralJump.pitch && down.pitch > neutralJump.pitch);
  assert(
    up.apex > neutralJump.apex + 0.3 && neutralJump.apex > down.apex + 0.2,
  );
  assert(
    up.climbingSpeed < neutralJump.climbingSpeed &&
      neutralJump.climbingSpeed < down.climbingSpeed,
    "climb exchanges forward momentum, rather than granting free height",
  );
  assert(up.landing.range > neutralJump.landing.range + 40);
  assert(down.landing.range < neutralJump.landing.range - 20);
  assert(
    up.landing.time > neutralJump.landing.time &&
      down.landing.time < neutralJump.landing.time,
  );
  assert(
    up.landing.impact > neutralJump.landing.impact &&
      down.landing.impact < neutralJump.landing.impact,
  );
});

test("pitch cannot lift off from grounded hover or sustain flight with the engine held", () => {
  const ground = setup(straight()),
    baseline = setup(straight());
  drive(ground, 2, { ...neutral, pitch: -1 });
  drive(baseline, 2);
  assert.equal(ground.player.position.y, baseline.player.position.y);
  assert.equal(ground.player.speed, baseline.player.speed);
  assert(ground.player.grounded);
  const air = setup(straight());
  air.player.position.y += 25;
  air.player.velocity.set(0, 0, 170);
  air.player.grounded = false;
  air.player.flight = true;
  drive(air, 2.5, { ...neutral, pitch: -1 });
  assert(
    air.player.grounded,
    "bounded pitch authority cannot counteract gravity indefinitely",
  );
});

test("pitch, yaw and bilateral airbrakes remain independent simultaneous controls", () => {
  const race = setup(straight());
  race.player.velocity.set(0, 0, 120);
  drive(race, 0.25, {
    ...neutral,
    steer: 0.5,
    airLeft: 1,
    airRight: 1,
    pitch: -1,
  });
  const pitchOnly = setup(straight());
  pitchOnly.player.velocity.set(0, 0, 120);
  drive(pitchOnly, 0.25, { ...neutral, pitch: -1 });
  assert(race.player.yaw > 0 && race.player.position.x > 0);
  assert(race.player.pitch < 0 && race.player.pitchRate < 0);
  assert(
    Math.abs(race.player.pitch - pitchOnly.player.pitch) < 1e-10,
    "yaw and both airbrakes do not interrupt the physical pitch response",
  );
  assert(
    race.player.speed < 120,
    "both airbrakes still add drag while pitch is held",
  );
});

test("yaw has response time and body velocity retains world inertia", () => {
  const race = setup();
  drive(race, 1);
  const before = race.player.velocity.clone();
  race.update(1 / 120, { ...neutral, steer: 1 });
  assert(race.player.yawRate > 0 && race.player.yawRate < 0.1);
  assert(
    race.player.velocity.clone().normalize().dot(before.normalize()) > 0.999,
  );
  drive(race, 0.2, { ...neutral, steer: 1 });
  const yawRate = race.player.yawRate;
  race.update(1 / 120, neutral);
  assert(race.player.yawRate > 0 && race.player.yawRate < yawRate);
  const forward = new THREE.Vector3(
    Math.sin(race.player.yaw),
    0,
    Math.cos(race.player.yaw),
  );
  assert(
    race.player.velocity.clone().normalize().distanceTo(forward) > 0.01,
    "heading does not overwrite velocity",
  );
});

test("both airbrakes add drag while their yaw moments cancel", () => {
  const free = setup(),
    braked = setup();
  for (const race of [free, braked]) race.player.velocity.set(0, 0, 65);
  drive(free, 0.3, { ...neutral, throttle: false });
  drive(braked, 0.3, { ...neutral, throttle: false, airLeft: 1, airRight: 1 });
  assert.equal(braked.player.yawRate, 0);
  assert(braked.player.speed < free.player.speed - 6);
  const left = setup(),
    right = setup();
  const initialYaw = left.player.yaw;
  drive(left, 0.3, { ...neutral, airLeft: 1, airRight: 0 });
  drive(right, 0.3, { ...neutral, airLeft: 0, airRight: 1 });
  assert(left.player.yaw > initialYaw && right.player.yaw < initialYaw);
});

test("late steering incurs a real wall penalty compared to a planned line", () => {
  const late = setup(),
    planned = setup();
  drive(late, 5);
  drive(late, 7, driver);
  drive(planned, 12, driver);
  assert(planned.player.s > late.player.s + 80);
  assert(planned.player.shield > late.player.shield + 5);
});

test("projection excludes phantom central split road and keeps the chosen branch", () => {
  const track = circuit({ split: true });
  const s = track.length * 0.35;
  const middle = track.frame(s, 0).p;
  const road = projectRoad(track, middle, s, 0);
  assert.notEqual(road.branch, 0);
  assert(
    Math.abs(road.x) > road.width,
    "empty space between routes supplies no hover deck",
  );
  const other = track.frame(s, 1).p;
  const locked = projectRoad(track, other, s, -1);
  assert.equal(locked.branch, -1);
  assert(Math.abs(locked.x) > 50);
});

function connectedSeamStations(track) {
  const [start, end] = track.config.split;
  return [false, true].map((merge) => {
    const stations = Array.from({ length: 99 }, (_, i) => {
      const phase = (i + 1) / 100;
      return { phase, s: (start + (end - start) * phase) * track.length };
    }).filter(
      ({ phase, s }) =>
        (merge ? phase > 0.5 : phase < 0.5) &&
        [-1, 1].every((branch) => track.bounds(s, branch).connected),
    );
    assert(stations.length > 0, "fork has a connected approach and merge");
    // Exercise an interior seam rather than the common endpoint or splitter tip.
    const targetPhase = merge ? 0.875 : 0.125;
    return stations.reduce((best, station) =>
      Math.abs(station.phase - targetPhase) < Math.abs(best.phase - targetPhase)
        ? station
        : best,
    ).s;
  });
}

test("joined production forks and merges have no hidden branch-edge wall", () => {
  for (const index of Object.values(TRACK_INDEX)) {
    const track = makeTrack(index);
    if (track.config.split[0] < 0) continue;
    for (const s of connectedSeamStations(track)) {
      for (const branch of [-1, 1]) {
        const race = setup(track),
          p = race.player;
        const f = track.frame(s, branch);
        const inward = track.bounds(s, branch).innerSide;
        p.yaw = Math.atan2(f.right.x * inward, f.right.z * inward);
        const x = inward * (f.width - hullExtent(p, f.right) - 0.3);
        p.position.copy(f.p).addScaledVector(f.right, x);
        p.position.y += 2.2;
        p.pitch = Math.atan2(
          f.up.x * Math.sin(p.yaw) + f.up.z * Math.cos(p.yaw),
          f.up.y,
        );
        p.pitchRate = 0;
        p.velocity.copy(f.right).multiplyScalar(inward * 65);
        p.s = p.contactS = s;
        p.branch = branch;
        p.gate = Math.floor((s / track.length) * 32) + 1;
        assert(track.bounds(s, branch).connected);
        // Stop once the hull has crossed the old branch edge: continuing the
        // transverse drive eventually hits the opposite, legitimate outer rail.
        const crossedBranchEdge = () =>
          p.position.clone().sub(f.p).dot(f.right) * inward > f.width + 2;
        for (let step = 0; step < 20 && !crossedBranchEdge(); step++) {
          race.update(1 / 120, { ...neutral, throttle: false });
          assert(
            !p.wallTouched,
            `open seam is not a wall: ${index}/${s}/${branch}`,
          );
          assert(
            p.grounded,
            "crossing the open seam stays on its continuous deck",
          );
        }
        assert.equal(p.shield, 100);
        assert(
          crossedBranchEdge(),
          "the body crossed the old independent branch collision boundary",
        );
      }
    }
  }
});

test("a forward drive into the separating splitter tip hits a real barrier", () => {
  for (const index of Object.values(TRACK_INDEX)) {
    const track = makeTrack(index),
      [start, end] = track.config.split;
    if (start < 0) continue;
    let separation = start * track.length;
    while (
      track.bounds(separation + 0.2, -1).connected ||
      separation < start * track.length + 1
    )
      separation += 0.2;
    for (const branch of [-1, 1]) {
      const race = setup(track),
        p = race.player;
      const s = separation - 3;
      const left = track.frame(s, -1),
        right = track.frame(s, 1);
      const f = track.frame(s);
      p.position.copy(left.p).lerp(right.p, 0.5);
      p.position.y += 2.2;
      p.velocity.copy(f.tangent).multiplyScalar(160);
      p.yaw = Math.atan2(f.tangent.x, f.tangent.z);
      p.pitch = -Math.asin(f.tangent.y);
      p.pitchRate = 0;
      p.contactS = p.s = s;
      p.branch = branch;
      p.gate = Math.floor((s / track.length) * 32) + 1;
      let contact = false;
      // Inspect the impact itself, not an arbitrary endpoint after continuing
      // straight through a diverging fork without steering.
      for (let step = 0; step < 80 && !contact; step++) {
        race.update(1 / 120, { ...neutral, throttle: false });
        contact = p.wallTouched;
      }
      assert(contact, `splitter nose must collide: ${index}/${branch}`);
      assert(p.shield < 100);
      assert(
        p.grounded,
        `${track.config.name}/${branch}: tip contact deflects onto a deck rather than passing through the divider`,
      );
      const road = projectRoad(track, p.position, p.contactS, p.branch);
      const bounds = railBounds(p, road, p.position);
      assert(
        road.x >= bounds.min - 0.05 && road.x <= bounds.max + 0.05,
        `${track.config.name}/${branch}: the hull clears the splitter at impact`,
      );
    }
  }
});

test("route selection follows the connected fork, but separated routes retain their walls", () => {
  for (const index of Object.values(TRACK_INDEX)) {
    const track = makeTrack(index),
      [start, end] = track.config.split;
    if (start < 0) continue;
    for (const s of connectedSeamStations(track)) {
      for (const branch of [-1, 1]) {
        const f = track.frame(s, -branch);
        const position = f.p.clone();
        position.y += 2.2;
        const road = projectRoad(track, position, s, branch);
        assert.equal(
          road.branch,
          -branch,
          "the branch is not locked across an open deck",
        );
      }
    }
    const s = (start + (end - start) * 0.5) * track.length;
    for (const branch of [-1, 1]) {
      const f = track.frame(s, branch),
        bounds = track.bounds(s, branch);
      assert(!bounds.connected);
      const other = track.frame(s, -branch).p.clone();
      other.y += 2.2;
      assert.equal(projectRoad(track, other, s, branch).branch, branch);
      for (const side of [-1, 1]) {
        const race = setup(track),
          p = race.player;
        p.yaw = Math.atan2(f.right.x * side, f.right.z * side);
        p.position.copy(f.p);
        p.position.y += 2.2;
        p.pitch = -Math.asin(f.tangent.y);
        p.pitchRate = 0;
        const profile = railBounds(
          p,
          projectRoad(track, p.position, s, branch),
          p.position,
        );
        p.position.addScaledVector(
          f.right,
          (side === 1 ? profile.max : profile.min) - side * 0.1,
        );
        p.velocity.copy(f.right).multiplyScalar(side * 50);
        p.s = p.contactS = s;
        p.branch = branch;
        p.gate = Math.floor((s / track.length) * 32) + 1;
        race.update(1 / 120, { ...neutral, throttle: false });
        assert(p.wallTouched, "real inner and outer barriers still collide");
        assert(p.shield < 100);
      }
    }
  }
});

test("nearby unrelated road cannot teleport projection or award a cut lap", () => {
  const race = setup();
  const p = race.player;
  p.position.copy(race.track.frame(race.track.length * 0.65).p);
  p.position.y += 2.2;
  const before = p.position.clone();
  race.update(1 / 120, neutral);
  assert(
    p.position.distanceTo(before) < 0.1,
    "remote road cannot magnetically pull the body to its barrier",
  );
  assert(p.contactS < 48, "projection stays on connected local segments");
  assert.equal(p.lap, 1);
  assert(p.s < race.track.length / 32);
  assert.equal(race.laps.length, 0);
});

test("each class needs its configured laps to finish, and AI advances the ranking", () => {
  for (let c = 0; c < SPEED_CLASSES.length; c++) {
    const race = new Race(circuit(), 0, "race", c);
    race.countdown = 0;
    const lapCount = race.lapCount;
    drive(race, lapCount, { ...neutral, throttle: false });
    assert(
      race.position > 1,
      "rivals physically overtake the stationary player",
    );
    let sawFourth = false;
    for (let step = 0; step < 160 * 120 && !race.finished; step++) {
      const pace = race.classSpec.pace;
      const controls = driver({
        ...race,
        player: {
          ...race.player,
          speed: race.player.speed / pace,
          yawRate: race.player.yawRate / pace,
        },
      });
      race.update(1 / 120, controls);
      if (race.laps.length === lapCount - 1) {
        sawFourth = true;
        assert.equal(race.finished, false);
        assert.equal(race.player.lap, lapCount);
      }
    }
    assert(
      sawFourth,
      "crossed the actual fourth finish after its ordered gates",
    );
    assert(race.finished, `class ${c} finishes its ${lapCount} earned laps`);
    assert.equal(race.laps.length, lapCount);
    assert.equal(race.player.lap, lapCount + 1);
    assert.equal(race.player.gate, lapCount * 32 + 1);
    assert(
      race.racers.slice(1).every((r) => r.lap > 1),
      "AI keeps earning laps during the race",
    );
  }
});

test("arriving at the finish with missing sector gates cannot award a lap", () => {
  const race = setup();
  const p = race.player,
    length = race.track.length;
  p.contactS = length - 2;
  p.position.copy(race.track.frame(length - 2).p);
  p.position.y += 2.2;
  p.yaw = 0;
  p.velocity.set(0, 0, 60);
  drive(race, 0.1);
  assert.equal(p.lap, 1);
  assert.equal(p.gate, 1);
  assert.equal(race.laps.length, 0);
});

test("a legitimate ballistic jump can cross an ordered gate over missing deck", () => {
  const track = circuit({ gap: true }),
    race = setup(track),
    p = race.player;
  const gate = (track.length * 23) / 32;
  const f = track.frame(gate - 1);
  p.contactS = gate - 1;
  p.s = gate - 1;
  p.gate = 23;
  p.position.copy(f.p);
  p.position.y += 5;
  p.velocity.copy(f.tangent).multiplyScalar(70);
  p.yaw = Math.atan2(f.tangent.x, f.tangent.z);
  p.pitch = -Math.asin(f.tangent.y);
  p.pitchRate = 0;
  p.grounded = false;
  p.flight = true;
  drive(race, 0.05, { ...neutral, throttle: false });
  assert.equal(p.gate, 24);
  assert(!p.grounded);
});

test("rescue immediately after a finish cannot award that lap twice", () => {
  const race = setup(),
    p = race.player,
    length = race.track.length;
  p.contactS = length - 1;
  p.s = length - 1;
  p.gate = 32;
  p.position.copy(race.track.frame(length - 1).p);
  p.position.y += 2.2;
  p.yaw = 0;
  p.velocity.set(0, 0, 50);
  while (p.lap === 1) race.update(1 / 120, neutral);
  assert.equal(p.checkpoint.gate, 32);
  race.recover(p);
  p.velocity.set(0, 0, 50);
  drive(race, 0.2, neutral);
  assert.equal(p.lap, 2);
  assert.equal(race.laps.length, 1);
});

test("reverse finish crossing cannot award a lap even at the finish line", () => {
  const race = setup();
  const p = race.player,
    length = race.track.length;
  p.contactS = length + 1;
  p.s = length - 1;
  p.gate = 32;
  p.position.copy(race.track.frame(length + 1).p);
  p.position.y += 2.2;
  p.velocity.copy(race.track.frame(length).tangent).multiplyScalar(-50);
  drive(race, 0.1, { ...neutral, throttle: false });
  assert.equal(p.lap, 1);
  assert.equal(race.laps.length, 0);
});

test("gap flight retains horizontal velocity and failed jumps recover before launch", () => {
  const track = circuit({ gap: true }),
    race = setup(track),
    p = race.player;
  const s = track.length * 0.705;
  const f = track.frame(s);
  p.contactS = s;
  p.position.copy(f.p);
  p.position.y += 2.2;
  p.yaw = Math.atan2(f.tangent.x, f.tangent.z);
  p.pitch = -Math.asin(f.tangent.y);
  p.pitchRate = 0;
  p.velocity.copy(f.tangent).multiplyScalar(5);
  p.grounded = false;
  const checkpoint = p.checkpoint.s;
  race.update(1 / 120, { ...neutral, throttle: false });
  assert(p.velocity.y < 0, "no hover force over a gap");
  assert(Math.hypot(p.velocity.x, p.velocity.z) > 4.99);
  drive(race, 1.2, { ...neutral, throttle: false });
  assert(p.contactS < track.length * 0.7);
  assert(p.s <= checkpoint + 1, "rescue is behind, never beyond the gap");
  assert(p.shield < 100);
});

test("AI uses the same body integrator rather than assigning track position or yaw", () => {
  const race = setup(circuit(), "race");
  const ai = race.racers[1];
  race.racers = [ai]; // isolate the driver from deliberate hull-overlap correction
  ai.position.x += 3;
  ai.yaw += 0.6;
  const position = ai.position.clone(),
    yaw = ai.yaw;
  race.update(1 / 120, neutral);
  assert(
    ai.position.distanceTo(position) < 0.1,
    "controller cannot snap position to road",
  );
  assert(
    Math.abs(ai.yaw - yaw) < 0.001,
    "yaw changes through finite angular response",
  );
  drive(race, 10, driver);
  for (const r of race.racers) {
    assert(
      Number.isFinite(r.position.length()) &&
        Number.isFinite(r.velocity.length()),
    );
    assert(Number.isFinite(r.s) && Number.isFinite(r.yawRate));
  }
  assert(ai.s > 200, "AI earns forward progress using its driver");
});

for (const index of Object.values(TRACK_INDEX)) {
  test(`production course ${index}: unarmed body AI earns an ordered lap including every craft's jump`, () => {
    const race = setup(makeTrack(index), "race");
    // Locomotion must earn ordered gates; armed-pack survival is tested separately.
    // A permanent combat elimination must not fail this driving-only test.
    for (const racer of race.racers) racer.aiFire = Infinity;
    // FAULTLINE's linked turns add 5% physical distance; its slowest C1
    // craft needs ~152 s, before any pack-contact delay. Keep the horizon
    // aligned with the terrain driving matrix, without bypassing gates.
    const seconds = index === TRACK_INDEX.FAULTLINE ? 160 : 100;
    drive(race, seconds, { ...neutral, throttle: false });
    for (const r of race.racers.slice(1)) {
      assert(
        r.lap >= 2,
        `track ${index}, pilot ${r.id}: must earn every sector and finish`,
      );
      assert(
        Number.isFinite(r.position.length()) &&
          Number.isFinite(r.velocity.length()),
      );
    }
  });
}

test("grid racers behind the start retain negative physical progression", () => {
  const race = setup(circuit(), "race");
  race.update(1 / 120, neutral);
  assert(race.racers.slice(1).every((r) => r.s < 0));
});

test("exhausted wall shields permanently eliminate, never reboot or ride walls", () => {
  const race = setup(),
    p = race.player;
  p.shield = 0;
  p.velocity.set(0, 0, 60);
  race.update(1 / 120, neutral);
  assert.equal(p.shield, 0);
  assert.equal(p.velocity.length(), 0);
  assert.equal(p.protect, 0);
  assert.equal(p.eliminated, true);
  const position = p.position.clone();
  for (let step = 0; step < 120; step++)
    race.update(1 / 120, { throttle: true });
  assert(p.position.equals(position));
  assert.equal(p.shield, 0);
});

test("production road projection includes actual ramp height", () => {
  const track = makeTrack(TRACK_INDEX.COAST);
  const s = (track.config.jump - 0.004) * track.length;
  const f = track.frame(s);
  const road = projectRoad(track, f.p, s, 0);
  assert(Math.abs(road.point.y - f.p.y) < 0.1);
});

test("projection never tilts the launch lip down toward the absent gap deck", () => {
  const track = makeTrack(TRACK_INDEX.COAST),
    s = track.config.jump * track.length - 0.2;
  const f = track.frame(s);
  const road = projectRoad(track, f.p, s - 0.7, 0);
  const actual = track
    .frame(s + 0.05)
    .p.sub(track.frame(s - 0.05).p)
    .normalize();
  assert(Math.abs(road.tangent.y - actual.y) < 0.01);
  assert(road.tangent.y > 0, "launch retains the rising ramp slope");
});
