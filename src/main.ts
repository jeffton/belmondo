import "./style.css";
import "./console-menu.css";
import "./console-dialogs.css";
import { designBoards } from "./design-study.ts";
import "./race-hud.css";
import "./league-team.css";
import { teamEmblem } from "./league-teams.ts";
import { Vector3 } from "three";
import { TRACKS, makeTrack, mod } from "./track.ts";
import { Race, CRAFT, SPEED_CLASSES, LAPS_BY_CLASS } from "./race.ts";
import type { RaceInput } from "./race.ts";
import type { Track } from "./track.ts";
import { World } from "./world.ts";
import { AudioEngine } from "./audio.ts";
import { countdownBoardStage } from "./start-gantry.ts";
import { getCrowdMix } from "./crowd.ts";
import { localRecordKey } from "./records.ts";
import {
  createCircuitTestAccess,
  mountCircuitTestAccess,
} from "./circuit-test-access.ts";
import "./circuit-test-access.css";
import {
  loadProgression,
  recordProgressionResult,
  speedClassIsUnlocked,
  trackIsUnlocked,
  trackProgress,
} from "./progression.ts";
import { installZoomPolicy } from "./zoom-policy.ts";
import { MenuPreview } from "./menu-preview.ts";
import { PodiumTrophy } from "./podium-trophy.ts";
import { MenuNavigation } from "./menu-navigation.ts";
import { MenuFeedback } from "./menu-feedback.ts";
import { frameDelta } from "./frame-clock.ts";
import { CoursePreparation } from "./course-preparation.ts";
import { GamepadRumble } from "./gamepad-rumble.ts";

import { $ } from "./app-elements.ts";
import { createFlightInput } from "./app-flight-input.ts";
import {
  createRaceHUD,
  createWeaponDisplay,
  renderResultSheet,
  setTeamPalette,
} from "./app-race-displays.ts";
import { createSoundtrack } from "./app-soundtrack.ts";
import { installTelemetry } from "./app-telemetry.ts";

const rumble = new GamepadRumble();
window.addEventListener("gamepaddisconnected", () => rumble.stop());
window.addEventListener("pagehide", () => rumble.stop());

