// Deliberate racing-line choices, not random spawns. Lateral metres are relative
// to the authored route; each fork offers a different reward and approach line.
const layouts = {
  "KAISEKI COAST": [
    [
      0.065,
      0,
      -9,
      "boost",
      "Inside-edge acceleration through the opening left",
    ],
    [0.21, 0, 6, "weapon", "Safer outside line before the fork"],
    [0.35, -1, -7, "boost", "Low-route inside corner reward"],
    [0.37, 1, 6, "weapon", "High-route outside armament line"],
    [0.52, 0, -2, "weapon", "Accessible armament on the reverse bend"],
    [0.58, 0, 9, "boost", "Outside entry: extra speed before the next left"],
    [0.79, 0, 5, "weapon", "Runway pickup with time to settle before launch"],
    [0.91, 0, -2, "boost", "Accessible landing-straight run toward the finish"],
  ],
  "SOLAR ARRAY": [
    [0.065, 0, -2, "weapon", "Accessible opening armament line"],
    [0.15, 0, -2, "boost", "Accessible desert corner acceleration"],
    [0.21, 0, 7, "weapon", "Safer outside setup before the fork"],
    [0.34, -1, -6, "weapon", "Low-route reverse-bend armament"],
    [
      0.37,
      1,
      8,
      "boost",
      "High-route outside entry before the tightening left",
    ],
    [
      0.52,
      0,
      10,
      "boost",
      "Outside right-hand kink acceleration on the natural AI racing line",
    ],
    [0.75, 0, -7, "weapon", "Post-landing inside recovery line"],
    [0.91, 0, 5, "weapon", "Outside armament before the final sector"],
  ],
  WHITEOUT: [
    [
      0.065,
      0,
      -2,
      "weapon",
      "Accessible armament leaving the observatory plateau",
    ],
    [
      0.17,
      0,
      6,
      "boost",
      "Outer glacier approach with room to settle before the basin",
    ],
    [
      0.25,
      0,
      8,
      "weapon",
      "Outside preparation line before the descending spiral",
    ],
    [
      0.515,
      0,
      -2,
      "boost",
      "Accessible basin exit acceleration into the return valley",
    ],
    [0.63, 0, -8, "weapon", "Inside valley armament before the fork decision"],
    [0.785, -1, -6, "boost", "Inner return-fork exit reward"],
    [0.81, 1, 7, "weapon", "Outer weather-station route armament"],
    [0.905, 0, 2, "weapon", "Accessible armament after the uphill merge"],
    [
      0.935,
      0,
      -7,
      "boost",
      "Outer plateau run-in acceleration toward the finish",
    ],
  ],
  MONSOON: [
    [
      0.07,
      0,
      2,
      "weapon",
      "Accessible city approach armament before the long descent",
    ],
    [
      0.26,
      0,
      6,
      "weapon",
      "Outside descent line with time to prepare for the lock",
    ],
    [
      0.43,
      0,
      -2,
      "weapon",
      "Accessible armament inside the curving dry chamber",
    ],
    [0.585, 0, 2, "boost", "Lock exit acceleration toward the pump island"],
    [0.735, -1, -7, "weapon", "Short technical pump-service fork armament"],
    [0.775, 1, 7, "boost", "Faster outer spillway fork acceleration"],
    [
      0.89,
      0,
      -2,
      "boost",
      "Accessible uphill merge recovery toward the high city",
    ],
    [
      0.94,
      0,
      8,
      "weapon",
      "Outside armament before the terraced home straight",
    ],
  ],
  CINDERLINE: [
    [0.065, 0, 2, "weapon", "Accessible geothermal approach armament"],
    [0.145, 0, -8, "weapon", "Inside setup before the first continuous wave"],
    [
      0.4,
      0,
      2,
      "boost",
      "Compression-valley exit acceleration, not a blind crest pad",
    ],
    [0.49, 0, 8, "weapon", "Outer caldera line before the long ridge climb"],
    [0.7, 0, -2, "weapon", "Accessible valley armament after the second wave"],
    [0.79, -1, -7, "weapon", "Inner geothermal return-fork armament"],
    [0.83, 1, 7, "weapon", "Outer basalt-ridge fork reward"],
    [
      0.965,
      0,
      -7,
      "boost",
      "Plateau acceleration after the final wave and merge",
    ],
  ],
  NOCTILUCENT: [
    [0.065, 0, 7, "weapon", "Safer outside line through the opening left"],
    [0.15, 0, 2, "boost", "Accessible right-kink exit before the next left"],
    [0.21, 0, -8, "weapon", "Inside armament before the fork"],
    [0.34, -1, 6, "weapon", "Low-route outside cargo-lane reward"],
    [0.37, 1, -9, "boost", "High-route inside edge in the tightest bend"],
    [0.52, 0, 6, "weapon", "Right-kink armament after the merge"],
    [
      0.62,
      0,
      -9,
      "boost",
      "Landing-runout acceleration toward the upper bridge",
    ],
    [
      0.91,
      0,
      -2,
      "weapon",
      "Accessible landing-straight armament before the finish",
    ],
  ],
};

