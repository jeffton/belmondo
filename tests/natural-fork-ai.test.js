import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeTrack, TRACKS } from "../src/track.js";
import { Race } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";

// Exact production d9e86c6 Coast/Solar configs; exercise the fix independently
// of the longer v4 routes, without importing a second movement implementation.
const production = JSON.parse(
  readFileSync(new URL("./fixtures/legacy-v3-configs.json", import.meta.url)),
);
for (const version of ["production-v3", "redesigned-v4"])
  for (let index = 0; index < (version === "production-v3" ? 2 : 3); index++)
    test(`${version} course ${index}: genuine odd/even NPCs choose both forks from grid in all classes`, () => {
      const current = TRACKS[index];
      let track;
      try {
        if (version === "production-v3") TRACKS[index] = production[index];
        track = makeTrack(index);
      } finally {
        TRACKS[index] = current;
      }
      const terrain = createTerrain(track);
      try {
        for (let speedClass = 0; speedClass < 3; speedClass++) {
          const race = new Race(track, 0, "race", speedClass, terrain);
          race.countdown = 0;
          const npcs = race.racers.slice(1);
          npcs.forEach((r) => {
            r.aiFire = Infinity;
          });
          const observed = new Set();
          const merged = new Set();
          const recoveries = new Map(npcs.map((r) => [r.id, 0]));
          const recover = race.recover.bind(race);
          race.recover = (r) => {
            if (recoveries.has(r.id))
              recoveries.set(r.id, recoveries.get(r.id) + 1);
            return recover(r);
          };
          for (
            let step = 0;
            step < 180 * 120 && merged.size < npcs.length;
            step++
          ) {
            race.update(1 / 120, { throttle: false });
            for (const r of npcs) {
              const u = r.contactS / track.length;
              const [start, end] = track.config.split;
              if (
                u > start + 1e-7 &&
                u < end - 1e-7 &&
                !track.bounds(r.contactS, r.branch).connected
              ) {
                assert.equal(
                  r.branch,
                  r.id % 2 ? -1 : 1,
                  JSON.stringify({
                    speedClass,
                    id: r.id,
                    u,
                    grounded: r.grounded,
                    position: r.position,
                    branch: r.branch,
                    shield: r.shield,
                  }),
                );
                observed.add(r.id);
              }
              if (observed.has(r.id) && u > end + 0.015) merged.add(r.id);
            }
          }
          assert.equal(
            merged.size,
            npcs.length,
            "every genuine grid NPC earns its own merge",
          );
          assert(
            [...recoveries.values()].every((n) => n === 0),
            JSON.stringify([...recoveries]),
          );
        }
      } finally {
        terrain.geometries.forEach((g) => g.dispose());
      }
    });
