import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

// Standalone production-world fixture: place a racer on each new pad's approach.
// No production telemetry or gameplay controls are modified.
const url = process.env.SOURCE_URL || "http://127.0.0.1:5186";
const index = Number(process.env.BOOST_TRACK || 1);
const additions = { 1: 0.968, 2: 0.79, 4: 0.205, 5: 0.465 };
const artifacts = "test-artifacts/boost-placements";
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__boost_fixture__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>html,body{margin:0;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>",
    }),
  );
  await page.goto(`${url}/__boost_fixture__.html`);
  const result = await page.evaluate(
    async ({ index, u }) => {
      const [{ World }, { Race, CRAFT }, { makeTrack }, { getTrackPickups }] =
        await Promise.all([
          import("/src/world.js"),
          import("/src/race.js"),
          import("/src/track.js"),
          import("/src/pickups.js"),
        ]);
      const track = makeTrack(index);
      const race = new Race(track, 0, "race");
      const world = new World(document.querySelector("canvas"));
      world.quality = "retro";
      world.resize();
      world.build(track);
      world.setupRacers(race, CRAFT);
      const pad = getTrackPickups(track).find((p) => p.u === u);
      const s = pad.s - 65;
      const frame = track.frame(s);
      const r = race.player;
      r.s = r.contactS = s;
      r.branch = 0;
      r.position.copy(frame.p).addScaledVector(frame.right, pad.lateral);
      r.position.y += 2.2;
      r.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
      r.velocity.copy(frame.tangent).multiplyScalar(90);
      r.speed = 90;
      r.grounded = true;
      for (let i = 0; i < 30; i++) world.draw(race, 1 / 60, false);
      const projected = pad.center.clone().project(world.camera);
      const meshes = world.scene.children.filter((m) =>
        m.name?.startsWith("track-pads-"),
      );
      return {
        name: track.config.name,
        u,
        lateral: pad.lateral,
        purpose: pad.purpose,
        projected: projected.toArray(),
        drawCalls: world.renderer.info.render.calls,
        triangles: world.renderer.info.render.triangles,
        padMeshes: meshes.length,
        padVertices: meshes.reduce(
          (n, m) => n + m.geometry.getAttribute("position").count,
          0,
        ),
      };
    },
    { index, u: additions[index] },
  );
  expect(Math.abs(result.projected[0])).toBeLessThan(1);
  expect(Math.abs(result.projected[1])).toBeLessThan(1);
  expect(result.projected[2]).toBeLessThan(1);
  expect(result.drawCalls).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `${artifacts}/${index}-approach.png` });
  await writeFile(
    `${artifacts}/${index}.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
