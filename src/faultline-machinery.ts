import * as THREE from "three";

/** Add a low-poly bucket-wheel excavator landmark to the quarry floor. */
export function buildFaultlineMachinery(
  group: THREE.Object3D,
  floorY: number,
  centerX: number,
  centerZ: number,
): void {
  const root = new THREE.Group();
  root.name = "faultline-excavator";
  root.position.set(centerX, floorY, centerZ);
  group.add(root);

  const materials = {
    track: new THREE.MeshLambertMaterial({
      color: 0x202a30,
      flatShading: true,
    }),
    trackEdge: new THREE.MeshLambertMaterial({
      color: 0x48535a,
      flatShading: true,
    }),
    hull: new THREE.MeshLambertMaterial({ color: 0xe3d2a1, flatShading: true }),
    hullShade: new THREE.MeshLambertMaterial({
      color: 0x827f70,
      flatShading: true,
    }),
    teal: new THREE.MeshLambertMaterial({ color: 0x218c86, flatShading: true }),
    tealShade: new THREE.MeshLambertMaterial({
      color: 0x20565a,
      flatShading: true,
    }),
    orange: new THREE.MeshLambertMaterial({
      color: 0xc66a35,
      flatShading: true,
    }),
    belt: new THREE.MeshLambertMaterial({ color: 0x171f23, flatShading: true }),
    steel: new THREE.MeshLambertMaterial({
      color: 0x657176,
      flatShading: true,
    }),
    tooth: new THREE.MeshLambertMaterial({
      color: 0xeb9b44,
      flatShading: true,
    }),
  };

  const box = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1, false);
  const batches = new Map<
    string,
    {
      geometry: THREE.BufferGeometry;
      material: THREE.Material;
      matrices: THREE.Matrix4[];
    }
  >();
  const transform = new THREE.Object3D();

  function addPart(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: THREE.Vector3,
    scale: THREE.Vector3,
    rotation = new THREE.Euler(),
  ) {
    transform.position.copy(position);
    transform.rotation.copy(rotation);
    transform.scale.copy(scale);
    transform.updateMatrix();
    const key = `${geometry === box ? "box" : "cylinder"}:${material.uuid}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { geometry, material, matrices: [] };
      batches.set(key, batch);
    }
    batch.matrices.push(transform.matrix.clone());
  }

  function beam(
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rotation = new THREE.Euler(),
  ) {
    addPart(
      box,
      material,
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(sx, sy, sz),
      rotation,
    );
  }

  function roller(
    x: number,
    y: number,
    z: number,
    radius: number,
    length: number,
    material: THREE.Material,
  ) {
    addPart(
      cylinder,
      material,
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(radius * 2, length, radius * 2),
      new THREE.Euler(0, 0, Math.PI / 2),
    );
  }

  function rollerAcrossZ(
    x: number,
    y: number,
    z: number,
    radius: number,
    width: number,
    material: THREE.Material,
  ) {
    addPart(
      cylinder,
      material,
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(radius * 2, width, radius * 2),
      new THREE.Euler(Math.PI / 2, 0, 0),
    );
  }

  // Twin crawler assemblies and their exposed, evenly spaced road wheels.
  for (const z of [-7.2, 7.2]) {
    beam(materials.track, -12, 3.1, z, 37, 6.2, 8.2);
    beam(materials.trackEdge, -12, 6.0, z, 35, 0.65, 8.5);
    for (let i = 0; i < 7; i++) {
      rollerAcrossZ(
        -27 + i * 5,
        3.0,
        z + (z < 0 ? -0.1 : 0.1),
        2.25,
        8.7,
        materials.steel,
      );
      rollerAcrossZ(
        -27 + i * 5,
        3.0,
        z + (z < 0 ? -0.18 : 0.18),
        1.15,
        8.9,
        materials.track,
      );
    }
  }

  // Rotating platform, operator house, engine deck and the broad counterweight.
  beam(materials.hullShade, -7, 8.2, 0, 34, 3.5, 23);
  beam(materials.teal, -12, 13.0, 0, 31, 6.8, 20);
  beam(materials.orange, -29, 17.5, 0, 15, 10.5, 22);
  beam(materials.hullShade, -31, 12.5, 0, 16, 2.0, 23);
  beam(materials.tealShade, -13, 19.1, -5.0, 12, 7.0, 8.6);
  beam(materials.hull, -13, 20.0, -5.0, 9.4, 4.4, 6.1);
  beam(materials.tealShade, -13, 19.8, -1.82, 8.2, 3.7, 0.32);
  beam(materials.hull, -7, 17.2, 4.8, 13, 4.8, 9.3);
  beam(materials.orange, -32.0, 18.0, 0, 2.4, 11.5, 24);
  beam(materials.steel, -24.5, 11.0, 0, 2.0, 3.0, 25);

  // Long raised truss boom reaching to the toothed wheel; the paired chords and
  // diagonal braces read clearly even at the intentionally coarse scale.
  const boomStart = new THREE.Vector3(-2, 22, 0);
  const boomEnd = new THREE.Vector3(44, 70, 0);
  const boomLength = boomStart.distanceTo(boomEnd);
  const boomAngle = Math.atan2(
    boomEnd.y - boomStart.y,
    boomEnd.x - boomStart.x,
  );
  const boomMidX = (boomStart.x + boomEnd.x) / 2;
  const boomMidY = (boomStart.y + boomEnd.y) / 2;
  for (const z of [-5.2, 5.2]) {
    beam(
      materials.hull,
      boomMidX,
      boomMidY,
      z,
      boomLength,
      3.2,
      2.8,
      new THREE.Euler(0, 0, boomAngle),
    );
    beam(
      materials.teal,
      boomMidX,
      boomMidY - 4.0,
      z,
      boomLength,
      2.2,
      2.2,
      new THREE.Euler(0, 0, boomAngle),
    );
    for (let i = 0; i < 6; i++) {
      const t = (i + 0.5) / 6;
      const x = boomStart.x + (boomEnd.x - boomStart.x) * t;
      const y = boomStart.y + (boomEnd.y - boomStart.y) * t;
      beam(
        materials.tealShade,
        x,
        y - 1.4,
        z,
        1.6,
        6.2,
        2.5,
        new THREE.Euler(0, 0, boomAngle),
      );
    }
  }
  beam(
    materials.steel,
    21,
    42.5,
    0,
    8.0,
    2.1,
    2.1,
    new THREE.Euler(0, 0, -0.52),
  );
  beam(
    materials.steel,
    31,
    49.8,
    0,
    8.0,
    2.1,
    2.1,
    new THREE.Euler(0, 0, -0.52),
  );

  // Bucket wheel: a vertical, faceted disk on a transverse axle with bold teeth.
  const wheelX = 47;
  const wheelY = 68;
  roller(wheelX, wheelY, 0, 16.5, 8.5, materials.tealShade);
  roller(wheelX, wheelY, -4.8, 7.2, 2.2, materials.steel);
  roller(wheelX, wheelY, 4.8, 7.2, 2.2, materials.steel);
  roller(wheelX, wheelY, -6.1, 2.8, 1.5, materials.tooth);
  roller(wheelX, wheelY, 6.1, 2.8, 1.5, materials.tooth);
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const y = wheelY + Math.sin(angle) * 16.9;
    const z = Math.cos(angle) * 16.9;
    beam(
      materials.tooth,
      wheelX,
      y,
      z,
      5.2,
      4.6,
      3.8,
      new THREE.Euler(angle, 0, 0),
    );
  }
  // Short intake chute and a discharge lip beneath the wheel.
  beam(
    materials.hullShade,
    37,
    48.0,
    0,
    19,
    2.5,
    12,
    new THREE.Euler(0, 0, -0.24),
  );
  beam(materials.teal, 42.5, 47.0, 0, 10, 1.2, 14);

  // A 230-unit transfer belt crosses the quarry floor beside the machine.
  // Its lateral placement keeps the whole landmark inside the 200-unit radius.
  const beltCenterX = -50;
  const beltLength = 230;
  beam(materials.belt, beltCenterX, 24.2, 0, 8.5, 2.1, beltLength);
  beam(materials.trackEdge, beltCenterX - 4.7, 25.5, 0, 1.1, 0.9, beltLength);
  beam(materials.trackEdge, beltCenterX + 4.7, 25.5, 0, 1.1, 0.9, beltLength);
  beam(materials.hullShade, -37, 22.0, 0, 7.0, 1.5, 10.0);
  beam(materials.steel, beltCenterX, 23.7, -115, 10.0, 5.0, 5.0);
  beam(materials.steel, beltCenterX, 23.7, 115, 10.0, 5.0, 5.0);
  for (const z of [-100, -75, -50, -25, 0, 25, 50, 75, 100]) {
    beam(materials.steel, beltCenterX, 13.0, z, 2.1, 22, 2.1);
    beam(materials.hullShade, beltCenterX, 24.0, z, 11.5, 1.2, 5.0);
    roller(beltCenterX, 24.0, z, 1.6, 12.2, materials.track);
  }

  for (const { geometry, material, matrices } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
  }
}
