export function localRecordKey(layoutId, craft, mode, speedClass, laps) {
  return `${layoutId}-${craft}-${mode}-${speedClass.id}-${laps}laps-pace${speedClass.pace}`;
}