export function getTrackPickups(track) {
  return Object.entries(layouts)
    .filter(([name]) => name === track.config.name)
    .flatMap(([name, records]) =>
      records.map(([u, branch, lateral, type, purpose], index) => {
        const pad = {
          id: `${name}:${index}`,
          u,
          s: u * track.length,
          branch,
          lateral,
          type,
          width: 8,
          length: type === "boost" ? 22 : 8,
          purpose,
        };
        pad.outline = pickupOutline(pad).map(([x, z]) =>
          pickupPoint(track, pad, x, z),
        );
        pad.center = pickupPoint(track, pad, 0, 0);
        pad.up = track.frame(pad.s, pad.branch).up;
        return pad;
      }),
    );
}

export function pickupPoint(track, pad, x, z, height = 0) {
  const frame = track.frame(pad.s + z, pad.branch);
  return frame.p
    .clone()
    .addScaledVector(frame.right, pad.lateral + x)
    .addScaledVector(frame.up, height);
}

// Both the visible silhouette and pickup contact use this exact chamfered polygon.
export function pickupOutline(pad) {
  const x = pad.width / 2,
    z = pad.length / 2;
  const cut = pad.type === "boost" ? 0.65 : 2;
  return [
    [-x + cut, -z],
    [x - cut, -z],
    [x, -z + cut],
    [x, z - cut],
    [x - cut, z],
    [-x + cut, z],
    [-x, z - cut],
    [-x, -z + cut],
  ];
}

// Continuous centre-path contact: a fast ship cannot tunnel through a short
// socket, and merely crossing the same longitudinal station awards nothing.
export function crossesPickup(track, pad, previous, current, branch) {
  if (branch !== pad.branch) return false;
  const polygon = pad.outline;
  const dx = current.x - previous.x,
    dz = current.z - previous.z;
  let enter = 0,
    leave = 1;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const ex = b.x - a.x,
      ez = b.z - a.z;
    const distance = ex * (previous.z - a.z) - ez * (previous.x - a.x);
    const rate = ex * dz - ez * dx;
    if (rate === 0) {
      if (distance < 0) return false;
    } else if (rate > 0) enter = Math.max(enter, -distance / rate);
    else leave = Math.min(leave, -distance / rate);
    if (enter > leave) return false;
  }
  const height =
    (previous.x + dx * enter - pad.center.x) * pad.up.x +
    (previous.y + (current.y - previous.y) * enter - pad.center.y) * pad.up.y +
    (previous.z + dz * enter - pad.center.z) * pad.up.z -
    2.2;
  // Same vertical road-contact window used by Race, not a column through bridges.
  return height > -3 && height < 1.2;
}
