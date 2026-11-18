const ORIGINAL_CLASSES = ["c1", "c2", "c3"];

// The order before FAULTLINE was introduced. Storage uses layout identities,
// never their position in the current course selector.
const ORIGINAL_LAYOUTS = [
  "whiteout-2-finish-end",
  "monsoon-4-finish-end",
  "coast-4-finish-end",
  "solar-4-finish-end",
  "cinderline-2-finish-end",
  "noctilucent-4-finish-end",
  "vesper-1-finish-end",
];

export interface Progression {
  version: number;
  unlocked?: Record<string, string[]>;
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
  const saved = storage.getItem(PROGRESSION_STORAGE_KEY);
  if (!saved) return { version: 2, classes: {} };
  const progression: Progression = JSON.parse(saved);
  if (progression.version === 1) {
    progression.unlocked = Object.fromEntries(
      ORIGINAL_CLASSES.map((id) => [
        id,
        ORIGINAL_LAYOUTS.filter(
          (_, index) =>
            index < 3 ||
            ORIGINAL_LAYOUTS.slice(0, index).every(
              (layoutId) => progression.classes[id]?.[layoutId]?.won === true,
            ),
        ),
      ]),
    );
    progression.version = 2;
  }
  return progression;
}

export function trackProgress(
  progression: Progression,
  classId: string,
  layoutId: string,
) {
  return progression.classes[classId]?.[layoutId] ?? null;
}

export function speedClassIsUnlocked(
  progression: Progression,
  classId: string,
  tracks: ReadonlyArray<{ layoutId: string }>,
  testAccess: boolean,
) {
  return (
    classId !== "c4" ||
    testAccess ||
    tracks.every(
      (track) => trackProgress(progression, "c3", track.layoutId)?.won === true,
    )
  );
}

export function trackIsUnlocked(
  progression: Progression,
  classId: string,
  layoutId: string,
  trackIndex: number,
  tracks: ReadonlyArray<{ layoutId: string }>,
) {
  if (trackIndex < 3 || progression.unlocked?.[classId]?.includes(layoutId))
    return true;
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
