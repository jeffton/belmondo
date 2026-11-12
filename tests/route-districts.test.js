import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.js";
import { createTerrain } from "../src/terrain.js";
import {
  buildRouteDistricts,
  ROUTE_DISTRICTS,
} from "../src/route-districts.js";

function fixture(index) {
  const track = makeTrack(index);
  const terrain = createTerrain(track);
  const concrete = new THREE.Texture();
  const textureEvents = { disposals: 0 };
  concrete.addEventListener("dispose", () => textureEvents.disposals++);
  const parent = new THREE.Group();
  const build = () => {
    const root = buildRouteDistricts(
      parent,
      track,
      { concrete },
      { terrain, heightAt: terrain.heightAt },
    );
    root.updateMatrixWorld(true);
    return root;
  };
  return { track, terrain, concrete, build, textureEvents };
}

function resources(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
  });
  return { geometries, materials };
}

function dispose(root) {
  const { geometries, materials } = resources(root);
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  root.removeFromParent();
}

function triangles(root) {
  const result = [];
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const positions = mesh.geometry.attributes.position;
    const indices = mesh.geometry.index;
    const count = indices ? indices.count : positions.count;
    for (let i = 0; i < count; i += 3) {
      result.push(
        Array.from({ length: 3 }, (_, j) =>
          new THREE.Vector3()
            .fromBufferAttribute(
              positions,
              indices ? indices.getX(i + j) : i + j,
            )
            .applyMatrix4(mesh.matrixWorld),
        ),
      );
    }
  });
  return result;
}

function segmentDistanceSquared(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = dx * dx + dz * dz;
  const t = length
    ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length))
    : 0;
  return (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2;
}

// Project complete triangles, including their interiors, rather than checking
// vertices alone: a large wall can cross the road with all corners outside it.
function projectedDistanceSquared(x, z, triangle) {
  const [a, b, c] = triangle;
  const cross = (p, q) => (q.x - p.x) * (z - p.z) - (q.z - p.z) * (x - p.x);
  const area = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  if (Math.abs(area) > 1e-8) {
    const signs = [cross(a, b), cross(b, c), cross(c, a)];
    if (signs.every((v) => v >= 0) || signs.every((v) => v <= 0)) return 0;
  }
  return Math.min(
    segmentDistanceSquared(x, z, a, b),
    segmentDistanceSquared(x, z, b, c),
    segmentDistanceSquared(x, z, c, a),
  );
}

