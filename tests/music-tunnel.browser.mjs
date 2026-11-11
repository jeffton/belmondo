import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const url = process.env.GAME_URL || "http://127.0.0.1:5178";
const browser = await chromium.launch({
  args: ["--no-sandbox", "--disable-gpu"],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__music_tunnel", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<button>Play</button><script type="module">
      import { MusicPlayer } from '/src/music.js';
      import { soundtrack } from '/src/soundtrack.js';
      window.player = new MusicPlayer(state => window.musicState = state);
      player.volume = .65;
      player.loadTracks(soundtrack);
      document.querySelector('button').onclick = () => player.play();
    </script>`,
    }),
  );
  await page.goto(`${url}/__music_tunnel`);
  await page.waitForFunction(() => window.player?.current);
  await page.locator("button").click();
  await page.waitForFunction(() => player.audio.currentTime > 0.15);
  async function sample(node) {
    return page.evaluate(async (name) => {
      const analyser = player.context.createAnalyser();
      analyser.fftSize = 2048;
      const node = player[name];
      node.connect(analyser);
      const values = new Float32Array(analyser.fftSize);
      const rms = [];
      for (let i = 0; i < 8; i++) {
        await new Promise((resolve) => setTimeout(resolve, 32));
        analyser.getFloatTimeDomainData(values);
        rms.push(
          Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length),
        );
      }
      node.disconnect(analyser);
      analyser.disconnect();
      return Math.max(...rms);
    }, node);
  }
  const dryOutside = await sample("output");
  const wetOutside = await sample("wet");
  assert(dryOutside > 0.001, "Default MP3 has real audible output");
  assert.equal(wetOutside, 0, "Outside signal is entirely dry");
  await page.evaluate(() => player.setTunnel(true));
  const entrance = await page.evaluate(() => player.wet.gain.value);
  assert(entrance < 0.11, "Entrance ramps rather than jumping to full echo");
  await page.waitForFunction(() => player.wet.gain.value > 0.109);
  const wetInside = await sample("wet");
  assert(wetInside > 0.0001, "Default MP3 produces a measured tunnel echo");
  const context = await page.evaluate(() => {
    window.originalMusicContext = player.context;
    window.originalMediaSource = player.source;
    return {
      state: player.context.state,
      delay: player.delay.delayTime.value,
      feedback: player.feedback.gain.value,
    };
  });
  assert(Math.abs(context.delay - 0.145) < 0.001);
  assert.equal(context.feedback, 0.25);
  await page.evaluate(() => player.pause());
  await page.waitForFunction(() => player.output.gain.value === 0);
  assert.equal(await sample("output"), 0, "Pause silences delayed tails too");
  await page.evaluate(() => player.play());
  await page.waitForFunction(
    () => player.audio.currentTime > 0.5 && !player.audio.paused,
  );
  await page.evaluate(() => (player.volume = 0));
  await page.waitForFunction(() => player.output.gain.value === 0);
  assert.equal(
    await sample("output"),
    0,
    "Zero music volume silences dry and echo paths",
  );
  await page.evaluate(() => (player.volume = 0.31));
  await page.waitForFunction(
    () => Math.abs(player.output.gain.value - 0.31) < 0.0001,
  );
  await page.evaluate(() => player.setTunnel(false));
  const exit = await page.evaluate(() => player.wet.gain.value);
  assert(exit > 0, "Exit fades smoothly");
  await page.waitForFunction(() => player.wet.gain.value === 0);
  assert.equal(await sample("wet"), 0, "Exit is exactly dry after the fade");
  await page.evaluate(async () => {
    const bytes = await (await fetch("/music/ion-drift.mp3")).arrayBuffer();
    await player.loadFiles([
      new File([bytes], "local.mp3", { type: "audio/mpeg" }),
    ]);
    await player.play();
  });
  await page.waitForFunction(() => player.audio.currentTime > 0.15);
  assert.equal(await sample("wet"), 0);
  await page.evaluate(() => player.setTunnel(true));
  await page.waitForFunction(() => player.wet.gain.value > 0.109);
  const localWet = await sample("wet");
  assert(
    localWet > 0.0001,
    "User-selected local files use the same echo graph",
  );
  await page.evaluate(() => player.next());
  await page.waitForFunction(() => player.audio.currentTime > 0.15);
  assert.equal(
    await page.evaluate(
      () =>
        player.context === originalMusicContext &&
        player.source === originalMediaSource,
    ),
    true,
    "Skip/load reuses one context and media source",
  );
  assert((await sample("wet")) > 0.0001);
  await page.evaluate(() => player.setTunnel(false));
  await page.waitForFunction(() => player.wet.gain.value === 0);
  assert.equal(await sample("wet"), 0);
  await page.evaluate(() => player.dispose());
  assert.equal(await page.evaluate(() => originalMusicContext.state), "closed");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        dryOutside,
        wetOutside,
        wetInside,
        localWet,
        entrance,
        exit,
        ...context,
        checks: [
          "native default/local signal",
          "measured inside echo",
          "dry outside",
          "smooth entry/exit",
          "pause/zero volume mute tails",
          "one context/source across skip/load",
          "dispose closes context",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
