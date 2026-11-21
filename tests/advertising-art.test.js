import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { createAdvertising } from "../src/advertising.ts";
import { courseAdvertisingArt } from "../src/advertising-art.ts";
import { TRACKS } from "../src/track.ts";

const artPath = new URL("../public/art/", import.meta.url);

function assertWebp(path, hash, size) {
  const bytes = readFileSync(new URL(path, artPath));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 16), "WEBPVP8 ");
  assert.deepEqual(
    [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff],
    size,
  );
}

test("each course ships a unique local atlas with fewer texels than the former shared atlas", () => {
  const { outputs } = JSON.parse(
    readFileSync(
      new URL("../src/course-billboard-provenance.json", import.meta.url),
    ),
  );
  const courses = TRACKS.map(({ name }) => courseAdvertisingArt(name));
  const urls = courses.map(({ url }) => new URL(url, "https://example.test"));
  const files = urls.map(({ pathname }) => pathname.split("/").at(-1));
  assert.deepEqual(files.toSorted(), Object.keys(outputs).toSorted());
  assert.equal(new Set(Object.values(outputs)).size, courses.length);
  courses.forEach(({ width, height, columns, rows, rails }, index) => {
    const name = files[index];
    assertWebp(`course-billboards/${name}`, outputs[name], [width, height]);
    assert.equal(urls[index].searchParams.get("v"), outputs[name]);
    assert.equal(rails.length, columns * rows);
    assert(width * height < 1024 * 844);
  });
});

test("waterfront tenant plaque atlas matches provenance", () => {
  const name = "kaiseki-tenant-plaques.webp";
  const { outputs } = JSON.parse(
    readFileSync(new URL("kaiseki-tenant-plaques.provenance.json", artPath)),
  );
  assertWebp(name, outputs[name], [512, 512]);
});

test("all local campaign faces sample their own artwork in one texture batch", () => {
  const load = THREE.TextureLoader.prototype.load;
  const loaded = [];
  THREE.TextureLoader.prototype.load = function (url) {
    loaded.push(url);
    return new THREE.Texture();
  };
  const scene = new THREE.Scene();
  const art = courseAdvertisingArt("PALM BREAKER");
  const faces = art.columns * art.rows;
  try {
    const ads = createAdvertising(
      scene,
      art.url,
      art.columns,
      art.rows,
      art.region,
      true,
      art.rails,
    );
    for (let brand = 0; brand < faces; brand++)
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
      "artwork sits ahead of its opaque housing",
    );
    assert.deepEqual(loaded, [art.url]);
    const panels = scene.children[0].children.filter(
      (mesh) => !mesh.isInstancedMesh,
    );
    assert.equal(panels.length, 1, "a spatial chunk shares one campaign draw");
    const uv = panels[0].geometry.attributes.uv;
    assert.equal(panels[0].geometry.attributes.position.count, faces * 6);
    for (let brand = 0; brand < faces; brand++) {
      const column = brand % art.columns;
      const row = Math.floor(brand / art.columns);
      for (let i = brand * 6; i < (brand + 1) * 6; i++) {
        const x = uv.getX(i) * art.columns;
        const y = (1 - uv.getY(i)) * art.rows;
        assert(x > column && x < column + 1);
        assert(y > row && y < row + 1);
      }
    }
    const details = scene.children[0].children.filter(
      (mesh) => mesh.isInstancedMesh,
    );
    assert.equal(
      details.reduce((sum, mesh) => sum + mesh.count, 0),
      faces * 5,
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
