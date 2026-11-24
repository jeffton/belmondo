import * as THREE from "three";
import type { TrackConfig } from "./track.ts";
import { isCoastLayout } from "./track-catalog.ts";
import { clamp, mod } from "./track-math.ts";

interface RouteFrame {
  p: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  metric: number;
  bank?: number;
}

export function buildTrackPath(config: TrackConfig) {
  const curve = new THREE.CatmullRomCurve3(
    config.points.map((p) => new THREE.Vector3(...p)),
    true,
    config.curveType,
    0.45,
  );
  const length = curve.getLength();
  const count = Math.ceil(length / 3);
  const base = sampleMainRoute(config, curve, length, count);
  applyReturnRoute(config, base, count);
  const routes = sampleBranches(config, base, length, count);
  bankBranches(routes, length, count);
  return { length, count, routes };
}

function sampleMainRoute(
  config: TrackConfig,
  curve: THREE.CatmullRomCurve3,
  length: number,
  count: number,
) {
  const runway = config.sections.runway;
  const runwayStart = runway?.[0]!;
  const runwayEnd = runway?.[1]!;
  const approachPoint = (runway && curve.getPointAt(runwayStart))!;
  const landingPoint = (runway && curve.getPointAt(runwayEnd))!;
  return Array.from({ length: count + 1 }, (_, i) => {
    const u = i / count;
    const p = curve.getPointAt(u);
    // Tangent-continuous entries/runouts preserve a real, long flight straight.
    const transition = (
      a: THREE.Vector3,
      b: THREE.Vector3,
      da: THREE.Vector3,
      db: THREE.Vector3,
      t: number,
    ) =>
      a
        .clone()
        .multiplyScalar(2 * t * t * t - 3 * t * t + 1)
        .addScaledVector(da, t * t * t - 2 * t * t + t)
        .addScaledVector(b, -2 * t * t * t + 3 * t * t)
        .addScaledVector(db, t * t * t - t * t);
    const runwayDirection = (runway &&
      landingPoint
        .clone()
        .sub(approachPoint)
        .divideScalar(runwayEnd - runwayStart))!;
    const runwayFade = config.runwayEntryFade ?? 0.07;
    const runwayExitFade = config.runwayExitFade ?? runwayFade;
    if (runway && u >= runwayStart && u <= runwayEnd) {
      p.copy(approachPoint).lerp(
        landingPoint,
        (u - runwayStart) / (runwayEnd - runwayStart),
      );
    } else if (runway && u >= runwayStart - runwayFade && u < runwayStart) {
      p.copy(
        transition(
          curve.getPointAt(runwayStart - runwayFade),
          approachPoint,
          curve
            .getTangentAt(runwayStart - runwayFade)
            .multiplyScalar(length * runwayFade),
          runwayDirection.clone().multiplyScalar(runwayFade),
          (u - runwayStart + runwayFade) / runwayFade,
        ),
      );
    } else if (runway && u > runwayEnd && u <= runwayEnd + runwayExitFade) {
      p.copy(
        transition(
          landingPoint,
          curve.getPointAt(runwayEnd + runwayExitFade),
          config.runwayExitHandle === undefined
            ? runwayDirection.clone().multiplyScalar(runwayExitFade)
            : runwayDirection
                .clone()
                .normalize()
                .multiplyScalar(3 * config.runwayExitHandle),
          curve
            .getTangentAt(runwayEnd + runwayExitFade)
            .multiplyScalar(length * runwayExitFade),
          (u - runwayEnd) / runwayExitFade,
        ),
      );
    }
    // A genuine home straight spans the finish line, with generous transitions.
    const homeU = u < 0.5 ? u + 1 : u;
    const [homeStart, homeEnd] = config.sections.finishStraight;
    const homeFade = config.name === "SOLAR ARRAY" ? 0.06 : 0.055;
    const homeOutFade = config.night ? 0.075 : 0.1;
    const homeA = curve.getPointAt(homeStart);
    const homeB = curve.getPointAt(homeEnd - 1);
    if (config.night) {
      // A compact ~28-degree gravity drop has smooth entry and a long low runout.
      const top = curve.getPointAt(0.845).y;
      if (u >= 0.845)
        p.y = THREE.MathUtils.lerp(
          top,
          65,
          THREE.MathUtils.smoothstep(u, 0.845, 0.9),
        );
      if (u < 0.06)
        p.y = THREE.MathUtils.lerp(
          65,
          p.y,
          THREE.MathUtils.smoothstep(u, 0.025, 0.06),
        );
      homeA.y = homeB.y = 65;
    }
    const homeDirection = homeB
      .clone()
      .sub(homeA)
      .divideScalar(homeEnd - homeStart);
    if (homeU >= homeStart && homeU <= homeEnd) {
      p.copy(homeA).lerp(homeB, (homeU - homeStart) / (homeEnd - homeStart));
    } else if (homeU >= homeStart - homeFade && homeU < homeStart) {
      const outer = curve.getPointAt(homeStart - homeFade);
      const direction = isCoastLayout(config.layoutId)
        ? runwayDirection.clone()
        : curve.getTangentAt(homeStart - homeFade).multiplyScalar(length);
      if (config.night) {
        outer.y = 65;
        direction.y = 0;
      }
      p.copy(
        transition(
          outer,
          homeA,
          direction.multiplyScalar(homeFade),
          homeDirection.clone().multiplyScalar(homeFade * 1.25),
          (homeU - homeStart + homeFade) / homeFade,
        ),
      );
    } else if (homeU > homeEnd && homeU <= homeEnd + homeOutFade) {
      const outer = curve.getPointAt(homeEnd + homeOutFade - 1);
      const direction = curve
        .getTangentAt(homeEnd + homeOutFade - 1)
        .multiplyScalar(length);
      p.copy(
        transition(
          homeB,
          outer,
          homeDirection
            .clone()
            .multiplyScalar(homeOutFade * (config.night ? 1.25 : 1)),
          direction.multiplyScalar(homeOutFade),
          (homeU - homeEnd) / homeOutFade,
        ),
      );
    }
    // Authored coastal esses and desert outcrop turns displace the real deck,
    // not the steering. Zero first/second derivatives blend into existing
    // signatures; runway and home-straight windows remain untouched.
    const tangent = curve.getTangentAt(i / count).normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    for (const bend of config.rhythm ?? []) {
      const t = (u - bend.start) / (bend.end - bend.start);
      if (t > 0 && t < 1)
        p.addScaledVector(
          right,
          bend.offset * Math.sin(Math.PI * t) ** 2 * Math.sin(2 * Math.PI * t),
        );
    }
    if (config.ramp && u >= config.ramp.start && u < config.jump!) {
      const t = (u - config.jump! + config.ramp.length) / config.ramp.length;
      // The integrated cosine arc joins with zero added slope/curvature,
      // then progressively rotates into a takeoff slope of 2 * height/length.
      const rise =
        config.ramp.profile === "arc" ? t - Math.sin(Math.PI * t) / Math.PI : t;
      p.y += rise * config.ramp.height;
    }
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    return { p, tangent, right, up };
  });
}

