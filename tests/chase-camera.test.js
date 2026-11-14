import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.js";
import { createTerrain } from "../src/terrain.js";
import { chaseCameraSurface, clearChaseCamera } from "../src/chase-camera.js";

const up = new Vector3(0, 1, 0);

test("Night drop camera clears the upstream deck after focus transport", () => {
  const track = makeTrack(TRACK_INDEX.NOCTILUCENT);
  const terrain = createTerrain(track);
  const branch = -1;
  const contactS = 0.87145 * track.length;
  const f = track.frame(contactS, branch);
  const position = f.p.clone().addScaledVector(up, 2.9);
  const forward = f.tangent.clone().setY(0).normalize();
  const camera = position
    .clone()
    .addScaledVector(forward, -11.4)
    .addScaledVector(up, 3.8);
  const surface = chaseCameraSurface(track, contactS, branch, camera, terrain);
  assert.ok(camera.y < surface, "old horizontal chase intersects the drop lip");
  const player = { contactS, branch };
  clearChaseCamera(camera, track, player, terrain, 3.8);
  assert.ok(camera.y >= surface + 3.8);
  // The existing focus transport can move the camera down before smoothing.
  camera.y -= 12;
  clearChaseCamera(camera, track, player, terrain, 1.2);
  assert.ok(camera.y >= surface + 1.2);
});

test("all course forks keep chase clearance through moving drop approaches", () => {
  for (let index = 0; index < 7; index++) {
    const track = makeTrack(index);
    const terrain = createTerrain(track);
    for (const branch of [-1, 0, 1]) {
      let camera;
      let previousFocus;
      for (let s = 0; s < track.length; s += 7) {
        const f = track.frame(s, branch);
        const focus = f.p.clone().addScaledVector(up, 2.9);
        const desired = focus
          .clone()
          .addScaledVector(f.tangent.clone().setY(0).normalize(), -11.4)
          .addScaledVector(up, 3.8);
        const player = { contactS: s, branch };
        clearChaseCamera(desired, track, player, terrain, 3.8);
        if (camera) {
          camera.add(focus.clone().sub(previousFocus));
          camera.lerp(desired, 1 - Math.exp(-9 / 30));
        } else camera = desired.clone();
        clearChaseCamera(camera, track, player, terrain, 1.2);
        const floor = chaseCameraSurface(track, s, branch, camera, terrain);
        assert.ok(Number.isFinite(camera.y), `${index}/${branch}/${s}`);
        assert.ok(camera.y >= floor + 1.2 - 1e-9, `${index}/${branch}/${s}`);
        previousFocus = focus;
      }
    }
  }
});

test("Night lower crossing remains attached to its own deck, not the overpass", () => {
  const track = makeTrack(TRACK_INDEX.NOCTILUCENT);
  const terrain = createTerrain(track);
  const s = track.config.sections.crossings[0].lowerU * track.length;
  const f = track.frame(s);
  const surface = chaseCameraSurface(track, s, 0, f.p, terrain);
  assert.ok(Math.abs(surface - f.p.y) < 0.1);
});

test("projected floors match independently authored banked road points", () => {
  const terrain = { heightAt: () => -Infinity };
  for (let index = 0; index < 7; index++) {
    const track = makeTrack(index);
    for (const branch of [-1, 0, 1])
      for (const u of [0.12, 0.25, 0.36, 0.48, 0.6, 0.78, 0.87145]) {
        const s = u * track.length;
        const f = track.frame(s, branch);
        if (track.gap(f.u)) continue;
        for (const side of [-0.8, 0, 0.8]) {
          const point = f.p.clone().addScaledVector(f.right, side * f.width);
          const floor = chaseCameraSurface(track, s, branch, point, terrain);
          assert.ok(Math.abs(floor - point.y) < 0.02);
        }
      }
  }
});

test("flat chase framing and airborne height stay unchanged", () => {
  const track = makeTrack(TRACK_INDEX.NOCTILUCENT);
  const terrain = createTerrain(track);
  const player = { contactS: track.finishS, branch: 0 };
  const f = track.frame(player.contactS);
  for (const height of [6.7, 40]) {
    const camera = f.p.clone().addScaledVector(up, height);
    const before = camera.clone();
    clearChaseCamera(camera, track, player, terrain, 3.8);
    assert.deepEqual(camera.toArray(), before.toArray());
  }
});
