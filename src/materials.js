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
    noise(224, 12);
    // Ceramic bridge cladding: crisp joints and restrained fastener detail.
    for (let y = 0; y < 256; y += 32) {
      ctx.fillStyle = "#a7b5c3";
      ctx.fillRect(0, y, 128, 2);
      ctx.fillStyle = "#f4f1e4";
      ctx.fillRect(0, y + 2, 128, 1);
    }
    for (let x = 0; x < 128; x += 32) {
      ctx.fillStyle = "#c6cbd1";
      ctx.fillRect(x, 0, 1, 256);
    }
    for (let y = 8; y < 256; y += 32)
      for (let x = 7; x < 128; x += 32) {
        ctx.fillStyle = "#676d69";
        ctx.fillRect(x, y, 2, 2);
        ctx.fillStyle = "#c2c7ba";
        ctx.fillRect(x, y + 2, 2, 1);
      }
    for (let i = 0; i < 14; i++) {
      const x = random() * 128,
        y = random() * 256;
      ctx.fillStyle = `rgba(40,48,39,${0.02 + random() * 0.025})`;
      ctx.fillRect(x, y, 1 + random() * 3, 8 + random() * 35);
    }
    chips(28, "#b4bcc2");
    chips(20, "#fff8e3");
    ctx.fillStyle = "#374249";
    ctx.font = "bold 10px monospace";
    ctx.fillText("K / 06", 75, 244);
  });
  const road = raster(256, 256, (ctx, random, noise, chips) => {
    // Abraded induction slabs: broad longitudinal wear and staggered plates,
    // not dark asphalt, tyre lanes, painted arrows or a highway centreline.
    noise(150, 38);
    for (let i = 0; i < 45; i++) {
      const x = random() * 256,
        y = random() * 256;
      const width = 3 + random() * 17,
        length = 40 + random() * 175;
      ctx.fillStyle = i % 3 ? "#c6c5ca30" : "#343b5145";
      ctx.fillRect(x, y, width, length);
      ctx.fillRect(x, y - 256, width, length);
      ctx.fillStyle = "#e0dcd326";
      ctx.fillRect(x, y, 1, length);
    }
    for (const [x, y, width, height] of [
      [0, 21, 91, 82],
      [91, 0, 108, 143],
      [199, 86, 57, 123],
      [48, 173, 119, 83],
    ]) {
      ctx.fillStyle = "#53566635";
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = "#373e4c";
      ctx.fillRect(x, y, width, 2);
      ctx.fillStyle = "#c6c4bd";
      ctx.fillRect(x, y + 2, width, 1);
      ctx.fillStyle = "#555a66";
      for (const bolt of [x + 6, x + width - 7])
        ctx.fillRect(bolt, y + 7, 2, 2);
    }
    // Uneven scorch and exposed aggregate interrupt the manufactured seams.
    chips(430, "#616575");
    chips(310, "#bfc0bd");
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = i % 2 ? "#51546555" : "#c7c2bd55";
      ctx.fillRect(
        random() * 256,
        random() * 256,
        1 + random() * 3,
        8 + random() * 34,
      );
    }
  });
  const edge = raster(128, 128, (ctx, random, noise, chips) => {
    // Cast impact blocks with embedded fasteners and dirty recessed joints.
    noise(190, 31);
    ctx.fillStyle = "#4d535c";
    ctx.fillRect(0, 0, 5, 128);
    ctx.fillRect(64, 0, 3, 128);
    ctx.fillStyle = "#dbd5bd";
    ctx.fillRect(5, 0, 2, 128);
    ctx.fillRect(67, 0, 1, 128);
    for (const x of [13, 52, 77, 116])
      for (const y of [18, 81]) {
        ctx.fillStyle = "#56595a";
        ctx.fillRect(x, y, 4, 4);
        ctx.fillStyle = "#e3dac2";
        ctx.fillRect(x, y, 3, 1);
      }
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = "#333c4a30";
      ctx.fillRect(
        random() * 128,
        random() * 128,
        2 + random() * 7,
        18 + random() * 60,
      );
    }
    ctx.fillStyle = "#555a5b";
    ctx.fillRect(11, 109, 42, 8);
    ctx.fillRect(76, 109, 42, 8);
    chips(130, "#777d80");
    chips(80, "#dad1b8");
  });
  const facade = raster(128, 256, (ctx, random, noise, chips) => {
    noise(224, 10);
    for (let y = 0; y < 256; y += 16) {
      ctx.fillStyle = "#8396a9";
      ctx.fillRect(0, y, 128, 2);
      ctx.fillStyle = "#f3eeda";
      ctx.fillRect(0, y + 2, 128, 1);
      for (let x = 8; x < 128; x += 16) {
        ctx.fillStyle = "#1d3656";
        ctx.fillRect(x, y + 5, 9, 7);
        ctx.fillStyle =
          random() > 0.82 ? accent : random() > 0.6 ? "#e5b47a" : "#507c9d";
        ctx.fillRect(x + 1, y + 5, 7, 2);
        ctx.fillStyle = "#bbc1b2";
        ctx.fillRect(x, y + 12, 9, 1);
      }
    }
    for (let x = 0; x < 128; x += 32) {
      ctx.fillStyle = "#eee9d7";
      ctx.fillRect(x, 0, 4, 256);
      ctx.fillStyle = "#748aa1";
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
    ctx.fillText("BM—04", 8, 240);
    chips(18, "#b4c3ce");
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
    road,
    edge,
    facade,
    paint,
    water,
    boost: pad(true),
    arms: pad(false),
  };
}
