import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

// Audio-only scene transitions; the full game fixture checks the main.js hooks.
const url = process.env.GAME_URL || "http://127.0.0.1:5196";
const browser = await chromium.launch({
  args: ["--no-sandbox", "--disable-gpu"],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__music-menu", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<button id="play">Play/pause</button>
      <button id="race">Race/restart</button><button id="menu">Menu/quit</button>
      <button id="next">Next</button><button id="local">Local files</button>
      <button id="ost">OST</button><script type="module">
        import { MusicPlayer } from '/src/music.js';
        import { soundtrack } from '/src/soundtrack.js';
        window.player = new MusicPlayer(state => window.musicState = state);
        window.enabled = true;
        window.tracks = soundtrack;
        player.volume = .65;
        player.setMenu(true);
        player.loadTracks(soundtrack, { shuffle: true });
        document.querySelector('#play').onclick = () => {
          enabled = player.audio.paused;
          if (enabled) player.play(); else player.pause();
        };
        document.querySelector('#race').onclick = () => {
          player.setMenu(false);
          if (enabled) player.play();
        };
        document.querySelector('#menu').onclick = () => {
          player.setMenu(true);
          player.setTunnel(false);
        };
        document.querySelector('#next').onclick = () => {
          enabled = true;
          player.next();
        };
        const bytes = await (await fetch(soundtrack[0].url)).arrayBuffer();
        // A constant local PCM tone permits a real output-RMS gain-ratio measurement.
        const frames = 48000 * 20;
        const wav = new ArrayBuffer(44 + frames * 2);
        const view = new DataView(wav);
        const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
        text(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE');
        text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
        view.setUint16(22, 1, true); view.setUint32(24, 48000, true);
        view.setUint32(28, 96000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
        text(36, 'data'); view.setUint32(40, frames * 2, true);
        for (let i = 0; i < frames; i++) view.setInt16(44 + i * 2, Math.sin(i * Math.PI * 2 * 110 / 48000) * 12000, true);
        document.querySelector('#local').onclick = async () => {
          await player.loadFiles([
            new File([wav], 'steady-tone.wav', { type: 'audio/wav' }),
            new File([bytes], 'second.mp3', { type: 'audio/mpeg' }),
          ]);
          enabled = true;
          player.play();
        };
        document.querySelector('#ost').onclick = () => {
          player.loadTracks(soundtrack, { shuffle: true });
          enabled = true;
          player.play();
        };
        window.ready = true;
      </script>`,
    }),
  );
  await page.goto(`${url}/__music-menu`);
  await page.waitForFunction(() => window.ready);
  assert.equal(await page.evaluate(() => player.context), null);
  assert.equal(await page.evaluate(() => player.audio.paused), true);
  await page.locator("#play").click();
  await page.waitForFunction(() => player.audio.currentTime > 0.1);
  assert.equal(
    await page.evaluate(() => player.sceneGain.gain.value),
    Math.fround(0.35),
  );
  await page.evaluate(() => {
    window.initialContext = player.context;
    window.initialAudio = player.audio;
    window.initialSource = player.audio.src;
  });

  const snapshot = () =>
    page.evaluate(() => ({
      src: player.audio.src,
      time: player.audio.currentTime,
      paused: player.audio.paused,
      volume: player.volume,
      scene: player.sceneGain.gain.value,
      output: player.output.gain.value,
      index: player.index,
    }));
  await page.locator("#race").click();
  await page.waitForFunction(() => player.sceneGain.gain.value === 1);
  const race = await snapshot();
  await page.evaluate(() => player.setTunnel(true));
  await page.waitForFunction(() => player.wet.gain.value > 0.109);
  await page.locator("#menu").click();
  const rampStart = await snapshot();
  assert(rampStart.scene > 0.35 && rampStart.scene <= 1);
  await page.waitForFunction(
    () =>
      player.sceneGain.gain.value > 0.36 && player.sceneGain.gain.value < 0.9,
  );
  await page.waitForFunction(
    () => player.sceneGain.gain.value === Math.fround(0.35),
  );
  const menu = await snapshot();
  assert(menu.time > race.time, "Menu playback clock continues");
  assert.equal(menu.src, race.src);
  assert.equal(menu.index, race.index);
  assert.equal(menu.paused, false);
  assert.equal(menu.volume, 0.65);
  assert(Math.abs(menu.output - 0.65) < 0.0001);
  await page.waitForFunction(() => player.wet.gain.value === 0);
  await page.locator("#race").click();
  await page.waitForFunction(() => player.sceneGain.gain.value === 1);
  const restarted = await snapshot();
  assert(restarted.time > menu.time, "Restart does not seek or reload");
  assert.equal(restarted.src, race.src);
  assert.equal(restarted.index, race.index);
  assert.equal(
    await page.evaluate(
      () => player.context === initialContext && player.audio === initialAudio,
    ),
    true,
  );

  await page.locator("#play").click();
  await page.waitForFunction(() => player.audio.paused);
  const manuallyPaused = await snapshot();
  for (const button of ["#menu", "#race", "#menu", "#race"])
    await page.locator(button).click();
  const stillPaused = await snapshot();
  assert.equal(stillPaused.paused, true);
  assert.equal(stillPaused.src, manuallyPaused.src);
  assert.equal(stillPaused.time, manuallyPaused.time);
  assert.equal(stillPaused.index, manuallyPaused.index);

  await page.evaluate(() => (player.volume = 0));
  await page.locator("#play").click();
  await page.locator("#menu").click();
  await page.waitForFunction(() => player.output.gain.value === 0);
  assert.equal(await page.evaluate(() => player.audio.paused), false);
  assert.equal(await page.evaluate(() => player.volume), 0);
  await page.locator("#race").click();
  assert.equal(await page.evaluate(() => player.volume), 0);
  await page.evaluate(() => (player.volume = 0.6));

  await page.locator("#local").click();
  await page.waitForFunction(() => player.audio.currentTime > 0.15);
  assert.equal(await page.evaluate(() => musicState.name), "steady-tone.wav");
  async function rms() {
    return page.evaluate(async () => {
      const analyser = player.context.createAnalyser();
      analyser.fftSize = 8192;
      player.sceneGain.connect(analyser);
      await new Promise((resolve) => setTimeout(resolve, 220));
      const values = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(values);
      player.sceneGain.disconnect(analyser);
      analyser.disconnect();
      return Math.sqrt(
        values.reduce((sum, v) => sum + v * v, 0) / values.length,
      );
    });
  }
  await page.waitForFunction(() => player.sceneGain.gain.value === 1);
  const raceRms = await rms();
  const localRace = await snapshot();
  await page.locator("#menu").click();
  await page.waitForFunction(
    () => player.sceneGain.gain.value === Math.fround(0.35),
  );
  const menuRms = await rms();
  const localMenu = await snapshot();
  assert(Math.abs(menuRms / raceRms - 0.35) < 0.02);
  assert.equal(localRace.src, localMenu.src);
  assert(localMenu.time > localRace.time);
  await page.locator("#next").click();
  await page.waitForFunction(() => musicState.name === "second.mp3");
  await page.locator("#race").click();
  await page.locator("#menu").click();
  await page.locator("#next").click();
  await page.waitForFunction(() => musicState.name === "steady-tone.wav");

  await page.locator("#ost").click();
  await page.waitForFunction(() => player.audio.currentTime > 0.05);
  const seen = new Set([await page.evaluate(() => player.audio.src)]);
  for (let i = 1; i < 8; i++) {
    await page.locator("#race").click();
    await page.locator("#menu").click();
    const previous = await page.evaluate(() => player.audio.src);
    await page.locator("#next").click();
    await page.waitForFunction(
      (previous) =>
        player.audio.src !== previous && player.audio.currentTime > 0.05,
      previous,
    );
    const src = await page.evaluate(() => player.audio.src);
    assert(!seen.has(src), "Menu navigation must not reset the shuffle bag");
    seen.add(src);
  }
  assert.equal(seen.size, 8);
  await page.evaluate(() => player.dispose());
  assert.equal(await page.evaluate(() => initialContext.state), "closed");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        raceRms,
        menuRms,
        menuRatio: menuRms / raceRms,
        checks: [
          "no initial autoplay",
          "native user-gesture start",
          "smooth independent menu gain",
          "track/time/context continuity",
          "manual pause survives scene navigation",
          "user-volume zero survives navigation",
          "ordered local files",
          "unchanged shuffle bag",
          "menu clears tunnel in lifecycle fixture",
          "dispose",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
