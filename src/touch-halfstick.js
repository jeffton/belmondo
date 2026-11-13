// Project a pointer onto the lower unit semicircle. Upward motion stays on
// the horizontal diameter; diagonal motion shares the same circular travel.
export function halfstickPosition(x, y) {
  y = Math.max(0, y);
  const radius = Math.max(1, Math.hypot(x, y));
  return { x: x / radius, y: y / radius };
}
