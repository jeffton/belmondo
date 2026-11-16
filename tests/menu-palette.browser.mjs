import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.GAME_URL || "http://127.0.0.1:5187";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.goto(url);
  const results = await page.evaluate(async () => {
    const { AudioEngine } = await import("/src/audio.ts");
    const results = [];
    for (const kind of ["move", "confirm", "back"]) {
      for (const mode of [
        "normal",
        "previous-level",
        "zero",
        "muted",
        "hidden",
        "paused",
      ]) {
        const context = new OfflineAudioContext(1, 24000, 48000);
        const audio = new AudioEngine();
        audio.context = context;
        audio.build();
        await audio.loadMenuSamples();
        audio.started = true;
        audio.volume = mode === "zero" ? 0 : 0.7;
        audio.muted = mode === "muted";
        audio.hidden = mode === "hidden";
        audio.paused = mode === "paused";
        audio.applyVolume();
        if (mode === "previous-level")
          audio.menuBus.gain.setValueAtTime(audio.volume, 0);
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
    // Gameplay PCM must survive the menu trim within renderer float precision.
    const engine = async (previousLevel) => {
      const context = new OfflineAudioContext(1, 24000, 48000);
      const audio = new AudioEngine();
      audio.context = context;
      audio.build();
      audio.started = true;
      audio.applyVolume();
      if (previousLevel) audio.menuBus.gain.setValueAtTime(audio.volume, 0);
      audio.update(1, false, { throttle: true, acceleration: 0 });
      return (await context.startRendering()).getChannelData(0);
    };
    const currentEngine = await engine(false);
    const previousEngine = await engine(true);
    const engineDifference = Math.max(
      ...currentEngine.map((sample, i) => Math.abs(sample - previousEngine[i])),
    );
    if (engineDifference > 0.000001)
      throw new Error(
        `Menu trim changed gameplay engine PCM: ${engineDifference}`,
      );
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
      assert(peak > 0.005 && peak < 0.5, `${kind}: moderate peak ${peak}`);
      assert(end > 0.1 && end < 0.45, `${kind}: finite envelope ${end}`);
      assert(pcm.slice(22000).every((x) => Math.abs(x) < 0.00001));
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
  for (const kind of ["move", "confirm", "back"]) {
    const current = metrics.find((x) => x.kind === kind && x.mode === "normal");
    const previous = metrics.find(
      (x) => x.kind === kind && x.mode === "previous-level",
    );
    const ratio = current.rms / previous.rms;
    assert(
      ratio >= 0.49 && ratio < 0.7,
      `${kind}: audible PCM reduction ${ratio}`,
    );
    console.log(kind, "RMS reduction dB:", 20 * Math.log10(ratio));
  }
  await writeFile(
    "test-artifacts/menu-palette.json",
    JSON.stringify(metrics, null, 2),
  );
  console.log(metrics);
} finally {
  await browser.close();
}
