import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { Race, CRAFT, SPEED_CLASSES } from "../src/race.ts";
import { createTerrain } from "../src/terrain.ts";
import { playerPilot } from "./helpers/player-pilot.js";

for (const [speedClass, spec] of SPEED_CLASSES.entries()) {
  describe(`FAULTLINE player ${spec.id}`, () => {
    let track;
    let terrain;
    before(() => {
      track = makeTrack(TRACK_INDEX.FAULTLINE);
      terrain = createTerrain(track);
    });
    after(() => {
      terrain.geometries.forEach((geometry) => geometry.dispose());
      terrain = null;
      track = null;
    });
    for (const [craft, body] of CRAFT.entries()) {
      test(`${body.name} completes all ${speedClass + 3} ordered laps using only player controls`, () => {
        const race = new Race(track, craft, "trial", speedClass, terrain);
        race.countdown = 0;
        const racer = race.player;
        let takeoffs = 0;
        let landings = 0;
        for (
          let step = 0;
          step < 120 * 150 * race.lapCount && !race.finished;
          step++
        ) {
          const grounded = racer.grounded;
          race.update(1 / 120, playerPilot(track, racer, 0, speedClass));
          assert.equal(
            racer.id,
            0,
            "the real player controller remains active",
          );
          assert.equal(
            racer.wallTouched,
            false,
            `no rail riding: u=${racer.contactS / track.length}, lap=${racer.lap}, grounded=${racer.grounded}`,
          );
          assert.equal(
            racer.recoveredThisStep,
            false,
            "no checkpoint recovery",
          );
          assert.equal(racer.shield, 100, "no driving damage");
          if (grounded && !racer.grounded) takeoffs++;
          if (!grounded && racer.grounded) landings++;
          race.events.length = 0;
        }
        assert.equal(race.finished, true);
        assert.equal(racer.lap, race.lapCount + 1);
        assert.equal(race.laps.length, race.lapCount);
        assert.equal(race.resultPosition, 1);
        assert(takeoffs >= race.lapCount, "physically flies the pit every lap");
        assert(
          landings >= race.lapCount,
          "lands every pit crossing before finishing",
        );
        assert(
          race.laps.every((seconds) => Number.isFinite(seconds) && seconds > 0),
        );
      });
    }
  });
}
