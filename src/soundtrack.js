export const soundtrack = [
  {
    name: "BELMONDO — Phase Index",
    url: "/music/phase-index.mp3",
  },
  {
    name: "BELMONDO — Glass Current",
    url: "/music/glass-current.mp3",
  },
  {
    name: "BELMONDO — Ion Drift",
    url: "/music/ion-drift.mp3",
  },
  {
    name: "BELMONDO — Vector Bloom",
    url: "/music/vector-bloom.mp3",
  },
  {
    name: "BELMONDO — Arc Relay",
    url: "/music/arc-relay.mp3",
  },
  {
    name: "BELMONDO — Chrome Tension",
    url: "/music/chrome-tension.mp3",
  },
  {
    name: "BELMONDO — Static Orchard",
    url: "/music/static-orchard.mp3",
  },
  {
    name: "BELMONDO — Signal Teeth",
    url: "/music/signal-teeth.mp3",
  },
  {
    name: "BELMONDO — Lattice Runner",
    url: "/music/lattice-runner.mp3",
  },
  {
    name: "BELMONDO — Deep Circuit",
    url: "/music/deep-circuit.mp3",
  },
  {
    name: "BELMONDO — Helix Pressure",
    url: "/music/helix-pressure.mp3",
  },
  {
    name: "BELMONDO — Afterimage",
    url: "/music/afterimage.mp3",
  },
];

// Fisher–Yates bags: every track once, with no repeat at the seam.
export function* createShuffleBag(count, random = Math.random) {
  if (!count) return;
  let previous = -1;
  while (true) {
    const bag = Array.from({ length: count }, (_, index) => index);
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (count > 1 && bag[0] === previous) {
      const j = 1 + Math.floor(random() * (count - 1));
      [bag[0], bag[j]] = [bag[j], bag[0]];
    }
    for (const index of bag) {
      previous = index;
      yield index;
    }
  }
}
