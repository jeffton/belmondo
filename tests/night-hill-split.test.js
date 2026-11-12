import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack } from "../src/track.js";
import { Race, CRAFT } from "../src/race.js";
import { createTerrain } from "../src/terrain.js";
import { buildCourseGeography } from "../src/course-geography.js";
import { projectRoad } from "../src/road-projection.js";

test("Night hill routes cross at two physical levels and return on opposite sides", () => {
  const track = makeTrack(2),
    L = track.length;
  assert.equal(track.config.layoutId, "noctilucent-4");
  for (const u of [0.3, 0.43]) {
    const delta = track.frame(u * L, 1).p.sub(track.frame(u * L, -1).p);
    assert.equal(
      Math.sign(delta.dot(track.frame(u * L).right)),
      u < 0.4 ? 1 : -1,
    );
  }
  const lower = track.frame(0.365 * L, -1),
    upper = track.frame(0.365 * L, 1);
  assert(Math.hypot(upper.p.x - lower.p.x, upper.p.z - lower.p.z) < 0.02);
  assert(upper.p.y - lower.p.y > 44.9);
  for (const branch of [-1, 1]) {
    assert.equal(track.bounds(0.365 * L, branch).connected, false);
    const f = track.frame(0.365 * L, branch);
    const position = f.p.clone().add(new THREE.Vector3(0, 2.2, 0));
    assert.equal(
      projectRoad(track, position, 0.365 * L, branch).branch,
      branch,
    );
    for (let i = 0; i <= 2000; i++) {
      const s = (0.28 + (0.17 * i) / 2000) * L;
      assert(
        1 / Math.abs(track.curvature(s, branch)) >= 150,
        "no hairpin curvature",
      );
    }
  }
  assert.equal(track.isTunnel(0.365 * L, -1), true);
  assert.equal(track.isTunnel(0.365 * L, 1), false);
  assert.equal(track.isTunnel(0.365 * L, 0), false);
  assert.equal(track.config.sections.crossings.length, 1);
  assert(track.config.sections.crossings[0].clearance > 100);
  assert.deepEqual(track.config.sections.runway, [0.46, 0.555]);
  assert.equal(track.config.ramp.start, 0.471);
  assert.equal(track.config.jump, 0.48);
});

test("Night mountain mesh has grounded feet and a clear genuine lower void beneath the upper road", () => {
  const track = makeTrack(2),
    terrain = createTerrain(track),
    scene = new THREE.Scene();
  const root = buildCourseGeography(
    scene,
    track,
    { edge: new THREE.Texture() },
    terrain,
  );
  root.updateMatrixWorld(true);
  const mountain = root.getObjectByName("bored-mountain-mass");
  assert(mountain);
  for (const foot of mountain.userData.groundingContacts)
    assert(Math.abs(foot.y - terrain.heightAt(foot.x, foot.z) + 1) < 0.001);
  const hillSupport = root.getObjectByName("hill-route-truss");
  assert(hillSupport.userData.groundingContacts.length > 0);
  for (const foot of hillSupport.userData.groundingContacts)
    assert(Math.abs(foot.y - terrain.heightAt(foot.x, foot.z) + 1) < 0.001);
  const ray = new THREE.Raycaster();
  for (const branch of [-1, 1]) {
    for (let i = 0; i <= 240; i++) {
      const u = 0.28 + (0.17 * i) / 240,
        f = track.frame(u * track.length, branch);
      for (let x = -f.width; x <= f.width; x += 2) {
        const point = f.p.clone().addScaledVector(f.right, x);
        assert(terrain.heightAt(point.x, point.z) <= point.y - 3.5);
        ray.set(
          point.clone().add(new THREE.Vector3(0, 0.2, 0)),
          new THREE.Vector3(0, 1, 0),
        );
        ray.far = 13;
        assert.equal(
          ray.intersectObject(root, true).length,
          0,
          `branch ${branch} u${u} x${x}: full geography must clear hull/chase space`,
        );
        if (branch === -1 && u > 0.342 && u < 0.388) {
          ray.far = 100;
          assert(
            ray.intersectObject(mountain).length > 0,
            "solid roof above real void",
          );
        }
      }
    }
  }
  terrain.geometries.forEach((g) => g.dispose());
});

test("actual physics earns both hill forks and following jump in every class, ordinary and boosted", () => {
  const track = makeTrack(2),
    terrain = createTerrain(track);
  for (let c = 0; c < 3; c++)
    for (const branch of [-1, 1])
      for (const boosted of [false, true]) {
        const race = new Race(track, c, "trial", c, terrain);
        race.countdown = 0;
        const r = race.player,
          pace = race.classSpec.pace;
        const s = 0.26 * track.length,
          f = track.frame(s);
        Object.assign(r, {
          id: branch === -1 ? 1 : 2,
          branch: 0,
          contactS: s,
          s,
          gate: Math.floor(0.26 * 32) + 1,
          checkpoint: { s, branch: 0, gate: Math.floor(0.26 * 32) + 1 },
          yaw: Math.atan2(f.tangent.x, f.tangent.z),
          aiFire: Infinity,
          surge: boosted ? 6 : 0,
        });
        r.position.copy(f.p);
        r.position.y += 2.2;
        r.velocity
          .copy(f.tangent)
          .multiplyScalar(CRAFT[c].speed * pace * (boosted ? 1.1 : 0.75));
        r.speed = r.velocity.length();
        let airborne = 0,
          landings = 0,
          previousGrounded = true,
          resets = 0;
        const recover = race.recover.bind(race);
        race.recover = (...args) => {
          resets++;
          return recover(...args);
        };
        for (
          let step = 0;
          step < 120 * 35 && r.contactS < 0.535 * track.length;
          step++
        ) {
          race.update(1 / 120, {});
          const u = r.contactS / track.length;
          if (u > 0.31 && u < 0.415)
            assert.equal(
              r.branch,
              branch,
              "fork choice and identity remain physical",
            );
          const gapEnd = track.config.jump + track.config.gapLength;
          if (track.gap(u) && !r.grounded) airborne++;
          if (u >= gapEnd && !previousGrounded && r.grounded) landings++;
          previousGrounded = r.grounded;
        }
        assert(
          r.contactS >= 0.535 * track.length,
          `c${c} branch${branch} boosted${boosted} completes`,
        );
        assert.equal(
          resets,
          0,
          `c${c} branch${branch} boosted${boosted} cannot recover`,
        );
        assert(r.shield > 50, "driveable without grinding through walls");
        assert(airborne > 0, "physical flight through following absent deck");
        assert(landings > 0, "actual jump landing, not skipping progression");
        assert.equal(r.lap, 1);
      }
  terrain.geometries.forEach((g) => g.dispose());
});
