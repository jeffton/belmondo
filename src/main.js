import "./style.css";
import { Vector3 } from "three";
import { TRACKS, makeTrack, clamp, mod } from "./track.js";
import { Race, CRAFT, SPEED_CLASSES, LAPS } from "./race.js";
import { World } from "./world.js";
import { AudioEngine } from "./audio.js";
import { getCrowdMix } from "./crowd.js";
import { MusicPlayer } from "./music.js";
import { soundtrack } from "./soundtrack.js";
import { createWeaponHUD } from "./weapon-ui.js";

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
let selectedTrack = 0,
  selectedCraft = 0,
  selectedSpeedClass = 0,
  track,
  race;
let state = "menu",
  paused = false,
  accumulator = 0,
  last = performance.now(),
  messageUntil = 0,
  previousCount = 4;
let demoDistance = 50,
  renderFrames = 0,
  renderTime = 0;
const keys = new Set(),
  held = new Set();
let touchSteer = 0,
  touchPitch = 0,
  steerPointer = null,
  touchLaunchArmed = false;
const touch = matchMedia("(pointer: coarse)").matches;
document.body.classList.toggle("touch", touch);
const records = JSON.parse(localStorage.getItem("nv-records") || "{}");
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
  return `${TRACKS[selectedTrack].layoutId}-${selectedCraft}-${mode}-${SPEED_CLASSES[speedClass].id}-${LAPS}laps`;
}
function updateRecord() {
  const r = records[recordKey()];
  $("best").textContent = `LOCAL RECORD / ${r ? formatTime(r) : "—"}`;
}
function selectTrack(i) {
  selectedTrack = i;
  track = makeTrack(i);
  world.build(track);
  race = new Race(
    track,
    selectedCraft,
    "race",
    selectedSpeedClass,
    world.environment.terrain,
  );
  world.setupRacers(race, CRAFT);
  demoDistance = track.length * 0.02;
  $("circuit-name").textContent = TRACKS[i].name;
  for (const b of $("tracks").children) {
    const active = Number(b.dataset.index) === i;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  }
  updateRecord();
}
for (const [i, t] of TRACKS.entries()) {
  const button = document.createElement("button");
  button.className = "choice";
  button.dataset.index = i;
  button.innerHTML = `<b>${t.name}</b><small>${t.subtitle.split("/")[1]}</small>`;
  button.onclick = () => selectTrack(i);
  $("tracks").append(button);
}
for (const [i, c] of CRAFT.entries()) {
  const button = document.createElement("button");
  button.className = "choice";
  button.innerHTML = `<i class="craft-icon" style="--craft:#${c.color.toString(16)}"></i><span><b>${c.name}</b><small>${c.team}</small></span>`;
  button.onclick = () => {
    selectedCraft = i;
    for (const [j, b] of [...$("crafts").children].entries()) {
      b.classList.toggle("active", i === j);
      b.setAttribute("aria-pressed", String(i === j));
    }
    $("craft-note").textContent = c.text.split("/")[0].trim().toUpperCase();
    updateRecord();
  };
  $("crafts").append(button);
}
$("crafts").children[0].click();
selectTrack(0);
$("mode").onchange = updateRecord;
$("speed-class").onchange = () => {
  selectedSpeedClass = Number(
    document.querySelector('input[name="speed-class"]:checked').value,
  );
  updateRecord();
};
const qualityToggle = $("quality");
qualityToggle.checked = localStorage.getItem("nv-render") !== "clean";
$("quality-clean").checked = !qualityToggle.checked;
function applyQuality() {
  world.quality = qualityToggle.checked ? "retro" : "clean";
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
  held.clear();
  touchSteer = 0;
  touchPitch = 0;
  steerPointer = null;
  touchLaunchArmed = false;
  for (const b of document.querySelectorAll(".pressed"))
    b.classList.remove("pressed");
  $("steer-pad").querySelector("i").style.transform = "";
}
let startGeneration = 0;
async function start(event) {
  const generation = ++startGeneration;
  const button = event.currentTarget;
  button.disabled = true;
  music.setTunnel(false);
  const audioStart = sound.start();
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
    button.disabled = false;
  }
  if (generation !== startGeneration) return;
  race = new Race(
    track,
    selectedCraft,
    selectedMode(),
    selectedSpeedClass,
    world.environment.terrain,
  );
  world.setupRacers(race, CRAFT);
  world.cameraReady = false;
  last = performance.now();
  state = "race";
  music.setMenu(false);
  paused = false;
  accumulator = 0;
  previousCount = 4;
  messageUntil = 0;
  clearInput();
  $("menu").hidden = true;
  $("results").hidden = true;
  $("pause-panel").close();
  updateWeaponHUD(race.player.weapon);
  $("hud").hidden = false;
  $("hud-track").textContent =
    `${TRACKS[selectedTrack].name} / ${race.classSpec.id.toUpperCase()}`;
  if (document.hidden || !document.hasFocus()) setPaused(true);
}
function setPaused(value) {
  if (state !== "race" || race.finished || paused === value) return;
  paused = value;
  clearInput();
  if (paused) $("pause-panel").showModal();
  else $("pause-panel").close();
  sound.setPaused(paused);
  music.setMenu(paused);
  if (paused) music.setTunnel(false);
  else if (musicEnabled) music.play();
}
function quit() {
  ++startGeneration;
  state = "menu";
  paused = false;
  clearInput();
  $("menu").hidden = false;
  $("hud").hidden = true;
  $("pause-panel").close();
  $("results").hidden = true;
  $("start").focus();
  sound.setPaused(true);
  sound.stopCrowd();
  music.setMenu(true);
  music.setTunnel(false);
  world.cameraReady = false;
}
$("start").onclick = start;
$("again").onclick = start;
$("restart").onclick = start;
$("quit").onclick = quit;
$("result-quit").onclick = quit;
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
  };
