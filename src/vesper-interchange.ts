import * as THREE from "three";
import { ARCHITECTURE_TILE_WORLD_UNITS } from "./architecture-uv.ts";
import type { Track } from "./track.ts";
import type { CircuitTextures, EnvironmentSurface } from "./environment.ts";
import type { VesperVolume } from "./vesper-districts.ts";
import { courseArchitecture } from "./course-architecture.ts";

const START = 0.306;
const END = 0.334;

function profiles(track: Track, heightAt: EnvironmentSurface["heightAt"]) {
  return Array.from({ length: 9 }, (_, i) => {
    const u = START + ((END - START) * i) / 8;
    const lower = track.frame(u * track.length, -1);
    const upper = track.frame(u * track.length, 1);
    const center = lower.p.clone().add(upper.p).multiplyScalar(0.5);
    const gap = upper.p.z - lower.p.z;
    const halfWidth = gap / 2 - Math.max(lower.width, upper.width) - 12;
    return {
      u,
      lower,
      upper,
      center,
      halfWidth,
      bottom: heightAt(center.x, center.z) - 2,
      podium: lower.p.y - 12,
      roof: Math.max(upper.p.y + 6, lower.p.y + 46),
    };
  });
}

/** Reserve the entire connected terminal before surrounding blocks/traffic. */
export function vesperInterchangeReservations(
  track: Track,
  heightAt: EnvironmentSurface["heightAt"],
): VesperVolume[] {
  const p = profiles(track, heightAt);
  return p.slice(0, -1).map((a, i) => {
    const b = p[i + 1];
    return {
      center: a.center.clone().add(b.center).multiplyScalar(0.5),
      right: new THREE.Vector3(0, 0, 1),
      forward: new THREE.Vector3(-1, 0, 0),
      width: Math.max(a.halfWidth, b.halfWidth) * 2 + 6,
      depth: Math.abs(a.center.x - b.center.x) + 3,
      bottom: Math.min(a.bottom, b.bottom),
      top: Math.max(a.roof, b.roof),
      kind: "interchange-terminal",
    };
  });
}

