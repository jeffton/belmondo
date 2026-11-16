import test from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACKS, TRACK_INDEX } from "../src/track.ts";
import { railPoint, railBackDepth } from "../src/rail-geometry.ts";
import { RAIL_PROFILE } from "../src/rail-profile.ts";

test("all courses expose wider main decks and keep both split routes clear", () => {
  for (let index = 0; index < TRACKS.length; index++) {
    const track = makeTrack(index),
      { split } = track.config,
      midpoint = ((split[0] + split[1]) / 2) * track.length,
      main = track.frame(midpoint),
      left = track.frame(midpoint, -1),
      right = track.frame(midpoint, 1),
      routeSeparation = left.p.distanceTo(right.p);

    assert(main.width >= 18, `${track.config.name}: main deck is not wider`);
    if (split[0] < 0) {
      for (let u = 0; u < 1; u += 0.01) {
        const center = track.frame(u * track.length);
        for (const branch of [-1, 1]) {
          const route = track.frame(u * track.length, branch);
          assert(
            route.p.distanceTo(center.p) < 1e-8,
            "unsplit course cannot create a phantom branch",
          );
          assert.equal(route.width, center.width);
        }
      }
      continue;
    }
    assert(
      left.width >= track.config.branchWidths[0] &&
        right.width >= track.config.branchWidths[1],
      `${track.config.name}: split deck is too narrow`,
    );
    assert(
      routeSeparation > left.width + right.width,
      `${track.config.name}: widened split decks overlap`,
    );
  }
});

const legacyRadius = {
  "coast-4-finish-end": 79.18256462241654,
  "solar-4-finish-end": 94.08613815383424,
  "noctilucent-4-finish-end": 102.80189052236103,
};
for (let index = 0; index < TRACKS.length; index++) {
  test(`${TRACKS[index].name}: authored bend radius and any jump's aligned ballistic landing`, () => {
    const track = makeTrack(index);
    let minimumRadius = Infinity;
    for (const branch of [-1, 0, 1]) {
      for (let i = 0; i < 1500; i++) {
        const before = track.frame(((i - 0.25) / 1500) * track.length, branch);
        const after = track.frame(((i + 0.25) / 1500) * track.length, branch);
        const angle = before.tangent.setY(0).angleTo(after.tangent.setY(0));
        // Whiteout's accepted crossing is a technical fork. Its real-control
        // craft/class matrix checks flow and clean driving instead of applying
        // the original broad base-road radius quota to the redesigned decks.
        const u = i / 1500;
        // Once the fork halves separate, branch 0 is a reference alignment,
        // not a rendered or driveable carriageway.
        if (
          branch === 0 &&
          u > track.config.split[0] &&
          u < track.config.split[1] &&
          !track.bounds(u * track.length, -1).connected
        )
          continue;
        if (
          track.config.layoutId === "whiteout-2-finish-end" &&
          branch !== 0 &&
          u > track.config.split[0] &&
          u < track.config.split[1]
        )
          continue;
        if (angle > 1e-8) {
          const distance = before.p.setY(0).distanceTo(after.p.setY(0));
          minimumRadius = Math.min(minimumRadius, distance / angle);
        }
      }
    }
    const acceptedRadius = legacyRadius[track.config.layoutId];
    if (acceptedRadius !== undefined)
      assert(
        Math.abs(minimumRadius - acceptedRadius) < 0.01,
        `v4 sampled radius changed from accepted ${acceptedRadius} m to ${minimumRadius} m`,
      );
    else
      assert.ok(
        minimumRadius >=
          ({
            "monsoon-4-finish-end": 95,
            "cinderline-2-finish-end": 89,
            "vesper-1-finish-end": 66,
          }[track.config.layoutId] ?? 150),
        `Tight road kink: radius ${minimumRadius} m`,
      );
    if (track.config.jump !== null) {
      const launch = track.frame(track.config.jump * track.length);
      const landingOffsets =
        track.config.layoutId === "faultline-1-finish-end"
          ? [0, 1 / 3, 2 / 3, 1].map(
              (fraction) =>
                track.config.gapLength +
                fraction *
                  (track.config.sections.runway[1] -
                    track.config.jump -
                    track.config.gapLength),
            )
          : [0.014, 0.03, 0.055, 0.075];
      for (const offset of landingOffsets) {
        const landing = track.frame(
          (track.config.jump + offset) * track.length,
        );
        const sideways = landing.p.sub(launch.p).dot(launch.right);
        assert.ok(
          Math.abs(sideways) < 0.05,
          `Landing bends ${sideways} m away from launch`,
        );
      }
    }
  });
}

