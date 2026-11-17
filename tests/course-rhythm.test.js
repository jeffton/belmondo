import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACK_INDEX, TRACKS } from "../src/track.ts";

// V4's bends are authored in the control polygon. Measure the real connected
// counterturn sectors, independently of how each course authors its deck.
for (const [index, range] of [
  [TRACK_INDEX.COAST, [0.53, 0.69]],
  [TRACK_INDEX.SOLAR, [0.77, 0.94]],
]) {
  test(`legacy-v4 course ${index}: linked counterturns demand real direction changes`, () => {
    const track = makeTrack(index);
    let previousSign = 0,
      reversals = 0,
      positiveHeading = 0,
      negativeHeading = 0;
    for (let i = 0; i < 500; i++) {
      const s = (range[0] + ((range[1] - range[0]) * i) / 500) * track.length;
      const a = track.frame(s),
        b = track.frame(s + 2);
      const angle = Math.atan2(
        a.tangent.z * b.tangent.x - a.tangent.x * b.tangent.z,
        a.tangent.x * b.tangent.x + a.tangent.z * b.tangent.z,
      );
      const curvature = angle / a.p.distanceTo(b.p);
      const sign = Math.abs(curvature) > 1 / 700 ? Math.sign(curvature) : 0;
      if (sign && previousSign && sign !== previousSign) reversals++;
      if (sign) previousSign = sign;
      if (angle > 0) positiveHeading += angle;
      else negativeHeading -= angle;
    }
    assert(reversals >= 2, "linked bends require changing steering direction");
    assert(
      positiveHeading > 0.8 && negativeHeading > 1,
      "substantial opposed headings, not decorative wiggles",
    );
  });

  test(`legacy-v4 course ${index}: launch approach and aligned landing have room for authored markings`, () => {
    const track = makeTrack(index);
    const [runwayStart, runwayEnd] = track.config.sections.runway;
    const launch = track.frame(track.config.jump * track.length);
    const start = track.frame(runwayStart * track.length).p;
    const gapEnd = track.frame(
      (track.config.jump + track.config.gapLength) * track.length,
    ).p;
    const end = track.frame(runwayEnd * track.length).p;
    assert(
      start.distanceTo(launch.p) > 96,
      "launch approach accommodates authored markings",
    );
    assert(
      gapEnd.distanceTo(end) > 214,
      "runout accommodates landing markings",
    );
    for (let i = 0; i <= 100; i++) {
      const s =
        (runwayStart + ((runwayEnd - runwayStart) * i) / 100) * track.length;
      for (const branch of [-1, 0, 1]) {
        const f = track.frame(s, branch);
        assert(
          Math.abs(f.p.sub(launch.p).dot(launch.right)) < 0.05,
          "every runway level remains aligned with actual takeoff",
        );
      }
    }
  });
}

test("Whiteout's climbing valley links opposed turns without disturbing its signatures", () => {
  const track = makeTrack(TRACK_INDEX.WHITEOUT);
  const config = TRACKS[TRACK_INDEX.WHITEOUT];
  let reference;
  try {
    TRACKS[TRACK_INDEX.WHITEOUT] = { ...config, rhythm: [] };
    reference = makeTrack(TRACK_INDEX.WHITEOUT);
  } finally {
    TRACKS[TRACK_INDEX.WHITEOUT] = config;
  }
  let left = 0;
  let right = 0;
  let minShift = 0;
  let maxShift = 0;
  for (let i = 0; i <= 1000; i++) {
    const u = i / 1000;
    const f = track.frame(u * track.length);
    const original = reference.frame(u * reference.length);
    if (u < 0.54 || u > 0.66) {
      assert(
        f.p.distanceTo(original.p) < 1e-7,
        "finish, basin and ridge remain fixed",
      );
    } else {
      const shift = f.p.clone().sub(original.p).dot(original.right);
      minShift = Math.min(minShift, shift);
      maxShift = Math.max(maxShift, shift);
      const next = track.frame((u + 0.001) * track.length);
      const angle = Math.atan2(
        f.tangent.z * next.tangent.x - f.tangent.x * next.tangent.z,
        f.tangent.dot(next.tangent),
      );
      if (angle > 0) right += angle;
      else left -= angle;
      assert(next.p.y > f.p.y, "the opposed turns remain a physical climb");
    }
  }
  assert(
    left > Math.PI / 12 && right > Math.PI / 12,
    "both directions carry a readable turn, not only an apex wiggle",
  );
  assert(
    maxShift - minShift > 2 * track.config.width,
    "opposed road displacement exceeds the full deck width",
  );
});

test("FAULTLINE extraction shelves require substantial linked counterturns", () => {
  const track = makeTrack(TRACK_INDEX.FAULTLINE);
  const turns = [];
  let previous, turn;
  for (let s = 0.52 * track.length; s < 0.91 * track.length; s += 8) {
    const frame = track.frame(s);
    if (previous) {
      const angle = Math.atan2(
        previous.tangent.z * frame.tangent.x -
          previous.tangent.x * frame.tangent.z,
        previous.tangent.x * frame.tangent.x +
          previous.tangent.z * frame.tangent.z,
      );
      const sign =
        Math.abs(angle / previous.p.distanceTo(frame.p)) > 1 / 700
          ? Math.sign(angle)
          : 0;
      if (sign && sign !== turn?.sign) {
        turn = { sign, angle: 0, points: [previous.p] };
        turns.push(turn);
      }
      if (turn) {
        turn.angle += angle;
        turn.points.push(frame.p);
      }
    }
    previous = frame;
  }
  const substantial = turns.filter(({ angle, points }) => {
    const start = points[0];
    const chord = points.at(-1).clone().sub(start).setY(0).normalize();
    const deviation = Math.max(
      ...points.map((point) =>
        point.clone().sub(start).setY(0).cross(chord).length(),
      ),
    );
    // A straight racing line cannot erase bends wider than the entire deck.
    return Math.abs(angle) > Math.PI / 8 && deviation > 2 * track.config.width;
  });
  let reversals = 0;
  for (let i = 1; i < substantial.length; i++)
    if (substantial[i].sign !== substantial[i - 1].sign) reversals++;
  assert(
    reversals >= 3,
    "linked corners require repeated, unavoidable countersteering",
  );
});
