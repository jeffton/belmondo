import * as THREE from "three";

// Small raster surfaces: painted infrastructure, aggregate, joints and wear.
// Shared across the circuit; no per-frame texture generation or network requests.
function raster(width, height, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  let seed = 3181;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const noise = (base, range) => {
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const v = Math.round(base + (random() - 0.5) * range);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, 1, 1);
      }
  };
  const chips = (count, color) => {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++)
      ctx.fillRect(
        random() * width,
        random() * height,
        1 + random() * 4,
        1 + random() * 2,
      );
  };
  draw(ctx, random, noise, chips);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
export function circuitTextures(accent) {
  const concrete = raster(128, 256, (ctx) => {
    // Cast ceramic cassettes: repeated structural bays survive stretched faces.
    // Broad glaze/relief carries the material; no granular weathering overlay.
    ctx.fillStyle = "#d4d9d5";
    ctx.fillRect(0, 0, 128, 256);
    for (let row = 0; row < 4; row++)
      for (let column = 0; column < 2; column++) {
        const x = column * 64;
        const y = row * 64;
        ctx.fillStyle = "#76858a";
        ctx.fillRect(x, y, 64, 3);
        ctx.fillRect(x, y, 2, 64);
        ctx.fillStyle = "#f5f1df";
        ctx.fillRect(x + 2, y + 3, 62, 2);
        ctx.fillRect(x + 2, y + 5, 2, 57);
        // The inset has a rolled glaze, lower cast shadow and a pale shoulder.
        const glaze = ctx.createLinearGradient(x, y + 8, x + 48, y + 55);
        glaze.addColorStop(0, row % 2 === column ? "#eeeade" : "#e2e7df");
        glaze.addColorStop(0.42, "#d8ded8");
        glaze.addColorStop(1, "#bac5c4");
        ctx.fillStyle = glaze;
        ctx.fillRect(x + 9, y + 10, 47, 40);
        ctx.fillStyle = "#f0eee2";
        ctx.fillRect(x + 9, y + 9, 47, 2);
        ctx.fillStyle = "#a8b5b7";
        ctx.fillRect(x + 54, y + 11, 3, 40);
        ctx.fillRect(x + 10, y + 49, 44, 3);
        // Broad runoff collects at the sill, rather than scattered pixel chips.
        ctx.fillStyle = "#bdc7c3";
        ctx.fillRect(x + 7, y + 55, 52, 5);
        ctx.fillStyle = "#7b8d93";
        ctx.fillRect(x + 13, y + 56, 18, 3);
        ctx.fillRect(x + 42, y + 56, 9, 3);
        ctx.fillStyle = "#8d9b9d";
        ctx.fillRect(x + 59, y + 16, 3, 5);
        ctx.fillRect(x + 59, y + 42, 3, 5);
      }
    ctx.fillStyle = "#566c79";
    ctx.fillRect(78, 183, 30, 5);
    ctx.fillStyle = accent;
    ctx.fillRect(80, 184, 25, 2);
  });
  const rock = raster(128, 256, (ctx) => {
    // Mineral beds for legacy rock instances: no manufactured seams or sockets.
    ctx.fillStyle = "#d1d1c8";
    ctx.fillRect(0, 0, 128, 256);
    const ridge = (y, depth, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let x = 0; x <= 128; x += 4) {
        const fold = Math.sin((x / 128) * Math.PI * 2) * 7;
        if (x === 0) ctx.moveTo(x, y + fold);
        else ctx.lineTo(x, y + fold);
      }
      for (let x = 128; x >= 0; x -= 4) {
        const fold = Math.sin((x / 128) * Math.PI * 2) * 7;
        ctx.lineTo(x, y + fold + depth);
      }
      ctx.closePath();
      ctx.fill();
    };
    ridge(24, 42, "#c2c4bd");
    ridge(66, 10, "#adafa9");
    ridge(109, 38, "#e0dfd3");
    ridge(147, 7, "#b8bab1");
    ridge(187, 32, "#c4c6bd");
  });
  const road = raster(256, 256, (ctx) => {
    // Satin induction alloy: broad, non-directional finish, not painted lanes.
    // Periodic fields meet at the world-UV tile boundaries without a hard seam.
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        const u = (x / 256) * Math.PI * 2;
        const v = (y / 256) * Math.PI * 2;
        const sheen =
          Math.sin(u + Math.sin(v)) * Math.cos(v) * 4 +
          Math.cos(u * 2 - v * 2) * 2;
        const value = Math.round(162 + sheen);
        ctx.fillStyle = `rgb(${value - 3},${value},${value + 4})`;
        ctx.fillRect(x, y, 1, 1);
      }
    // Staggered induction tiles: broad tonal relief and short recessed corners
    // read at racing resolution without outlining lanes along the circuit.
    for (const [x, y, width, height, tone] of [
      [12, 16, 88, 92, 153],
      [142, 38, 98, 64, 169],
      [28, 146, 76, 78, 168],
      [148, 162, 82, 70, 154],
    ]) {
      ctx.fillStyle = `rgba(${tone - 3},${tone},${tone + 4},0.58)`;
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = "#8e999f";
      ctx.fillRect(x, y, 22, 2);
      ctx.fillRect(x, y + 2, 2, 10);
      ctx.fillStyle = "#b4bab9";
      ctx.fillRect(x + width - 24, y + height - 2, 24, 2);
      // Paired flush fasteners give each cassette a useful, manufactured scale.
      ctx.fillStyle = "#929da2";
      ctx.fillRect(x + 6, y + height - 9, 3, 3);
      ctx.fillRect(x + 13, y + height - 9, 3, 3);
    }
    // Shallow expansion joints cross the travel direction. Staggered half-bays
    // supply scale without long service lips, grooves or repeated lane stripes.
    for (const [x, y] of [
      [0, 48],
      [128, 176],
    ]) {
      ctx.fillStyle = "#98a1a6";
      ctx.fillRect(x, y, 128, 1);
      ctx.fillStyle = "#a9b0b2";
      ctx.fillRect(x, y + 1, 128, 1);
    }
  });
  const edge = raster(128, 128, (ctx) => {
    ctx.fillStyle = "#d5d9d2";
    ctx.fillRect(0, 0, 128, 128);
    for (const x of [0, 64]) {
      ctx.fillStyle = "#4b5a65";
      ctx.fillRect(x, 0, 4, 128);
      ctx.fillStyle = "#f6f1df";
      ctx.fillRect(x + 4, 0, 3, 128);
      ctx.fillStyle = "#adb9ba";
      ctx.fillRect(x + 7, 94, 57, 34);
      ctx.fillStyle = "#475862";
      ctx.fillRect(x + 13, 105, 39, 12);
      for (const y of [16, 76]) {
        ctx.fillStyle = "#73838a";
        ctx.fillRect(x + 13, y, 5, 5);
        ctx.fillRect(x + 51, y, 5, 5);
      }
    }
  });
  const facade = raster(128, 256, (ctx) => {
    // Structural metal mullions and grouped glazing, not a pixel-window grid.
    ctx.fillStyle = "#c9d3d3";
    ctx.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 64) {
      for (const x of [8, 70]) {
        ctx.fillStyle = "#253f52";
        ctx.fillRect(x, y + 8, 48, 42);
        ctx.fillStyle = "#456577";
        ctx.fillRect(x, y + 8, 48, 13);
        ctx.fillStyle = "#6d8790";
        ctx.fillRect(x, y + 8, 48, 3);
        ctx.fillStyle = "#91a3aa";
        ctx.fillRect(x + 30, y + 8, 3, 42);
        ctx.fillStyle = "#eef0df";
        ctx.fillRect(x, y + 50, 48, 3);
      }
      ctx.fillStyle = "#5e7581";
      ctx.fillRect(0, y + 60, 128, 4);
    }
    ctx.fillStyle = "#758892";
    ctx.fillRect(60, 0, 5, 256);
    ctx.fillStyle = "#e1e5dc";
    ctx.fillRect(65, 0, 3, 256);
    ctx.fillStyle = "#263b4c";
    ctx.fillRect(8, 200, 48, 42);
    ctx.fillStyle = accent;
    ctx.fillRect(12, 205, 38, 5);
    ctx.fillStyle = "#71848d";
    for (const y of [217, 225, 233]) ctx.fillRect(13, y, 37, 3);
  });
  const paint = raster(128, 128, (ctx, random, noise, chips) => {
    ctx.fillStyle = "#ebece4";
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = "#546064";
    ctx.lineWidth = 1;
    ctx.strokeRect(7, 6, 114, 116);
    ctx.beginPath();
    ctx.moveTo(36, 6);
    ctx.lineTo(36, 85);
    ctx.lineTo(8, 112);
    ctx.moveTo(92, 6);
    ctx.lineTo(92, 85);
    ctx.lineTo(120, 112);
    ctx.stroke();
    for (const x of [13, 112])
      for (const y of [13, 66, 114]) {
        ctx.fillStyle = "#4d595c";
        ctx.fillRect(x, y, 2, 2);
      }
    ctx.fillStyle = "#526169";
    for (let y = 88; y < 109; y += 4) {
      ctx.fillRect(44, y, 40, 2);
    }
    ctx.fillStyle = "#b8b9ad";
    for (let i = 0; i < 70; i++) {
      const x = random() > 0.5 ? random() * 7 : 121 + random() * 7;
      ctx.fillRect(x, random() * 128, 3, 1);
    }
    chips(12, "#aeb4b1");
    ctx.fillStyle = "#4e5a5e";
    ctx.font = "bold 8px monospace";
    ctx.fillText("01", 57, 37);
  });
  const water = raster(128, 128, (ctx, random) => {
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const n = Math.round(
          155 +
            Math.sin(x * 0.2 + y * 0.3) * 13 +
            Math.sin(y * 0.6) * 15 +
            Math.sin(x * 0.1 - y * 0.15) * 4,
        );
        ctx.fillStyle = `rgb(${n},${n + 5},${n + 7})`;
        ctx.fillRect(x, y, 1, 1);
      }
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = "#c0d0ca55";
      ctx.fillRect(random() * 128, random() * 128, 3 + random() * 10, 1);
    }
  });
  const pad = (boost) =>
    raster(256, 128, (ctx, random, noise, chips) => {
      // A readable silhouette first; service detail stays inside the dark frame.
      const ice = boost ? "#b4ffff" : "#ffe2a5";
      const signal = boost ? "#23dae8" : "#ffb34a";
      const secondary = boost ? "#125568" : "#ff398d";
      noise(26, 9);
      const panel = (inset, cut, fill) => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(inset + cut, inset);
        ctx.lineTo(256 - inset - cut, inset);
        ctx.lineTo(256 - inset, inset + cut);
        ctx.lineTo(256 - inset, 128 - inset - cut);
        ctx.lineTo(256 - inset - cut, 128 - inset);
        ctx.lineTo(inset + cut, 128 - inset);
        ctx.lineTo(inset, 128 - inset - cut);
        ctx.lineTo(inset, inset + cut);
        ctx.closePath();
        ctx.fill();
      };
      panel(0, 14, "#74808b");
      panel(3, 13, "#111e2c");
      panel(9, 11, secondary);
      panel(12, 10, boost ? "#127e91" : "#841b60");
      // Paired cyan rails confine the directional motif to the induction pad.
      ctx.fillStyle = signal;
      for (const x of [15, 231]) ctx.fillRect(x, 22, 10, 83);
      ctx.fillStyle = ice;
      for (const x of [17, 233]) ctx.fillRect(x, 25, 3, 76);
      if (boost) {
        // Three broad induction chevrons point forward (+local Z maps down
        // this canvas through the pad mesh UVs). Never painted on bare road.
        for (const y of [17, 45, 73]) {
          ctx.fillStyle = secondary;
          ctx.fillRect(32, y, 192, 26);
          ctx.fillStyle = signal;
          ctx.beginPath();
          ctx.moveTo(37, y);
          ctx.lineTo(128, y + 12);
          ctx.lineTo(219, y);
          ctx.lineTo(219, y + 12);
          ctx.lineTo(128, y + 25);
          ctx.lineTo(37, y + 12);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = ice;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(45, y + 10);
          ctx.lineTo(128, y + 22);
          ctx.lineTo(211, y + 10);
          ctx.stroke();
        }
        ctx.fillStyle = signal;
        for (const x of [37, 82, 127, 172]) ctx.fillRect(x, 105, 35, 6);
      } else {
        // Split hexagonal armament socket: no medical cross or boost chevrons.
        ctx.strokeStyle = secondary;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(107, 17);
        ctx.lineTo(78, 32);
        ctx.lineTo(78, 56);
        ctx.lineTo(107, 70);
        ctx.moveTo(149, 17);
        ctx.lineTo(178, 32);
        ctx.lineTo(178, 56);
        ctx.lineTo(149, 70);
        ctx.stroke();
        ctx.fillStyle = ice;
        ctx.beginPath();
        for (const [i, [x, y]] of [
          [128, 17],
          [143, 36],
          [137, 36],
          [137, 59],
          [119, 59],
          [119, 36],
          [113, 36],
        ].entries()) {
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = signal;
        for (const x of [40, 199]) {
          ctx.fillRect(x, 23, 17, 8);
          ctx.fillRect(x, 42, 17, 8);
          ctx.fillRect(x, 61, 17, 8);
        }
        ctx.fillStyle = "#0b1421";
        ctx.fillRect(32, 78, 192, 34);
        ctx.fillStyle = ice;
        ctx.font = "900 30px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("WEAPON", 128, 104);
      }
      // Edge-only wear keeps the induction symbol and socket lettering intact.
      ctx.fillStyle = "#9299a0";
      for (let i = 0; i < 65; i++) {
        const x = 25 + random() * 205;
        const y = random() > 0.5 ? 4 : 120;
        ctx.fillRect(x, y, 1 + random() * 4, 1);
      }
      for (const x of [8, 245])
        for (const y of [18, 107]) {
          ctx.fillStyle = "#020913";
          ctx.fillRect(x, y, 4, 4);
          ctx.fillStyle = "#a6b5bd";
          ctx.fillRect(x + 1, y, 2, 1);
        }
    });
  return {
    concrete,
    rock,
    road,
    edge,
    facade,
    paint,
    water,
    boost: pad(true),
    arms: pad(false),
  };
}
