#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { measureFork } from "./helpers/fork-diagnostics.js";

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? fallback : args[index + 1];
}
const output = resolve(option("output", "/var/tmp/belmondo-fork-diagnostics"));
const index = Number(option("track", "0"));
const report = await measureFork(
  resolve(option("source", ".")),
  index,
  Number(option("max-sim-seconds", "240")),
);
if (option("compare", null)) {
  const baseline = JSON.parse(
    await readFile(resolve(option("compare")), "utf8"),
  );
  report.comparison = report.traversals.map((run) => {
    const old = baseline.traversals.find(
      (r) =>
        r.branch === run.branch &&
        r.speedClass === run.speedClass &&
        r.craftIndex === run.craftIndex,
    );
    return {
      craft: run.craft,
      speedClass: run.speedClass,
      branch: run.branch,
      splitSecondsDelta:
        old.elapsedSplitSeconds !== null && run.elapsedSplitSeconds !== null
          ? run.elapsedSplitSeconds - old.elapsedSplitSeconds
          : null,
      contactDelta: run.contacts - old.contacts,
      recoveryDelta: run.recoveries - old.recoveries,
      baselineCompleted: old.completed,
      candidateCompleted: run.completed,
    };
  });
}
await mkdir(output, { recursive: true });
const path = join(output, `track-${index}.json`);
await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      path,
      track: report.trackName,
      wallSeconds: report.wallSeconds,
      geometry: report.geometry,
      traversals: report.traversals.map((r) => ({
        craft: r.craft,
        class: r.speedClass,
        branch: r.branch,
        complete: r.completed,
        seconds: r.elapsedSplitSeconds,
        contacts: r.contacts,
        recoveries: r.recoveries,
        stalls: r.stalls.length,
        gates: r.earnedGates,
        observed: r.observedBranches,
        wrongBranchSteps: r.wrongBranchSteps,
      })),
    },
    null,
    2,
  ),
);
