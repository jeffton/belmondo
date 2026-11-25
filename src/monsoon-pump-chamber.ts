import * as THREE from "three";
import type { Track } from "./track.ts";
import type { CircuitTextures, EnvironmentSurface } from "./environment.ts";
import {
  architecturalFooting,
  courseArchitecture,
} from "./course-architecture.ts";

/** A single pumping hall, race-side water race and two operational gate throats. */
export function buildMonsoonPumpChamber(
  parent: THREE.Object3D,
  track: Track,
  textures: CircuitTextures,
  environment: EnvironmentSurface,
) {
  const site = courseArchitecture(parent, "monsoon-pump-chamber", textures, {
    concrete: { color: 0xaba69b, map: "concrete" },
    cap: { color: 0xd9d5c9, map: "paint" },
    machinery: { color: 0x324d53, map: "paint" },
    gate: { color: 0xe5ba62, map: "paint" },
    water: { color: 0x5d9da6, map: "water" },
    wet: { color: 0x384f4c, map: "concrete" },
  });
  const waters: { point: THREE.Vector3; bottom: number; road: number }[] = [];
  const foundations = [];
  function segment(start: number, end: number, step: number) {
    const n = Math.ceil(((end - start) * track.length) / step);
    return Array.from({ length: n }, (_, i) => {
      const a = track.frame((start + ((end - start) * i) / n) * track.length);
      const b = track.frame(
        (start + ((end - start) * (i + 1)) / n) * track.length,
      );
      const p = a.p.clone().lerp(b.p, 0.5);
      const d = b.p.clone().sub(a.p);
      return {
        a,
        b,
        p,
        yaw: Math.atan2(d.x, d.z),
        length: Math.hypot(d.x, d.z) + 0.6,
        width: a.width,
      };
    });
  }
  // The existing high retained reservoir is joined to a lower, visible race.
  // This occupies the already excavated shoulder, not uncut green upland.
  const waterVertices: number[] = [];
  for (const s of segment(0.265, 0.55, 10)) {
    const right = new THREE.Vector3(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
    const local = (offset: number, y: number) =>
      s.p.clone().addScaledVector(right, offset).setY(y);
    const water = s.p.y - 7;
    const channel = local(s.width + 57, water);
    const edge = (f: typeof s.a, offset: number) =>
      f.p
        .clone()
        .addScaledVector(
          new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize(),
          f.width + offset,
        )
        .setY(f.p.y - 7);
    const a = edge(s.a, 4),
      b = edge(s.b, 4),
      c = edge(s.b, 110),
      d = edge(s.a, 110);
    for (const p of [a, b, c, a, c, d]) waterVertices.push(...p.toArray());
    waters.push({
      point: channel,
      bottom: environment.heightAt(channel.x, channel.z),
      road: s.p.y,
    });
    for (const offset of [s.width + 3, s.width + 111]) {
      const p = local(offset, 0);
      const foot = architecturalFooting(environment, p, 2, s.length, s.yaw);
      site.box(
        "concrete",
        p.clone().setY((foot.bottom + water + 1) / 2),
        [2, water + 1 - foot.bottom, s.length],
        s.yaw,
      );
      site.box("cap", p.clone().setY(water + 1.3), [2.4, 0.6, s.length], s.yaw);
    }
  }
  const waterGeometry = new THREE.BufferGeometry();
  waterGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(waterVertices, 3),
  );
  const waterUV: number[] = [];
  for (let i = 0; i < waterVertices.length; i += 3)
    waterUV.push(waterVertices[i] / 32, waterVertices[i + 2] / 32);
  waterGeometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(waterUV, 2),
  );
  waterGeometry.setIndex(
    Array.from({ length: waterVertices.length / 3 }, (_, i) => i),
  );
  waterGeometry.computeVertexNormals();
  site.add("water", waterGeometry, new THREE.Matrix4());
  for (const u of [0.265, 0.55]) {
    const f = track.frame(u * track.length);
    const yaw = Math.atan2(f.tangent.x, f.tangent.z);
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const p = f.p.clone().addScaledVector(right, f.width + 57);
    const foot = architecturalFooting(environment, p, 108, 4, yaw);
    const top = f.p.y - 6;
    site.box(
      "concrete",
      p.clone().setY((foot.bottom + top) / 2),
      [108, top - foot.bottom, 4],
      yaw,
    );
    site.box("cap", p.clone().setY(top + 0.3), [108, 0.6, 4], yaw);
  }
  // Controlled overflow faces expose the head difference from the raceway.
  // The water runs down the retained wall into the low race, with concrete
  // cheeks tying it to the reservoir rather than floating coloured panels.
  for (const u of [0.342, 0.414, 0.491]) {
    const f = track.frame(u * track.length);
    const yaw = Math.atan2(f.tangent.x, f.tangent.z);
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const p = f.p.clone().addScaledVector(right, f.width + 111.7);
    site.box(
      "water",
      p.clone().setY((42 + f.p.y - 7) / 2),
      [0.5, 42 - f.p.y + 7, 24],
      yaw,
    );
    for (const side of [-1, 1])
      site.box(
        "cap",
        p
          .clone()
          .addScaledVector(forward, side * 13)
          .setY((44 + f.p.y - 8) / 2),
        [3, 44 - f.p.y + 8, 2],
        yaw,
      );
    site.box("gate", p.clone().setY(43), [3, 2, 28], yaw);
  }
  // One curved, connected structural volume rather than unrelated pump props.
  const hall = segment(0.325, 0.485, 18);
  for (const [i, s] of hall.entries()) {
    const right = new THREE.Vector3(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
    const p = s.p.clone().addScaledVector(right, -(s.width + 47));
    const foot = architecturalFooting(environment, p, 58, s.length, s.yaw);
    const top = Math.max(foot.top + 8, s.p.y + 66);
    foundations.push(foot);
    const tide = s.p.y + 9;
    site.box(
      "wet",
      p.clone().setY((foot.bottom + tide) / 2),
      [58, tide - foot.bottom, s.length],
      s.yaw,
    );
    site.box(
      "concrete",
      p.clone().setY((tide + top) / 2),
      [58, top - tide, s.length],
      s.yaw,
    );
    site.box("cap", p.clone().setY(top + 1), [62, 2, s.length], s.yaw);
    // The continuous intake grille gives the hall a function and a readable base.
    const front = s.p.clone().addScaledVector(right, -(s.width + 17.5));
    site.box("machinery", front.setY(s.p.y + 25), [1, 18, s.length], s.yaw);
    if (i % 4 === 0)
      site.box(
        "concrete",
        front.clone().addScaledVector(right, 1.8),
        [4, 28, 3],
        s.yaw,
      );
  }

  for (const u of [0.355, 0.377, 0.41, 0.433]) {
    const f = track.frame(u * track.length);
    const yaw = Math.atan2(f.tangent.x, f.tangent.z);
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const face = f.p.clone().addScaledVector(right, -(f.width + 18));
    const mount = (offset: number, height: number, axis: "cylinder" | "ring") =>
      new THREE.Matrix4()
        .makeRotationY(yaw)
        .multiply(
          axis === "cylinder"
            ? new THREE.Matrix4().makeRotationZ(-Math.PI / 2)
            : new THREE.Matrix4().makeRotationY(Math.PI / 2),
        )
        .setPosition(
          face
            .clone()
            .addScaledVector(right, offset)
            .setY(f.p.y + height),
        );
    site.add(
      "wet",
      new THREE.CylinderGeometry(15, 17, 9, 12),
      mount(1.5, 29, "cylinder"),
    );
    site.add(
      "cap",
      new THREE.TorusGeometry(12.5, 2.1, 4, 12),
      mount(6, 29, "ring"),
    );
    site.add(
      "machinery",
      new THREE.CylinderGeometry(12, 12, 1, 12),
      mount(6.1, 29, "cylinder"),
    );
    site.add(
      "gate",
      new THREE.CylinderGeometry(3.1, 4.1, 3, 8),
      mount(6.7, 29, "cylinder"),
    );
    for (const angle of [0.3, Math.PI / 3 + 0.3, (Math.PI * 2) / 3 + 0.3]) {
      const matrix = new THREE.Matrix4()
        .makeRotationY(yaw)
        .multiply(new THREE.Matrix4().makeRotationX(angle))
        .setPosition(
          face
            .clone()
            .addScaledVector(right, 7)
            .setY(f.p.y + 29),
        );
      site.add("concrete", new THREE.BoxGeometry(1.1, 2.1, 22), matrix);
    }
  }
  // The inlet gatehouse has a transverse quay face across the low race. Its
  // waterline is seen head-on on the bend approach, not only in a side trench.
  const quayFrame = track.frame(0.326 * track.length);
  const quayYaw = Math.atan2(quayFrame.tangent.x, quayFrame.tangent.z);
  const quayRight = new THREE.Vector3(Math.cos(quayYaw), 0, -Math.sin(quayYaw));
  const quayForward = new THREE.Vector3(
    Math.sin(quayYaw),
    0,
    Math.cos(quayYaw),
  );
  const quayCenter = quayFrame.p
    .clone()
    .addScaledVector(quayRight, quayFrame.width + 61.5);
  const quayWidth = 113,
    quayDepth = 18;
  const quayFoot = architecturalFooting(
    environment,
    quayCenter,
    quayWidth,
    quayDepth,
    quayYaw,
  );
  const lowWater = quayFrame.p.y - 7;
  const wetTop = lowWater + 2,
    quayTop = quayFrame.p.y + 26;
  site.box(
    "wet",
    quayCenter.clone().setY((quayFoot.bottom + wetTop) / 2),
    [quayWidth, wetTop - quayFoot.bottom, quayDepth],
    quayYaw,
  );
  // The saturated aggregate and pale dry concrete meet at the visible tide
  // line; the two existing masses carry the break without another mesh.
  site.box(
    "concrete",
    quayCenter.clone().setY((wetTop + quayTop) / 2),
    [quayWidth, quayTop - wetTop, quayDepth],
    quayYaw,
  );
  site.box(
    "cap",
    quayCenter.clone().setY(quayTop + 1),
    [quayWidth + 2, 2, quayDepth + 2],
    quayYaw,
  );
  site.root.userData.quay = {
    center: quayCenter,
    forward: quayForward,
    right: quayRight,
    width: quayWidth,
    depth: quayDepth,
    lowWater,
    footing: quayFoot,
    top: quayTop,
  };
  // The inlet is compressed under a high gate carriage; the second throat
  // releases into sky and the boost-fed outlet. Neither obstructs racing space.
  for (const u of [0.326, 0.49]) {
    const f = track.frame(u * track.length);
    const yaw = Math.atan2(f.tangent.x, f.tangent.z);
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    for (const offset of [-(f.width + 19), f.width + 121]) {
      const p = f.p.clone().addScaledVector(right, offset);
      const foot = architecturalFooting(environment, p, 12, 22, yaw);
      const top = f.p.y + 64;
      site.box(
        "concrete",
        p.clone().setY((foot.bottom + top) / 2),
        [12, top - foot.bottom, 22],
        yaw,
      );
      site.box("wet", p.clone().setY(f.p.y + 19), [12.5, 6, 23], yaw);
      site.box("gate", p.clone().setY(f.p.y + 48), [12.6, 4, 22.6], yaw);
      const drive = new THREE.Matrix4().setPosition(p.clone().setY(f.p.y + 70));
      site.add("machinery", new THREE.CylinderGeometry(8, 9, 15, 10), drive);
      site.add(
        "gate",
        new THREE.CylinderGeometry(5, 5, 8, 10),
        drive.clone().setPosition(p.clone().setY(f.p.y + 80)),
      );
      site.box("wet", p.clone().setY(f.p.y + 60), [19, 8, 23], yaw);
    }
    site.box(
      "machinery",
      f.p
        .clone()
        .addScaledVector(right, 51)
        .setY(f.p.y + 52),
      [2 * (f.width + 76), 14, 17],
      yaw,
    );
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    for (const offset of [-(f.width + 1), -8, 8, f.width + 1]) {
      const plate = f.p
        .clone()
        .addScaledVector(right, offset)
        .addScaledVector(forward, -9)
        .setY(f.p.y + 50);
      site.box("gate", plate, [5, 5, 1.4], yaw);
    }
    site.box(
      "cap",
      f.p
        .clone()
        .addScaledVector(right, 51)
        .setY(f.p.y + 58),
      [2 * (f.width + 78), 2, 20],
      yaw,
    );
  }
  site.root.userData.waterContacts = waters;
  site.root.userData.foundations = foundations;
  site.root.userData.range = [0.265, 0.55];
  site.root.userData.gateStations = [0.326, 0.49];
  return site.finish();
}
