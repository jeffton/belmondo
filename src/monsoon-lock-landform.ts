import * as THREE from "three";
import type { Track } from "./track.ts";

/** Shared rendered/collision earthwork for the low race and high retained pool. */
export function carveMonsoonLock(
  track: Track,
  lowerCell: (x: number, z: number, ceiling: number) => void,
) {
  const [start, end] = track.config.sections.dryLock!;
  const n = Math.ceil(((end - start - 0.02) * track.length) / 10);
  for (let i = 0; i <= n; i++) {
    const f = track.frame(
      (start + 0.01 + ((end - start - 0.02) * i) / n) * track.length,
    );
    const right = new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize();
    for (let offset = f.width + 7; offset <= f.width + 204; offset += 3) {
      const p = f.p.clone().addScaledVector(right, offset);
      lowerCell(p.x, p.z, offset < f.width + 111 ? f.p.y - 18 : 26);
    }
  }
}
