export const HOVER_REACH = 1.2;

export interface HoverStep {
  height: number;
  velocity: number;
  /** Suspension impulse per unit mass, excluding the gravity impulse. */
  reactionDelta: number;
}

// The existing powered near-road spring retains its restoring force. Farther
// away only upward damping acts; a distant surface never attracts the hull.
export function hoverReaction(height: number, velocity: number, pace: number) {
  const reaction = -90 * pace * pace * height - 18 * pace * velocity;
  return height <= HOVER_REACH ? reaction : Math.max(0, reaction);
}

// Sample the real moving road at both RK2 stages. Treating its start-of-step
// tangent as a fixed plane makes a fast crest outrun its suspension.
export function integrateHover(
  height: number,
  velocity: number,
  dt: number,
  gravity: number,
  reactionAt: (time: number, height: number, velocity: number) => number,
): HoverStep {
  const force = reactionAt(0, height, velocity);
  const midpointHeight = height + (velocity * dt) / 2;
  const midpointVelocity = velocity + ((force - gravity) * dt) / 2;
  const midpointForce = reactionAt(dt / 2, midpointHeight, midpointVelocity);
  return {
    height: height + midpointVelocity * dt,
    velocity: velocity + (midpointForce - gravity) * dt,
    reactionDelta: midpointForce * dt,
  };
}

export interface PitchStep {
  pitch: number;
  pitchRate: number;
}

// Physical attitude has inertia: contact changes the torque target, not the
// hull's orientation. The critically damped response uses the existing 0.16 s
// pitch-control timescale. Collision geometry must use this persistent state.
export function integratePitch(
  pitch: number,
  pitchRate: number,
  target: number,
  dt: number,
  pace: number,
): PitchStep {
  const frequency = pace / 0.16;
  const displacement = pitch - target;
  const coupledRate = pitchRate + frequency * displacement;
  const exponential = Math.exp(-frequency * dt);
  return {
    pitch: target + (displacement + coupledRate * dt) * exponential,
    pitchRate: (pitchRate - frequency * coupledRate * dt) * exponential,
  };
}
