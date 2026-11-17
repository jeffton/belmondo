import { test } from "node:test";
import assert from "node:assert/strict";
import { TRACKS, TRACK_INDEX, makeTrack } from "../src/track.ts";

function fixture() {
  const config = TRACKS[TRACK_INDEX.VESPER];
  const market = makeTrack(TRACK_INDEX.VESPER);
  let reference;
  try {
    TRACKS[TRACK_INDEX.VESPER] = { ...config, returnRoute: undefined };
    reference = makeTrack(TRACK_INDEX.VESPER);
  } finally {
    TRACKS[TRACK_INDEX.VESPER] = config;
  }
  return { market, reference };
}

test("VESPER's shorter market leaves the rooftop setup, fork and retained city streets in place", () => {
  const { market, reference } = fixture();
  assert.equal(
    market.length,
    reference.length,
    "reference stations stay fixed",
  );
  assert(
    market.physicalLength < reference.physicalLength,
    "the market is physically shorter, not merely assigned fewer stations",
  );
  for (let i = 0; i <= 1000; i++) {
    const u = i / 1000;
    if (u > 0.42 && u < 0.66) continue;
    for (const branch of [-1, 0, 1]) {
      const a = market.frame(u * market.length, branch);
      const b = reference.frame(u * reference.length, branch);
      assert(a.p.distanceTo(b.p) < 1e-9, `retained deck moved at ${u}`);
      assert(a.tangent.distanceTo(b.tangent) < 1e-9);
      assert(a.up.distanceTo(b.up) < 1e-9);
      assert.equal(a.width, b.width);
    }
  }
});

function transfer(track) {
  let previous;
  let firstExit;
  let secondEntry;
  for (let u = 0.43; u <= 0.53; u += 0.0001) {
    const frame = track.frame(u * track.length);
    if (previous) {
      const a = previous.tangent;
      const b = frame.tangent;
      const angle = Math.atan2(a.z * b.x - a.x * b.z, a.x * b.x + a.z * b.z);
      const curvature = angle / frame.p.distanceTo(previous.p);
      if (curvature > 1 / 700) firstExit = u;
      if (firstExit !== undefined && curvature < -1 / 700) {
        secondEntry = u;
        break;
      }
    }
    previous = frame;
  }
  assert(firstExit !== undefined && secondEntry !== undefined);
  let distance = 0;
  for (let u = firstExit; u < secondEntry; u += 0.0001) {
    const a = track.frame(u * track.length);
    const b = track.frame(Math.min(u + 0.0001, secondEntry) * track.length);
    distance += a.p.distanceTo(b.p);
    assert(b.p.y > a.p.y, "the right/left transfer keeps climbing");
  }
  return distance;
}

test("VESPER's market right exit feeds the climbing left sooner than the former city block", () => {
  const { market, reference } = fixture();
  assert(
    transfer(market) < transfer(reference),
    "less release distance connects the two physical corners",
  );
});
