import type * as THREE from "three";

export const WEAPON_HIT_DURATION = 0.5;

/** A finite, hit-local recoil, sampled from simulation time rather than frames. */
export function weaponHitRecoil(remaining: number): number {
  if (remaining <= 0) return 0;
  const age = WEAPON_HIT_DURATION - remaining;
  const envelope = (remaining / WEAPON_HIT_DURATION) ** 1.5;
  return Math.cos(age * Math.PI * 2 * 8) * envelope;
}

/** Presentation only: called after the physical pose, shadow and camera are set. */
export function shakeHitShip(ship: THREE.Object3D, remaining: number): void {
  const recoil = weaponHitRecoil(remaining);
  if (!recoil) return;
  ship.translateX(recoil * 0.65);
  ship.rotateZ(recoil * 0.24);
  ship.rotateX(recoil * 0.07);
}

export function shakeHitCockpit(camera: THREE.Camera, remaining: number): void {
  const recoil = weaponHitRecoil(remaining);
  if (!recoil) return;
  // Angular-only feedback leaves the chase transport state and aim untouched.
  camera.rotateZ(recoil * 0.028);
  camera.rotateX(recoil * 0.012);
}
