import * as THREE from "three";
import { contactHull } from "./contacts.ts";
import { projectRoad } from "./road-projection.ts";
import { mod } from "./track.ts";
import type { Racer } from "./race.ts";
import type { Track } from "./track.ts";
import type { RoadProjection } from "./road-projection.ts";
import type { RoadSurfaceContact } from "./road-surface.ts";

interface HullMotion {
  start: THREE.Vector3[];
  end: THREE.Vector3[];
  between: THREE.Vector3[];
}
const hullMotions = new WeakMap<Racer, HullMotion>();

export function hullMotion(racer: Racer): HullMotion {
  let motion = hullMotions.get(racer);
  if (!motion) {
    const points = contactHull(racer.craft).points;
    motion = {
      start: points.map(() => new THREE.Vector3()),
      end: points.map(() => new THREE.Vector3()),
      between: points.map(() => new THREE.Vector3()),
    };
    hullMotions.set(racer, motion);
  }
  return motion;
}

export function linearHullVertices(motion: HullMotion, fraction: number) {
  if (fraction === 0) return motion.start;
  if (fraction === 1) return motion.end;
  for (let i = 0; i < motion.start.length; i++)
    motion.between[i].copy(motion.start[i]).lerp(motion.end[i], fraction);
  return motion.between;
}

// Physical contact follows the intersected deck; ordered race progress does not.
export function surfaceRoad(
  track: Track,
  position: THREE.Vector3,
  anchor: number,
  surface: RoadSurfaceContact,
): { road: RoadProjection; rail: RoadProjection } {
  const s =
    anchor +
    mod(surface.s - anchor + track.length / 2, track.length) -
    track.length / 2;
  const rail = projectRoad(track, position, s, surface.branch);
  const road = { ...rail, point: rail.point.clone(), up: surface.up };
  road.point.y =
    surface.point.y -
    (surface.up.x * (road.point.x - surface.point.x) +
      surface.up.z * (road.point.z - surface.point.z)) /
      surface.up.y;
  return { road, rail };
}
