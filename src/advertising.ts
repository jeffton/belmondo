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
  const ink = "#181515";
  const cream = "#fff0cc";
  const red = "#c9252b";
  const dark = new THREE.MeshLambertMaterial({ color: ink });
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const distance of [270, 150, 60]) {
    const s = fork - distance;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 320;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = cream;
    ctx.fillRect(0, 0, 512, 320);
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, 512, 84);
    ctx.fillStyle = cream;
    ctx.textAlign = "center";
    ctx.font = "italic 900 66px Arial, sans-serif";
    ctx.fillText("FORK", 256, 66);
    ctx.fillStyle = ink;
    ctx.font = "bold 50px Arial, sans-serif";
    ctx.fillText(`${Math.round(toMetres(distance))} m`, 256, 300);
    ctx.strokeStyle = red;
    ctx.lineWidth = 22;
    ctx.lineJoin = "bevel";
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
      ctx.fillStyle = ink;
      ctx.font = "bold 37px Arial, sans-serif";
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
    ctx.fillStyle = cream;
    ctx.fillRect(0, 0, 1024, 192);
    ctx.fillStyle = ink;
    ctx.fillRect(508, 0, 8, 192);
    ctx.textAlign = "center";
    ctx.font = "italic 900 100px Arial, sans-serif";
    ctx.fillText(track.config.fork.labels[1], 288, 128, 345);
    ctx.fillText(track.config.fork.labels[0], 736, 128, 345);
    ctx.fillStyle = red;
    ctx.font = "bold 104px Arial, sans-serif";
    ctx.fillText("↙", 74, 132);
    ctx.fillText("↘", 950, 132);
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
  const campaigns: Record<string, BillboardPlacement[]> = {
    WHITEOUT: [
      [0.142, 1, 4, 41, 6, -10, 120],
      [0.285, -1, 0, 45, 6, -10, 120],
      [0.587, 1, 3, 39, 0, -10, 75],
      [0.958, -1, -1, 37, 6, -10, 120],
    ],
    MONSOON: [
      [0.117, 1, 1, 44, 6, -10, 120],
      [0.32, -1, 6, 43, 6, -10, 120],
      [0.635, -1, 4, 39, 6, -12, 100],
      [0.89, 1, -1, 37, 0, -10, 120],
    ],
    "KAISEKI COAST": [
      [0.222, 1, 0, 44, 6, -10, 120],
      [0.458, 1, 2, 39, 20, -10, 75],
      [0.668, 1, 6, 47, 6, -10, 120],
      [0.915, 1, -1, 37, 6, -10, 120],
    ],
    "SOLAR ARRAY": [
      [0.18, 1, 1, 44, 6, -12, 100],
      [0.347, 1, 2, 39, 6, -10, 120],
      [0.827, 1, 7, 47, 28, -10, 120],
      [0.902, 1, -1, 37, 6, -10, 120],
    ],
    FAULTLINE: [
      [0.17, -1, 7, 44, 0, -10, 120],
      [0.515, -1, 2, 42, 6, -10, 120],
      [0.77, -1, 5, 47, 6, -10, 120],
      [0.815, -1, -1, 37, 6, -10, 120],
    ],
    CINDERLINE: [
      [0.3, -1, 5, 44, 6, -10, 120],
      [0.46, 1, 2, 41, 0, -10, 120],
      [0.662, 1, 7, 47, 6, -10, 120],
      [0.955, 1, -1, 37, 6, -10, 120],
    ],
    NOCTILUCENT: [
      [0.17, 1, 0, 44, 6, -10, 120],
      [0.35, 1, 3, 41, 6, -10, 120],
      [0.6, 1, 4, 47, 0, -10, 120],
      [0.948, -1, -1, 37, 6, -10, 120],
    ],
    "VESPER CIRCUIT": [
      [0.13, 1, 3, 42, 0, -10, 120],
      [0.36, 1, 4, 47, 6, -10, 120],
      [0.64, 1, 5, 41, 0, -10, 120],
      [0.947, -1, -1, 39, 6, -10, 120],
    ],
  };
  return campaigns[track.config.name].map((placement) =>
    billboardPose(track, placement),
  );
}

type BillboardPlacement = [
  station: number,
  side: number,
  campaign: number,
  width: number,
  elevation: number,
  setback: number,
  approach: number,
];

function billboardPose(
  track: Track,
  [u, side, brand, width, elevation, setback, aim]: BillboardPlacement,
) {
  const branch =
    u > track.config.split[0] && u < track.config.split[1] ? side : 0;
  const frame = track.frame(u * track.length, branch);
  const height = width * (211 / 512);
  const center = frame.p
    .clone()
    .addScaledVector(
      frame.right,
      side * (frame.width + width * 0.46 + 12 + setback),
    );
  center.y = frame.p.y + height / 2 + 7 + elevation;
  // Aim at the incoming line, not a fixed angle relative to the local tangent.
  // A late-apex bend can make those two directions almost perpendicular.
  const entry = u - aim / track.length;
  const entryBranch =
    entry > track.config.split[0] && entry < track.config.split[1] ? side : 0;
  const normal = track
    .frame(entry * track.length, entryBranch)
    .p.clone()
    .sub(center)
    .setY(0)
    .normalize();
  const yaw = Math.atan2(normal.x, normal.z);
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
