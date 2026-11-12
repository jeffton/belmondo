import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

// Requires this worktree's Vite dev server, for real production ES modules.
// Bounded real Race transitions, not a claim of complete player-driven laps.
const url = process.env.GAME_URL || "http://127.0.0.1:5178";
const directory = "test-artifacts/race-announcer";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
await mkdir(directory, { recursive: true });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1100, height: 700 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage();
    await page.route("**/announcer-qa", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<button id="start">Start native race audio</button>',
      }),
    );
    await page.goto(`${url}/announcer-qa`);
    await page.evaluate(async () => {
      const { AudioEngine } = await import("/src/audio.js");
      const { Race, LAPS } = await import("/src/race.js");
      const { makeTrack } = await import("/src/track.js");
      const { pickupPoint } = await import("/src/pickups.js");
      window.calls = [];
      const audio = new AudioEngine();
      const play = audio.playSample.bind(audio);
      audio.playSample = (key) => {
        window.calls.push({ key, context: audio.context.state });
        return play(key);
      };
      window.audio = audio;
      const track = makeTrack(0);
      document.querySelector("#start").onclick = async () => {
        await audio.start();
        window.analyser = audio.context.createAnalyser();
        audio.compressor.connect(window.analyser);
        window.ready = true;
      };
      window.crossLap = (lap) => {
        const race = new Race(track, 0, "trial");
        race.countdown = 0;
        const player = race.player;
        const s = track.finishS + lap * track.length - 1;
        const frame = track.frame(s);
        player.lap = lap;
        player.s = player.contactS = s;
        player.gate = lap * 32;
        player.checkpoint = { s, branch: 0, gate: player.gate };
        player.position.copy(frame.p);
        player.position.y += 2.2;
        player.velocity.copy(frame.tangent).multiplyScalar(50);
        player.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
        for (let step = 0; step < 120 && player.lap === lap; step++)
          race.update(1 / 120, {});
        for (const event of race.events) audio.raceEvent(event, race, LAPS);
        return { lap: player.lap, finished: race.finished };
      };
      window.collectWeapon = () => {
        const race = new Race(track);
        race.racers = [race.player];
        race.countdown = 0;
        const player = race.player;
        const pad = race.pickups.find(
          (pad) => pad.type === "weapon" && pad.branch === 0,
        );
        const frame = track.frame(pad.s);
        player.position.copy(pickupPoint(track, pad, 0, 0));
        player.position.y += 2.2;
        player.velocity.set(0, 0, 0);
        player.s = player.contactS = pad.s;
        player.gate =
          Math.floor(((pad.s - track.finishS) / track.length) * 32) + 1;
        player.checkpoint = { s: pad.s, branch: 0, gate: player.gate };
        player.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
        race.update(1 / 120, {});
        for (const event of race.events) audio.raceEvent(event, race, LAPS);
        return player.weapon;
      };
    });
    await page.locator("#start").click();
    await page.waitForFunction(() => window.ready);
    const rms = async () => {
      await page.waitForTimeout(120);
      return page.evaluate(() => {
        const samples = new Float32Array(window.analyser.fftSize);
        window.analyser.getFloatTimeDomainData(samples);
        return Math.sqrt(
          samples.reduce((sum, x) => sum + x * x, 0) / samples.length,
        );
      });
    };
    for (let lap = 1; lap <= 4; lap++) {
      const state = await page.evaluate((lap) => window.crossLap(lap), lap);
      assert.equal(state.lap, lap + 1);
      assert(!state.finished);
      assert(
        (await rms()) > 0.001,
        "earned lap produces native audible speech",
      );
      await page.waitForTimeout(700);
    }
    const acquired = await page.evaluate(() => window.collectWeapon());
    assert(acquired);
    assert(
      (await rms()) > 0.001,
      "actual player pickup produces audible weapon name",
    );
    await page.evaluate(() => window.audio.setPaused(true));
    assert((await rms()) < 0.0001, "pause discards active speech");
    await page.evaluate(() => window.audio.setPaused(false));
    assert((await rms()) < 0.0001, "resume cannot replay stale speech");
    await page.evaluate(() => window.collectWeapon());
    await page.evaluate(() => window.audio.setMuted(true));
    assert((await rms()) < 0.0001, "mute silences speech");
    await page.evaluate(() => window.audio.setMuted(false));
    await page.evaluate(() => window.crossLap(5));
    const calls = await page.evaluate(() => window.calls);
    assert.deepEqual(
      calls.slice(0, 4).map((call) => call.key),
      ["voice:lap:2", "voice:lap:3", "voice:lap:4", "voice:lap:final"],
    );
    assert.equal(calls[4].key, `voice:${acquired}`);
    assert(calls.every((call) => call.context === "running"));
    assert.equal(calls.at(-1).key, "finish");
    assert(!calls.some((call) => call.key === "lap" || call.key === "pickup"));
    await writeFile(
      `${directory}/${mobile ? "mobile" : "desktop"}.json`,
      JSON.stringify(calls, null, 2),
    );
    await page.evaluate(() => window.audio.dispose());
    await context.close();
  }
} finally {
  await browser.close();
}
