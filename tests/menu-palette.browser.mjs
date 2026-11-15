import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.GAME_URL || "http://127.0.0.1:5187";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.goto(url);
  const results = await page.evaluate(async () => {
    const { AudioEngine } = await import("/src/audio.js");
    const results = [];
    for (const kind of ["move", "confirm", "back"]) {
      for (const mode of ["normal", "zero", "muted", "hidden", "paused"]) {
        const context = new OfflineAudioContext(1, 24000, 48000);
        const audio = new AudioEngine();
        audio.context = context;
        audio.build();
        audio.started = true;
        audio.volume = mode === "zero" ? 0 : 0.7;
        audio.muted = mode === "muted";
        audio.hidden = mode === "hidden";
        audio.paused = mode === "paused";
        audio.applyVolume();
        audio.playMenuCue(kind);
        const rendered = await context.startRendering();
        results.push({
          kind,
          mode,
          voices: audio.menuVoices.size,
          pcm: Array.from(rendered.getChannelData(0)),
        });
      }
    }
    return results;
  });
  await mkdir("test-artifacts", { recursive: true });
  const metrics = [];
  for (const { kind, mode, voices, pcm } of results) {
    const peak = Math.max(...pcm.map(Math.abs));
    const rms = Math.sqrt(pcm.reduce((sum, x) => sum + x * x, 0) / pcm.length);
    const end = pcm.findLastIndex((x) => Math.abs(x) > 0.0001) / 48000;
    assert.equal(voices, 0, `${kind}/${mode}: voices drain`);
    if (["zero", "muted", "hidden"].includes(mode)) assert.equal(peak, 0);
    else {
      assert(peak > 0.07 && peak < 0.5, `${kind}: moderate peak ${peak}`);
      assert(end > 0.065 && end < 0.26, `${kind}: finite envelope ${end}`);
      assert(pcm.slice(14000).every((x) => Math.abs(x) < 0.00001));
    }
    metrics.push({ kind, mode, peak, rms, end });
    if (mode !== "normal") continue;
    const wav = Buffer.alloc(44 + pcm.length * 2);
    wav.write("RIFF");
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(48000, 24);
    wav.writeUInt32LE(96000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(pcm.length * 2, 40);
    pcm.forEach((x, i) => wav.writeInt16LE(Math.round(x * 32767), 44 + i * 2));
    await writeFile(`test-artifacts/menu-${kind}.wav`, wav);
  }
  await writeFile(
    "test-artifacts/menu-palette.json",
    JSON.stringify(metrics, null, 2),
  );
  console.log(metrics);
} finally {
  await browser.close();
}
