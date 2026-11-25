import * as THREE from "three";
import { ARCHITECTURE_TILE_WORLD_UNITS } from "./architecture-uv.ts";
import type { EnvironmentSurface } from "./environment.ts";
import type { Track } from "./track.ts";

type QuaySurface = "concrete" | "deck" | "lining" | "steel" | "signal";
type LocalPoint = [number, number, number];
type QuaySheet = (
  points: THREE.Vector3[],
  surface: QuaySurface,
  uv: [number, number][],
) => void;

export function buildCoastSkywayQuay(
  track: Track,
  heightAt: EnvironmentSurface["heightAt"],
  sheet: QuaySheet,
) {
  const frame = track.frame(track.length * 0.415, 1);
  const right = new THREE.Vector3(
    frame.tangent.z,
    0,
    -frame.tangent.x,
  ).normalize();
  const forward = new THREE.Vector3(-right.z, 0, right.x);
  const origin = frame.p.clone().addScaledVector(right, frame.width + 140);
  function point([x, y, z]: LocalPoint) {
    return origin
      .clone()
      .addScaledVector(right, x)
      .addScaledVector(forward, z)
      .setY(origin.y + y);
  }
  function quad(
    a: LocalPoint,
    b: LocalPoint,
    c: LocalPoint,
    d: LocalPoint,
    surface: QuaySurface,
  ) {
    const points = [a, b, c, d].map(point);
    const [tileU, tileV] =
      ARCHITECTURE_TILE_WORLD_UNITS[
        surface === "concrete" ? "concrete" : "paint"
      ];
    const u = points[0].distanceTo(points[1]) / tileU;
    const v = points[0].distanceTo(points[3]) / tileV;
    sheet(points, surface, [
      [0, 0],
      [u, 0],
      [u, v],
      [0, v],
    ]);
  }
  function prism(
    profile: [number, number][],
    near: number,
    far: number,
    surface: QuaySurface,
  ) {
    const corner = (index: number, z: number): LocalPoint => [
      ...profile[index % 4],
      z,
    ];
    for (let i = 0; i < 4; i++) {
      quad(
        corner(i, near),
        corner(i, far),
        corner(i + 1, far),
        corner(i + 1, near),
        surface,
      );
    }
    quad(
      corner(3, near),
      corner(0, near),
      corner(1, near),
      corner(2, near),
      surface,
    );
    quad(
      corner(0, far),
      corner(3, far),
      corner(2, far),
      corner(1, far),
      surface,
    );
  }
  function box(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    surface: QuaySurface,
  ) {
    prism(
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
      z0,
      z1,
      surface,
    );
  }

  // Narrow apron leads from the former gallery site to the cantilever pad.
  // The drowned caissons and the low service hall share the same working deck.
  for (const [x0, x1, z0, z1] of [
    [-40, -7, -36, 36],
    [11, 42, -36, 36],
  ]) {
    const foot =
      Math.min(
        ...[x0, x1].flatMap((x) =>
          [z0, z1].map((z) => {
            const p = point([x, 0, z]);
            return heightAt(p.x, p.z) - origin.y;
          }),
        ),
      ) - 2;
    prism(
      [
        [x0, foot],
        [x1, foot],
        [x1 - 4, 13],
        [x0 + 4, 13],
      ],
      z0,
      z1,
      "concrete",
    );
  }
  box(-52, 50, 13, 21, -44, 44, "lining");
  box(-55, 51, 21, 24, -47, 47, "concrete");
  box(-103, -55, 19, 23.5, -38, -12, "lining");
  box(-102, -48, 23.5, 26, -40, -37, "concrete");

  box(-38, 11, 24, 44, -37, -14, "lining");
  box(-34, 7, 27, 39, -37.4, -37, "deck");
  box(-40, 15, 43, 47, -41, -12, "concrete");
  for (const z of [-41, 38]) {
    box(-20, 27, 24, 30, z - 4, z + 4, "lining");
    prism(
      [
        [-19, 30],
        [-7, 30],
        [1, 109],
        [-8, 109],
      ],
      z - 3.7,
      z + 3.7,
      "steel",
    );
    prism(
      [
        [12, 30],
        [25, 30],
        [8, 109],
        [1, 109],
      ],
      z - 3.7,
      z + 3.7,
      "steel",
    );
    box(-19, -6, 33, 38, z - 4, z + 4, "signal");
  }
  box(-17, 14, 94, 106, -45, 42, "lining");
  box(-15, 13, 106, 113, -44, 42, "steel");
  box(-7, 8, 113, 130, -1, 31, "lining");

  // The cantilever is open between the working beam and the tapered ties.
  box(-116, 27, 129, 136, 8, 26, "steel");
  for (const z of [8, 23]) {
    prism(
      [
        [-113, 136],
        [3, 154],
        [26, 145],
        [26, 141],
      ],
      z,
      z + 3,
      "steel",
    );
    prism(
      [
        [-61, 135],
        [-57, 135],
        [-39, 147],
        [-43, 147],
      ],
      z,
      z + 3,
      "steel",
    );
    prism(
      [
        [-24, 135],
        [-20, 135],
        [-1, 153],
        [-5, 153],
      ],
      z,
      z + 3,
      "steel",
    );
  }
  box(-116.3, -106, 128.8, 136.3, 7.7, 26.3, "signal");
  box(21, 47, 118, 139, 2, 33, "lining");
  box(23, 47, 139, 142, 1, 34, "deck");
  box(-12, 6, 116, 126, -9, 10, "concrete");
  box(-10, 4, 118, 124, -9.5, -9, "deck");
  box(-109, -102, 124, 129, 12, 23, "lining");
  box(-107, -106, 91, 124, 17, 18, "lining");
  box(-110, -103, 89, 93, 15, 20, "signal");
}
