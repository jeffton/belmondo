import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, mod } from "../src/track.js";
import { Race, LAPS, SPEED_CLASSES } from "../src/race.js";
import { projectRoad } from "../src/road-projection.js";
import { solveContacts, hullExtent } from "../src/contacts.js";
import { railBounds } from "../src/rail-profile.js";

const neutral = { throttle: true, steer: 0, air: 0, brake: false };
function circuit({ gap = false, split = false } = {}) {
  const radius = 200,
    length = Math.PI * 2 * radius;
  const config = { split: split ? [0.25, 0.45] : [0.9, 0.9], jump: 0.7 };
  return {
    length,
    config,
    curvature: () => 1 / radius,
    gap: (u) => gap && u >= 0.7 && u < 0.72,
    frame(s, branch = 0) {
      const u = mod(s, length) / length,
        theta = s / radius;
      const phase = Math.max(0, Math.min(1, (u - 0.25) / 0.2));
      const offset = split ? branch * 42 * Math.sin(phase * Math.PI) ** 2 : 0;
      const right = new THREE.Vector3(Math.cos(theta), 0, -Math.sin(theta));
      const p = new THREE.Vector3(
        radius * (1 - Math.cos(theta)),
        30,
        radius * Math.sin(theta),
      ).addScaledVector(right, offset);
      const tangent = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
      return {
        p,
        tangent,
        right,
        up: new THREE.Vector3(0, 1, 0),
        width: 15,
        metric: 1,
        u,
      };
    },
  };
}
function straight(width = 15) {
  return {
    length: 1_000_000,
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

function setup(track = circuit(), mode = "trial") {
  const race = new Race(track, 0, mode);
  race.countdown = 0;
  return race;
}
function drive(race, seconds, control = neutral) {
  for (let i = 0; i < seconds * 120; i++)
    race.update(
      1 / 120,
      typeof control === "function" ? control(race) : control,
    );
}
function driver(race) {
  const p = race.player,
    frame = race.track.frame(p.contactS, p.branch);
  const curve = race.track.curvature(p.contactS, p.branch);
  const desiredYaw =
    Math.atan2(frame.tangent.x, frame.tangent.z) +
    (curve * p.speed) / 7 -
    Math.atan2(p.x, 35);
  const error = Math.atan2(
    Math.sin(desiredYaw - p.yaw),
    Math.cos(desiredYaw - p.yaw),
  );
  return {
    ...neutral,
    steer: Math.max(
      -1,
      Math.min(1, (curve * p.speed + error * 2 - p.yawRate * 0.1) / 0.9),
    ),
    brake: Math.max(
      0,
      Math.min(1, (p.speed - Math.sqrt(75 / Math.abs(curve))) / 15),
    ),
  };
}

test("passive throttle cannot rotate around a curve; a yaw controller can race it", () => {
  const passive = setup(),
    active = setup();
  drive(passive, 5);
  assert.equal(
    passive.player.yaw,
    0,
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
    assert(Math.abs(race.player.speed - expected[craft]) < 2);
    assert(
      race.player.position.z > expected[craft] * 20,
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
  drive(race, 0.99);
  const beforeEnd = race.player.speed;
  drive(race, 0.25);
  assert.equal(race.player.surge, 0);
  assert(
    race.player.boost > 0.8,
    "force decays rather than cutting off at the timer",
  );
  assert(
    race.player.speed > beforeEnd,
    "inertia and residual force continue accelerating after the pad timer",
  );
  drive(race, 0.5);
  const peak = race.player.speed;
  assert(peak > cruise + 35);
  drive(race, 2.25);
  assert(race.player.speed < peak && race.player.speed > cruise + 10);
  assert(race.player.boost > 0 && race.player.boost < 0.1);
});

test("held pitch changes a real jump's height, range and landing without pose teleports", () => {
  const results = [];
  for (const pitch of [-1, 0, 1]) {
    const track = makeTrack(0),
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
      if (step === 71) climbingSpeed = p.speed;
      apex = Math.max(apex, p.position.y);
      if (wasGrounded && !p.grounded) {
        flew = true;
        takeoff = step / 120;
      }
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
    air: 0,
    airLeft: 1,
    airRight: 1,
    pitch: -1,
  });
  assert(race.player.yaw > 0 && race.player.position.x > 0);
  assert(race.player.pitch < -0.15);
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
  drive(left, 0.3, { ...neutral, air: 1, airLeft: 1, airRight: 0 });
  drive(right, 0.3, { ...neutral, air: -1, airLeft: 0, airRight: 1 });
  assert(left.player.yaw > 0 && right.player.yaw < 0);
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

test("joined production forks and merges have no hidden branch-edge wall", () => {
  for (let index = 0; index < 3; index++) {
    const track = makeTrack(index);
    const [start, end] = track.config.split;
    for (const phase of [0.2, 0.8]) {
      for (const branch of [-1, 1]) {
        const race = setup(track),
          p = race.player;
        const s = (start + (end - start) * phase) * track.length;
        const f = track.frame(s, branch);
        const inward = -branch;
        p.yaw = Math.atan2(f.right.x * inward, f.right.z * inward);
        const x = inward * (f.width - hullExtent(p, f.right) - 0.3);
        p.position.copy(f.p).addScaledVector(f.right, x);
        p.position.y += 2.2;
        p.velocity.copy(f.right).multiplyScalar(inward * 65);
        p.s = p.contactS = s;
        p.branch = branch;
        p.gate = Math.floor((s / track.length) * 32) + 1;
        assert(track.bounds(s, branch).connected);
        for (let step = 0; step < 20; step++) {
          race.update(1 / 120, { ...neutral, throttle: false });
          assert(
            !p.wallTouched,
            `open seam is not a wall: ${index}/${phase}/${branch}`,
          );
          assert(
            p.grounded,
            "crossing the open seam stays on its continuous deck",
          );
        }
        assert.equal(p.shield, 100);
        assert(
          p.position.clone().sub(f.p).dot(f.right) * inward > f.width + 2,
          "the body crossed the old independent branch collision boundary",
        );
      }
    }
  }
});

test("a forward drive into the separating splitter tip hits a real barrier", () => {
  for (let index = 0; index < 3; index++) {
    const track = makeTrack(index),
      [start, end] = track.config.split;
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
      p.contactS = p.s = s;
      p.branch = branch;
      p.gate = Math.floor((s / track.length) * 32) + 1;
      let contact = false;
      for (let step = 0; step < 80; step++) {
        race.update(1 / 120, { ...neutral, throttle: false });
        contact ||= p.wallTouched;
      }
      assert(contact, `splitter nose must collide: ${index}/${branch}`);
      assert(p.shield < 100);
      assert(
        p.grounded,
        "tip contact deflects onto a deck rather than passing through the divider",
      );
    }
  }
});

test("route selection follows the connected fork, but separated routes retain their walls", () => {
  for (let index = 0; index < 3; index++) {
    const track = makeTrack(index),
      [start, end] = track.config.split;
    for (const phase of [0.2, 0.8]) {
      const s = (start + (end - start) * phase) * track.length;
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

test("five earned laps finish every class; four laps do not, and AI advances the ranking", () => {
  for (let c = 0; c < SPEED_CLASSES.length; c++) {
    const race = new Race(circuit(), 0, "race", c);
    race.countdown = 0;
    drive(race, 5, { ...neutral, throttle: false });
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
      if (race.laps.length === 4) {
        sawFourth = true;
        assert.equal(race.finished, false);
        assert.equal(race.player.lap, 5);
      }
    }
    assert(
      sawFourth,
      "crossed the actual fourth finish after its ordered gates",
    );
    assert(race.finished, `class ${c} finishes its fifth earned lap`);
    assert.equal(race.laps.length, LAPS);
    assert.equal(race.player.lap, LAPS + 1);
    assert.equal(race.player.gate, LAPS * 32 + 1);
    assert(
      race.racers.slice(1).every((r) => r.lap > 1),
      "AI keeps earning laps during the five-lap race",
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

test("body AI earns an ordered lap on every production course, including every craft's jump", () => {
  for (let index = 0; index < 3; index++) {
    const race = setup(makeTrack(index), "race");
    drive(race, 100, { ...neutral, throttle: false });
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
  }
});

test("grid racers behind the start retain negative physical progression", () => {
  const race = setup(circuit(), "race");
  race.update(1 / 120, neutral);
  assert(race.racers.slice(1).every((r) => r.s < 0));
});

test("exhausted wall shields trigger a stationary reboot, not zero-shield wall riding", () => {
  const race = setup(),
    p = race.player;
  p.shield = 0;
  p.velocity.set(0, 0, 60);
  race.update(1 / 120, neutral);
  assert.equal(p.shield, 65);
  assert.equal(p.velocity.length(), 0);
  assert.equal(p.protect, 2);
});

test("production road projection includes actual ramp height", () => {
  const track = makeTrack(0);
  const s = (track.config.jump - 0.004) * track.length;
  const f = track.frame(s);
  const road = projectRoad(track, f.p, s, 0);
  assert(Math.abs(road.point.y - f.p.y) < 0.1);
});

test("projection never tilts the launch lip down toward the absent gap deck", () => {
  const track = makeTrack(0),
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

test("reversed ship fires forward in body space and leaves a stationary mine behind its body", () => {
  const race = setup(straight(), "race"),
    p = race.player;
  p.yaw = Math.PI;
  const behind = race.racers[1],
    ahead = race.racers[2];
  behind.position.copy(p.position).add(new THREE.Vector3(0, 0, 25));
  ahead.position.copy(p.position).add(new THREE.Vector3(0, 0, -25));
  behind.s = ahead.s = p.s + 25;
  p.weapon = "PULSE";
  race.fire();
  assert.equal(behind.shield, 100, "track-forward is behind the reversed ship");
  assert(ahead.shield < 100, "pulse follows the actual nose");
  p.weapon = "MISSILE";
  race.fire();
  assert.equal(race.shots.at(-1).target, ahead.id);
  p.weapon = "MINE";
  race.fire();
  const mine = race.mines[0],
    location = mine.position.clone();
  assert(Math.abs(location.z - p.position.z - 5) < 0.001);
  behind.position.copy(location);
  behind.s = 5000;
  const shield = behind.shield;
  race.update(1 / 120, { ...neutral, throttle: false });
  assert(
    behind.shield < shield,
    "mine collision uses real world proximity, not track progress",
  );
  assert.equal(race.mines.length, 0);
  assert(
    mine.position.equals(location),
    "mine never follows the road or the owner",
  );
  const beforeSeeker = ahead.shield;
  drive(race, 0.3, { ...neutral, throttle: false });
  assert(
    ahead.shield < beforeSeeker,
    "body-forward seeker travels backward along the course and actually hits its acquired target",
  );
});

function contactBody(id, x, z, vx, vz, y = 32.2) {
  return {
    id,
    yaw: 0,
    position: new THREE.Vector3(x, y, z),
    velocity: new THREE.Vector3(vx, 0, vz),
  };
}
function contactStep(bodies, dt) {
  for (const body of bodies) body.position.addScaledVector(body.velocity, dt);
  solveContacts(
    bodies,
    () => {},
    () => {},
  );
}

test("head-on and rear hull impacts exchange reciprocal momentum without interpenetration", () => {
  for (const [av, bv] of [
    [100, -100],
    [140, 100],
  ]) {
    const a = contactBody(0, 0, -4.3, 0, av),
      b = contactBody(1, 0, 4.3, 0, bv);
    const energy = a.velocity.lengthSq() + b.velocity.lengthSq();
    contactStep([a, b], 1 / 120);
    assert(Math.abs(a.velocity.z + b.velocity.z - av - bv) < 1e-9);
    assert(a.velocity.lengthSq() + b.velocity.lengthSq() < energy);
    assert(b.position.z - a.position.z >= 8.5 - 1e-9);
    assert(
      Math.abs(a.velocity.z) > 1 && Math.abs(b.velocity.z) > 1,
      "normal impact is not a scripted zero-speed stop",
    );
    assert(b.velocity.z > a.velocity.z, "low restitution separates the hulls");
  }
});

test("clean side-by-side overtakes and vertically separated split/jump hulls do not collide", () => {
  const a = contactBody(0, -3.2, -6, 0, 150),
    b = contactBody(1, 3.2, 6, 0, 100);
  for (let step = 0; step < 120; step++) contactStep([a, b], 1 / 120);
  assert(a.position.z > b.position.z);
  assert.equal(a.velocity.z, 150);
  assert.equal(b.velocity.z, 100);
  const upper = contactBody(2, 0, 0, 0, -100, 42.2),
    lower = contactBody(3, 0, 0, 0, 100);
  upper.branch = 1;
  lower.branch = -1;
  contactStep([upper, lower], 1 / 120);
  assert.equal(upper.velocity.z, -100);
  assert.equal(lower.velocity.z, 100);
});

test("sustained side pressure converges across fixed timesteps and transfers momentum to AI/AI hulls", () => {
  const results = [];
  for (const hz of [120, 240]) {
    const a = contactBody(3, 0, 0, 0, 100),
      b = contactBody(4, 6.2, 0, 0, 100);
    for (let step = 0; step < hz; step++) {
      a.velocity.x += 16 / hz;
      contactStep([a, b], 1 / hz);
    }
    assert(
      Math.abs(a.velocity.x - 8) < 0.05 && Math.abs(b.velocity.x - 8) < 0.05,
    );
    assert(
      b.position.x > 10,
      "the rival actually moves sideways under sustained pressure",
    );
    assert(b.position.x - a.position.x >= 6.2 - 1e-9);
    results.push([a.position.x, b.position.x]);
  }
  assert(Math.abs(results[0][0] - results[1][0]) < 0.04);
  assert(Math.abs(results[0][1] - results[1][1]) < 0.04);
});

test("player side pressure pushes a rival into the real barrier without wall bypass or wing clipping", () => {
  const width = 18;
  const race = setup(straight(width), "race");
  race.racers = race.racers.slice(0, 2);
  const p = race.player,
    rival = race.racers[1],
    right = new THREE.Vector3(1, 0, 0);
  rival.position.set(width - hullExtent(rival, right) - 1.5, 32.2, 0);
  p.position.set(rival.position.x - 7, 32.2, 0);
  p.contactS = p.s = rival.contactS = rival.s = 0;
  p.yaw = 0.2;
  p.velocity.set(Math.sin(0.2) * 120, 0, Math.cos(0.2) * 120);
  rival.velocity.set(0, 0, 120);
  let wallFrames = 0,
    shieldAtWall;
  for (let step = 0; step < 90; step++) {
    race.update(1 / 120, neutral);
    for (const r of race.racers) {
      const road = projectRoad(race.track, r.position, r.contactS, r.branch);
      const profile = railBounds(r, road, r.position);
      assert(
        r.position.x <= profile.max + 0.02 &&
          r.position.x >= profile.min - 0.02,
        "contacts and the static barrier must constrain the same physical hull",
      );
      assert(
        r.grounded,
        "contact corrections cannot bypass the barrier and leak off the deck",
      );
    }
    if (rival.wallTouched) {
      wallFrames++;
      if (shieldAtWall === undefined) shieldAtWall = rival.shield;
    }
  }
  assert(
    wallFrames > 20,
    "sustained pressure holds the rival against the edge",
  );
  assert(
    rival.position.x > 10,
    "rival has been pushed across the available lane",
  );
  assert(
    rival.shield < shieldAtWall - 1,
    "being pinned against a barrier causes continued scrape damage",
  );
  assert(rival.speed < 110, "wall pressure also costs real speed");
});

test("rotating a hull already alongside a barrier cannot disable wall response or hover", () => {
  const width = 19;
  const race = new Race(straight(width), 2, "trial");
  race.countdown = 0;
  const p = race.player,
    right = new THREE.Vector3(1, 0, 0);
  p.position.x =
    railBounds(p, projectRoad(race.track, p.position, 0, 0), p.position).max -
    0.1;
  p.yawRate = 1.607;
  p.velocity.set(0, 0, 100);
  for (let step = 0; step < 20; step++) {
    race.update(1 / 120, { ...neutral, steer: 1, air: 1 });
    const road = projectRoad(race.track, p.position, p.contactS, p.branch);
    const profile = railBounds(p, road, p.position);
    assert(
      p.position.x <= profile.max + 0.02 && p.position.x >= profile.min - 0.02,
      "previous orientation establishes contact eligibility, current orientation establishes clearance",
    );
    assert(
      p.grounded,
      "rotation into a solid barrier cannot switch off the hover footprint",
    );
  }
  assert(
    p.shield < 99,
    "rotating the wing into the barrier causes normal scrape damage",
  );
});

test("protected AI/AI ships still exchange physical pressure but absorb contact damage", () => {
  const results = [];
  for (const protectedShips of [false, true]) {
    const race = setup(straight(), "race");
    race.racers = race.racers.slice(1, 3);
    const [a, b] = race.racers;
    for (const r of race.racers) {
      r.contactS = r.s = 0;
      r.protect = protectedShips ? 10 : 0;
    }
    a.position.set(0, 32.2, 0);
    b.position.set(6.1, 32.2, 0);
    a.velocity.set(20, 0, 100);
    b.velocity.set(0, 0, 100);
    race.update(1 / 120, neutral);
    assert(
      b.velocity.x > 5 && a.velocity.x < 15,
      "AI/AI use the same reciprocal solver as the player",
    );
    if (protectedShips) assert.equal(a.shield + b.shield, 200);
    else assert(a.shield < 100 && b.shield < 100);
    results.push([
      a.position.clone(),
      b.position.clone(),
      a.velocity.clone(),
      b.velocity.clone(),
    ]);
  }
  for (let i = 0; i < 4; i++)
    assert(
      results[0][i].distanceTo(results[1][i]) < 1e-9,
      "protection changes energy loss, not collision momentum",
    );
});

test("the eight-ship grid starts without hull overlap or false impacts", () => {
  const race = setup(straight(), "race");
  race.update(1 / 120, neutral);
  for (const r of race.racers) assert.equal(r.shield, 100);
  assert(
    !race.events.some(
      (event) => event.kind === "hit" || event.kind === "scrape",
    ),
  );
});

test("weapons still apply protection, damage and velocity loss to physical bodies", () => {
  const race = setup(circuit(), "race"),
    p = race.player;
  p.weapon = "SHIELD";
  race.fire();
  race.damage(p, 50);
  assert.equal(p.shield, 100);
  p.protect = 0;
  p.velocity.set(0, 0, 60);
  race.damage(p, 20);
  assert.equal(p.shield, 80);
  assert(p.velocity.z < 50);
  p.weapon = "MINE";
  race.fire();
  assert.equal(race.mines[0].owner, p.id);
});
