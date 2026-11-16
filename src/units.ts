// RAPTOR's solid model spans local z = -3.2899999618530273 to
// 3.569999933242798 in its Float32 geometry (core/mechanical/canopy/livery,
// excluding exhaust effects). Its reference length is six metres.
export const RAPTOR_LENGTH_UNITS = 6.859999895095825;
export const METRES_PER_UNIT = 6 / RAPTOR_LENGTH_UNITS;

export const toMetres = (distance: number): number =>
  distance * METRES_PER_UNIT;
export const toKilometresPerHour = (speed: number): number =>
  toMetres(speed) * 3.6;