type MainRoute = ReturnType<typeof sampleMainRoute>;

function applyReturnRoute(config: TrackConfig, base: MainRoute, count: number) {
  const returnRoute = config.returnRoute;
  if (returnRoute) {
    const station = (u: number) => {
      const n = u * count;
      return base[Math.floor(n)].p.clone().lerp(base[Math.ceil(n)].p, n % 1);
    };
    const points = [
      station(returnRoute.start),
      ...returnRoute.knots.map((p) => new THREE.Vector3(...p)),
      station(returnRoute.end),
    ];
    // Lock the first/last polygon legs to the retained deck's full 3D
    // tangents. Guide knots set their lengths, not a new seam direction.
    for (const [endpoint, guide, u, sign] of [
      [0, 1, returnRoute.start, 1],
      [points.length - 1, points.length - 2, returnRoute.end, -1],
    ]) {
      const tangent = station(u + 1 / count)
        .sub(station(u - 1 / count))
        .normalize();
      const distance = points[endpoint].distanceTo(points[guide]);
      points[guide]
        .copy(points[endpoint])
        .addScaledVector(tangent, sign * distance);
    }
    const path = new THREE.CurvePath<THREE.Vector3>();
    let previous = points[0];
    let previousTrim = 0;
    // Round the control polygon with sustained, physical-radius corners.
    // Entry/exit handles follow the graded straights, smoothing elevation as
    // well as heading; the unrounded legs are deliberate acceleration space.
    for (let i = 1; i < points.length - 1; i++) {
      const incoming = points[i].clone().sub(points[i - 1]);
      const outgoing = points[i + 1].clone().sub(points[i]);
      incoming.divideScalar(Math.hypot(incoming.x, incoming.z));
      outgoing.divideScalar(Math.hypot(outgoing.x, outgoing.z));
      const angle = Math.acos(
        clamp(incoming.x * outgoing.x + incoming.z * outgoing.z, -1, 1),
      );
      const radius = returnRoute.radii[i - 1];
      const trim = radius * Math.tan(angle / 2);
      const handle = (4 / 3) * radius * Math.tan(angle / 4);
      const leg = points[i].clone().sub(points[i - 1]);
      if (previousTrim + trim >= Math.hypot(leg.x, leg.z))
        throw new Error(`${config.name}: return corners overlap at knot ${i}`);
      previousTrim = trim;
      const entry = points[i].clone().addScaledVector(incoming, -trim);
      const exit = points[i].clone().addScaledVector(outgoing, trim);
      path.add(new THREE.LineCurve3(previous, entry));
      path.add(
        new THREE.CubicBezierCurve3(
          entry,
          entry.clone().addScaledVector(incoming, handle),
          exit.clone().addScaledVector(outgoing, -handle),
          exit,
        ),
      );
      previous = exit;
    }
    const finalLeg = points.at(-1)!.clone().sub(points.at(-2)!);
    if (previousTrim >= Math.hypot(finalLeg.x, finalLeg.z))
      throw new Error(
        `${config.name}: return corner consumes the exit straight`,
      );
    path.add(new THREE.LineCurve3(previous, points.at(-1)!));
    for (
      let i = Math.ceil(returnRoute.start * count);
      i <= Math.floor(returnRoute.end * count);
      i++
    )
      base[i].p.copy(
        path.getPoint(
          (i / count - returnRoute.start) /
            (returnRoute.end - returnRoute.start),
        ),
      );
  }
  // Fork offsets must follow the authored deck, including the added bends.
  if (config.rhythm || returnRoute)
    for (let i = 0; i <= count; i++) {
      const f = base[i];
      const u = i / count;
      if (
        !(config.rhythm ?? []).some((bend) => u > bend.start && u < bend.end) &&
        !(returnRoute && u >= returnRoute.start && u <= returnRoute.end)
      )
        continue;
      f.tangent = base[(i + 1) % count].p
        .clone()
        .sub(base[mod(i - 1, count)].p)
        .normalize();
      f.right.set(f.tangent.z, 0, -f.tangent.x).normalize();
      f.up.crossVectors(f.tangent, f.right).normalize();
    }
}

