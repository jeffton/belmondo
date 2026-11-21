import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 576 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.route("**/__fork_cues__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>",
    }),
  );
  await page.goto(`${server.resolvedUrls.local[0]}__fork_cues__.html`);
  await page.evaluate(async () => {
    const source = await (await fetch("/src/world.ts")).text();
    const threePath = source.match(
      /from\s+["']([^"']*\/three\.js[^"']*)["']/,
    )[1];
    const [{ World }, { Race, CRAFT }, { makeTrack }, { playerPilot }, THREE] =
      await Promise.all([
        import("/src/world.ts"),
        import("/src/race.ts"),
        import("/src/track.ts"),
        import("/tests/helpers/player-pilot.js"),
        import(threePath),
      ]);
    const world = new World(document.querySelector("canvas"));
    let track, race, fork, paintUniform;
    function pixels() {
      const gl = world.renderer.getContext();
      const bytes = new Uint8Array(
        gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
      );
      gl.readPixels(
        0,
        0,
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        bytes,
      );
      return bytes;
    }
    function place(player, s, branch, speed, lateral = 0) {
      const frame = track.frame(s, branch);
      player.s = player.contactS = s;
      player.branch = s >= track.config.split[0] * track.length ? branch : 0;
      player.gate = Math.floor((s / track.length) * 32) + 1;
      player.checkpoint = { s, branch: player.branch, gate: player.gate };
      player.position
        .copy(frame.p)
        .addScaledVector(frame.right, lateral)
        .addScaledVector(frame.up, 2.2);
      player.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
      player.pitch = -Math.asin(frame.tangent.y);
      player.speed = speed;
      player.velocity.copy(frame.tangent).multiplyScalar(speed);
    }
    window.fixture = {
      async course(index) {
        track = makeTrack(index);
        const loaded = new Promise((resolve, reject) => {
          THREE.DefaultLoadingManager.onLoad = resolve;
          THREE.DefaultLoadingManager.onError = reject;
        });
        fork = track.config.split[0] * track.length;
        while (track.bounds(fork, -1).connected) fork += 0.5;
        world.build(track);
        paintUniform = undefined;
        const road = world.scene.children.find((child) =>
          child.geometry?.hasAttribute("forkCueDistance"),
        );
        if (road) {
          const compile = road.material.onBeforeCompile.bind(road.material);
          const key = road.material.customProgramCacheKey();
          road.material.customProgramCacheKey = () => key;
          road.material.onBeforeCompile = (shader, renderer) => {
            compile(shader, renderer);
            paintUniform = shader.uniforms.forkCueWindow;
          };
        }
        race = new Race(track, 1, "trial", 1, world.environment.terrain);
        world.setupRacers(race, CRAFT);
        await loaded;
        return {
          name: track.config.name,
          signs: world.scene.children.filter(
            ({ name }) =>
              name === "split-warning" || name === "fork-destination-board",
          ).length,
        };
      },
      render(quality, offset, branch, lateral) {
        world.quality = quality;
        world.resize();
        const { player } = race;
        world.setView("chase");
        race.countdown = 0;
        place(player, fork + offset, branch, 155, lateral);
        world.camera.fov = 68 + player.speed * 0.085;
        world.camera.updateProjectionMatrix();
        world.draw(race, 1 / 60);
        return {
          pixels: world.renderer.domElement.width,
          calls: world.renderer.info.render.calls,
        };
      },
      visiblePaint() {
        world.renderer.render(world.scene, world.camera);
        const original = paintUniform.value;
        const enabled = pixels();
        paintUniform.value = new THREE.Vector3(-2, -1, 0);
        world.renderer.render(world.scene, world.camera);
        const disabled = pixels();
        paintUniform.value = original;
        return enabled.some(
          (channel, i) => Math.abs(channel - disabled[i]) > 2,
        );
      },
      drive(quality, branch) {
        world.quality = quality;
        world.resize();
        world.setView("chase");
        const trial = new Race(track, 1, "trial", 1, world.environment.terrain);
        trial.countdown = 0;
        world.setupRacers(trial, CRAFT);
        const { player } = trial;
        const start = fork - 255;
        place(
          player,
          start,
          branch,
          125,
          start < track.config.split[0] * track.length ? branch * 9 : 0,
        );
        let contact = false,
          rescue = false;
        let mark = -190;
        for (let step = 0; step < 840 && player.contactS < fork + 54; step++) {
          trial.update(1 / 120, playerPilot(track, player, branch, 1));
          contact ||= player.wallTouched;
          rescue ||= player.recoveredThisStep;
          if (player.contactS >= fork + mark) {
            world.draw(trial, 1 / 60);
            mark += 20;
          }
        }
        world.draw(trial, 1 / 60);
        return {
          contact,
          rescue,
          branch: player.branch,
          advance: player.contactS - fork,
        };
      },
    };
  });
  for (let index = 0; index < 8; index++) {
    const course = await page.evaluate(
      (index) => window.fixture.course(index),
      index,
    );
    assert.equal(
      course.signs,
      process.env.FORK_BASELINE ? ([0, 4].includes(index) ? 7 : 6) : 0,
      course.name,
    );
    for (const quality of ["retro", "high"]) {
      await page.setViewportSize(
        quality === "retro"
          ? { width: 430, height: 800 }
          : { width: 960, height: 576 },
      );
      for (const [view, offset, branch, lateral] of [
        ["point", -220, 0, -7],
        ["early", -145, 0, -7],
        ["approach", -125, 0, 0],
        ["decision", -55, 0, 0],
        ["nose", -23, 0, -7],
        ["negative", 24, -1, 0],
        ["positive", 24, 1, 0],
      ]) {
        const sample = await page.evaluate(
          (args) => window.fixture.render(...args),
          [quality, offset, branch, lateral],
        );
        assert.equal(sample.pixels, quality === "retro" ? 237 : 960);
        assert.ok(sample.calls > 0);
        if (process.env.FORK_CAPTURES)
          await page.screenshot({
            path: `${process.env.FORK_CAPTURES}/${index}-${quality}-${view}.png`,
          });
        if (
          (view === "decision" || (index === 0 && view === "point")) &&
          !process.env.FORK_BASELINE
        )
          assert.ok(
            await page.evaluate(() => window.fixture.visiblePaint()),
            `${course.name}: visible ${quality} paint`,
          );
      }
    }
    if (!process.env.FORK_BASELINE) {
      for (const quality of ["retro", "high"]) {
        await page.setViewportSize(
          quality === "retro"
            ? { width: 960, height: 576 }
            : { width: 430, height: 800 },
        );
        for (const branch of [-1, 1]) {
          const result = await page.evaluate(
            ([quality, branch]) => window.fixture.drive(quality, branch),
            [quality, branch],
          );
          assert.deepEqual(
            {
              contact: result.contact,
              rescue: result.rescue,
              branch: result.branch,
            },
            { contact: false, rescue: false, branch },
            course.name,
          );
          assert.ok(result.advance >= 54, course.name);
        }
      }
    }
    console.log(course.name);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
