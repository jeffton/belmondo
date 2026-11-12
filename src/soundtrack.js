export const soundtrack = [
  {
    name: "BELMONDO — Slipstream Glass",
    url: "/music/eleven-v2.5/slipstream-glass.mp3",
    sha256: "ca7af6812ade5dff7e44f947639c9196bc96ef7c7862aec10019b94243968b50",
  },
  {
    name: "BELMONDO — Recursive Blue",
    url: "/music/eleven-v2.5/recursive-blue.mp3",
    sha256: "9d403f204dd97cdc57af79b948f44ddd72912300a61266693593fc5bb6eaeb6b",
  },
  {
    name: "BELMONDO — Torque Syntax",
    url: "/music/eleven-v2.5/torque-syntax.mp3",
    sha256: "7388423fa90677c1829299811c841798273ba9ab6b025c6101d0e9ebe2b579f9",
  },
  {
    name: "BELMONDO — Delta Pressure",
    url: "/music/eleven-v2.5/delta-pressure.mp3",
    sha256: "9a8753f9e4c73e3de80b6e615c62c9d8bb8383f4e8a1e77d0edf14560a99cc0a",
  },
  {
    name: "BELMONDO — Spectral Lattice",
    url: "/music/eleven-v2.5/spectral-lattice.mp3",
    sha256: "e4ae8992d4b60232d168142d7e25c3fad42729dda98c1ee0f0665902cbeab57b",
  },
  {
    name: "BELMONDO — Tidal Memory",
    url: "/music/eleven-v2.5/tidal-memory.mp3",
    sha256: "4b32953df02af3ea907772620656b6c7b13b261ba817bfa0729a09d860799956",
  },
  {
    name: "BELMONDO — Relay Bloom",
    url: "/music/eleven-v2.5/relay-bloom.mp3",
    sha256: "1ec8da104c609f1aaf8fa4a6f75dd03fd8b1c873094ae0235addf4384e15fa9d",
  },
  {
    name: "BELMONDO — Ceramic Phase",
    url: "/music/eleven-v2.5/ceramic-phase.mp3",
    sha256: "b1ba08794e2541ad7ad7afd1b1881b6625814c5e8bf166cd777851549f8eb344",
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
