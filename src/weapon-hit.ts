import type * as THREE from "three";

/** A finite, hit-local recoil, sampled from simulation time rather than frames. */
export function weaponHitRecoil(remaining: number): number {
  if (remaining <= 0) return 0;
  const age = 0.42 - remaining;
  const envelope = (remaining / 0.42) ** 2;
  return Math.cos(age * Math.PI * 2 * 8) * envelope;
}

/** Presentation only: called after the physical pose, shadow and camera are set. */
export function shakeHitShip(ship: THREE.Object3D, remaining: number): void {
  const recoil = weaponHitRecoil(remaining);
  if (!recoil) return;
  ship.translateX(recoil * 0.22);
  ship.rotateZ(recoil * 0.14);
  ship.rotateX(recoil * 0.035);
}

export function shakeHitCockpit(camera: THREE.Camera, remaining: number): void {
  const recoil = weaponHitRecoil(remaining);
  if (!recoil) return;
  // Angular-only feedback leaves the chase transport state and aim untouched.
  camera.rotateZ(recoil * 0.025);
  camera.rotateX(recoil * 0.009);
}
