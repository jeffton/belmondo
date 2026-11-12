import * as THREE from "three";
import { createPierreAdvertising } from "./pierre-advertising.js";

const ATLAS =
  "/art/openai-image-2026-11-11T16-25-29-514Z-ig_0a4106913d49f121016af496c5017087d286f627a074fae0ad.png";

// Four original tenants share one image atlas. Spatial batches keep facade ads
// in the ordinary camera frustum; no per-frame updates or transparent glow layers.
export function createAdvertising(scene, atlas = ATLAS, columns = 2, rows = 2) {
  const root = new THREE.Group();
  root.name = "district-advertising";
  scene.add(root);
  const texture = new THREE.TextureLoader().load(atlas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  const panelMaterial = new THREE.MeshBasicMaterial({ map: texture });
  const housingMaterial = new THREE.MeshLambertMaterial({ color: 0x142333 });
  const neonMaterials = [
    0xff654d, 0x9bffd9, 0xbcafff, 0xf3f5e7, 0xff654d, 0xbcafff, 0x9bffd9,
    0xf3f5e7,
  ].map((color) => new THREE.MeshBasicMaterial({ color }));
  const box = new THREE.BoxGeometry(1, 1, 1);
  const chunks = new Map();
  const transform = new THREE.Object3D();

  function facade(position, yaw, size, brand, height = size) {
    const key = `${Math.floor(position.x / 256)}:${Math.floor(position.z / 256)}`;
    if (!chunks.has(key))
      chunks.set(key, { positions: [], uv: [], details: [] });
    const chunk = chunks.get(key);
    const rotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      yaw,
    );
    const corner = (x, y, z) =>
      new THREE.Vector3(x, y, z).applyQuaternion(rotation).add(position);
    const corners = [
      corner(-size / 2, -height / 2, 0.35),
      corner(size / 2, -height / 2, 0.35),
      corner(size / 2, height / 2, 0.35),
      corner(-size / 2, height / 2, 0.35),
    ];
    // Inset UVs exclude adjacent atlas cells at minified mip levels.
    const inset = 0.002;
    const u = (brand % columns) / columns;
    const v = 1 - (Math.floor(brand / columns) + 1) / rows;
    const uv = [
      [u + inset, v + inset],
      [u + 1 / columns - inset, v + inset],
      [u + 1 / columns - inset, v + 1 / rows - inset],
      [u + inset, v + 1 / rows - inset],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      chunk.positions.push(...corners[i].toArray());
      chunk.uv.push(...uv[i]);
    }
    const detail = (x, y, z, w, h, d, material) => {
      transform.position.copy(corner(x, y, z));
      transform.quaternion.copy(rotation);
      transform.scale.set(w, h, d);
      transform.updateMatrix();
      chunk.details.push({ matrix: transform.matrix.clone(), material });
    };
    detail(0, 0, 0, size + 0.7, height + 0.7, 0.6, housingMaterial);
    // Asymmetric light rails are physical fixtures, not floating holograms.
    detail(
      -size / 2 - 0.6,
      0,
      0.2,
      0.2,
      height + 1.5,
      0.25,
      neonMaterials[brand],
    );
    detail(
      0,
      -height / 2 - 0.6,
      0.2,
      size + 1.5,
      0.2,
      0.25,
      neonMaterials[brand],
    );
  }

  function finish() {
    for (const chunk of chunks.values()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(chunk.positions, 3),
      );
      geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(chunk.uv, 2),
      );
      geometry.computeBoundingSphere();
      root.add(new THREE.Mesh(geometry, panelMaterial));
      for (const material of [housingMaterial, ...neonMaterials]) {
        const details = chunk.details.filter((d) => d.material === material);
        if (!details.length) continue;
        const mesh = new THREE.InstancedMesh(box, material, details.length);
        details.forEach((d, i) => mesh.setMatrixAt(i, d.matrix));
        mesh.computeBoundingSphere();
        root.add(mesh);
      }
    }
  }
  return { facade, finish };
}

export function buildSplitMarkers(scene, track) {
  const [start, end] = track.config.split;
  let fork = start * track.length;
  for (let s = fork + 1; s < end * track.length; s += 2) {
    if (!track.bounds(s, -1).connected) {
      fork = s;
      break;
    }
  }
  const dark = new THREE.MeshLambertMaterial({ color: 0x142936 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const distance of [270, 150, 60]) {
    const s = fork - distance;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 320;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#142936";
    ctx.fillRect(0, 0, 512, 320);
    ctx.strokeStyle = "#eaf5dc";
    ctx.lineWidth = 12;
    ctx.strokeRect(8, 8, 496, 304);
    ctx.fillStyle = "#edff77";
    ctx.textAlign = "center";
    ctx.font = "bold 66px monospace";
    ctx.fillText("FORK", 256, 83);
    ctx.font = "bold 50px monospace";
    ctx.fillText(`${distance} m`, 256, 291);
    ctx.strokeStyle = "#eaf5dc";
    ctx.lineWidth = 16;
    for (const direction of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(256, 221);
      ctx.lineTo(256, 184);
      ctx.lineTo(256 + direction * 120, 125);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(256 + direction * 120, 125);
      ctx.lineTo(256 + direction * 65, 128);
      ctx.moveTo(256 + direction * 120, 125);
      ctx.lineTo(256 + direction * 105, 173);
      ctx.stroke();
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.magFilter = THREE.NearestFilter;
    const face = new THREE.MeshBasicMaterial({ map });
    for (const side of [-1, 1]) {
      const u = s / track.length;
      const branch = u > start && u < end ? side : 0;
      const f = track.frame(s, branch);
      const marker = new THREE.Group();
      marker.name = "split-warning";
      marker.position.copy(f.p).addScaledVector(f.right, side * (f.width + 6));
      marker.rotation.y = Math.atan2(-f.tangent.x, -f.tangent.z);
      const stem = new THREE.Mesh(box, dark);
      stem.position.y = 3.6;
      stem.scale.set(0.4, 7.2, 0.5);
      const housing = new THREE.Mesh(box, dark);
      housing.position.y = 7.5;
      housing.scale.set(6.5, 4.2, 0.5);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.875), face);
      panel.position.set(0, 7.5, 0.26);
      marker.add(stem, housing, panel);
      scene.add(marker);
    }
  }
}

