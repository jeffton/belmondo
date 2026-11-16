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

## Visual evidence

CPU acceptance does not establish visual quality or device performance. The historical screenshot harness captured posed views around the tunnel; it had no visual pass/fail oracle and is excluded from the maintained regression suite. `solar-mountain.test.js` retains corridor, portal and grounding checks. Current rendered gameplay is exercised by the browser smoke tests.
