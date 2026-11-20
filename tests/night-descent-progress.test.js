import assert from "node:assert/strict";
import test from "node:test";
import { Race } from "../src/race.ts";
import { createTerrain } from "../src/terrain.ts";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import {
  advanceNightDescent,
  descentStep,
  startNightDescent,
} from "./helpers/night-descent.js";

const track = makeTrack(TRACK_INDEX.NOCTILUCENT);
const terrain = createTerrain(track);
const gateS = (gate) => track.finishS + (gate * track.length) / 32;

function fly(gate) {
  const race = new Race(track, 1, "trial", 0, terrain);
  const r = race.player;
  startNightDescent(race, gate);
  let airborne = 0;
  let passedOutside = false;
  for (let step = 0; step < 600; step++) {
    advanceNightDescent(race);
    assert(!r.recoveredThisStep, "the descent never teleports the craft");
    if (!r.grounded) {
      airborne++;
      if (
        r.contactS > gateS(26) &&
        Math.abs(r.x) > track.frame(r.contactS).width
      )
        passedOutside = true;
      assert.equal(r.gate, gate, "no missing sectors are awarded in flight");
    } else if (airborne > 0) {
      assert(passedOutside, "the flight really passed outside an ordered gate");
      assert(r.contactS > gateS(27), "touchdown is beyond two descent gates");
      assert(r.contactS < gateS(28));
      return race;
    }
  }
  assert.fail("the real road must catch RAPTOR");
}

test("NOCTILUCENT: a real off-edge descent landing validates two sectors and becomes a rescue point", () => {
  const race = fly(26);
  const r = race.player;
  assert.equal(r.gate, 28);
  assert.equal(r.s, r.contactS, "race position uses the earned deck location");
  assert.equal(r.lap, 1);
  assert.deepEqual(r.checkpoint, { s: r.s, branch: 0, gate: 28 });

  // Keep driving uninterrupted until the next lap's runway. Miss that gap
  // on purpose through pilot inputs rather than by teleporting off the road.
  for (
    let step = 0;
    r.contactS < 1.469 * track.length && step < 90 * 120;
    step++
  ) {
    advanceNightDescent(race);
    assert(!r.recoveredThisStep);
    race.events.length = 0;
  }
  assert.equal(
    r.lap,
    2,
    "the actual finish plane still awards exactly one lap",
  );
  assert.equal(race.laps.length, 1);
  assert(
    r.contactS >= 1.469 * track.length,
    `end station ${r.contactS / track.length}, shield ${r.shield}`,
  );
  const checkpoint = { ...r.checkpoint };
  for (let step = 0; step < 720; step++) {
    race.update(descentStep, { throttle: false, airLeft: 1, airRight: 1 });
    if (r.recoveredThisStep) {
      assert.equal(r.contactS, checkpoint.s);
      assert.equal(r.gate, checkpoint.gate);
      assert.equal(r.lap, 2);
      return;
    }
  }
  assert.fail("the deliberately failed runway jump must cause a rescue");
});

test("NOCTILUCENT: landing cannot repair a missed sector from before the descent", () => {
  const race = fly(25);
  const r = race.player;
  assert.equal(r.gate, 25);
  assert(r.s < gateS(25));
  assert.equal(r.lap, 1);
  assert.equal(race.laps.length, 0);
});
