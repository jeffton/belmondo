export function frameDelta(previousTimestamp, frameTimestamp) {
  return previousTimestamp === null
    ? 0
    : (frameTimestamp - previousTimestamp) / 1000;
}
