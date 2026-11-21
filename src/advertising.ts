import type { Track } from "./track.ts";
import type { EnvironmentSurface } from "./environment.ts";
import * as THREE from "three";
import { createPierreAdvertising } from "./pierre-advertising.ts";
import { courseAdvertisingArt } from "./advertising-art.ts";
import { createAdvertising } from "./advertising-panels.ts";

export { createAdvertising } from "./advertising-panels.ts";

export function getTrackAdvertisingLayout(track: Track) {
  // Four individually staged landmarks per lap: three different campaigns and
  // one full-size Pierre panel. Nothing is tiled along the running rail.
  const campaigns: Record<string, BillboardPlacement[]> = {
    WHITEOUT: [
      [0.142, 1, 0, 41, 6, -10, 120],
      [0.285, -1, 1, 45, 6, -10, 120],
      [0.587, 1, 2, 39, 0, -10, 75],
      [0.958, -1, -1, 37, 6, -10, 120],
    ],
    MONSOON: [
      [0.117, 1, 0, 44, 6, -10, 120],
      [0.32, -1, 1, 43, 6, -10, 120],
      [0.635, -1, 2, 39, 6, -12, 100],
      [0.89, 1, -1, 37, 0, -10, 120],
    ],
    "PALM BREAKER": [
      [0.222, 1, 0, 44, 6, -10, 120],
      [0.458, 1, 1, 39, 16, -10, 75],
      [0.668, 1, 2, 47, 6, -10, 120],
      [0.915, 1, -1, 37, 6, -10, 120],
    ],
    "SOLAR ARRAY": [
      [0.18, 1, 0, 44, 6, -12, 100],
      [0.347, 1, 1, 39, 6, -10, 120],
      [0.827, 1, 2, 47, 28, -10, 120],
      [0.902, 1, -1, 37, 6, -10, 120],
    ],
    FAULTLINE: [
      [0.17, -1, 0, 44, 0, -10, 120],
      [0.515, -1, 1, 42, 6, -10, 120],
      [0.77, -1, 2, 47, 6, -10, 120],
      [0.815, -1, -1, 37, 6, -10, 120],
    ],
    CINDERLINE: [
      [0.3, -1, 0, 44, 6, -10, 120],
      [0.46, 1, 1, 41, 0, -10, 120],
      [0.662, 1, 2, 47, 6, -10, 120],
      [0.955, 1, -1, 37, 6, -10, 120],
    ],
    NOCTILUCENT: [
      [0.17, 1, 0, 44, 6, -10, 120],
      [0.35, 1, 1, 41, 6, -10, 120],
      [0.6, 1, 2, 47, 0, -10, 120],
      [0.948, -1, -1, 37, 6, -10, 120],
    ],
    "VESPER CIRCUIT": [
      [0.13, 1, 0, 42, 0, -10, 120],
      [0.36, 1, 1, 47, 6, -10, 120],
      [0.64, 1, 2, 41, 0, -10, 120],
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
  const art = courseAdvertisingArt(track.config.name);
  const advertising = createAdvertising(
    scene,
    art.url,
    art.columns,
    art.rows,
    art.region,
    true,
    art.rails,
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
