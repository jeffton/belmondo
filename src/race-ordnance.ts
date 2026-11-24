import { clamp } from "./track.ts";
import type { Race } from "./race.ts";

export function advanceOrdnance(race: Race, dt: number, classDt: number) {
  const { pace } = race.classSpec;
  for (const shot of race.shots) {
    shot.life -= classDt;
    if (shot.type !== "MISSILE") continue;
    const previous = shot.position.clone();
    const candidate = race.racers[shot.target!];
    const target =
      candidate && !candidate.eliminated && !candidate.finished
        ? candidate
        : null;
    if (target) {
      const desired = target.position.clone().sub(shot.position).normalize();
      shot.velocity
        .lerp(desired.multiplyScalar(320 * pace), 1 - Math.exp(-classDt * 3))
        .normalize()
        .multiplyScalar(320 * pace);
    }
    shot.position.addScaledVector(shot.velocity, dt);
    if (target) {
      const segment = shot.position.clone().sub(previous);
      const t = clamp(
        target.position.clone().sub(previous).dot(segment) / segment.lengthSq(),
        0,
        1,
      );
      const closest = previous.addScaledVector(segment, t);
      if (closest.distanceTo(target.position) < 5) {
        race.damage(target, 28, "MISSILE");
        shot.life = 0;
      }
    }
  }
  race.shots = race.shots.filter((s) => s.life > 0);
  for (const mine of race.mines) {
    mine.life -= classDt;
    for (const r of race.racers)
      if (
        !r.eliminated &&
        !r.finished &&
        r.id !== mine.owner &&
        r.position.distanceTo(mine.position) < 5
      ) {
        race.damage(r, 24, "MINE");
        mine.life = 0;
        break;
      }
  }
  race.mines = race.mines.filter((m) => m.life > 0);
}
