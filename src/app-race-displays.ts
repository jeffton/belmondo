import type { Vector3 } from "three";
import { $ } from "./app-elements.ts";
import { LEAGUE_TEAMS, teamEmblem } from "./league-teams.ts";
import { CRAFT, type Race, type RaceInput } from "./race.ts";
import type { Track } from "./track.ts";
import { toKilometresPerHour } from "./units.ts";
import { createWeaponHUD } from "./weapon-ui.ts";

function formatTime(t: number | null | undefined) {
  if (!Number.isFinite(t)) return "—";
  const m = Math.floor(t! / 60);
  return `${String(m).padStart(2, "0")}:${(t! % 60).toFixed(2).padStart(5, "0")}`;
}
export function setTeamPalette(element: HTMLElement, index: number) {
  const team = LEAGUE_TEAMS[index];
  element.style.setProperty("--team-color", team.color);
  element.style.setProperty("--team-ink", team.ink);
}
export function renderResultSheet(race: Race, isRecord: boolean) {
  $("result-title").textContent = race.player.eliminated
    ? "ELIMINATED"
    : race.position === 1
      ? "YOU WON"
      : race.position === 8
        ? "YOU LOST"
        : `${race.position}${({ 2: "ND", 3: "RD" } as Record<number, string>)[race.position] || "TH"} PLACE`;
  $("result-data").replaceChildren();
  const craft = race.player.craft;
  const craftPlate = document.createElement("div");
  craftPlate.className = "team-plate";
  setTeamPalette(craftPlate, craft);
  craftPlate.innerHTML = `${teamEmblem(craft)}<span>${CRAFT[craft].name}</span>`;
  $("result-data").append(craftPlate);
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
}

export function createWeaponDisplay() {
  const renderWeaponHUD = createWeaponHUD(
    $("weapon"),
    $("touch-fire"),
    $("weapon-roster"),
  );
  function updateWeaponHUD(weapon: Parameters<typeof renderWeaponHUD>[0]) {
    renderWeaponHUD(weapon);
    ($("touch-scrap") as HTMLButtonElement).disabled = !weapon;
  }
  updateWeaponHUD(null);
  return updateWeaponHUD;
}

export function createRaceHUD(
  updateWeaponHUD: ReturnType<typeof createWeaponDisplay>,
) {
  const mapCtx = $("map").getContext("2d")!;
  function drawMap(race: Race, track: Track) {
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
  function updateHUD(race: Race, track: Track, controls: RaceInput) {
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
      `${(launching ? race.launch.level : Number(controls.throttle || 0)) * 100}%`;
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
    drawMap(race, track);
  }
  return updateHUD;
}
