export function frameDelta(
  previousTimestamp: number | null,
  frameTimestamp: number,
): number {
  return previousTimestamp === null
    ? 0
    : (frameTimestamp - previousTimestamp) / 1000;
}
