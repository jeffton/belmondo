import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { getTrackAdvertisingLayout } from "./advertising.js";

export const VESPER_DISTRICTS = [
  { name: "skyport", start: 0.04, end: 0.18, wall: 0x35424c, light: 0x82c4c5 },
  { name: "terraces", start: 0.18, end: 0.44, wall: 0x494455, light: 0xd3a07b },
  {
    name: "night-market",
    start: 0.44,
    end: 0.63,
    wall: 0x58444b,
    light: 0xe0a16c,
  },
  {
    name: "civic-canyon",
    start: 0.63,
    end: 0.8,
    wall: 0x2f4155,
    light: 0x65b7c8,
  },
  {
    name: "freight-ward",
    start: 0.8,
    end: 0.96,
    wall: 0x464851,
    light: 0xba8863,
  },
];

/** Oriented footprints include all facade projections and the full vertical span. */
export function overlapsVesperVolume(a, b, margin = 0) {
  if (a.top + margin < b.bottom || b.top + margin < a.bottom) return false;
  const dx = b.center.x - a.center.x;
  const dz = b.center.z - a.center.z;
  return [a.right, a.forward, b.right, b.forward].every((axis) => {
    const radius = (volume) =>
      (Math.abs(axis.dot(volume.right)) * volume.width +
        Math.abs(axis.dot(volume.forward)) * volume.depth) /
      2;
    return Math.abs(dx * axis.x + dz * axis.z) < radius(a) + radius(b) + margin;
  });
}

// Reserve the actual ad owner's placements, including the approach viewing cone.
// This follows their merged layout instead of baking a second placement list.
export function vesperAdvertisingReservations(track, heightAt) {
  return getTrackAdvertisingLayout(track).flatMap((ad) => {
    const face = {
      center: ad.center,
      right: ad.horizontal,
      forward: new THREE.Vector3(Math.sin(ad.yaw), 0, Math.cos(ad.yaw)),
      width: ad.width + 3,
      depth: 3,
      bottom: heightAt(ad.center.x, ad.center.z) - 2,
      top: ad.center.y + ad.height / 2 + 2,
      kind: "advertising-face",
    };
    // Swept conservative prisms cover the full panel face (including all 15
    // visibility samples), following the real curved 160m racing approach.
    const views = [20, 40, 45, 60, 80, 100, 120, 140, 160].map((distance) => {
      const approach = track
        .frame(ad.u * track.length - distance, ad.branch)
        .p.clone();
      approach.y += 8;
      const forward = ad.center.clone().sub(approach).setY(0).normalize();
      return {
        center: ad.center.clone().add(approach).multiplyScalar(0.5),
        forward,
        right: new THREE.Vector3(forward.z, 0, -forward.x),
        width: ad.width + 4,
        depth: ad.center.clone().sub(approach).setY(0).length() + 4,
        bottom: Math.min(approach.y - 2, ad.center.y - ad.height / 2 - 2),
        top: Math.max(approach.y + 2, ad.center.y + ad.height / 2 + 2),
        kind: "advertising-view",
      };
    });
    return [face, ...views];
  });
}

