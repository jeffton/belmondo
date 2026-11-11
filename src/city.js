import * as THREE from "three";

// Layered waterfront districts: shared, opaque materials and instanced details.
// All placed architecture stays inside a 60 m square accepted by the terrain.
export function buildCity(scene, track, textures, environment) {
  const desert = track.config.name === "SOLAR ARRAY";
  const night = track.config.name === "NOCTILUCENT";
  const root = new THREE.Group();
  root.name = "waterfront-city";
  scene.add(root);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const taper = new THREE.CylinderGeometry(0.62, 1, 1, 12);
  const ring = new THREE.TorusGeometry(1, 0.025, 4, 48);
  const lambert = (color, map = null) =>
    new THREE.MeshLambertMaterial({ color, map, flatShading: true });
  const materials = {
    ceramic: lambert(desert ? 0xf1dcc0 : 0xe9e5dc, textures.paint),
    shell: lambert(desert ? 0xc3a48c : 0x96bec8, textures.paint),
    facade: lambert(0xd4dedb, textures.facade),
    foundation: lambert(desert ? 0xab8c73 : 0x8a9caa, textures.concrete),
    glass: lambert(night ? 0x153b60 : 0x245870),
    metal: lambert(0x354858),
    red: lambert(0xd45151),
    plants: lambert(desert ? 0x6e8972 : 0x45765c),
    warm: new THREE.MeshBasicMaterial({ color: night ? 0xf6b76b : 0xe1ac70 }),
    cyan: new THREE.MeshBasicMaterial({ color: 0x25bccc }),
    pink: new THREE.MeshBasicMaterial({ color: 0xd2549b }),
  };
  const batches = new Map();
  const transform = new THREE.Object3D();
  const put = (material, x, y, z, w, h, d, geometry = box, yaw = 0) => {
    const key = `${material}:${geometry.id}:${Math.floor(x / 256)}:${Math.floor(z / 256)}`;
    if (!batches.has(key))
      batches.set(key, {
        geometry,
        material: materials[material],
        matrices: [],
      });
    transform.position.set(x, y, z);
    transform.rotation.set(0, yaw, 0);
    transform.scale.set(w, h, d);
    transform.updateMatrix();
    batches.get(key).matrices.push(transform.matrix.clone());
  };
  let seed = 81219;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const labels = [
    "カイセキ / 08",
    "MIZU",
    "PORT / 06",
    "KIRO",
    "SORA",
    "TRAM / 02",
    "AOI",
    "ヌル / 04",
  ];
  labels.forEach((label, i) => {
    ctx.fillStyle =
      i % 3 === 0 ? "#ca427b" : i % 3 === 1 ? "#177a8b" : "#1e3045";
    ctx.fillRect(0, i * 32, 512, 32);
    ctx.fillStyle = "#f6e7cf";
    ctx.font = '700 24px "Noto Sans JP", monospace';
    ctx.fillText(label, 18, i * 32 + 25);
    ctx.fillRect(420, i * 32 + 6, 7, 20);
    ctx.fillRect(438, i * 32 + 6, 40, 5);
  });
  const signTexture = new THREE.CanvasTexture(canvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  signTexture.magFilter = THREE.NearestFilter;
  const signVertices = [],
    signUV = [];
  function sign(x, y, z, w, h, index, side) {
    const corners = [
      [x - w / 2, y - h / 2, z],
      [x + w / 2, y - h / 2, z],
      [x + w / 2, y + h / 2, z],
      [x - w / 2, y + h / 2, z],
    ];
    const bottom = 1 - (index + 1) / 8,
      top = 1 - index / 8;
    const uv = [
      [0, bottom],
      [1, bottom],
      [1, top],
      [0, top],
    ];
    for (const i of side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) {
      signVertices.push(...corners[i]);
      signUV.push(side > 0 ? uv[i][0] : 1 - uv[i][0], uv[i][1]);
    }
  }
  const verticalCanvas = document.createElement("canvas");
  verticalCanvas.width = verticalCanvas.height = 256;
  const verticalContext = verticalCanvas.getContext("2d");
  ["カイセキ", "ヌル", "電気", "海岸"].forEach((label, i) => {
    const x = i * 64;
    verticalContext.fillStyle = ["#122e43", "#3f1737", "#b33946", "#153945"][i];
    verticalContext.fillRect(x, 0, 64, 256);
    verticalContext.strokeStyle = ["#3ae0e0", "#f06fb9", "#fff0ce", "#5ce3d0"][
      i
    ];
    verticalContext.lineWidth = 3;
    verticalContext.strokeRect(x + 4, 4, 56, 248);
    verticalContext.fillStyle = verticalContext.strokeStyle;
    verticalContext.font = '700 43px "Noto Sans JP", monospace';
    verticalContext.textAlign = "center";
    [...label].forEach((glyph, j) => {
      const spacing = 210 / label.length;
      verticalContext.fillText(glyph, x + 32, 33 + spacing * (j + 0.75));
    });
    verticalContext.fillRect(x + 22, 231, 20, 5);
  });
  const verticalTexture = new THREE.CanvasTexture(verticalCanvas);
  verticalTexture.colorSpace = THREE.SRGBColorSpace;
  verticalTexture.magFilter = THREE.NearestFilter;
  const verticalVertices = [],
    verticalUV = [];
  function verticalSign(x, y, z, index, side, axis) {
    const halfWidth = 2.7,
      halfHeight = 13;
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    const uv = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (const i of side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) {
      const [u, v] = corners[i];
      verticalVertices.push(
        x + (axis ? 0 : u * halfWidth),
        y + v * halfHeight,
        z - (axis ? u * halfWidth : 0),
      );
      verticalUV.push(
        (index + (side > 0 ? uv[i][0] : 1 - uv[i][0])) / 4,
        uv[i][1],
      );
    }
    put(
      "metal",
      x - (axis ? side * 0.5 : 0),
      y,
      z - (axis ? 0 : side * 0.5),
      axis ? 0.8 : 5.7,
      26.4,
      axis ? 5.7 : 0.8,
    );
    const reach = axis ? 1.6 : 4;
    for (const dy of [-11, 11])
      put(
        "metal",
        x - (axis ? (side * reach) / 2 : 0),
        y + dy,
        z - (axis ? 0 : (side * reach) / 2),
        axis ? reach : 0.6,
        0.6,
        axis ? 0.6 : reach,
      );
  }
  const occupied = [];
  function anchor(candidate) {
    const p = environment.buildingPosition(candidate);
    if (occupied.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 67))
      return null;
    occupied.push(p);
    return p;
  }
  function footing(p, w, d) {
    const bottom =
      Math.min(
        ...[-w / 2, w / 2].flatMap((x) =>
          [-d / 2, d / 2].map((z) => environment.heightAt(p.x + x, p.z + z)),
        ),
      ) - 4;
    put("foundation", p.x, (bottom + p.y) / 2, p.z, w, p.y - bottom, d);
  }
  function district(p, roadY, index, roadPoint) {
    const w = 25 + random() * 17,
      d = 23 + random() * 15;
    const deck = Math.max(p.y + 12, roadY - 9 + random() * 18);
    footing(p, w + 8, d + 8);
    // The raised waterfront podium is occupied commercial space, not a solid plinth.
    put("glass", p.x, (p.y + deck) / 2, p.z, w, deck - p.y, d);
    const podiumFloors = Math.ceil((deck - p.y) / 7);
    const storeyHeight = (deck - p.y) / podiumFloors;
    for (let level = 0; level < podiumFloors; level++) {
      const lower = p.y + level * storeyHeight;
      const upper = lower + storeyHeight;
      const y = (lower + upper) / 2;
      put("ceramic", p.x, lower, p.z, w + 2, 0.85, d + 2);
      for (const side of [-1, 1]) {
        // Bright interiors are deeply inset behind vertical ceramic mullions.
        put(
          (level + index) % 3 ? "glass" : "warm",
          p.x,
          y,
          p.z + side * (d / 2 + 0.08),
          w - 1,
          upper - lower - 1.3,
          0.25,
        );
        put(
          (level + index) % 3 ? "warm" : "glass",
          p.x + side * (w / 2 + 0.08),
          y,
          p.z,
          0.25,
          upper - lower - 1.3,
          d - 1,
        );
      }
    }
    // Continuous mullions avoid one instance per storey while retaining depth.
    for (const side of [-1, 1])
      for (const bay of [-0.45, -0.15, 0.15, 0.45]) {
        put(
          "shell",
          p.x + w * bay,
          (p.y + deck) / 2,
          p.z + side * (d / 2 + 0.5),
          0.7,
          deck - p.y,
          1.1,
        );
        put(
          "shell",
          p.x + side * (w / 2 + 0.5),
          (p.y + deck) / 2,
          p.z + d * bay,
          1.1,
          deck - p.y,
          0.7,
        );
      }
    put("ceramic", p.x, deck, p.z, w + 5, 2, d + 5);
    const floors = 3 + Math.floor(random() * 5);
    const height = floors * 7;
    put(
      index % 3 ? "facade" : "shell",
      p.x,
      deck + height / 2,
      p.z,
      w,
      height,
      d,
    );
    for (const side of [-1, 1]) {
      const front = p.z + side * (d / 2 + 0.2);
      // Recessed warm shop glazing, projecting awnings and inhabited balconies.
      for (let bay = -1; bay <= 1; bay++) {
        const x = p.x + bay * w * 0.29;
        put("warm", x, deck + 3, front, w * 0.25, 4.4, 0.3);
        put("metal", x, deck + 3, front + side * 0.25, 0.4, 4.6, 0.4);
        put(
          index % 2 ? "red" : "shell",
          x,
          deck + 5.9,
          front + side * 1.8,
          w * 0.27,
          0.7,
          4,
        );
        for (let floor = 1; floor < floors; floor++) {
          const y = deck + floor * 7;
          put("ceramic", x, y, front + side * 1.3, w * 0.27, 0.7, 3.6);
          put("metal", x, y + 2, front + side * 2.8, w * 0.26, 0.25, 0.3);
          for (const dx of [-1, 1])
            put(
              "metal",
              x + dx * w * 0.12,
              y + 1.1,
              front + side * 2.8,
              0.22,
              2,
              0.22,
            );
          if ((floor + bay + index) % 3 === 0) {
            put("plants", x, y + 0.9, front + side * 2, 3, 1.2, 1.3);
          }
        }
      }
      // Condenser boxes and actual circular fan faces interrupt the facade grid.
      for (let floor = 1; floor < floors; floor += 2) {
        put(
          "ceramic",
          p.x + w * 0.39,
          deck + floor * 7 + 3,
          front + side * 0.9,
          3,
          2,
          1.5,
        );
        const fan = new THREE.Mesh(
          new THREE.CircleGeometry(0.68, 8),
          materials.metal,
        );
        fan.position.set(
          p.x + w * 0.39,
          deck + floor * 7 + 3,
          front + side * 1.68,
        );
        fan.rotation.y = side < 0 ? Math.PI : 0;
        // Fan discs are baked into the shared detail batch below.
        fan.updateMatrix();
        const key = `fan:${Math.floor(fan.position.x / 256)}:${Math.floor(fan.position.z / 256)}`;
        if (!batches.has(key))
          batches.set(key, {
            geometry: fan.geometry,
            material: materials.metal,
            matrices: [],
          });
        else fan.geometry.dispose();
        batches.get(key).matrices.push(fan.matrix.clone());
      }
      sign(p.x, deck + 8.2, front + side * 3.1, w * 0.75, 2.1, index % 8, side);
      if (index % 4 === 0)
        put(
          index % 8 ? "cyan" : "pink",
          p.x - w * 0.42,
          deck + height * 0.6,
          front + side,
          0.6,
          height * 0.55,
          0.5,
        );
    }
    put("ceramic", p.x, deck + height + 0.6, p.z, w + 2, 1.2, d + 2);
    put("metal", p.x + 6, deck + height + 2, p.z, 6, 2.8, 5);
    if (index % 3 === 0) {
      // Road-height projecting tenant signs, attached to two facade orientations.
      const signY = Math.min(deck + height - 14, Math.max(p.y + 14, roadY + 9));
      const tenant = Math.floor(index / 3) % 4;
      const sideZ = roadPoint.z >= p.z ? 1 : -1;
      const sideX = roadPoint.x >= p.x ? 1 : -1;
      verticalSign(
        p.x - w * 0.3,
        signY,
        p.z + sideZ * (d / 2 + 4),
        tenant,
        sideZ,
        false,
      );
      verticalSign(
        p.x + sideX * (w / 2 + 1.6),
        signY,
        p.z + d * 0.2,
        (tenant + 1) % 4,
        sideX,
        true,
      );
    }
    if (index % 3 === 0) {
      // A slender glazed upper volume steps back from the lively podium.
      const h = 50 + random() * 95;
      const y = deck + height;
      put("glass", p.x, y + h / 2, p.z, w * 0.65, h, d * 0.66);
      for (let f = 0; f <= 5; f++)
        put("ceramic", p.x, y + (f * h) / 5, p.z, w * 0.7, 1, d * 0.71);
      for (const dx of [-1, 1])
        put(
          "ceramic",
          p.x + dx * w * 0.27,
          y + h / 2,
          p.z,
          1.4,
          h + 4,
          d * 0.73,
        );
    }
  }
  // Close districts alternate with open water / landscape; no solid wall of boxes.
  for (let i = 0; i < 210; i++) {
    const f = track.frame(((i * 0.61803398875) % 1) * track.length);
    const side = i % 2 ? 1 : -1;
    const candidate = f.p
      .clone()
      .addScaledVector(f.right, side * (94 + random() * 180));
    const p = anchor(candidate);
    if (p) district(p, f.p.y, i, f.p);
  }
  const trains = [];
  const trainMaterial = materials.ceramic;
  for (let i = 0; i < 4; i++) {
    const f = track.frame((0.08 + i * 0.24) * track.length);
    const p = anchor(
      f.p.clone().addScaledVector(f.right, (i % 2 ? -1 : 1) * 420),
    );
    if (!p) continue;
    footing(p, 58, 58);
    const base = Math.max(p.y + 18, f.p.y + 8);
    const h = (desert ? 130 : 180) + i * 22;
    // Sculptural ceramic sails wrapping a faceted blue-glass core.
    put("glass", p.x, base + h / 2, p.z, 17, h, 17, taper);
    for (const side of [-1, 1]) {
      put(
        "ceramic",
        p.x + side * 15,
        base + h * 0.46,
        p.z,
        7,
        h * 0.93,
        17,
        taper,
      );
      put(
        "shell",
        p.x + side * 11,
        base + h * 0.81,
        p.z,
        3,
        h * 0.4,
        14,
        taper,
      );
      put(
        i % 2 ? "pink" : "cyan",
        p.x + side * 15,
        base + h * 0.48,
        p.z - 14,
        0.6,
        h * 0.72,
        0.6,
      );
    }
    put("foundation", p.x, (p.y + base) / 2, p.z, 52, base - p.y, 52);
    put("ceramic", p.x, base, p.z, 27, 5, 27, cylinder);
    for (let level = 0; level < 5; level++) {
      const y = base + 18 + level * 27;
      put("ceramic", p.x, y, p.z, 20 - level, 2, 20 - level, cylinder);
    }
    // Sky-transit loop stays inside the same cleared 58 m landmark footprint.
    const railY = base + 21;
    const rail = new THREE.Mesh(ring, materials.shell);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(p.x, railY, p.z);
    rail.scale.setScalar(26);
    root.add(rail);
    for (let j = 0; j < 8; j++) {
      const a = (j * Math.PI) / 4,
        x = p.x + Math.cos(a) * 26,
        z = p.z + Math.sin(a) * 26;
      const ground = environment.heightAt(x, z) - 3;
      put("ceramic", x, (ground + railY) / 2, z, 1.4, railY - ground, 1.4);
    }
    for (let car = 0; car < 3; car++) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(box, trainMaterial);
      body.scale.set(3.2, 3, 6.4);
      group.add(body);
      const glazing = new THREE.Mesh(box, materials.glass);
      glazing.scale.set(3.3, 1.1, 5.3);
      glazing.position.y = 0.45;
      group.add(glazing);
      const stripe = new THREE.Mesh(box, materials.cyan);
      stripe.scale.set(3.35, 0.22, 5.8);
      stripe.position.y = -0.65;
      group.add(stripe);
      root.add(group);
      trains.push({
        group,
        x: p.x,
        z: p.z,
        y: railY + 2.4,
        phase: i + car * 0.29,
      });
    }
    sign(p.x, base + 6, p.z + 27, 22, 4, 5, 1);
  }
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(
      batch.geometry,
      batch.material,
      batch.matrices.length,
    );
    batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  const signs = new THREE.BufferGeometry();
  signs.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(signVertices, 3),
  );
  signs.setAttribute("uv", new THREE.Float32BufferAttribute(signUV, 2));
  root.add(
    new THREE.Mesh(signs, new THREE.MeshBasicMaterial({ map: signTexture })),
  );
  const verticalSigns = new THREE.BufferGeometry();
  verticalSigns.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(verticalVertices, 3),
  );
  verticalSigns.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(verticalUV, 2),
  );
  root.add(
    new THREE.Mesh(
      verticalSigns,
      new THREE.MeshBasicMaterial({ map: verticalTexture }),
    ),
  );
  return {
    update(time) {
      for (const train of trains) {
        const angle = time * 0.24 + train.phase;
        train.group.position.set(
          train.x + Math.cos(angle) * 26,
          train.y,
          train.z + Math.sin(angle) * 26,
        );
        train.group.rotation.y = -angle;
      }
    },
  };
}
