import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeTrack, TRACKS, TRACK_INDEX } from "../src/track.js";
import { railPoint } from "../src/rail-geometry.js";
import { createTerrain } from "../src/terrain.js";

const LEGACY_FRAME_HASHES = [
  "671c02ec22b1a924e29f348bb37f8fe55e762fd9c525af1b03c79ea0355c0871",
  "5cc226061716de8246426edabfe062d04e5e9cb4e40b4fedd828a795f060c6da",
  "0238606031fc83b95a334dafc06f2c8a4a087e6779231ae53ccf1ef0f56a5ffd",
  "98324f23e94cdca7c64423b486f39b89284eeea5d42d535d21503290593de39d",
  "97af92dda76458984295ff63e7e30a63ac4808bb633392c47544bf6f396411da",
  "b5184e3272ace6f391e1e9da8ed4bbc6ee68741fcd9e9044fd1277419b912527",
  "3562453e6a421e9ff433a51c61b132fd7edf605e1e7701f9b52a6ec3427aac21",
];

function frameHash(track) {
  const hash = createHash("sha256");
  for (let station = 0; station <= 512; station++) {
    const distance = (track.length * station) / 512;
    for (const branch of [-1, 0, 1]) {
      const f = track.frame(distance, branch);
      hash.update(
        [
          f.p.x,
          f.p.y,
          f.p.z,
          f.tangent.x,
          f.tangent.y,
          f.tangent.z,
          f.right.x,
          f.right.y,
          f.right.z,
          f.width,
          f.bank,
          f.metric,
        ].join(",") + ";",
      );
    }
  }
  return hash.digest("hex");
}

test("without authored width sections, all integrated layout frame outputs are byte-stable", () => {
  assert.equal(TRACKS.length, LEGACY_FRAME_HASHES.length);
  for (const [index, expected] of LEGACY_FRAME_HASHES.entries()) {
    const track = makeTrack(index);
    delete track.config.widthSections;
    assert.equal(frameHash(track), expected, TRACKS[index].name);
  }
});

test("authored width envelope smoothly drives main deck, fork edges, rails, bounds and terrain", () => {
  const track = makeTrack(TRACK_INDEX.COAST),
    [forkStart, forkEnd] = track.config.split;
  track.config.widthSections = [
    {
      start: forkStart - 0.08,
      fullStart: forkStart - 0.04,
      fullEnd: forkEnd + 0.04,
      end: forkEnd + 0.08,
      width: 24,
    },
  ];
  const at = (u, branch = 0) => track.frame(u * track.length, branch);
  const expectedWidth = (u) => {
    const section = track.config.widthSections[0];
    const ramp = (x, a, b) => {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const envelope =
      ramp(u, section.start, section.fullStart) *
      (1 - ramp(u, section.fullEnd, section.end));
    return track.config.width + (section.width - track.config.width) * envelope;
  };

  for (const u of [
    forkStart - 0.08,
    forkStart - 0.06,
    forkStart,
    (forkStart + forkEnd) / 2,
    forkEnd,
    forkEnd + 0.06,
    forkEnd + 0.08,
  ]) {
    const main = at(u);
    assert.ok(
      Math.abs(main.width - expectedWidth(u)) < 1e-10,
      `main width at ${u}`,
    );
    assert.ok(Math.abs(main.width - at(u - 1e-5).width) < 0.1);
    assert.ok(Math.abs(main.width - at(u + 1e-5).width) < 0.1);
  }

  const u = (forkStart + forkEnd) / 2,
    main = at(u),
    left = at(u, -1),
    right = at(u, 1);
  assert.equal(main.width, 24);
  assert.equal(left.width, track.config.branchWidths[0]);
  assert.equal(right.width, track.config.branchWidths[1]);
  for (const [frame, side, branch] of [
    [main, -1, 0],
    [main, 1, 0],
    [left, -1, -1],
    [right, 1, 1],
  ]) {
    Object.assign(frame, track.bounds(frame.u * track.length, branch));
    const edge = side * frame.width,
      rail = railPoint(frame, edge, side, 0);
    assert.ok(
      Math.abs(rail.clone().sub(frame.p).dot(frame.right) - edge) < 1e-9,
    );
  }

  const seamStation = forkStart + 0.005,
    leftBounds = track.bounds(seamStation * track.length, -1),
    rightBounds = track.bounds(seamStation * track.length, 1),
    seamLeft = at(seamStation, -1),
    seamRight = at(seamStation, 1);
  assert.ok(
    leftBounds.clipMin >= -seamLeft.width &&
      leftBounds.clipMax <= seamLeft.width,
  );
  assert.ok(
    rightBounds.clipMin >= -seamRight.width &&
      rightBounds.clipMax <= seamRight.width,
  );
  assert.ok(leftBounds.seam && rightBounds.seam);
  assert.ok(leftBounds.seam.distanceTo(rightBounds.seam) < 1e-8);
  const mainBounds = track.bounds((forkStart - 0.02) * track.length);
  assert.equal(mainBounds.clipMin, -at(forkStart - 0.02).width);
  assert.equal(mainBounds.clipMax, at(forkStart - 0.02).width);

  const terrain = createTerrain(track);
  for (const station of [forkStart - 0.02, forkEnd + 0.02]) {
    const f = at(station);
    for (const edge of [-f.width, f.width]) {
      const p = f.p.clone().addScaledVector(f.right, edge);
      assert.ok(p.y - terrain.heightAt(p.x, p.z) > 3.5);
    }
  }
  terrain.geometries.forEach((geometry) => geometry.dispose());
});