for (const b of document.querySelectorAll("dialog .close"))
  b.onclick = () => b.closest("dialog").close();
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
window.addEventListener("keydown", (e) => {
  if (document.querySelector("dialog[open]:not(#pause-panel)")) return;
  if (state !== "race") return;
  if (e.code === "Escape" || e.code === "KeyP") {
    e.preventDefault();
    if (!e.repeat) setPaused(!paused);
    return;
  }
  if (paused) return;
  if (
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
      e.code,
    )
  )
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
  music.pause();
  clearInput();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (state === "race") setPaused(true);
    music.pause();
  }
  last = performance.now();
});
for (const b of document.querySelectorAll("[data-control]")) {
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    held.add(b.dataset.control);
    b.classList.add("pressed");
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    b.addEventListener(event, () => {
      if (b.dataset.control === "brake" && race?.countdown > 0) {
        if (event === "pointerup" && held.has("brake")) touchLaunchArmed = true;
        else if (event === "pointercancel") touchLaunchArmed = false;
      }
      held.delete(b.dataset.control);
      b.classList.remove("pressed");
    });
}
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
  steerPad.querySelector("i").style.transform =
    `translate(${touchSteer * rect.width * 0.32}px, ${-touchPitch * rect.height * 0.32}px)`;
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
let padPause = false,
  padFire = false,
  padView = false;
