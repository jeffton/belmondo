import { chromium } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

// Audio-only fixture: no game world, GPU context, server or autoplay bypass.
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  await page.route("http://audio.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Launch audio</title>",
    }),
  );
  await page.route("http://audio.test/audio/**/*.wav", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      contentType: "audio/wav",
      body: await readFile(new URL(`../public${path}`, import.meta.url)),
    });
  });
  await page.goto("http://audio.test/");
  await page.route("http://audio.test/src/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      contentType: "text/javascript",
      body: await readFile(new URL(`..${path}`, import.meta.url)),
    });
  });
  const results = await page.evaluate(async () => {
    const { AudioEngine } = await import("/src/audio.js");
    const results = [];
    for (const stage of [
      3,
      2,
      1,
      0,
      "muted",
      "paused",
      "hidden",
      "default",
      "voice:3",
      "voice:2",
      "voice:1",
      "voice:0",
      "lap:2",
      "lap:3",
      "lap:4",
      "lap:final",
      "pickup:MISSILE",
      "pickup:PULSE",
      "pickup:MINE",
      "pickup:SHIELD",
      "pickup:TURBO",
      "voice:lap:2",
      "voice:lap:3",
      "voice:lap:4",
      "voice:lap:final",
      "voice:MISSILE",
      "voice:PULSE",
      "voice:MINE",
      "voice:SHIELD",
      "voice:TURBO",
      "finish:1",
      "finish:2",
      "finish:3",
      "finish:4",
      "finish:5",
      "finish:6",
      "finish:7",
      "finish:8",
      "voice:result:1",
      "voice:result:2",
      "voice:result:3",
      "voice:result:4",
      "voice:result:5",
      "voice:result:6",
      "voice:result:7",
      "voice:result:8",
    ]) {
      const context = new OfflineAudioContext(2, 48000, 48000);
      context.resume = () => Promise.resolve();
      window.AudioContext = function () {
        return context;
      };
      const audio = new AudioEngine();
      await audio.start();
      if (stage === "muted") audio.setMuted(true);
      if (stage === "paused") audio.setPaused(true);
      if (stage === "hidden") audio.hidden = true;
      if (typeof stage === "string" && stage.startsWith("voice:"))
        audio.effect(stage);
      else if (typeof stage === "string" && stage.startsWith("lap:"))
        audio.effect("lap", stage.slice(4));
      else if (typeof stage === "string" && stage.startsWith("pickup:"))
        audio.effect("pickup", stage.slice(7));
      else if (typeof stage === "string" && stage.startsWith("finish:"))
        audio.effect("finish", stage.slice(7));
      else if (stage === 0) audio.effect("go");
      else if (typeof stage === "number") audio.effect("countdown", stage);
      else audio.effect("countdown");
      const rendered = await context.startRendering();
      results.push({
        stage,
        channels: [0, 1].map((i) => Array.from(rendered.getChannelData(i))),
      });
      window.removeEventListener("blur", audio.onBlur);
      window.removeEventListener("focus", audio.onFocus);
      document.removeEventListener("visibilitychange", audio.onVisibility);
    }
    return results;
  });
  const metrics = results.map(({ stage, channels }) => {
    const samples = channels.flat();
    const peak = Math.max(
      ...channels.map((pcm) =>
        pcm.reduce((m, x) => Math.max(m, Math.abs(x)), 0),
      ),
    );
    const rms = Math.sqrt(
      samples.reduce((sum, x) => sum + x * x, 0) / samples.length,
    );
    const silent = ["muted", "paused", "hidden"].includes(stage);
    assert(samples.every(Number.isFinite), `${stage}: finite PCM`);
    assert(peak < 0.98, `${stage}: no clipping`);
    assert(
      silent ? peak === 0 : rms > 0.015,
      `${stage}: correct audible state`,
    );
    assert(
      channels.every((pcm) =>
        pcm.slice(45000).every((x) => Math.abs(x) < 0.0001),
      ),
      `${stage}: cue drains to silence`,
    );
    return { stage, peak, rms };
  });
  for (let i = 1; i < 4; i++) {
    const difference =
      results[i].channels[0].reduce(
        (sum, x, n) => sum + (x - results[i - 1].channels[0][n]) ** 2,
        0,
      ) / 48000;
    assert(
      difference > 0.001,
      "Countdown stages and launch must be audibly distinct",
    );
  }
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(
      results[i].channels,
      results[i + 8].channels,
      "signal mix contains exactly the voice, with no extra tone or start chord",
    );
  }
  for (const result of results.slice(12, 21)) {
    const voiceKey = result.stage.startsWith("lap:")
      ? `voice:${result.stage}`
      : `voice:${result.stage.slice(7)}`;
    assert.deepEqual(
      result.channels,
      results.find((item) => item.stage === voiceKey).channels,
      `${result.stage}: speech only, with no old lap or pickup sound`,
    );
  }
  for (const result of results.filter((item) =>
    String(item.stage).startsWith("finish:"),
  )) {
    const reference = results.find(
      (item) => item.stage === `voice:result:${result.stage.slice(7)}`,
    );
    assert.deepEqual(
      result.channels,
      reference.channels,
      `${result.stage}: result voice only, without the old finish sound`,
    );
  }
  const frames = 48000 * 4;
  const wav = Buffer.alloc(44 + frames * 4);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(48000, 24);
  wav.writeUInt32LE(192000, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(frames * 4, 40);
  let position = 44;
  for (const result of results.slice(0, 4))
    for (let frame = 0; frame < 48000; frame++)
      for (const channel of result.channels) {
        wav.writeInt16LE(Math.round(channel[frame] * 32767), position);
        position += 2;
      }
  await mkdir("test-artifacts", { recursive: true });
  await writeFile("test-artifacts/countdown-launch.wav", wav);
  await writeFile(
    "test-artifacts/countdown-audio.json",
    JSON.stringify(metrics, null, 2),
  );
  console.log(metrics);
} finally {
  await browser.close();
}
