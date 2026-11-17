import type { Track, TrackFrame } from "./track.ts";
import type { EnvironmentSurface, TerrainSurface } from "./environment.ts";
import * as THREE from "three";
import { createPierreAdvertising } from "./pierre-advertising.ts";
import { ROADSIDE_ART } from "./advertising-art.ts";
import { toMetres } from "./units.ts";
import { createAdvertising } from "./advertising-panels.ts";

export { createAdvertising } from "./advertising-panels.ts";

export function buildSplitMarkers(
  scene: THREE.Object3D,
  track: Track,
  terrain: TerrainSurface,
) {
  const [start, end] = track.config.split;
  if (start < 0) return;
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
    const ctx = canvas.getContext("2d")!;
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
    ctx.fillText(`${Math.round(toMetres(distance))} m`, 256, 291);
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
    if (track.config.fork?.labels) {
      ctx.fillStyle = "#eaf5dc";
      ctx.font = "bold 34px monospace";
      // The face looks backwards along the course: branch +1 is left
      // in the approaching pilot's view, branch -1 is right.
      ctx.fillText(track.config.fork.labels[1], 128, 246);
      ctx.fillText(track.config.fork.labels[0], 384, 246);
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
  if (track.config.fork?.labels) {
    // A destination board above the nose stays in the forward portrait view
    // after roadside countdown signs have passed. Supports clear both decks.
    const s = fork + 65;
    const center = track.frame(s);
    const roads = [-1, 1].map((branch) => track.frame(s, branch));
    const axis = new THREE.Vector3(
      center.tangent.z,
      0,
      -center.tangent.x,
    ).normalize();
    const edges = roads.flatMap((f) =>
      [-1, 1].map((side) =>
        f.p
          .clone()
          .addScaledVector(f.right, side * (f.width + 10))
          .sub(center.p)
          .dot(axis),
      ),
    );
    const left = Math.min(...edges),
      right = Math.max(...edges);
    const datum = Math.max(...roads.map((f) => f.p.y));
    const group = new THREE.Group();
    group.name = "fork-destination-board";
    group.userData.station = s;
    group.position.copy(center.p).setY(datum);
    group.rotation.y = Math.atan2(-center.tangent.x, -center.tangent.z);
    for (const x of [left, right]) {
      const post = new THREE.Mesh(box, dark);
      post.name = "fork-destination-support";
      const foot = center.p.clone().addScaledVector(axis, x);
      const bottom = terrain.heightAt(foot.x, foot.z) - datum - 1;
      post.position.set(-x, (bottom + 39.6) / 2, 0);
      post.scale.set(1, 39.6 - bottom, 1);
      group.add(post);
    }
    const beam = new THREE.Mesh(box, dark);
    beam.position.set(-(left + right) / 2, 39, 0);
    beam.scale.set(right - left + 2, 1.2, 1.2);
    group.add(beam);
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 192;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#142936";
    ctx.fillRect(0, 0, 1024, 192);
    ctx.strokeStyle = "#eaf5dc";
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 1016, 184);
    ctx.fillStyle = "#eaf5dc";
    ctx.textAlign = "center";
    ctx.font = "bold 88px monospace";
    ctx.fillText(`↙  ${track.config.fork.labels[1]}`, 260, 126);
    ctx.fillText(`${track.config.fork.labels[0]}  ↘`, 760, 126);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.magFilter = THREE.NearestFilter;
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(38, 7.125),
      new THREE.MeshBasicMaterial({ map }),
    );
    panel.position.set(-(left + right) / 2, 35, 0.7);
    group.add(panel);
    scene.add(group);
  }
}

export function getTrackAdvertisingLayout(track: Track) {
  // Four individually staged landmarks per lap: three different campaigns and
  // one full-size Pierre panel. Nothing is tiled along the running rail.
  const campaigns: Record<string, number[][]> = {
    FAULTLINE: [
      [0.12, -1, 7, 56],
      [0.51, 1, 2, 54],
      [0.77, 1, 5, 60],
      [0.865, 1, -1, 48],
    ],
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
      [0.365, 1, 4, 60],
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

export function buildTrackAdvertising(
  scene: THREE.Object3D,
  track: Track,
  environment: EnvironmentSurface,
) {
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
  layout.forEach((spec, i: number) => {
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
