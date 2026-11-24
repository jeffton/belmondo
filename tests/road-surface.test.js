import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import * as THREE from "three";
import { ConvexHull } from "three/addons/math/ConvexHull.js";
import { makeTrack, roadBounds, TRACKS } from "../src/track.ts";
import { projectRoad, roadHeight } from "../src/road-projection.ts";
import { buildHull } from "../src/craft.ts";
import { getRoadSurface, roadStations } from "../src/road-surface.ts";

// Renderer/index Float32 hashes include shared authored fork cross-sections.
// Fourth hashes freeze triangles outside the four station intervals touching
// fork endpoints. WHITEOUT includes its authored valley; a separate baseline
// hash below also freezes every triangle outside that local working envelope.
const RENDER_FIXTURES = [
  [
    "WHITEOUT",
    "whiteout-2-finish-end",
    "4c14f4134a87e38c87ba9f309507691d2fdea307fcec4ae1524896ba88592f76",
    "bd8acdd2392de563276a449e71d429fed1d0446ce4e1352cd1f8be7a8109b80c",
    "17623d2dedd6ea041be5b2e1d8d9496902a3ea6b9022a3c2b6aab006c67d4064",
  ],
  [
    "MONSOON",
    "monsoon-4-finish-end",
    "35c8fea77a3365eb6cfbec26ee550c001e32ee2cbaaabac32dc2d300330a7ebf",
    "af76753e285301d20f615cc43c0f5cd0e297e7a5f14dae8bf43206526c0675d5",
    "9e848441fa9c431223ed3ff310309585d20cbce59f48600d2c56a87050befd3e",
  ],
  [
    "PALM BREAKER",
    "coast-4-finish-end",
    "a440be769eba818475972eaef0bc4bdf5807ab760dbb20bf7adac371eec71786",
    "ebcab8493cecae39a1d9a037ca48061f291c89567e0a9a02c21b94225db84ac5",
    "50542e618d17477deef6227a829cbc3bda0147e6a8e03e2e286b6d538028847a",
  ],
  [
    "SOLAR ARRAY",
    "solar-4-finish-end",
    "61b371ac2769471dea5fed6dbde60ad89ebf0ea4333ec3177c06f6cb6f90bb38",
    "a4a7bdd831f7f8c9e2292e74bc687ac3b8a1a7c6d7d26078bd356adb81e70263",
    "77e8a94d7de70c39c9a99e3a83bb64331c9ab73987abb6bec47cbaa15d0206b0",
  ],
  [
    "FAULTLINE",
    "faultline-1-finish-end",
    "d72073fd1d427dd8c1c09cbfd2bba203dea3adcee8e7fbae587e45d079911aeb",
    "a5bdfa6c0af7ad0d183f2322c1c7475eaef4d95cfc32607bdc09840c220139b6",
    "4cd31d8f874d2ebd852ca4874857db79600a54cbcf2dc1985d5fccbb09fc5f9a",
  ],
  [
    "CINDERLINE",
    "cinderline-2-finish-end",
    "f4966bb97d1344ec81a056cf98b34f0a5c3a838e3cdc9ce3b0b95c8b933a4c5e",
    "8d84b092b22c6541672c69f5c20e3d409c8f9a86cf4ce0b6e47bc3c0f9b7f00f",
    "514f5ce0ecd25ae9448a1366164dec7e626abd557ba02dc9d4df8fb45ffc2407",
  ],
  [
    "NOCTILUCENT",
    "noctilucent-4-finish-end",
    "6015b891b13dc3b2a7c235c08d67bee43f847c5ac5be19bde2463c7747b16411",
    "1d20d1ae029b1c8debf0a5699d1001ec99ae79e252e7033feac891099b655519",
    "1b52240e85efb689b022f77e670ea15a95af2f9c7e7990ff62be349cb0d81dc3",
  ],
  [
    "VESPER CIRCUIT",
    "vesper-1-finish-end",
    "d1b2bc67d2a2e51024c91b5456c87f0335f24ef74e0f194835897e8abe22488c",
    "0d82c47d97293b55db4ff1f7fbb987791e94eb0c6ee3e237c121afa7ff5be360",
    "d9fd8904964f956dbee0b85537cbf7ea890313dacdf32d3b2e3586af2a9f8637",
  ],
];
// These indices belong to the frozen fixtures above, not the course menu.
const tracks = RENDER_FIXTURES.map(([name, layoutId]) => {
  const menuIndex = TRACKS.findIndex((config) => config.layoutId === layoutId);
  assert.notEqual(menuIndex, -1, `${name}: missing layout ${layoutId}`);
  return makeTrack(menuIndex);
});
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function triangles(surface) {
  const result = [];
  const visit = (node) => {
    if (node.triangle) result.push(node.triangle);
    else {
      visit(node.left);
      visit(node.right);
    }
  };
  visit(surface.root);
  return result;
}
function recordedFace(surface, name) {
  const fixtures = {
    boreLower: [
      [-1820.9755859375, 145.51980590820312, 1024.646728515625],
      [-1866.2491455078125, 147.9700469970703, 1034.055419921875],
    ],
    boreNeighbor: [
      [-1820.9755859375, 145.51980590820312, 1024.646728515625],
      [-1822.6256103515625, 145.2596435546875, 1019.71533203125],
    ],
    nightRunout: [
      [524.568359375, 65.42884063720703, 867.1063232421875],
      [527.2463989257812, 65.15061950683594, 861.029296875],
    ],
  };
  const [a, b] = fixtures[name];
  const face = triangles(surface).find(
    (t) =>
      t.a.toArray().every((x, i) => x === a[i]) &&
      t.b.toArray().every((x, i) => x === b[i]),
  );
  assert.ok(
    face,
    `${name}: the captured interior face geometry must remain exact`,
  );
  return face;
}
for (const [
  i,
  [name, , stationsHash, verticesHash, interiorHash],
] of RENDER_FIXTURES.entries()) {
  test(`${name}: renderer/index hashes match and unrelated road vertices stay exact`, () => {
    const track = tracks[i],
      surface = getRoadSurface(track),
      faces = triangles(surface);
    assert.equal(track.config.name, name);
    assert.equal(digest(roadStations(track)), stationsHash);
    assert.equal(
      digest(
        faces
          .map((t) =>
            [...t.a.toArray(), ...t.b.toArray(), ...t.c.toArray()].join(","),
          )
          .sort(),
      ),
      verticesHash,
    );
    const boundaries = track.config.split.map((u) => u * track.length);
    const interior = faces.filter(
      (t) => ![t.sa, t.sb, t.sc].some((s) => boundaries.includes(s)),
    );
    assert.equal(
      digest(
        interior
          .map((t) =>
            [...t.a.toArray(), ...t.b.toArray(), ...t.c.toArray()].join(","),
          )
          .sort(),
      ),
      interiorHash,
    );
    assert.equal(
      surface.lowestRoadY,
      faces.reduce(
        (minimum, t) => Math.min(minimum, t.a.y, t.b.y, t.c.y),
        Infinity,
      ),
    );
    assert.equal(getRoadSurface(track), surface);
  });
}

