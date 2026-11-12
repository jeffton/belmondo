import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { soundtrack } from "../src/soundtrack.js";

// Native media integration without constructing a WebGL scene.
const url = process.env.GAME_URL || "http://127.0.0.1:5178";
const browser = await chromium.launch({
  args: ["--no-sandbox", "--disable-gpu"],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__music-media-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<button id="start">Play</button><script type="module">
        import { MusicPlayer } from '/src/music.js';
        import { soundtrack } from '/src/soundtrack.js';
        window.player = new MusicPlayer(state => window.musicState = state);
        player.loadTracks(soundtrack, { shuffle: true });
        document.querySelector('button').onclick = () => player.play();
      </script>`,
    }),
  );
  await page.goto(`${url}/__music-media-test`);
  await page.waitForFunction(() => window.player?.current);
  await page.locator("#start").click();
  await page.waitForFunction(() => player.audio.currentTime > 0.1);
  const decoded = await page.evaluate(async (tracks) => {
    const results = [];
    for (const track of tracks) {
      const audio = new Audio(track.url);
      await new Promise((resolve, reject) => {
        audio.addEventListener("loadedmetadata", resolve, { once: true });
        audio.addEventListener("error", () => reject(new Error(track.name)), {
          once: true,
        });
        audio.load();
      });
      results.push({ name: track.name, duration: audio.duration });
      audio.removeAttribute("src");
      audio.load();
    }
    return results;
  }, soundtrack);
  assert.equal(decoded.length, 8);
  assert(
    decoded.every(({ duration }) => Number.isFinite(duration) && duration > 30),
  );

  const seen = new Set([await page.evaluate(() => player.audio.src)]);
  for (let i = 1; i <= soundtrack.length; i++) {
    const previous = await page.evaluate(() => player.audio.src);
    if (i === 1) {
      await page.evaluate(() => {
        player.audio.currentTime = player.audio.duration - 0.15;
      });
    } else {
      await page.evaluate(() => player.next());
    }
    await page.waitForFunction(
      (previous) =>
        player.audio.src !== previous && player.audio.currentTime > 0.05,
      previous,
    );
    const current = await page.evaluate(() => player.audio.src);
    if (i < soundtrack.length) {
      assert(!seen.has(current), "Default bag must not repeat a track");
      seen.add(current);
    } else {
      assert.notEqual(current, previous, "Bag boundary must not repeat");
    }
  }
  assert.equal(seen.size, 8);

  await page.evaluate(async (url) => {
    const bytes = await (await fetch(url)).arrayBuffer();
    await player.loadFiles([
      new File([bytes], "second.mp3", { type: "audio/mpeg" }),
      new File([bytes], "first.mp3", { type: "audio/mpeg" }),
    ]);
    await player.play();
  }, soundtrack[0].url);
  await page.waitForFunction(() => player.audio.currentTime > 0.05);
  assert.equal(await page.evaluate(() => musicState.name), "second.mp3");
  assert.equal(
    await page.evaluate(() => player.audio.src.startsWith("blob:")),
    true,
  );
  const localUrl = await page.evaluate(() => player.audio.src);
  await page.evaluate(() => player.next());
  await page.waitForFunction(() => player.audio.currentTime > 0.05);
  assert.equal(await page.evaluate(() => musicState.name), "first.mp3");
  await page.evaluate(() => player.next());
  assert.equal(await page.evaluate(() => musicState.name), "second.mp3");
  await page.evaluate(async () => {
    const { soundtrack } = await import("/src/soundtrack.js");
    player.loadTracks(soundtrack, { shuffle: true });
    await player.play();
  });
  await page.waitForFunction(() => player.audio.currentTime > 0.05);
  assert.equal(await page.evaluate(() => musicState.count), 8);
  assert.equal(
    await page.evaluate(() => player.audio.src.includes("/music/")),
    true,
  );
  assert.equal(
    await page.evaluate(async (url) => {
      try {
        await fetch(url);
        return false;
      } catch {
        return true;
      }
    }, localUrl),
    true,
    "Replacing local files revokes their object URLs",
  );
  await page.evaluate(() => player.pause());
  assert.equal(await page.evaluate(() => player.audio.paused), true);
  await page.evaluate(() => player.play());
  await page.waitForFunction(() => !player.audio.paused);
  assert.equal(await page.evaluate(() => musicState.error), null);
  await page.evaluate(() => player.dispose());
  assert.equal(
    await page.evaluate(() => player.audio.paused && !player.current),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        decoded,
        checks: [
          "native playback",
          "native ended advancement",
          "8 unique tracks per bag",
          "no seam repeat",
          "ordered local override",
          "OST restore",
          "object URL revocation",
          "pause/resume/dispose",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