installZoomPolicy();
const standalonePortrait = matchMedia(
  "(display-mode: standalone) and (orientation: portrait), (display-mode: fullscreen) and (orientation: portrait)",
);
const visualViewport = window.visualViewport;
let standaloneVisibleHeight = "";
function updateStandaloneHeight() {
  // iOS can include system chrome in lvh even when the visible webview is shorter.
  const height =
    standalonePortrait.matches && visualViewport?.scale === 1
      ? `${visualViewport.height}px`
      : "";
  if (height === standaloneVisibleHeight) return;
  standaloneVisibleHeight = height;
  document.documentElement.style.setProperty(
    "--standalone-visible-height",
    height,
  );
}
updateStandaloneHeight();
await document.fonts.load('700 16px "Noto Sans JP"');
type MenuStage = "mode" | "class" | "track" | "craft";
const updateWeaponHUD = createWeaponDisplay();
const sound = new AudioEngine();
const crowdRight = new Vector3();
const soundtrack = createSoundtrack(sound, () => state === "menu");
const { music, startMenuMusic } = soundtrack;
let world: World;
try {
  world = new World($("game"));
} catch (error) {
  $("fatal").hidden = false;
  $("fatal").textContent =
    `Could not initialize WebGL2. Enable hardware acceleration to race. ${(error as Error).message}`;
  throw error;
}
const menuPreview = new MenuPreview($("menu-model"));
const podiumTrophy = new PodiumTrophy($("result-heading"));
let menuStage: MenuStage = "mode";
const menuStages: MenuStage[] = ["mode", "class", "track", "craft"];
let menuNavigator: MenuNavigation;
function setMenuStage(stage: MenuStage) {
  const commandFocused = document.activeElement?.closest(".setup-navigation");
  if (menuStage === "craft" && stage !== "craft") cancelStart();
  menuStage = stage;
  $("menu").dataset.stage = stage;
  for (const panel of document.querySelectorAll<HTMLElement>("[data-panel]"))
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
    if (commandFocused) menuNavigator.focusCursor();
  }
}
function updateCraftStats() {
  const craft = CRAFT[selectedCraft];
  $("craft-stats").style.setProperty(
    "--craft-accent",
    `#${craft.color.toString(16).padStart(6, "0")}`,
  );
  $("craft-stats").innerHTML = (
    [
      ["thrust", "THRUST"],
      ["handling", "HANDLING"],
      ["armor", "ARMOR"],
    ] satisfies [
      keyof Pick<(typeof CRAFT)[number], "thrust" | "handling" | "armor">,
      string,
    ][]
  )
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
  track: Track,
  race: Race;
let state: "menu" | "race" | "results" = "menu",
  paused = false,
  accumulator = 0,
  last: number | null = null,
  previousCount: ReturnType<typeof countdownBoardStage> = "armed";
soundtrack.mountMenuGestures();
function updateAppFocus() {
  const inactive = document.hidden || !document.hasFocus();
  document.body.classList.toggle(
    "race-active",
    state === "race" && !paused && !inactive,
  );
  soundtrack.updateFocus(inactive);
}
window.addEventListener("blur", updateAppFocus);
window.addEventListener("focus", updateAppFocus);
document.addEventListener("visibilitychange", updateAppFocus);
let demoDistance = 50,
  renderFrames = 0,
  renderTime = 0;
const {
  setInputMode,
  clearInput,
  pollMenuGamepad,
  input,
  mountWeaponCommands,
  mountFlightControls,
} = createFlightInput(rumble, {
  getRace: () => race,
  isRacing: () => state === "race",
  isPaused: () => paused,
  getNavigator: () => menuNavigator,
  navigationRoot,
  resumeMenuCursor: (cursor) => {
    if (!menuNavigator) return;
    menuNavigator.cursor = cursor;
    menuNavigator.sync();
  },
  startMenuMusic,
  togglePauseFromInput,
  toggleView,
  pause: () => setPaused(true),
  resetClock: () => {
    last = null;
  },
});
const records: Record<string, number> = JSON.parse(
  localStorage.getItem("nv-records") || "{}",
);
const progression = loadProgression(localStorage);
// Discard the old persisted override without touching records or progression.
localStorage.removeItem("nv-test-access");
const circuitTestAccess = createCircuitTestAccess(() => {
  cancelStart();
  updateTestAccessBadge();
  refreshTrackProgression();
});
const updateTestAccessBadge = mountCircuitTestAccess(
  circuitTestAccess,
  () => state === "menu",
);
function selectedMode() {
  return document.querySelector<HTMLInputElement>('input[name="mode"]:checked')!
    .value as "race" | "trial";
}
function recordKey(
  mode: string = selectedMode(),
  speedClass = selectedSpeedClass,
) {
  return localRecordKey(
    TRACKS[selectedTrack].layoutId,
    selectedCraft,
    mode,
    SPEED_CLASSES[speedClass],
    LAPS_BY_CLASS[speedClass],
  );
}
const coursePreparation = new CoursePreparation();
let resolveInitialCourse: () => void;
const initialCourseReady = new Promise<void>((resolve) => {
  resolveInitialCourse = resolve;
});
let trackGeneration = 0;
let trackLoading = false;
let loadedTrack = -1;
let courseLoad: Promise<boolean>;
let courseError = "";
let pendingStart: { button: HTMLButtonElement } | null = null;
function updateStartStatus() {
  const button = $("start");
  button.textContent = pendingStart
    ? trackLoading
      ? "LOADING…"
      : "STARTING…"
    : courseError
      ? "RETRY"
      : "START";
  button.disabled = Boolean(pendingStart);
  const status = $("start-status");
  const message =
    courseError ||
    (pendingStart
      ? trackLoading
        ? `Preparing ${TRACKS[selectedTrack].name}…`
        : "Starting race…"
      : "");
  status.textContent = message;
  status.classList.toggle("error", Boolean(courseError));
}
function cancelStart() {
  if (!pendingStart) return;
  pendingStart.button.disabled = false;
  pendingStart = null;
  updateStartStatus();
}
let trackLoadTiming: {
  totalMs: number;
  buildMs: number;
  workerMs: number;
} | null = null;
function isTrackUnlocked(index: number) {
  return (
    circuitTestAccess.enabled ||
    trackIsUnlocked(
      progression,
      SPEED_CLASSES[selectedSpeedClass].id,
      TRACKS[index].layoutId,
      index,
      TRACKS,
    )
  );
}
function selectTrack(i: number) {
  if (!isTrackUnlocked(i)) return;
  if (i === selectedTrack && (trackLoading || loadedTrack === i)) return;
  cancelStart();
  courseLoad = prepareTrack(i);
}
function showCourseLoading(i: number) {
  document.body.classList.add("course-loading");
  $("tracks").setAttribute("aria-busy", "true");
  updateModelName();
  $("circuit-name").textContent = TRACKS[i].name;
  for (const b of $("tracks").children) {
    const active = Number(b.dataset.index) === i;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  }
}
async function prepareTrack(i: number) {
  selectedTrack = i;
  const generation = ++trackGeneration;
  const isCurrent = () => generation === trackGeneration;
  const start = performance.now();
  trackLoading = true;
  courseError = "";
  updateStartStatus();
  showCourseLoading(i);
  try {
    const nextTrack = makeTrack(i);
    menuPreview.setTrack(nextTrack);
    const prepared = await coursePreparation.load(i);
    if (!prepared || !isCurrent()) return false;
    const buildStart = performance.now();
    let nextRace!: Race;
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
    if (!candidate || !isCurrent()) return false;
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
    return true;
  } catch (error) {
    if (isCurrent()) {
      courseError = `Could not load ${TRACKS[i].name}: ${(error as Error).message}`;
      console.error(courseError, error);
    }
    return false;
  } finally {
    if (isCurrent()) {
      trackLoading = false;
      document.body.classList.toggle(
        "course-loading",
        loadedTrack !== selectedTrack,
      );
      $("tracks").setAttribute("aria-busy", "false");
      updateStartStatus();
    }
  }
}
for (const [i, t] of TRACKS.entries()) {
  const button = document.createElement("button");
  button.className = "choice";
  button.dataset.index = String(i);
  button.innerHTML = `<b>${t.name}</b><small class="track-progress" hidden></small><small class="track-lock choice-lock" hidden>🔒 LOCKED</small><svg class="track-trophy" viewBox="0 0 32 40" aria-hidden="true" focusable="false" hidden><path fill="currentColor" d="M7 2h18v5h7v9l-8 7h-3l-3 4v6h7v5H7v-5h7v-6l-3-4H8l-8-7V7h7Zm0 9H4v3l4 4Zm18 0-1 7 4-4v-3Z"/><path fill="var(--ink)" opacity=".25" d="M16 5h6l-3 15-3 4Zm0 29h7v2h-7Z"/></svg>`;
  button.onclick = () => selectTrack(i);
  $("tracks").append(button);
}
const supernovaOption = document.querySelector<HTMLInputElement>(
  'input[name="speed-class"][value="3"]',
)!;
function setSelectedSpeedClass(index: number) {
  if (index !== selectedSpeedClass) cancelStart();
  selectedSpeedClass = index;
  menuPreview.setClass(index);
  updateModelName();
}
function updateTrackCard(
  button: HTMLButtonElement,
  classId: (typeof SPEED_CLASSES)[number]["id"],
) {
  const index = Number(button.dataset.index);
  const trackConfig = TRACKS[index];
  const unlocked = isTrackUnlocked(index);
  const progress = trackProgress(progression, classId, trackConfig.layoutId);
  button.disabled = !unlocked;
  button.classList.toggle("locked", !unlocked);
  button.querySelector<HTMLElement>(".track-lock")!.hidden = unlocked;
  button.querySelector<HTMLElement>(".track-progress")!.textContent = progress
    ? progress.bestPosition <= 3
      ? `★ BEST / ${progress.bestPosition}${({ 1: "ST", 2: "ND", 3: "RD" } as Record<number, string>)[progress.bestPosition]}`
      : `BEST / ${progress.bestPosition}TH`
    : "";
  button.querySelector<HTMLElement>(".track-progress")!.hidden = !progress;
  button.querySelector<HTMLElement>(".track-progress")!.className =
    `track-progress${progress && progress.bestPosition <= 3 ? ` trophy-${progress.bestPosition}` : ""}`;
  // Time Attack shares circuit access, not Combat finishing positions.
  const trophyPosition =
    selectedMode() === "race" && progress?.bestPosition <= 3
      ? progress.bestPosition
      : null;
  const trophy = button.querySelector<SVGElement>(".track-trophy")!;
  trophy.toggleAttribute("hidden", !trophyPosition);
  trophy.dataset.place = String(trophyPosition ?? "");
  button.classList.toggle("has-trophy", Boolean(trophyPosition));
  button.setAttribute(
    "aria-label",
    `${trackConfig.name}${unlocked ? "" : ", locked"}${progress ? `, best place ${progress.bestPosition}` : ""}`,
  );
}
function refreshTrackProgression() {
  const supernovaUnlocked = speedClassIsUnlocked(
    progression,
    SPEED_CLASSES[Number(supernovaOption.value)].id,
    TRACKS,
    circuitTestAccess.enabled,
  );
  supernovaOption.disabled = !supernovaUnlocked;
  $("supernova-lock").hidden = supernovaUnlocked;
  if (supernovaOption.checked && !supernovaUnlocked) {
    // Test access can be disabled from any paddock stage. Fall back before
    // refreshing circuit access or allowing a queued start to proceed.
    const singularity = document.querySelector<HTMLInputElement>(
      'input[name="speed-class"][value="2"]',
    )!;
    singularity.checked = true;
    setSelectedSpeedClass(Number(singularity.value));
  }
  const classId = SPEED_CLASSES[selectedSpeedClass].id;
  for (const button of $("tracks").children) updateTrackCard(button, classId);
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
  button.dataset.craftIndex = String(i);
  setTeamPalette(button, i);
  button.innerHTML = `${teamEmblem(i)}<span><b>${c.name}</b><small>${c.text.split("/")[0].trim().toUpperCase()}</small></span>`;
  button.onclick = () => {
    if (selectedCraft !== i) cancelStart();
    selectedCraft = i;
    menuPreview.setCraft(i);
    updateCraftStats();
    updateModelName();
    for (const b of $("crafts").children) {
      const active = Number(b.dataset.craftIndex) === i;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    }
  };
  $("crafts").append(button);
}
refreshTrackProgression();
$("crafts").children[0].click();
menuPreview.setClass(selectedSpeedClass);
setMenuStage("mode");
$("mode").onchange = refreshTrackProgression;
$("speed-class").onchange = () => {
  setSelectedSpeedClass(
    Number(
      document.querySelector<HTMLInputElement>(
        'input[name="speed-class"]:checked:not(:disabled)',
      )!.value,
    ),
  );
  refreshTrackProgression();
};
const qualityToggle = $("quality");
qualityToggle.checked = localStorage.getItem("nv-render") !== "clean";
function applyQuality() {
  $("quality-state").textContent = qualityToggle.checked ? "ON" : "OFF";
  world.quality = qualityToggle.checked ? "retro" : "clean";
  menuPreview.quality = world.quality;
  world.resize();
}
applyQuality();
$("render-quality").onchange = () => {
  applyQuality();
  localStorage.setItem("nv-render", world.quality);
};
// CSS can settle after World starts, without a window resize (notably WebKit).
// Watch the actual game box, not the browser viewport.
const gameCanvas = $("game");
new ResizeObserver(() => {
  // Until the stylesheet fixes the box, buffer size is also its layout size.
  if (getComputedStyle(gameCanvas).position === "fixed") world.resize();
}).observe(gameCanvas);
window.addEventListener("resize", updateStandaloneHeight);
visualViewport?.addEventListener("resize", updateStandaloneHeight);
standalonePortrait.addEventListener("change", updateStandaloneHeight);
window.addEventListener("pageshow", updateStandaloneHeight);
updateStandaloneHeight();
async function start(event: MouseEvent) {
  if (
    pendingStart ||
    !isTrackUnlocked(selectedTrack) ||
    !speedClassIsUnlocked(
      progression,
      SPEED_CLASSES[selectedSpeedClass].id,
      TRACKS,
      circuitTestAccess.enabled,
    )
  )
    return;
  if (!trackLoading && loadedTrack !== selectedTrack)
    selectTrack(selectedTrack);
  const attempt = { button: event.currentTarget as HTMLButtonElement };
  pendingStart = attempt;
  attempt.button.disabled = true;
  updateStartStatus();

  // Unlock audio within the original gesture, not after the worker resolves.
  music.setTunnel(false);
  const audioStart = sound.start().then(
    () => null,
    (error: Error) => error,
  );
  if (soundtrack.enabled) void music.play();
  sound.stopSamples();

  // A failed course load must release START even if audio is still pending.
  const courseReady = await courseLoad;
  if (pendingStart !== attempt) return;
  if (!courseReady) {
    cancelStart();
    return;
  }
  const audioError = await audioStart;
  if (pendingStart !== attempt) return;
  cancelStart();
  if (audioError) {
    window.alert(`Could not load audio: ${audioError.message}`);
    return;
  }
  beginRace();
}
function beginRace() {
  sound.setPaused(false);
  race = new Race(
    track,
    selectedCraft,
    selectedMode(),
    selectedSpeedClass,
    world.environment.terrain,
  );
  race.testAccess = circuitTestAccess.enabled;
  world.setupRacers(race, CRAFT);
  world.cameraReady = false;
  last = null;
  state = "race";
  podiumTrophy.clear();
  $("results").classList.remove("has-podium");
  music.setMenu(false);
  paused = false;
  updateAppFocus();
  accumulator = 0;
  previousCount = "armed";
  clearInput();
  $("menu").hidden = true;
  $("results").hidden = true;
  $("pause-panel").close();
  updateWeaponHUD(race.player.weapon);
  $("shield-warning").hidden = true;
  $("shield-warning").parentElement!.classList.remove("critical");
  $("hud").hidden = false;
  $("hud-track").textContent =
    `${TRACKS[selectedTrack].name} / ${race.classSpec.id.toUpperCase()}`;
  if (document.hidden || !document.hasFocus()) setPaused(true);
}
function setPaused(value: boolean) {
  if (state !== "race" || race.finished || paused === value) return;
  if (!value) cancelStart();
  paused = value;
  updateAppFocus();
  clearInput();
  if (paused) $("pause-panel").showModal();
  else $("pause-panel").close();
  sound.setPaused(paused);
  music.setMenu(paused);
  if (paused) music.setTunnel(false);
  else if (soundtrack.enabled && !document.hidden && document.hasFocus())
    music.play();
  menuNavigator?.sync();
}
function quit() {
  cancelStart();
  state = "menu";
  paused = false;
  updateAppFocus();
  clearInput();
  $("menu").hidden = false;
  $("hud").hidden = true;
  $("pause-panel").close();
  $("results").hidden = true;
  podiumTrophy.clear();
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
  menuNavigator.focusCursor();
}
$("start").onclick = start;
$("again").onclick = start;
$("restart").onclick = start;
$("quit").onclick = returnToPaddock;
$("result-quit").onclick = returnToPaddock;
function toggleView() {
  world.setView(world.view === "chase" ? "first-person" : "chase");
  $("view").setAttribute("aria-pressed", String(world.view === "first-person"));
}
$("view").onclick = toggleView;
function togglePauseFromInput() {
  const before = paused;
  setPaused(!paused);
  if (paused !== before) sound.menuCue(paused ? "confirm" : "back");
}
$("pause").onclick = togglePauseFromInput;
$("resume").onclick = () => setPaused(false);
$("pause-panel").addEventListener("cancel", (e) => {
  e.preventDefault();
  setPaused(false);
});
function openAuxiliaryDialog(
  id: "help-dialog" | "music-dialog" | "art-dialog",
) {
  cancelStart();
  if (id === "art-dialog") renderDesignBoard();
  $(id).showModal();
  menuNavigator?.sync();
}
for (const [button, dialog] of [
  ["help-open", "help-dialog"],
  ["music-open", "music-dialog"],
  ["pause-music", "music-dialog"],
  ["art-open", "art-dialog"],
] as const)
  $(button).onclick = () => openAuxiliaryDialog(dialog);
let designPage = 0;
function renderDesignBoard() {
  const board = designBoards[designPage];
  $("concept").alt = board.alt;
  if ($("concept").getAttribute("src") !== board.src)
    $("concept").src = board.src;
  $("art-title").textContent = board.title;
  $("art-page").textContent = `${designPage + 1} / ${designBoards.length}`;
}
function turnDesignBoard(delta: number) {
  designPage = mod(designPage + delta, designBoards.length);
  renderDesignBoard();
}
$("art-prev").onclick = () => turnDesignBoard(-1);
$("art-next").onclick = () => turnDesignBoard(1);
for (const b of document.querySelectorAll<HTMLButtonElement>("dialog .close"))
  b.onclick = () => b.closest("dialog")!.close();
for (const dialog of document.querySelectorAll("dialog"))
  dialog.addEventListener("close", () => menuNavigator?.sync());
for (const d of document.querySelectorAll<HTMLDialogElement>(
  "dialog:not(#pause-panel)",
))
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      ) {
        d.close();
        sound.menuCue("back");
      }
    }
  });
