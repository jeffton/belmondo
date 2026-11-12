import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACKS } from "../src/track.js";

function withoutRhythm(index) {
  const config = TRACKS[index];
  const rhythm = config.rhythm;
  try {
    delete config.rhythm;
    return makeTrack(index);
  } finally {
    config.rhythm = rhythm;
  }
}

for (const index of [0, 1]) {
  test(`${TRACKS[index].name}: two real alternating corner sequences replace one-direction cruising`, () => {
    const track = makeTrack(index);
    const previous = withoutRhythm(index);
    let oppositeMeters = 0;
    for (const bend of track.config.rhythm) {
      let previousSign = 0;
      let reversals = 0;
      let displacement = 0;
      let positiveHeading = 0;
      let negativeHeading = 0;
      for (let i = 0; i < 500; i++) {
        const s =
          (bend.start + ((bend.end - bend.start) * i) / 500) * track.length;
        const a = track.frame(s);
        const b = track.frame(s + 2);
        const ds = a.p.distanceTo(b.p);
        const angle = Math.atan2(
          a.tangent.z * b.tangent.x - a.tangent.x * b.tangent.z,
          a.tangent.x * b.tangent.x + a.tangent.z * b.tangent.z,
        );
        const curvature = angle / ds;
        const sign = Math.abs(curvature) > 1 / 700 ? Math.sign(curvature) : 0;
        if (sign && previousSign && sign !== previousSign) reversals++;
        if (sign) previousSign = sign;
        if (angle > 0) positiveHeading += angle;
        else negativeHeading -= angle;
        if (curvature > 1 / 700)
          oppositeMeters +=
            (((bend.end - bend.start) * track.length) / 500) * a.metric;
        displacement = Math.max(
          displacement,
          a.p.distanceTo(previous.frame(s).p),
        );
      }
      assert(
        reversals >= 2,
        "linked bends must require changing steering direction",
      );
      assert(
        positiveHeading > 0.3 && negativeHeading > 0.6,
        "meaningful heading changes, not decorative road wiggles",
      );
      assert(
        displacement > 40,
        "the physical racing surface must actually change its route",
      );
    }
    assert(
      oppositeMeters > 280,
      "at least a substantial new section turns against the original loop direction",
    );
  });

  test(`${TRACKS[index].name}: finish, launch, gap and landing remain exactly on their accepted surfaces`, () => {
    const track = makeTrack(index);
    const previous = withoutRhythm(index);
    const [finishStart, finishEnd] = track.config.sections.finishStraight;
    const ranges = [
      [finishStart, 1],
      [0, finishEnd - 1],
      track.config.sections.runway,
    ];
    for (const [start, end] of ranges)
      for (let i = 0; i <= 100; i++) {
        const s = (start + ((end - start) * i) / 100) * track.length;
        for (const branch of [-1, 0, 1]) {
          const a = track.frame(s, branch);
          const b = previous.frame(s, branch);
          assert(a.p.distanceTo(b.p) < 1e-9);
          assert(a.tangent.distanceTo(b.tangent) < 1e-9);
          assert.equal(track.gap(a.u), previous.gap(b.u));
        }
      }
    const [runwayStart, runwayEnd] = track.config.sections.runway;
    const launch = track.frame(track.config.jump * track.length).p;
    const start = track.frame(runwayStart * track.length).p;
    const gapEnd = track.frame(
      (track.config.jump + track.config.gapLength) * track.length,
    ).p;
    const end = track.frame(runwayEnd * track.length).p;
    assert(
      start.distanceTo(launch) > 96,
      "actual launch approach accommodates authored markings",
    );
    assert(
      gapEnd.distanceTo(end) > 214,
      "actual aligned runout accommodates landing markings",
    );
  });
}
