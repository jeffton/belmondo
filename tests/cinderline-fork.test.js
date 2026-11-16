import { after, test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { getTrackPickups } from "../src/pickups.ts";
import { createTerrain } from "../src/terrain.ts";

const track = makeTrack(TRACK_INDEX.CINDERLINE);
const terrain = createTerrain(track);
after(() => terrain.geometries.forEach((geometry) => geometry.dispose()));

test("Cinderline return offers an actual gorge reversal and a sweeping banked rim", () => {
  const [start, end] = track.config.split;
  const turn = { [-1]: 0, [1]: 0 };
  let rimBank = 0;
  for (let i = 1; i <= 500; i++) {
    const s = (start + ((end - start) * i) / 500) * track.length;
    for (const branch of [-1, 1]) {
      const previous = track.frame(
        s - ((end - start) * track.length) / 500,
        branch,
      );
      const f = track.frame(s, branch);
      turn[branch] += previous.tangent.angleTo(f.tangent);
      if (branch === 1) rimBank = Math.max(rimBank, Math.abs(f.bank));
    }
  }
  assert(turn[-1] > turn[1] * 1.3, "gorge requires more changes of heading");
  assert(rimBank > 0.08, "upper rim carries sustained physical banking");
  for (const u of track.config.split) {
    const a = track.frame(u * track.length, -1);
    const b = track.frame(u * track.length, 1);
    assert(a.p.distanceTo(b.p) < 0.002);
    assert(a.tangent.dot(b.tangent) > 0.9999);
    assert(track.bounds(u * track.length, -1).connected);
  }
  assert.equal(track.config.layoutId, "cinderline-2-finish-end");
});

test("Cinderline gorge is continuous real land outside both unobstructed racing decks", () => {
  let raisedShoulders = 0;
  for (let u = 0.79; u <= 0.875; u += 0.0005) {
    for (const branch of [-1, 1]) {
      const f = track.frame(u * track.length, branch);
      for (const lateral of [-f.width, 0, f.width]) {
        const p = f.p.clone().addScaledVector(f.right, lateral);
        assert(
          terrain.heightAt(p.x, p.z) < p.y - 1,
          "terrain clears the banked deck",
        );
      }
      if (branch === -1) {
        for (const side of [-1, 1]) {
          const p = f.p.clone().addScaledVector(f.right, side * (f.width + 62));
          if (terrain.heightAt(p.x, p.z) > f.p.y + 12) raisedShoulders++;
        }
      }
    }
  }
  assert(
    raisedShoulders > 100,
    "the technical route runs through a substantial cutting",
  );
});

test("Both redesigned circuits offer equal fork rewards instead of boost compensation", () => {
  for (const index of [TRACK_INDEX.COAST, TRACK_INDEX.CINDERLINE]) {
    const course = makeTrack(index);
    const rewards = [-1, 1].map((branch) =>
      getTrackPickups(course)
        .filter((pad) => pad.branch === branch)
        .map((pad) => pad.type),
    );
    assert.deepEqual(rewards[0], rewards[1]);
    assert(rewards[0].length > 0, "both routes retain a pickup opportunity");
  }
});
