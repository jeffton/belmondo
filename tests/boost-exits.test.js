import { test } from "node:test";
import assert from "node:assert/strict";
import { Race, CRAFT, SPEED_CLASSES } from "../src/race.js";
import { makeTrack } from "../src/track.js";
import { getTrackPickups } from "../src/pickups.js";

for (const [index, u] of [
  [1, 0.968],
  [2, 0.79],
  [4, 0.205],
  [5, 0.465],
]) {
  const track = makeTrack(index);
  test(`${track.config.name}: exit boost is physically collectible by every craft and class`, () => {
    const pad = getTrackPickups(track).find((p) => p.u === u);
    for (let speedClass = 0; speedClass < SPEED_CLASSES.length; speedClass++) {
      for (let craft = 0; craft < CRAFT.length; craft++) {
        const race = new Race(track, craft, "trial", speedClass);
        race.countdown = 0;
        const r = race.player;
        const s = pad.s - 25;
        const frame = track.frame(s);
        r.s = r.contactS = s;
        r.lap = 1;
        r.gate = Math.floor((s / track.length) * 32) + 1;
        r.position
          .copy(frame.p)
          .addScaledVector(frame.right, pad.lateral)
          .addScaledVector(frame.up, 2.2);
        r.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
        r.velocity
          .copy(frame.tangent)
          .multiplyScalar(150 * SPEED_CLASSES[speedClass].pace);
        r.grounded = true;
        r.branch = 0;
        for (let step = 0; step < 40; step++) {
          race.update(1 / 120, { throttle: true, steer: 0 });
          assert(!r.recoveredThisStep);
          assert(!r.eliminated);
          assert(Number.isFinite(r.s));
        }
        assert(
          r.collectedPickups.has(`1:${pad.id}`),
          `${CRAFT[craft].name}, class ${speedClass}: approach missed the pad`,
        );
        assert(r.surge > 0);
      }
    }
  });
}
