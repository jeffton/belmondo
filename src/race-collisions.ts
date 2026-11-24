import * as THREE from "three";
import {
  contactHull,
  craftSupport,
  hullExtent,
  solveContacts,
  writeCraftVertices,
} from "./contacts.ts";
import { HOVER_REACH } from "./hover-support.ts";
import { RAIL_PROFILE, railBounds, respondToRail } from "./rail-profile.ts";
import { advanceRaceProgress, collectRacePickups } from "./race-progress.ts";
import {
  hullMotion,
  linearHullVertices,
  surfaceRoad,
} from "./race-road-contact.ts";
import { CRAFT, HOVER } from "./race-rules.ts";
import {
  ROAD_LOOK_AHEAD,
  ROAD_LOOK_BEHIND,
  projectRoad,
  roadHeight,
} from "./road-projection.ts";
import { clamp, mod, roadBounds } from "./track.ts";
import type { Race, Racer } from "./race.ts";
import type { FinishCrossing } from "./race-progress.ts";
import type { RoadProjection } from "./road-projection.ts";
import type { RoadSurfaceContact } from "./road-surface.ts";

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

export interface RacerHistory {
  previousPositions: Map<Racer, THREE.Vector3>;
  previousYaw: Map<Racer, number>;
  previousPitch: Map<Racer, number>;
  previousRoute: Map<Racer, { s: number; branch: number }>;
}

