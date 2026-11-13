import * as THREE from "three";

// Shared by the physical signal and its voice; the race owns the only clock.
export function countdownBoardStage(race) {
  if (race.countdown > 3) return "armed";
  if (race.countdown > 0) return Math.ceil(race.countdown);
  return race.time < 1.2 ? "GO" : "idle";
}

const INK = "#142333";
const PAPER = "#f3f5e7";
const MINT = "#9bffd9";
const CORAL = "#ff654d";
const LILAC = "#bcafff";
const PANEL = "#0b1420";
const INSET = "#172738";

// PIP is an original lab-courier character: capsule, visor, aerial and two fins.
// Its expression follows the real signal stage; it is never a HUD overlay.
function drawPip(ctx, stage) {
  ctx.save();
  ctx.translate(38, 49);
  ctx.scale(0.76, 0.76);
  ctx.lineWidth = 10;
  ctx.strokeStyle = INK;
  ctx.lineJoin = "round";
  const shape = (points, fill) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };
  shape(
    [
      [76, 67],
      [54, 30],
      [94, 39],
      [111, 72],
    ],
    LILAC,
  );
  shape(
    [
      [165, 68],
      [190, 36],
      [207, 83],
    ],
    LILAC,
  );
  shape(
    [
      [69, 178],
      [stage === "GO" ? 19 : 40, 221],
      [95, 204],
    ],
    MINT,
  );
  shape(
    [
      [161, 178],
      [stage === "GO" ? 223 : 201, 220],
      [143, 206],
    ],
    MINT,
  );
  ctx.beginPath();
  ctx.moveTo(128, 58);
  ctx.lineTo(128, 29);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(128, 24, 13, 0, Math.PI * 2);
  ctx.fillStyle = CORAL;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(39, 61, 178, 140, 52);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(61, 84, 134, 74, 29);
  ctx.fillStyle = MINT;
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.beginPath();
  if (stage === "GO") {
    for (const x of [88, 143]) {
      ctx.moveTo(x, 129);
      ctx.lineTo(x + 12, 112);
      ctx.lineTo(x + 24, 129);
    }
  } else {
    ctx.moveTo(99, 107);
    ctx.lineTo(99, 136);
    if (stage === 2 || stage === "idle") {
      ctx.moveTo(142, 124);
      ctx.lineTo(166, 124);
    } else {
      ctx.moveTo(154, 107);
      ctx.lineTo(154, 136);
    }
  }
  ctx.stroke();
  ctx.strokeStyle = CORAL;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(112, 180);
  ctx.lineTo(143, 180);
  ctx.stroke();
  ctx.restore();
}

