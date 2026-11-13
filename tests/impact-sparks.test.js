import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ImpactSparks } from "../src/impact-sparks.js";
import { World } from "../src/world.js";
import { frameDelta } from "../src/frame-clock.js";

function fixture(side = 1, speed = 180, bank = 0) {
  const rotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    bank,
  );
  const frame = {
    p: new THREE.Vector3(0, 40, 60),
    right: new THREE.Vector3(1, 0, 0).applyQuaternion(rotation),
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(rotation),
    tangent: new THREE.Vector3(0, 0, 1),
  };
  const racer = {
    position: new THREE.Vector3(20, 40, 60),
    velocity: frame.tangent.clone().multiplyScalar(speed),
    yaw: 0,
    wallTouched: true,
    wallSide: side,
  };
  const scene = new THREE.Scene();
  return { sparks: new ImpactSparks(scene), scene, racer, frame };
}

test("rail fragments start at the contacting hull side and trail with speed on either banked rail", () => {
  for (const side of [-1, 1]) {
    const { sparks, racer, frame } = fixture(side, 180, 0.3);
    const position = racer.position.clone();
    const velocity = racer.velocity.clone();
    sparks.burst(racer, frame, () => 0.5);
    const particle = sparks.particles[0];
    assert.ok(
      particle.position.clone().sub(position).dot(frame.right) * side > 2,
    );
    assert.ok(particle.velocity.dot(frame.right) * side < 0);
    assert.ok(particle.velocity.dot(frame.up) > 0);
    assert.ok(particle.velocity.dot(frame.tangent) > 0);
    assert.ok(particle.velocity.dot(frame.tangent) < racer.velocity.length());
    assert.deepEqual(racer.position, position);
    assert.deepEqual(racer.velocity, velocity);
    const start = particle.position.clone();
    sparks.update(1 / 120);
    assert.ok(particle.position.z > start.z);
    const p = sparks.positions;
    assert.ok(
      p[5] > p[2],
      "streak head points along its travel, not a billboard",
    );
    const streakLength = Math.hypot(p[3] - p[0], p[4] - p[1], p[5] - p[2]);
    assert.ok(streakLength < 1 && streakLength > 0.1);
  }
  const slow = fixture(1, 60),
    fast = fixture(1, 240);
  slow.sparks.burst(slow.racer, slow.frame, () => 0.5);
  fast.sparks.burst(fast.racer, fast.frame, () => 0.5);
  assert.ok(
    fast.sparks.particles[0].velocity.z > slow.sparks.particles[0].velocity.z,
  );
});

test("final-pass rail impacts retain their contact side without wallTouched", () => {
  for (const side of [-1, 1]) {
    const { sparks, racer, frame } = fixture(side);
    racer.wallTouched = false;
    racer.wallSide = -side;
    racer.position.x = side * 20;
    sparks.burst(racer, frame, () => 0.5);
    const particle = sparks.particles[0];
    assert.ok(
      particle.position.clone().sub(racer.position).dot(frame.right) * side > 2,
    );
    assert.ok(particle.velocity.dot(frame.right) * side < 0);
  }
});

test("hot metallic streaks cool, expire quickly and recycle without scene growth", () => {
  const { sparks, scene, racer, frame } = fixture();
  const positions = sparks.mesh.geometry.attributes.position.array;
  for (let i = 0; i < 100; i++) sparks.burst(racer, frame, () => 0.5);
  sparks.update(0.001);
  const hot = Array.from(sparks.colors.slice(3, 6));
  assert.ok(hot[0] >= hot[1] && hot[1] > hot[2]);
  sparks.update(0.08);
  const cool = Array.from(sparks.colors.slice(3, 6));
  assert.ok(cool[0] < hot[0] && cool[2] / cool[0] < hot[2] / hot[0]);
  assert.equal(scene.children.length, 1);
  assert.equal(sparks.mesh.geometry.attributes.position.array, positions);
  assert.equal(
    sparks.mesh.geometry.drawRange.count,
    sparks.particles.length * 2,
  );
  assert.equal(sparks.mesh.material.depthTest, true);
  assert.equal(sparks.mesh.material.depthWrite, false);
  sparks.update(0.3);
  assert.equal(sparks.mesh.visible, false);
  assert.equal(sparks.mesh.geometry.drawRange.count, 0);
  sparks.burst(racer, frame);
  sparks.update(0);
  sparks.reset();
  sparks.update(0);
  assert.equal(sparks.mesh.visible, false);
  assert.equal(sparks.mesh.geometry.drawRange.count, 0);
});

test("first race RAF after start completes and schedules its successor", async () => {
  const source = await readFile(
    new URL("../src/main.js", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("function animate(now) {");
  const end = source.indexOf("\nasync function loadFiles(", start);
  assert.ok(start >= 0 && end > start);
  const animateSource = source.slice(start, end);
  const calls = [];
  const scheduled = [];
  const race = {
    player: {
      speed: 0,
      grounded: true,
      contactS: 0,
      branch: 0,
      boost: 0,
      vx: 0,
    },
    classSpec: { pace: 1 },
    events: [],
    finished: false,
    update() {},
  };
  const world = {
    camera: { matrixWorld: {} },
    finishDistrict: { foundations: [] },
    quality: "retro",
    draw: (...args) => calls.push(args),
  };
  const bindings = {
    renderingFailed: false,
    rendererMode: "webgl",
    frameDelta,
    last: null,
    state: "race",
    paused: false,
    input: () => ({ steeringKind: "digital" }),
    lastControls: null,
    race,
    accumulator: 0,
    countdownBoardStage: () => "armed",
    previousCount: "armed",
    sound: { setTunnel() {}, update() {}, updateCrowd() {}, raceEvent() {} },
    music: { setTunnel() {} },
    track: { isTunnel: () => false },
    world,
    LAPS: 5,
    crowdRight: { setFromMatrixColumn() {} },
    getCrowdMix: () => 0,
    hudTick: 0,
    updateHUD() {},
    showResults() {},
    renderFrames: 0,
    renderTime: 0,
    qualityToggle: { checked: true },
    requestAnimationFrame: (callback) => scheduled.push(callback),
  };
  const animate = new Function(
    ...Object.keys(bindings),
    `${animateSource}\nreturn animate;`,
  )(...Object.values(bindings));

  // Simulate the already-sampled RAF timestamp preceding the race-start click.
  animate(999);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 0);
  assert.equal(scheduled.length, 1);
  const secondFrame = scheduled.shift();
  secondFrame(1015);
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1], 0.016);
  assert.equal(scheduled.length, 1);
});

test("scrapes use the contact frame while hit and landing retain their existing burst", () => {
  const { sparks, racer, frame } = fixture();
  racer.s = 120;
  racer.contactS = 119;
  racer.branch = "right";
  const stations = [];
  const world = {
    impactSparks: sparks,
    track: {
      frame: (s, branch) => {
        stations.push([s, branch]);
        return frame;
      },
    },
    sparkCursor: 0,
    sparkData: Array.from({ length: 64 }, () => ({
      life: 0,
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
    })),
  };
  World.prototype.burst.call(world, racer, "scrape", "IMPACT");
  assert.deepEqual(stations, [[119, "right"]]);
  assert.equal(world.sparkCursor, 0);
  assert.equal(sparks.cursor, 10);
  for (const kind of ["hit", "land"])
    World.prototype.burst.call(world, racer, kind);
  World.prototype.burst.call(world, racer, "scrape", "CONTACT");
  assert.equal(world.sparkCursor, 30);
  assert.equal(sparks.cursor, 10);
});