/** Five different city functions, not a neon outline repeated around the lap. */
export function buildVesperDistricts(track, environment, box, clearsRoad) {
  const volumes = [];
  const solids = [];
  const inhabitants = [];
  const reservations = vesperAdvertisingReservations(
    track,
    environment.heightAt,
  );
  const activity = planVesperTraffic(
    track,
    environment,
    reservations,
    clearsRoad,
  );
  const districtCounts = Object.fromEntries(
    VESPER_DISTRICTS.map((d) => [d.name, 0]),
  );
  const samples = environment.terrain.samples;
  const count = Math.ceil(track.length / 90);
  const finish = track.config.sections.finishStraight;
  for (let i = 0; i < count; i++) {
    const u = (i + 0.37) / count;
    if (u < finish[1] - 1 + 0.02 || u > finish[0] - 0.02) continue;
    const district = VESPER_DISTRICTS.find((d) => u >= d.start && u < d.end);
    if (!district) continue;
    const branches =
      u > track.config.split[0] && u < track.config.split[1] ? [-1, 1] : [0];
    for (const branch of branches) {
      const f = track.frame(u * track.length, branch);
      const forward = new THREE.Vector3(
        f.tangent.x,
        0,
        f.tangent.z,
      ).normalize();
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      const yaw = Math.atan2(forward.x, forward.z);
      for (const side of [-1, 1]) {
        const variant = (i * 7 + (side + 1) * 3) % 11;
        // Irregular massing and setbacks reveal cross streets and occasional plazas.
        const width = [48, 66, 38, 58, 76][variant % 5];
        const depth = [62, 78, 54, 88][variant % 4];
        const setback = [19, 34, 23, 48][(variant + 1) % 4];
        const center = f.p
          .clone()
          .addScaledVector(right, side * (f.width + width / 2 + setback));
        const feet = [-1, 1].flatMap((x) =>
          [-1, 1].map((z) =>
            center
              .clone()
              .addScaledVector(right, (x * width) / 2)
              .addScaledVector(forward, (z * depth) / 2),
          ),
        );
        const ground = Math.max(
          ...feet.map((p) => environment.heightAt(p.x, p.z)),
        );
        const bottom =
          Math.min(...feet.map((p) => environment.heightAt(p.x, p.z))) - 2;
        const roofHeight =
          district.name === "civic-canyon"
            ? 80 + variant * 9
            : district.name === "terraces"
              ? (variant % 3 === 0 ? 76 : 8) + variant * 4
              : district.name === "night-market"
                ? 26 + variant * 4
                : district.name === "freight-ward"
                  ? 18 + variant * 3
                  : 24 + variant * 5;
        const top = Math.max(ground + 44, f.p.y + roofHeight);
        const volume = {
          center,
          right,
          forward,
          width,
          depth,
          bottom,
          top,
          u,
          branch,
          side,
          kind: district.name,
        };
        if (
          !clearsRoad(volume, samples) ||
          [
            ...reservations,
            ...activity.flatMap((lane) => [lane, ...lane.piers]),
          ].some((r) => overlapsVesperVolume(volume, r, 3))
        )
          continue;
        // Intersecting city blocks read as broken meshes, not density. The first
        // accepted building owns its complete footprint, including the other fork.
        if (volumes.some((v) => overlapsVesperVolume(volume, v, 2))) continue;
        volumes.push(volume);
        districtCounts[district.name]++;
        const point = (x, y, z) =>
          center
            .clone()
            .addScaledVector(right, x)
            .addScaledVector(forward, z)
            .setY(y);
        const part = (
          x,
          y,
          z,
          w,
          h,
          d,
          color = district.wall,
          material = "facade",
          shape = "box",
        ) => box(material, point(x, y, z), yaw, [w, h, d], color, shape);
        const mass = (x, low, high, z, w, d, color = district.wall) => {
          const span = Math.min(w, width - 3);
          const length = Math.min(d, depth - 3);
          solids.push({
            center: point(x, (low + high) / 2, z),
            right,
            forward,
            width: span,
            depth: length,
            bottom: low,
            top: high,
          });
          part(x, (low + high) / 2, z, span, high - low, length, color);
        };
        const face = -side * (width / 2 - 1.2);
        const light =
          district.name === "civic-canyon" && variant % 3 === 0
            ? 0xd7b381
            : district.light;
        const occupied = (y, span, warm = false) => {
          // Recessed window banks with dark mullions, not bright floor wireframes.
          part(face, y, 0, 0.8, 5.5, span, warm ? 0xb48a68 : 0x537d91, "neon");
          for (const z of [-0.28, 0, 0.28])
            part(face - side * 0.5, y, z * span, 0.9, 5.7, 1.8, 0x273344);
        };

        if (district.name === "skyport") {
          const roof = top - 17;
          mass(0, bottom, roof, 0, width, depth);
          // A service drum, broad landing crown and one illuminated terminal bay.
          part(
            0,
            roof + 5,
            depth * 0.1,
            width * 0.58,
            10,
            width * 0.58,
            0x738087,
            "facade",
            "drum",
          );
          part(
            0,
            roof + 10.5,
            depth * 0.1,
            width * 0.62,
            1,
            width * 0.62,
            0x395966,
            "facade",
            "drum",
          );
          part(side * width * 0.3, roof + 8, -depth * 0.25, 3, 16, 3, 0x6c6e77);
          part(
            side * width * 0.3,
            top - 0.6,
            -depth * 0.25,
            3.2,
            1,
            3.2,
            0xe4a16f,
            "neon",
          );
          occupied(Math.min(roof - 9, f.p.y + 5), depth * 0.65);
          part(face, roof - 2, 0, 1, 2.8, depth * 0.5, light, "neon");
          // Ground-rooted loading buttresses give the roof deck a purpose.
          for (const z of [-0.36, 0.36])
            mass(
              -side * width * 0.33,
              bottom,
              roof + 1,
              z * depth,
              width * 0.18,
              depth * 0.1,
              0x59606a,
            );
        } else if (district.name === "terraces") {
          const low = bottom + (top - bottom) * 0.5;
          const middle = bottom + (top - bottom) * 0.79;
          mass(0, bottom, low, 0, width, depth);
          mass(
            side * width * 0.09,
            low,
            middle,
            0,
            width * 0.72,
            depth * 0.86,
            0x565362,
          );
          mass(
            side * width * 0.16,
            middle,
            top,
            depth * 0.12,
            width * 0.48,
            depth * 0.55,
            0x3c4355,
          );
          // Inhabited planted terraces: heavy planters, faceted vegetation and
          // warm apartment blocks, rather than another glowing edge cage.
          for (const z of [-0.3, 0.22]) {
            part(
              -side * width * 0.31,
              low + 1,
              z * depth,
              width * 0.16,
              2,
              depth * 0.2,
              0x74646b,
            );
            part(
              -side * width * 0.31,
              low + 3.8,
              z * depth,
              width * 0.13,
              4.5,
              depth * 0.17,
              0x496562,
              "facade",
              "crown",
            );
          }
          occupied(Math.min(low - 6, f.p.y - 5), depth * 0.7, true);
          part(
            side * width * 0.16,
            top - 5,
            -depth * 0.16,
            width * 0.3,
            4,
            0.7,
            0x8d8aa0,
            "neon",
          );
        } else if (district.name === "night-market") {
          const roof = top - 6;
          mass(
            side * 6,
            bottom,
            roof,
            0,
            width - 15,
            depth,
            variant % 2 ? 0x59464c : 0x48535c,
          );
          // Stacked cantilevered shop balconies and canvas canopies establish a
          // warmer human scale under the enormous elevated racing structure.
          for (const level of [f.p.y - 12, f.p.y + 6, f.p.y + 23]) {
            if (level + 7 > roof) continue;
            part(
              -side * (width / 2 - 8),
              level,
              0,
              16,
              2.4,
              depth * 0.82,
              0x847077,
            );
            part(
              -side * (width / 2 - 7),
              level + 6.5,
              0,
              14,
              1.6,
              depth * 0.8,
              variant % 2 ? 0x8e635b : 0x586a78,
            );
            for (let stall = 0; stall < 3; stall++) {
              const z = (stall - 1) * depth * 0.25;
              part(
                -side * (width / 2 - 13.3),
                level + 3.5,
                z,
                0.7,
                3.8,
                depth * 0.17,
                light,
                "neon",
              );
              // Open-air balconies sit in front of the recessed shop wall.
              // Their occupants must not be buried in the opaque building mass.
              inhabitants.push({
                center: point(face + side * 5, level + 2.4, z + 2),
                right,
                forward,
                width: 0.85,
                depth: 0.75,
                bottom: level + 1.2,
                top: level + 3.6,
              });
              part(
                face + side * 5,
                level + 2.4,
                z + 2,
                0.85,
                2.4,
                0.75,
                stall % 2 ? 0x34364a : 0x9c737a,
              );
              part(
                face + side * 5,
                level + 4,
                z + 2,
                0.65,
                0.7,
                0.65,
                0xa58b7c,
              );
            }
          }
          part(
            side * width * 0.16,
            roof + 3,
            0,
            width * 0.35,
            6,
            depth * 0.45,
            0x313f50,
          );
          // A few large hanging lantern housings, never a curtain of tiny dots.
          for (const z of [-0.3, 0.3])
            part(
              face + side,
              f.p.y + 16,
              z * depth,
              2,
              4,
              3.5,
              0xdb866b,
              "neon",
            );
        } else if (district.name === "civic-canyon") {
          const podium = Math.min(top - 45, f.p.y + 15);
          mass(0, bottom, podium, 0, width, depth, 0x485064);
          mass(
            side * width * 0.06,
            podium,
            top - 12,
            depth * 0.04,
            width * 0.82,
            depth * 0.78,
          );
          mass(
            side * width * 0.12,
            top - 12,
            top,
            depth * 0.1,
            width * 0.62,
            depth * 0.56,
            0x586373,
          );
          // Solid asymmetric blade and a single deep-lit central atrium.
          mass(
            -side * width * 0.37,
            podium,
            top - 22,
            -depth * 0.25,
            width * 0.12,
            depth * 0.16,
            0x70717c,
          );
          part(
            -side * width * 0.345,
            (podium + top - 22) / 2,
            depth * 0.08,
            0.8,
            (top - 22 - podium) * 0.76,
            depth * 0.19,
            light,
            "neon",
          );
          occupied(podium - 7, depth * 0.6);
          part(
            side * width * 0.12,
            top - 1,
            depth * 0.1,
            width * 0.5,
            1.3,
            depth * 0.3,
            0x7195a1,
          );
        } else {
          const roof = top - 23;
          mass(0, bottom, roof, 0, width, depth, 0x4c4e57);
          // Freight sheds, exhaust exchangers and stacked sealed cargo modules.
          for (const z of [-0.24, 0.24]) {
            part(
              side * width * 0.15,
              roof + 7,
              z * depth,
              width * 0.38,
              14,
              width * 0.38,
              0x646572,
              "facade",
              "drum",
            );
            part(
              side * width * 0.15,
              roof + 14.5,
              z * depth,
              width * 0.4,
              1.2,
              width * 0.4,
              0x91806a,
              "facade",
              "drum",
            );
          }
          part(
            -side * width * 0.28,
            roof + 4,
            0,
            width * 0.26,
            8,
            depth * 0.78,
            variant % 2 ? 0x785c57 : 0x566b77,
          );
          part(
            -side * width * 0.28,
            roof + 11,
            depth * 0.12,
            width * 0.24,
            6,
            depth * 0.48,
            0x8b7161,
          );
          occupied(roof - 7, depth * 0.65, true);
          for (const z of [-0.42, 0.42])
            part(face, roof - 3, z * depth, 1, 2, 3, light, "neon");
        }
      }
    }
  }
  return {
    volumes,
    reservations,
    districtCounts,
    activity,
    solids,
    inhabitants,
  };
}

