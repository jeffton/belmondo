import { createAdvertising } from "./advertising-panels.js";

// The founder gets the same freestanding, deep-framed campaign format as the
// other sponsors, rather than a thin lore strip stretched over the scenery.
export function createPierreAdvertising(scene) {
  const advertising = createAdvertising(
    scene,
    "/art/pierre-belmondo-billboard.png",
    1,
    1,
    [0, 0, 1, 1],
    true,
  );
  return {
    facade(position, yaw, width, _design, height) {
      advertising.facade(position, yaw, width, 0, height);
    },
    finish: advertising.finish,
  };
}
