# Solar mountain

The rock flown through on Solar Array is `bored-mountain-mass` in `src/course-geography.js`. It is a separate bored volume, not the terrain heightfield or painted panorama. Live `b861d65` and baseline `8b19e9d` share its seven-point exterior profile.

Solar's exterior has 25 contour points with lateral ridges, gullies and offset portal strata. The four inner tunnel points, 22 m void roof, grounded feet, route, collision surfaces and terrain resolution are unchanged. Night retains its existing mountain.

## CPU acceptance

Compared with `8b19e9d`:

- All seven terrain mesh buffers are byte-identical. All six non-Solar geography mesh buffers are byte-identical.
- Solar rock: 1,778 → 4,694 triangles; attribute storage 234,696 → 619,608 bytes (+376 KiB). One mesh/material and the existing strata texture; no extra draw or texture allocation.
- Downward rays across the real central exterior find three ridges instead of one extruded peak.
- Triangle clipping checks emitted rock faces against the complete banked flight corridor, both split branches, portals and overflight regions. Grounding and open-roof tests also pass.

The baseline/candidate buffer comparison is saved privately in `/var/tmp/belmondo-solar-mountain-comparison.json`.

## Pending visual acceptance

No browser/GPU inspection or device performance claim is included in CPU acceptance. Run `tests/solar-mountain.browser.mjs` only after central exclusive GPU grant, against separate Vite servers for baseline and candidate:

```sh
SOLAR_MOUNTAIN_GPU_GRANTED=1 SOURCE_URL=http://127.0.0.1:PORT OUTPUT_DIR=/var/tmp/solar-mountain-before node tests/solar-mountain.browser.mjs
```

Repeat against the candidate with `OUTPUT_DIR=/var/tmp/solar-mountain-after`. The baseline source is the detached worktree `/var/tmp/belmondo-solar-mountain-baseline` at `8b19e9d`; candidate is `/var/tmp/belmondo-solar-mountain`.

The harness uses actual World/Race rendering at matched physical stations: 180, 70 and 15 m before the tunnel, and 25/180 m inside it. Capture chase and first-person, desktop 1280×800 and mobile-framed 844×390, with the default low-resolution renderer. Inspect the actual tunnel mountain's silhouette, rock depth, open portal and natural faceting. Compare draw calls, triangles, geometry and texture counts from `report.json`. These posed race views are visual fixtures, not native-input driving or physical-device benchmarks.
