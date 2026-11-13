import * as THREE from "three";
import { createPierreAdvertising } from "./pierre-advertising.js";
import { ROADSIDE_ART } from "./advertising-art.js";
import { createAdvertising } from "./advertising-panels.js";

export { createAdvertising } from "./advertising-panels.js";

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
  // Four individually staged landmarks per lap: three different campaigns and
  // one full-size Pierre panel. Nothing is tiled along the running rail.
  const campaigns = {
    "KAISEKI COAST": [
      [0.195, 1, 0, 56],
      [0.485, 1, 2, 50],
      [0.65, 1, 6, 60],
      [0.91, -1, -1, 48],
    ],
    "SOLAR ARRAY": [
      [0.105, -1, 1, 56],
      [0.31, 1, 2, 50],
      [0.79, 1, 7, 60],
      [0.92, -1, -1, 48],
    ],
    WHITEOUT: [
      [0.105, 1, 4, 52],
      [0.235, 1, 0, 58],
      [0.56, 1, 3, 50],
      [0.94, -1, -1, 48],
    ],
    MONSOON: [
      [0.09, 1, 1, 56],
      [0.37, -1, 6, 60, 20],
      [0.575, -1, 4, 50, 20],
      [0.94, 1, -1, 48],
    ],
    "VESPER CIRCUIT": [
      [0.12, -1, 3, 54],
      [0.32, 1, 4, 60],
      [0.69, -1, 5, 52, 0, -4],
      [0.965, -1, -1, 50],
    ],
    CINDERLINE: [
      [0.3, -1, 5, 56],
      [0.41, 1, 2, 52],
      [0.68, 1, 7, 60],
      [0.945, 1, -1, 48],
    ],
    NOCTILUCENT: [
      [0.12, 1, 0, 56],
      [0.3, -1, 3, 52],
      [0.65, -1, 4, 60],
      [0.93, -1, -1, 48],
    ],
  };
  return campaigns[track.config.name].map(
    ([u, side, brand, width, elevation = 0, setback = 0]) => {
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
      const height = width * (384 / 1024);
      const center = frame.p
        .clone()
        .addScaledVector(
          frame.right,
          side * (frame.width + width * 0.46 + 12 + setback),
        );
      // Monsoon's two lock-wall installations stand above the hydraulic walls.
      center.y = frame.p.y + height / 2 + 7 + elevation;
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
    },
  );
}

export function buildTrackAdvertising(scene, track, environment) {
  const advertising = createAdvertising(
    scene,
    ROADSIDE_ART.url,
    ROADSIDE_ART.columns,
    ROADSIDE_ART.rows,
    ROADSIDE_ART.region,
    true,
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
      const top = center.y - height / 2 + 1;
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
  pierre.finish();
}
