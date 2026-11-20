import assert from "node:assert/strict";
import test from "node:test";
import { Box3, Matrix4, Raycaster, Vector3 } from "three";
import { OBB } from "three/addons/math/OBB.js";
import {
  buildElevatedStructure,
  elevatedDesign,
} from "../src/elevated-structures.ts";
import { createTerrain } from "../src/terrain.ts";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";

const courses = new Map([
  [TRACK_INDEX.COAST, "inlet-causeway"],
  [TRACK_INDEX.WHITEOUT, "glacier-ravine-lattice"],
  [TRACK_INDEX.CINDERLINE, "caldera-haul-trestle"],
]);

test("only the three authored spans replace ordinary course supports", () => {
  for (const index of Object.values(TRACK_INDEX)) {
    const track = makeTrack(index);
    assert.equal(elevatedDesign(track)?.name, courses.get(index));
  }
});

for (const [index, name] of courses) {
  test(`${name} foundations sit in terrain and its beams leave every racing corridor open`, () => {
    const track = makeTrack(index);
    const terrain = createTerrain(track);
    const structure = buildElevatedStructure(track, terrain);
    assert.equal(structure.name, name);
    const contacts = structure.userData.groundingContacts;
    assert.ok(contacts.length > 0);
    for (const p of contacts)
      assert.ok(p.y <= terrain.heightAt(p.x, p.z) - 2 + 1e-6);

    const unitBox = new Box3(
      new Vector3(-0.5, -0.5, -0.5),
      new Vector3(0.5, 0.5, 0.5),
    );
    const matrix = new Matrix4();
    const members = structure.children.flatMap((mesh) =>
      Array.from({ length: mesh.count }, (_, i) => {
        mesh.getMatrixAt(i, matrix);
        return new OBB().fromBox3(unitBox).applyMatrix4(matrix);
      }),
    );
    // A load-bearing top flange meets the rendered deck, not just its piers.
    structure.updateMatrixWorld(true);
    const design = elevatedDesign(track);
    const [start, end] = design.range;
    const panels = Math.ceil(((end - start) * track.length) / 28);
    const girderOffset = {
      "inlet-causeway": 13,
      "glacier-ravine-lattice": 15,
      "caldera-haul-trestle": 16,
    }[name];
    for (let panel = 0; panel < panels; panel++) {
      const u = start + ((end - start) * (panel + 0.5)) / panels;
      const f = track.frame(u * track.length, design.branch);
      for (const side of [-1, 1]) {
        const origin = f.p
          .clone()
          .addScaledVector(f.right, side * girderOffset);
        const ray = new Raycaster(origin, f.up.clone().negate(), 0, 2);
        assert.ok(
          ray.intersectObject(structure).length,
          `girder detached from deck at ${u}`,
        );
      }
    }

    const step = 3;
    const axes = new Matrix4();
    for (let s = 0; s < track.length; s += step) {
      const u = s / track.length;
      if (track.gap(u)) continue;
      const [fork, merge] = track.config.split;
      for (const branch of u > fork && u < merge ? [-1, 1] : [0]) {
        const f = track.frame(s, branch);
        // Test the deck, craft height and neighboring routes (including below).
        axes.makeBasis(f.right, f.up, f.tangent);
        const envelope = new OBB().fromBox3(
          new Box3(
            new Vector3(-f.width, 0, -step * 0.6),
            new Vector3(f.width, 10, step * 0.6),
          ),
        );
        // OBB.applyMatrix4 doesn't rotate a non-zero center about the origin.
        envelope.center.set(0, 0, 0);
        envelope.applyMatrix4(
          axes.setPosition(f.p.clone().addScaledVector(f.up, 5)),
        );
        for (const member of members) {
          if (
            member.center.distanceToSquared(envelope.center) >
            (member.halfSize.length() + envelope.halfSize.length()) ** 2
          )
            continue;
          assert.ok(
            !member.intersectsOBB(envelope),
            `beam at ${member.center.toArray()} intersects branch ${branch} near ${u.toFixed(4)}`,
          );
        }
      }
    }
  });
}
