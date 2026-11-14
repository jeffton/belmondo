import "./style.css";
import { Vector3 } from "three";
import { TRACKS, makeTrack, clamp, mod } from "./track.js";
import { Race, CRAFT, SPEED_CLASSES, LAPS_BY_CLASS } from "./race.js";
import { World } from "./world.js";
import { AudioEngine } from "./audio.js";
import { countdownBoardStage } from "./start-gantry.js";
import { getCrowdMix } from "./crowd.js";
import { MusicPlayer } from "./music.js";
import { soundtrack } from "./soundtrack.js";
import { createWeaponHUD } from "./weapon-ui.js";
import { localRecordKey } from "./records.js";
import {
  loadProgression,
  recordProgressionResult,
  trackIsUnlocked,
  trackProgress,
} from "./progression.js";
import { installZoomPolicy } from "./zoom-policy.js";
import { MenuPreview } from "./menu-preview.js";
import { MenuNavigation } from "./menu-navigation.js";
import { frameDelta } from "./frame-clock.js";
import { halfstickPosition } from "./touch-halfstick.js";
import { CoursePreparation } from "./course-preparation.js";

installZoomPolicy();
await document.fonts.load('700 16px "Noto Sans JP"');
const $ = (id) => document.getElementById(id);
const updateWeaponHUD = createWeaponHUD(
  $("weapon"),
  $("touch-fire"),
  $("weapon-roster"),
);
updateWeaponHUD(null);
const sound = new AudioEngine();
const crowdRight = new Vector3();
const music = new MusicPlayer((state) => {
  $("music-status").textContent =
    state.error ||
    (state.count
      ? `${state.playing ? "PLAYING" : "PAUSED"} / ${state.name} · ${state.count} TRACKS`
      : "NO LOCAL TRACKS LOADED");
});
music.volume = 0.65;
music.setMenu(true);
music.loadTracks(soundtrack, { shuffle: true });
let musicEnabled = true;
let world;
try {
  world = new World($("game"));
} catch (error) {
  $("fatal").hidden = false;
  $("fatal").textContent =
    `Could not initialize WebGL2. Enable hardware acceleration to race. ${error.message}`;
  throw error;
}
const menuPreview = new MenuPreview($("menu-model"));
let menuStage = "mode";
const menuStages = ["mode", "class", "track", "craft"];
let menuNavigator;
function setMenuStage(stage) {
  menuStage = stage;
  $("menu").dataset.stage = stage;
  for (const panel of document.querySelectorAll("[data-panel]"))
    panel.hidden = panel.dataset.panel !== stage;
  $("setup-back").hidden = stage === "mode";
  $("setup-next").hidden = stage === "craft";
  $("start").hidden = stage !== "craft";
  $("setup-next").textContent = "SELECT";
  $("menu-model").hidden = stage === "mode";
  $("craft-stats").hidden = stage !== "craft";
  $("menu-model").setAttribute(
    "aria-label",
    stage === "class"
      ? "Rotating selected speed class emblem"
      : stage === "craft"
        ? "Rotating selected craft model"
        : "Rotating selected circuit model",
  );
  menuPreview.setStage(stage === "mode" ? "class" : stage);
  updateModelName();
  if (menuNavigator) {
    menuNavigator.cursor = null;
    menuNavigator.sync();
  }
}
function updateCraftStats() {
  const craft = CRAFT[selectedCraft];
  $("craft-stats").style.setProperty(
    "--craft-accent",
    `#${craft.color.toString(16).padStart(6, "0")}`,
  );
  $("craft-stats").innerHTML = [
    ["thrust", "THRUST"],
    ["handling", "HANDLING"],
    ["armor", "ARMOR"],
  ]
    .map(([key, label]) => {
      const value = craft[key];
      const max = Math.max(...CRAFT.map((c) => c[key]));
      const score = Math.round((value / max) * 100);
      return `<div class="craft-stat" data-stat="${key}"><dt>${label}</dt><dd><span class="craft-stat-value">${score}</span><span class="craft-stat-track" role="meter" aria-label="${label}" aria-valuemin="1" aria-valuemax="100" aria-valuenow="${score}" aria-valuetext="${score} out of 100"><i style="width:${score}%"></i></span></dd></div>`;
    })
    .join("");
}
function updateModelName() {
  $("craft-circuit").textContent = TRACKS[selectedTrack].name;
  $("model-subtitle").textContent = TRACKS[selectedTrack].subtitle
    .split("/")[1]
    .trim();
  $("model-subtitle").hidden = menuStage !== "track";
  $("model-name").textContent =
    menuStage === "class"
      ? SPEED_CLASSES[selectedSpeedClass].name
      : menuStage === "craft"
        ? CRAFT[selectedCraft].name
        : TRACKS[selectedTrack].name;
}
$("setup-back").onclick = () =>
  setMenuStage(menuStages[menuStages.indexOf(menuStage) - 1]);
$("setup-next").onclick = () =>
  setMenuStage(menuStages[menuStages.indexOf(menuStage) + 1]);
let selectedTrack = 0,
  selectedCraft = 2,
  selectedSpeedClass = 0,
  track,
  race;
let state = "menu",
  paused = false,
  accumulator = 0,
  last = null,
  messageUntil = 0,
  previousCount = "armed";
