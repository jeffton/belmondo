import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack } from "../src/track.js";
import { Race, CRAFT } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";

for (let index = 0; index < 3; index++) {
  test(`physical AI follows either separated route through the real merge on course ${index}`, () => {
    const track = makeTrack(index),
      terrain = createTerrain(track);
    const [start, end] = track.config.split;
    for (let c = 0; c < 3; c++)
      for (const branch of [-1, 1]) {
        const craft = c,
          race = new Race(track, craft, "trial", c, terrain);
        race.countdown = 0;
        const r = race.player,
          pace = race.classSpec.pace;
        // This is an actual starting body on each already-separated carriageway;
        // subsequent steering/braking/contact comes entirely from Race's AI.
        r.id = 1;
        r.branch = branch;
        const s = (start + (end - start) * 0.55) * track.length,
          f = track.frame(s, branch);
        r.position.copy(f.p);
        r.position.y += 2.2;
        r.contactS = r.s = s;
        r.gate = Math.floor((s / track.length) * 32) + 1;
        r.checkpoint = { s, branch, gate: r.gate };
        r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
        r.velocity
          .copy(f.tangent)
          .multiplyScalar(CRAFT[craft].speed * pace * 0.6);
        r.speed = r.velocity.length();
        r.aiFire = Infinity;
        const destination = (end + 0.035) * track.length;
        let deckSamples = 0;
        for (
          let step = 0;
          step < 120 * 15 && r.contactS < destination;
          step++
        ) {
          race.update(1 / 120, {});
          const u = r.contactS / track.length;
          if (u < end - 1e-6 && !track.bounds(r.contactS, branch).connected) {
            assert.equal(
              r.branch,
              branch,
              "AI cannot switch to the missing central route",
            );
            if (r.grounded) {
              const f = track.frame(r.contactS, branch),
                bounds = track.bounds(r.contactS, branch);
              const x = r.position.clone().sub(f.p).dot(f.right);
              assert(x >= bounds.wallMin - 0.15 && x <= bounds.wallMax + 0.15);
              deckSamples++;
            }
          }
        }
        assert(
          r.contactS >= destination,
          `class${c} branch${branch} earns its merge`,
        );
        assert.equal(r.branch, 0);
        assert(deckSamples > 20);
        assert.equal(r.lap, 1, "merging cannot award an unrelated finish");
      }
    for (const geometry of terrain.geometries) geometry.dispose();
  });
}
