import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage();
  await page.route("**/__road_mesh_fixture__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><canvas></canvas>",
    }),
  );
  await page.goto("http://127.0.0.1:5178/__road_mesh_fixture__.html");
  const observations = await page.evaluate(async () => {
    const source = await (await fetch("/src/world.js")).text();
    const threePath = source.match(
      /from\s+["']([^"']*\/three\.js[^"']*)["']/,
    )[1];
    const [{ World }, { makeTrack }, THREE] = await Promise.all([
      import("/src/world.js"),
      import("/src/track.js"),
      import(threePath),
    ]);
    const world = new World(document.querySelector("canvas"));
    const results = [];
    for (let index = 0; index < 3; index++) {
      const track = makeTrack(index);
      world.build(track);
      world.scene.updateMatrixWorld(true);
      // Probe the actual shared seam near the last/first connected mesh
      // sections; testing only endpoint bounds misses interpolated cracks.
      const seamStations = [
        [0.325, 0.405],
        [0.326, 0.414],
        [0.3225, 0.4075],
      ][index];
      for (const u of seamStations) {
        const seam = track.bounds(u * track.length, -1).seam;
        if (!seam) throw new Error(`Expected a joined seam: ${index}/${u}`);
        for (const lateral of [-0.15, 0, 0.15]) {
          const f = track.frame(u * track.length);
          const origin = seam
            .clone()
            .addScaledVector(f.right, lateral)
            .add(new THREE.Vector3(0, 5, 0));
          const ray = new THREE.Raycaster(
            origin,
            new THREE.Vector3(0, -1, 0),
            0,
            6,
          );
          results.push({
            course: track.config.name,
            offset: `seam ${u}/${lateral}`,
            hits: ray.intersectObjects(world.scene.children, true).length,
            deck: true,
          });
        }
      }
      const end = track.config.split[1] * track.length;
      for (const offset of [-3, -2, -track.length / 3600, -0.5, 0.5, 2]) {
        const f = track.frame(end + offset);
        const origin = f.p
          .clone()
          .addScaledVector(f.right, -8)
          .addScaledVector(f.up, 0.8);
        // The joined deck is open across its centre, including where the
        // unequal branch widths merge into the main road. A vertical rail
        // crossing this ray is visible obstruction, even if physics ignores it.
        const ray = new THREE.Raycaster(origin, f.right, 0, 16);
        results.push({
          course: track.config.name,
          offset,
          hits: ray.intersectObjects(world.scene.children, true).length,
        });
      }
    }
    return results;
  });
  for (const { course, offset, hits, deck } of observations)
    if (deck) assert(hits > 0, `${course}: hole in joined deck at ${offset}`);
    else
      assert.equal(
        hits,
        0,
        `${course}: rail crosses merged deck at ${offset} m`,
      );
  console.log(`PASS: ${observations.length} rendered merge clearances`);
} finally {
  await browser.close();
}