let musicInterrupted = false;
function startMenuMusic(event) {
  if (
    !event.isTrusted ||
    state !== "menu" ||
    !musicEnabled ||
    !music.audio.paused ||
    document.hidden ||
    !document.hasFocus()
  )
    return;
  if (
    event.type === "keydown" &&
    !["Enter", " ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
      event.key,
    )
  )
    return;
  if (!event.target.closest("button, input, label")) return;
  music.play();
}
$("menu").addEventListener("click", startMenuMusic, { capture: true });
$("menu").addEventListener("keydown", startMenuMusic, { capture: true });
function updateAppFocus() {
  const inactive = document.hidden || !document.hasFocus();
  document.body.classList.toggle(
    "race-active",
    state === "race" && !paused && !inactive,
  );
  if (inactive) {
    if (!music.audio.paused) {
      musicInterrupted = true;
      music.pause();
    }
  } else if (musicInterrupted) {
    musicInterrupted = false;
    if (musicEnabled) music.play();
  }
}
window.addEventListener("blur", updateAppFocus);
window.addEventListener("focus", updateAppFocus);
document.addEventListener("visibilitychange", updateAppFocus);
let demoDistance = 50,
  renderFrames = 0,
  renderTime = 0;
const keys = new Set();
let touchSteer = 0,
  touchPitch = 0,
  steerPointer = null,
  airPointer = null,
  touchAir = 0,
  touchCoast = 0,
  touchLaunchArmed = false;
