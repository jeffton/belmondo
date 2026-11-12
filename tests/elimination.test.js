import test from "node:test";
import assert from "node:assert/strict";
import { Race, LAPS, CRITICAL_SHIELD } from "../src/race.js";
import { makeTrack } from "../src/track.js";

const input = { throttle: true, steer: 0, air: 0 };
function setup(speedClass = 0, mode = "race") {
  const race = new Race(makeTrack(0), 0, mode, speedClass);
  race.countdown = 0;
  for (const r of race.racers) r.aiFire = Infinity;
  return race;
}
function place(race, r, s, speed = 80, x = 0) {
  const f = race.track.frame(s);
  r.s = r.contactS = s;
  r.position.copy(f.p).addScaledVector(f.right, x);
  r.position.y += 2.2;
  r.velocity.copy(f.tangent).multiplyScalar(speed * race.classSpec.pace);
  r.speed = speed * race.classSpec.pace;
  r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
  r.x = x;
  r.grounded = true;
}
function approachFinish(race, r, distance = 0.1, speed = 80, x = 0) {
  r.lap = LAPS;
  r.gate = LAPS * 32;
  place(
    race,
    r,
    race.track.finishS + LAPS * race.track.length - distance,
    speed,
    x,
  );
}
function finishEvents(race) {
  return race.events.filter((e) => e.kind === "finish");
}

