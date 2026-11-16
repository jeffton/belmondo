import test from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { Race, CRAFT, SPEED_CLASSES } from "../src/race.ts";

const track = makeTrack(TRACK_INDEX.FAULTLINE);

function place(race, u, height = 2.2, speed = 150) {
  const racer = race.player;
  const s = u * track.length;
  const frame = track.frame(s);
  racer.position.copy(frame.p).addScaledVector(frame.up, height);
  racer.s = racer.contactS = s;
  racer.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
  racer.gate = Math.floor(((s - track.finishS) / track.length) * 32) + 1;
  racer.velocity.copy(frame.tangent).multiplyScalar(speed);
  return { racer, frame };
}

for (const [craft, spec] of CRAFT.entries())
  for (const [speedClass, speed] of SPEED_CLASSES.entries())
    for (const turbo of [false, true])
      for (const pitch of [-1, 0, 1])
        test(`FAULTLINE ${spec.name} ${speed.id} pitch ${pitch}, turbo ${turbo}: physical gap crossing and runway landing`, () => {
          const race = new Race(track, craft, "trial", speedClass);
          race.countdown = 0;
          const { racer } = place(
            race,
            track.config.ramp.start - 0.002,
            2.2,
            spec.speed * speed.pace,
          );
          if (turbo) {
            racer.weapon = "TURBO";
            race.fire(racer);
          }
          let flew = false;
          let landed = false;
          let airborneSeconds = 0;
          for (let step = 0; step < 120 * 8; step++) {
            const grounded = racer.grounded;
            race.update(1 / 120, { throttle: true, steer: 0, pitch });
            assert.equal(
              racer.recoveredThisStep,
              false,
              "no checkpoint teleport",
            );
            assert.equal(
              racer.wallTouched,
              false,
              "landing stays inside the physical deck",
            );
            assert.equal(racer.shield, 100);
            if (!racer.grounded) {
              flew = true;
              airborneSeconds += 1 / 120;
            }
            if (flew && !grounded && racer.grounded) {
              landed = true;
              break;
            }
          }
          assert(landed, "real road contact ends the flight");
          assert(
            airborneSeconds > 1,
            "the main jump is sustained flight, not a deck skip",
          );
          const u = racer.contactS / track.length;
          assert(
            u > track.config.jump + track.config.gapLength,
            "clears the missing deck",
          );
          assert(
            u < track.config.sections.runway[1],
            "lands before the receiver ends",
          );
        });

for (const [speedClass, speed] of SPEED_CLASSES.entries())
  for (const scenario of [
    "valid",
    "outside",
    "stalled",
    "reverse",
    "past receiver",
    "before gap",
  ])
    test(`long-flight rescue boundary ${speed.id}: ${scenario}`, () => {
      const race = new Race(track, 0, "trial", speedClass);
      race.countdown = 0;
      const u =
        scenario === "past receiver"
          ? track.config.sections.runway[1] + 0.01
          : scenario === "before gap"
            ? track.config.jump - 0.01
            : track.config.jump + track.config.gapLength + 0.005;
      const { racer, frame } = place(race, u, 100, 150 * speed.pace);
      racer.grounded = false;
      racer.flight = true;
      racer.offroad = 3.1;
      if (scenario === "outside")
        racer.position.addScaledVector(frame.right, 150);
      if (scenario === "stalled") racer.velocity.set(0, 0, 0);
      if (scenario === "reverse") racer.velocity.negate();
      race.update(1 / 120, { throttle: false, steer: 0 });
      assert.equal(racer.recoveredThisStep, scenario !== "valid");
      assert.equal(racer.shield, scenario === "valid" ? 100 : 76);
    });