const touchLayout = matchMedia("(pointer: coarse)").matches;
let touch = touchLayout;
let inputMode = touch ? "touch" : "keyboard";
document.body.classList.toggle("touch", touch);
document.body.dataset.inputMode = inputMode;
function setInputMode(mode) {
  if (inputMode === mode) return;
  inputMode = mode;
  touch = mode === "touch";
  document.body.classList.toggle("touch", touch || touchLayout);
  document.body.dataset.inputMode = mode;
  if (!touch) {
    touchSteer = 0;
    touchPitch = 0;
    steerPointer = null;
    resetAirStick();
    touchLaunchArmed = false;
    $("steer-pad").querySelector("i").style.transform = "";
  }
}
window.addEventListener(
  "pointerdown",
  (event) => {
    if (event.pointerType === "touch") setInputMode("touch");
  },
  { capture: true },
);
const records = JSON.parse(localStorage.getItem("nv-records") || "{}");
const progression = loadProgression(localStorage);
function formatTime(t) {
  if (!Number.isFinite(t)) return "—";
  const m = Math.floor(t / 60);
  return `${String(m).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}`;
}
function showMessage(text, seconds = 1.7) {
  $("race-message").textContent = text;
  messageUntil = performance.now() + seconds * 1000;
}
function selectedMode() {
  return document.querySelector('input[name="mode"]:checked').value;
}
function recordKey(mode = selectedMode(), speedClass = selectedSpeedClass) {
  return localRecordKey(
    TRACKS[selectedTrack].layoutId,
    selectedCraft,
    mode,
    SPEED_CLASSES[speedClass],
    LAPS_BY_CLASS[speedClass],
  );
}
const coursePreparation = new CoursePreparation();
let resolveInitialCourse;
const initialCourseReady = new Promise((resolve) => {
  resolveInitialCourse = resolve;
});
let trackGeneration = 0;
let trackLoading = false;
let loadedTrack = -1;
let trackLoadTiming = null;
function isTrackUnlocked(index) {
  return trackIsUnlocked(
    progression,
    SPEED_CLASSES[selectedSpeedClass].id,
    TRACKS[index].layoutId,
    index,
    TRACKS,
  );
}
async function selectTrack(i) {
  if (!isTrackUnlocked(i)) return;
  if (i === selectedTrack && (trackLoading || loadedTrack === i)) return;
  selectedTrack = i;
  const generation = ++trackGeneration;
  const isCurrent = () => generation === trackGeneration;
  const start = performance.now();
  trackLoading = true;
  document.body.classList.add("course-loading");
  $("start").disabled = true;
  $("tracks").setAttribute("aria-busy", "true");
  $("fatal").hidden = true;
  updateModelName();
  $("circuit-name").textContent = TRACKS[i].name;
  for (const b of $("tracks").children) {
    const active = Number(b.dataset.index) === i;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  }
  try {
    const nextTrack = makeTrack(i);
    menuPreview.setTrack(nextTrack);
    const prepared = await coursePreparation.load(i);
    if (!isCurrent()) return;
    const buildStart = performance.now();
    let nextRace;
    const candidate = await world.prepare(
      nextTrack,
      prepared,
      isCurrent,
      (scene) => {
        nextRace = new Race(
          nextTrack,
          selectedCraft,
          "race",
          selectedSpeedClass,
          scene.environment.terrain,
        );
        scene.setupRacers(nextRace, CRAFT);
      },
    );
    if (!candidate || !isCurrent()) return;
    world.adopt(candidate);
    track = nextTrack;
    race = nextRace;
    demoDistance = track.length * 0.02;
    loadedTrack = i;
    resolveInitialCourse();
    trackLoadTiming = {
      totalMs: performance.now() - start,
      buildMs: performance.now() - buildStart,
      workerMs: prepared.workerMs,
    };
  } catch (error) {
    if (!isCurrent()) return;
    $("fatal").hidden = false;
    $("fatal").textContent = `Could not prepare circuit: ${error.message}`;
    throw error;
  } finally {
    if (isCurrent()) {
      trackLoading = false;
      document.body.classList.toggle(
        "course-loading",
        loadedTrack !== selectedTrack,
      );
      $("start").disabled = loadedTrack !== selectedTrack;
      $("tracks").setAttribute("aria-busy", "false");
    }
  }
}
for (const [i, t] of TRACKS.entries()) {
  const button = document.createElement("button");
  button.className = "choice";
  button.dataset.index = i;
  button.innerHTML = `<b>${t.name}</b><small class="track-progress" hidden></small><small class="track-lock" hidden>🔒 LOCKED</small>`;
  button.onclick = () => selectTrack(i);
  $("tracks").append(button);
}
function refreshTrackProgression() {
  const classId = SPEED_CLASSES[selectedSpeedClass].id;
  for (const button of $("tracks").children) {
    const index = Number(button.dataset.index);
    const trackConfig = TRACKS[index];
    const unlocked = isTrackUnlocked(index);
    const progress = trackProgress(progression, classId, trackConfig.layoutId);
    button.disabled = !unlocked;
    button.classList.toggle("locked", !unlocked);
    button.querySelector(".track-lock").hidden = unlocked;
    button.querySelector(".track-progress").textContent = progress
      ? progress.bestPosition <= 3
        ? `★ BEST / ${progress.bestPosition}${{ 1: "ST", 2: "ND", 3: "RD" }[progress.bestPosition]}`
        : `BEST / ${progress.bestPosition}TH`
      : "";
    button.querySelector(".track-progress").hidden = !progress;
    button.querySelector(".track-progress").className =
      `track-progress${progress && progress.bestPosition <= 3 ? ` trophy-${progress.bestPosition}` : ""}`;
    button.setAttribute(
      "aria-label",
      `${trackConfig.name}${unlocked ? "" : ", locked"}${progress ? `, best place ${progress.bestPosition}` : ""}`,
    );
  }
  if (!isTrackUnlocked(selectedTrack)) {
    const firstIndex = TRACKS.findIndex((_, index) => isTrackUnlocked(index));
    void selectTrack(firstIndex);
  }
  menuNavigator?.sync();
}
// Menu order is independent of the stable physics, AI and record craft IDs.
for (const i of [2, 0, 1]) {
  const c = CRAFT[i];
  const button = document.createElement("button");
  button.className = "choice";
  button.dataset.craftIndex = i;
  button.innerHTML = `<span><b>${c.name}</b><small>${c.team}</small></span>`;
  button.onclick = () => {
    selectedCraft = i;
    menuPreview.setCraft(i);
    updateCraftStats();
    updateModelName();
    for (const b of $("crafts").children) {
      const active = Number(b.dataset.craftIndex) === i;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    }
    $("craft-note").textContent = c.text.split("/")[0].trim().toUpperCase();
  };
  $("crafts").append(button);
}
refreshTrackProgression();
$("crafts").children[0].click();
menuPreview.setClass(selectedSpeedClass);
setMenuStage("mode");
$("speed-class").onchange = () => {
  selectedSpeedClass = Number(
    document.querySelector('input[name="speed-class"]:checked').value,
  );
  menuPreview.setClass(selectedSpeedClass);
  updateModelName();
  refreshTrackProgression();
};
const qualityToggle = $("quality");
qualityToggle.checked = localStorage.getItem("nv-render") !== "clean";
$("quality-clean").checked = !qualityToggle.checked;
function applyQuality() {
  world.quality = qualityToggle.checked ? "retro" : "clean";
  menuPreview.quality = world.quality;
  world.resize();
}
applyQuality();
$("render-quality").onchange = () => {
  applyQuality();
  localStorage.setItem("nv-render", world.quality);
};
window.addEventListener("resize", () => world.resize());
function clearInput() {
  keys.clear();
  touchSteer = 0;
  touchPitch = 0;
  steerPointer = null;
  resetAirStick();
  touchLaunchArmed = false;
  for (const b of document.querySelectorAll(".pressed"))
    b.classList.remove("pressed");
  $("steer-pad").querySelector("i").style.transform = "";
}
let startGeneration = 0;
async function start(event) {
  if (
    trackLoading ||
    loadedTrack !== selectedTrack ||
    !isTrackUnlocked(selectedTrack)
  )
    return;
  const generation = ++startGeneration;
  const courseGeneration = trackGeneration;
  const button = event.currentTarget;
  button.disabled = true;
  music.setTunnel(false);
  const audioStart = sound.start();
  sound.stopSamples();
  const musicStart = musicEnabled ? music.play() : Promise.resolve();
  sound.setMuted($("mute").checked);
  sound.setPaused(false);
  try {
    await Promise.all([audioStart, musicStart]);
  } catch (error) {
    if (generation !== startGeneration) return;
    sound.setPaused(true);
    window.alert(`Could not load audio: ${error.message}`);
    return;
  } finally {
    button.disabled = trackLoading || loadedTrack !== selectedTrack;
  }
  if (generation !== startGeneration || courseGeneration !== trackGeneration)
    return;
  race = new Race(
    track,
    selectedCraft,
    selectedMode(),
    selectedSpeedClass,
    world.environment.terrain,
  );
  world.setupRacers(race, CRAFT);
  world.cameraReady = false;
  last = null;
  state = "race";
  music.setMenu(false);
  paused = false;
  updateAppFocus();
  accumulator = 0;
  previousCount = "armed";
  messageUntil = 0;
  clearInput();
  $("menu").hidden = true;
  $("results").hidden = true;
  $("pause-panel").close();
  updateWeaponHUD(race.player.weapon);
  $("shield-warning").hidden = true;
  $("shield-warning").parentElement.classList.remove("critical");
  $("hud").hidden = false;
  $("hud-track").textContent =
    `${TRACKS[selectedTrack].name} / ${race.classSpec.id.toUpperCase()}`;
  if (document.hidden || !document.hasFocus()) setPaused(true);
}
function setPaused(value) {
  if (state !== "race" || race.finished || paused === value) return;
  paused = value;
  updateAppFocus();
  clearInput();
  if (paused) $("pause-panel").showModal();
  else $("pause-panel").close();
  sound.setPaused(paused);
  music.setMenu(paused);
  if (paused) music.setTunnel(false);
  else if (musicEnabled && !document.hidden && document.hasFocus())
    music.play();
  menuNavigator?.sync();
}
function quit() {
  ++startGeneration;
  state = "menu";
  paused = false;
  updateAppFocus();
  clearInput();
  $("menu").hidden = false;
  $("hud").hidden = true;
  $("pause-panel").close();
  $("results").hidden = true;
  sound.setPaused(true);
  sound.stopCrowd();
  music.setMenu(true);
  music.setTunnel(false);
  world.cameraReady = false;
}
function returnToPaddock() {
  quit();
  refreshTrackProgression();
  setMenuStage("track");
}
$("start").onclick = start;
$("again").onclick = start;
$("restart").onclick = start;
$("quit").onclick = quit;
$("result-quit").onclick = returnToPaddock;
function toggleView() {
  world.setView(world.view === "chase" ? "first-person" : "chase");
  $("view").setAttribute("aria-pressed", String(world.view === "first-person"));
}
$("view").onclick = toggleView;
$("pause").onclick = () => setPaused(!paused);
$("resume").onclick = () => setPaused(false);
$("pause-panel").addEventListener("cancel", (e) => {
  e.preventDefault();
  setPaused(false);
});
for (const [button, dialog] of [
  ["help-open", "help-dialog"],
  ["music-open", "music-dialog"],
  ["pause-music", "music-dialog"],
  ["art-open", "art-dialog"],
])
  $(button).onclick = () => {
    if (dialog === "art-dialog")
      $("concept").src =
        "/art/openai-image-2026-11-11T14-07-30-783Z-ig_04b9a94398de6a94016af4763e4cec87d2b31fcfefd192931f.png";
    $(dialog).showModal();
    menuNavigator?.sync();
  };
