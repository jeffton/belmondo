#!/usr/bin/env node
// Actual seven-NPC race pack, no body/gate/velocity rewrites.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback;
const root = resolve(option("source", "."));
const output = resolve(option("output", "/var/tmp/belmondo-fork-pack"));
const index = Number(option("track", "4"));
const { makeTrack } = await import(pathToFileURL(join(root, "src/track.js")));
const { Race } = await import(pathToFileURL(join(root, "src/race.js")));
const { createTerrain } = await import(
  pathToFileURL(join(root, "src/terrain.js"))
);
const track = makeTrack(index);
const terrain = createTerrain(track);
const approach = (track.config.split[0] - 0.04) * track.length;
const clear = (track.config.split[1] + 0.015) * track.length;
const results = [];
try {
  for (let speedClass = 0; speedClass < 3; speedClass++) {
    const race = new Race(track, 0, "race", speedClass, terrain);
    race.pickups = [];
    const rows = race.racers.slice(1).map((r) => ({
      id: r.id,
      craft: r.craft,
      branch: r.id % 2 ? -1 : 1,
      approach: null,
      clear: null,
      wrongBranchSteps: 0,
      rails: 0,
      pairDisplacementSteps: 0,
      recoveries: 0,
      earnedGates: 0,
      eliminated: false,
      gate: r.gate,
    }));
    const recover = race.recover.bind(race);
    race.recover = (r) => {
      const row = rows.find((entry) => entry.id === r.id);
      if (row?.approach && !row.clear) row.recoveries++;
      return recover(r);
    };
    while (race.time < 180 && rows.some((r) => !r.clear)) {
      race.update(1 / 120, { throttle: false });
      for (const row of rows) {
        const r = race.racers[row.id];
        if (!row.approach && r.contactS >= approach)
          row.approach = { time: race.time, gate: r.gate, s: r.contactS };
        if (row.approach && !row.clear) {
          if (r.wallTouched) row.rails++;
          if (r.contactMoved && !r.wallTouched) row.pairDisplacementSteps++;
          if (r.gate > row.gate) row.earnedGates += r.gate - row.gate;
          if (
            r.contactS > track.config.split[0] * track.length &&
            r.contactS < track.config.split[1] * track.length &&
            !track.bounds(r.contactS, r.branch).connected &&
            r.branch !== row.branch
          )
            row.wrongBranchSteps++;
          if (r.contactS >= clear)
            row.clear = { time: race.time, gate: r.gate, s: r.contactS };
          row.eliminated = r.eliminated;
        }
        row.gate = r.gate;
      }
      race.events.length = 0;
    }
    results.push({ speedClass, racers: rows });
  }
  await mkdir(output, { recursive: true });
  const path = join(output, `track-${index}-pack.json`);
  const report = {
    track: track.config.name,
    index,
    source: root,
    methodology:
      "Normal race grid/countdown with neutral human player; seven unchanged production NPCs select their own parity branch. Pickups disabled. pairDisplacementSteps counts contactMoved without wallTouched (contact solver displacement proxy, not distinct collision events). Metrics only approach through first merge.",
    results,
  };
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ path, track: report.track, results }, null, 2));
} finally {
  terrain.geometries.forEach((g) => g.dispose());
}
