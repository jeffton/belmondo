export interface Progression {
  version: number;
  classes: Record<
    string,
    Record<string, { bestPosition: number; won: boolean }>
  >;
}

export interface ProgressionRace {
  mode: string;
  player: { finished: boolean; eliminated: boolean };
  position: number;
  classSpec: { id: string };
}

export const PROGRESSION_STORAGE_KEY = "nv-progression";

export function loadProgression(
  storage: Pick<Storage, "getItem">,
): Progression {
  return JSON.parse(
    storage.getItem(PROGRESSION_STORAGE_KEY) || '{"version":1,"classes":{}}',
  );
}

export function trackProgress(
  progression: Progression,
  classId: string,
  layoutId: string,
) {
  return progression.classes[classId]?.[layoutId] ?? null;
}

export function trackIsUnlocked(
  progression: Progression,
  classId: string,
  layoutId: string,
  trackIndex: number,
  tracks: ReadonlyArray<{ layoutId: string }>,
) {
  if (trackIndex < 3) return true;
  return tracks
    .slice(0, trackIndex)
    .every(
      (track) => progression.classes[classId]?.[track.layoutId]?.won === true,
    );
}

export function recordProgressionResult(
  progression: Progression,
  race: ProgressionRace,
  track: { config: { layoutId: string } },
) {
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