for (const b of document.querySelectorAll("dialog .close"))
  b.onclick = () => b.closest("dialog").close();
for (const dialog of document.querySelectorAll("dialog"))
  dialog.addEventListener("close", () => menuNavigator?.sync());
for (const d of document.querySelectorAll("dialog:not(#pause-panel)"))
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  });
$("weapon").onclick = () => {
  if (!paused) race.fire();
};
$("touch-fire").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (!paused) race.fire();
});
$("touch-fire").onclick = (e) => {
  if (e.detail === 0 && !paused) race.fire();
};
function navigationRoot() {
  const dialogs = document.querySelectorAll("dialog[open]");
  if (dialogs.length) return dialogs[dialogs.length - 1];
  if (state === "menu") return $("menu");
  if (state === "results") return $("results");
  return null;
}
menuNavigator = new MenuNavigation({
  document,
  root: navigationRoot,
  onInput: setInputMode,
  onActivate: (cursor) => {
    if (state !== "menu") return false;
    if (menuStage === "mode" && cursor.closest("#mode")) {
      cursor.querySelector("input").click();
      setMenuStage("class");
      return true;
    }
    if (menuStage === "class" && cursor.closest(".speed-choices")) {
      cursor.querySelector("input").click();
      setMenuStage("track");
      return true;
    }
    if (menuStage === "track" && cursor.closest("#tracks")) {
      cursor.click();
      setMenuStage("craft");
      return true;
    }
    if (menuStage === "craft" && cursor.closest("#crafts")) {
      cursor.click();
      $("start").click();
      return true;
    }
    return false;
  },
  onEscape: () => {
    const dialogs = document.querySelectorAll("dialog[open]");
    if (dialogs.length) {
      const dialog = dialogs[dialogs.length - 1];
      if (dialog.id === "pause-panel") setPaused(false);
      else dialog.close();
    } else if (state === "results") returnToPaddock();
    else if (state === "menu" && menuStage !== "mode")
      setMenuStage(menuStages[menuStages.indexOf(menuStage) - 1]);
    menuNavigator.sync();
  },
});
function readMenuGamepad(pad, now = performance.now()) {
  const menuActive = Boolean(navigationRoot());
  const x = pad?.axes?.[0] || 0;
  const y = pad?.axes?.[1] || 0;
  if (menuActive && (Math.abs(x) > 0.12 || Math.abs(y) > 0.12))
    padAxesConsumed = true;
  if (!pad || (Math.abs(x) < 0.12 && Math.abs(y) < 0.12))
    padAxesConsumed = false;
  menuNavigator.gamepad(menuActive ? pad : null, now);
  if (menuNavigator.lastAction === "activate") padAConsumed = true;
  if (menuNavigator.lastAction === "back" && pad?.buttons?.[9]?.pressed)
    padPauseConsumed = true;
  if (!pad?.buttons?.[0]?.pressed) padAConsumed = false;
  if (!pad?.buttons?.[9]?.pressed) padPauseConsumed = false;
}
function connectedGamepad() {
  return Array.from(navigator.getGamepads?.() || []).find(Boolean) || null;
}
function pollMenuGamepad() {
  const pad = connectedGamepad();
  const connected = String(Boolean(pad));
  if (document.body.dataset.gamepadConnected !== connected)
    document.body.dataset.gamepadConnected = connected;
  readMenuGamepad(pad);
}
window.addEventListener("keydown", (e) => {
  if (menuNavigator?.keydown(e)) return;
  if (document.querySelector("dialog[open]:not(#pause-panel)")) return;
  if (state !== "race") return;
  if (
    [
      "ArrowUp",
      "ArrowLeft",
      "ArrowRight",
      "KeyW",
      "KeyA",
      "KeyD",
      "KeyI",
      "KeyJ",
      "KeyK",
      "KeyL",
      "Space",
      "KeyV",
      "Escape",
    ].includes(e.code)
  )
    setInputMode("keyboard");
  if (e.code === "Escape") {
    e.preventDefault();
    if (!e.repeat) setPaused(!paused);
    return;
  }
  if (paused) return;
  if (["ArrowUp", "ArrowLeft", "ArrowRight", "Space"].includes(e.code))
    e.preventDefault();
  if (e.repeat) return;
  if (e.code === "KeyV") {
    e.preventDefault();
    toggleView();
    return;
  }
  keys.add(e.code);
  if (e.code === "Space") race.fire();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  if (state === "race") setPaused(true);
  clearInput();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "race") setPaused(true);
  last = null;
});
const airPad = $("air-pad");
function resetAirStick() {
  airPointer = null;
  touchAir = 0;
  touchCoast = 0;
  airPad.classList.remove("pressed");
  airPad.querySelector("i").style.transform = "";
}
function moveAir(e) {
  if (airPointer !== e.pointerId) return;
  const rect = airPad.getBoundingClientRect();
  const radius = rect.width * 0.375;
  const position = halfstickPosition(
    (e.clientX - rect.left - rect.width / 2) / radius,
    (e.clientY - rect.top - 16) / radius,
  );
  touchAir = position.x;
  touchCoast = position.y;
  if (touchCoast > 0) touchLaunchArmed = false;
  airPad.querySelector("i").style.transform =
    `translate(${touchAir * radius}px, ${touchCoast * radius}px)`;
}
airPad.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (airPointer !== null) return;
  airPointer = e.pointerId;
  airPad.setPointerCapture(e.pointerId);
  airPad.classList.add("pressed");
  moveAir(e);
});
airPad.addEventListener("pointermove", moveAir);
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  airPad.addEventListener(event, (e) => {
    if (airPointer !== e.pointerId) return;
    if (race?.countdown > 0)
      touchLaunchArmed = event === "pointerup" && touchCoast > 0;
    resetAirStick();
  });
