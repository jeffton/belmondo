export function localRecordKey(
  layoutId: string,
  craft: number,
  mode: string,
  speedClass: { id: string; pace: number },
  laps: number,
) {
  return `${layoutId}-${craft}-${mode}-${speedClass.id}-${laps}laps-pace${speedClass.pace}`;
}
