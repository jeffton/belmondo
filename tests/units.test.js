import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createCraft } from "../src/craft.ts";
import { WEAPON_UI } from "../src/weapon-ui.ts";
import { METRES_PER_UNIT, RAPTOR_LENGTH_UNITS } from "../src/units.ts";

test("missile briefing reports its lock range in physical metres", () => {
  assert.equal(WEAPON_UI.MISSILE.description, "Homing missile / 192 m lock");
});

test("six-metre reference matches RAPTOR's actual solid geometry, not its collider or exhaust", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const craft = createCraft(new THREE.Scene(), 0x3488ff, 1);
  const bounds = new THREE.Box3();
  for (const mesh of craft.children.filter(
    (child) => child.name !== "exhaust",
  )) {
    bounds.union(new THREE.Box3().setFromObject(mesh));
  }
  const length = bounds.max.z - bounds.min.z;
  assert.equal(length, RAPTOR_LENGTH_UNITS);
  assert.equal(length * METRES_PER_UNIT, 6);
});
