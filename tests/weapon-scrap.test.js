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

test("generated ejector cue hits immediately and decays into silence", () => {
  const energy = (samples) =>
    samples.reduce((total, sample) => total + sample ** 2, 0);
  for (const frequency of [44_100, 48_000]) {
    const samples = synthesizeScrapCue(frequency);
    const peakAt = samples.reduce(
      (index, sample, i) =>
        Math.abs(sample) > Math.abs(samples[index]) ? i : index,
      0,
    );
    const peak = Math.abs(samples[peakAt]);
    assert.ok(peak > 0.6 && peak < 1);
    assert.ok(peakAt / frequency < 0.005);
    const attack = energy(samples.subarray(0, frequency * 0.04));
    const release = energy(samples.subarray(frequency * 0.04));
    assert.ok(attack > release, "the cue reads as a strike, not a sustain");
    const tail = samples.subarray(-frequency * 0.02);
    assert.ok(Math.sqrt(energy(tail) / tail.length) < 0.001);
    assert.equal(Math.abs(samples.at(-1)), 0);
  }
});