for (const [index, windows, count, hash] of [
  [
    0,
    [
      [0.3, 0.5],
      [0.54, 0.66],
    ],
    2444,
    "e446ad96e9ffc73e777cfc328aa4745d2774ee08c8795a7d6f8d020fd60a1465",
  ],
  [
    1,
    [[0.565, 0.725]],
    3098,
    "89860b15d7070e873c7ee09be4ec0f5d347cde3438d637aa6a2bade48cd4d450",
  ],
]) {
  test(`${tracks[index].config.name}: road outside authored windows matches the independent baseline`, () => {
    const track = tracks[index],
      step = track.length / Math.ceil(track.length / 3);
    // Six tangent neighbours, the actual 45m bank kernel and one interpolation sample.
    const reach = index === 1 ? (Math.ceil(45 / step) + 6 + 1) * step : 0;
    const outside = triangles(getRoadSurface(track)).filter((face) =>
      windows.every(
        ([a, b]) =>
          Math.max(face.sa, face.sb, face.sc) < a * track.length - reach ||
          Math.min(face.sa, face.sb, face.sc) > b * track.length + reach,
      ),
    );
    assert.equal(outside.length, count);
    assert.equal(
      digest(
        outside
          .map((t) =>
            [...t.a.toArray(), ...t.b.toArray(), ...t.c.toArray()].join(","),
          )
          .sort(),
      ),
      hash,
    );
  });
}

