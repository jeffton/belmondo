import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.SOURCE_URL || "http://127.0.0.1:5233";
const out = process.env.GANTRY_ARTIFACTS || "test-artifacts/dynamic-gantry";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const report = {
  method:
    "Bounded World/actual Race fixtures, seeded near timing gates; not human gameplay",
  cases: [],
  errors: [],
};
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1280, height: 720 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.route("**/__gantry_fixture__.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fonts/interface.css"><style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>',
      }),
    );
    await page.goto(`${url}/__gantry_fixture__.html`);
    await page.evaluate(async () => {
      const source = await (await fetch("/src/world.js")).text();
      const threePath = source.match(
        /from\s+["']([^"']*\/three\.js[^"']*)["']/,
      )[1];
      const [{ World }, { Race, CRAFT, LAPS }, { makeTrack }, THREE] =
        await Promise.all([
          import("/src/world.js"),
          import("/src/race.js"),
          import("/src/track.js"),
          import(threePath),
        ]);
      const world = new World(document.querySelector("canvas"));
      world.quality = "retro";
      let race, track;
      const errors = [];
      THREE.DefaultLoadingManager.onError = (path) => errors.push(path);
      const loaded = () =>
        new Promise((resolve) => {
          THREE.DefaultLoadingManager.onLoad = resolve;
        });
      window.gantryFixture = {
        async build(index) {
          const ready = loaded();
          track = makeTrack(index);
          world.build(track);
          race = new Race(track, 0, "trial");
          world.setupRacers(race, CRAFT);
          await ready;
          await Promise.all([
            document.fonts.load('700 208px "Belmondo Circuit"'),
            document.fonts.load('600 20px "Archivo"'),
          ]);
          await new Promise((resolve) => requestAnimationFrame(resolve));
          world.draw(race, 0);
          return { course: track.config.name, errors };
        },
        step(stage) {
          if (stage === "reset") race = new Race(track, 0, "trial");
          else if (typeof stage === "number") {
            while (race.countdown > stage)
              race.update(Math.min(1 / 120, race.countdown - stage), {});
          } else if (stage === "lap") {
            while (race.time < 1.3) race.update(1 / 120, {});
          } else if (stage === "last") {
            race.player.lap = LAPS;
          } else if (stage === "next" || stage === "finish") {
            const lap = stage === "next" ? 1 : LAPS;
            const p = race.player,
              s = lap * track.length - 1,
              frame = track.frame(s);
            p.lap = lap;
            p.s = p.contactS = s;
            p.gate = lap * 32;
            p.position.copy(frame.p);
            p.position.y += 2.2;
            p.velocity.copy(frame.tangent).multiplyScalar(50);
            p.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
            for (let i = 0; i < 120 && p.lap === lap; i++)
              race.update(1 / 120, {});
            if (p.lap !== lap + 1 || race.finished !== (stage === "finish"))
              throw new Error("Timing crossing failed");
          }
          world.draw(race, 0, stage === "demo");
          const display = world.startGantry.assembly.getObjectByName(
            "grid-signal-display",
          );
          const version = display.material.map.version;
          world.startGantry.update(race, stage === "demo");
          if (display.material.map.version !== version)
            throw new Error("Unchanged state uploaded a texture");
          return {
            stage,
            lap: race.player.lap,
            finished: race.finished,
            countdown: race.countdown,
            time: race.time,
            geometries: world.renderer.info.memory.geometries,
            textures: world.renderer.info.memory.textures,
            version,
          };
        },
        closeup() {
          const assembly = world.startGantry.assembly;
          const camera = new THREE.PerspectiveCamera(
            45,
            innerWidth / innerHeight,
            0.1,
            2000,
          );
          camera.position.copy(
            assembly.localToWorld(
              new THREE.Vector3(0, 10.5, innerWidth < 500 ? -68 : -30),
            ),
          );
          camera.lookAt(assembly.localToWorld(new THREE.Vector3(0, 10.5, 0)));
          world.renderer.render(world.scene, camera);
        },
        resources() {
          const display = world.startGantry.assembly.getObjectByName(
            "grid-signal-display",
          );
          const before = {
            geometries: world.renderer.info.memory.geometries,
            textures: world.renderer.info.memory.textures,
          };
          for (let i = 0; i < LAPS; i++) {
            race.player.lap = (i % LAPS) + 1;
            race.finished = false;
            world.draw(race, 0);
            world.draw(race, 0, true);
          }
          world.draw(race, 0);
          return {
            before,
            after: {
              geometries: world.renderer.info.memory.geometries,
              textures: world.renderer.info.memory.textures,
            },
            texture: display.material.map.uuid,
          };
        },
      };
    });
    for (let course = 0; course < 3; course++) {
      const prefix = `${mobile ? "mobile" : "desktop"}-course${course}`;
      const data = {
        profile: prefix,
        ...(await page.evaluate(
          (course) => window.gantryFixture.build(course),
          course,
        )),
        states: [],
      };
      for (const stage of [
        3,
        2,
        1,
        0,
        "lap",
        "next",
        "last",
        "finish",
        "demo",
        "reset",
      ]) {
        data.states.push(
          await page.evaluate(
            (stage) => window.gantryFixture.step(stage),
            stage,
          ),
        );
        if ([3, 0, "lap", "last", "finish"].includes(stage)) {
          await page.screenshot({
            path: `${out}/${prefix}-${stage}-chase.png`,
          });
          await page.evaluate(() => window.gantryFixture.closeup());
          await page.screenshot({
            path: `${out}/${prefix}-${stage}-board.png`,
          });
        }
      }
      // Resource loops must run after GO, not during the fresh reset countdown.
      await page.evaluate(() => {
        window.gantryFixture.step(0);
        window.gantryFixture.step("lap");
      });
      data.resources = await page.evaluate(() =>
        window.gantryFixture.resources(),
      );
      assert.deepEqual(data.resources.after, data.resources.before);
      assert.deepEqual(data.errors, []);
      report.cases.push(data);
    }
    await context.close();
  }
  assert.deepEqual(report.errors, []);
} finally {
  await browser.close();
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
