// Independent QA: ordinary player inputs only; never changes racer state.
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { pilotInputs } from "./pilot-inputs.js";
const root = resolve(process.argv[2] || ".");
const output = resolve(
  process.argv[3] || "/var/tmp/coast-divergent-qa/player.json",
);
const mode = process.argv[4] || "trial";
const { makeTrack } = await import(pathToFileURL(join(root, "src/track.js")));
const { Race, CRAFT, SPEED_CLASSES } = await import(
  pathToFileURL(join(root, "src/race.js"))
);
const { createTerrain } = await import(
  pathToFileURL(join(root, "src/terrain.js"))
);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function curvature(track, s, branch) {
  const a = track.frame(s - 6, branch),
    b = track.frame(s + 6, branch);
  return (
    Math.atan2(
      a.tangent.z * b.tangent.x - a.tangent.x * b.tangent.z,
      a.tangent.dot(b.tangent),
    ) / a.p.distanceTo(b.p)
  );
}
function drive(track, r, branch, speedClass) {
  const pace = SPEED_CLASSES[speedClass].pace,
    s = r.contactS;
  const u = (((s / track.length) % 1) + 1) % 1;
  const selected =
    u > track.config.split[0] - 0.04 && u < track.config.split[1] + 0.01
      ? branch
      : 0;
  const speed = Math.hypot(r.velocity.x, r.velocity.z),
    look = 18 + (speed / pace) * 0.12;
  const targetPoint = track.frame(s + look, selected).p;
  const yaw = Math.atan2(
    targetPoint.x - r.position.x,
    targetPoint.z - r.position.z,
  );
  const error = Math.atan2(Math.sin(yaw - r.yaw), Math.cos(yaw - r.yaw));
  const rate =
    curvature(track, s + look, selected) * speed +
    error * 3.2 -
    r.yawRate * 0.2;
  const air = clamp((rate / pace) * 0.45, -1, 1);
  const steer = clamp(
    (rate / pace - air * 0.5) / (0.9 * CRAFT[r.craft].handling),
    -1,
    1,
  );
  let target = 145 * pace;
  for (let ahead = 0; ahead <= 180; ahead += 15) {
    const corner =
      Math.sqrt(
        80 / Math.max(Math.abs(curvature(track, s + ahead, selected)), 0.0001),
      ) * pace;
    target = Math.min(
      target,
      Math.sqrt(corner ** 2 + 65 * pace * pace * ahead),
    );
  }
  return pilotInputs({
    throttle: speed < target + 3 * pace,
    steer,
    air,
    slowing: clamp((speed - target) / (18 * pace), 0, 1),
  });
}
const track = makeTrack(2),
  terrain = createTerrain(track),
  rows = [];
try {
  for (let craft = 0; craft < 3; craft++)
    for (let speedClass = 0; speedClass < 3; speedClass++)
      for (const branch of [-1, 1]) {
        const race = new Race(track, craft, mode, speedClass, terrain);
        race.pickups = [];
        const p = race.player,
          begin = (track.config.split[0] - 0.04) * track.length,
          end = (track.config.split[1] + 0.015) * track.length;
        const row = {
          craft,
          speedClass,
          branch,
          completed: false,
          contacts: 0,
          pairDisplacementSteps: 0,
          pairContactSoundEvents: 0,
          railSteps: 0,
          recoveries: 0,
          wrongBranchSteps: 0,
          gateTransitions: [],
          minShield: 100,
          maxBackward: 0,
          stalls: [],
        };
        let active = false,
          previousContact = false,
          window = null;
        const recover = race.recover.bind(race);
        race.recover = (r) => {
          if (active && r === p) row.recoveries++;
          return recover(r);
        };
        for (let step = 0; step < 120 * 245 && !race.complete; step++) {
          const old = { s: p.contactS, gate: p.gate, time: race.time };
          race.update(1 / 120, drive(track, p, branch, speedClass));
          if (!active && p.contactS >= begin) {
            active = true;
            row.approach = { s: p.contactS, time: race.time, shield: p.shield };
            window = { s: p.contactS, time: race.time };
          }
          if (active) {
            row.pairContactSoundEvents += race.events.filter(
              (e) => e.text === "CONTACT",
            ).length;
            if (p.wallTouched) row.railSteps++;
            if (p.contactMoved && !p.wallTouched) row.pairDisplacementSteps++;
            if (p.wallTouched && !previousContact) {
              row.contacts++;
              (row.contactDetails ||= []).push({
                s: p.contactS,
                branch: p.branch,
                time: race.time,
                speed: p.speed,
                shield: p.shield,
                position: p.position.toArray(),
              });
            }
            previousContact = p.wallTouched;
            row.minShield = Math.min(row.minShield, p.shield);
            row.maxBackward = Math.max(row.maxBackward, old.s - p.contactS);
            if (p.gate !== old.gate)
              row.gateTransitions.push([old.gate, p.gate]);
            if (
              p.contactS > track.config.split[0] * track.length &&
              p.contactS < track.config.split[1] * track.length &&
              !track.bounds(p.contactS, p.branch).connected &&
              p.branch !== branch
            )
              row.wrongBranchSteps++;
            for (const [key, target] of [
              ["entry", track.config.split[0] * track.length],
              ["exit", track.config.split[1] * track.length],
            ])
              if (
                !row[key] &&
                old.s < target &&
                p.contactS >= target &&
                !p.recoveredThisStep
              )
                row[key] =
                  old.time +
                  ((target - old.s) / (p.contactS - old.s)) *
                    (race.time - old.time);
            if (race.time - window.time >= 1) {
              if (p.contactS - window.s < 1) row.stalls.push({ ...window });
              window = { s: p.contactS, time: race.time };
            }
            if (p.contactS >= end) {
              row.completed = true;
              break;
            }
          }
          race.events.length = 0;
        }
        row.last = {
          s: p.contactS,
          gate: p.gate,
          shield: p.shield,
          eliminated: p.eliminated,
        };
        row.npcsAtPlayerMerge = race.racers.slice(1).map((r) => ({
          id: r.id,
          s: r.contactS,
          gate: r.gate,
          shield: r.shield,
          eliminated: r.eliminated,
        }));
        row.expectedGate =
          Math.floor(((end - track.finishS) / track.length) * 32) + 1;
        row.sectorSeconds = row.exit && row.entry ? row.exit - row.entry : null;
        rows.push(row);
      }
} finally {
  terrain.geometries.forEach((g) => g.dispose());
}
await mkdir(resolve(output, ".."), { recursive: true });
await writeFile(
  output,
  JSON.stringify(
    {
      source: root,
      mode,
      pairMetric:
        "pairDisplacementSteps is contactMoved without wallTouched, a solver displacement proxy, not distinct collision events",
      method:
        "Grid start; player id remains 0, legal throttle/steer/analog airbrakes only. No NPC control or position/velocity/gate assignments. Pickup-free. Pilot uses conservative 145*pace speed cap and curvature-aware slowing; not human timing or physical device benchmark.",
      rows,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ output, rows }));