function input() {
  const down = (...codes) => codes.some((c) => keys.has(c));
  let steer =
    (down("ArrowRight", "KeyD") ? 1 : 0) -
    (down("ArrowLeft", "KeyA") ? 1 : 0) +
    touchSteer;
  let airRight = down("KeyL", "KeyE") || held.has("airRight") ? 1 : 0;
  let airLeft = down("KeyJ", "KeyQ") || held.has("airLeft") ? 1 : 0;
  let pitch = (down("KeyI") ? 1 : 0) - (down("KeyK") ? 1 : 0) + touchPitch;
  let launchIntent = down("ArrowUp", "KeyW") || (touch && touchLaunchArmed);
  let throttle = touch || down("ArrowUp", "KeyW") ? 1 : 0;
  let brake = down("ArrowDown", "KeyS") || held.has("brake");
  const pad = navigator.getGamepads?.()[0];
  if (pad) {
    if (Math.abs(pad.axes[0]) > 0.12) steer = pad.axes[0];
    if (Math.abs(pad.axes[1]) > 0.12) pitch = -pad.axes[1];
    airRight = Math.max(airRight, pad.buttons[5]?.value || 0);
    airLeft = Math.max(airLeft, pad.buttons[4]?.value || 0);
    const padThrust = pad.buttons[0]?.pressed ? 1 : pad.buttons[7]?.value || 0;
    throttle = Math.max(throttle, padThrust > 0.1 ? padThrust : 0);
    launchIntent ||= padThrust > 0.1;
    brake = brake || pad.buttons[1]?.pressed;
    if (pad.buttons[2]?.pressed && !padFire && !paused) race.fire();
    padFire = pad.buttons[2]?.pressed;
    if (pad.buttons[3]?.pressed && !padView && !paused) toggleView();
    padView = pad.buttons[3]?.pressed;
    if (
      pad.buttons[9]?.pressed &&
      !padPause &&
      !document.querySelector("dialog[open]:not(#pause-panel)")
    )
      setPaused(!paused);
    padPause = pad.buttons[9]?.pressed;
  }
  return {
    // The road's lateral axis points camera-left when looking forward.
    steer: -clamp(steer, -1, 1),
    air: airLeft - airRight,
    airLeft,
    airRight,
    pitch: clamp(pitch, -1, 1),
    throttle: race?.countdown > 0 ? (brake ? 0 : throttle) : Boolean(throttle),
    launchIntent,
    brake,
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
    const [x, y] = xy(track.frame(r.s, r.branch).p);
    ctx.fillStyle = r.id === 0 ? "#ff782b" : "#a2ceda";
    ctx.beginPath();
    ctx.arc(x, y, r.id === 0 ? 3.5 : 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
function showResults() {
  state = "results";
  music.setMenu(true);
  music.setTunnel(false);
  sound.stopEngine();
  sound.stopCrowd();
  $("results").hidden = false;
  const key = recordKey(race.mode, race.speedClass);
  const isRecord = !records[key] || race.time < records[key];
  if (isRecord) {
    records[key] = race.time;
    localStorage.setItem("nv-records", JSON.stringify(records));
  }
  $("result-title").textContent =
    race.mode === "trial"
      ? "RUN COMPLETE."
      : race.position === 1
        ? "FIRST PLACE"
        : `POSITION / ${race.position}`;
  $("result-data").replaceChildren();
  const lines = [
    ["CLASS", `${race.classSpec.id.toUpperCase()} / ${LAPS} LAPS`],
    ["TOTAL TIME", formatTime(race.time)],
    ...race.laps.map((v, i) => [`LAP / ${i + 1}`, formatTime(v)]),
    ["BEST LAP", formatTime(race.bestLap)],
    ["LOCAL RECORD", isRecord ? "NEW RECORD" : formatTime(records[key])],
  ];
  for (const [label, value] of lines) {
    const row = document.createElement("div");
    row.className = "result-line";
    const l = document.createElement("span");
    l.textContent = label;
    const v = document.createElement("b");
    v.textContent = value;
    row.append(l, v);
    $("result-data").append(row);
  }
  updateRecord();
}
function updateHUD(now) {
  const p = race.player;
  $("position").innerHTML =
    `${race.position}<small>/${race.racers.length}</small>`;
  $("lap").innerHTML = `${Math.min(LAPS, p.lap)}<small>/${LAPS}</small>`;
  $("timer").textContent = formatTime(race.time);
  $("speed").textContent = String(Math.round(p.speed * 3.6)).padStart(3, "0");
  $("speed-bar").style.width =
    `${Math.min(100, (p.speed / (175 * race.classSpec.pace)) * 100)}%`;
  const launching = race.countdown > 0;
  $("thrust-system").classList.toggle("launch", launching);
  $("thrust-bar").style.width =
    `${(launching ? race.launch.level : Number(lastControls.throttle || 0)) * 100}%`;
  $("launch-status").textContent =
    touch && !touchLaunchArmed ? "BRAKE → RELEASE" : "65–80% AT GO";
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
  $("shield-bar").style.background = p.shield < 25 ? "#ff642a" : "#d4f53c";
  updateWeaponHUD(p.weapon);
  if (race.countdown > 0) {
    const count = Math.ceil(race.countdown);
    $("race-message").className = "";
    $("race-message").textContent = "";
    if (count <= 3 && count !== previousCount) {
      sound.effect("countdown", count);
      previousCount = count;
    }
  } else {
    $("race-message").className = "";
    if (previousCount > 0) sound.effect("go");
    previousCount = 0;
    if (now > messageUntil) $("race-message").textContent = "";
  }
  drawMap();
}
let hudTick = 0;
function animate(now) {
  const frameSeconds = (now - last) / 1000;
  const dt = frameSeconds;
  last = now;
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
      music.setTunnel(
        race.player.grounded &&
          track.isTunnel(race.player.contactS, race.player.branch),
      );
      for (const event of race.events) {
        if (["hit", "scrape", "land"].includes(event.kind))
          world.burst(race.player);
        sound.effect(event.kind, event.text);
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
      if (race.finished) showResults();
    }
    world.draw(race, paused ? 0 : dt, false);
  }
  // Downshift expensive clean rendering only after sustained slow frame timing.
  if (state === "race" && !paused) {
    renderFrames++;
    renderTime += frameSeconds;
    if (renderTime >= 2.5) {
      if (renderTime / renderFrames > 0.027 && world.quality === "clean") {
        world.quality = "retro";
        qualityToggle.checked = true;
        world.resize();
      }
      renderFrames = 0;
      renderTime = 0;
    }
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

async function loadFiles(files) {
  await music.loadFiles(files);
  if (files.length) {
    musicEnabled = true;
    await music.play();
  }
}
$("folder").onchange = (e) => loadFiles(e.target.files);
$("files").onchange = (e) => loadFiles(e.target.files);
$("music-play").onclick = () => {
  musicEnabled = music.audio.paused;
  if (musicEnabled) music.play();
  else music.pause();
};
$("music-next").onclick = () => {
  musicEnabled = true;
  music.next();
};
$("music-default").onclick = () => {
  music.loadTracks(soundtrack, { shuffle: true });
  musicEnabled = true;
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
// Read-only telemetry for the pilot and browser smoke tests. No external services.
window.nullVector = {
  get telemetry() {
    return {
      state,
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
      lap: race.player.lap,
      laps: LAPS,
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
      drawCalls: world.renderer.info.render.calls,
      triangles: world.renderer.info.render.triangles,
      render: world.quality,
    };
  },
};
