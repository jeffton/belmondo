import test from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACK_INDEX } from "../src/track.js";
import { Race } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";

for (const [legacyIndex, index] of [
  TRACK_INDEX.COAST,
  TRACK_INDEX.SOLAR,
  TRACK_INDEX.NOCTILUCENT,
].entries()) {
  test(`legacy world ${legacyIndex}: real terrain, grid starts, every craft/class and ordinary/TURBO`, () => {
    const track = makeTrack(index);
    const terrain = createTerrain(track);
    const failures = [];
    try {
      for (let craft = 0; craft < 3; craft++)
        for (let speedClass = 0; speedClass < 3; speedClass++)
          for (const branch of [-1, 1])
            for (const boosted of [false, true]) {
              const race = new Race(track, craft, "trial", speedClass, terrain);
              race.countdown = 0;
              const r = race.player;
              r.id = branch === -1 ? 1 : 2;
              r.aiFire = Infinity;
              let resets = 0,
                absentDeckFlight = 0,
                landed = 0,
                fired = false;
              const chosen = new Set();
              const recover = race.recover.bind(race);
              race.recover = (...args) => {
                resets++;
                return recover(...args);
              };
              let previousGrounded = true;
              let flewGap = false;
              for (
                let step = 0;
                step < 120 * 180 && r.lap < 2 && !resets;
                step++
              ) {
                const u = r.contactS / track.length;
                if (boosted && !fired && u > track.config.jump - 0.025) {
                  r.weapon = "TURBO";
                  race.fire(r);
                  fired = true;
                }
                race.update(1 / 120, {});
                if (!track.bounds(r.contactS, r.branch).connected)
                  chosen.add(r.branch);
                if (track.gap(r.contactS / track.length) && !r.grounded) {
                  absentDeckFlight++;
                  flewGap = true;
                }
                if (flewGap && !previousGrounded && r.grounded) landed++;
                previousGrounded = r.grounded;
              }
              const label = `craft${craft}/class${speedClass}/fork${branch}/${boosted ? "TURBO" : "ordinary"}`;
              const result = {
                label,
                lap: r.lap,
                resets,
                shield: r.shield,
                chosen: [...chosen],
                absentDeckFlight,
                landed,
                u: r.contactS / track.length,
              };
              if (
                r.lap !== 2 ||
                resets ||
                r.shield <= 50 ||
                !chosen.has(branch) ||
                !absentDeckFlight ||
                !landed ||
                (boosted && !fired)
              )
                failures.push(result);
            }
      assert.deepEqual(failures, [], JSON.stringify(failures));
    } finally {
      terrain.geometries.forEach((g) => g.dispose());
    }
  });
}
