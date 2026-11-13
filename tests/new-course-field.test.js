import { pilotInputs } from "./pilot-inputs.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack, clamp, mod } from "../src/track.js";
import { Race } from "../src/race.js";

// Test driver supplies ordinary controls to player 0. The other seven ships use
// production AI; IDs, targeting indexes, weapons and hull contacts stay intact.
function drive(race) {
  const r = race.player;
  const track = race.track;
  const pace = race.classSpec.pace;
  const u = mod(r.contactS, track.length) / track.length;
  const [start, end] = track.config.split;
  const branch =
    u > start - 0.04 && u < start + (end - start) * 0.3
      ? r.branch || 1
      : r.branch;
  const look = track.frame(
    r.contactS + Math.max(18, (r.speed * 0.65) / pace),
    branch,
  );
  const heading = Math.atan2(look.p.x - r.position.x, look.p.z - r.position.z);
  const error = Math.atan2(
    Math.sin(heading - r.yaw),
    Math.cos(heading - r.yaw),
  );
  const curvature = Math.max(
    ...[0.25, 0.6, 1].map((t) =>
      Math.abs(track.curvature(r.contactS + (r.speed * t) / pace, branch)),
    ),
  );
  const cornerSpeed = Math.sqrt(
    (82 * pace * pace) / Math.max(curvature, 0.0001),
  );
  return pilotInputs({
    throttle: r.speed < cornerSpeed && Math.abs(error) < 0.7,
    steer: clamp(error * 2.5 - (r.yawRate * 0.25) / pace, -1, 1),
    air: clamp(error * 0.8, -1, 1),
    slowing: clamp((r.speed - cornerSpeed) / (30 * pace), 0, 1),
  });
}

for (const index of [3, 4, 5]) {
  test(`${makeTrack(index).config.name}: C3 competitive eight-ship field earns progress with weapons and contacts`, (t) => {
    const track = makeTrack(index);
    const race = new Race(track, 0, "race", 2);
    race.countdown = 0;
    const recoveries = Array(8).fill(0);
    let weaponUses = 0;
    const fire = race.fire.bind(race);
    race.fire = (r = race.player) => {
      if (r.weapon) weaponUses++;
      fire(r);
    };
    for (let step = 0; step < 120 * 120 && race.player.lap < 2; step++) {
      if (step % 240 === 0) race.fire();
      race.update(1 / 120, drive(race));
      for (const r of race.racers) {
        if (r.recoveredThisStep) recoveries[r.id]++;
      }
    }
    assert.equal(race.player.lap, 2);
    assert.equal(race.player.gate, 33);
    assert(weaponUses > 0, "combat was exercised, not disabled");
    assert(
      race.racers.every((r) => r.gate > 8),
      "the complete field earns sector progress",
    );
    t.diagnostic(
      JSON.stringify({
        course: track.config.name,
        time: race.time,
        weaponUses,
        field: race.racers.map((r) => ({
          id: r.id,
          lap: r.lap,
          gate: r.gate,
          shield: r.shield,
          recoveries: recoveries[r.id],
        })),
      }),
    );
  });
}