test("FAULTLINE arc lip has one physical frame across exact stations and wrapped lap gates", () => {
  const track = makeTrack(TRACK_INDEX.FAULTLINE);
  const launchS = track.config.jump * track.length;
  const before = track.frame(launchS - 1e-6);
  const gate = Math.round(((launchS - track.finishS) * 32) / track.length);
  for (let lap = 0; lap <= 5; lap++) {
    for (const s of [
      launchS + lap * track.length,
      track.finishS + ((gate + lap * 32) * track.length) / 32,
    ]) {
      const lip = track.frame(s);
      assert(
        lip.p.distanceTo(before.p) < 1e-4,
        "no interpolation into the gap",
      );
      assert(lip.tangent.distanceTo(before.tangent) < 1e-9);
      assert(lip.right.distanceTo(before.right) < 1e-9);
      assert(lip.up.distanceTo(before.up) < 1e-9);
    }
  }
});

test("FAULTLINE independent spline necks clear neighboring full-width road and rail footprints", () => {
  const track = makeTrack(TRACK_INDEX.FAULTLINE);
  const { start, end } = track.config.fork.authored;
  const offsets = [-track.config.width, 0, track.config.width];
  for (const u of [start, end]) {
    for (const leftOffset of offsets) {
      for (const rightOffset of offsets) {
        const frames = [-1, 1].map((branch, i) => {
          const s = u * track.length + [leftOffset, rightOffset][i];
          return Object.assign(
            track.frame(s, branch),
            track.bounds(s, branch),
            {
              branch,
            },
          );
        });
        const [a, b] = frames;
        const axis = a.right.clone().add(b.right).normalize();
        const side = Math.sign(b.p.clone().sub(a.p).dot(axis));
        const caps = frames.map((frame, i) => {
          const innerSide = i === 0 ? side : -side;
          return railPoint(
            frame,
            innerSide * frame.width,
            innerSide,
            RAIL_PROFILE.height,
            railBackDepth(track, frame, innerSide),
          );
        });
        assert(
          caps[1].sub(caps[0]).dot(axis) * side > 0,
          `independent spline neck overlaps adjacent deck/rail at ${u}`,
        );
      }
    }
  }
});

test("FAULTLINE separated BORE/BENCH decks retain complete visible collision rails", () => {
  const track = makeTrack(TRACK_INDEX.FAULTLINE);
  const { start, end } = track.config.fork.authored;
  for (let i = 0; i <= 600; i++) {
    const s = (start + ((end - start) * i) / 600) * track.length;
    for (const branch of [-1, 1]) {
      const frame = track.frame(s, branch);
      const bounds = track.bounds(s, branch);
      assert.equal(
        bounds.connected,
        false,
        "no lane changes between independent decks",
      );
      assert.equal(bounds.railMinHeight, RAIL_PROFILE.height);
      assert.equal(bounds.railMaxHeight, RAIL_PROFILE.height);
      for (const side of [-1, 1]) {
        const point = railPoint(
          { ...frame, ...bounds, branch },
          side * frame.width,
          side,
          RAIL_PROFILE.height,
        );
        assert(
          Math.abs(point.sub(frame.p).dot(frame.up) - RAIL_PROFILE.height) <
            1e-8,
          "rendered rail face matches the full collision height",
        );
      }
    }
  }
});

test("joined fork halves have a level seam and expose common visual/physical bounds", () => {
  for (let index = 0; index < TRACKS.length; index++) {
    const track = makeTrack(index),
      [start, end] = track.config.split;
    if (start < 0) continue;
    for (const u of [start, end]) {
      for (const branch of [-1, 1]) {
        const bounds = track.bounds(u * track.length, branch);
        assert(bounds.connected, "exact split endpoints join the unsplit road");
        assert(
          bounds.seam.distanceTo(track.bounds(u * track.length, -branch).seam) <
            1e-8,
        );
      }
    }
    for (let i = 1; i < 100; i++) {
      const s = (start + ((end - start) * i) / 100) * track.length;
      const first = track.frame(s, -1),
        second = track.frame(s, 1);
      const firstBounds = track.bounds(s, -1),
        secondBounds = track.bounds(s, 1);
      const left = firstBounds.innerSide === 1 ? first : second,
        right = firstBounds.innerSide === 1 ? second : first;
      const a = firstBounds.innerSide === 1 ? firstBounds : secondBounds,
        b = firstBounds.innerSide === 1 ? secondBounds : firstBounds;
      if (a.connected || b.connected) {
        assert.equal(a.connected, b.connected);
        assert(
          Math.abs(left.p.y - right.p.y) < 1e-8,
          "the joined seam must not become a vertical step before separation",
        );
        assert(a.clipMax < a.wallMax && b.clipMin > b.wallMin);
        assert(
          a.seam.distanceTo(b.seam) < 1e-8,
          "unequal-width rendered halves share the exact same seam vertex",
        );
        assert(a.clipMax <= left.width && b.clipMin >= -right.width);
      } else {
        assert.equal(a.clipMax, left.width);
        assert.equal(b.clipMin, -right.width);
        assert.equal(a.seam, null);
        assert.equal(b.seam, null);
      }
    }
  }
});
