import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

// Real WebGL/main-loop/HUD integration; only race-state staging is test-injected.
// This is a deterministic crossing fixture, not a continuous jump trajectory.
const server = await createServer({
  server: { host: "127.0.0.1", port: 0, hmr: false },
});
await server.listen();
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/src/main.js*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}
      window.positionQA = {
        async prepare() {
          await selectTrack(4);
          await start({ currentTarget: document.querySelector('#start') });
          paused = true;
        },
        run(speedClass) {
          race = new Race(track, 1, 'race', speedClass, world.environment.terrain);
          race.countdown = 0;
          world.setupRacers(race, CRAFT);
          const gateS = track.finishS + track.length / 2;
          for (const r of race.racers) {
            const s = gateS - (r.id ? 20 + r.id * 5 : 0.5);
            const f = track.frame(s);
            Object.assign(r, { s, contactS: s, gate: 16, aiFire: Infinity });
            r.position.copy(f.p); r.position.y += 2.2;
            r.velocity.copy(f.tangent).multiplyScalar(240 * race.classSpec.pace);
            r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
            if (!r.id) {
              r.position.addScaledVector(f.right, 16.9);
              r.velocity.addScaledVector(f.right, 60 * race.classSpec.pace);
              r.grounded = false; r.flight = true;
            }
          }
          race.update(1 / 120, { throttle: 1 });
          const gate = race.player.gate;
          world.draw(race, 1 / 60); updateHUD(performance.now());
          const crossingHud = document.querySelector('#position').textContent;
          const p = race.player;
          const s = gateS + 130, f = track.frame(s);
          p.position.copy(f.p); p.position.y += 2.2; p.contactS = s;
          p.velocity.copy(f.tangent).multiplyScalar(240 * race.classSpec.pace);
          p.yaw = Math.atan2(f.tangent.x, f.tangent.z);
          p.grounded = true; p.flight = false; p.id = 8;
          for (let step = 0; step < 360; step++) race.update(1 / 120, {});
          world.draw(race, 1 / 60); updateHUD(performance.now());
          return { gate, position: race.position, hud: document.querySelector('#position').textContent,
            crossingHud, progress: p.s, contact: p.contactS, shield: p.shield,
            drawCalls: world.renderer.info.render.calls, triangles: world.renderer.info.render.triangles,
            glError: world.renderer.getContext().getError() };
        }
      };`,
    });
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.positionQA && window.nullVector);
  for (let click = 0; click < 5; click++)
    await page.locator(".wordmark").click();
  await page.evaluate(async () => {
    await positionQA.prepare();
    window.requestAnimationFrame = () => 0;
  });
  for (let speedClass = 0; speedClass < 3; speedClass++) {
    const result = await page.evaluate((c) => positionQA.run(c), speedClass);
    expect(result.gate).toBe(17);
    expect(result.position).toBe(1);
    expect(result.crossingHud).toBe("1/8");
    expect(result.hud).toBe("1/8");
    expect(result.shield).toBe(100);
    expect(result.drawCalls).toBeGreaterThan(0);
    expect(result.triangles).toBeGreaterThan(0);
    expect(result.glError).toBe(0);
    console.log({ speedClass, ...result });
  }
  expect(errors).toEqual([]);
  await page.close();
} finally {
  await browser.close();
  await server.close();
}
