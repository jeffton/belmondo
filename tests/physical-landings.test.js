import test from "node:test";
import assert from "node:assert/strict";
import { Race } from "../src/race.ts";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { projectRoad, roadHeight } from "../src/road-projection.ts";
import { craftSupport } from "../src/contacts.ts";
import { playerPilot } from "./helpers/player-pilot.js";

const track = makeTrack(TRACK_INDEX.FAULTLINE);
const dt = 1 / 120;

function place(race, s, branch, height) {
  const r = race.player;
  const f = track.frame(s, branch);
  r.position.copy(f.p);
  r.position.y += height;
  r.s = r.contactS = s;
  r.branch = branch;
  r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
  r.pitch = -Math.asin(f.tangent.y);
  r.pitchRate = 0;
  return r;
}

test("RAPTOR's real jump landing retains a continuous physical attitude", () => {
  const race = new Race(track, 1, "trial", 0);
  race.countdown = 0;
  const r = race.player;
  let crossedGap = false;
  let touchdown = false;
  for (let step = 0; step < 120 * 90; step++) {
    const wasGrounded = r.grounded;
    const pitch = r.pitch;
    const u = r.contactS / track.length;
    crossedGap ||= track.gap(u);
    race.update(dt, playerPilot(track, r, -1, 0));
    assert.equal(r.recoveredThisStep, false);
    if (crossedGap && !wasGrounded && r.grounded) {
      const roadPitch = -Math.asin(track.frame(r.contactS, r.branch).tangent.y);
      assert(
        Math.abs(r.pitch - pitch) < Math.abs(roadPitch - pitch),
        "touchdown does not overwrite the incoming attitude with road pitch",
      );
      assert(Number.isFinite(r.pitchRate));
      assert.notEqual(r.pitchRate, 0, "the hull keeps its angular state");
      touchdown = true;
      break;
    }
    race.events.length = 0;
  }
  assert(touchdown, "ordinary player controls cross and land the real gap");
});

test("ordinary hover settles freely above the hull, not on a virtual bottom stop", () => {
  const race = new Race(track, 1, "trial", 0);
  race.countdown = 0;
  const r = place(race, 0.45 * track.length, 0, 2.2);
  for (let step = 0; step < 120 * 3; step++) {
    race.update(dt, { throttle: false });
    assert.equal(r.recoveredThisStep, false);
  }
  const road = projectRoad(track, r.position, r.contactS, r.branch);
  const height = r.position.y - roadHeight(road, r.position) - 2.2;
  assert(height < -0.35, "there is no clamp at the old hover floor");
  assert(
    r.position.clone().sub(road.point).dot(road.up) > craftSupport(r, road.up),
    "the real solid hull remains clear of the actual deck",
  );
});

test("landing on BORE is physical even when the airborne racer came from BENCH", () => {
  const race = new Race(track, 1, "trial", 0);
  race.countdown = 0;
  const r = race.player;
  const checkpoint = { ...r.checkpoint };
  const lowerS = 0.27625 * track.length;
  const lower = track.frame(lowerS, -1);
  r.position.copy(lower.p);
  r.position.y += 12.2;
  r.velocity.copy(lower.tangent).multiplyScalar(30);
  r.velocity.y = -20;
  r.yaw = Math.atan2(lower.tangent.x, lower.tangent.z);
  r.pitch = -Math.atan2(r.velocity.y, 30);
  r.pitchRate = 0;
  r.contactS = 0.279 * track.length;
  r.branch = 1;
  r.grounded = false;
  r.flight = true;
  r.offroad = 4;
  let landed = false;
  for (let step = 0; step < 120 * 3; step++) {
    race.update(dt, { throttle: false });
    assert.equal(r.recoveredThisStep, false, "no source-route height rescue");
    if (r.grounded) {
      landed = true;
      break;
    }
  }
  assert(landed);
  assert.equal(r.branch, -1, "the actual lower deck owns the contact");
  assert.equal(r.gate, 1, "a landing does not award a missing gate");
  assert.equal(r.lap, 1);
  assert(
    r.s < track.finishS + track.length / 32,
    "earned distance stays behind the first missing gate",
  );
  assert.deepEqual(r.checkpoint, checkpoint);
  assert.equal(r.shield, 100);
});

test("hover cannot boost an underside approach through another deck", () => {
  const race = new Race(track, 1, "trial", 0);
  race.countdown = 0;
  const r = race.player;
  const lower = track.frame(0.27625 * track.length, -1);
  r.position.copy(lower.p);
  r.position.y -= 1.5;
  r.contactS = 0.279 * track.length;
  r.branch = 1;
  r.yaw = Math.atan2(lower.tangent.x, lower.tangent.z);
  r.pitch = -Math.asin(lower.tangent.y);
  r.pitchRate = 0;
  r.grounded = false;
  r.flight = true;
  const clearance = craftSupport(r, lower.up) / lower.up.y;
  const ballisticApex = lower.p.y + clearance / 2;
  r.velocity.set(
    0,
    Math.sqrt(
      2 * 35 * race.classSpec.pace ** 2 * (ballisticApex - r.position.y),
    ),
    0,
  );
  for (let step = 0; step < 120; step++) {
    race.update(dt, {});
    assert.equal(r.grounded, false, "there was no top-face landing");
    assert.equal(r.branch, 1, "no destination deck was acquired from below");
    assert.equal(r.recoveredThisStep, false);
    assert(
      r.position.y <= ballisticApex + 1e-9,
      "hover supplies no underside lift",
    );
  }
});

test("air time is not a loss condition, but falling below every deck still recovers", () => {
  const race = new Race(track, 1, "trial", 0);
  race.countdown = 0;
  const r = place(race, 0.6 * track.length, 0, 100);
  r.grounded = false;
  r.flight = true;
  r.offroad = 10;
  race.update(dt, {});
  assert.equal(r.recoveredThisStep, false);
  assert(r.velocity.y < 0, "gravity continues without an airborne timeout");
  const checkpoint = { ...r.checkpoint };
  r.position.set(10000, race.surface.lowestRoadY - 10, 10000);
  r.velocity.set(0, -20, 0);
  race.update(dt, {});
  assert.equal(r.recoveredThisStep, true);
  assert.equal(r.contactS, checkpoint.s);
  assert.equal(r.branch, checkpoint.branch);
  assert.equal(r.gate, checkpoint.gate);
  assert.equal(r.shield, 76);
});
