import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.js";
import { Race } from "../src/race.js";
import {
  buildTimingStripe,
  getFinishDistrictLayout,
} from "../src/finish-district.js";
import { countdownBoardStage } from "../src/start-gantry.js";

function place(racer, track, s, speed = 0) {
  const f = track.frame(s);
  racer.s = racer.contactS = s;
  racer.position.copy(f.p).addScaledVector(f.up, 2.2);
  racer.velocity.copy(f.tangent).multiplyScalar(speed);
  racer.yaw = Math.atan2(f.tangent.x, f.tangent.z);
  racer.x = 0;
  racer.speed = speed;
}

for (let course = 0; course < TRACKS.length; course++) {
  test(`${TRACKS[course].name}: actual timing plane ends the full spectator straight`, () => {
    const track = makeTrack(course);
    const [start, end] = track.config.sections.finishStraight;
    const line = track.frame(track.finishS);
    const endpoint = track.frame(end * track.length);
    assert(line.p.distanceTo(endpoint.p) < 1e-8);
    const axis = endpoint.p
      .clone()
      .sub(track.frame(start * track.length).p)
      .normalize();
    assert(line.tangent.dot(axis) > 0.999);
    // The full authored stand district remains upstream, including the portion
    // after the former timing origin. No scenery or route station is rotated.
    for (const stand of getFinishDistrictLayout(track))
      assert(stand.center.clone().sub(line.p).dot(axis) < 0);
    const stripe = buildTimingStripe(new THREE.Group(), track);
    assert.equal(stripe.userData.finishS, track.finishS);
    const vertices = stripe.geometry.attributes.position;
    let before = false,
      after = false;
    for (let i = 0; i < vertices.count; i++) {
      const distance = new THREE.Vector3()
        .fromBufferAttribute(vertices, i)
        .sub(line.p)
        .dot(axis);
      before ||= distance < -1;
      after ||= distance > 1;
    }
    assert(before && after, "crisp stripe straddles the real crossing plane");
    stripe.geometry.dispose();
    stripe.material.dispose();
    assert(track.config.layoutId.endsWith("-finish-end"));
  });

  test(`${TRACKS[course].name}: all class grids launch upstream without a false opening lap`, () => {
    const track = makeTrack(course);
    for (let speedClass = 0; speedClass < 3; speedClass++) {
      const race = new Race(track, 0, "race", speedClass);
      for (const racer of race.racers) {
        const gridSlot = racer.id === 0 ? 7 : racer.id - 1;
        assert.equal(racer.s, track.finishS - 18 - gridSlot * 9);
        assert.equal(racer.checkpoint.s, racer.s);
        assert.equal(racer.gate, 1);
        const f = track.frame(racer.s);
        assert(!track.gap(f.u));
        assert(
          f.tangent.y > -0.3 && f.tangent.y < 0.3,
          "grid remains on the authored drivable deck",
        );
        racer.aiFire = Infinity;
      }
      race.countdown = 0;
      for (let step = 0; step < 300; step++)
        race.update(1 / 120, { throttle: true });
      assert(race.player.s > track.finishS, "actual opening line crossed");
      assert.equal(race.player.lap, 1);
      assert.equal(race.laps.length, 0);
      assert.equal(race.finished, false);
      assert(race.racers.every((r) => r.lap === 1 && !r.recoveredThisStep));
    }
  });

  test(`${TRACKS[course].name}: real approaches cross the new line, not the old origin`, () => {
    const track = makeTrack(course);
    for (let speedClass = 0; speedClass < 3; speedClass++) {
      const race = new Race(track, 0, "trial", speedClass);
      race.countdown = 0;
      race.time = 20;
      const r = race.player;
      const oldLine = track.length;
      // Passing the retired origin cannot earn the still-distant finish gate.
      place(r, track, oldLine - 1, 80);
      r.gate = 32;
      for (let step = 0; step < 8; step++) race.update(1 / 120, {});
      assert(r.contactS > oldLine);
      assert.equal(r.lap, 1);
      assert.equal(r.gate, 32);
      // Drive the last 100m using real inputs and collision/projection. A final
      // gate fixture isolates timing behavior; it is not a full-lap claim.
      for (const lap of [1, race.lapCount]) {
        r.lap = lap;
        r.gate = lap * 32;
        race.finished = false;
        const finish = track.finishS + lap * track.length;
        place(r, track, finish - 100, 80 * race.classSpec.pace);
        r.checkpoint = { s: r.s, branch: 0, gate: r.gate };
        for (let step = 0; step < 1200 && r.lap === lap; step++) {
          const target = track.frame(r.contactS + 30);
          const desired = Math.atan2(
            target.p.x - r.position.x,
            target.p.z - r.position.z,
          );
          const error = Math.atan2(
            Math.sin(desired - r.yaw),
            Math.cos(desired - r.yaw),
          );
          race.update(1 / 120, { throttle: true, steer: error * 4 });
          const plane = track.frame(finish);
          if (r.position.clone().sub(plane.p).dot(plane.tangent) < -0.01)
            assert.equal(r.lap, lap);
        }
        assert.equal(r.lap, lap + 1);
        assert.equal(r.gate, lap * 32 + 1);
        assert(
          r.position
            .clone()
            .sub(track.frame(finish).p)
            .dot(track.frame(finish).tangent) >= 0,
        );
        assert.equal(race.finished, lap === race.lapCount);
        assert.equal(r.shield, 100);
      }
    }
  });
}

test("voice and board share actual countdown boundaries", () => {
  for (const [countdown, time, stage] of [
    [3.2, 0, "armed"],
    [3, 0, 3],
    [2, 0, 2],
    [1, 0, 1],
    [0, 0, "GO"],
    [0, 1.2, "idle"],
  ])
    assert.equal(countdownBoardStage({ countdown, time }), stage);
});
