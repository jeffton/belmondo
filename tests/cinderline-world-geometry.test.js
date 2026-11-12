import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.js";
import { Race } from "../src/race.js";
import { buildEnvironment } from "../src/environment.js";
import { buildCity } from "../src/city.js";
import { buildFinishDistrict } from "../src/finish-district.js";
import { buildTrackAdvertising } from "../src/advertising.js";

// Independent triangle-level acceptance: no heightAt, raycast, foundation
// contacts, or production terrainFootprint extrema are used as the oracle.
function emittedTriangles(scene) {
  const triangles = [];
  scene.updateMatrixWorld(true);
  scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const p = mesh.geometry.attributes.position;
    const indices = mesh.geometry.index;
    for (
      let instance = 0;
      instance < (mesh.isInstancedMesh ? mesh.count : 1);
      instance++
    ) {
      const matrix = mesh.matrixWorld.clone();
      if (mesh.isInstancedMesh) {
        const local = new THREE.Matrix4();
        mesh.getMatrixAt(instance, local);
        matrix.multiply(local);
      }
      const points = Array.from({ length: p.count }, (_, i) =>
        new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(matrix),
      );
      for (let i = 0; i < (indices ? indices.count : p.count); i += 3) {
        const vertices = [0, 1, 2].map(
          (j) => points[indices ? indices.getX(i + j) : i + j],
        );
        triangles.push({
          vertices,
          box: new THREE.Box3().setFromPoints(vertices),
          mesh,
          instance,
          triangle: i / 3,
        });
      }
    }
  });
  return triangles;
}

// Broadphase only: every candidate still receives full triangle SAT/clipping.
function spatialIndex(items) {
  const cell = 64;
  const buckets = new Map();
  const keys = (box) => {
    const result = [];
    for (
      let x = Math.floor(box.min.x / cell);
      x <= Math.floor(box.max.x / cell);
      x++
    )
      for (
        let z = Math.floor(box.min.z / cell);
        z <= Math.floor(box.max.z / cell);
        z++
      )
        result.push(`${x}/${z}`);
    return result;
  };
  for (const item of items)
    for (const key of keys(item.box)) {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(item);
    }
  return (box) => new Set(keys(box).flatMap((key) => buckets.get(key) || []));
}

function flightHeadroom(track, terrain) {
  let headroom = 4.4;
  for (const speedClass of [0, 2]) {
    for (let craft = 0; craft < 3; craft++) {
      const race = new Race(track, craft, "trial", speedClass, terrain);
      race.countdown = 0;
      const r = race.player;
      r.id = 1;
      r.aiFire = Infinity;
      let fired = false;
      let samples = 0;
      for (
        let step = 0;
        step < 14400 && r.contactS / track.length <= 0.65;
        step++
      ) {
        if (!fired && r.contactS > 0.512 * track.length) {
          r.weapon = "TURBO";
          race.fire(r);
          fired = true;
        }
        race.update(1 / 120, {});
        assert(
          !r.recoveredThisStep,
          "flight envelope is measured without recovery",
        );
        const u = r.contactS / track.length;
        if (u >= track.config.jump && u <= 0.65) {
          const frame = track.frame(r.contactS);
          // Keep the requested world-height bound and also measure in the
          // corridor's local-up coordinate so a slope cannot shrink coverage.
          headroom = Math.max(
            headroom,
            r.position.y - frame.p.y + 4.4,
            r.position.clone().sub(frame.p).dot(frame.up) + 4.4,
          );
          samples++;
        }
      }
      assert(
        fired && samples > 0 && r.contactS / track.length > 0.65,
        `class ${speedClass + 1}/craft ${craft} completes measured flight sector`,
      );
    }
  }
  return headroom;
}

