import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { Race } from "../src/race.ts";
import { createTerrain } from "../src/terrain.ts";
import { getTrackPickups } from "../src/pickups.ts";
import { playerPilot } from "./helpers/player-pilot.js";

const track = makeTrack(TRACK_INDEX.FAULTLINE);

function curvature(s) {
  const a = track.frame(s - 2);
  const b = track.frame(s + 2);
  return (
    Math.abs(
      Math.atan2(
        a.tangent.z * b.tangent.x - a.tangent.x * b.tangent.z,
        a.tangent.x * b.tangent.x + a.tangent.z * b.tangent.z,
      ),
    ) / a.p.distanceTo(b.p)
  );
}

test("FAULTLINE return sustains technical corners rather than isolated curvature spikes", () => {
  let technicalMetres = 0;
  for (let s = 0.52 * track.length; s < 0.94 * track.length; s += 3) {
    const radius = 1 / curvature(s);
    assert(
      radius >= 150,
      "physical road never substitutes a kink for a corner",
    );
    if (radius < 200)
      technicalMetres += track.frame(s).p.distanceTo(track.frame(s + 3).p);
  }
  assert(
    technicalMetres > 1000,
    "a substantial length of sustained cornering survives line cutting",
  );
  for (const u of [
    track.config.returnRoute.start,
    track.config.returnRoute.end,
  ]) {
    const before = track.frame(u * track.length - 3);
    const after = track.frame(u * track.length + 3);
    assert(
      before.tangent.angleTo(after.tangent) < 0.05,
      "retained-deck seam has continuous heading",
    );
    assert(
      Math.abs(before.tangent.y - after.tangent.y) < 0.002,
      "retained-deck seam has continuous grade",
    );
  }
});

test("curvature reports physical turning radius when authored stations are compressed", () => {
  for (const u of [0.57, 0.62, 0.67, 0.765, 0.81]) {
    const s = u * track.length;
    const a = track.frame(s - 6).p;
    const b = track.frame(s).p;
    const c = track.frame(s + 6).p;
    const ab = b.clone().sub(a).setY(0);
    const bc = c.clone().sub(b).setY(0);
    const ac = c.clone().sub(a).setY(0);
    // Independent three-point circumcircle, using only physical deck positions.
    const oracle =
      (2 * Math.abs(ab.x * bc.z - ab.z * bc.x)) /
      (ab.length() * bc.length() * ac.length());
    assert(track.frame(s).metric < 0.8, "exercises non-unit station spacing");
    for (const branch of [-1, 0, 1]) {
      const signed = track.curvature(s, branch);
      const reported = Math.abs(signed);
      assert.equal(
        Math.sign(signed),
        Math.sign(ab.z * bc.x - ab.x * bc.z),
        "retains physical turn direction for either selected fork",
      );
      assert(
        Math.abs(reported / oracle - 1) < 0.02,
        "AI receives actual physical curvature, not station-rate curvature",
      );
      assert(
        Math.abs(1 / reported - 175) < 7,
        "the known 175m arc is not reported as a broad sweep",
      );
    }
  }
});

test("FAULTLINE runtime fork rewards fit the road and leave the flight receiver clear", () => {
  const pads = getTrackPickups(track);
  for (const branch of [-1, 1]) {
    const reachable = pads.filter(
      (pad) => pad.branch === branch || pad.branch === 0,
    );
    assert.equal(reachable.filter((pad) => pad.type === "boost").length, 3);
    assert.equal(reachable.filter((pad) => pad.type === "weapon").length, 6);
  }
  for (const pad of pads) {
    assert(
      !(pad.u >= track.config.sections.runway[0] && pad.u <= 0.515),
      "launch and receiving apron have no pickup traps",
    );
    for (const point of pad.outline) {
      const f = track.frame(pad.s, pad.branch);
      assert(
        Math.abs(point.clone().sub(f.p).dot(f.right)) < f.width,
        "whole pickup silhouette fits its real carriageway",
      );
    }
    if (pad.type === "boost" && pad.u > 0.515)
      assert(
        curvature(pad.s) < 1 / 700,
        "return boosts reward corner exits, not blind apexes",
      );
  }
});

test("FAULTLINE linked return gives legal airbrakes measurable value with the same throttle policy", () => {
  const terrain = createTerrain(track);
  function lap(noAir) {
    const race = new Race(track, 1, "trial", 1, terrain);
    race.countdown = 0;
    let walls = 0;
    let steps = 0;
    for (; steps < 120 * 150 && race.player.lap < 2; steps++) {
      const input = playerPilot(track, race.player, -1, 1);
      if (noAir) {
        input.air = 0;
        input.airLeft = 0;
        input.airRight = 0;
      }
      race.update(1 / 120, input);
      walls += Number(race.player.wallTouched);
      assert.equal(race.player.recoveredThisStep, false);
      race.events.length = 0;
    }
    assert.equal(race.player.lap, 2);
    return { walls, shield: race.player.shield, seconds: steps / 120 };
  }
  try {
    const optimized = lap(false);
    const noAir = lap(true);
    assert.equal(optimized.walls, 0);
    assert.equal(optimized.shield, 100);
    assert(
      noAir.walls > optimized.walls,
      "withholding airbrakes has a physical line cost",
    );
    assert(noAir.shield < optimized.shield);
    assert(noAir.seconds > optimized.seconds);
  } finally {
    terrain.geometries.forEach((geometry) => geometry.dispose());
  }
});
