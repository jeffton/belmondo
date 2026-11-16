import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { createTerrain } from "../src/terrain.ts";
import { buildWhiteoutFork } from "../src/whiteout-fork.ts";
import { buildNewCourseDistricts } from "../src/new-course-environments.ts";

const track = makeTrack(TRACK_INDEX.WHITEOUT);
const terrain = createTerrain(track);
const environment = {
  terrain,
  heightAt: terrain.heightAt,
  naturalMap: new THREE.Texture(),
};
const scene = new THREE.Scene();
const root = buildWhiteoutFork(scene, track, environment);
scene.updateMatrixWorld(true);

function roadSamples(step) {
  const frames = [];
  for (let s = 0; s < track.length; s += step) {
    const u = s / track.length;
    const branches =
      u > track.config.split[0] && u < track.config.split[1] ? [-1, 1] : [0];
    for (const branch of branches)
      frames.push({
        ...track.frame(s, branch),
        bounds: track.bounds(s, branch),
        branch,
      });
  }
  return frames;
}

test("Whiteout's bridge is open above and the real blue-ice gallery roofs only the lower branch", () => {
  const ray = new THREE.Raycaster();
  for (let u = 0.798; u < 0.817; u += 0.002) {
    const lower = track.frame(u * track.length, 1);
    for (const x of [-lower.width, 0, lower.width]) {
      ray.set(lower.p.clone().addScaledVector(lower.right, x), lower.up);
      ray.far = 40;
      const hits = ray.intersectObject(
        root.getObjectByName("whiteout-icecut-gallery"),
      );
      assert(hits.length, `actual ice roof covers lower route u=${u} x=${x}`);
      assert(
        hits[0].distance >= 29.5,
        "gallery has at least 26 wu clear airspace",
      );
    }
  }
  for (let u = 0.79; u < 0.825; u += 0.001) {
    const upper = track.frame(u * track.length, -1);
    for (const x of [-upper.width, 0, upper.width]) {
      ray.set(
        upper.p
          .clone()
          .addScaledVector(upper.right, x)
          .addScaledVector(upper.up, 0.1),
        upper.up,
      );
      ray.far = 200;
      assert.equal(
        ray.intersectObject(root, true).length,
        0,
        `upper route remains open sky u=${u}`,
      );
    }
  }
  const crossing = track.frame(0.805 * track.length, -1);
  ray.set(
    crossing.p.clone().addScaledVector(crossing.up, -0.1),
    crossing.up.clone().negate(),
  );
  ray.far = 10;
  assert(
    ray.intersectObject(root.getObjectByName("whiteout-snowbridge-steel"))
      .length,
    "bridge has an actual structural soffit",
  );
});

test("complete road widths and 26 wu airspace clear all new scenery across both crossing decks", () => {
  const ray = new THREE.Raycaster();
  // Whole circuit catches nearby remote turns; dense fork sampling includes
  // the full envelope, not merely the centreline or mesh vertices.
  for (const f of roadSamples(3)) {
    const insideFork = f.branch !== 0;
    const xs = insideFork
      ? Array.from(
          {
            length:
              Math.ceil((f.bounds.wallMax - f.bounds.wallMin + 14) / 2) + 1,
          },
          (_, i) =>
            f.bounds.wallMin -
            7 +
            ((f.bounds.wallMax - f.bounds.wallMin + 14) * i) /
              Math.ceil((f.bounds.wallMax - f.bounds.wallMin + 14) / 2),
        )
      : [f.bounds.wallMin - 7, 0, f.bounds.wallMax + 7];
    for (const x of xs) {
      ray.set(
        f.p.clone().addScaledVector(f.right, x).addScaledVector(f.up, -2),
        f.up,
      );
      ray.far = 28;
      assert.equal(
        ray.intersectObject(root, true).length,
        0,
        `clear full road u=${f.u} branch=${f.branch} x=${x}`,
      );
    }
  }
});

test("gallery side walls are embedded in real terrain without pillars through the crossing", () => {
  for (const corners of root.userData.foundations)
    for (const p of corners)
      assert(
        p.y < terrain.heightAt(p.x, p.z),
        "actual rendered wall feet embed into terrain",
      );
  const ray = new THREE.Raycaster();
  for (let u = 0.796; u < 0.815; u += 0.001) {
    const lower = track.frame(u * track.length, 1);
    for (const x of [-lower.width - 7, 0, lower.width + 7]) {
      ray.set(
        lower.p
          .clone()
          .addScaledVector(lower.right, x)
          .addScaledVector(lower.up, -2),
        lower.up,
      );
      ray.far = 28;
      assert.equal(
        ray.intersectObject(root, true).length,
        0,
        "no snowbridge pillars obstruct lower route",
      );
    }
  }
  const meshes = root.children.filter((child) => child.isMesh);
  assert.equal(
    meshes.length,
    3,
    "three shared-material draws for the entire fork",
  );
  assert(
    meshes.reduce(
      (sum, mesh) => sum + mesh.geometry.attributes.position.count / 3,
      0,
    ) < 2500,
    "small static geometry budget",
  );
});

test("the gallery exterior has a faceted snowcap rather than a flat blue lintel", () => {
  const gallery = root.getObjectByName("whiteout-icecut-gallery");
  const ray = new THREE.Raycaster();
  const heights = [];
  const normals = [];
  for (const u of [0.798, 0.805, 0.812]) {
    const f = track.frame(u * track.length, 1);
    for (const x of [
      -f.width - 10,
      -f.width * 0.4,
      f.width * 0.3,
      f.width + 10,
    ]) {
      ray.set(
        f.p.clone().addScaledVector(f.right, x).addScaledVector(f.up, 45),
        f.up.clone().negate(),
      );
      ray.far = 16;
      const [hit] = ray.intersectObject(gallery);
      assert(hit, "solid exterior ice roof covers the gallery");
      heights.push(hit.point.clone().sub(f.p).dot(f.up));
      normals.push(Math.abs(hit.face.normal.dot(f.up)));
    }
  }
  assert(
    Math.max(...heights) - Math.min(...heights) > 2,
    "snow and ice form a visibly angular cross-section",
  );
  assert(
    normals.some((up) => up < 0.995),
    "rendered roof includes sloping ice facets",
  );
  assert(
    gallery.material.vertexColors,
    "ice facets retain their own subtle colors in the shared draw",
  );
});

test("Whiteout districts integrate the scenery without requiring a generic tunnel palette", () => {
  const scene = new THREE.Scene();
  buildNewCourseDistricts(
    scene,
    track,
    { concrete: new THREE.Texture() },
    environment,
  );
  assert(scene.getObjectByName("whiteout-snowbridge-icecut"));
  assert.equal(
    track.config.tunnel,
    null,
    "no generic tunnel classification or palette change",
  );
});
