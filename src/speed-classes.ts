export interface SpeedClass {
  readonly id: `c${number}`;
  readonly name: string;
  readonly pace: number;
}
export const SPEED_CLASSES: readonly SpeedClass[] = Object.freeze(
  (
    [
      { id: "c1", name: "INDUCTION", pace: 1.2 },
      { id: "c2", name: "RESONANCE", pace: 1.4 },
      { id: "c3", name: "SINGULARITY", pace: 1.6 },
      { id: "c4", name: "SUPERNOVA", pace: 1.8 },
    ] satisfies SpeedClass[]
  ).map(Object.freeze as (spec: SpeedClass) => Readonly<SpeedClass>),
);
