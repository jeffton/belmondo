import type * as THREE from "three";
import { createAdvertising } from "./advertising-panels.ts";

// The founder gets the same freestanding, deep-framed campaign format as the
// other sponsors, rather than a thin lore strip stretched over the scenery.
export function createPierreAdvertising(scene: THREE.Object3D) {
  const advertising = createAdvertising(
    scene,
    "/art/pierre-belmondo-billboard.png",
    1,
    1,
    [0, 0, 1, 1],
    true,
  );
  return {
    facade(
      position: THREE.Vector3,
      yaw: number,
      width: number,
      _design: number,
      height: number,
    ) {
      advertising.facade(position, yaw, width, 0, height);
    },
    finish: advertising.finish,
  };
}
