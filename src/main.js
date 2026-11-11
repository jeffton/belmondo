import "./style.css";
import { TRACKS, makeTrack, clamp, mod } from "./track.js";
import { Race, CRAFT } from "./race.js";
import { World } from "./world.js";
import { AudioEngine, MusicPlayer } from "./audio.js";

await document.fonts.load('700 16px "Noto Sans JP"');
const $ = (id) => document.getElementById(id);
const sound = new AudioEngine();
const music = new MusicPlayer((state) => {
  $("music-status").textContent =
    state.error ||
    (state.count
      ? `${state.playing ? "PLAYING" : "PAUSED"} / ${state.name} · ${state.count} TRACKS`
      : "NO LOCAL TRACKS LOADED");
});
music.volume = 0.65;
const soundtrack = [
  { name: "BELMONDO — Phase Index", url: "/music/phase-index.mp3" },
  { name: "BELMONDO — Glass Current", url: "/music/glass-current.mp3" },
  { name: "BELMONDO — Ion Drift", url: "/music/ion-drift.mp3" },
];
music.loadTracks(soundtrack);
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
  steerPointer = null;
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
function updateRecord() {
  const r = records[`${selectedTrack}-${selectedCraft}-${$("mode").value}`];
  $("best").textContent = `LOCAL RECORD / ${r ? formatTime(r) : "—"}`;
}
function selectTrack(i) {
  selectedTrack = i;
  track = makeTrack(i);
  world.build(track);
  race = new Race(track, selectedCraft);
  world.setupRacers(race, CRAFT);
  demoDistance = track.length * 0.02;
  $("circuit-name").textContent = TRACKS[i].name;
  for (const b of $("tracks").children)
    b.classList.toggle("active", Number(b.dataset.index) === i);
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
    for (const [j, b] of [...$("crafts").children].entries())
      b.classList.toggle("active", i === j);
    $("craft-note").textContent = c.text.split("/")[0].trim().toUpperCase();
    updateRecord();
  };
  $("crafts").append(button);
}
$("crafts").children[0].click();
selectTrack(0);
$("mode").onchange = updateRecord;
$("quality").onchange = () => {
  world.quality = $("quality").value;
  world.resize();
};
window.addEventListener("resize", () => world.resize());
function clearInput() {
  keys.clear();
  held.clear();
  touchSteer = 0;
  steerPointer = null;
  for (const b of document.querySelectorAll(".pressed"))
    b.classList.remove("pressed");
  $("steer-pad").querySelector("i").style.transform = "";
}
async function start() {
  const audioStart = sound.start();
  const musicStart = musicEnabled ? music.play() : Promise.resolve();
  sound.setMuted($("mute").checked);
  sound.setPaused(false);
  race = new Race(track, selectedCraft, $("mode").value);
  world.setupRacers(race, CRAFT);
  world.cameraReady = false;
  last = performance.now();
  state = "race";
  paused = false;
  accumulator = 0;
  previousCount = 4;
  messageUntil = 0;
  clearInput();
  $("menu").hidden = true;
  $("results").hidden = true;
  $("pause-panel").hidden = true;
  $("hud").hidden = false;
  $("hud-track").textContent = TRACKS[selectedTrack].name;
  try {
    await Promise.all([audioStart, musicStart]);
  } catch (error) {
    showMessage(`AUDIO: ${error.message}`, 3);
  }
}
function setPaused(value) {
  if (state !== "race" || race.finished) return;
  paused = value;
  clearInput();
  $("pause-panel").hidden = !paused;
  sound.setPaused(paused);
  if (paused) music.pause();
  else if (musicEnabled) music.play();
}
function quit() {
  state = "menu";
  paused = false;
  clearInput();
  $("menu").hidden = false;
  $("hud").hidden = true;
  $("pause-panel").hidden = true;
  $("results").hidden = true;
  sound.setPaused(true);
  music.pause();
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
for (const d of document.querySelectorAll("dialog"))
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
$("touch-fire").onclick = () => {
  if (!paused) race.fire();
};
window.addEventListener("keydown", (e) => {
  if (document.querySelector("dialog[open]")) return;
  if (state !== "race") return;
  if (
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
      e.code,
    )
  )
    e.preventDefault();
  if (e.repeat) return;
  if (e.code === "Escape" || e.code === "KeyP") {
    setPaused(!paused);
    return;
  }
  if (paused) return;
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
  if (document.hidden && state === "race") setPaused(true);
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
  steerPad.querySelector("i").style.transform =
    `translateX(${touchSteer * rect.width * 0.32}px)`;
}
steerPad.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  steerPointer = e.pointerId;
  steerPad.setPointerCapture(e.pointerId);
  moveSteer(e);
});
steerPad.addEventListener("pointermove", moveSteer);
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  steerPad.addEventListener(event, () => {
    touchSteer = 0;
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
  let pitch =
    (down("KeyI") || held.has("pitchDown") ? 1 : 0) -
    (down("KeyK") || held.has("pitchUp") ? 1 : 0);
  let throttle = touch || down("ArrowUp", "KeyW");
  let brake = down("ArrowDown", "KeyS") || held.has("brake");
  const pad = navigator.getGamepads?.()[0];
  if (pad) {
    if (Math.abs(pad.axes[0]) > 0.12) steer = pad.axes[0];
    if (Math.abs(pad.axes[3]) > 0.12) pitch = -pad.axes[3];
    airRight = Math.max(airRight, pad.buttons[5]?.value || 0);
    airLeft = Math.max(airLeft, pad.buttons[4]?.value || 0);
    throttle =
      throttle || pad.buttons[0]?.pressed || pad.buttons[7]?.value > 0.1;
    brake = brake || pad.buttons[1]?.pressed;
    if (pad.buttons[2]?.pressed && !padFire && !paused) race.fire();
    padFire = pad.buttons[2]?.pressed;
    if (pad.buttons[3]?.pressed && !padView && !paused) toggleView();
    padView = pad.buttons[3]?.pressed;
    if (pad.buttons[9]?.pressed && !padPause) setPaused(!paused);
    padPause = pad.buttons[9]?.pressed;
  }
  return {
    // The road's lateral axis points camera-left when looking forward.
    steer: -clamp(steer, -1, 1),
    air: airLeft - airRight,
    airLeft,
    airRight,
    pitch,
    throttle,
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
  sound.stopEngine();
  $("results").hidden = false;
  const key = `${selectedTrack}-${selectedCraft}-${race.mode}`;
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
  $("lap").innerHTML = `${Math.min(3, p.lap)}<small>/3</small>`;
  $("timer").textContent = formatTime(race.time);
  $("speed").textContent = String(Math.round(p.speed * 3.6)).padStart(3, "0");
  $("speed-bar").style.width = `${(p.speed / 155) * 100}%`;
  $("shield-num").textContent = Math.ceil(p.shield);
  $("shield-bar").style.width = `${p.shield}%`;
  $("shield-bar").style.background = p.shield < 25 ? "#ff642a" : "#d4f53c";
  $("weapon").innerHTML =
    `${p.weapon || "—"}<small>${p.weapon ? "SPACE / FIRE" : "WEAPON SYSTEM IDLE"}</small>`;
  $("weapon").classList.toggle("loaded", !!p.weapon);
  if (race.countdown > 0) {
    const count = Math.ceil(race.countdown);
    $("race-message").className = "countdown";
    $("race-message").textContent = count > 3 ? "" : count;
    if (count !== previousCount) {
      sound.effect("countdown");
      previousCount = count;
    }
  } else {
    $("race-message").className = "";
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
      const f = track.frame(r.s, r.branch);
      r.position.copy(f.p).addScaledVector(f.right, r.x);
      r.position.y += 1.6;
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
      for (const event of race.events) {
        if (["hit", "scrape", "land"].includes(event.kind))
          world.burst(race.player);
        sound.effect(event.kind, event.text);
      }
      race.events.length = 0;
      sound.update(race.player.speed / 175, race.player.boost, {
        ...controls,
        acceleration: dt > 0 ? (race.player.speed - previousSpeed) / dt : 0,
        slip: race.player.vx,
        grounded: race.player.grounded,
      });
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
  music.loadTracks(soundtrack);
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
