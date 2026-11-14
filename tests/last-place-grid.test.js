import { test } from "node:test";
import assert from "node:assert/strict";
import { Race, CRAFT, AI_THROTTLE } from "../src/race.js";
import { makeTrack, TRACKS } from "../src/track.js";

test("grid handicap reduces NPC engine input without reducing player acceleration", () => {
  const track = makeTrack(0);
  for (let speedClass = 0; speedClass < 3; speedClass++) {
    const race = new Race(track, 0, "race", speedClass);
    race.countdown = 0;
    const dt = 1 / 120;
    race.update(dt, { throttle: 1 });
    const pace2 = race.classSpec.pace ** 2;
    for (const racer of race.racers) {
      const horizontalSpeed = Math.hypot(racer.velocity.x, racer.velocity.z);
      const engineInput = racer.id === 0 ? 1 : AI_THROTTLE;
      const expected = CRAFT[racer.craft].thrust * engineInput * pace2 * dt;
      assert(Math.abs(horizontalSpeed - expected) < 1e-8);
    }
  }
});

for (let index = 0; index < TRACKS.length; index++) {
  test(`last-place grid and unchanged trial start on ${TRACKS[index].name}`, () => {
    const track = makeTrack(index);
    for (let speedClass = 0; speedClass < 3; speedClass++) {
      for (let craft = 0; craft < CRAFT.length; craft++) {
        const race = new Race(track, craft, "race", speedClass);
        assert.equal(race.position, 8);
        assert.equal(race.player.craft, craft);
        assert.equal(race.lapCount, speedClass + 3);
        assert.equal(new Set(race.racers.map((r) => r.s)).size, 8);
        assert(race.racers.slice(1).every((r) => r.s > race.player.s));
        assert.deepEqual(
          race.racers.slice(1).map((r) => r.craft),
          [1, 2, 0, 1, 2, 0, 1],
        );
        for (const racer of race.racers) {
          assert.equal(racer.checkpoint.s, racer.s);
          assert.equal(racer.contactS, racer.s);
          assert.equal(racer.lap, 1);
          assert.equal(racer.shield, 100);
        }
        const trial = new Race(track, craft, "trial", speedClass);
        assert.equal(trial.position, 1);
        assert.equal(trial.player.s, track.finishS - 18);
      }
    }
  });
}