const pointHull = { faces: [], radius: 1.1 };
const pointVertices = () => [new THREE.Vector3(0, -1.1, 0)];
function pointSweep(surface, from, to) {
  return surface.sweep(from, to, pointHull, pointVertices);
}
function flatTrack({ gap = false, narrow = false } = {}) {
  const track = {
    config: {
      name: narrow ? "NOCTILUCENT" : "TEST",
      split: [2, 3],
      jump: gap ? 0.4 : null,
      gapLength: 0.2,
    },
    length: 100,
    frame(s) {
      return {
        p: new THREE.Vector3(0, 0, s),
        tangent: new THREE.Vector3(0, 0, 1),
        right: new THREE.Vector3(1, 0, 0),
        up: new THREE.Vector3(0, 1, 0),
        width: 10,
        u: s / 100,
        bank: 0,
        metric: 1,
      };
    },
    gap(u) {
      return gap && u >= 0.4 && u < 0.6;
    },
    bounds(s, branch) {
      return roadBounds(track, s, branch);
    },
  };
  return track;
}
function convexShape(points) {
  const convex = new ConvexHull().setFromPoints(points);
  const extremes = new Set();
  for (const face of convex.faces) {
    let edge = face.edge;
    do {
      extremes.add(edge.head().point);
      edge = edge.next;
    } while (edge !== face.edge);
  }
  const vertices = [...extremes],
    indices = new Map(vertices.map((p, i) => [p, i]));
  const faces = convex.faces.map((face) => {
    const indicesInFace = [];
    let edge = face.edge;
    do {
      indicesInFace.push(indices.get(edge.head().point));
      edge = edge.next;
    } while (edge !== face.edge);
    return indicesInFace;
  });
  return {
    points: vertices,
    faces,
    radius: vertices.reduce((maximum, p) => Math.max(maximum, p.length()), 0),
  };
}
function visibleHull(craft, yaw, pitch) {
  const rotation = new THREE.Euler(pitch, yaw, 0, "YXZ"),
    points = [];
  for (const geometry of Object.values(buildHull(craft))) {
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++)
      points.push(
        new THREE.Vector3()
          .fromBufferAttribute(positions, i)
          .applyEuler(rotation),
      );
    geometry.dispose();
  }
  return convexShape(points);
}
function boxShape(x, y, z) {
  const points = [];
  for (const a of [-x, x])
    for (const b of [-y, y])
      for (const c of [-z, z]) points.push(new THREE.Vector3(a, b, c));
  return convexShape(points);
}