function corridorTiles(track, flightTop) {
  const tiles = [];
  // Four-metre tiles overlap longitudinally by one hull length. Each tile uses
  // its actual banked frame and full local deck width, including delayed fork.
  const boundaries = [
    0,
    ...track.config.split.map((u) => u * track.length),
    track.length,
  ];
  for (let sector = 0; sector < 3; sector++) {
    const count = Math.ceil((boundaries[sector + 1] - boundaries[sector]) / 4);
    for (const branch of sector === 1 ? [-1, 1] : [0]) {
      for (let i = 0; i < count; i++) {
        const start =
          boundaries[sector] +
          ((boundaries[sector + 1] - boundaries[sector]) * i) / count;
        const end =
          boundaries[sector] +
          ((boundaries[sector + 1] - boundaries[sector]) * (i + 1)) / count;
        const f = track.frame((start + end) / 2, branch);
        const bounds = track.bounds((start + end) / 2, branch);
        const along = f.tangent.clone().negate();
        const basis = new THREE.Matrix4()
          .makeBasis(f.right, f.up, along)
          .setPosition(f.p);
        let top = 4.4;
        if (f.u >= track.config.jump && f.u <= 0.65) {
          // Measured stock-AI C1/C3 finite-TURBO ballistic envelope plus visual
          // craft headroom, conservatively extended across the landing sector.
          top = flightTop;
        }
        const local = new THREE.Box3(
          new THREE.Vector3(
            bounds.clipMin,
            0.75,
            (-(end - start) * f.metric) / 2 - 4.25,
          ),
          new THREE.Vector3(
            bounds.clipMax,
            top,
            ((end - start) * f.metric) / 2 + 4.25,
          ),
        );
        tiles.push({
          box: local.clone().applyMatrix4(basis),
          inverse: basis.clone().invert(),
          local,
          u: f.u,
          branch,
          flight: top > 4.4,
        });
      }
    }
  }
  return tiles;
}

function clipRectangle(vertices, footprint) {
  let polygon = vertices.map((p) => {
    const d = p.clone().sub(footprint.center);
    return new THREE.Vector3(
      d.dot(footprint.right),
      p.y,
      d.dot(footprint.forward),
    );
  });
  for (const [axis, sign, limit] of [
    ["x", 1, footprint.width / 2],
    ["x", -1, footprint.width / 2],
    ["z", 1, footprint.depth / 2],
    ["z", -1, footprint.depth / 2],
  ]) {
    const output = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const da = limit - sign * a[axis],
        db = limit - sign * b[axis];
      if (da >= 0) output.push(a);
      if (da >= 0 !== db >= 0) output.push(a.clone().lerp(b, da / (da - db)));
    }
    polygon = output;
  }
  return polygon;
}

function footprintBox(f) {
  return new THREE.Box3().setFromPoints(
    [-1, 1].flatMap((x) =>
      [-1, 1].map((z) =>
        f.center
          .clone()
          .addScaledVector(f.right, (x * f.width) / 2)
          .addScaledVector(f.forward, (z * f.depth) / 2),
      ),
    ),
  );
}

function foundationInstances(scene) {
  const boxes = [];
  scene.traverse((mesh) => {
    if (!mesh.isMesh || mesh.geometry.type !== "BoxGeometry") return;
    for (
      let instance = 0;
      instance < (mesh.isInstancedMesh ? mesh.count : 1);
      instance++
    ) {
      const matrix = mesh.matrixWorld.clone();
      if (mesh.isInstancedMesh) {
        const local = new THREE.Matrix4();
        mesh.getMatrixAt(instance, local);
        matrix.multiply(local);
      }
      const p = mesh.geometry.attributes.position;
      boxes.push(
        Array.from({ length: p.count }, (_, i) =>
          new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(matrix),
        ),
      );
    }
  });
  return boxes;
}

