import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goToSetupStage } from "./helpers/setup-menu.mjs";

const noGPU = process.env.MUSIC_NO_GPU === "1";
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
// Native fresh Chrome: no Playwright launch defaults or autoplay grants.
// Run with xvfb-run on Linux.
const profile = await mkdtemp(join(tmpdir(), "belmondo-menu-music-"));
const chrome = spawn(
  chromium.executablePath(),
  [
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    ...(noGPU
      ? ["--disable-gpu", "--disable-software-rasterizer"]
      : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
const endpoint = await new Promise((resolve, reject) => {
  let output = "";
  chrome.stderr.on("data", (chunk) => {
    output += chunk;
    const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
    if (match) resolve(match[1]);
  });
  chrome.on("error", reject);
  chrome.on("exit", (code) => reject(new Error(`Chrome exited ${code}`)));
});
const browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
try {
  for (const firstAction of ["class", "keyboard", "track", "craft"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await (
      await context.newCDPSession(page)
    ).send("Emulation.setFocusEmulationEnabled", { enabled: false });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (noGPU) {
      await page.addInitScript(() => {
        window.requestAnimationFrame = () => 0;
      });
      await page.route("**/src/world.js", (route) =>
        route.fulfill({
          contentType: "text/javascript",
          body: `export class World {
            environment = { terrain: undefined }; view = 'chase';
            build() {} setupRacers() {} resize() {}
            async prepare(track, _prepared, isCurrent, setup) {
              const candidate = new World();
              candidate.build(track);
              setup(candidate);
              return isCurrent() ? candidate : null;
            }
            adopt(candidate) { Object.assign(this, candidate); }
          }`,
        }),
      );
      await page.route("**/src/course-preparation.js**", (route) =>
        route.fulfill({
          contentType: "text/javascript",
          body: `export class CoursePreparation {
            async load() { return { workerMs: 0 }; }
            cancel() {}
          }`,
        }),
      );
      await page.route("**/src/menu-preview.js", (route) =>
        route.fulfill({
          contentType: "text/javascript",
          body: `export class MenuPreview {
            classModel = { rotation: { y: 0 } };
            setStage() {} setClass() {} setTrack() {} setCraft() {}
          }`,
        }),
      );
      await page.route("**/src/audio.js", (route) =>
        route.fulfill({
          contentType: "text/javascript",
          body: `export class AudioEngine {
            async start() {} setMuted() {} setPaused() {} setVolume() {}
            stopSamples() {} stopCrowd() {}
          }`,
        }),
      );
    }
    await page.route("**/src/main.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${await response.text()}\nwindow.menuMusicQA = {
          read: () => ({ paused: music.audio.paused, src: music.audio.src,
            time: music.audio.currentTime, scene: music.sceneGain?.gain.value,
            volume: music.volume, context: music.context?.state, state, error: music.error }),
          stage: setMenuStage,
          blockedPlay: (async () => {
            const audio = new Audio(music.audio.src);
            try { await audio.play(); audio.pause(); return 'allowed'; }
            catch (error) { return error.name; }
          })()
        };`,
      });
    });
    await page.goto(server.resolvedUrls.local[0]);
    await page.bringToFront();
    await page.waitForFunction(() => window.menuMusicQA);
    const read = () => page.evaluate(() => window.menuMusicQA.read());
    assert.equal((await read()).paused, true);
    assert.equal(
      await page.evaluate(() => window.menuMusicQA.blockedPlay),
      "NotAllowedError",
      "fresh profile must enforce normal autoplay policy",
    );
    // Programmatic setup/selection must not unlock playback.
    const stage = firstAction === "keyboard" ? "class" : firstAction;
    await page.evaluate(
      (value) => window.menuMusicQA.stage(value, false),
      stage,
    );
    await page.evaluate(() => document.querySelector("#crafts button").click());
    assert.equal((await read()).paused, true);
    if (firstAction === "keyboard") {
      await page.locator('input[name="speed-class"]').first().focus();
      await page.keyboard.press("ArrowRight");
    } else if (firstAction === "class") {
      await page.locator("#speed-class label").nth(1).click();
    } else {
      await page
        .locator(firstAction === "track" ? "#tracks button" : "#crafts button")
        .first()
        .click();
    }
    const wait = (fn, arg) => page.waitForFunction(fn, arg, { polling: 100 });
    await wait(() => window.menuMusicQA.read().time > 0.15);
    const menu = await read();
    assert.equal(menu.state, "menu");
    assert.equal(menu.paused, false);
    assert(Math.abs(menu.scene - 0.35) < 0.001);
    assert.equal(menu.volume, 0.65);
    assert.equal(menu.error, null);
    assert.equal(menu.context, "running");

    if (firstAction === "class") {
      // Exercise focus reconciliation without replacing the native media graph.
      const focus = (active) =>
        page.evaluate((value) => {
          Object.defineProperty(document, "hasFocus", {
            configurable: true,
            value: () => value,
          });
          window.dispatchEvent(new Event(value ? "focus" : "blur"));
        }, active);
      await focus(false);
      await wait(() => window.menuMusicQA.read().paused);
      const stopped = await read();
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal((await read()).time, stopped.time);
      await focus(true);
      assert((await read()).time >= stopped.time);
      await wait(() => !window.menuMusicQA.read().paused);
      await wait((time) => window.menuMusicQA.read().time > time, stopped.time);
      assert.equal((await read()).src, menu.src);
      assert(Math.abs((await read()).scene - 0.35) < 0.001);
      await goToSetupStage(page, "craft");
      const beforeRace = await read();
      await page.locator("#start").click();
      await wait(() => window.menuMusicQA.read().state === "race");
      assert((await read()).time >= beforeRace.time);
      await wait(() => window.menuMusicQA.read().scene > 0.99);
      assert.equal((await read()).src, menu.src);
      await page.keyboard.press("Escape");
      const beforeQuit = await read();
      await page.locator("#quit").click();
      assert((await read()).time >= beforeQuit.time);
      await wait(() => window.menuMusicQA.read().scene <= 0.351);
      const returned = await read();
      assert.equal(returned.state, "menu");
      assert.equal(returned.src, menu.src);
      assert(returned.time > menu.time);
      await page.locator("#music-open").click();
      await page.locator("#music-play").click();
      await page.locator("#volume").fill("0");
      const paused = await read();
      assert.equal(paused.paused, true);
      assert.equal(paused.volume, 0);
      await page.locator("#music-dialog .close").click();
      await goToSetupStage(page, "class");
      await page.locator("#speed-class label").first().click();
      assert.equal((await read()).paused, true);
      assert.equal((await read()).time, paused.time);
      assert.equal((await read()).volume, 0);
      await focus(false);
      await focus(true);
      assert.equal((await read()).paused, true);
      assert.equal((await read()).time, paused.time);
    }
    assert.deepEqual(errors, []);
    console.log(
      `PASS fresh ${firstAction} menu action${noGPU ? " (media-only)" : ""}`,
    );
    await context.close();
  }
} finally {
  await browser.close();
  chrome.kill("SIGTERM");
  await server.close();
}