export function getTrackAdvertisingLayout(track) {
  // Four distinct large campaigns plus two slim lore installations. Placements
  // follow real outer routes, not the nonexistent centreline inside a fork.
  const campaigns = {
    "KAISEKI COAST": [
      [0.195, -1, 0],
      [0.485, 1, 2],
      [0.655, -1, 5],
      [0.9, -1, 7],
      [0.25, 1, -1],
      [0.91, 1, -2],
    ],
    "SOLAR ARRAY": [
      [0.105, -1, 1],
      [0.31, -1, 3],
      [0.49, 1, 4],
      [0.79, -1, 6],
      [0.175, 1, -1],
      [0.92, 1, -2],
    ],
    WHITEOUT: [
      [0.105, -1, 4],
      [0.235, 1, 7],
      [0.53, -1, 0],
      [0.9, 1, 6],
      [0.695, 1, -1],
      [0.94, -1, -2],
    ],
    MONSOON: [
      [0.09, 1, 2],
      [0.295, -1, 3],
      [0.575, -1, 5],
      [0.88, 1, 6],
      [0.645, -1, -1],
      [0.94, 1, -2],
    ],
    CINDERLINE: [
      [0.1, -1, 1],
      [0.395, 1, 4],
      [0.705, -1, 6],
      [0.925, 1, 7],
      [0.555, -1, -1],
      [0.945, 1, -2],
    ],
    NOCTILUCENT: [
      [0.12, 1, 0],
      [0.3, -1, 3],
      [0.65, 1, 5],
      [0.815, -1, 6],
      [0.46, 1, -1],
      [0.93, 1, -2],
    ],
  };
  return campaigns[track.config.name].map(([u, side, brand]) => {
    const branch =
      u > track.config.split[0] && u < track.config.split[1] ? side : 0;
    const frame = track.frame(u * track.length, branch);
    const normal = frame.tangent
      .clone()
      .multiplyScalar(-0.85)
      .addScaledVector(frame.right, -side * 0.55)
      .setY(0)
      .normalize();
    const yaw = Math.atan2(normal.x, normal.z);
    const width = brand < 0 ? 28 : 32;
    const height = width * (brand < 0 ? 0.13 : 384 / 1024);
    const center = frame.p
      .clone()
      .addScaledVector(frame.right, side * (frame.width + 16.5));
    center.y = frame.p.y + height / 2 + (brand < 0 ? 6 : 4);
    const horizontal = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const corners = [-1, 1].flatMap((x) =>
      [-1, 1].map((y) =>
        center
          .clone()
          .addScaledVector(horizontal, (x * width) / 2)
          .add(new THREE.Vector3(0, (y * height) / 2, 0)),
      ),
    );
    return {
      u,
      side,
      branch,
      brand,
      frame,
      center,
      yaw,
      width,
      height,
      horizontal,
      corners,
    };
  });
}

export function buildTrackAdvertising(scene, track, environment) {
  const advertising = createAdvertising(
    scene,
    "/art/belmondo-roadside-landscape-atlas.png",
    4,
    2,
  );
  const pierre = createPierreAdvertising(scene);
  const layout = getTrackAdvertisingLayout(track);
  const posts = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0x657b7b }),
    layout.length * 2,
  );
  const transform = new THREE.Object3D();
  layout.forEach((spec, i) => {
    const { center, yaw, width, height, brand, horizontal } = spec;
    if (brand < 0) pierre.facade(center, yaw, width, -brand - 1, height);
    else advertising.facade(center, yaw, width, brand, height);
    for (const [j, direction] of [-1, 1].entries()) {
      const p = center
        .clone()
        .addScaledVector(horizontal, direction * width * 0.32);
      const bottom = environment.heightAt(p.x, p.z) - 2;
      const top = center.y - height / 2 + (brand < 0 ? -0.1 : 1);
      transform.position.set(p.x, (bottom + top) / 2, p.z);
      transform.scale.set(0.9, top - bottom, 1.1);
      transform.rotation.set(0, yaw, 0);
      transform.updateMatrix();
      posts.setMatrixAt(i * 2 + j, transform.matrix);
    }
  });
  posts.name = "roadside-advertising-supports";
  posts.computeBoundingSphere();
  scene.add(posts);
  advertising.finish();
}