function planVesperTraffic(track, environment, reservations, clearsRoad) {
  const lanes = [];
  for (const [u, side, length, height, kind] of [
    [0.145, 1, 180, 44, "skyport-delivery"],
    [0.235, 1, 155, 39, "terrace-commute"],
    [0.515, -1, 145, 38, "market-delivery"],
    [0.75, 1, 205, 46, "civic-skytram"],
    [0.855, -1, 170, 38, "freight-shuttle"],
  ]) {
    const f = track.frame(u * track.length);
    const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const center = f.p.clone().addScaledVector(right, side * (f.width + 48));
    center.y += height;
    const volume = {
      center,
      right,
      forward,
      width: 10,
      depth: length + 24,
      bottom: center.y - 8,
      top: center.y + 5,
      kind,
      u,
    };
    const piers =
      kind === "civic-skytram"
        ? [-0.42, -0.14, 0.14, 0.42].map((z) => {
            const center = volume.center
              .clone()
              .addScaledVector(forward, length * z);
            return {
              center,
              right,
              forward,
              width: 3,
              depth: 5,
              bottom: environment.heightAt(center.x, center.z) - 1,
              top: volume.center.y - 4,
              kind: "tram-pier",
            };
          })
        : [];
    if (
      ![volume, ...piers].every(
        (part) =>
          clearsRoad(part, environment.terrain.samples) &&
          reservations.every((r) => !overlapsVesperVolume(part, r, 4)),
      )
    )
      continue;
    lanes.push({
      ...volume,
      piers,
      yaw: Math.atan2(forward.x, forward.z),
      direction: side,
      speed: kind === "civic-skytram" ? 24 : 18 + lanes.length * 3,
      length,
    });
  }
  return lanes;
}

