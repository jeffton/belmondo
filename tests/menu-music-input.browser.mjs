import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const url = process.env.GAME_URL || "http://127.0.0.1:5193";
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--autoplay-policy=document-user-activation-required",
    "--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies",
  ],
});
const errors = [];
async function fixture() {
  const context = await browser.newContext({ hasTouch: true });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.musicElements = [];
    window.Audio = function (...args) {
      const audio = new NativeAudio(...args);
      window.musicElements.push(audio);
      return audio;
    };
    window.Audio.prototype = NativeAudio.prototype;
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      createMediaElementSource(audio) {
        window.musicContext = this;
        return super.createMediaElementSource(audio);
      }
      createGain() {
        const gain = super.createGain();
        if (window.musicContext === this && !window.musicOutput)
          window.musicOutput = gain;
        return gain;
      }
    };
    window.pad = null;
    navigator.getGamepads = () => (window.pad ? [window.pad] : []);
  });
  const session = await context.newCDPSession(page);
  // Playwright's ordinary evaluate may grant a CDP user gesture. These probes
  // explicitly cannot unlock playback or manufacture native gamepad activation.
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await session.send(
      "Runtime.evaluate",
      {
        expression,
        returnByValue: true,
        awaitPromise: true,
        userGesture: false,
      },
    );
    assert.equal(exceptionDetails, undefined);
    return result.value;
  };
  const wait = async (expression) => {
    const deadline = Date.now() + 8000;
    while (!(await evaluate(expression))) {
      assert.ok(Date.now() < deadline, expression);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  await page.goto(url);
  await page.bringToFront();
  await wait('window.nullVector?.telemetry.state === "menu"');
  assert.equal(await evaluate("navigator.userActivation.hasBeenActive"), false);
  assert.equal(await evaluate("musicElements[0].paused"), true);
  return { context, page, evaluate, wait };
}
const playing =
  'musicElements.length === 1 && !musicElements[0].paused && musicElements[0].currentTime > 0.05 && musicContext.state === "running"';
try {
  for (const action of ["ArrowRight", "Enter", "Tab", "pointer", "touch"]) {
    const { context, page, evaluate, wait } = await fixture();
    assert.equal(await evaluate("document.activeElement.tagName"), "BODY");
    if (action === "pointer")
      await page.locator('input[name="mode"][value="trial"]').click();
    else if (action === "touch")
      await page.locator('input[name="mode"][value="trial"]').tap();
    else await page.keyboard.press(action);
    await wait(playing);
    await evaluate(`window.musicTap = musicContext.createAnalyser();
      const silent = musicContext.createGain(); silent.gain.value = 0;
      musicOutput.connect(musicTap); musicTap.connect(silent); silent.connect(musicContext.destination)`);
    await wait(
      `(() => {const pcm = new Float32Array(musicTap.fftSize); musicTap.getFloatTimeDomainData(pcm); return pcm.some(value => Math.abs(value) > 0.001)})()`,
    );
    assert.equal(
      await evaluate("navigator.userActivation.hasBeenActive"),
      true,
    );
    const source = await evaluate("musicElements[0].src");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    assert.equal(await evaluate("musicElements[0].src"), source);
    assert.equal(await evaluate("musicElements.length"), 1);
    // Lifecycle routing simulation: headless pages do not lose OS focus.
    await evaluate(`Object.defineProperty(document, 'hasFocus', {configurable:true, value:()=>false});
      window.dispatchEvent(new Event('blur'))`);
    await wait("musicElements[0].paused");
    await evaluate(
      `delete document.hasFocus; window.dispatchEvent(new Event('focus'))`,
    );
    await wait(playing);
    await context.close();
  }
  {
    const { context, page, evaluate, wait } = await fixture();
    await evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", {key:"ArrowRight", bubbles:true}));
      window.dispatchEvent(new Event("gamepadconnected"));
      window.pad = {id:"Synthetic", index:0, axes:[0,0], buttons:Array.from({length:17},()=>({pressed:false,value:0}))}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await evaluate("pad.buttons[15] = {pressed:true,value:1}");
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(
      await evaluate("navigator.userActivation.hasBeenActive"),
      false,
    );
    assert.equal(await evaluate("musicElements[0].paused"), true);
    assert.equal(await evaluate("window.musicContext === undefined"), true);
    await evaluate("window.pad = null");
    await page.keyboard.press("ArrowLeft");
    await wait(playing);
    // A zero music gain remains zero through subsequent controller navigation.
    await evaluate(`document.querySelector('#volume').value = '0';
      document.querySelector('#volume').dispatchEvent(new Event('input', {bubbles:true}));
      window.pad = {id:"Synthetic", index:0, axes:[0,0], buttons:Array.from({length:17},()=>({pressed:false,value:0}))}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await evaluate("pad.buttons[15] = {pressed:true,value:1}");
    await wait("musicOutput.gain.value === 0");
    assert.equal(await evaluate("musicElements.length"), 1);
    await context.close();
  }
  {
    const { context, page, evaluate, wait } = await fixture();
    await page.locator("#music-open").tap();
    await wait(playing);
    // Explicit pause must survive keyboard/controller menu navigation.
    await page.locator("#music-play").click();
    await wait("musicElements[0].paused");
    await page.keyboard.press("ArrowRight");
    await evaluate(
      `window.pad = {id:"Synthetic", index:0, axes:[0,0], buttons:Array.from({length:17},()=>({pressed:false,value:0}))}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    await evaluate("pad.buttons[15] = {pressed:true,value:1}");
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(await evaluate("musicElements[0].paused"), true);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS strict autoplay: keyboard from body, pointer and touch, no synthetic/gamepad-mock unlock, focus resume, single music element, zero volume and explicit pause",
  );
} finally {
  await browser.close();
}
