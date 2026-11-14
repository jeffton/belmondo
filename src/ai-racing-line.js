const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Steering/braking requests only: every driver uses the ordinary ship physics.
export function followingBrake(traffic, actualLane, pace) {
  return Math.max(
    0,
    ...traffic
      .filter(
        (other) => other.front > 0 && Math.abs(other.lane - actualLane) < 5.5,
      )
      .map(
        (other) =>
          clamp((24 - other.front) / 16, 0, 1) *
          clamp(other.closing / (12 * pace), 0, 1),
      ),
  );
}
export function racingLine(
  racer,
  traffic,
  width,
  curve,
  dt,
  actualLane = racer.aiLane,
) {
  const limit =
    Math.min(6, Math.max(0, width - 8)) *
    Math.max(0, 1 - Math.abs(curve) * 220);
  const preferred =
    (((racer.id * 5) % 7) - 3) * 1.15 +
    Math.sin(racer.contactS / 210 + racer.id * 2.4) * 1.2;
  const base = clamp(preferred / (1 + Math.abs(curve) * 100), -limit, limit);
  racer.aiPassTime = Math.max(0, (racer.aiPassTime ?? 0) - dt);
  const blocker = traffic
    .filter(
      (other) =>
        other.front > -3 &&
        other.front < 75 &&
        Math.abs(other.lane - actualLane) < 5.5,
    )
    .sort((a, b) => a.front - b.front)[0];
  let target = base;
  if (blocker) {
    if (racer.aiPassTime === 0) {
      const choices = [-1, 1].map((side) => {
        const lane = clamp(blocker.lane + side * 7, -limit, limit);
        const clearance = Math.min(
          ...traffic
            .filter((other) => other.front > -12 && other.front < 85)
            .map((other) => Math.abs(lane - other.lane)),
        );
        return { lane, score: clearance - Math.abs(lane - base) * 0.08 };
      });
      choices.sort((a, b) => b.score - a.score);
      racer.aiPassLane = choices[0].lane;
      racer.aiPassTime = 1.1 + (racer.id % 3) * 0.15;
    }
    target = racer.aiPassLane;
  } else if (racer.aiPassTime > 0) {
    target = racer.aiPassLane;
  }
  // Re-evaluate occupied space during a commitment; never swerve into a
  // neighbouring hull merely to maintain a chosen passing side.
  const alongside = traffic.find(
    (other) =>
      other.front > -8 &&
      other.front < 12 &&
      (Math.abs(other.lane - target) < 4 ||
        (actualLane - other.lane) * (target - other.lane) < 0),
  );
  if (alongside) {
    const side = actualLane >= alongside.lane ? 1 : -1;
    target = clamp(alongside.lane + side * 5, -limit, limit);
  }
  racer.aiLane +=
    (clamp(target, -limit, limit) - racer.aiLane) * (1 - Math.exp(-dt * 2.5));
  if (alongside) {
    const side = actualLane >= alongside.lane ? 1 : -1;
    racer.aiLane =
      side > 0
        ? Math.max(racer.aiLane, alongside.lane + 5)
        : Math.min(racer.aiLane, alongside.lane - 5);
    racer.aiLane = clamp(racer.aiLane, -limit, limit);
  }
  return racer.aiLane;
}
