import * as THREE from "three";
import type { Track } from "./track.ts";
import type { CircuitTextures, EnvironmentSurface } from "./environment.ts";
import {
  architecturalFooting,
  courseArchitecture,
} from "./course-architecture.ts";

/** A single pumping hall, race-side water race and two operational gate throats. */
export function buildMonsoonPumpChamber(
  parent: THREE.Object3D,
  track: Track,
  textures: CircuitTextures,
  environment: EnvironmentSurface,
) {
  const site = courseArchitecture(parent, "monsoon-pump-chamber", textures, {
    concrete: { color: 0x8c8c83, map: "concrete" },
    cap: { color: 0xd9d5c9, map: "paint" },
    machinery: { color: 0x203841, map: "paint" },
    gate: { color: 0xf1c845, map: "paint" },
    water: { color: 0x34766f, map: "water" },
  });
  const waters: { point: THREE.Vector3; bottom: number; road: number }[] = [];
  const foundations = [];
  function segment(start: number, end: number, step: number) {
    const n = Math.ceil(((end - start) * track.length) / step);
    return Array.from({ length: n }, (_, i) => {
      const a = track.frame((start + ((end - start) * i) / n) * track.length);
      const b = track.frame(
        (start + ((end - start) * (i + 1)) / n) * track.length,
      );
      const p = a.p.clone().lerp(b.p, 0.5);
      const d = b.p.clone().sub(a.p);
      return {
        p,
        yaw: Math.atan2(d.x, d.z),
        length: Math.hypot(d.x, d.z) + 0.6,
        width: a.width,
      };
    });
  }
  // The existing high retained reservoir is joined to a lower, visible race.
  // This occupies the already excavated shoulder, not uncut green upland.
  for (const s of segment(0.265, 0.55, 10)) {
    const right = new THREE.Vector3(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
    const local = (offset: number, y: number) =>
      s.p.clone().addScaledVector(right, offset).setY(y);
    const water = s.p.y + 6;
    const channel = local(s.width + 8, water);
    site.box("water", channel, [8, 0.6, s.length], s.yaw);
    waters.push({
      point: channel,
      bottom: environment.heightAt(channel.x, channel.z),
      road: s.p.y,
    });
    for (const offset of [s.width + 3, s.width + 13]) {
      const p = local(offset, 0);
      const foot = architecturalFooting(environment, p, 2, s.length, s.yaw);
      site.box(
        "concrete",
        p.clone().setY((foot.bottom + water + 1) / 2),
        [2, water + 1 - foot.bottom, s.length],
        s.yaw,
      );
      site.box("cap", p.clone().setY(water + 1.3), [2.4, 0.6, s.length], s.yaw);
    }
  }
  // Controlled overflow faces expose the head difference from the raceway.
  // The water runs down the retained wall into the low race, with concrete
  // cheeks tying it to the reservoir rather than floating coloured panels.
  for (const u of [0.342, 0.414, 0.491]) {
    const f = track.frame(u * track.length);
    const yaw = Math.atan2(f.tangent.x, f.tangent.z);
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const p = f.p.clone().addScaledVector(right, f.width + 13.7);
    site.box(
      "water",
      p.clone().setY((42 + f.p.y + 6) / 2),
      [0.5, 42 - f.p.y - 6, 24],
      yaw,
    );
    for (const side of [-1, 1])
      site.box(
        "cap",
        p
          .clone()
          .addScaledVector(forward, side * 13)
          .setY((44 + f.p.y + 5) / 2),
        [3, 44 - f.p.y - 5, 2],
        yaw,
      );
    site.box("gate", p.clone().setY(43), [3, 2, 28], yaw);
  }
  // One curved, connected structural volume rather than unrelated pump props.
  for (const s of segment(0.325, 0.485, 18)) {
    const right = new THREE.Vector3(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
    const p = s.p.clone().addScaledVector(right, -(s.width + 47));
    const foot = architecturalFooting(environment, p, 58, s.length, s.yaw);
    const top = Math.max(foot.top + 8, s.p.y + 66);
    foundations.push(foot);
    site.box(
      "concrete",
      p.clone().setY((foot.bottom + top) / 2),
      [58, top - foot.bottom, s.length],
      s.yaw,
    );
    site.box("cap", p.clone().setY(top + 1), [62, 2, s.length], s.yaw);
    // The continuous intake grille gives the hall a function and a readable base.
    const front = s.p.clone().addScaledVector(right, -(s.width + 17.5));
    site.box("machinery", front.setY(s.p.y + 25), [1, 18, s.length], s.yaw);
  }
  // The inlet is compressed under a high gate carriage; the second throat
  // releases into sky and the boost-fed outlet. Neither obstructs racing space.
  for (const u of [0.326, 0.49]) {
    const f = track.frame(u * track.length);
    const yaw = Math.atan2(f.tangent.x, f.tangent.z);
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    for (const side of [-1, 1]) {
      const p = f.p.clone().addScaledVector(right, side * (f.width + 19));
      const foot = architecturalFooting(environment, p, 12, 22, yaw);
      const top = f.p.y + 64;
      site.box(
        "concrete",
        p.clone().setY((foot.bottom + top) / 2),
        [12, top - foot.bottom, 22],
        yaw,
      );
      site.box("gate", p.clone().setY(f.p.y + 48), [12.6, 4, 22.6], yaw);
    }
    site.box(
      "machinery",
      f.p.clone().setY(f.p.y + 52),
      [2 * (f.width + 25), 10, 17],
      yaw,
    );
    site.box(
      "cap",
      f.p.clone().setY(f.p.y + 58),
      [2 * (f.width + 27), 2, 20],
      yaw,
    );
  }
  site.root.userData.waterContacts = waters;
  site.root.userData.foundations = foundations;
  site.root.userData.range = [0.265, 0.55];
  site.root.userData.gateStations = [0.326, 0.49];
  return site.finish();
}
