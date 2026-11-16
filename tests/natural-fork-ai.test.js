import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeTrack, TRACKS, TRACK_INDEX } from "../src/track.ts";
import { Race } from "../src/race.ts";
import { createTerrain } from "../src/terrain.ts";

// Exact production d9e86c6 Coast/Solar configs; exercise the fix independently
// of the longer v4 routes, without importing a second movement implementation.
const production = JSON.parse(
  readFileSync(new URL("./fixtures/legacy-v3-configs.json", import.meta.url)),
);
function fixtureTrack(version, index) {
  const trackIndex = [
    TRACK_INDEX.COAST,
    TRACK_INDEX.SOLAR,
    TRACK_INDEX.NOCTILUCENT,
  ][index];
  const current = TRACKS[trackIndex];
  try {
    if (version === "production-v3") TRACKS[trackIndex] = production[index];
    return makeTrack(trackIndex);
  } finally {
    TRACKS[trackIndex] = current;
  }
}

for (const version of ["production-v3", "redesigned-v4"])
  for (let index = 0; index < (version === "production-v3" ? 2 : 3); index++) {
    test(`${version} course ${index}: unobstructed odd/even AI physically chooses its intended fork in all classes`, () => {
      const track = fixtureTrack(version, index);
      const terrain = createTerrain(track);
      const [start, end] = track.config.split;
      try {
        for (let speedClass = 0; speedClass < 3; speedClass++) {
          for (const id of [1, 2]) {
            // One body with genuine AI controls, starting at the ordinary grid.
            // Unlike a traffic pack, this isolates the driver's fork preference.
            const race = new Race(track, 0, "trial", speedClass, terrain);
            race.countdown = 0;
            const r = race.player;
            r.id = id;
            r.aiFire = Infinity;
            let observed = false;
            for (
              let step = 0;
              step < 180 * 120 && r.contactS / track.length <= end + 0.015;
              step++
            ) {
              race.update(1 / 120, {});
              assert.equal(r.recoveredThisStep, false);
              const u = r.contactS / track.length;
              if (
                u > start &&
                u < end &&
                !track.bounds(r.contactS, r.branch).connected
              ) {
                assert.equal(r.branch, id % 2 ? -1 : 1);
                observed = true;
              }
            }
            assert(observed, "the intended separated carriageway was driven");
            assert(
              r.contactS / track.length > end + 0.015,
              "AI earns its merge",
            );
          }
        }
      } finally {
        terrain.geometries.forEach((g) => g.dispose());
      }
    });

    test(`${version} course ${index}: genuine NPC traffic uses both forks and earns stable physical merges in all classes`, () => {
      const track = fixtureTrack(version, index);
      const terrain = createTerrain(track);
      const [start, end] = track.config.split;
      const clear = (end + 0.015) * track.length;
      const expectedGate =
        Math.floor(((clear - track.finishS) / track.length) * 32) + 1;
      try {
        for (let speedClass = 0; speedClass < 3; speedClass++) {
          const race = new Race(track, 0, "race", speedClass, terrain);
          race.countdown = 0;
          const npcs = race.racers.slice(1);
          npcs.forEach((r) => {
            r.aiFire = Infinity;
          });
          const observed = new Map();
          const merged = new Set();
          const gates = new Map(npcs.map((r) => [r.id, r.gate]));
          for (
            let step = 0;
            step < 180 * 120 && merged.size < npcs.length;
            step++
          ) {
            race.update(1 / 120, { throttle: false });
            for (const r of npcs) {
              assert.equal(
                r.recoveredThisStep,
                false,
                "traffic cannot rely on rescue",
              );
              const lastGate = gates.get(r.id);
              assert(
                r.gate >= lastGate && r.gate <= lastGate + 1,
                "only consecutive physical gates are earned",
              );
              gates.set(r.id, r.gate);
              const u = r.contactS / track.length;
              if (
                u > start + 1e-7 &&
                u < end - 1e-7 &&
                !track.bounds(r.contactS, r.branch).connected
              ) {
                // Parity steers toward a preferred road; traffic and ordinary
                // body physics can send a ship to the other legal entrance.
                // Once separated, it must stay on that real road until merge.
                assert([-1, 1].includes(r.branch));
                if (observed.has(r.id))
                  assert.equal(
                    r.branch,
                    observed.get(r.id),
                    "no disconnected-deck switch",
                  );
                else observed.set(r.id, r.branch);
              }
              if (observed.has(r.id) && r.contactS > clear) {
                assert(
                  r.gate >= expectedGate,
                  "merge requires its ordered timing gates",
                );
                assert(r.shield > 0, "NPC survives the physical crossing");
                merged.add(r.id);
              }
            }
          }
          assert.equal(
            merged.size,
            npcs.length,
            "every genuine grid NPC earns its own merge",
          );
          assert.deepEqual(
            new Set(observed.values()),
            new Set([-1, 1]),
            "the traffic pack physically drives both forks",
          );
        }
      } finally {
        terrain.geometries.forEach((g) => g.dispose());
      }
    });
  }
