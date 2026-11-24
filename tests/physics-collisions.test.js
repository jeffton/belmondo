import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Race } from "../src/race.ts";
import { projectRoad } from "../src/road-projection.ts";
import { solveContacts, hullExtent } from "../src/contacts.ts";
import { railBounds } from "../src/rail-profile.ts";
import {
  neutral,
  circuit,
  straight,
  setup,
  drive,
} from "./physics-fixtures.js";

test("reversed ship fires forward in body space and leaves a stationary mine behind its body", () => {
  const race = setup(straight(), "race"),
    p = race.player;
  p.yaw = Math.PI;
  const behind = race.racers[1],
    ahead = race.racers[2];
  behind.position.copy(p.position).add(new THREE.Vector3(0, 0, 25));
  ahead.position.copy(p.position).add(new THREE.Vector3(0, 0, -25));
  behind.s = behind.contactS = p.s + 25;
  ahead.s = ahead.contactS = p.s - 25;
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
  // This is a contact/rail test, not a contest against the NPC's evasive input.
  // Give both hulls the explicit neutral controls supplied below.
  rival.id = 0;
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
    race.update(1 / 120, { ...neutral, steer: 1, airLeft: 1, airRight: 0 });
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
