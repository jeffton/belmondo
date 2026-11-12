import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeTrack, TRACKS } from "../src/track.js";
import { railPoint } from "../src/rail-geometry.js";
import { createTerrain } from "../src/terrain.js";

const LEGACY_FRAME_HASHES = [
  "a15aa78a0a5a35c8c4ab1ce653546971b276b4d3dca4a028773abbae6f8bc734",
  "e995b599ab0a91c401b6d28f2203a5fa65e721efeb18d04bf843eb85f16e5819",
  "5ddec413d3ee4d87df2b789fb085c7a00f2e61d08b29d36bf403b1c53b3ce139",
  "11071b561efd5e918f1e0568ca22f374c2e298019897a389d93eb7486ba8f535",
  "c5280f97140bd70ad20ec1690893d3597968e96c7a5bee8c021d6eaf7e3c29a3",
  "28044677eeeecc94558a09a95b0fc3e72ba3bc05ed21e0a06be9961fe03ab0e4",
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

test("without authored width sections, all six legacy frame outputs are byte-stable", () => {
  assert.equal(TRACKS.length, LEGACY_FRAME_HASHES.length);
  for (const [index, expected] of LEGACY_FRAME_HASHES.entries()) {
    const track = makeTrack(index);
    assert.equal(track.config.widthSections, undefined);
    assert.equal(frameHash(track), expected, TRACKS[index].name);
  }
});

test("authored width envelope smoothly drives main deck, fork edges, rails, bounds and terrain", () => {
  const track = makeTrack(0),
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