function commuterGeometry() {
  const parts = [];
  const add = (geometry, color, x, y, z) => {
    const g = geometry.toNonIndexed();
    geometry.dispose();
    g.translate(x, y, z);
    g.deleteAttribute("uv");
    const tint = new THREE.Color(color);
    const colors = [];
    for (let i = 0; i < g.attributes.position.count; i++)
      colors.push(tint.r, tint.g, tint.b);
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    parts.push(g);
  };
  add(new THREE.BoxGeometry(5.8, 2.3, 14), 0x5f7585, 0, 0, 0);
  add(new THREE.BoxGeometry(4.8, 1.8, 7), 0x243c52, 0, 1.7, -1);
  add(new THREE.BoxGeometry(5.9, 0.55, 0.7), 0x90cdd2, 0, 0.1, 7);
  add(new THREE.BoxGeometry(4.7, 0.4, 0.8), 0xb0755e, 0, 0, -7);
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return geometry;
}

/** Small continuous city traffic in measured, road-clear air/street lanes. */
export function buildVesperTraffic(root, architecture, box) {
  const lanes = architecture.activity;
  for (const lane of lanes) {
    if (lane.kind !== "civic-skytram") continue;
    box(
      "facade",
      lane.center.clone().add(new THREE.Vector3(0, -3, 0)),
      lane.yaw,
      [8, 1.6, lane.length + 24],
      0x697585,
    );
    for (const pier of lane.piers) {
      box(
        "facade",
        pier.center.clone().setY((pier.bottom + pier.top) / 2),
        lane.yaw,
        [pier.width, pier.top - pier.bottom, pier.depth],
        0x46566b,
      );
    }
  }
  const geometry = commuterGeometry();
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  });
  const count = lanes.length * 3;
  const traffic = new THREE.InstancedMesh(geometry, material, count);
  traffic.name = "vesper-city-traffic";
  // Animated instances share one compact city-wide batch. Bounds cover each
  // complete swept lane and do not need per-frame recomputation.
  const bounds = new THREE.Box3();
  for (const lane of lanes) {
    for (const direction of [-1, 1]) {
      const p = lane.center
        .clone()
        .addScaledVector(lane.forward, direction * (lane.length / 2 + 12));
      bounds.expandByPoint(p.clone().addScalar(10));
      bounds.expandByPoint(p.clone().addScalar(-10));
    }
  }
  traffic.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
  root.add(traffic);
  const transform = new THREE.Object3D();
  const update = (time) => {
    for (const [index, lane] of lanes.entries()) {
      for (let car = 0; car < 3; car++) {
        const train = lane.kind === "civic-skytram";
        const cycle = train ? lane.length + 65 : lane.length;
        const phase =
          (time * lane.speed + (train ? 120 - car * 16 : (car * cycle) / 3)) %
          cycle;
        const along = phase - cycle / 2;
        transform.position
          .copy(lane.center)
          .addScaledVector(lane.forward, along * lane.direction);
        // Taper at lane endpoints reads as entering a city gate, not popping.
        const reveal = Math.max(
          0,
          Math.min(1, (lane.length / 2 - Math.abs(along)) / 12),
        );
        transform.rotation.set(
          0,
          lane.yaw + (lane.direction < 0 ? Math.PI : 0),
          0,
        );
        transform.scale.setScalar(reveal);
        transform.updateMatrix();
        traffic.setMatrixAt(index * 3 + car, transform.matrix);
      }
    }
    traffic.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { lanes, update };
}
