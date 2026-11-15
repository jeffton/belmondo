import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.GAME_URL || "http://127.0.0.1:5193";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.goto(url);
  const report = await page.evaluate(async () => {
    const { AudioEngine } = await import("/src/audio.js");
    const { soundtrack } = await import("/src/soundtrack.js");
    const decoder = new AudioContext();
    const tracks = await Promise.all(
      soundtrack.map(async (track) => {
        const response = await fetch(track.url);
        if (!response.ok)
          throw new Error(`${track.url}: HTTP ${response.status}`);
        return {
          name: track.name,
          buffer: await decoder.decodeAudioData(await response.arrayBuffer()),
        };
      }),
    );
    await decoder.close();
    const render = async (music, kind, rapid = false) => {
      const ctx = new OfflineAudioContext(2, 72000, 48000);
      const audio = new AudioEngine();
      audio.context = ctx;
      audio.build();
      audio.started = true;
      audio.volume = 0.8; // Production defaults: effects .8; music .65, menu gain .35.
      audio.applyVolume();
      if (music) {
        const source = ctx.createBufferSource();
        source.buffer = music;
        const gain = ctx.createGain();
        gain.gain.value = 0.65 * 0.35;
        source.connect(gain).connect(ctx.destination);
        source.start(0, 30);
      }
      if (kind) {
        const cue = ctx.createBufferSource();
        cue.buffer = audio.menuBuffers.get(kind);
        cue.connect(audio.menuBus);
        cue.start(0.25); // Let the compressor reach its realtime idle state.
        if (rapid)
          for (let t = 0.05; t <= 0.5; t += 0.05) {
            const source = ctx.createBufferSource();
            source.buffer = audio.menuBuffers.get(kind);
            source.connect(audio.menuBus);
            source.start(0.25 + t);
          }
      }
      return ctx.startRendering();
    };
    const stats = (buffer, end) => {
      let peak = 0,
        energy = 0,
        samples = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const pcm = buffer.getChannelData(channel);
        for (
          let i = Math.round(0.25 * buffer.sampleRate);
          i < Math.round((0.25 + end) * buffer.sampleRate);
          i++
        ) {
          peak = Math.max(peak, Math.abs(pcm[i]));
          energy += pcm[i] * pcm[i];
          samples++;
        }
      }
      return { peak, rms: Math.sqrt(energy / samples) };
    };
    const cues = {};
    for (const [kind, duration] of [
      ["move", 0.115],
      ["confirm", 0.242],
      ["back", 0.187],
    ])
      cues[kind] = stats(await render(null, kind), duration);
    const mix = [];
    for (const track of tracks) {
      const music = await render(track.buffer, null);
      for (const [kind, duration] of [
        ["move", 0.115],
        ["confirm", 0.242],
        ["back", 0.187],
      ]) {
        const bed = stats(music, duration);
        const combined = stats(await render(track.buffer, kind), duration);
        mix.push({
          track: track.name,
          kind,
          music: bed,
          cue: cues[kind],
          combined,
          cueAboveMusicDb: 20 * Math.log10(cues[kind].rms / bed.rms),
        });
      }
    }
    return {
      cues,
      mix,
      rapidMove: stats(await render(tracks[0].buffer, "move", true), 0.8),
    };
  });
  for (const item of report.mix) {
    assert(item.music.rms > 0.001, "Actual menu music must be present");
    assert(item.combined.peak < 0.9, "Music plus menu feedback must not clip");
  }
  assert(report.rapidMove.peak < 0.9, "Rapid navigation must not clip the mix");
  await mkdir("test-artifacts", { recursive: true });
  await writeFile(
    "test-artifacts/menu-mix.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