const steerPad = $("steer-pad");
function moveSteer(e) {
  if (steerPointer !== e.pointerId) return;
  const rect = steerPad.getBoundingClientRect();
  touchSteer = clamp(
    (e.clientX - rect.left - rect.width / 2) / (rect.width * 0.4),
    -1,
    1,
  );
  touchPitch = clamp(
    (rect.top + rect.height / 2 - e.clientY) / (rect.height * 0.4),
    -1,
    1,
  );
  const visualScale = 1 / Math.max(1, Math.hypot(touchSteer, touchPitch));
  steerPad.querySelector("i").style.transform =
    `translate(${touchSteer * visualScale * rect.width * 0.32}px, ${-touchPitch * visualScale * rect.height * 0.32}px)`;
}
steerPad.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (steerPointer !== null) return;
  steerPointer = e.pointerId;
  steerPad.setPointerCapture(e.pointerId);
  moveSteer(e);
});
steerPad.addEventListener("pointermove", moveSteer);
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  steerPad.addEventListener(event, (e) => {
    if (e.pointerId !== steerPointer) return;
    touchSteer = 0;
    touchPitch = 0;
    steerPointer = null;
    steerPad.querySelector("i").style.transform = "";
  });
let lastControls = {};
let steeringKind = "digital";
let padPause = false,
  padFire = false,
  padView = false,
  padAConsumed = false,
  padAxesConsumed = false,
  padPauseConsumed = false;