test("FAULTLINE: an actual BORE top crossing ignores old BENCH progress identity", () => {
  const track = tracks[4],
    surface = getRoadSurface(track);
  const lower = track.frame(0.333 * track.length, -1);
  const from = lower.p.clone().add(new THREE.Vector3(0, 12.2, 0));
  const to = lower.p.clone().add(new THREE.Vector3(0, -4, 0));
  assert.equal(roadBounds(track, 0.33125 * track.length, 1).connected, false);
  const wrong = projectRoad(track, from, 0.33125 * track.length, 1);
  assert.equal(wrong.branch, 1);
  assert.ok(from.y - roadHeight(wrong, from) - 2.2 < -18);
  const hit = pointSweep(surface, from, to);
  assert.ok(hit);
  assert.equal(hit.branch, -1);
  assert.ok(Math.abs(hit.s / track.length - 0.333) < 0.00001);
  assert.ok(hit.fraction > 0 && hit.fraction < 1);
  assert.equal(projectRoad(track, hit.point, hit.s, hit.branch).branch, -1);
});
test("stacked decks: the first crossed upper top wins", () => {
  const track = tracks[4],
    lower = track.frame(0.333 * track.length, -1);
  const hit = pointSweep(
    getRoadSurface(track),
    lower.p.clone().setY(350),
    lower.p.clone().setY(180),
  );
  assert.ok(hit);
  assert.equal(hit.branch, 1);
  assert.ok(hit.point.y > 280);
});
test("suspension capture is explicit and does not glue distant or overhead road", () => {
  const surface = getRoadSurface(flatTrack());
  assert.equal(surface.beneath(new THREE.Vector3(0, 20, 22), 3), null);
  assert.equal(surface.beneath(new THREE.Vector3(0, -1, 22), 3), null);
  assert.equal(surface.beneath(new THREE.Vector3(12, 2.2, 22), 3), null);
  assert.equal(surface.beneath(new THREE.Vector3(0, 2.2, 22), 3).point.y, 0);
  assert.equal(
    pointSweep(
      surface,
      new THREE.Vector3(0, 20, 22),
      new THREE.Vector3(0, 10, 22),
    ),
    null,
  );
});
test("upward/underside crossings and lateral misses do not acquire road", () => {
  const surface = getRoadSurface(flatTrack());
  assert.equal(
    pointSweep(
      surface,
      new THREE.Vector3(0, -5, 22),
      new THREE.Vector3(0, 5, 22),
    ),
    null,
  );
  assert.equal(
    pointSweep(
      surface,
      new THREE.Vector3(11, 5, 22),
      new THREE.Vector3(11, -5, 22),
    ),
    null,
  );
  assert.equal(
    pointSweep(
      surface,
      new THREE.Vector3(0, 0.5, 22),
      new THREE.Vector3(0, -5, 22),
    ),
    null,
  );
  const box = boxShape(1, 1, 1);
  assert.equal(
    surface.sweep(
      new THREE.Vector3(0, -3, 22),
      new THREE.Vector3(0, 3, 22),
      box,
      () => box.points,
    ),
    null,
  );
});
test("already-straddling upper features exiting below the road never count as landing", () => {
  const surface = getRoadSurface(flatTrack()),
    hull = boxShape(1, 1, 1);
  assert.equal(
    surface.sweep(
      new THREE.Vector3(0, -0.5, 22),
      new THREE.Vector3(0, -3, 22),
      hull,
      () => hull.points,
    ),
    null,
  );
  assert.equal(
    surface.sweep(
      new THREE.Vector3(-12, 0.5, 22),
      new THREE.Vector3(0, 0.4, 22),
      hull,
      () => hull.points,
    ),
    null,
  );
});

test("FAULTLINE RAPTOR underside capture: turning a lower feature down cannot acquire an already penetrated face", () => {
  const surface = getRoadSurface(tracks[4]),
    hull = visibleHull(1, 0, 0);
  // Exact frame41 of the real underside ballistic approach, not a synthetic
  // high-speed rotation. COM never rose enough for the whole hull to clear.
  const from = new THREE.Vector3(
    -1843.0832903133903,
    147.00877547192795,
    1030.937627495639,
  );
  const to = new THREE.Vector3(
    -1843.0832903133903,
    146.97582524890356,
    1030.937627495639,
  );
  const yaw = -2.8169496783782106;
  const before = hull.points.map((p) =>
    p.clone().applyEuler(new THREE.Euler(-0.840870263086306, yaw, 0, "YXZ")),
  );
  const after = hull.points.map((p) =>
    p.clone().applyEuler(new THREE.Euler(-0.7992719422295907, yaw, 0, "YXZ")),
  );
  const initial = surface.finiteContact(
    recordedFace(surface, "boreLower").id,
    from,
    hull,
    before,
  );
  assert.ok(initial && initial.distance < -1.8);
  assert.equal(
    surface.sweep(from, to, hull, (t) => (t === 0 ? before : after)),
    null,
  );
});

