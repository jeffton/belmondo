import assert from "node:assert/strict";
import { test } from "node:test";
import { Color, Group, Light } from "three";
import {
  buildNoctilucentLighting,
  noctilucentLightingPlan,
} from "../src/noctilucent-lighting.ts";
import { makeTrack, mod, TRACK_INDEX } from "../src/track.ts";

const track = makeTrack(TRACK_INDEX.NOCTILUCENT);

test("projectors mount to actual deck rail, outside the racing lane", () => {
  for (const mount of noctilucentLightingPlan(track)) {
    const { frame, base, branch, side, at, station, district } = mount;
    assert.equal(track.gap(at), false, district);
    assert.equal(track.isTunnel(station, branch), false, district);
    const run = base.clone().sub(frame.p);
    const edge = side < 0 ? frame.clipMin : frame.clipMax;
    assert.ok(side * (run.dot(frame.right) - edge) > 0, district);
    for (const head of mount.heads) {
      assert.ok(head.apex.y > head.aimPoint.y, district);
      assert.ok(head.axis.dot(frame.up) < -0.12, district);
    }
  }
});

test("beam footprints remain on their own exposed deck through forks and runway", () => {
  const [start, end] = track.config.split;
  for (const mount of noctilucentLightingPlan(track)) {
    for (const head of mount.heads) {
      for (let i = 0; i < 36; i++) {
        const angle = (i / 36) * Math.PI * 2;
        const along = Math.sin(angle);
        const s = head.center + along * head.length;
        const u = mod(s / track.length, 1);
        const f = track.frame(s, mount.branch);
        const { clipMin, clipMax } = track.bounds(s, mount.branch);
        const offset = head.deck(Math.cos(angle), along).sub(f.p);
        assert.equal(track.gap(u), false, mount.district);
        assert.equal(track.isTunnel(s, mount.branch), false, mount.district);
        assert.equal(u > start && u < end, mount.branch !== 0, mount.district);
        assert.ok(
          offset.dot(f.right) > clipMin && offset.dot(f.right) < clipMax,
          mount.district,
        );
        assert.ok(Math.abs(offset.dot(f.up) - 0.075) < 1e-8, mount.district);
      }
    }
  }
});

test("local light uses batched meshes and does not illuminate vertically separated roads", () => {
  const scene = new Group();
  const shade = buildNoctilucentLighting(scene, track);
  const mounts = noctilucentLightingPlan(track);
  const unlit = new Color(0x233448);
  const dark = unlit.clone().multiplyScalar(0.7).getHex();
  scene.traverse((node) => assert.equal(node instanceof Light, false));
  for (const mount of mounts) {
    const group = scene.getObjectByName(mount.district);
    assert.equal(group.children.length, 3);
    for (const mesh of group.children)
      assert.ok(mesh.geometry.attributes.position.array.every(Number.isFinite));
    for (const head of mount.heads) {
      assert.notEqual(shade(head.aimPoint, unlit.clone(), 1), dark);
      assert.equal(
        shade(
          head.aimPoint.clone().addScaledVector(head.target.up, 30),
          unlit.clone(),
          1,
        ),
        dark,
      );
    }
  }
  const unrelated = new Group();
  assert.equal(
    buildNoctilucentLighting(unrelated, makeTrack(TRACK_INDEX.FAULTLINE)),
    null,
  );
  assert.equal(unrelated.children.length, 0);
});