function sampleAuthoredFork(
  config: TrackConfig,
  base: MainRoute,
  count: number,
) {
  const authored = config.fork?.authored;
  let authoredCurves: THREE.CurvePath<THREE.Vector3>[] | undefined;
  if (authored) {
    const neckPoint = (u: number, route: number) => {
      const n = u * count;
      const a = base[Math.floor(n)],
        b = base[Math.floor(n) + 1];
      const p = a.p.clone().lerp(b.p, n % 1);
      const right = a.right
        .clone()
        .lerp(b.right, n % 1)
        .normalize();
      const phase = (u - config.split[0]) / (config.split[1] - config.split[0]);
      return p.addScaledVector(
        right,
        config.fork!.offsets[route] * Math.sin(phase * Math.PI) ** 2,
      );
    };
    authoredCurves = authored.knots.map((knots, route) => {
      const points = [
        neckPoint(authored.start, route),
        ...knots.map((p) => new THREE.Vector3(...p)),
        neckPoint(authored.end, route),
      ];
      const tangents = points.map((p, i) => {
        if (i === 0 || i === points.length - 1) {
          const u = i === 0 ? authored.start : authored.end;
          const direction = neckPoint(u + 1 / count, route)
            .sub(neckPoint(u - 1 / count, route))
            .normalize();
          return direction.multiplyScalar(
            p.distanceTo(points[i === 0 ? 1 : i - 1]),
          );
        }
        return points[i + 1]
          .clone()
          .sub(points[i - 1])
          .multiplyScalar(0.5);
      });
      const path = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 0; i < points.length - 1; i++)
        path.add(
          new THREE.CubicBezierCurve3(
            points[i],
            points[i].clone().addScaledVector(tangents[i], 1 / 3),
            points[i + 1].clone().addScaledVector(tangents[i + 1], -1 / 3),
            points[i + 1],
          ),
        );
      return path;
    });
  }
  return authoredCurves;
}

