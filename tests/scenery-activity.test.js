import test from "node:test";
import assert from "node:assert/strict";
import { Group, Vector3 } from "three";
import { makeTrack, TRACKS } from "../src/track.ts";
import { createTerrain } from "../src/terrain.ts";
import { buildSceneryActivity, scenerySite } from "../src/scenery-activity.ts";

for (const [index, config] of TRACKS.entries()) {
  test(`${config.name} scenery moves within its off-road envelope`, () => {
    const track = makeTrack(index);
    const terrain = createTerrain(track);
    const surface = { terrain, heightAt: terrain.heightAt };
    const site = scenerySite(track, surface);
    const scene = new Group();
    const rig = buildSceneryActivity(scene, track, surface);
    const roots = [];
    scene.traverse((obj) => {
      if (obj.isMesh) roots.push(obj);
    });
    scene.updateMatrixWorld(true);
    const first = roots.map((mesh) => mesh.matrixWorld.clone());
    let moving = false;
    const v = new Vector3();
    for (let t = 0; t < 28; t += 0.41) {
      rig.update(t);
      scene.updateMatrixWorld(true);
      for (const [i, mesh] of roots.entries()) {
        moving ||= !mesh.matrixWorld.equals(first[i]);
        const attr = mesh.geometry.getAttribute("position");
        for (let p = 0; p < attr.count; p++) {
          v.fromBufferAttribute(attr, p).applyMatrix4(mesh.matrixWorld);
          assert.ok(
            Math.hypot(v.x - site.center.x, v.z - site.center.z) <= site.radius,
            `${site.kind} at ${t} s`,
          );
          if ("altitude" in site)
            assert.ok(
              v.y > terrain.heightAt(v.x, v.z) + 3,
              `${site.kind} clears terrain at ${t} s`,
            );
        }
      }
    }
    assert.ok(site.clearance >= 10, "animated extent clears all road branches");
    assert.ok(moving, "an articulated segment or vehicle moved");
  });
}