// This builder owns the three legacy district recipes. New biome architecture
// is exercised through the real buildCity dispatch in new-course-environments.
for (const [index] of ROUTE_DISTRICTS.entries()) {
  const config = TRACKS[index];
  test(`${config.name}: emitted districts occupy real places and clear every route's full XZ corridor`, () => {
    const { track, terrain, concrete, build } = fixture(index);
    const root = build();
    try {
      const faces = triangles(root);
      assert(faces.length > 0);
      for (const district of ROUTE_DISTRICTS[index]) {
        const footprints = root.userData.footprints.filter(
          (f) => f.district === district.name,
        );
        assert(footprints.length > 0, `${district.name} was silently omitted`);
        const points = faces.flat().filter((p) =>
          footprints.some((f) => {
            const dx = p.x - f.center[0];
            const dz = p.z - f.center[2];
            return (
              p.y > f.floor + 3 &&
              Math.abs(dx * f.right[0] + dz * f.right[2]) <=
                f.width / 2 + 0.01 &&
              Math.abs(dx * f.forward[0] + dz * f.forward[2]) <=
                f.depth / 2 + 0.01
            );
          }),
        );
        assert(
          points.length > 0,
          `${district.name} has no architecture above its foundations`,
        );
        const bounds = new THREE.Box3().setFromPoints(points);
        const size = bounds.getSize(new THREE.Vector3());
        assert(
          size.y > 5 && size.x > 10 && size.z > 10,
          `${district.name} needs a substantial visible silhouette`,
        );
      }

      // Independently sample all branches more densely than construction does.
      // Include gap stations and both crossing heights; no height-based exemption
      // can conceal a column through the lower route or a jump's flight lane.
      const road = [];
      const steps = Math.ceil(track.length / 3);
      for (let i = 0; i < steps; i++) {
        const u = i / steps;
        for (const branch of u > config.split[0] && u < config.split[1]
          ? [-1, 1]
          : [0]) {
          road.push(track.frame(u * track.length, branch));
        }
      }
      for (const face of faces) {
        const minX = Math.min(...face.map((p) => p.x));
        const maxX = Math.max(...face.map((p) => p.x));
        const minZ = Math.min(...face.map((p) => p.z));
        const maxZ = Math.max(...face.map((p) => p.z));
        for (const f of road) {
          if (
            f.p.x < minX - f.width ||
            f.p.x > maxX + f.width ||
            f.p.z < minZ - f.width ||
            f.p.z > maxZ + f.width
          )
            continue;
          assert(
            projectedDistanceSquared(f.p.x, f.p.z, face) > f.width ** 2,
            `opaque geometry enters route/flight corridor at ${f.u}, branch ${f.branch}`,
          );
        }
      }
    } finally {
      dispose(root);
      terrain.geometries.forEach((g) => g.dispose());
      concrete.dispose();
    }
  });

  test(`${config.name}: actual foundation caps enclose final terrain across every footprint`, () => {
    const { terrain, concrete, build } = fixture(index);
    const root = build();
    const ray = new THREE.Raycaster();
    try {
      for (const footprint of root.userData.footprints) {
        // Metadata identifies the bay, but assertions raycast the real triangles.
        const width = footprint.width - 10;
        const depth = footprint.depth - 6;
        for (const x of [-0.49, 0, 0.49])
          for (const z of [-0.49, 0, 0.49]) {
            const px =
              footprint.center[0] +
              footprint.right[0] * x * width +
              footprint.forward[0] * z * depth;
            const pz =
              footprint.center[2] +
              footprint.right[2] * x * width +
              footprint.forward[2] * z * depth;
            const ground = terrain.heightAt(px, pz);
            ray.set(
              new THREE.Vector3(px, footprint.floor + 0.05, pz),
              new THREE.Vector3(0, -1, 0),
            );
            ray.far = 0.1;
            const top = ray.intersectObject(root, true)[0];
            assert(
              top && top.point.y >= ground,
              `${footprint.district}: missing foundation top above land`,
            );
            ray.set(
              new THREE.Vector3(px, footprint.groundMin - 2, pz),
              new THREE.Vector3(0, 1, 0),
            );
            ray.far = 2;
            const bottom = ray.intersectObject(root, true)[0];
            assert(
              bottom && bottom.point.y < ground,
              `${footprint.district}: actual foundation floats above land`,
            );
          }
      }
    } finally {
      dispose(root);
      terrain.geometries.forEach((g) => g.dispose());
      concrete.dispose();
    }
  });

  test(`${config.name}: opaque spatial batches are finite, culled, and independently owned across rebuilds`, () => {
    const { terrain, concrete, build, textureEvents } = fixture(index);
    const first = build();
    const second = build();
    try {
      const a = resources(first);
      const b = resources(second);
      assert(
        first.children.length < first.userData.parts,
        "parts must be merged into batches, not individual meshes",
      );
      for (const mesh of first.children) {
        assert(mesh.isMesh && mesh.frustumCulled);
        const sphere = mesh.geometry.boundingSphere;
        assert(sphere && Number.isFinite(sphere.radius) && sphere.radius > 0);
        for (const attribute of Object.values(mesh.geometry.attributes)) {
          assert(
            Array.from(attribute.array).every(Number.isFinite),
            `${mesh.name} contains non-finite vertex data`,
          );
        }
        const positions = mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const p = new THREE.Vector3().fromBufferAttribute(positions, i);
          assert(
            p.distanceTo(sphere.center) <= sphere.radius + 0.001,
            "culling sphere must contain emitted vertices",
          );
        }
      }
      for (const material of a.materials) {
        assert.equal(material.transparent, false);
        assert.equal(material.opacity, 1);
        assert.equal(material.depthWrite, true);
        assert(
          !b.materials.has(material),
          "rebuild must not share disposable materials",
        );
      }
      for (const geometry of a.geometries) assert(!b.geometries.has(geometry));
      assert.equal(
        textureEvents.disposals,
        0,
        "building cannot dispose caller-owned textures",
      );
      dispose(first);
      assert.equal(
        textureEvents.disposals,
        0,
        "district cleanup cannot dispose the caller-owned texture",
      );
      assert(
        second.parent &&
          second.children.every(
            (m) => m.geometry.attributes.position.count > 0,
          ),
      );
      assert([...b.materials].some((m) => m.map === concrete));
    } finally {
      dispose(first);
      dispose(second);
      terrain.geometries.forEach((g) => g.dispose());
      concrete.dispose();
    }
  });
}
