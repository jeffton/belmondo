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
  const concrete = raster(128, 256, (ctx, random, noise, chips) => {
    noise(174, 39);
    // Board-cast panels, recessed seams and formwork holes.
    for (let y = 0; y < 256; y += 32) {
      ctx.fillStyle = "#747a76";
      ctx.fillRect(0, y, 128, 2);
      ctx.fillStyle = "#cad0c4";
      ctx.fillRect(0, y + 2, 128, 1);
    }
    for (let x = 0; x < 128; x += 32) {
      ctx.fillStyle = "#8d948e";
      ctx.fillRect(x, 0, 1, 256);
    }
    for (let y = 8; y < 256; y += 32)
      for (let x = 7; x < 128; x += 32) {
        ctx.fillStyle = "#676d69";
        ctx.fillRect(x, y, 2, 2);
        ctx.fillStyle = "#c2c7ba";
        ctx.fillRect(x, y + 2, 2, 1);
      }
    for (let i = 0; i < 70; i++) {
      const x = random() * 128,
        y = random() * 256;
      ctx.fillStyle = `rgba(40,48,39,${0.04 + random() * 0.09})`;
      ctx.fillRect(x, y, 1 + random() * 3, 8 + random() * 35);
    }
    chips(230, "#8c9389");
    chips(160, "#d5d5c5");
    ctx.fillStyle = "#374249";
    ctx.font = "bold 10px monospace";
    ctx.fillText("K / 06", 75, 244);
  });
  const road = raster(128, 256, (ctx, random, noise, chips) => {
    noise(118, 28);
    // Aggregate road bed with maintenance patches, not a featureless plastic slab.
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = `rgba(28,36,35,${0.04 + random() * 0.1})`;
      ctx.fillRect(
        random() * 120,
        random() * 256,
        7 + random() * 16,
        12 + random() * 35,
      );
    }
    ctx.fillStyle = "#555e5b";
    ctx.fillRect(0, 0, 128, 2);
    ctx.fillRect(0, 128, 128, 2);
    ctx.fillStyle = "#a5aaa0";
    ctx.fillRect(0, 2, 128, 1);
    ctx.fillRect(0, 130, 128, 1);
    for (const x of [13, 114]) {
      ctx.fillStyle = "#606963";
      ctx.fillRect(x, 0, 1, 256);
      for (let y = 0; y < 256; y += 8) {
        ctx.fillStyle = "#353e3a";
        ctx.fillRect(x - 2, y, 5, 2);
      }
    }
    // Subtle longitudinal induction-guide scuffing and old paint fragments.
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = i % 3 ? "#70786e" : "#929582";
      ctx.fillRect(25 + random() * 78, random() * 256, 1, 3 + random() * 24);
    }
    chips(300, "#444e48");
    chips(180, "#b7b9a7");
    ctx.save();
    ctx.translate(18, 205);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#b9baa6";
    ctx.font = "bold 8px monospace";
    ctx.fillText("NV / TRANSIT", 0, 0);
    ctx.restore();
    // Mottled worn paint across one service hatch.
    ctx.strokeStyle = "#5a635a";
    ctx.strokeRect(48, 73, 32, 24);
    ctx.fillStyle = "#b0b49f";
    ctx.fillRect(51, 75, 26, 2);
    ctx.fillRect(51, 94, 26, 2);
  });
  const facade = raster(128, 256, (ctx, random, noise, chips) => {
    noise(166, 38);
    for (let y = 0; y < 256; y += 16) {
      ctx.fillStyle = "#697575";
      ctx.fillRect(0, y, 128, 2);
      ctx.fillStyle = "#bec4b7";
      ctx.fillRect(0, y + 2, 128, 1);
      for (let x = 8; x < 128; x += 16) {
        ctx.fillStyle = "#3d4f54";
        ctx.fillRect(x, y + 5, 9, 7);
        ctx.fillStyle = random() > 0.88 ? accent : "#60757a";
        ctx.fillRect(x + 1, y + 5, 7, 2);
        ctx.fillStyle = "#bbc1b2";
        ctx.fillRect(x, y + 12, 9, 1);
      }
    }
    for (let x = 0; x < 128; x += 32) {
      ctx.fillStyle = "#b4baae";
      ctx.fillRect(x, 0, 4, 256);
      ctx.fillStyle = "#59686b";
      ctx.fillRect(x + 4, 0, 1, 256);
    }
    for (let i = 0; i < 25; i++) {
      ctx.fillStyle = "#3e4c4b22";
      ctx.fillRect(random() * 128, random() * 256, 2, 18 + random() * 48);
    }
    // A structural/service bay interrupts the regular window grid.
    ctx.fillStyle = "#8b958e";
    ctx.fillRect(66, 172, 60, 43);
    ctx.fillStyle = "#515e5e";
    for (let y = 177; y < 208; y += 4) ctx.fillRect(72, y, 46, 2);
    ctx.fillStyle = "#c7c7ac";
    ctx.fillRect(5, 228, 56, 16);
    ctx.fillStyle = "#293a40";
    ctx.font = "bold 10px monospace";
    ctx.fillText("NV—04", 8, 240);
    chips(140, "#a1aa99");
  });
  const paint = raster(128, 128, (ctx, random, noise, chips) => {
    noise(235, 22);
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
    chips(100, "#aeb4b1");
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
            random() * 16,
        );
        ctx.fillStyle = `rgb(${n},${n + 5},${n + 7})`;
        ctx.fillRect(x, y, 1, 1);
      }
    for (let i = 0; i < 100; i++) {
      ctx.fillStyle = "#c0d0ca55";
      ctx.fillRect(random() * 128, random() * 128, 3 + random() * 10, 1);
    }
  });
  const pad = (boost) =>
    raster(128, 64, (ctx, random, noise, chips) => {
      noise(54, 27);
      ctx.fillStyle = boost ? "#eb6729" : "#bedc45";
      ctx.fillRect(3, 3, 122, 58);
      ctx.fillStyle = "#26363b";
      ctx.fillRect(6, 6, 116, 52);
      ctx.fillStyle = boost ? "#e77a2c" : "#d6f166";
      if (boost) {
        for (const y of [7, 23, 39]) {
          ctx.beginPath();
          ctx.moveTo(18, y);
          ctx.lineTo(64, y + 10);
          ctx.lineTo(110, y);
          ctx.lineTo(110, y + 7);
          ctx.lineTo(64, y + 17);
          ctx.lineTo(18, y + 7);
          ctx.fill();
        }
      } else {
        ctx.fillRect(57, 13, 14, 38);
        ctx.fillRect(45, 25, 38, 14);
        ctx.strokeStyle = "#bbd852";
        ctx.lineWidth = 2;
        ctx.strokeRect(28, 10, 72, 44);
      }
      chips(160, "#384642aa");
      ctx.fillStyle = "#a8b2a0";
      for (const x of [9, 116])
        for (const y of [9, 53]) ctx.fillRect(x, y, 3, 2);
    });
  return {
    concrete,
    road,
    facade,
    paint,
    water,
    boost: pad(true),
    arms: pad(false),
  };
}
