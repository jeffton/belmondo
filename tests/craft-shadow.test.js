import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CraftShadow } from "../src/craft-shadow.ts";
import { makeTrack, TRACKS } from "../src/track.ts";
import { getRoadSurface } from "../src/road-surface.ts";

const bounds = [-3, 3, -4, 4];

for (let index = 0; index < TRACKS.length; index++) {
  test(`${TRACKS[index].name}: actual banked deck, fork tips and gaps receive only clipped shadows`, () => {
    const track = makeTrack(index);
    const road = getRoadSurface(track);
    const shadow = new CraftShadow(new THREE.Texture(), bounds);
    const split = track.config.split;
    const samples = [0.11, 0.37, 0.63, 0.89];
    if (split[0] > 0) {
      for (const tip of split) {
        samples.push(tip - 1 / track.length, tip + 1 / track.length);
      }
    }
    for (const u of samples) {
      if (track.gap(u)) continue;
      for (const branch of [-1, 1]) {
        const frame = track.frame(u * track.length, branch);
        const position = frame.p.clone().add(new THREE.Vector3(0, 5, 0));
        const contact = road.beneath(position, 0, Infinity);
        assert(contact, `${u}/${branch}: actual surface absent`);
        const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
        shadow.update(road, position, yaw, track.length);
        assert(
          shadow.mesh.visible,
          `${u}/${branch}: projector lost actual deck`,
        );
        assert(area(shadow) > 0, `${u}/${branch}: no projected footprint`);
        assert(
          area(shadow) <= 48.01,
          `${u}/${branch}: duplicate crossing layers`,
        );
        // Inspect projected triangle centroids against the physics surface:
        // the emitted world height must equal a real road contact, not a quad.
        const points = vertices(shadow);
        for (let i = 0; i < points.length; i += 3) {
          const p = points[i]
            .clone()
            .add(points[i + 1])
            .add(points[i + 2])
            .divideScalar(3);
          const support = road.beneath(
            p.clone().add(new THREE.Vector3(0, 0.01, 0)),
            0,
            0.02,
          );
          assert(
            support,
            `${u}/${branch}: emitted point over void at ${p.toArray()}`,
          );
          assert(
            Math.abs(p.y - support.point.y) < 0.001,
            `${u}/${branch}: floating projection`,
          );
        }
      }
    }
    if (track.config.jump !== null) {
      const u = track.config.jump + track.config.gapLength / 2;
      const frame = track.frame(u * track.length);
      const position = frame.p.clone().add(new THREE.Vector3(0, 5, 0));
      const contact = road.beneath(position, 0, Infinity);
      shadow.update(road, position, 0, track.length);
      assert.equal(shadow.mesh.visible, contact !== null);
    }
    shadow.dispose();
  });
}
function deck(x0, x1, z0, z1, height = () => 0, station = 0) {
  const a = new THREE.Vector3(x0, height(x0, z0), z0);
  const b = new THREE.Vector3(x1, height(x1, z0), z0);
  const c = new THREE.Vector3(x1, height(x1, z1), z1);
  const d = new THREE.Vector3(x0, height(x0, z1), z1);
  return [
    { a, b: c, c: b, sa: station, sb: station + z1 - z0, sc: station },
    {
      a,
      b: d,
      c,
      sa: station,
      sb: station + z1 - z0,
      sc: station + z1 - z0,
    },
  ];
}
function surface(triangles, contact) {
  return {
    calls: 0,
    beneath(position) {
      this.calls++;
      return typeof contact === "function" ? contact(position) : contact;
    },
    forEachTriangle(minX, maxX, minZ, maxZ, visit) {
      for (const t of triangles) {
        const points = [t.a, t.b, t.c];
        if (
          Math.max(...points.map((p) => p.x)) >= minX &&
          Math.min(...points.map((p) => p.x)) <= maxX &&
          Math.max(...points.map((p) => p.z)) >= minZ &&
          Math.min(...points.map((p) => p.z)) <= maxZ
        )
          visit(t);
      }
    },
  };
}
function vertices(shadow) {
  const geometry = shadow.mesh.geometry;
  return Array.from({ length: geometry.drawRange.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(
      geometry.getAttribute("position"),
      i,
    ),
  );
}
function area(shadow) {
  const points = vertices(shadow);
  let result = 0;
  for (let i = 0; i < points.length; i += 3) {
    const [a, b, c] = points.slice(i, i + 3);
    result +=
      Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
  }
  return result;
}
function create() {
  return new CraftShadow(new THREE.Texture(), bounds);
}

test("yawed projection clips exact banked triangles and preserves world-plane height", () => {
  const shadow = create();
  const plane = (x, z) => 0.2 * x + 0.1 * z;
  const road = surface(deck(-20, 20, -20, 20, plane), {
    point: new THREE.Vector3(0, 0, 0),
    s: 20,
  });
  const yaw = 0.73;
  shadow.update(road, new THREE.Vector3(0, 5, 0), yaw, 1000);
  assert(shadow.mesh.visible);
  assert.equal(road.calls, 1);
  assert(Math.abs(area(shadow) - 48) < 1e-5);
  const uv = shadow.mesh.geometry.getAttribute("uv");
  for (const [i, p] of vertices(shadow).entries()) {
    assert(Math.abs(p.y - plane(p.x, p.z)) < 1e-6);
    const x = Math.cos(yaw) * p.x - Math.sin(yaw) * p.z;
    const z = Math.sin(yaw) * p.x + Math.cos(yaw) * p.z;
    assert(Math.abs(uv.getX(i) - (x + 3) / 6) < 1e-6);
    assert(Math.abs(uv.getY(i) - (z + 4) / 8) < 1e-6);
  }
  assert.equal(shadow.mesh.material.depthWrite, false);
  assert.equal(shadow.mesh.material.polygonOffset, true);
});

test("road edge cuts silhouette corners instead of casting onto void", () => {
  const shadow = create();
  shadow.update(
    surface(deck(-1, 20, -20, 20), {
      point: new THREE.Vector3(),
      s: 20,
    }),
    new THREE.Vector3(0, 3, 0),
    0,
    1000,
  );
  assert(Math.abs(area(shadow) - 32) < 1e-6);
  assert(vertices(shadow).every((p) => p.x >= -1 && p.y === 0));
});

test("gap clips the connected launch deck and never bridges to a receiver", () => {
  const shadow = create();
  const road = surface(
    [...deck(-20, 20, -20, 1), ...deck(-20, 20, 2, 20, () => 0, 22)],
    { point: new THREE.Vector3(), s: 20 },
  );
  shadow.update(road, new THREE.Vector3(0, 3, 0), 0, 1000);
  assert(Math.abs(area(shadow) - 30) < 1e-6);
  assert(vertices(shadow).every((p) => p.z <= 1));
  road.beneath = () => null;
  shadow.update(road, new THREE.Vector3(0, 3, 1.5), 0, 1000);
  assert.equal(shadow.mesh.visible, false);
  assert.equal(shadow.mesh.geometry.drawRange.count, 0);
});

test("crossing selects the physical receiving deck, never an unrelated higher/lower layer", () => {
  const triangles = [
    ...deck(-20, 20, -20, 20, () => 0, 0),
    ...deck(-20, 20, -20, 20, () => 8, 400),
  ];
  for (const [height, station] of [
    [0, 20],
    [8, 420],
  ]) {
    const shadow = create();
    shadow.update(
      surface(triangles, {
        point: new THREE.Vector3(0, height, 0),
        s: station,
      }),
      new THREE.Vector3(0, height + 3, 0),
      0,
      1000,
    );
    assert(Math.abs(area(shadow) - 48) < 1e-6);
    assert(vertices(shadow).every((p) => p.y === height));
  }
});

test("connected station seam and bank change project without flattening or gaps", () => {
  const shadow = create();
  const triangles = [
    ...deck(-20, 20, -20, 0, () => 0, 980),
    ...deck(-20, 20, 0, 20, (x, z) => z * 0.2, 0),
  ];
  shadow.update(
    surface(triangles, { point: new THREE.Vector3(0, 0, -1), s: 999 }),
    new THREE.Vector3(0, 3, -1),
    0,
    1000,
  );
  assert(Math.abs(area(shadow) - 48) < 1e-5);
  assert(vertices(shadow).some((p) => p.z > 0 && p.y > 0));
});

test("fork tip connects whole transverse edge to both outgoing half-edges", () => {
  const shadow = create();
  const road = surface(
    [
      ...deck(-20, 20, -20, 0),
      ...deck(-20, 0, 0, 20, () => 0, 20),
      ...deck(0, 20, 0, 20, () => 0, 20),
    ],
    { point: new THREE.Vector3(0, 0, -1), s: 19 },
  );
  shadow.update(road, new THREE.Vector3(0, 3, -1), 0, 1000);
  assert(Math.abs(area(shadow) - 48) < 1e-5);
  assert(vertices(shadow).some((p) => p.z > 0 && p.x < 0));
  assert(vertices(shadow).some((p) => p.z > 0 && p.x > 0));
});

test("capacity growth releases previous GPU attribute buffers before replacing them", () => {
  const shadow = create();
  const road = surface(deck(-20, 20, -20, 20), {
    point: new THREE.Vector3(),
    s: 20,
  });
  shadow.update(road, new THREE.Vector3(0, 3, 0), 0, 1000);
  const oldPosition = shadow.mesh.geometry.getAttribute("position");
  const oldUv = shadow.mesh.geometry.getAttribute("uv");
  const released = [];
  shadow.mesh.geometry.addEventListener("dispose", () => {
    released.push([
      shadow.mesh.geometry.getAttribute("position"),
      shadow.mesh.geometry.getAttribute("uv"),
    ]);
  });
  const strips = [];
  for (let z = -20; z < 20; z++)
    strips.push(...deck(-20, 20, z, z + 1, () => 0, z + 20));
  shadow.update(
    surface(strips, { point: new THREE.Vector3(), s: 20 }),
    new THREE.Vector3(0, 3, 0),
    0,
    1000,
  );
  assert.equal(released.length, 1);
  assert.deepEqual(released[0], [oldPosition, oldUv]);
  assert.notEqual(shadow.mesh.geometry.getAttribute("position"), oldPosition);
  assert(Math.abs(area(shadow) - 48) < 1e-5);
});

test("asymmetric hull bounds keep the +Z nose at texture top at world coordinates", () => {
  const shadow = new CraftShadow(new THREE.Texture(), [-2, 3, -3, 6]);
  const origin = new THREE.Vector3(1345, 42, -2637);
  const triangles = deck(-20, 20, -20, 20);
  for (const t of triangles) {
    // Shared vertices must be translated once, just like actual deck geometry.
    t.a = t.a.clone().add(origin);
    t.b = t.b.clone().add(origin);
    t.c = t.c.clone().add(origin);
  }
  shadow.update(
    surface(triangles, { point: origin, s: 20 }),
    origin.clone().add(new THREE.Vector3(0, 3, 0)),
    Math.PI / 2,
    1000,
  );
  assert(Math.abs(area(shadow) - 45) < 1e-5);
  const uv = shadow.mesh.geometry.getAttribute("uv");
  for (const [i, p] of vertices(shadow).entries()) {
    // +Z nose rotates towards world +X at yaw PI/2.
    assert(Math.abs(uv.getY(i) - (p.x - origin.x + 3) / 9) < 1e-5);
    assert.equal(p.y, origin.y);
  }
});

test("projection clips any receiving incline above the hull instead of painting above it", () => {
  const shadow = create();
  shadow.update(
    surface(
      deck(-20, 20, -20, 20, (x, z) => z),
      {
        point: new THREE.Vector3(),
        s: 20,
      },
    ),
    new THREE.Vector3(0, 1, 0),
    0,
    1000,
  );
  assert(Math.abs(area(shadow) - 30) < 1e-6);
  assert(vertices(shadow).every((p) => p.y <= 1));
});

test("height fade stays continuous past old cutoff; geometry and materials are reused", () => {
  const shadow = create();
  const road = surface(deck(-20, 20, -20, 20), {
    point: new THREE.Vector3(),
    s: 20,
  });
  const opacity = [];
  let attribute;
  for (const height of [14.99, 15, 15.01, 30]) {
    shadow.update(road, new THREE.Vector3(0, height, 0), 0, 1000);
    opacity.push(shadow.mesh.material.opacity);
    assert(shadow.mesh.visible);
    if (attribute)
      assert.equal(shadow.mesh.geometry.getAttribute("position"), attribute);
    attribute = shadow.mesh.geometry.getAttribute("position");
  }
  assert(opacity.every((value) => value > 0));
  assert(opacity[0] > opacity[1] && opacity[1] > opacity[2]);
  assert(Math.abs(opacity[0] - opacity[2]) < 0.001);
  let textureDisposed = false;
  shadow.mesh.material.map.addEventListener("dispose", () => {
    textureDisposed = true;
  });
  shadow.dispose();
  assert.equal(textureDisposed, false);
});
