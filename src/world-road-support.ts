import * as THREE from "three";
import type { Track, TrackFrame, RoadBounds } from "./track.ts";
import type { CircuitTextures, EnvironmentSurface } from "./environment.ts";
import { roadPoint } from "./road-cross-section.ts";
import { nightViaductSpan } from "./night-viaduct.ts";
import {
  buildElevatedStructure,
  elevatedDesign,
} from "./elevated-structures.ts";
import { quadGeometry, type CourseLighting } from "./world-road.ts";

type RoadFrame = TrackFrame & RoadBounds & { branch?: number };
const UP = new THREE.Vector3(0, 1, 0);
const mat = (
  color: THREE.ColorRepresentation,
  extra: THREE.MeshLambertMaterialParameters = {},
) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
export const supportGeometry = new THREE.BoxGeometry(1, 1, 1);

export function* buildRoadFoundations(
  scene: THREE.Scene,
  track: Track,
  stations: number[],
  textures: CircuitTextures,
  lighting: CourseLighting,
  environment: EnvironmentSurface,
  sliceStart: number,
) {
  const cfg = track.config;
  const foundationQuads: Parameters<typeof quadGeometry>[0] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    if (performance.now() - sliceStart >= 1000 / 60) {
      yield;
      sliceStart = performance.now();
    }
    const u = stations[i],
      next = stations[i + 1];
    if (track.gap(u)) continue;
    for (const branch of u >= cfg.split[0] && u < cfg.split[1]
      ? [-1, 1]
      : [0]) {
      if (
        environment.bridgeAt(u, branch) ||
        environment.bridgeAt(next % 1, branch)
      )
        continue;
      const a = track.frame(u * track.length, branch) as RoadFrame,
        b = track.frame(next * track.length, branch) as RoadFrame;
      Object.assign(a, track.bounds(u * track.length, branch), { branch });
      Object.assign(b, track.bounds(next * track.length, branch), { branch });
      for (const side of [-1, 1]) {
        if (a.connected && b.connected && side === a.innerSide) continue;
        const pa = roadPoint(a, side < 0 ? a.clipMin : a.clipMax, -2);
        const pb = roadPoint(b, side < 0 ? b.clipMin : b.clipMax, -2);
        const fa = pa.clone().setY(environment.heightAt(pa.x, pa.z) - 0.7);
        const fb = pb.clone().setY(environment.heightAt(pb.x, pb.z) - 0.7);
        foundationQuads.push({
          p: [pa, pb, fb, fa],
          color: cfg.name === "SOLAR ARRAY" ? 0x92765c : 0x737b78,
        });
      }
    }
  }
  const foundationMaterial = mat(0xffffff, {
    map: textures.concrete,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  scene.add(
    new THREE.Mesh(quadGeometry(foundationQuads, lighting), foundationMaterial),
  );
}

export function buildRoadSupports(
  scene: THREE.Scene,
  track: Track,
  textures: CircuitTextures,
  environment: EnvironmentSurface,
) {
  const cfg = track.config;
  const obj = new THREE.Object3D();
  const viaductSpan = nightViaductSpan(track);
  const elevated = elevatedDesign(track);
  const structure = buildElevatedStructure(track, environment);
  if (structure) scene.add(structure);
  const supportFrames = Array.from(
    { length: Math.ceil(track.length / 38) },
    (_, i) => {
      const u = i / Math.ceil(track.length / 38);
      if (viaductSpan && u >= viaductSpan[0] && u <= viaductSpan[1]) return [];
      if (cfg.jump !== null && u > cfg.jump - 0.025 && u < cfg.jump + 0.04)
        return [];
      return (u > cfg.split[0] && u < cfg.split[1] ? [-1, 1] : [0])
        .filter(
          (branch) =>
            !(
              elevated &&
              branch === elevated.branch &&
              u >= elevated.range[0] &&
              u <= elevated.range[1]
            ) &&
            environment.bridgeAt(u, branch) &&
            environment.supportClearAt(u, branch),
        )
        .map((branch) => track.frame(u * track.length, branch));
    },
  ).flat();
  const supports = new THREE.InstancedMesh(
    supportGeometry,
    mat(0xf4eee1, { map: textures.concrete }),
    supportFrames.length * 3,
  );
  const trusses = new THREE.InstancedMesh(
    supportGeometry,
    mat(0xed4d49),
    supportFrames.length * 2,
  );
  const beam = (
    mesh: THREE.InstancedMesh,
    index: number,
    start: THREE.Vector3,
    end: THREE.Vector3,
    width: number,
    depth: number,
  ) => {
    const direction = end.clone().sub(start);
    obj.position.copy(start).lerp(end, 0.5);
    obj.quaternion.setFromUnitVectors(UP, direction.clone().normalize());
    obj.scale.set(width, direction.length(), depth);
    obj.updateMatrix();
    mesh.setMatrixAt(index, obj.matrix);
  };
  supportFrames.forEach((f, i) => {
    const bottom = environment.heightAt(f.p.x, f.p.z) - 3;
    const foot = new THREE.Vector3(f.p.x, bottom, f.p.z),
      fork = f.p
        .clone()
        .addScaledVector(UP, -Math.min(13, (f.p.y - bottom) * 0.35));
    beam(supports, i * 3, foot, fork, 4.6, 4.6);
    for (const [j, side] of [-1, 1].entries()) {
      const edge = f.p
        .clone()
        .addScaledVector(f.right, side * f.width * 0.72)
        .addScaledVector(f.up, -2.2);
      beam(supports, i * 3 + j + 1, fork, edge, 3, 4.2);
      beam(
        trusses,
        i * 2 + j,
        fork.clone().addScaledVector(UP, 3),
        edge,
        1.1,
        1.5,
      );
    }
  });
  scene.add(supports, trusses);
}