test("FAULTLINE underside cannot acquire a clear neighboring triangle while already inside the deck", () => {
  const surface = getRoadSurface(tracks[4]),
    hull = visibleHull(1, 0, 0);
  // Exact later frame50: the neighboring face starts clear while the original is penetrated.
  const from = new THREE.Vector3(
    -1843.0832903133903,
    146.58622346470852,
    1030.937627495639,
  );
  const to = new THREE.Vector3(
    -1843.0832903133903,
    146.52177324168414,
    1030.937627495639,
  );
  const yaw = -2.8169496783782106;
  const before = hull.points.map((p) =>
    p.clone().applyEuler(new THREE.Euler(-0.3738656950500853, yaw, 0, "YXZ")),
  );
  const after = hull.points.map((p) =>
    p.clone().applyEuler(new THREE.Euler(-0.31559666840211137, yaw, 0, "YXZ")),
  );
  assert.ok(
    surface.finiteContact(
      recordedFace(surface, "boreNeighbor").id,
      from,
      hull,
      before,
    ).distance > 0,
  );
  assert.ok(
    surface.finiteContact(
      recordedFace(surface, "boreLower").id,
      from,
      hull,
      before,
    ).distance < 0,
  );
  assert.equal(
    surface.sweep(from, to, hull, (t) => (t === 0 ? before : after)),
    null,
  );
});

