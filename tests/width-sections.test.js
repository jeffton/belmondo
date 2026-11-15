import test from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACK_INDEX } from "../src/track.js";
import { railPoint } from "../src/rail-geometry.js";
import { createTerrain } from "../src/terrain.js";

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
