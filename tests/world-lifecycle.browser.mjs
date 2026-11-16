import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// Real World GPU/resource lifetime, independent of historical screenshot audits.
const url = process.env.SOURCE_URL || "http://127.0.0.1:5178";
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__world_lifecycle__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><canvas></canvas>",
    }),
  );
  await page.goto(`${url}/__world_lifecycle__.html`);
  const report = await page.evaluate(async () => {
    const [{ World }, { Race, CRAFT }, { makeTrack, TRACK_INDEX }] =
      await Promise.all([
        import("/src/world.ts"),
        import("/src/race.ts"),
        import("/src/track.ts"),
      ]);
    const THREE = await import("/node_modules/.vite/deps/three.js");
    const loaded = new Promise((resolve, reject) => {
      THREE.DefaultLoadingManager.onLoad = resolve;
      THREE.DefaultLoadingManager.onError = (asset) => reject(new Error(asset));
    });
    const world = new World(document.querySelector("canvas"));
    let track = makeTrack(TRACK_INDEX.COAST);
    world.build(track);
    const reset = (craft) => {
      const race = new Race(track, craft, "race");
      world.setupRacers(race, CRAFT);
      world.draw(race, 1 / 60);
    };
    reset(0);
    await loaded;
    const lifecycle = [];
    for (let i = 0; i < 5; i++) {
      const previousShips = [...world.ships];
      world.sparkData[0].life = 1;
      reset(i % CRAFT.length);
      const geometries = new Set();
      world.scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
      });
      lifecycle.push({
        children: world.scene.children.length,
        geometries: geometries.size,
        gpuGeometries: world.renderer.info.memory.geometries,
        ships: world.ships.length,
        oldDetached: previousShips.every(
          (ship) =>
            ship.parent === null && ship.userData.shadow.parent === null,
        ),
        sparksReset: world.sparkData.every((particle) => particle.life === 0),
      });
    }
    const assets = Object.values(world.flagshipAssets);
    const rebuilds = [];
    for (const index of [
      TRACK_INDEX.FAULTLINE,
      TRACK_INDEX.COAST,
      TRACK_INDEX.FAULTLINE,
      TRACK_INDEX.COAST,
    ]) {
      track = makeTrack(index);
      world.build(track);
      reset(0);
      rebuilds.push({
        coast: !!world.scene.getObjectByName("kaiseki-waterfront"),
        excavator: !!world.scene.getObjectByName("faultline-excavator"),
        gpuGeometries: world.renderer.info.memory.geometries,
        gpuTextures: world.renderer.info.memory.textures,
        sameTextures: Object.values(world.flagshipAssets).every(
          (map, i) => map === assets[i],
        ),
        imagesLoaded: assets.every((map) => map.image.width > 0),
      });
    }
    world.renderer.dispose();
    return { lifecycle, rebuilds };
  });
  for (const field of ["children", "geometries", "gpuGeometries"])
    assert.equal(new Set(report.lifecycle.map((row) => row[field])).size, 1);
  for (const row of report.lifecycle) {
    assert.equal(row.ships, 8);
    assert.equal(row.oldDetached, true);
    assert.equal(row.sparksReset, true);
  }
  for (const [index, row] of report.rebuilds.entries()) {
    assert.equal(row.coast, index % 2 === 1);
    assert.equal(row.excavator, index % 2 === 0);
    assert.equal(row.sameTextures, true);
    assert.equal(row.imagesLoaded, true);
  }
  for (const index of [0, 1]) {
    assert.equal(
      report.rebuilds[index + 2].gpuGeometries,
      report.rebuilds[index].gpuGeometries,
    );
    assert.equal(
      report.rebuilds[index + 2].gpuTextures,
      report.rebuilds[index].gpuTextures,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS World restart/rebuild: stable resources, detached ships, reset sparks, persistent loaded textures",
  );
} finally {
  await browser.close();
}