let previousPadInput = [];
function input() {
  const pad = connectedGamepad();
  if (pad) {
    const values = [
      ...pad.axes
        .slice(0, 2)
        .map((value) =>
          !padAxesConsumed && Math.abs(value) > 0.12 ? value : 0,
        ),
      ...pad.buttons.map((button, index) =>
        [4, 5, 7].includes(index)
          ? button.value > 0.1
            ? button.value
            : 0
          : index === 1
            ? 0
            : Number(button.pressed),
      ),
    ];
    const active = values.some((value) => value !== 0);
    const moved = values.some(
      (value, index) =>
        Math.abs(value - (previousPadInput[index] || 0)) >
        (index < 2 ? 0.12 : 0.1),
    );
    if (active && moved) setInputMode("gamepad");
    // Keep the last deliberate position, not each noisy sample of a held stick.
    if (!active || moved) previousPadInput = values;
  }
  const down = (...codes) => codes.some((c) => keys.has(c));
  const keyboardSteer =
    (down("ArrowRight", "KeyD") ? 1 : 0) - (down("ArrowLeft", "KeyA") ? 1 : 0);
  let steer = keyboardSteer + touchSteer;
  if (keyboardSteer) steeringKind = "digital";
  if (touchSteer !== 0) steeringKind = "analog";
  let airRight = Math.max(Number(down("KeyL")), touchAir);
  let airLeft = Math.max(Number(down("KeyJ")), -touchAir);
  let pitch = (down("KeyI") ? 1 : 0) - (down("KeyK") ? 1 : 0) + touchPitch;
  let launchIntent = down("ArrowUp", "KeyW") || (touch && touchLaunchArmed);
  let throttle = touch ? 1 - touchCoast : Number(launchIntent);
  if (pad) {
    if (!padAxesConsumed && Math.abs(pad.axes[0]) > 0.12) {
      steer = pad.axes[0];
      steeringKind = "analog";
    }
    if (!padAxesConsumed && Math.abs(pad.axes[1]) > 0.12) pitch = -pad.axes[1];
    airRight = Math.max(airRight, pad.buttons[5]?.value || 0);
    airLeft = Math.max(airLeft, pad.buttons[4]?.value || 0);
    const padThrust =
      (pad.buttons[0]?.pressed && !padAConsumed ? 1 : 0) ||
      pad.buttons[7]?.value ||
      0;
    throttle = Math.max(throttle, padThrust > 0.1 ? padThrust : 0);
    launchIntent ||= padThrust > 0.1;
    if (state === "race") {
      if (pad.buttons[2]?.pressed && !padFire && !paused) race.fire();
      padFire = pad.buttons[2]?.pressed;
      if (pad.buttons[3]?.pressed && !padView && !paused) toggleView();
      padView = pad.buttons[3]?.pressed;
      if (
        pad.buttons[9]?.pressed &&
        !padPauseConsumed &&
        !padPause &&
        !document.querySelector("dialog[open]:not(#pause-panel)")
      )
        setPaused(!paused);
      padPause = pad.buttons[9]?.pressed;
    } else {
      padFire = pad.buttons[2]?.pressed;
      padView = pad.buttons[3]?.pressed;
      padPause = pad.buttons[9]?.pressed;
    }
  }
  return {
    // The road's lateral axis points camera-left when looking forward.
    steer: -clamp(steer, -1, 1),
    steeringKind,
    air: airLeft - airRight,
    airLeft,
    airRight,
    pitch: clamp(pitch, -1, 1),
    throttle: touch || race?.countdown > 0 ? throttle : Boolean(throttle),
    launchIntent,
  };
}
const mapCtx = $("map").getContext("2d");
function drawMap() {
  const ctx = mapCtx;
  ctx.clearRect(0, 0, 180, 120);
  const points = Array.from(
    { length: 100 },
    (_, i) => track.frame((i / 100) * track.length).p,
  );
  const xs = points.map((p) => p.x),
    zs = points.map((p) => p.z);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs);
  const scale = Math.min(155 / (maxX - minX), 95 / (maxZ - minZ));
  const xy = (p) => [
    90 + (p.x - (minX + maxX) / 2) * scale,
    60 + (p.z - (minZ + maxZ) / 2) * scale,
  ];
  ctx.strokeStyle = "#d9e5e5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const [x, y] = xy(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();
  for (const r of [...race.racers].reverse()) {
    if (r.eliminated) continue;
    const [x, y] = xy(track.frame(r.s, r.branch).p);
    ctx.fillStyle = r.id === 0 ? "#ff782b" : "#a2ceda";
    ctx.beginPath();
    ctx.arc(x, y, r.id === 0 ? 3.5 : 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
function showResults() {
  state = "results";
  updateAppFocus();
  music.setMenu(true);
  music.setTunnel(false);
  sound.stopEngine();
  sound.stopCrowd();
  $("results").hidden = false;
  const key = recordKey(race.mode, race.speedClass);
  const isRecord =
    race.player.finished && (!records[key] || race.resultTime < records[key]);
  if (isRecord) {
    records[key] = race.resultTime;
    localStorage.setItem("nv-records", JSON.stringify(records));
  }
  if (recordProgressionResult(progression, race, track))
    localStorage.setItem("nv-progression", JSON.stringify(progression));
  refreshTrackProgression();
  $("result-title").textContent = race.player.eliminated
    ? "ELIMINATED"
    : race.position === 1
      ? "YOU WON"
      : race.position === 8
        ? "YOU LOST"
        : `${race.position}${{ 2: "ND", 3: "RD" }[race.position] || "TH"} PLACE`;
  $("result-data").replaceChildren();
  const lines = [
    ["CLASS", `${race.classSpec.name} / ${race.lapCount} LAPS`],
    [
      race.player.eliminated ? "ELAPSED / DNF" : "TOTAL TIME",
      formatTime(race.resultTime),
      false,
      isRecord,
    ],
    ...race.laps.map((v, i) => [
      `LAP / ${i + 1}`,
      formatTime(v),
      v === race.bestLap,
      false,
    ]),
  ];
  for (const [label, value, isBestLap, isNewRecord] of lines) {
    const row = document.createElement("div");
    row.className = "result-line";
    const l = document.createElement("span");
    l.textContent = label;
    if (isBestLap) {
      const mark = document.createElement("small");
      mark.className = "result-mark best-lap-mark";
      mark.textContent = "BEST LAP";
      l.append(mark);
    }
    const v = document.createElement("b");
    const time = document.createElement("span");
    time.textContent = value;
    v.append(time);
    if (isNewRecord) {
      const mark = document.createElement("small");
      mark.className = "result-mark new-record-mark";
      mark.textContent = "NEW RECORD";
      v.append(mark);
    }
    row.append(l, v);
    $("result-data").append(row);
  }
  menuNavigator?.sync();
}
function updateHUD(now) {
  const p = race.player;
  $("position").innerHTML =
    `${race.position}<small>/${race.racers.length}</small>`;
  $("lap").innerHTML =
    `${Math.min(race.lapCount, p.lap)}<small>/${race.lapCount}</small>`;
  $("timer").textContent = formatTime(race.time);
  $("speed").textContent = String(Math.round(p.speed * 3.6)).padStart(3, "0");
  $("speed-bar").style.width =
    `${Math.min(100, (p.speed / (175 * race.classSpec.pace)) * 100)}%`;
  const launching = race.countdown > 0;
  $("thrust-system").classList.toggle("launch", launching);
  $("thrust-bar").style.width =
    `${(launching ? race.launch.level : Number(lastControls.throttle || 0)) * 100}%`;
  const timingRows = race.laps.map(
    (time, i) =>
      `<div class="lap-time"><span>LAP ${i + 1}</span><b>${formatTime(time)}</b></div>`,
  );
  if (!race.finished)
    timingRows.unshift(
      `<div class="lap-time current"><span>CURRENT</span><b>${formatTime(race.time - race.lapStart)}</b></div>`,
    );
  $("lap-times").innerHTML = timingRows.join("");
  $("shield-num").textContent = Math.ceil(p.shield);
  $("shield-bar").style.width = `${p.shield}%`;
  $("shield-bar").style.background = race.criticalShield
    ? "#ff642a"
    : "#d4f53c";
  $("shield-warning").hidden = !race.criticalShield;
  $("shield-warning").parentElement.classList.toggle(
    "critical",
    race.criticalShield,
  );
  updateWeaponHUD(p.weapon);
  if (race.countdown > 0) {
    $("race-message").className = "";
    $("race-message").textContent = "";
  } else {
    $("race-message").className = "";
    if (now > messageUntil) $("race-message").textContent = "";
  }
  drawMap();
}
let hudTick = 0;
function animate(now) {
  const dt = frameDelta(last, now);
  last = now;
  pollMenuGamepad();
  menuNavigator?.sync();
  if (state === "menu") {
    demoDistance += dt * 32;
    race.player.s = demoDistance;
    race.player.speed = 65;
    for (const r of race.racers.slice(1)) {
      r.s = demoDistance + 45 + r.id * 15;
      r.x = Math.sin(r.id) * 4;
    }
    for (const r of race.racers) {
      const u = mod(r.s, track.length) / track.length;
      r.branch =
        u > track.config.split[0] && u < track.config.split[1]
          ? r.id % 2
            ? 1
            : -1
          : 0;
      const f = track.frame(r.s, r.branch);
      r.position
        .copy(f.p)
        .addScaledVector(f.right, r.x)
        .addScaledVector(f.up, 1.6);
      r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
      r.contactS = r.s;
    }
    world.draw(race, dt, true);
    menuPreview.draw(dt);
  } else {
    const controls = input();
    lastControls = controls;
    if (!paused && state === "race") {
      const previousSpeed = race.player.speed;
      accumulator += dt;
      while (accumulator >= 1 / 120) {
        race.update(1 / 120, controls);
        accumulator -= 1 / 120;
      }
      // Dispatch on the same frame as the physical board, not the HUD cadence.
      const count = countdownBoardStage(race);
      if (count !== previousCount) {
        if (count === "GO") sound.effect("go");
        else if (typeof count === "number") sound.effect("countdown", count);
        previousCount = count;
      }
      music.setTunnel(
        race.player.grounded &&
          track.isTunnel(race.player.contactS, race.player.branch),
      );
      for (const event of race.events) {
        if (["hit", "scrape", "land"].includes(event.kind))
          world.burst(race.player, event.kind, event.text);
        sound.raceEvent(event, race, race.lapCount);
      }
      race.events.length = 0;
      sound.update(
        race.player.speed / (175 * race.classSpec.pace),
        race.player.boost,
        {
          ...controls,
          acceleration: dt > 0 ? (race.player.speed - previousSpeed) / dt : 0,
          slip: race.player.vx,
          grounded: race.player.grounded,
        },
      );
      crowdRight.setFromMatrixColumn(world.camera.matrixWorld, 0);
      sound.updateCrowd(
        getCrowdMix(
          race.player.position,
          crowdRight,
          world.finishDistrict.foundations,
        ),
      );
      hudTick += dt;
      if (hudTick > 0.05) {
        updateHUD(now);
        hudTick = 0;
      }
      if (race.finished) {
        updateHUD(now);
        showResults();
      }
    } else if (state === "results" && !race.complete) {
      accumulator += dt;
      while (accumulator >= 1 / 120) {
        race.update(1 / 120, {});
        accumulator -= 1 / 120;
      }
      race.events.length = 0;
    }
    world.draw(race, paused ? 0 : dt, false, controls.steeringKind);
  }
  // Downshift expensive clean rendering only after sustained slow frame timing.
  if (state === "race" && !paused) {
    renderFrames++;
    renderTime += dt;
    if (renderTime >= 2.5) {
      if (renderTime / renderFrames > 0.027 && world.quality === "clean") {
        world.quality = "retro";
        menuPreview.quality = world.quality;
        qualityToggle.checked = true;
        world.resize();
      }
      renderFrames = 0;
      renderTime = 0;
    }
  }
  requestAnimationFrame(animate);
}

async function loadFiles(files) {
  await music.loadFiles(files);
  if (files.length) {
    musicEnabled = true;
    musicInterrupted = false;
    await music.play();
  }
}
$("folder").onchange = (e) => loadFiles(e.target.files);
$("files").onchange = (e) => loadFiles(e.target.files);
$("music-play").onclick = () => {
  musicEnabled = music.audio.paused;
  musicInterrupted = false;
  if (musicEnabled) music.play();
  else music.pause();
};
$("music-next").onclick = () => {
  musicEnabled = true;
  musicInterrupted = false;
  music.next();
};
$("music-default").onclick = () => {
  music.loadTracks(soundtrack, { shuffle: true });
  musicEnabled = true;
  musicInterrupted = false;
  music.play();
};
$("volume").oninput = (e) => (music.volume = Number(e.target.value));
$("effects-volume").oninput = (e) => sound.setVolume(Number(e.target.value));
sound.setVolume(0.8);
$("mute").onchange = (e) => sound.setMuted(e.target.checked);
let dragDepth = 0;
window.addEventListener("dragenter", (e) => {
  if (e.dataTransfer.types.includes("Files")) {
    e.preventDefault();
    dragDepth++;
    $("drop-zone").hidden = false;
  }
});
window.addEventListener("dragover", (e) => {
  if (e.dataTransfer.types.includes("Files")) e.preventDefault();
});
window.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dragDepth--;
  if (dragDepth <= 0) $("drop-zone").hidden = true;
});
async function readEntry(entry) {
  if (entry.isFile)
    return new Promise((resolve, reject) =>
      entry.file((file) => resolve([file]), reject),
    );
  const reader = entry.createReader();
  let files = [];
  while (true) {
    const entries = await new Promise((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (!entries.length) break;
    for (const child of entries) files.push(...(await readEntry(child)));
  }
  return files;
}
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  dragDepth = 0;
  $("drop-zone").hidden = true;
  if (state === "race") setPaused(true);
  try {
    const entries = [...e.dataTransfer.items]
      .map((i) => i.webkitGetAsEntry?.())
      .filter(Boolean);
    const files = entries.length
      ? (await Promise.all(entries.map(readEntry))).flat()
      : [...e.dataTransfer.files];
    await loadFiles(files);
    $("music-dialog").showModal();
  } catch (error) {
    $("music-status").textContent = `FILE ERROR / ${error.message}`;
    $("music-dialog").showModal();
  }
});
await selectTrack(selectedTrack);
await initialCourseReady;
requestAnimationFrame(animate);

