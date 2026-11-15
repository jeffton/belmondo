import test from "node:test";
import assert from "node:assert/strict";
import { createMenuSounds } from "../src/menu-sound.js";

for (const sampleRate of [44100, 48000, 96000]) {
  test(`industrial menu buffers remain finite, click-free and stereo at ${sampleRate} Hz`, () => {
    const sounds = createMenuSounds({
      sampleRate,
      createBuffer(count, length) {
        const channels = Array.from(
          { length: count },
          () => new Float32Array(length),
        );
        return { length, getChannelData: (channel) => channels[channel] };
      },
    });
    for (const buffer of sounds.values()) {
      const left = buffer.getChannelData(0),
        right = buffer.getChannelData(1);
      for (const pcm of [left, right]) {
        assert(pcm.every((x) => Number.isFinite(x) && Math.abs(x) < 1));
        assert.equal(pcm[0], 0);
        assert.equal(Math.abs(pcm.at(-1)), 0);
        assert(pcm.some((x) => Math.abs(x) > 0.1));
      }
      assert(left.some((x, i) => Math.abs(x - right[i]) > 0.001));
    }
  });
}