export function resolveRaceContacts(
  race: Race,
  active: Racer[],
  {
    previousPositions,
    previousYaw,
    previousPitch,
    previousRoute,
  }: RacerHistory,
  dt: number,
  classDt: number,
  finishCrossings: FinishCrossing[],
) {
  const { track } = race;
  const { pace } = race.classSpec;
  const roads = new Map<Racer, RoadProjection>();
  const deckContacts = new Map<Racer, RoadSurfaceContact>();
  const terrainImpacts = new Set<Racer>();
  sweepDeckAndTerrain();
  const crossesSplitter = (r: Racer, road: RoadProjection) => {
    if (road.connected || !road.branch) return false;
    const previous = roadBounds(track, r.contactS, road.branch);
    if (!previous.connected) {
      const side = road.innerSide;
      const previousHeight =
        side === 1 ? previous.railMaxHeight : previous.railMinHeight;
      const nextHeight = side === 1 ? road.railMaxHeight : road.railMinHeight;
      const x = r.position.clone().sub(road.point).dot(road.wallAxis);
      const edge = side === 1 ? road.wallMax : road.wallMin;
      // A low median nose can rise into the hull as it travels forward. Its
      // finite outward footprint matters; a remote car is never pulled in.
      return (
        nextHeight > previousHeight &&
        side * (x - edge) <=
          RAIL_PROFILE.topOutset + hullExtent(r, road.wallAxis)
      );
    }
    const f = track.frame(r.contactS, road.branch);
    const x = previousPositions.get(r)!.clone().sub(f.p).dot(f.right);
    const extent = hullExtent({ yaw: previousYaw.get(r)! }, f.right);
    return (
      x >= previous.wallMin + extent - 0.05 &&
      x <= previous.wallMax - extent + 0.05
    );
  };
  const previousRoads = new Map<Racer, RoadProjection>();
  const startedInsideRails = (r: Racer, next: RoadProjection) => {
    const position = previousPositions.get(r)!;
    let road = previousRoads.get(r);
    if (!road) {
      const { s, branch } = previousRoute.get(r)!;
      road = projectRoad(track, position, s, branch);
      previousRoads.set(r, road);
    }
    const offset = next.s - road.s;
    // Use the previous station on the same connected road. A wall on an
    // unrelated landing deck still requires approach from its inside face.
    if (
      offset < -ROAD_LOOK_BEHIND ||
      offset >= ROAD_LOOK_AHEAD ||
      (next.branch !== road.branch && !next.connected && !road.connected)
    )
      road = next;
    const bounds = railBounds({ yaw: previousYaw.get(r)! }, road, position);
    const x = position.clone().sub(road.point).dot(road.wallAxis);
    return x >= bounds.min - 0.05 && x <= bounds.max + 0.05;
  };
  const constrainWall = (r: Racer) => {
    if (terrainImpacts.has(r)) return;
    r.contactMoved = true;
    const road = roads.get(r)!;
    const { min, max, intersectsMin, intersectsMax } = railBounds(
      r,
      road,
      r.position,
    );
    const x = r.position.clone().sub(road.point).dot(road.wallAxis);
    if (
      (x >= min && x <= max) ||
      track.gap(mod(road.s, track.length) / track.length) ||
      (x < min ? !intersectsMin : !intersectsMax) ||
      (!crossesSplitter(r, road) && !startedInsideRails(r, road))
    )
      return;
    const sign = x < min ? -1 : 1;
    r.position.addScaledVector(road.right, clamp(x, min, max) - x);
    respondToRail(r, road, sign);
    r.wallTouched = true;
    r.wallSide = sign;
  };
  // Resolve static barriers before hover contact as well as between pair iterations.
  for (const r of active) {
    if (r.eliminated) continue;
    constrainWall(r);
    r.contactMoved = r.wallTouched;
  }
  solveContacts(
    active.filter((r) => !r.eliminated && !terrainImpacts.has(r)),
    constrainWall,
    (a, b, closing) => {
      closing /= pace;
      for (const r of [a, b]) {
        if (closing > 12 && r.protect <= 0)
          r.shield -= ((closing - 12) * 0.1) / CRAFT[r.craft].armor;
        if (closing > 4 && r.contactSound === 0) {
          if (r.id === 0) race.emit(closing > 18 ? "hit" : "scrape", "CONTACT");
          r.contactSound = 0.25;
        }
      }
    },
  );
  for (const r of active) {
    if (r.eliminated) continue;
    if (r.shield <= 0) {
      race.eliminate(r);
      continue;
    }
    if (terrainImpacts.has(r)) {
      r.shield -= clamp(r.shield - 10, 0, 24);
      race.recover(r);
      if (r.id === 0) race.emit("hit", "GROUND IMPACT");
      // A checkpoint return cannot sweep through gates or pickups.
      continue;
    }
    settleRacer(r);
  }

  function sweepDeckAndTerrain() {
    for (const r of active) {
      const previous = previousPositions.get(r)!;
      const oldYaw = previousYaw.get(r)!;
      const oldPitch = previousPitch.get(r)!;
      const shape = contactHull(r.craft);
      const motion = hullMotion(r);
      writeCraftVertices(
        { craft: r.craft, yaw: oldYaw, pitch: oldPitch },
        motion.start,
      );
      writeCraftVertices(r, motion.end);
      const contact = race.surface.sweep(
        previous,
        r.position,
        shape,
        (fraction) => linearHullVertices(motion, fraction),
      );
      const terrainContact = race.terrain?.sweepSurface(
        previous,
        r.position,
        craftSupport(r, UP),
      );
      if (
        terrainContact &&
        (!contact || terrainContact.fraction < contact.fraction)
      ) {
        terrainImpacts.add(r);
        roads.set(r, projectRoad(track, r.position, r.contactS, r.branch));
        continue;
      }
      if (contact) {
        const centre = previous.clone().lerp(r.position, contact.fraction);
        const normalVelocity = r.velocity.dot(contact.up);
        if (normalVelocity < 0)
          r.velocity.addScaledVector(contact.up, -normalVelocity);
        // Complete the remaining motion along the contacted surface. Landing
        // removes penetration momentum, never forward/tangential momentum.
        r.position
          .copy(centre)
          .addScaledVector(r.velocity, dt * (1 - contact.fraction));
        const { road, rail } = surfaceRoad(
          track,
          r.position,
          r.contactS,
          contact,
        );
        r.contactS = road.s;
        r.branch = road.branch;
        roads.set(r, rail);
        deckContacts.set(r, contact);
      } else roads.set(r, projectRoad(track, r.position, r.contactS, r.branch));
    }
  }

  function settleRacer(r: Racer) {
    const previous = previousPositions.get(r)!;
    const ai = r.id !== 0;
    const wasGrounded = r.grounded;
    let road = r.contactMoved
      ? projectRoad(track, r.position, r.contactS, r.branch)
      : roads.get(r)!;
    let railRoad = road;
    const sweptContact = deckContacts.get(r);
    const physicalSurface =
      sweptContact ?? race.surface.beneath(r.position, HOVER + HOVER_REACH);
    let touchingDeck = sweptContact !== undefined;
    let fieldContact = false;
    if (physicalSurface) {
      const normalDistance = r.position
        .clone()
        .sub(physicalSurface.point)
        .dot(physicalSurface.up);
      let clearance: number | undefined =
        normalDistance - craftSupport(r, physicalSurface.up);
      if (clearance < 0) {
        // The lowest global vertex can be over a gap. Only hull features
        // above this finite triangle can penetrate or support the craft.
        const finite = race.surface.finiteContact(
          physicalSurface.faceId,
          r.position,
          contactHull(r.craft),
          hullMotion(r).end,
        );
        clearance = finite?.distance;
      }
      const offset =
        mod(physicalSurface.s - r.contactS + track.length / 2, track.length) -
        track.length / 2;
      const establishedContact =
        wasGrounded &&
        physicalSurface.branch === r.branch &&
        offset >= -ROAD_LOOK_BEHIND &&
        offset < ROAD_LOOK_AHEAD;
      fieldContact =
        clearance !== undefined &&
        (clearance >= 0 || touchingDeck || establishedContact);
      if (fieldContact) {
        const selected = surfaceRoad(
          track,
          r.position,
          r.contactS,
          physicalSurface,
        );
        road = selected.road;
        railRoad = selected.rail;
        if (clearance! <= 0 && (establishedContact || touchingDeck)) {
          r.position.addScaledVector(physicalSurface.up, -clearance!);
          const normalVelocity = r.velocity.dot(physicalSurface.up);
          if (normalVelocity < 0)
            r.velocity.addScaledVector(physicalSurface.up, -normalVelocity);
          touchingDeck = true;
        }
      }
    }
    const u = mod(road.s, track.length) / track.length;
    const [splitStart, splitEnd] = track.config.split;
    if (u > splitStart && u < splitEnd) r.branch = road.branch;
    else r.branch = 0;
    const splitterEntry = crossesSplitter(r, railRoad);
    r.contactS = road.s;
    r.x = road.x;
    r.vx = r.velocity.dot(road.wallAxis);
    const gap = track.gap(u);
    const height = r.position.y - roadHeight(road, r.position) - HOVER;
    // Rail faces follow the authored frame, not the triangulated deck normal.
    const { min, max } = railBounds(r, railRoad, r.position);
    const onDeck = railRoad.x >= min - 0.05 && railRoad.x <= max + 0.05;
    r.grounded =
      touchingDeck || (!gap && fieldContact && onDeck && height < HOVER_REACH);
    advanceRaceProgress(
      race,
      r,
      previous,
      previousRoute.get(r)!,
      road,
      wasGrounded,
      touchingDeck,
      onDeck,
      gap,
      height,
      u,
      dt,
      finishCrossings,
    );
    // Resolve a crossing from inside the barrier, never pull a remote body back to it.
    if (
      r.wallTouched ||
      (!gap &&
        (railRoad.x < min || railRoad.x > max) &&
        (splitterEntry || startedInsideRails(r, railRoad)) &&
        (railRoad.x < min
          ? railBounds(r, railRoad, r.position).intersectsMin
          : railBounds(r, railRoad, r.position).intersectsMax))
    ) {
      const sign = r.wallTouched ? r.wallSide! : railRoad.x < min ? -1 : 1;
      if (railRoad.x < min || railRoad.x > max)
        r.position.addScaledVector(
          railRoad.right,
          clamp(railRoad.x, min, max) - railRoad.x,
        );
      respondToRail(r, railRoad, sign);
      r.wallTouched = true;
      r.wallSide = sign;
      r.velocity.x *= Math.exp(-3 * classDt);
      r.velocity.z *= Math.exp(-3 * classDt);
      if (r.protect <= 0) r.shield -= classDt * 10;
      if (r.stun === 0) {
        r.stun = 0.3;
        if (!ai) race.emit("scrape", "IMPACT");
      }
      // Banked corrections can move the closest centreline station slightly.
      // Settle against the final rendered face, not the pre-contact plane.
      const settledRoad = projectRoad(track, r.position, r.contactS, r.branch);
      const settled = railBounds(r, settledRoad, r.position);
      const settledX = r.position
        .clone()
        .sub(settledRoad.point)
        .dot(settledRoad.wallAxis);
      r.position.addScaledVector(
        settledRoad.right,
        clamp(settledX, settled.min, settled.max) - settledX,
      );
      r.contactS = settledRoad.s;
      r.x = clamp(settledX, settled.min, settled.max);
    }
    if (!r.grounded) r.offroad += classDt;
    if (r.shield <= 0) {
      race.eliminate(r);
      return;
    }
    // An airborne body may land on another deck. Only an actual terrain hit
    // or descent entirely below every road is a lost racer, not elapsed air
    // time or distance beneath its previous route.
    if (
      !r.grounded &&
      r.velocity.y < 0 &&
      r.position.y + craftSupport(r, DOWN) < race.surface.lowestRoadY
    ) {
      r.shield -= clamp(r.shield - 10, 0, 24);
      race.recover(r);
      if (!ai) race.emit("hit", "RESCUE");
      return;
    }
    r.h = Math.max(0, r.position.y - roadHeight(road, r.position) - HOVER);
    r.vy = r.velocity.y;
    r.speed = Math.hypot(r.velocity.x, r.velocity.z);
    collectRacePickups(race, r, previous);
    r.shield = clamp(r.shield, 0, 100);
  }
}
