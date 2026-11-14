import { after, test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACK_INDEX } from "../src/track.js";
import { CRAFT, Race } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";

for (let course = 0; course < 6; course++) {
  const track = makeTrack(course);
  const terrain = createTerrain(track);
  after(() => terrain.geometries.forEach((geometry) => geometry.dispose()));
  for (const speedClass of [0, 2]) {
    if (course === TRACK_INDEX.CINDERLINE) {
      test(`CINDERLINE: C${speedClass + 1} eight-ship pack earns its clean race`, () => {
        const race = new Race(track, 0, "race", speedClass, terrain);
        race.countdown = 0;
        race.player.id = 8;
        const targetLap = race.lapCount + 1;
        // Disable firing only; ordinary grid contacts and pickups remain active.
        for (const racer of race.racers) racer.aiFire = Infinity;
        race.damage = () => assert.fail("no weapon damage in the driving pack");
        let hullContactLoss = 0;
        for (
          let step = 0;
          step < 120 * 400 &&
          !race.racers.every((racer) => racer.lap >= targetLap);
          step++
        ) {
          const shields = race.racers.map((racer) => racer.shield);
          race.update(1 / 120, {});
          for (const [index, racer] of race.racers.entries()) {
            // With weapon damage forbidden and rail/rescue paths checked below,
            // the only remaining shield decrement is ordinary hull contact.
            hullContactLoss += Math.max(0, shields[index] - racer.shield);
            assert.equal(racer.wallTouched, false, "no pack rail riding");
            assert.equal(
              racer.recoveredThisStep,
              false,
              "no pack checkpoint rescue",
            );
            assert(
              racer.shield > 0,
              "ordinary hull contacts do not destroy the pack",
            );
          }
        }
        assert(race.racers.every((racer) => racer.lap >= targetLap));
        assert(
          hullContactLoss > 0,
          "the real pack exercises hull-contact damage",
        );
        assert(race.racers.every((racer) => racer.shield === 100));
      });
    }
    for (let craft = 0; craft < CRAFT.length; craft++) {
      for (const branch of [-1, 1]) {
        test(`${track.config.name}: physical NPC ${CRAFT[craft].name}, C${speedClass + 1}, fork ${branch}`, () => {
          const race = new Race(track, craft, "trial", speedClass, terrain);
          race.countdown = 0;
          const racer = race.player;
          // Identity selects the NPC controller and fork; body starts on the
          // ordinary grid, with real pickups, terrain and unmodified physics.
          racer.id = branch === -1 ? 1 : 2;
          racer.aiFire = Infinity;
          let walls = 0;
          let splitFrames = 0;
          for (let step = 0; step < 120 * 150 && racer.lap < 2; step++) {
            race.update(1 / 120, {});
            walls += Number(racer.wallTouched);
            assert.equal(
              racer.recoveredThisStep,
              false,
              "no checkpoint rescue",
            );
            assert.equal(racer.shield, 100, "no driving damage");
            const u = racer.contactS / track.length;
            const [start, end] = track.config.split;
            if (
              u > start &&
              u < end &&
              !track.bounds(racer.contactS, branch).connected
            ) {
              assert.equal(racer.branch, branch, "drives its intended fork");
              splitFrames++;
            }
          }
          assert.equal(racer.lap, 2, "earns a physical lap within 150 seconds");
          assert.equal(walls, 0, "does not ride either rail");
          assert(
            splitFrames > 20,
            "actually traverses the separated carriageway",
          );
        });
      }
    }
  }
}
