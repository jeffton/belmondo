import "./style.css";
import "./console-menu.css";
import "./console-dialogs.css";
import { designBoards } from "./design-study.ts";
import "./race-hud.css";
import "./league-team.css";
import { LEAGUE_TEAMS, teamEmblem } from "./league-teams.ts";
import { Vector3 } from "three";
import { TRACKS, makeTrack, clamp, mod } from "./track.ts";
import { Race, CRAFT, SPEED_CLASSES, LAPS_BY_CLASS } from "./race.ts";
import type { RaceInput } from "./race.ts";
import type { Track } from "./track.ts";
import { World } from "./world.ts";
import { AudioEngine } from "./audio.ts";
import { countdownBoardStage } from "./start-gantry.ts";
import { getCrowdMix } from "./crowd.ts";
import { MusicPlayer } from "./music.ts";
import { soundtrack } from "./soundtrack.ts";
import { createWeaponHUD } from "./weapon-ui.ts";
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
import { toKilometresPerHour } from "./units.ts";
import { halfstickPosition } from "./touch-halfstick.ts";
import { CoursePreparation } from "./course-preparation.ts";
import { gamepadFlightControls } from "./gamepad-controls.ts";
import { GamepadRumble } from "./gamepad-rumble.ts";

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
type InputMode = "keyboard" | "gamepad" | "touch";
type MenuStage = "mode" | "class" | "track" | "craft";
type UIElements = {
  game: HTMLCanvasElement;
  map: HTMLCanvasElement;
  quality: HTMLInputElement;
  folder: HTMLInputElement;
  files: HTMLInputElement;
  volume: HTMLInputElement;
  "effects-volume": HTMLInputElement;
  concept: HTMLImageElement;
  "pause-panel": HTMLDialogElement;
  "help-dialog": HTMLDialogElement;
  "music-dialog": HTMLDialogElement;
  "art-dialog": HTMLDialogElement;
  start: HTMLButtonElement;
  again: HTMLButtonElement;
  restart: HTMLButtonElement;
  weapon: HTMLButtonElement;
  "touch-fire": HTMLButtonElement;
  tracks: HTMLElement & { children: HTMLCollectionOf<HTMLButtonElement> };
  crafts: HTMLElement & { children: HTMLCollectionOf<HTMLButtonElement> };
};
// The IDs and element kinds are fixed by index.html.
function $<K extends keyof UIElements>(id: K): UIElements[K];
function $(id: string): HTMLElement;
function $(id: string) {
  return document.getElementById(id)!;
}
const updateWeaponHUD = createWeaponHUD(
  $("weapon"),
  $("touch-fire"),
  $("weapon-roster"),
);
updateWeaponHUD(null);
const sound = new AudioEngine();
const crowdRight = new Vector3();
function renderMusicStatus(playback: string, track: string, count: string) {
  $("music-playback").textContent = playback;
  $("music-track").textContent = track;
  $("music-count").textContent = count;
}
const music = new MusicPlayer((state) => {
  renderMusicStatus(
    state.error ? "FILE ERROR" : state.playing ? "PLAYING" : "PAUSED",
    state.error || state.name || "NO LOCAL TRACKS LOADED",
    state.error || !state.count
      ? ""
      : `${state.count} ${state.count === 1 ? "TRACK" : "TRACKS"}`,
  );
});
music.volume = 0.65;
music.setMenu(true);
music.loadTracks(soundtrack, { shuffle: true });
let musicEnabled = true;
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
const podiumTrophy = new PodiumTrophy();
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
function setTeamPalette(element: HTMLElement, index: number) {
  const team = LEAGUE_TEAMS[index];
  element.style.setProperty("--team-color", team.color);
  element.style.setProperty("--team-ink", team.ink);
}
function setTeamPlate(element: HTMLElement, index: number) {
  const team = LEAGUE_TEAMS[index];
  setTeamPalette(element, index);
  element.innerHTML = `${teamEmblem(index)}<span>${team.name} / ${team.number}</span>`;
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
  messageUntil = 0,
  previousCount: ReturnType<typeof countdownBoardStage> = "armed";
let musicInterrupted = false;
function startMenuMusic(event?: Event) {
  if (
    (event ? !event.isTrusted : !navigator.userActivation.isActive) ||
    state !== "menu" ||
    !musicEnabled ||
    !music.audio.paused ||
    document.hidden ||
    !document.hasFocus()
  )
    return;
  if (
    event?.type === "keydown" &&
    ![
      "Enter",
      " ",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Backspace",
      "Escape",
      "Tab",
    ].includes((event as KeyboardEvent).key)
  )
    return;
  if (
    event?.type === "click" &&
    !(event.target as Element).closest("button, input, label")
  )
    return;
  music.play();
}
$("menu").addEventListener("click", startMenuMusic, { capture: true });
// MenuNavigation owns a virtual cursor; keyboard focus usually remains on body.
// Capture before navigation can change the menu stage or start a race.
window.addEventListener("keydown", startMenuMusic, { capture: true });
// Safari grants its audio gesture while exposing a controller to the page.
// Resume/play must run inside this native event, not a later animation frame.
window.addEventListener("gamepadconnected", startMenuMusic);
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
  steerPointer: number | null = null,
  airPointer: number | null = null,
  touchAir = 0,
  touchCoast = 0,
  touchLaunchArmed = false;
const touchLayout = matchMedia("(pointer: coarse)").matches;
let touch = touchLayout;
let inputMode: InputMode = touch ? "touch" : "keyboard";
document.body.classList.toggle("touch", touch);
document.body.dataset.inputMode = inputMode;
function setInputMode(mode: InputMode) {
  if (inputMode === mode) return;
  const fromTouch = inputMode === "touch";
  inputMode = mode;
  touch = mode === "touch";
  document.body.classList.toggle("touch", touch || touchLayout);
  document.body.dataset.inputMode = mode;
  if (fromTouch && navigationRoot()?.id === "menu" && menuNavigator) {
    // A cancelled touch can leave the pointer cursor on a different choice.
    // Resume from a natively focused setup command or the committed choice.
    menuNavigator.cursor =
      document.activeElement?.closest<HTMLElement>(
        ".setup-navigation button",
      ) ?? null;
    menuNavigator.sync();
  }
  if (!touch) {
    touchSteer = 0;
    touchPitch = 0;
    steerPointer = null;
    resetAirStick();
    touchLaunchArmed = false;
    $("steer-pad").querySelector("i")!.style.transform = "";
  }
}
window.addEventListener(
  "pointerdown",
  (event) => {
    if (event.pointerType === "touch") setInputMode("touch");
  },
  { capture: true },
);
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
function formatTime(t: number | null | undefined) {
  if (!Number.isFinite(t)) return "—";
  const m = Math.floor(t! / 60);
  return `${String(m).padStart(2, "0")}:${(t! % 60).toFixed(2).padStart(5, "0")}`;
}
function showMessage(text: string, seconds = 1.7) {
  $("race-message").textContent = text;
  messageUntil = performance.now() + seconds * 1000;
}
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
async function prepareTrack(i: number) {
  selectedTrack = i;
  const generation = ++trackGeneration;
  const isCurrent = () => generation === trackGeneration;
  const start = performance.now();
  trackLoading = true;
  courseError = "";
  updateStartStatus();
  document.body.classList.add("course-loading");
  $("tracks").setAttribute("aria-busy", "true");
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
  for (const button of $("tracks").children) {
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
function clearInput() {
  rumble.stop();
  keys.clear();
  touchSteer = 0;
  touchPitch = 0;
  steerPointer = null;
  resetAirStick();
  touchLaunchArmed = false;
  for (const b of document.querySelectorAll(".pressed"))
    b.classList.remove("pressed");
  $("steer-pad").querySelector("i")!.style.transform = "";
}
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
  if (musicEnabled) void music.play();
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
  messageUntil = 0;
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
  else if (musicEnabled && !document.hidden && document.hasFocus())
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
  podiumTrophy.mount($("menu").querySelector<HTMLElement>(".menu-layout")!);
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
function readMenuGamepad(pad: Gamepad | null, now = performance.now()) {
  const menuActive = Boolean(navigationRoot());
  const x = pad?.axes?.[0] || 0;
  const y = pad?.axes?.[1] || 0;
  if (menuActive && (Math.abs(x) > 0.12 || Math.abs(y) > 0.12))
    padAxesConsumed = true;
  if (!pad || (Math.abs(x) < 0.12 && Math.abs(y) < 0.12))
    padAxesConsumed = false;
  // Chromium grants activation while getGamepads() samples a real button
  // above 0.9. Stick-only input and JS mocks grant no activation themselves.
  // Connection alone must not start playback, nor should held input queue it.
  if (
    menuActive &&
    pad &&
    (Math.abs(x) > 0.45 ||
      Math.abs(y) > 0.45 ||
      [0, 1, 9, 12, 13, 14, 15].some((index) => pad.buttons?.[index]?.pressed))
  )
    startMenuMusic();
  const wasPaused = paused;
  menuNavigator.gamepad(menuActive ? pad : null, now);
  if (menuNavigator.lastAction === "activate") {
    // Resume is also the pilot taking the throttle; other menu selections
    // still require release before A can drive or arm the countdown launch.
    padAConsumed = !(
      wasPaused &&
      menuNavigator.lastActivated === $("resume") &&
      state === "race" &&
      !paused
    );
  }
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
  rumble.connect(
    pad,
    state === "race" && !paused && !document.hidden && document.hasFocus(),
  );
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
    if (!e.repeat) togglePauseFromInput();
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
  airPad.querySelector("i")!.style.transform = "";
}
function moveAir(e: PointerEvent) {
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
  airPad.querySelector("i")!.style.transform =
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
for (const event of [
  "pointerup",
  "pointercancel",
  "lostpointercapture",
] as const)
  airPad.addEventListener(event, (e) => {
    if (airPointer !== e.pointerId) return;
    if (race?.countdown > 0)
      touchLaunchArmed = event === "pointerup" && touchCoast > 0;
    resetAirStick();
  });
const steerPad = $("steer-pad");
function moveSteer(e: PointerEvent) {
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
  steerPad.querySelector("i")!.style.transform =
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
for (const event of [
  "pointerup",
  "pointercancel",
  "lostpointercapture",
] as const)
  steerPad.addEventListener(event, (e) => {
    if (e.pointerId !== steerPointer) return;
    touchSteer = 0;
    touchPitch = 0;
    steerPointer = null;
    steerPad.querySelector("i")!.style.transform = "";
  });
let lastControls: RaceInput = {};
let steeringKind: "digital" | "analog" = "digital";
let padPause = false,
  padFire = false,
  padView = false,
  padAConsumed = false,
  padAxesConsumed = false,
  padPauseConsumed = false;
let previousPadInput: number[] = [];
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
        [6, 7].includes(index)
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
  const down = (...codes: string[]) => codes.some((c) => keys.has(c));
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
    const flight = gamepadFlightControls(pad, padAConsumed);
    airRight = Math.max(airRight, flight.airRight);
    airLeft = Math.max(airLeft, flight.airLeft);
    // Connected controllers always hold A for thrust, including touch devices.
    throttle = Math.max(Number(down("ArrowUp", "KeyW")), flight.throttle);
    launchIntent = down("ArrowUp", "KeyW") || flight.throttle > 0;
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
        togglePauseFromInput();
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
const mapCtx = $("map").getContext("2d")!;
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
  const xy = (p: Vector3) => [
    90 + (p.x - (minX + maxX) / 2) * scale,
    60 + (p.z - (minZ + maxZ) / 2) * scale,
  ];
  ctx.strokeStyle = "#fff0d1";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.shadowColor = "#181715";
  ctx.shadowBlur = 2;
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
    ctx.fillStyle = r.id === 0 ? "#fb4d2b" : "#fff0d1";
    ctx.beginPath();
    ctx.arc(x, y, r.id === 0 ? 3.5 : 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
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
  podiumTrophy.mount($("result-heading"));
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
  $("result-title").textContent = race.player.eliminated
    ? "ELIMINATED"
    : race.position === 1
      ? "YOU WON"
      : race.position === 8
        ? "YOU LOST"
        : `${race.position}${({ 2: "ND", 3: "RD" } as Record<number, string>)[race.position] || "TH"} PLACE`;
  $("result-data").replaceChildren();
  const classifiedTeam = document.createElement("div");
  classifiedTeam.className = "team-plate";
  setTeamPlate(classifiedTeam, race.player.craft);
  $("result-data").append(classifiedTeam);
  const lines: [string, string, boolean?, boolean?][] = [
    ["CLASS", race.classSpec.name],
    [
      race.player.eliminated ? "ELAPSED / DNF" : "TOTAL TIME",
      formatTime(race.resultTime),
      false,
      isRecord,
    ],
    ...race.laps.map((v, i): [string, string, boolean, boolean] => [
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
    const v = document.createElement("b");
    if (isBestLap) {
      const mark = document.createElement("small");
      mark.className = "result-mark best-lap-mark";
      mark.textContent = "BEST LAP";
      v.append(mark);
    }
    if (isNewRecord) {
      const mark = document.createElement("small");
      mark.className = "result-mark new-record-mark";
      mark.textContent = "NEW RECORD";
      v.append(mark);
    }
    const time = document.createElement("span");
    time.textContent = value;
    v.append(time);
    row.append(l, v);
    $("result-data").append(row);
  }
  menuNavigator?.sync();
}
function updateHUD(now: number) {
  const p = race.player;
  $("position").innerHTML =
    `${race.position}<small>/${race.racers.length}</small>`;
  $("lap").innerHTML =
    `${Math.min(race.lapCount, p.lap)}<small>/${race.lapCount}</small>`;
  $("timer").textContent = formatTime(race.time);
  $("speed").textContent = String(
    Math.round(toKilometresPerHour(p.speed)),
  ).padStart(3, "0");
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
  $("shield-num").textContent = String(Math.ceil(p.shield));
  $("shield-bar").style.width = `${p.shield}%`;
  $("shield-warning").hidden = !race.criticalShield;
  $("shield-warning").parentElement!.classList.toggle(
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
function animate(now: number) {
  const dt = frameDelta(last, now);
  last = now;
  pollMenuGamepad();
  menuNavigator?.sync();
  if (state === "menu" && loadedTrack >= 0) {
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
  if (state === "menu") {
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
        updateHUD(now);
        hudTick = 0;
      }
      if (race.finished) {
        updateHUD(now);
        showResults();
      }
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
  if (state === "menu" || state === "results") podiumTrophy.draw(dt);
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
  requestAnimationFrame(animate);
}

async function loadFiles(files: FileList | File[]) {
  await music.loadFiles(files);
  if (files.length) {
    musicEnabled = true;
    musicInterrupted = false;
    await music.play();
  }
}
for (const [button, input] of [
  ["music-folder", "folder"],
  ["music-files", "files"],
] as const) {
  const picker = $(input);
  $(button).onclick = () => picker.click();
  // Only the visible command bubbles to the menu's feedback handler.
  picker.onclick = (event) => event.stopPropagation();
  picker.onchange = () => loadFiles(picker.files!);
}
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
for (const [id, applyVolume] of [
  ["volume", (value) => (music.volume = value)],
  ["effects-volume", (value) => sound.setVolume(value)],
] satisfies ["volume" | "effects-volume", (value: number) => void][]) {
  const slider = $(id);
  const saved = localStorage.getItem(`nv-${id}`);
  if (saved !== null) slider.value = saved;
  function updateVolume() {
    const value = Number(slider.value);
    applyVolume(value);
    $(`${id}-level`).textContent = `${Math.round(value * 100)}%`;
    slider.style.setProperty("--sound-level", `${value * 100}%`);
  }
  updateVolume();
  slider.oninput = () => {
    updateVolume();
    localStorage.setItem(`nv-${id}`, slider.value);
  };
}
let dragDepth = 0;
window.addEventListener("dragenter", (e) => {
  if (e.dataTransfer!.types.includes("Files")) {
    e.preventDefault();
    dragDepth++;
    $("drop-zone").hidden = false;
  }
});
window.addEventListener("dragover", (e) => {
  if (e.dataTransfer!.types.includes("Files")) e.preventDefault();
});
window.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dragDepth--;
  if (dragDepth <= 0) $("drop-zone").hidden = true;
});
async function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile)
    return new Promise<File[]>((resolve, reject) =>
      (entry as FileSystemFileEntry).file((file) => resolve([file]), reject),
    );
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  let files: File[] = [];
  while (true) {
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) =>
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
  cancelStart();
  if (state === "race") setPaused(true);
  try {
    const entries = [...e.dataTransfer!.items]
      .map((i) => i.webkitGetAsEntry?.())
      .filter((entry): entry is FileSystemEntry => Boolean(entry));
    const files = entries.length
      ? (await Promise.all(entries.map(readEntry))).flat()
      : [...e.dataTransfer!.files];
    await loadFiles(files);
  } catch (error) {
    renderMusicStatus("FILE ERROR", (error as Error).message, "");
  } finally {
    if (state === "race") setPaused(true);
    openAuxiliaryDialog("music-dialog");
  }
});
selectTrack(selectedTrack);
// Menu input and previews must work even before the first world is adopted.
requestAnimationFrame(animate);
await initialCourseReady;

// Read-only telemetry for the pilot and browser smoke tests. No external services.
const nullVector = {
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
                : menuPreview.coursePivot)!.rotation.y
          : null,
      resources: { ...world.renderer.info.memory },
      previewResources: menuPreview.resources,
      drawCalls: world.renderer.info.render.calls,
      triangles: world.renderer.info.render.triangles,
      render: world.quality,
    };
  },
};

declare global {
  interface Window {
    nullVector: typeof nullVector;
  }
}
window.nullVector = nullVector;