mountWeaponCommands();
function navigationRoot() {
  const dialogs = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
  if (dialogs.length) return dialogs[dialogs.length - 1];
  if (state === "menu") return $("menu");
  if (state === "results") return $("results");
  return null;
}
const menuFeedback = new MenuFeedback({
  document,
  root: navigationRoot,
  snapshot: () =>
    JSON.stringify([
      state,
      paused,
      menuStage,
      navigationRoot()?.id,
      designPage,
      menuNavigator?.cursor?.outerHTML,
      selectedTrack,
      selectedCraft,
      selectedSpeedClass,
      selectedMode(),
      [
        ...document.querySelectorAll<HTMLInputElement>(
          'input[type="range"], input[type="checkbox"]',
        ),
      ].map((input) => [input.id, input.value, input.checked]),
    ]),
  play: (kind) => sound.menuCue(kind),
});
menuNavigator = new MenuNavigation({
  document,
  feedback: menuFeedback,
  root: navigationRoot,
  onInput: setInputMode,
  onDirection: (direction) => {
    if (
      navigationRoot()?.id !== "art-dialog" ||
      (direction !== "left" && direction !== "right")
    )
      return false;
    turnDesignBoard(direction === "left" ? -1 : 1);
    return true;
  },
  onActivate: (cursor) => {
    if (state !== "menu") return false;
    if (menuStage === "mode" && cursor.closest("#mode")) {
      cursor.querySelector("input")!.click();
      setMenuStage("class");
      return true;
    }
    if (menuStage === "class" && cursor.closest(".speed-choices")) {
      cursor.querySelector("input")!.click();
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
    const dialogs =
      document.querySelectorAll<HTMLDialogElement>("dialog[open]");
    if (dialogs.length) {
      const dialog = dialogs[dialogs.length - 1];
      if (dialog.id === "pause-panel") setPaused(false);
      else dialog.close();
    } else if (state === "menu" && menuStage !== "mode")
      setMenuStage(menuStages[menuStages.indexOf(menuStage) - 1]);
    menuNavigator.sync();
  },
});
mountFlightControls();
let lastControls: RaceInput = {};
const updateHUD = createRaceHUD(updateWeaponHUD);
function showResults() {
  rumble.stop();
  state = "results";
  updateAppFocus();
  music.setMenu(true);
  music.setTunnel(false);
  sound.stopEngine();
  sound.stopCrowd();
  $("results").hidden = false;
  podiumTrophy.setResult(race);
  $("results").classList.toggle("has-podium", Boolean(podiumTrophy.place));
  const key = recordKey(race.mode, race.speedClass);
  const isRecord =
    !race.testAccess &&
    race.player.finished &&
    (!records[key] || race.resultTime! < records[key]);
  if (isRecord) {
    records[key] = race.resultTime!;
    localStorage.setItem("nv-records", JSON.stringify(records));
  }
  if (!race.testAccess && recordProgressionResult(progression, race, track))
    localStorage.setItem("nv-progression", JSON.stringify(progression));
  refreshTrackProgression();
  renderResultSheet(race, isRecord);
  menuNavigator?.sync();
}
let hudTick = 0;
function drawPaddockRace(dt: number) {
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
}
function advanceRace(dt: number, now: number, controls: RaceInput) {
  const previousSpeed = race.player.speed;
  accumulator += dt;
  while (accumulator >= 1 / 120) {
    race.update(1 / 120, controls);
    accumulator -= 1 / 120;
  }
  // Dispatch on the same frame as the physical board, not the HUD cadence.
  const count = countdownBoardStage(race);
  if (count !== previousCount) {
    if (count === "GO") {
      sound.effect("go");
      if (race.launch.success) race.events.push({ kind: "launch" });
    } else if (typeof count === "number") sound.effect("countdown", count);
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
  rumble.events(race.events, now);
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
    updateHUD(race, track, lastControls);
    hudTick = 0;
  }
  if (race.finished) {
    updateHUD(race, track, lastControls);
    showResults();
  }
}
function updateAdaptiveQuality(dt: number) {
  // Downshift expensive clean rendering only after sustained slow frame timing.
  if (state === "race" && !paused) {
    renderFrames++;
    renderTime += dt;
    if (renderTime >= 2.5) {
      if (renderTime / renderFrames > 0.027 && world.quality === "clean") {
        qualityToggle.checked = true;
        applyQuality();
      }
      renderFrames = 0;
      renderTime = 0;
    }
  }
}
function animate(now: number) {
  const dt = frameDelta(last, now);
  last = now;
  pollMenuGamepad();
  menuNavigator?.sync();
  if (state === "menu" && loadedTrack >= 0) {
    drawPaddockRace(dt);
  }
  if (state === "menu") {
    menuPreview.draw(dt);
  } else {
    const controls = input();
    lastControls = controls;
    if (!paused && state === "race") {
      advanceRace(dt, now, controls);
    } else if (state === "results") {
      accumulator += dt;
      while (accumulator >= 1 / 120) {
        race.update(1 / 120, {});
        accumulator -= 1 / 120;
      }
      race.events.length = 0;
    }
    world.draw(race, paused ? 0 : dt, false, controls.steeringKind);
  }
  if (state === "results") podiumTrophy.draw(dt);
  updateAdaptiveQuality(dt);
  requestAnimationFrame(animate);
}

soundtrack.mountMusicDialog({
  cancelStart,
  pauseRace: () => {
    if (state === "race") setPaused(true);
  },
  openMusicDialog: () => openAuxiliaryDialog("music-dialog"),
});
selectTrack(selectedTrack);
// Menu input and previews must work even before the first world is adopted.
requestAnimationFrame(animate);
await initialCourseReady;

installTelemetry(() => ({
  state,
  menuStage,
  selectedTrack,
  loadedTrack,
  trackLoading,
  trackLoadTiming,
  selectedCraft,
  paused,
  race,
  world,
  track,
  lastControls,
  menuPreview,
}));