// Read-only telemetry for the pilot and browser smoke tests. No external services.
window.nullVector = {
  get telemetry() {
    return {
      state,
      menuStage,
      selectedTrack,
      loadedTrack,
      trackLoading,
      trackLoadTiming,
      selectedCraft,
      paused,
      time: race.time,
      position: race.position,
      speed: race.player.speed,
      lateralPosition: race.player.x,
      yaw: race.player.yaw,
      pitch: race.player.pitch,
      view: world.view,
      controls: { ...lastControls },
      yawRate: race.player.yawRate,
      roll: world.ships[0].rotation.z,
      worldPosition: race.player.position.toArray(),
      velocity: race.player.velocity.toArray(),
      grounded: race.player.grounded,
      boost: race.player.boost,
      screenOffset:
        world.ships[0].position.clone().project(world.camera).x -
        track.frame(race.player.s, race.player.branch).p.project(world.camera)
          .x,
      progress: mod(race.player.s, track.length) / track.length,
      raceProgress:
        mod(race.player.s - track.finishS, track.length) / track.length,
      finishS: track.finishS,
      lap: race.player.lap,
      laps: race.lapCount,
      speedClass: race.speedClass,
      classId: race.classSpec.id,
      layoutId: track.config.layoutId,
      trackLength: track.length,
      physicalLength: track.physicalLength,
      menuRacers:
        state === "menu"
          ? race.racers.map((r) => ({
              id: r.id,
              s: r.s,
              branch: r.branch,
              x: r.x,
              position: r.position.toArray(),
            }))
          : undefined,
      countdown: race.countdown,
      launch: { ...race.launch },
      lapTimes: [...race.laps],
      currentLapTime: race.time - race.lapStart,
      branch: race.player.branch,
      height: race.player.h,
      shield: race.player.shield,
      weapon: race.player.weapon,
      menuModelRotation:
        state === "menu"
          ? (menuStage === "class"
              ? menuPreview.classModel
              : menuStage === "craft"
                ? menuPreview.craft
                : menuPreview.coursePivot
            ).rotation.y
          : null,
      resources: { ...world.renderer.info.memory },
      previewResources: menuPreview.resources,
      drawCalls: world.renderer.info.render.calls,
      triangles: world.renderer.info.render.triangles,
      render: world.quality,
    };
  },
};