function sampleBranches(
  config: TrackConfig,
  base: MainRoute,
  length: number,
  count: number,
) {
  const authored = config.fork?.authored;
  const authoredCurves = sampleAuthoredFork(config, base, count);
  const routes: Record<number, RouteFrame[]> = {};
  for (const branch of [-1, 0, 1]) {
    const points = base.map((f, i) => {
      const phase = clamp(
        (i / count - config.split[0]) / (config.split[1] - config.split[0]),
        0,
        1,
      );
      const blend = Math.sin(phase * Math.PI) ** 2;
      if (
        authored &&
        branch &&
        i / count >= authored.start &&
        i / count <= authored.end
      )
        return authoredCurves![branch === -1 ? 0 : 1].getPoint(
          (i / count - authored.start) / (authored.end - authored.start),
        );
      const p = f.p
        .clone()
        .addScaledVector(f.right, branch * (branch === 1 ? 44 : 23) * blend);
      if (config.fork && branch) {
        const route = branch === -1 ? 0 : 1;
        p.copy(f.p).addScaledVector(
          f.right,
          config.fork.offsets[route] *
            blend *
            (config.fork.crossing ? Math.cos(phase * Math.PI) : 1),
        );
        const riseProfile = config.fork.riseProfile;
        const riseBlend = riseProfile
          ? THREE.MathUtils.smoothstep(phase, riseProfile[0], riseProfile[1]) *
            (1 -
              THREE.MathUtils.smoothstep(phase, riseProfile[2], riseProfile[3]))
          : blend;
        p.y += config.fork.rise[route] * riseBlend;
        // Route-local reverse bends displace the physical deck. Their compact
        // envelope has zero first/second derivatives at both ends, preserving
        // the common approach and merge rather than adding steering forces.
        for (const bend of config.fork.bends ?? []) {
          if (bend.branch !== branch) continue;
          const t = (phase - bend.start) / (bend.end - bend.start);
          if (t > 0 && t < 1)
            p.addScaledVector(
              f.right,
              bend.offset *
                Math.sin(Math.PI * t) ** 2 *
                Math.sin(2 * Math.PI * t),
            );
        }
        return p;
      }
      if (config.night && branch) {
        // Identity survives the crossover: +1 is always the hill route.
        // Flat entry/exit derivatives meet the common deck without a step.
        const envelope = Math.sin(Math.PI * phase) ** 2;
        const lateral =
          branch === -1
            ? -88 * envelope * Math.cos(Math.PI * phase)
            : 92 * envelope * Math.cos(Math.PI * phase);
        p.copy(f.p).addScaledVector(f.right, lateral);
        if (branch === 1)
          p.y +=
            45 *
            THREE.MathUtils.smoothstep(phase, 0.16, 0.4) *
            (1 - THREE.MathUtils.smoothstep(phase, 0.6, 0.84));
        return p;
      }
      // The fork is one level deck until its two carriageways separate.
      // Raising one half earlier creates a vertical step along the open seam.
      if (branch === 1) p.y += THREE.MathUtils.smoothstep(blend, 0.6, 1) * 12;
      return p;
    });
    routes[branch] = points.map((p, i) => {
      const previous = points[mod(i - 1, count)];
      const next = points[(i + 1) % count];
      const u = i / count;
      const beforeLaunch =
        config.jump !== null &&
        u < config.jump &&
        (i + 1) / count >= config.jump;
      const afterLaunch =
        config.jump !== null &&
        u >= config.jump &&
        (i - 1) / count < config.jump;
      const tangent = (
        beforeLaunch
          ? p.clone().sub(previous)
          : afterLaunch
            ? next.clone().sub(p)
            : next.clone().sub(previous)
      ).normalize();
      const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
      return {
        p,
        tangent,
        right,
        metric:
          (beforeLaunch
            ? p.distanceTo(previous)
            : afterLaunch
              ? next.distanceTo(p)
              : next.distanceTo(previous) / 2) /
          (length / count),
      };
    });
    routes[branch][count] = routes[branch][0];
  }
  return routes;
}

function bankBranches(
  routes: Record<number, RouteFrame[]>,
  length: number,
  count: number,
) {
  for (const frames of Object.values(routes)) {
    for (let i = 0; i < count; i++) {
      const before = frames[mod(i - 6, count)].tangent;
      const after = frames[(i + 6) % count].tangent;
      const turn = Math.atan2(
        before.z * after.x - before.x * after.z,
        before.dot(after),
      );
      frames[i].bank = clamp(
        (turn * 65) / ((12 * length) / count),
        -0.18,
        0.18,
      );
    }
  }
  // A full left/right reversal spans 0.36 radians. Spread its triangular
  // smoothing kernel over at least 0.36 / 0.008 = 45 track-station metres
  // on each side to limit roll speed through an S-bend.
  const bankSmoothingRadius = Math.ceil(0.36 / 0.008 / (length / count));
  for (const frames of Object.values(routes)) {
    const bank = frames.slice(0, count).map((f) => f.bank);
    for (let i = 0; i < count; i++) {
      let value = 0,
        weight = 0;
      for (let j = -bankSmoothingRadius; j <= bankSmoothingRadius; j++) {
        const w = bankSmoothingRadius + 1 - Math.abs(j);
        value += bank[mod(i + j, count)]! * w;
        weight += w;
      }
      frames[i].bank = value / weight;
    }
  }
}