/** One terminal, read from a covered concourse and its open rooftop route. */
export function buildVesperInterchange(
  parent: THREE.Object3D,
  track: Track,
  textures: CircuitTextures,
  environment: EnvironmentSurface,
) {
  const arch = courseArchitecture(parent, "vesper-interchange", textures, {
    podium: { color: 0x394b59, map: "paint" },
    ceramic: { color: 0x9ca8af, map: "concrete" },
    steel: { color: 0x36485b, map: "paint" },
    soffit: { color: 0x7c8991, map: "concrete" },
    glass: { color: 0x7b9fae, map: "facade" },
    warm: { color: 0xc6a485, map: "facade" },
  });
  const p = profiles(track, environment.heightAt);
  const arcadeParts: (VesperVolume & { branch: number; depth: number })[] = [];
  const identity = new THREE.Matrix4();
  const program: {
    start: number;
    end: number;
    depth: number;
    covered: boolean;
  }[] = [];
  function prism(
    kind: "podium" | "ceramic" | "soffit" | "steel",
    corners: THREE.Vector3[],
  ) {
    const [tileU, tileV] =
      ARCHITECTURE_TILE_WORLD_UNITS[
        kind === "podium" || kind === "steel" ? "paint" : "concrete"
      ];
    const faces = [
      [1, 0, 3, 2],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
      [1, 2, 6, 5],
    ];
    const vertices: number[] = [],
      uv: number[] = [];
    for (const face of faces) {
      const width = corners[face[0]].distanceTo(corners[face[1]]) / tileU;
      const height = corners[face[1]].distanceTo(corners[face[2]]) / tileV;
      const quadUV = [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ];
      for (const j of [0, 1, 2, 0, 2, 3]) {
        vertices.push(...corners[face[j]].toArray());
        uv.push(...quadUV[j]);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    arch.add(kind, geometry, identity);
  }
  function glazing(
    kind: "glass" | "warm",
    a: ReturnType<typeof profiles>[number],
    b: ReturnType<typeof profiles>[number],
    upper: boolean,
  ) {
    const corners = [a, b].map(
      (f) =>
        new THREE.Vector3(
          f.center.x,
          upper ? f.upper.p.y + 1 : f.lower.p.y + 3,
          f.center.z + (upper ? f.halfWidth + 0.25 : -f.halfWidth + 11.75),
        ),
    );
    corners.push(
      corners[1].clone().add(new THREE.Vector3(0, upper ? 4 : 7, 0)),
      corners[0].clone().add(new THREE.Vector3(0, upper ? 4 : 7, 0)),
    );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        corners.flatMap((v) => v.toArray()),
        3,
      ),
    );
    geometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        [
          0,
          0,
          a.center.distanceTo(b.center) / 12,
          0,
          a.center.distanceTo(b.center) / 12,
          (upper ? 4 : 7) / 24,
          0,
          (upper ? 4 : 7) / 24,
        ],
        2,
      ),
    );
    geometry.setIndex(upper ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    arch.add(kind, geometry, identity);
  }
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i],
      b = p[i + 1];
    const court = i >= 2 && i <= 5;
    const terminalHall = i === 6;
    const body = (
      lowA: number,
      lowB: number,
      highA: number,
      highB: number,
      recessA: number,
      recessB: number,
      backA = 0,
      backB = 0,
    ) => [
      new THREE.Vector3(a.center.x, lowA, a.center.z - a.halfWidth + recessA),
      new THREE.Vector3(b.center.x, lowB, b.center.z - b.halfWidth + recessB),
      new THREE.Vector3(b.center.x, lowB, b.center.z + b.halfWidth - backB),
      new THREE.Vector3(a.center.x, lowA, a.center.z + a.halfWidth - backA),
      new THREE.Vector3(a.center.x, highA, a.center.z - a.halfWidth + recessA),
      new THREE.Vector3(b.center.x, highB, b.center.z - b.halfWidth + recessB),
      new THREE.Vector3(b.center.x, highB, b.center.z + b.halfWidth - backB),
      new THREE.Vector3(a.center.x, highA, a.center.z + a.halfWidth - backA),
    ];
    prism("podium", body(a.bottom, b.bottom, a.podium, b.podium, 0, 0));
    // The court opens into a real structural bay, not a panel painted on
    // its end wall. Both levels share the same room and roof profile.
    if (terminalHall) {
      prism(
        "steel",
        body(
          a.podium,
          b.podium,
          a.roof - 2,
          b.roof - 2,
          12,
          12,
          a.halfWidth * 2 - 16,
          b.halfWidth * 2 - 16,
        ),
      );
      prism(
        "ceramic",
        body(
          a.podium,
          b.podium,
          a.upper.p.y - 4.5,
          b.upper.p.y - 4.5,
          a.halfWidth * 2 - 4,
          b.halfWidth * 2 - 4,
        ),
      );
      prism(
        "ceramic",
        body(
          a.upper.p.y + 3,
          b.upper.p.y + 3,
          a.roof - 2,
          b.roof - 2,
          a.halfWidth * 2 - 4,
          b.halfWidth * 2 - 4,
        ),
      );
      prism(
        "steel",
        body(
          a.upper.p.y - 5.5,
          b.upper.p.y - 5.5,
          a.upper.p.y - 4.5,
          b.upper.p.y - 4.5,
          16,
          16,
          4,
          4,
        ),
      );
    } else {
      // The central court reaches the racing side; its recessed service
      // spine joins the occupied arrival and departure wings.
      prism(
        "ceramic",
        body(
          a.podium,
          b.podium,
          a.roof,
          b.roof,
          court ? a.halfWidth * 2 - 10 : 12,
          court ? b.halfWidth * 2 - 10 : 12,
        ),
      );
    }
    if (!court) {
      prism(
        "ceramic",
        body(a.roof - 2, b.roof - 2, a.roof + 1, b.roof + 1, 0, 0),
      );
      arch.box(
        "ceramic",
        new THREE.Vector3(
          a.center.x,
          (a.podium + a.roof) / 2,
          a.center.z - a.halfWidth + 2,
        ),
        [4, a.roof - a.podium, 4],
      );
    }
    program.push({
      start: a.u,
      end: b.u,
      depth: a.lower.p.distanceTo(b.lower.p),
      covered: !court,
    });
    // Arrival and departure roofs follow the descending deck. The central
    // court cuts through the ceiling and facade into the driving view.
    const canopy = (f: typeof a, y: number, side: number) =>
      f.lower.p
        .clone()
        .addScaledVector(f.lower.right, side * (f.lower.width + 16))
        .setY(f.lower.p.y + y);
    const mid = a.lower.p.clone().add(b.lower.p).multiplyScalar(0.5);
    const forward = b.lower.p.clone().sub(a.lower.p).setY(0).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    if (!court) {
      prism("soffit", [
        canopy(a, 40, -1),
        canopy(b, 40, -1),
        canopy(b, 40, 1),
        canopy(a, 40, 1),
        canopy(a, 44, -1),
        canopy(b, 44, -1),
        canopy(b, 44, 1),
        canopy(a, 44, 1),
      ]);
      arcadeParts.push({
        center: mid,
        right,
        forward,
        width: Math.max(a.lower.width, b.lower.width) * 2 + 32,
        depth: a.lower.p.distanceTo(b.lower.p),
        bottom: Math.min(a.lower.p.y, b.lower.p.y) + 40,
        top: Math.max(a.lower.p.y, b.lower.p.y) + 44,
        branch: -1,
        kind: "market-roof",
      });
    }
    prism(
      "steel",
      body(
        a.lower.p.y - 3.5,
        b.lower.p.y - 3.5,
        a.lower.p.y - 2,
        b.lower.p.y - 2,
        0,
        0,
      ),
    );
    if (!court && !terminalHall)
      glazing(i % 3 === 0 ? "warm" : "glass", a, b, false);
    if (!terminalHall) glazing("glass", a, b, true);
    if (terminalHall) {
      // Lit rooms are one full bay behind the entrance. The upper gallery
      // is seen through its open side aperture, not an opaque window decal.
      arch.box(
        "warm",
        new THREE.Vector3(b.center.x + 0.3, b.lower.p.y + 12, b.center.z + 6),
        [0.5, 14, b.halfWidth * 2 - 20],
      );
      arch.box(
        "warm",
        new THREE.Vector3(b.center.x + 0.3, b.upper.p.y - 0.5, b.center.z + 6),
        [0.5, 7, b.halfWidth * 2 - 20],
      );
    }
    if (!court && i % 2 === 0) {
      const column = a.lower.p
        .clone()
        .addScaledVector(a.lower.right, -a.lower.width - 13);
      const bottom = environment.heightAt(column.x, column.z) - 1;
      const top = a.lower.p.y + 40;
      arch.box(
        "steel",
        column.clone().setY((bottom + top) / 2),
        [4, top - bottom, 5],
        Math.atan2(forward.x, forward.z),
      );
      arcadeParts.push({
        center: column,
        right,
        forward,
        width: 4,
        depth: 5,
        bottom,
        top,
        branch: -1,
        kind: "market-column",
      });
    }
  }
  const root = arch.finish();
  const warm = root.getObjectByName("vesper-interchange-warm") as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshLambertMaterial
  >;
  warm.material.emissive.setHex(0x765439);
  root.userData.profiles = p;
  root.userData.arcadeParts = arcadeParts;
  root.userData.program = program;
  root.userData.reservations = vesperInterchangeReservations(
    track,
    environment.heightAt,
  );
  return { root, arcadeParts, program };
}
