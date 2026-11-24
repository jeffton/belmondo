import type { Weapon } from "./race.ts";

export const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const HOVER = 2.2;
export const GATES = 32;
export const CRAFT = [
  {
    name: "STRIKER",
    team: "VX / 01",
    color: 0xf04d35,
    speed: 160,
    thrust: 64,
    handling: 1,
    armor: 1,
    text: "Balanced / precise / forgiving",
  },
  {
    name: "RAPTOR",
    team: "LX / 27",
    color: 0x3488ff,
    speed: 175,
    thrust: 76,
    handling: 0.82,
    armor: 0.85,
    text: "High velocity / wide racing lines",
  },
  {
    name: "WRAITH",
    team: "PH / 44",
    color: 0xc4f743,
    speed: 132,
    thrust: 44,
    handling: 1.23,
    armor: 1.15,
    text: "Agile / strong shields / technical",
  },
];
export const WEAPONS: Weapon[] = [
  "MISSILE",
  "PULSE",
  "MINE",
  "SHIELD",
  "TURBO",
];
export const LAPS_BY_CLASS = Object.freeze([3, 4, 5, 5]);
export const CRITICAL_SHIELD = 25;
// A small engine-input handicap offsets the player's last-place grid slot.
export const AI_THROTTLE = 0.96;
