import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { createAdvertising } from "../src/advertising.js";
import { ROADSIDE_ART } from "../src/advertising-art.js";

const artPath = new URL("../public/art/", import.meta.url);

test("generated board matches provenance and declared texture dimensions", () => {
  const bytes = readFileSync(
    new URL("belmondo-graphic-campaigns.png", artPath),
  );
  const provenance = JSON.parse(
    readFileSync(
      new URL("belmondo-graphic-campaigns.provenance.json", artPath),
    ),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    provenance.sha256,
  );
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  assert.equal(bytes.readUInt32BE(16), ROADSIDE_ART.width);
  assert.equal(bytes.readUInt32BE(20), ROADSIDE_ART.height);
  // One 2170×725 board including its mip chain is below the old 4096×768 board.
  assert(ROADSIDE_ART.width * ROADSIDE_ART.height < 4096 * 768);
});

test("all campaign faces sample their own artwork, not presentation margins, in one texture batch", () => {
  const load = THREE.TextureLoader.prototype.load;
  const loaded = [];
  THREE.TextureLoader.prototype.load = function (url) {
    loaded.push(url);
    return new THREE.Texture();
  };
  const scene = new THREE.Scene();
  try {
    const ads = createAdvertising(
      scene,
      ROADSIDE_ART.url,
      ROADSIDE_ART.columns,
      ROADSIDE_ART.rows,
      ROADSIDE_ART.region,
      true,
    );
    for (let brand = 0; brand < 8; brand++)
      ads.facade(new THREE.Vector3(brand * 20, 10, 0), 0, 16, brand, 6);
    ads.finish();
    scene.updateMatrixWorld(true);
    const hits = new THREE.Raycaster(
      new THREE.Vector3(0, 10, 20),
      new THREE.Vector3(0, 0, -1),
    ).intersectObjects(scene.children, true);
    assert(hits.length, "campaign face must be visible to approaching racers");
    assert(
      hits[0].object.material.map,
      "artwork must sit ahead of its opaque housing",
    );
    assert.deepEqual(loaded, [ROADSIDE_ART.url]);
    const panels = scene.children[0].children.filter(
      (mesh) => !mesh.isInstancedMesh,
    );
    assert.equal(panels.length, 1, "a spatial chunk shares one campaign draw");
    const uv = panels[0].geometry.attributes.uv;
    assert.equal(panels[0].geometry.attributes.position.count, 8 * 6);
    for (let brand = 0; brand < 8; brand++) {
      const column = brand % 4;
      const row = Math.floor(brand / 4);
      for (let i = brand * 6; i < (brand + 1) * 6; i++) {
        const x = uv.getX(i) * 2170;
        const y = (1 - uv.getY(i)) * 725;
        assert(x > (column * 2170) / 4 && x < ((column + 1) * 2170) / 4);
        assert(y > 160 + row * 203 && y < 160 + (row + 1) * 203);
      }
    }
    const details = scene.children[0].children.filter(
      (mesh) => mesh.isInstancedMesh,
    );
    assert.equal(
      details.reduce((sum, mesh) => sum + mesh.count, 0),
      8 * 5,
    );
    assert.equal(new Set(panels.map((mesh) => mesh.material.map)).size, 1);
  } finally {
    THREE.TextureLoader.prototype.load = load;
    scene.traverse((object) => {
      object.geometry?.dispose();
      object.material?.map?.dispose();
      object.material?.dispose();
    });
  }
});
