import test from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACK_INDEX } from "../src/track.js";
import { Race, CRAFT } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";

const track = makeTrack(TRACK_INDEX.COAST);
const terrain = createTerrain(track);
import { after } from "node:test";
after(() => terrain.geometries.forEach((g) => g.dispose()));
for (let craft = 0; craft < 3; craft++)
  for (let speedClass = 0; speedClass < 3; speedClass++)
    for (const pitch of [-1, 0, 1])
      test(`Coast launch envelope: craft ${craft}, class ${speedClass}, held pitch ${pitch}, finite TURBO`, () => {
        assert.equal(track.config.ramp.height, 12);
        const race = new Race(track, craft, "trial", speedClass, terrain);
        race.countdown = 0;
        const r = race.player;
        const s = (track.config.jump - 0.018) * track.length;
        const f = track.frame(s);
        r.position.copy(f.p);
        r.position.y += 2.2;
        r.contactS = r.s = s;
        r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
        r.gate = Math.floor((s / track.length) * 32) + 1;
        r.velocity
          .copy(f.tangent)
          .multiplyScalar(CRAFT[craft].speed * race.classSpec.pace);
        r.weapon = "TURBO";
        race.fire(r);
        let flight = false,
          absentDeck = 0,
          landed = false,
          flightTime = 0;
        race.recover = () =>
          assert.fail(
            JSON.stringify({
              reason: "rescue",
              u: r.contactS / track.length,
              offroad: r.offroad,
              shield: r.shield,
            }),
          );
        for (let step = 0; step < 120 * 6; step++) {
          const grounded = r.grounded;
          race.update(1 / 120, {
            throttle: true,
            steer: 0,
            air: 0,
            brake: false,
            pitch,
          });
          if (!r.grounded) {
            flight = true;
            flightTime = Math.max(flightTime, r.offroad);
            if (track.gap(r.contactS / track.length)) absentDeck++;
          }
          if (flight && !grounded && r.grounded) {
            landed = true;
            break;
          }
        }
        assert(
          landed && absentDeck > 0,
          "genuine missing-deck flight lands on physical runway",
        );
        assert.equal(r.shield, 100);
        assert(
          flightTime < 3,
          `flight ${flightTime} within unchanged rescue guard`,
        );
        assert(
          r.contactS / track.length < track.config.sections.runway[1],
          "landing within authored aligned runout",
        );
      });