for (let speedClass = 0; speedClass < 3; speedClass++) {
  test(`C${speedClass + 1}: player elimination is permanent while the live NPC field continues`, () => {
    const race = setup(speedClass);
    const p = race.player;
    const npc = race.racers[1];
    const start = npc.position.clone();
    p.weapon = "SHIELD";
    race.damage(p, 200);
    assert.equal(p.shield, 0);
    assert.equal(p.eliminated, true);
    assert.equal(race.finished, true);
    assert.equal(race.complete, false);
    assert.equal(race.position, 8);
    assert.equal(race.resultPosition, 8);
    assert.equal(race.resultTime, 0);
    assert.equal(p.lap, 1, "DNF never fabricates five completed laps");
    assert.equal(race.laps.length, 0);
    const deathPosition = p.position.clone();
    race.fire();
    race.recover(p);
    race.damage(p, -100);
    for (let step = 0; step < 240; step++) race.update(1 / 120, input);
    assert(p.position.equals(deathPosition));
    assert.equal(p.velocity.length(), 0);
    assert.equal(p.weapon, null);
    assert.equal(p.shield, 0);
    assert.equal(p.lap, 1);
    assert(npc.position.distanceTo(start) > 5, "other racers genuinely drive");
    assert.equal(npc.eliminated, false);
    assert.equal(finishEvents(race).length, 1);
    assert.equal(race.position, 8);
    assert.equal(race.resultTime, 0, "DNF elapsed time is immutable");
  });

  test(`C${speedClass + 1}: all eliminated field terminates without rescue, fake laps or an update loop`, () => {
    const race = setup(speedClass);
    // Non-grid order proves DNF rank follows survival, not ID or route progress.
    const order = [3, 6, 1, 0, 5, 7, 2, 4];
    order.forEach((id, index) => {
      const r = race.racers[id];
      race.damage(r, 200);
      assert.equal(r.finalPosition, 8 - index);
    });
    assert.equal(race.position, 5);
    assert.equal(race.complete, true);
    const positions = race.racers.map((r) => r.position.clone());
    const time = race.time;
    for (let step = 0; step < 1000; step++) race.update(1 / 120, input);
    assert.equal(race.time, time);
    race.racers.forEach((r, i) => {
      assert(r.position.equals(positions[i]));
      assert.equal(r.shield, 0);
      assert.equal(r.eliminated, true);
      assert.equal(r.lap, 1);
      assert.equal(r.finished, false);
    });
    assert.deepEqual(
      race.racers.map((r) => r.finalPosition).sort(),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.equal(finishEvents(race).length, 1);
  });

  test(`C${speedClass + 1}: physical wall damage eliminates before any shield recovery`, () => {
    const race = setup(speedClass, "trial");
    const r = race.player;
    const s = race.track.finishS + 80;
    const f = race.track.frame(s);
    const bounds = race.track.bounds(s, 0);
    place(race, r, s, 0, bounds.wallMax - 4);
    r.velocity.copy(f.right).multiplyScalar(100 * race.classSpec.pace);
    r.shield = 0.01;
    for (let step = 0; step < 60 && !r.eliminated; step++)
      race.update(1 / 120, {});
    assert.equal(r.eliminated, true);
    assert.equal(r.shield, 0);
    assert.equal(r.recoveredThisStep, false);
    assert.equal(race.complete, true);
    assert.equal(r.lap, 1);
  });

  test(`C${speedClass + 1}: real final crossing after NPC elimination still earns a valid player result`, () => {
    const race = setup(speedClass);
    for (const npc of race.racers.slice(1)) race.damage(npc, 200);
    assert(!race.finished, "the live player must still complete the race");
    assert(!race.events.some((e) => e.kind === "finish"));
    approachFinish(race, race.player);
    race.update(1 / 120, {});
    assert.equal(race.player.finished, true);
    assert.equal(race.player.eliminated, false);
    assert.equal(race.player.lap, LAPS + 1);
    assert.equal(race.resultPosition, 1);
    assert.equal(race.complete, true);
    assert.equal(finishEvents(race).length, 1);
  });
}

test("NPC zero shield is detected before firing/physics, and its dead hull cannot block live racers", () => {
  const race = setup();
  const dead = race.racers[1];
  dead.shield = 0;
  dead.weapon = "PULSE";
  dead.aiFire = 0;
  dead.position.copy(race.player.position);
  dead.velocity.set(0, 0, 100);
  race.update(1 / 120, input);
  assert(dead.eliminated);
  assert.equal(dead.shield, 0);
  assert.equal(dead.weapon, null);
  assert.equal(race.player.shield, 100);
  assert(!race.finished);
  assert.equal(finishEvents(race).length, 0);
});

test("finishers precede all DNF; unfinished racers continue after player result and cannot change it", () => {
  const race = setup();
  race.damage(race.racers[7], 200);
  approachFinish(race, race.racers[1]);
  race.update(1 / 120, {});
  assert.equal(race.racers[1].finalPosition, 1);
  assert.equal(race.position, 2);
  approachFinish(race, race.player);
  race.update(1 / 120, {});
  assert.equal(race.position, 2);
  assert.equal(race.resultPosition, 2);
  const resultTime = race.resultTime;
  assert(resultTime <= race.time);
  assert.equal(race.complete, false);
  approachFinish(race, race.racers[2]);
  race.update(1 / 120, {});
  assert.equal(race.racers[2].finalPosition, 3);
  assert(
    race.time > resultTime,
    "the surviving field has its own advancing clock",
  );
  assert.equal(
    race.resultTime,
    resultTime,
    "records and result time stay terminal",
  );
  for (const r of race.racers.slice(3, 7)) race.damage(r, 200);
  assert.equal(race.complete, true);
  assert.equal(race.position, 2);
  assert.equal(finishEvents(race).length, 1);
  assert.deepEqual(
    race.racers.map((r) => r.finalPosition).sort(),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
});

test("same-step finish order uses actual swept crossing time, then emits the immutable player result", () => {
  const race = setup();
  approachFinish(race, race.player, 0.2, 80, -4);
  approachFinish(race, race.racers[1], 0.25, 160, 4);
  assert.equal(race.position, 1);
  const emitted = [];
  const emit = race.emit.bind(race);
  race.emit = (kind, text) => {
    if (kind === "finish")
      emitted.push({
        position: race.position,
        npcFinished: race.racers[1].finished,
      });
    emit(kind, text);
  };
  race.update(1 / 120, {});
  assert.equal(race.player.finished, true);
  assert.equal(race.racers[1].finished, true);
  assert.deepEqual(emitted, [{ position: 2, npcFinished: true }]);
  race.racers[2].s = race.player.s + 10000;
  assert.equal(race.position, 2);
});

for (const weapon of ["PULSE", "MISSILE", "MINE"]) {
  test(`real ${weapon} combat eliminates an NPC without resurrecting it`, () => {
    const race = setup();
    race.pickups = [];
    const victim = race.racers[1];
    const s = race.track.finishS + 50;
    place(race, race.player, s, 0);
    place(race, victim, weapon === "MINE" ? s - 5 : s + 20, 0);
    for (const other of race.racers.slice(2))
      place(race, other, s + 300 + other.id * 30, 0);
    victim.shield = 1;
    race.player.weapon = weapon;
    race.fire();
    for (let step = 0; step < 360 && !victim.eliminated; step++)
      race.update(1 / 120, {});
    assert(
      victim.eliminated,
      "the real weapon reaches its victim within three seconds",
    );
    assert.equal(victim.shield, 0);
    const position = victim.position.clone();
    for (let step = 0; step < 120; step++) race.update(1 / 120, input);
    assert(victim.position.equals(position));
    assert.equal(victim.shield, 0);
    assert(!race.finished, "NPC combat cannot end the player race");
  });
}

test("critical shield entry is inclusive, persistent, player-only and resets after healing", () => {
  const race = setup();
  assert.equal(CRITICAL_SHIELD, 25);
  assert.equal(race.criticalShield, false);
  race.player.shield = 26;
  race.update(1 / 120, {});
  assert.equal(race.criticalShield, false);
  race.damage(race.player, 1);
  assert.equal(race.criticalShield, true);
  assert.equal(race.events.filter((e) => e.kind === "critical").length, 1);
  for (let step = 0; step < 120; step++) race.update(1 / 120, {});
  assert.equal(race.criticalShield, true);
  assert.equal(race.events.filter((e) => e.kind === "critical").length, 1);
  race.player.weapon = "SHIELD";
  race.fire();
  race.update(1 / 120, {});
  assert.equal(race.criticalShield, false);
  assert.equal(
    race.events.filter((e) => e.kind === "critical-clear").length,
    1,
  );
  race.player.protect = 0;
  race.damage(race.player, 12);
  assert.equal(race.criticalShield, true);
  assert.equal(race.events.filter((e) => e.kind === "critical").length, 2);
  race.damage(race.racers[1], 70);
  race.damage(race.racers[1], 200);
  assert.equal(race.events.filter((e) => e.kind === "critical").length, 2);
  race.damage(race.player, 200);
  assert.equal(race.criticalShield, false);
  assert.equal(
    race.events.filter((e) => e.kind === "critical-clear").length,
    2,
  );
  assert.equal(finishEvents(race).length, 1);
  const fresh = setup();
  fresh.player.shield = 25;
  fresh.update(1 / 120, {});
  assert.equal(
    fresh.criticalShield,
    true,
    "initial low fixture enters exactly once",
  );
  assert.equal(fresh.events.filter((e) => e.kind === "critical").length, 1);
});

for (const speedClass of [0, 2]) {
  test(`C${speedClass + 1}: bounded real armed pack keeps every combat casualty permanently eliminated`, () => {
    const race = setup(speedClass);
    for (const r of race.racers) {
      r.shield = 20;
      r.weapon = "PULSE";
      r.aiFire = 0;
    }
    const casualties = new Map();
    for (let step = 0; step < 120 * 15 && !race.complete; step++) {
      race.update(1 / 120, input);
      for (const r of race.racers) {
        if (casualties.has(r)) {
          const terminal = casualties.get(r);
          assert.equal(r.eliminated, true);
          assert.equal(r.shield, 0);
          assert(r.position.equals(terminal.position));
          assert.equal(r.lap, terminal.lap);
          assert.equal(r.velocity.length(), 0);
          assert.equal(r.recoveredThisStep, false);
        } else if (r.eliminated) {
          casualties.set(r, { position: r.position.clone(), lap: r.lap });
        }
      }
    }
    assert(
      casualties.size > 0,
      "ordinary NPC weapon dispatch produces genuine combat casualties",
    );
    assert(
      casualties.has(race.player),
      "the NPC's real PULSE also eliminates the player",
    );
    assert.equal(finishEvents(race).length, 1);
    assert.equal(race.player.shield, 0);
    assert.equal(race.criticalShield, false);
    assert(
      race.racers.some((r) => !r.eliminated && r.s > race.track.finishS + 50),
      "survivors drive onward under real physics",
    );
  });
}

test("direct lethal damage never queues a critical warning before its final result", () => {
  const race = setup();
  race.damage(race.player, 200);
  assert.equal(race.criticalShield, false);
  assert(!race.events.some((e) => e.kind === "critical"));
  assert.equal(finishEvents(race).length, 1);
});
