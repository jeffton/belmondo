import test from "node:test";
import assert from "node:assert/strict";
import { Race, WEAPONS } from "../src/race.ts";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { synthesizeScrapCue } from "../src/scrap-sound.ts";

const track = makeTrack(TRACK_INDEX.COAST);

test("each inventory item restores up to ten shield, with audio but no message or weapon effect", () => {
  const race = new Race(track);
  const p = race.player;
  race.countdown = 0;
  for (const weapon of WEAPONS) {
    p.weapon = weapon;
    p.shield = 54;
    race.events.length = 0;
    race.scrapWeapon();
    race.scrapWeapon();
    assert.equal(p.weapon, null);
    assert.equal(p.shield, 64);
    assert.equal(p.protect, 0);
    assert.equal(p.surge, 0);
    assert.equal(race.mines.length + race.shots.length, 0);
    assert.deepEqual(race.events, [{ kind: "scrap" }]);
  }
  p.weapon = "SHIELD";
  p.shield = 98.4;
  race.scrapWeapon();
  assert.equal(p.shield, 100);
  assert.deepEqual(race.events.at(-1), { kind: "scrap" });
});

test("firing SHIELD protects the craft without refilling its meter", () => {
  const race = new Race(track);
  const p = race.player;
  race.countdown = 0;
  p.weapon = "SHIELD";
  p.shield = 54;
  race.fire();
  assert.equal(p.weapon, null);
  assert.equal(p.shield, 54);
  assert.equal(p.protect, 5);
  assert.deepEqual(race.events, [{ kind: "fire", text: "SHIELD" }]);
});

test("scrap cannot activate during countdown or after finish", () => {
  for (const state of ["countdown", "finished", "eliminated", "complete"]) {
    const race = new Race(track);
    const p = race.player;
    if (state !== "countdown") {
      race.countdown = 0;
      if (state === "complete") race.complete = true;
      else p[state] = true;
    }
    p.weapon = "TURBO";
    p.shield = 56;
    race.scrapWeapon();
    assert.equal(p.weapon, "TURBO");
    assert.equal(p.shield, 56);
    assert.equal(race.events.length, 0);
  }
});

test("generated capacitor sound is bounded and decays without a hard tail", () => {
  for (const frequency of [44_100, 48_000]) {
    const samples = synthesizeScrapCue(frequency);
    const peak = samples.reduce(
      (max, sample) => Math.max(max, Math.abs(sample)),
      0,
    );
    assert.ok(peak > 0.25 && peak < 0.8);
    assert.ok(Math.abs(samples.at(-1)) < 0.001);
  }
});
