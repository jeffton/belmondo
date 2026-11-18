import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage();
  await page.route("**/__gantryqa__.html", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<!doctype html><canvas></canvas>",
    }),
  );
  await page.goto("http://127.0.0.1:5198/__gantryqa__.html");
  console.log(
    JSON.stringify(
      await page.evaluate(async () => {
        const source = await (await fetch("/src/world.ts")).text();
        const three = source.match(
          /from\s+["']([^"']*\/three\.js[^"']*)["']/,
        )[1];
        const [{ World }, { makeTrack, TRACK_INDEX }, THREE] =
          await Promise.all([
            import("/src/world.ts"),
            import("/src/track.ts"),
            import(three),
          ]);
        const world = new World(document.createElement("canvas")),
          track = makeTrack(TRACK_INDEX.COAST);
        world.build(track);
        const g = world.scene.getObjectByName("fork-destination-board");
        world.scene.updateMatrixWorld(true);
        const near = { s: g.userData.station };
        let hits = 0,
          samples = 0;
        const ray = new THREE.Raycaster();
        for (const branch of [-1, 1])
          for (let ds = -3; ds <= 3; ds += 1) {
            const f = track.frame(near.s + ds, branch);
            for (let x = -f.width - 3; x <= f.width + 3; x += 1) {
              const origin = f.p
                .clone()
                .addScaledVector(f.right, x)
                .add(new THREE.Vector3(0, 0.1, 0));
              ray.set(origin, new THREE.Vector3(0, 1, 0));
              ray.far = 26;
              samples++;
              if (ray.intersectObject(g, true).length) hits++;
            }
          }
        const posts = g.children
          .filter((p) => p.name === "fork-destination-support")
          .map((p) => {
            const box = new THREE.Box3().setFromObject(p),
              c = box.getCenter(new THREE.Vector3());
            return {
              bottom: box.min.y,
              terrain: world.environment.terrain.heightAt(c.x, c.z),
              delta: box.min.y - world.environment.terrain.heightAt(c.x, c.z),
            };
          });
        if (hits)
          throw new Error(
            `Destination board obstructs ${hits}/${samples} racing-envelope rays`,
          );
        if (posts.some((p) => Math.abs(p.delta + 1) > 0.001))
          throw new Error("Destination board support is not grounded");
        return { samples, hits, posts, position: g.position.toArray(), near };
      }),
    ),
  );
} finally {
  await browser.close();
}
