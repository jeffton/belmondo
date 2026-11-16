import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack, mod, TRACKS, TRACK_INDEX } from "../src/track.ts";
import { Race } from "../src/race.ts";

function approach(race, gate, branch = 0, lateral = 0, distance = 0.5) {
  const r = race.player;
  const s = race.track.finishS + (gate * race.track.length) / 32 - distance;
  const f = race.track.frame(s, branch);
  Object.assign(r, {
    s,
    contactS: s,
    gate,
    lap: Math.floor((gate - 1) / 32) + 1,
    branch,
    grounded: false,
    flight: true,
  });
  r.position.copy(f.p).addScaledVector(f.right, lateral);
  r.position.y += 2.2;
  r.velocity.copy(f.tangent).multiplyScalar(240 * race.classSpec.pace);
  r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
  r.checkpoint = { s, branch, gate };
  return { r, f };
}

for (let speedClass = 0; speedClass < 3; speedClass++) {
  test(`Cinderline C${speedClass + 1}: a legal airborne gate crossing counts when the step ends beyond the deck edge`, () => {
    const race = new Race(
      makeTrack(TRACK_INDEX.CINDERLINE),
      1,
      "race",
      speedClass,
    );
    race.countdown = 0;
    const { r, f } = approach(race, 16, 0, 16.9);
    const gateS = race.track.finishS + race.track.length / 2;
    for (const rival of race.racers.slice(1)) {
      const s = gateS - 20 - rival.id * 5;
      const frame = race.track.frame(s);
      Object.assign(rival, { s, contactS: s, gate: 16, aiFire: Infinity });
      rival.position.copy(frame.p);
      rival.position.y += 2.2;
      rival.velocity
        .copy(frame.tangent)
        .multiplyScalar(240 * race.classSpec.pace);
      rival.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    }
    assert.equal(race.position, 1);
    r.velocity.addScaledVector(f.right, 60 * race.classSpec.pace);
    assert(
      race.track.gap(mod(r.contactS, race.track.length) / race.track.length),
    );
    race.update(1 / 120, { throttle: 1 });
    assert.equal(
      r.grounded,
      false,
      "the ship actually crosses over the missing deck",
    );
    assert(r.x > 17.33, "the endpoint is outside the hull-safe deck corridor");
    assert.equal(r.gate, 17, "the swept crossing is inside the real gate");
    assert.equal(r.recoveredThisStep, false);

    // Land downstream, then drive on through the ordinary physical integrator.
    // A missed gate used to cap progress here forever, even after a clean landing.
    const landedS = gateS + 130;
    const landing = race.track.frame(landedS);
    r.position.copy(landing.p);
    r.position.y += 2.2;
    r.contactS = landedS;
    r.velocity.copy(landing.tangent).multiplyScalar(240 * race.classSpec.pace);
    r.yaw = Math.atan2(landing.tangent.x, landing.tangent.z);
    r.grounded = true;
    r.flight = false;
    race.update(1 / 120, { throttle: 1 });
    assert(
      r.s > landedS,
      "landing retains earned progress instead of freezing at gate 16",
    );
    // Continue with ordinary driving: rivals must not overtake a frozen timing
    // station while the player's actual ship remains ahead down the road.
    r.id = 8;
    r.aiFire = Infinity;
    for (let step = 0; step < 360; step++) race.update(1 / 120, {});
    assert.equal(
      race.position,
      1,
      "no false 1st-to-8th drop after the seeded landing",
    );
    assert.equal(r.shield, 100);
    assert.equal(r.recoveredThisStep, false);
  });
}

for (const [course, config] of TRACKS.entries()) {
  for (let speedClass = 0; speedClass < 3; speedClass++) {
    test(`${config.name} C${speedClass + 1}: ordered gates retain progress through both routes and two lap boundaries`, () => {
      const track = makeTrack(course);
      for (const fork of [-1, 1]) {
        for (let gate = 1; gate <= 64; gate++) {
          const race = new Race(track, 1, "trial", speedClass);
          race.countdown = 0;
          const gateS = track.finishS + (gate * track.length) / 32;
          const u = mod(gateS, track.length) / track.length;
          const branch = u > config.split[0] && u < config.split[1] ? fork : 0;
          const { r } = approach(race, gate, branch, 0, 4);
          r.grounded = true;
          r.flight = false;
          for (let step = 0; step < 8 && r.gate === gate; step++)
            race.update(1 / 120, { throttle: 1 });
          assert.equal(r.gate, gate + 1, `fork ${fork}, gate ${gate}`);
          assert.equal(r.lap, Math.floor(gate / 32) + 1);
          assert(
            r.s >= gateS,
            `earned gate ${gate} supplies continuous progress`,
          );
          assert.equal(r.recoveredThisStep, false);
        }
      }
    });
  }
}

test("airborne crossing validation still rejects outside-track, excessive-height and reverse crossings", () => {
  for (const kind of ["outside", "high", "reverse"]) {
    const race = new Race(makeTrack(TRACK_INDEX.CINDERLINE), 1, "trial", 0);
    race.countdown = 0;
    const { r, f } = approach(race, 16, 0, kind === "outside" ? 25 : 0);
    if (kind === "high") r.position.y += 60;
    if (kind === "reverse") {
      r.position.addScaledVector(f.tangent, 1);
      r.velocity.negate();
    }
    race.update(1 / 120, { throttle: 0 });
    assert.equal(r.gate, 16, kind);
    assert.equal(r.lap, 1);
  }
});
