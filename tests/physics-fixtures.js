import { pilotInputs } from "./pilot-inputs.js";
import * as THREE from "three";
import { mod, roadBounds } from "../src/track.ts";
import { Race } from "../src/race.ts";

export const neutral = { throttle: 1, steer: 0, airLeft: 0, airRight: 0 };
export function circuit({ gap = false, split = false } = {}) {
  const radius = 200,
    length = Math.PI * 2 * radius;
  const config = {
    name: "TEST CIRCUIT",
    split: split ? [0.25, 0.45] : [0.9, 0.9],
    jump: gap ? 0.7 : null,
    gapLength: gap ? 0.02 : 0,
    sections: {},
  };
  const track = {
    length,
    finishS: 0,
    config,
    physicalLengths: {},
    physicalLength: 0,
    curvature: () => 1 / radius,
    isTunnel: () => false,
    bounds(s, branch = 0) {
      return roadBounds(this, s, branch);
    },
    gap: (u) => gap && u >= 0.7 && u < 0.72,
    frame(s, branch = 0) {
      const u = mod(s, length) / length,
        theta = s / radius;
      const phase = Math.max(0, Math.min(1, (u - 0.25) / 0.2));
      const offset = split ? branch * 42 * Math.sin(phase * Math.PI) ** 2 : 0;
      const right = new THREE.Vector3(Math.cos(theta), 0, -Math.sin(theta));
      const p = new THREE.Vector3(
        radius * (1 - Math.cos(theta)),
        30,
        radius * Math.sin(theta),
      ).addScaledVector(right, offset);
      const tangent = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
      return {
        p,
        tangent,
        right,
        up: new THREE.Vector3(0, 1, 0),
        bank: 0,
        width: 15,
        metric: 1,
        u,
      };
    },
  };
  track.physicalLengths = Object.fromEntries(
    [-1, 0, 1].map((branch) => {
      const frames = Array.from({ length: 512 }, (_, i) =>
        track.frame((i * length) / 512, branch),
      );
      const distance = frames
        .slice(1)
        .reduce((sum, frame, i) => sum + frames[i].p.distanceTo(frame.p), 0);
      return [
        branch,
        distance + frames.at(-1).p.distanceTo(track.frame(length, branch).p),
      ];
    }),
  );
  track.physicalLength = track.physicalLengths[0];
  return track;
}
const straightTracks = new Map();
export function straight(width = 15) {
  if (straightTracks.has(width)) return straightTracks.get(width);
  const length = 14_000,
    finishS = 1_000;
  const track = {
    length,
    finishS,
    config: {
      name: "TEST STRAIGHT",
      split: [0.9, 0.95],
      jump: null,
      gapLength: 0,
      sections: {},
    },
    physicalLengths: { 0: length, "-1": length, 1: length },
    physicalLength: length,
    curvature: () => 0,
    isTunnel: () => false,
    bounds(s, branch = 0) {
      return roadBounds(this, s, branch);
    },
    gap: () => false,
    frame: (s) => ({
      p: new THREE.Vector3(0, 30, s),
      tangent: new THREE.Vector3(0, 0, 1),
      right: new THREE.Vector3(1, 0, 0),
      up: new THREE.Vector3(0, 1, 0),
      bank: 0,
      width,
      metric: 1,
      u: s / length,
    }),
  };
  straightTracks.set(width, track);
  return track;
}

export function setup(track = circuit(), mode = "trial") {
  const race = new Race(track, 0, mode);
  race.countdown = 0;
  return race;
}
export function drive(race, seconds, control = neutral) {
  for (let i = 0; i < seconds * 120; i++)
    race.update(
      1 / 120,
      typeof control === "function" ? control(race) : control,
    );
}
export function driver(race) {
  const p = race.player,
    frame = race.track.frame(p.contactS, p.branch);
  const curve = race.track.curvature(p.contactS, p.branch);
  const desiredYaw =
    Math.atan2(frame.tangent.x, frame.tangent.z) +
    (curve * p.speed) / 7 -
    Math.atan2(p.x, 35);
  const error = Math.atan2(
    Math.sin(desiredYaw - p.yaw),
    Math.cos(desiredYaw - p.yaw),
  );
  return pilotInputs({
    ...neutral,
    throttle: p.speed < Math.sqrt(75 / Math.abs(curve)),
    steer: Math.max(
      -1,
      Math.min(1, (curve * p.speed + error * 2 - p.yawRate * 0.1) / 0.9),
    ),
    slowing: Math.max(
      0,
      Math.min(1, (p.speed - Math.sqrt(75 / Math.abs(curve))) / 15),
    ),
  });
}