test("real gap surfaces are absent even for a fast downward sweep", () => {
  const surface = getRoadSurface(flatTrack({ gap: true }));
  assert.equal(surface.beneath(new THREE.Vector3(0, 2, 50), 3), null);
  assert.equal(
    pointSweep(
      surface,
      new THREE.Vector3(0, 5, 50),
      new THREE.Vector3(0, -5, 50),
    ),
    null,
  );
  assert.ok(
    pointSweep(
      surface,
      new THREE.Vector3(0, 5, 65),
      new THREE.Vector3(0, -5, 65),
    ),
  );
});
test("endpoint vertex rotation catches a pitching nose before its centre reaches road", () => {
  const surface = getRoadSurface(flatTrack()),
    hull = boxShape(3.1, 1.1, 4.25);
  const end = hull.points.map((p) =>
    p.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), (27 * Math.PI) / 180),
  );
  const from = new THREE.Vector3(0, 2, 22);
  const hit = surface.sweep(from, from, hull, (t) =>
    t === 0 ? hull.points : end,
  );
  const endSupport =
    Math.sin((27 * Math.PI) / 180) * 4.25 +
    Math.cos((27 * Math.PI) / 180) * 1.1;
  assert.ok(hit);
  assert.ok(Math.abs(hit.fraction - 0.9 / (endSupport - 1.1)) < 1e-12);
});
test("banked triangle normal determines physical point crossing", () => {
  const surface = getRoadSurface(tracks[4]);
  const tri = triangles(surface).find(
    (t) => Math.abs(t.up.x) > 0.01 && t.branch === 0,
  );
  const centre = tri.a.clone().add(tri.b).add(tri.c).divideScalar(3);
  const points = [tri.up.clone().multiplyScalar(-1.1)];
  const hit = surface.sweep(
    centre.clone().addScaledVector(tri.up, 8),
    centre.clone().addScaledVector(tri.up, -8),
    pointHull,
    () => points,
  );
  assert.ok(hit);
  assert.ok(hit.point.distanceTo(centre) < 1e-8);
  assert.ok(Math.abs(hit.fraction - (8 - 1.1) / 16) < 1e-12);
});
test("FAULTLINE receiver: all three real craft noses land with centre 1–3m before the deck", () => {
  const track = tracks[4],
    surface = getRoadSurface(track);
  const landingS = (track.config.jump + track.config.gapLength) * track.length;
  const receiver = track.frame(landingS),
    firstFace = triangles(surface).find((t) => t.sa === landingS);
  const yaw = Math.atan2(receiver.tangent.x, receiver.tangent.z);
  for (let craft = 0; craft < 3; craft++) {
    const hull = visibleHull(craft, yaw, 0.4);
    const nose = hull.points.reduce((a, b) =>
      a.dot(firstFace.up) < b.dot(firstFace.up) ? a : b,
    );
    for (const distance of [1, 2, 3]) {
      const centre = receiver.p
        .clone()
        .addScaledVector(receiver.tangent, -distance);
      const foot = centre.clone().add(nose);
      const deckY =
        firstFace.a.y -
        (firstFace.up.x * (foot.x - firstFace.a.x) +
          firstFace.up.z * (foot.z - firstFace.a.z)) /
          firstFace.up.y;
      centre.y = deckY - nose.y + 0.05;
      const hit = surface.sweep(
        centre,
        centre.clone().setY(centre.y - 0.1),
        hull,
        () => hull.points,
      );
      assert.ok(hit, `craft${craft}, centre${distance}m before receiver`);
      assert.ok(hit.s >= landingS && hit.s <= landingS + 5);
      assert.ok(hit.fraction > 0 && hit.fraction < 1);
      assert.ok(hit.point.clone().sub(centre).dot(receiver.tangent) > distance);
    }
  }
});
test("launch edge: lowest RAPTOR vertex over gap does not hide higher hull over solid road", () => {
  const surface = getRoadSurface(flatTrack({ gap: true })),
    hull = visibleHull(1, 0, 0);
  const centre = new THREE.Vector3(0, 2, 39.9),
    to = centre.clone().setY(-1);
  const lowest = hull.points.reduce((a, b) => (a.y < b.y ? a : b));
  assert.ok(centre.z + lowest.z > 40);
  const hit = surface.sweep(centre, to, hull, () => hull.points);
  assert.ok(hit);
  assert.ok(hit.point.z <= 40);
  const finiteLandingHeight = centre.y + (to.y - centre.y) * hit.fraction;
  const partlyBelow = centre
    .clone()
    .setY((-lowest.y + finiteLandingHeight) / 2);
  assert.ok(
    partlyBelow.y + lowest.y < 0,
    "lowest feature starts below the infinite plane over the gap",
  );
  const clearFiniteRoad = surface.finiteContact(
    hit.faceId,
    partlyBelow,
    hull,
    hull.points,
  );
  assert.ok(
    clearFiniteRoad && clearFiniteRoad.distance > 0,
    "higher hull over the finite road still starts clear",
  );
  assert.ok(
    surface.sweep(partlyBelow, to, hull, () => hull.points),
    "finite positive start remains a valid landing",
  );
  const pose = centre
    .clone()
    .lerp(to, hit.fraction)
    .add(new THREE.Vector3(0, -0.01, 0));
  const finite = surface.finiteContact(hit.faceId, pose, hull, hull.points);
  assert.ok(finite);
  assert.ok(finite.distance < 0);
  assert.ok(finite.distance > -0.1);
  assert.ok(finite.point.z <= 40);
  assert.equal(
    surface.finiteContact(hit.faceId, pose.clone().setZ(50), hull, hull.points),
    null,
  );
});
test("narrow NOCT triangle under a hull face contacts without any hull vertex inside it", () => {
  const track = flatTrack({ narrow: true });
  track.gap = (u) => u < 0.2 || u >= 0.25;
  const surface = getRoadSurface(track),
    hull = boxShape(8, 1, 8);
  const target = triangles(surface).find(
    (t) => t.sa === 20 && t.a.x >= 0 && t.c.x <= 2.5,
  );
  assert.ok(target);
  const centre = target.a
    .clone()
    .add(target.b)
    .add(target.c)
    .divideScalar(3)
    .setY(2);
  const hit = surface.sweep(
    centre,
    centre.clone().setY(0),
    hull,
    () => hull.points,
  );
  assert.ok(hit);
  assert.ok(Math.abs(hit.fraction - 0.5) < 1e-12);
  const finite = surface.finiteContact(
    target.id,
    centre.clone().setY(0.9),
    hull,
    hull.points,
  );
  assert.ok(finite);
  assert.ok(Math.abs(finite.distance + 0.1) < 1e-12);
});
test("transient footprint entry/exit within a step is not lost to endpoint overlap tests", () => {
  const surface = getRoadSurface(flatTrack()),
    hull = boxShape(0.2, 0.2, 0.2);
  const from = new THREE.Vector3(-12, 1, 22),
    to = new THREE.Vector3(12, -1, 22);
  const hit = surface.sweep(from, to, hull, () => hull.points);
  assert.ok(hit);
  assert.ok(hit.fraction > 0 && hit.fraction < 1);
  assert.ok(Math.abs(hit.fraction - 0.4) < 1e-12);
  assert.equal(
    surface.finiteContact(hit.faceId, from, hull, hull.points),
    null,
  );
  assert.equal(surface.finiteContact(hit.faceId, to, hull, hull.points), null);
});
test("coplanar edge contact catches crossed footprints with no vertex inside either face", () => {
  const track = flatTrack();
  track.gap = (u) => u < 0.2 || u >= 0.25;
  const surface = getRoadSurface(track),
    hull = boxShape(1, 1, 8);
  // Road spans x[-10,10],z[20,25]; bottom hull spans x[-1,1],z[14.5,30.5].
  // Neither polygon has a vertex inside the other; first contact is edge/edge.
  const from = new THREE.Vector3(0, 2, 22.5),
    to = from.clone().setY(0);
  const hit = surface.sweep(from, to, hull, () => hull.points);
  assert.ok(hit);
  assert.ok(Math.abs(hit.fraction - 0.5) < 1e-12);
  assert.ok(hit.point.z >= 20 && hit.point.z <= 25);
});

