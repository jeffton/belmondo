import { chromium } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { SFX_CUES } from "../src/generated-sfx.js";

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
  await page.route("http://audio.test/audio/sfx/*.wav", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      contentType: "audio/wav",
      body: await readFile(new URL(`../public${path}`, import.meta.url)),
    });
  });
  await page.goto("http://audio.test/");
  const source = await readFile(
    new URL("../src/audio.js", import.meta.url),
    "utf8",
  );
  await page.addScriptTag({
    content:
      `const SFX_CUES = ${JSON.stringify(SFX_CUES)};\n` +
      source
        .replace(/^import[^\n]*\n/, "")
        .replaceAll("export class ", "class ") +
      "\nwindow.LaunchAudio = AudioEngine;",
  });
  const results = await page.evaluate(async () => {
    const results = [];
    for (const stage of [3, 2, 1, 0, "muted", "paused", "hidden", "default"]) {
      const context = new OfflineAudioContext(2, 48000, 48000);
      context.resume = () => Promise.resolve();
      window.AudioContext = function () {
        return context;
      };
      const audio = new window.LaunchAudio();
      await audio.start();
      if (stage === "muted") audio.setMuted(true);
      if (stage === "paused") audio.setPaused(true);
      if (stage === "hidden") audio.hidden = true;
      if (stage === 0) audio.effect("go");
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