function dispose(scene) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  scene.traverse((mesh) => {
    if (mesh.geometry) geometries.add(mesh.geometry);
    for (const material of mesh.material ? [].concat(mesh.material) : []) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}

test("CINDERLINE emitted world triangles clear the banked hull and elevated flight corridors", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const track = makeTrack(
    TRACKS.findIndex((config) => config.name === "CINDERLINE"),
  );
  const scene = new THREE.Scene();
  try {
    const textures = {
      concrete: null,
      paint: null,
      facade: null,
      road: null,
      edge: null,
    };
    const environment = buildEnvironment(scene, track, textures);
    buildCity(scene, track, textures, environment);
    const finish = buildFinishDistrict(scene, track, textures, environment);
    buildTrackAdvertising(scene, track, environment);
    const triangles = emittedTriangles(scene);
    const query = spatialIndex(triangles);
    const flightTop = flightHeadroom(track, environment.terrain);
    const tiles = corridorTiles(track, flightTop);
    t.diagnostic(
      `measured six-flight conservative headroom ${flightTop.toFixed(3)}m`,
    );
    assert(
      tiles.some((tile) => tile.flight),
      "flight envelope extends above phantom deck",
    );
    const failures = [];
    let comparisons = 0;
    const triangle = new THREE.Triangle();
    for (const tile of tiles) {
      for (const actual of query(tile.box)) {
        if (!actual.box.intersectsBox(tile.box)) continue;
        comparisons++;
        triangle.set(
          ...actual.vertices.map((v) => v.clone().applyMatrix4(tile.inverse)),
        );
        if (tile.local.intersectsTriangle(triangle)) {
          failures.push(
            `${actual.mesh.name || actual.mesh.parent?.name || actual.mesh.type} instance=${actual.instance} triangle=${actual.triangle} u=${tile.u.toFixed(6)} branch=${tile.branch}${tile.flight ? " flight" : ""}`,
          );
        }
      }
    }
    t.diagnostic(
      `${triangles.length} emitted triangles; ${tiles.length} full-width tiles; ${comparisons} triangle/OBB SAT checks`,
    );
    const corridorFailure = `${failures.length} triangle/corridor intersections:\n${failures.slice(0, 30).join("\n")}`;
    if (failures.length) t.diagnostic(corridorFailure);

    const ground = scene.getObjectByName("terrain-surface");
    const terrain = triangles.filter(
      (triangle) => triangle.mesh.parent === ground,
    );
    assert(terrain.length > 0, "actual rendered terrain triangles included");
    const terrainQuery = spatialIndex(terrain);
    const root = scene.getObjectByName("volcanic-districts");
    assert(root, "Cinderline district root exists");
    const footprints = [
      ...root.userData.footprints.filter((f) => f.foundation),
      ...finish.foundations.map((f) => ({
        ...f,
        name: f.kind,
        depth: f.length,
      })),
    ];
    assert(footprints.length > 0);
    const emittedBoxes = foundationInstances(scene);
    let clippedTriangles = 0;
    for (const f of footprints) {
      const bounds = footprintBox(f);
      let intersections = 0;
      for (const actual of terrainQuery(bounds)) {
        const polygon = clipRectangle(actual.vertices, f);
        if (!polygon.length) continue;
        intersections++;
        clippedTriangles++;
        for (const vertex of polygon) {
          assert(
            vertex.y > f.bottom - 0.001 && vertex.y < f.deck + 0.001,
            `${f.name}: terrain triangle ${actual.triangle} height ${vertex.y} outside foundation [${f.bottom}, ${f.deck}]`,
          );
        }
      }
      assert(intersections > 0, `${f.name} overlaps actual terrain triangles`);
      // Metadata must correspond to a complete emitted box, including rotated
      // instance/world transforms, rather than an imaginary reserved rectangle.
      assert(
        emittedBoxes.some((vertices) => {
          const local = vertices.map((p) => {
            const d = p.clone().sub(f.center);
            return new THREE.Vector3(d.dot(f.right), p.y, d.dot(f.forward));
          });
          const box = new THREE.Box3().setFromPoints(local);
          return (
            Math.abs(box.min.x + f.width / 2) < 0.002 &&
            Math.abs(box.max.x - f.width / 2) < 0.002 &&
            Math.abs(box.min.z + f.depth / 2) < 0.002 &&
            Math.abs(box.max.z - f.depth / 2) < 0.002 &&
            Math.abs(box.min.y - f.bottom) < 0.002 &&
            Math.abs(box.max.y - f.deck) < 0.002
          );
        }),
        `${f.name}: full footprint matches emitted foundation box`,
      );
    }
    t.diagnostic(
      `${footprints.length} emitted foundations; ${clippedTriangles} full clipped terrain triangles`,
    );
    assert.equal(failures.length, 0, corridorFailure);
  } finally {
    dispose(scene);
  }
});