test("translated NOCT clip-boundary roundoff retains exact STRIKER runout support", () => {
  const surface = getRoadSurface(tracks[6]),
    hull = visibleHull(0, 0, 0);
  const centre = new THREE.Vector3(
    524.6378909257879,
    66.27878076933061,
    864.4102478114336,
  );
  const yaw = -4.2766246409963005,
    pitch = 0.32183004441760854;
  // Preserve the real pose calculation's operation order: the clipped minimum
  // lies on an edge at world X526/Z862, with a -1.9e-14 barycentric residual.
  const vertices = hull.points.map((p) => {
    const y = p.y * Math.cos(pitch) - p.z * Math.sin(pitch);
    const z = p.y * Math.sin(pitch) + p.z * Math.cos(pitch);
    return new THREE.Vector3(
      p.x * Math.cos(yaw) + z * Math.sin(yaw),
      y,
      -p.x * Math.sin(yaw) + z * Math.cos(yaw),
    );
  });
  const triangle = recordedFace(surface, "nightRunout");
  const finite = surface.finiteContact(triangle.id, centre, hull, vertices);
  assert.ok(
    finite,
    "an already clipped edge minimum is finite support, not an outside query",
  );
  assert.ok(Math.abs(finite.distance - 0.041071622533857724) < 1e-12);
  assert.ok(
    Math.abs(finite.point.clone().sub(triangle.a).dot(triangle.up)) < 1e-10,
  );
  assert.ok(
    finite.point.distanceTo(
      new THREE.Vector3(
        526.4959591082447,
        65.22858258779551,
        862.7322002383304,
      ),
    ) < 1e-10,
  );
});

test("asymmetric rigid radius covers a leading nose outside centre-index cells", () => {
  const surface = getRoadSurface(flatTrack());
  const points = [new THREE.Vector3(0, -1, 8), new THREE.Vector3(0, 1, -1)];
  const hull = {
    faces: [],
    radius: Math.max(...points.map((p) => p.length())),
  };
  const hit = surface.sweep(
    new THREE.Vector3(0, 1.05, -7.5),
    new THREE.Vector3(0, 0.95, -7.5),
    hull,
    () => points,
  );
  assert.ok(hit);
  assert.ok(Math.abs(hit.point.z - 0.5) < 1e-12);
});
