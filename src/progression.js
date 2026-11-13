export const PROGRESSION_STORAGE_KEY = "nv-progression";

export function loadProgression(storage) {
  return JSON.parse(
    storage.getItem(PROGRESSION_STORAGE_KEY) || '{"version":1,"classes":{}}',
  );
}

export function trackProgress(progression, classId, layoutId) {
  return progression.classes[classId]?.[layoutId] ?? null;
}

export function trackIsUnlocked(
  progression,
  classId,
  layoutId,
  trackIndex,
  tracks,
) {
  if (trackIndex < 3) return true;
  return tracks
    .slice(0, trackIndex)
    .every(
      (track) => progression.classes[classId]?.[track.layoutId]?.won === true,
    );
}

export function recordProgressionResult(progression, race, track) {
  if (
    race.mode !== "race" ||
    !race.player.finished ||
    race.player.eliminated ||
    race.position < 1 ||
    race.position > 8
  )
    return false;

  const classRecords = (progression.classes[race.classSpec.id] ??= {});
  const result = (classRecords[track.config.layoutId] ??= {
    bestPosition: race.position,
    won: false,
  });
  result.bestPosition = Math.min(result.bestPosition, race.position);
  if (race.position === 1) result.won = true;
  return true;
}