// The display, stripe and timing plane share the authored straight endpoint.
export function buildStartGantry(scene, track) {
  const signal = track.frame(track.finishS);
  const assembly = new THREE.Group();
  assembly.name = "grid-signal";
  assembly.position.copy(signal.p);
  assembly.rotation.y = Math.atan2(signal.tangent.x, signal.tangent.z);
  scene.add(assembly);

  const shell = new THREE.MeshLambertMaterial({
    color: 0x142333,
    flatShading: true,
  });
  const ceramic = new THREE.MeshLambertMaterial({
    color: 0xf3f5e7,
    flatShading: true,
  });
  const coral = new THREE.MeshBasicMaterial({ color: 0xff654d });
  const mint = new THREE.MeshBasicMaterial({ color: 0x9bffd9 });
  const lilac = new THREE.MeshBasicMaterial({ color: 0xbcafff });
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const box = (material, x, y, z, width, height, depth) => {
    const mesh = new THREE.Mesh(unit, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, depth);
    assembly.add(mesh);
    return mesh;
  };
  const halfSpan = signal.width + 3.5;
  for (const side of [-1, 1]) {
    box(shell, side * halfSpan, 5.9, 0, 1.1, 15.8, 1.8);
    box(ceramic, side * halfSpan, 0, 0, 2.5, 4, 3.8);
    box(coral, side * halfSpan, 6.5, -0.93, 0.55, 4, 0.08);
    box(mint, side * halfSpan, 11, -0.95, 0.55, 2, 0.08);
    box(ceramic, side * (halfSpan - 2), 13.3, 0, 4.4, 0.7, 1.8);
  }
  box(shell, 0, 13.8, 0, halfSpan * 2 + 1.1, 0.75, 2);
  box(shell, 0, 10.5, 0, 23.5, 6.3, 1.3);
  box(coral, 0, 7.43, -0.12, 23.5, 0.25, 1.5);
  box(shell, 0, 10.5, -0.75, 22.9, 5.7, 0.3);
  box(lilac, -12.2, 12.5, -0.2, 1, 2.2, 1.8);
  box(coral, 11.9, 8.5, -0.2, 1.4, 1.3, 1.8);
  const fins = [-1, 1].map((side) => {
    const fin = box(mint, side * 12.4, 11.3, -0.7, 1.2, 2.6, 0.4);
    fin.name = `grid-signal-fin-${side}`;
    return fin;
  });
  const lamps = [0, 1, 2].map((index) => {
    const material = new THREE.MeshBasicMaterial({ color: 0x394b54 });
    return box(material, (index - 1) * 2, 14.6, -0.55, 1.4, 0.65, 0.5);
  });

  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  const display = new THREE.Mesh(
    new THREE.PlaneGeometry(22.3, 5.3),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  display.position.set(0, 10.5, -0.92);
  display.rotation.y = Math.PI;
  display.name = "grid-signal-display";
  assembly.add(display);

  let previousStage;
  let labelReady = false;
  const startLabel = new Image();
  startLabel.onload = () => {
    labelReady = true;
    previousStage = undefined;
  };
  startLabel.onerror = () => {
    throw new Error("Could not load grid start lettering");
  };
  startLabel.src = "/art/grid-start-katakana.png";
  Promise.all([
    document.fonts.load('700 208px "Belmondo Circuit"'),
    document.fonts.load('600 20px "Archivo"'),
  ]).then(() => {
    previousStage = undefined;
  });

  const update = (race, demo = false) => {
    let stage = "idle";
    let approaching = false;
    let displayedLap;
    if (!demo) {
      stage = countdownBoardStage(race);
      if (race.finished) stage = "FINISH";
      else if (stage === "idle") {
        const player = race.player;
        // Announce the lap entered at this line throughout the authored home
        // straight's incoming leg. Unwrapped, gate-earned progression keeps the
        // initial grid and outgoing leg on lap 1, not prematurely on lap 2.
        const straightStart = track.config.sections.finishStraight[0];
        const lapEnd = track.finishS + player.lap * track.length;
        approaching =
          player.s >= (player.lap - 1 + straightStart) * track.length &&
          player.s < lapEnd;
        displayedLap = player.lap + (approaching ? 1 : 0);
        stage = displayedLap > race.lapCount ? "FINISH" : `LAP ${displayedLap}`;
      }
    }
    const age =
      typeof stage === "number"
        ? stage - race.countdown
        : stage === "GO"
          ? race.time
          : 1;
    const snap = Math.exp(-age * 12) * Math.sin(age * 24);
    fins.forEach((fin, index) => {
      const side = index === 0 ? -1 : 1;
      fin.rotation.z = side * ((stage === "GO" ? 0.48 : 0.08) + snap * 0.24);
      fin.position.y = 11.3 + snap * 0.3;
    });
    const displayKey = `${stage}:${approaching}:${Boolean(race.finished)}`;
    if (displayKey === previousStage) return;
    previousStage = displayKey;
    const go = stage === "GO";
    const active = typeof stage === "number" || go;
    const running = typeof stage === "string" && stage.startsWith("LAP ");
    const complete = stage === "FINISH";
    const accent = go || complete ? MINT : active ? CORAL : LILAC;
    lamps.forEach((lamp, index) => {
      const on = go || (typeof stage === "number" && index <= 3 - stage);
      lamp.material.color.set(on ? accent : "#394b54");
    });
    ctx.fillStyle = PANEL;
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = INSET;
    ctx.fillRect(0, 0, 1024, 38);
    if (labelReady && !running && !complete) {
      ctx.save();
      ctx.filter = "brightness(0) invert(1)";
      ctx.drawImage(startLabel, 28, 6, 112, 26);
      ctx.restore();
    }
    ctx.fillStyle = MINT;
    ctx.font = '600 20px "Archivo"';
    ctx.textAlign = "right";
    ctx.fillText("BELMONDO / TIMING 01", 994, 27);
    drawPip(ctx, stage);
    ctx.fillStyle = LILAC;
    ctx.textAlign = "center";
    ctx.font = '600 17px "Archivo"';
    ctx.fillText("PIP / 01", 136, 239);

    ctx.fillStyle = INSET;
    ctx.fillRect(283, 49, 438, 191);
    // A clipped upper corner is a registration detail, not a glowing frame.
    ctx.fillStyle = PANEL;
    ctx.beginPath();
    ctx.moveTo(691, 49);
    ctx.lineTo(721, 49);
    ctx.lineTo(721, 79);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = go || complete ? MINT : active ? CORAL : LILAC;
    ctx.textAlign = "center";
    ctx.font = active
      ? `700 ${go ? 190 : 208}px "Belmondo Circuit"`
      : '700 76px "Belmondo Circuit"';
    ctx.fillText(
      active || running || complete
        ? String(stage)
        : stage === "armed"
          ? "READY"
          : "B/",
      502,
      active ? 220 : 177,
    );
    const status = running
      ? [
          approaching ? "NEXT" : "CURRENT",
          "LAP",
          `${displayedLap} / ${race.lapCount}`,
        ]
      : complete
        ? [
            race.finished ? "RACE" : "FINISH",
            race.finished ? "COMPLETE" : "LINE",
            `${race.lapCount} / ${race.lapCount}`,
          ]
        : stage === "idle"
          ? ["GRID", "STANDBY", "B/"]
          : null;
    for (let index = 0; index < 3; index++) {
      const on = go || (typeof stage === "number" && index <= 3 - stage);
      ctx.fillStyle = on ? accent : INSET;
      ctx.fillRect(765, 58 + index * 59, 227, 46);
      ctx.fillStyle = on ? INK : LILAC;
      ctx.font = `700 ${status ? 26 : 36}px "Belmondo Circuit"`;
      ctx.textAlign = "left";
      ctx.fillText(
        status ? status[index] : `0${3 - index}`,
        781,
        94 + index * 59,
      );
      if (!status) ctx.fillRect(934, 72 + index * 59, on ? 40 : 10, 16);
    }
    ctx.fillStyle = accent;
    ctx.fillRect(0, 248, 1024, 8);
    texture.needsUpdate = true;
  };
  update({ countdown: 3.2, time: 0 });
  return { update, assembly };
}
