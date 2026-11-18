import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildHull, createCraft } from "../src/craft.ts";
import {
  contactHull,
  craftSupport,
  writeCraftVertices,
} from "../src/contacts.ts";

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
    const idle = exhausts[0].scale.z;
    craft.userData.updateExhaust(220, false, 0);
    const cruise = exhausts[0].scale.z;
    assert(cruise > 3 * idle);
    craft.userData.updateExhaust(220, true, 0);
    assert(exhausts[0].scale.z > cruise);
    for (const flame of exhausts) {
      flame.geometry.computeBoundingBox();
      const length = -flame.geometry.boundingBox.min.z * flame.scale.z;
      assert(length < 4, "nozzle exhaust stays local even under boost");
      assert(flame.material.opacity < 0.5);
    }
  }
});

test("pitched deck contact matches the solid visible hull, not empty box corners", () => {
  for (let craft = 0; craft < 3; craft++) {
    const geometries = Object.values(buildHull(craft));
    try {
      for (const [yaw, pitch] of [
        [0, 0],
        [0.8, 0.45],
        [-0.3, -0.25],
      ]) {
        const rotation = new THREE.Euler(pitch, yaw, 0, "YXZ");
        const hull = contactHull(craft);
        const posed = hull.points.map(() => new THREE.Vector3());
        writeCraftVertices({ craft, yaw, pitch }, posed);
        for (const normal of [
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(0.2, 1, -0.1).normalize(),
        ]) {
          let minimum = Infinity;
          for (const geometry of geometries) {
            const positions = geometry.attributes.position;
            for (let i = 0; i < positions.count; i++)
              minimum = Math.min(
                minimum,
                new THREE.Vector3()
                  .fromBufferAttribute(positions, i)
                  .applyEuler(rotation)
                  .dot(normal),
              );
          }
          assert(
            Math.abs(craftSupport({ craft, yaw, pitch }, normal) + minimum) <
              1e-10,
          );
          assert(
            Math.abs(
              Math.min(...posed.map((point) => point.dot(normal))) - minimum,
            ) < 1e-10,
            "the swept vertices match the real rotated hull",
          );
          assert(
            posed.every((point) => point.length() <= hull.radius + 1e-10),
            "the collision sphere contains the asymmetric rotated hull",
          );
        }
      }
    } finally {
      geometries.forEach((geometry) => geometry.dispose());
    }
  }
});
