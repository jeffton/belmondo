import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

export async function measureFork(sourceRoot, trackIndex, maxSeconds = 240) {
  const root = resolve(sourceRoot);
  const index = trackIndex;
  const dt = 1 / 120;
  const { makeTrack } = await import(pathToFileURL(join(root, "src/track.js")));
  const { Race, CRAFT } = await import(
    pathToFileURL(join(root, "src/race.js"))
  );
  const { createTerrain } = await import(
    pathToFileURL(join(root, "src/terrain.js"))
  );
  const { SPEED_CLASSES } = await import(
    pathToFileURL(join(root, "src/speed-classes.js"))
  );
  const files = [
    "track.js",
    "course-layouts.js",
    "race.js",
    "contacts.js",
    "road-projection.js",
    "terrain.js",
  ];
  const sourceHashes = {};
  for (const name of files) {
    sourceHashes[name] = createHash("sha256")
      .update(await readFile(join(root, "src", name)))
      .digest("hex");
  }
  const started = performance.now();
  const track = makeTrack(index);
  const terrain = createTerrain(track);
  const [start, end] = track.config.split.map((u) => u * track.length);
  const approach = start - 0.04 * track.length;
  const clear = end + 0.015 * track.length;

  function geometry(branch) {
    const n = 2048;
    let previous = track.frame(start, branch);
    let length = 0,
      ascent = 0,
      descent = 0,
      turn = 0;
    let maxCurvature = 0,
      maxGrade = 0;
    let minY = previous.p.y,
      maxY = previous.p.y;
    for (let i = 1; i <= n; i++) {
      const s = start + ((end - start) * i) / n;
      const frame = track.frame(s, branch);
      const distance = previous.p.distanceTo(frame.p);
      const dy = frame.p.y - previous.p.y;
      length += distance;
      ascent += Math.max(0, dy);
      descent += Math.max(0, -dy);
      turn += previous.tangent.angleTo(frame.tangent);
      maxGrade = Math.max(
        maxGrade,
        Math.abs(frame.tangent.y) /
          Math.hypot(frame.tangent.x, frame.tangent.z),
      );
      maxCurvature = Math.max(
        maxCurvature,
        Math.abs(track.curvature(s, branch)),
      );
      minY = Math.min(minY, frame.p.y);
      maxY = Math.max(maxY, frame.p.y);
      previous = frame;
    }
    return {
      branch,
      samples: n,
      lengthWorldUnits: length,
      ascent,
      descent,
      minY,
      maxY,
      integratedTangentTurnRadians: turn,
      maxProductionPlanCurvature: maxCurvature,
      maxGrade,
      parameterSpanWorldUnits: end - start,
    };
  }

  function traverse(craft, speedClass, branch) {
    const race = new Race(track, craft, "trial", speedClass, terrain);
    // Exclude authored boosts/items so route comparisons measure road/driver.
    race.pickups = [];
    const racer = race.player;
    // Only selection of the production AI and its normal deterministic branch
    // preference. No teleport, velocity assignment, gate assignment, or respawn.
    racer.id = branch === -1 ? 1 : 2;
    const result = {
      speedClass,
      className: SPEED_CLASSES[speedClass].name,
      craft: CRAFT[craft].name,
      craftIndex: craft,
      pickupCount: race.pickups.length,
      branch,
      spawnS: racer.contactS,
      samples: 0,
      entry: null,
      exit: null,
      clear: null,
      observedBranches: [],
      gateTransitions: [],
      contacts: 0,
      contactSteps: 0,
      recoveries: 0,
      stalls: [],
      eliminated: false,
      completed: false,
      maxBackwardStep: 0,
      actualDistance: 0,
      airSeconds: 0,
      wrongBranchSteps: 0,
    };
    const seen = new Set();
    let active = false,
      contact = false,
      stall = null,
      lastWindow = null;
    const recover = race.recover.bind(race);
    race.recover = (r) => {
      if (active && r === racer) result.recoveries++;
      return recover(r);
    };
    let steps = 0;
    while (race.time < maxSeconds && !race.complete) {
      if (++steps > (maxSeconds + 20) / dt)
        throw new Error("Race clock did not advance");
      const before = {
        s: racer.contactS,
        gate: racer.gate,
        time: race.time,
        p: racer.position.clone(),
      };
      race.update(dt, {});
      const s = racer.contactS;
      if (!active && s >= approach && before.s < approach) {
        active = true;
        result.approach = {
          time: race.time,
          s,
          gate: racer.gate,
          branch: racer.branch,
        };
        lastWindow = { time: race.time, s };
      }
      if (active) {
        result.samples++;
        result.actualDistance += before.p.distanceTo(racer.position);
        result.maxBackwardStep = Math.max(result.maxBackwardStep, before.s - s);
        if (!racer.grounded) result.airSeconds += dt;
        if (racer.wallTouched) {
          result.contactSteps++;
          if (!contact) result.contacts++;
        }
        contact = racer.wallTouched;
        if (racer.gate !== before.gate)
          result.gateTransitions.push({
            time: race.time,
            from: before.gate,
            to: racer.gate,
            s,
          });
        if (s > start && s < end && !track.bounds(s, racer.branch).connected) {
          seen.add(racer.branch);
          if (racer.branch !== branch) result.wrongBranchSteps++;
        }
        for (const [name, target] of [
          ["entry", start],
          ["exit", end],
          ["clear", clear],
        ]) {
          if (
            !result[name] &&
            before.s < target &&
            s >= target &&
            !racer.recoveredThisStep
          ) {
            const fraction = (target - before.s) / (s - before.s);
            result[name] = {
              time: before.time + fraction * (race.time - before.time),
              gate: racer.gate,
              s: target,
            };
          }
        }
        if (race.time - lastWindow.time >= 1) {
          const stopped = s - lastWindow.s < 1;
          if (stopped && !stall)
            stall = { time: lastWindow.time, s: lastWindow.s };
          if (!stopped && stall) {
            result.stalls.push({ ...stall, seconds: race.time - stall.time });
            stall = null;
          }
          lastWindow = { time: race.time, s };
        }
        if (result.clear) {
          result.completed = true;
          break;
        }
      }
      race.events.length = 0;
    }
    if (stall)
      result.stalls.push({ ...stall, seconds: race.time - stall.time });
    result.observedBranches = [...seen];
    result.elapsedSplitSeconds =
      result.entry && result.exit ? result.exit.time - result.entry.time : null;
    result.elapsedApproachClearSeconds =
      result.approach && result.clear
        ? result.clear.time - result.approach.time
        : null;
    result.earnedGates = result.gateTransitions.reduce(
      (n, g) => n + Math.max(0, g.to - g.from),
      0,
    );
    result.last = {
      time: race.time,
      s: racer.contactS,
      earnedProgressS: racer.s,
      gate: racer.gate,
      shield: racer.shield,
    };
    result.eliminated = racer.eliminated;
    return result;
  }

  try {
    const report = {
      schema: 1,
      source: root,
      sourceHashes,
      trackIndex: index,
      trackName: track.config.name,
      trackLengthWorldUnits: track.length,
      finishS: track.finishS,
      splitS: [start, end],
      dt,
      maxSeconds,
      methodology:
        "Single trial body from grid for each craft; stock AI selected by id parity before movement; normal countdown, physics, gates and recovery; pickups disabled for road-only comparison. No movement/control overrides. Contact/stall metrics cover 4% pre-fork to 1.5% post-merge; split timing interpolates physical contactS crossings, excluding recovery steps.",
      geometry: [-1, 1].map(geometry),
      traversals: [],
    };
    for (let craft = 0; craft < 3; craft++) {
      for (let speedClass = 0; speedClass < 3; speedClass++) {
        for (const branch of [-1, 1])
          report.traversals.push(traverse(craft, speedClass, branch));
      }
    }
    report.wallSeconds = (performance.now() - started) / 1000;

    return report;
  } finally {
    terrain.geometries.forEach((g) => g.dispose());
  }
}
