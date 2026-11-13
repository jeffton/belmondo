import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack } from "../src/track.js";
import { celestialDirection } from "../src/track-lighting.js";
import { buildSectionalValues } from "../src/sectional-values.js";

function fixture(index) {
  const track = makeTrack(index);
  const shade = buildSectionalValues(
    track,
    celestialDirection(track.config.name),
  );
  return { track, shade };
}

test("Solar tunnel has a dark ceiling, readable deck and open portals", () => {
  const { track, shade } = fixture(1);
  const point = (u, height = 0) => {
    const f = track.frame(u * track.length);
    return f.p.clone().addScaledVector(f.up, height);
  };
  const deck = shade(point(0.24));
  assert.ok(deck > 0.74 && deck < 0.9);
  assert.ok(shade(point(0.24, 16)) < deck - 0.2);
  for (const u of [0.2001, 0.2799]) assert.ok(shade(point(u)) > deck + 0.05);
  // No hard exposure step where daylight meets the physical portal.
  assert.ok(Math.abs(shade(point(0.19999)) - shade(point(0.20001))) < 0.005);
});

test("sectional values stay inside the physical tunnel corridor", () => {
  const { track, shade } = fixture(1);
  const f = track.frame(0.24 * track.length);
  for (const offset of [100, 120]) {
    assert.equal(
      shade(
        f.p.clone().addScaledVector(f.right, offset).addScaledVector(f.up, 16),
      ),
      1,
    );
    assert.equal(shade(f.p.clone().addScaledVector(f.up, offset)), 1);
  }
  // Continuous falloff, not the spatial index cell edge, ends the influence.
  const a = f.p.clone().addScaledVector(f.right, f.width + 8);
  const b = a.clone().addScaledVector(f.right, 0.01);
  assert.ok(Math.abs(shade(a) - shade(b)) < 0.005);
});

test("compressed branch parameters do not jump at nearest-segment boundaries", () => {
  const { track, shade } = fixture(4);
  const ceiling = (s) => {
    const f = track.frame(s, -1);
    return shade(f.p.clone().addScaledVector(f.up, 16));
  };
  for (let s = 6350; s < 6380; s += 0.1)
    assert.ok(
      Math.abs(ceiling(s) - ceiling(s + 0.1)) < 0.005,
      `Monsoon at ${s}`,
    );
});

test("Night's overpass stays open while its lower tunnel is shaded", () => {
  const { track, shade } = fixture(2);
  const s = 0.365 * track.length;
  const lower = track.frame(s, -1).p;
  const upper = track.frame(s, 1).p;
  assert.ok(shade(lower) < 0.89);
  assert.ok(shade(upper) > 0.92);
});

test("Vesper gallery values do not leak into the separated roof route", () => {
  const { track, shade } = fixture(6);
  const s = 0.32 * track.length;
  const lower = track.frame(s, -1).p;
  const upper = track.frame(s, 1).p;
  assert.ok(shade(lower) < 0.9);
  assert.ok(shade(upper) > 0.92);
});

test("all seven courses retain restrained, finite deck values without geometry changes", () => {
  for (let index = 0; index < 7; index++) {
    const { track, shade } = fixture(index);
    const before = track.frame(0.37 * track.length, -1).p.toArray();
    for (let u = 0; u < 1; u += 0.005)
      for (const branch of [-1, 1]) {
        const f = track.frame(u * track.length, branch);
        for (const h of [0, 16]) {
          const v = shade(f.p.clone().addScaledVector(f.up, h));
          assert.ok(
            Number.isFinite(v) && v >= 0.4 && v <= 1.02,
            `${index} ${u}: ${v}`,
          );
        }
      }
    assert.deepEqual(track.frame(0.37 * track.length, -1).p.toArray(), before);
    assert.equal(shade(new THREE.Vector3(1e6, 1e6, 1e6)), 1);
  }
});
