import type * as THREE from "three";
import type { Track } from "./track.ts";
import type { CircuitTextures, TerrainSurface } from "./environment.ts";
import { buildCoastHeadlandBore } from "./coast-headland-bore.ts";

/** Coast's continuous bore and exposed skyway share the authored headland.
 * Solar's fork is part of the collector landscape built by buildCity, not a
 * second arcade and panel field layered over that same site. */
export function buildForkEnvironments(
  parent: THREE.Object3D,
  track: Track,
  textures: CircuitTextures,
  terrain: TerrainSurface,
) {
  if (track.config.name === "KAISEKI COAST")
    return buildCoastHeadlandBore(parent, track, textures, terrain);
}
