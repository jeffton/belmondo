export const GRID_APPROACH_SECONDS = 2;
export const LAUNCH_COUNTDOWN_SECONDS = 3.2;

/** One at the distant opening pose, zero when the actual countdown begins. */
export function gridApproachBlend(countdown) {
  const t = Math.max(
    0,
    Math.min(1, (countdown - LAUNCH_COUNTDOWN_SECONDS) / GRID_APPROACH_SECONDS),
  );
  return t * t * (3 - 2 * t);
}
