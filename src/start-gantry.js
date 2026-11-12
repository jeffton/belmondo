import * as THREE from "three";

const INK = "#142333";
const PAPER = "#f3f5e7";
const MINT = "#9bffd9";
const CORAL = "#ff654d";
const LILAC = "#bcafff";

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

// The timing/checker line stays at s=0. This signal is ahead in the drivers' view.
export function buildStartGantry(scene, track) {
  const grid = track.frame(0);
  const signal = track.frame(42);
  const assembly = new THREE.Group();
  assembly.name = "grid-signal";
  assembly.position.copy(signal.p);
  assembly.rotation.y = Math.atan2(grid.tangent.x, grid.tangent.z);
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
  box(ceramic, 0, 10.5, 0, 23.5, 6.3, 1.3);
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
    const stage = demo
      ? "idle"
      : race.countdown > 3
        ? "armed"
        : race.countdown > 0
          ? Math.ceil(race.countdown)
          : race.time < 1.2
            ? "GO"
            : "idle";
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
    if (stage === previousStage) return;
    previousStage = stage;
    const go = stage === "GO";
    const active = typeof stage === "number" || go;
    const accent = go ? MINT : CORAL;
    lamps.forEach((lamp, index) => {
      const on = go || (typeof stage === "number" && index <= 3 - stage);
      lamp.material.color.set(on ? accent : "#394b54");
    });
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = MINT;
    ctx.fillRect(0, 0, 1024, 38);
    if (labelReady) ctx.drawImage(startLabel, 28, 6, 112, 26);
    ctx.fillStyle = INK;
    ctx.font = '600 20px "Archivo"';
    ctx.textAlign = "right";
    ctx.fillText("BELMONDO / GRID 01", 994, 27);
    drawPip(ctx, stage);
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.font = '600 17px "Archivo"';
    ctx.fillText("PIP / 01", 136, 239);

    ctx.fillStyle = go ? MINT : active ? CORAL : LILAC;
    ctx.fillRect(283, 49, 438, 191);
    // A clipped upper corner is a registration detail, not a glowing frame.
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.moveTo(691, 49);
    ctx.lineTo(721, 49);
    ctx.lineTo(721, 79);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.font = active
      ? `700 ${go ? 190 : 208}px "Belmondo Circuit"`
      : '700 76px "Belmondo Circuit"';
    ctx.fillText(
      active ? String(stage) : stage === "armed" ? "READY" : "B/",
      502,
      active ? 220 : 177,
    );
    for (let index = 0; index < 3; index++) {
      const on = go || (typeof stage === "number" && index <= 3 - stage);
      ctx.fillStyle = on ? accent : "#d9ddd7";
      ctx.fillRect(765, 58 + index * 59, 227, 46);
      ctx.fillStyle = INK;
      ctx.font = '700 36px "Belmondo Circuit"';
      ctx.textAlign = "left";
      ctx.fillText(`0${3 - index}`, 781, 94 + index * 59);
      ctx.fillRect(934, 72 + index * 59, on ? 40 : 10, 16);
    }
    ctx.fillStyle = accent;
    ctx.fillRect(0, 248, 1024, 8);
    texture.needsUpdate = true;
  };
  update({ countdown: 3.2, time: 0 });
  return { update, assembly };
}
