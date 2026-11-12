import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createCraft } from "../src/craft.js";

test("all solid airframes fit physical contact bounds without degenerate or non-finite faces", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const scene = new THREE.Scene();
  for (let variant = 0; variant < 3; variant++) {
    const craft = createCraft(scene, 0xff6633, variant);
    for (const mesh of craft.children.filter(
      (child) => child.isMesh && child.name !== "exhaust",
    )) {
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(positions, i);
        assert(vertex.toArray().every(Number.isFinite));
        assert(
          Math.abs(vertex.x) <= 3.1001,
          `${craft.name}: width ${vertex.x}`,
        );
        assert(
          Math.abs(vertex.z) <= 4.2501,
          `${craft.name}: length ${vertex.z}`,
        );
      }
      if (mesh.geometry.index) continue;
      for (let i = 0; i < positions.count; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(positions, i);
        const b = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
        const c = new THREE.Vector3().fromBufferAttribute(positions, i + 2);
        assert(
          b.sub(a).cross(c.sub(a)).lengthSq() > 1e-14,
          `${craft.name}: degenerate ${mesh.name} face ${i / 3}`,
        );
      }
    }
    const exhausts = craft.children.filter((child) => child.name === "exhaust");
    assert.deepEqual(
      exhausts.map((flame) => flame.position.toArray()),
      [
        [-2.55, -0.08, -3.32],
        [2.55, -0.08, -3.32],
      ],
    );
    const slow = exhausts[0].scale.z;
    craft.userData.updateExhaust(220, true, 0);
    assert(exhausts[0].scale.z > slow * 3);
  }
});
