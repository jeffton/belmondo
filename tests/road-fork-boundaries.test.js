import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { makeTrack, TRACKS, TRACK_INDEX } from "../src/track.ts";
import {
  getRoadSurface,
  roadFrame,
  roadStrip,
  roadStations,
} from "../src/road-surface.ts";

function key(point) {
  return point.toArray().join(",");
}
for (let course = 0; course < TRACKS.length; course++) {
  const track = makeTrack(course),
    surface = getRoadSurface(track);
  for (const boundary of track.config.split) {
    test(`${track.config.name} fork ${boundary}: common and branch top edges share exact Float32 vertices`, () => {
      const station = boundary * track.length,
        edges = new Map();
      for (const triangle of surface.triangles) {
        const points = [triangle.a, triangle.b, triangle.c],
          stations = [triangle.sa, triangle.sb, triangle.sc];
        for (let i = 0; i < 3; i++) {
          const j = (i + 1) % 3;
          if (stations[i] !== station || stations[j] !== station) continue;
          const edge = [key(points[i]), key(points[j])].sort().join("|");
          const uses = edges.get(edge) ?? [];
          uses.push(triangle.branch);
          edges.set(edge, uses);
        }
      }
      const divisions = track.config.name === "NOCTILUCENT" ? 8 : 1;
      assert.equal(
        edges.size,
        divisions * 2,
        "common endpoint has both halves, including NOCT's intermediate vertices",
      );
      for (const [edge, uses] of edges) {
        assert.equal(
          uses.length,
          2,
          `${edge}: no open boundary or overlapping triangles`,
        );
        assert.equal(uses.filter((branch) => branch === 0).length, 1);
        assert.equal(uses.filter((branch) => branch !== 0).length, 1);
      }
      const common = roadFrame(track, station, 0);
      for (const branch of [-1, 1]) {
        const original = track.frame(station, branch),
          bounds = track.bounds(original.u * track.length, branch);
        const shared = roadFrame(track, station, branch);
        assert.deepEqual(shared.p, common.p);
        assert.deepEqual(shared.right, common.right);
        assert.deepEqual(shared.up, common.up);
        for (const name of [
          "clipMin",
          "clipMax",
          "wallMin",
          "wallMax",
          "innerSide",
          "connected",
          "railMinHeight",
          "railMaxHeight",
        ])
          assert.equal(
            shared[name],
            bounds[name],
            `${name}: authored bounds/clip semantics retained`,
          );
        assert.deepEqual(
          track.frame(station, branch),
          original,
          "shared render frames do not mutate Track.frame or AI geometry",
        );
      }
    });
  }
  test(`${track.config.name}: only common segments adjoining fork endpoints gain triangles`, () => {
    const stations = roadStations(track);
    for (const boundary of track.config.split) {
      const index = stations.indexOf(boundary);
      const commonStart =
        boundary === track.config.split[0] ? index - 1 : index;
      const a = roadFrame(track, stations[commonStart] * track.length, 0),
        b = roadFrame(track, stations[commonStart + 1] * track.length, 0);
      const strip = roadStrip(
        track,
        a,
        b,
        [-a.width, a.width, b.width, -b.width],
        0,
        [0, 1],
        true,
      );
      assert.equal(
        strip.indices.length,
        9,
        "one endpoint midpoint, not a new full-width subdivision at the other end",
      );
      assert.deepEqual(strip.uv.slice(0, 4), [
        [-a.width / 32, (a.u * track.length) / 32],
        [a.width / 32, (a.u * track.length) / 32],
        [b.width / 32, (b.u * track.length) / 32],
        [-b.width / 32, (b.u * track.length) / 32],
      ]);
      assert.equal(
        strip.uv[4][0],
        0,
        "midpoint retains full-width lateral UVs for markings/shaders",
      );
      const outside =
        boundary === track.config.split[0] ? commonStart - 1 : commonStart + 1;
      const c = roadFrame(track, stations[outside] * track.length, 0),
        d = roadFrame(track, stations[outside + 1] * track.length, 0);
      assert.equal(
        roadStrip(
          track,
          c,
          d,
          [-c.width, c.width, d.width, -d.width],
          0,
          [0, 1],
          true,
        ).indices.length,
        6,
      );
    }
  });
}

test("Monsoon exact TURBO split-entry ray lies on shared solid geometry", () => {
  const track = makeTrack(TRACK_INDEX.MONSOON),
    surface = getRoadSurface(track);
  const position = new THREE.Vector3(
    432.6833597153287,
    114.87016736230116,
    -1001.228298990406,
  );
  const contact = surface.beneath(position, 0, Infinity);
  assert.ok(
    contact,
    "the real millimetre-scale joint crack is closed, not covered by a grounding grace period",
  );
  assert.ok(contact.point.y < position.y);
  assert.ok(Math.abs(contact.s / track.length - 0.765) < 0.001);
});
