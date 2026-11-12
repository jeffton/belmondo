# Legacy v4 world acceptance

CPU candidate: `d3f8eb8` routes on `55484d7`, with AI `724abc8`, fork geometry `ed9de33`, Coast launch `0d0509a`, and gallery basement grading. Not a deployment or native-input/visual approval.

## Physical contracts

- Coast: 11.032 km; Solar: 11.325 km; Night: 11.203 km.
- Layout IDs: `coast-4`, `solar-4`, `noctilucent-4`. No record migration.
- Existing jump, runway, tunnel and split windows remain. Coast's ramp is 12 m; its start, length and gap are unchanged.
- Night retains its 260 m grade-separated main crossing, 45 m over/under hill fork, lower tunnel and opposite-side merge. Its final descent reaches 43.5°.
- Gallery terrain follows the actual per-bay basement slab plane. The emitted occupied floors are raycast, not inferred from metadata alone.

## CPU checks

- 108 genuine grid-start, full-lap Race + rendered-terrain simulations: every legacy course, craft, class, intended fork, ordinary/TURBO. Every lap earns all gates with zero recovery, shield above 50, missing-deck flight and physical landing.
- Genuine seven-NPC grid fields choose and merge both odd/even routes in all classes: production-v3 Coast/Solar and all three redesigned routes. No branch seeding or body repositioning after the grid.
- 27 Coast finite-TURBO jump runs cover all craft/classes and held pitch −1/0/+1. All land inside the aligned runway with shield 100 before the unchanged three-second off-road guard.
- Complete emitted Environment/City/Finish/Coast Flagship geometry clears dense samples of both driving corridors. Gallery floor rays, district full-triangle corridor tests, exact foundation/terrain checks, advertising, pickups, ravines, tunnels and bridge supports pass.
- Old production configuration fixtures remain explicit regression inputs. V4 output hashes, bend radii and rhythm facts describe the authored routes, not preservation of the replaced geometry.

Full-suite residuals on this isolated pre-Monsoon integration base: six Monsoon air-advantage assertions, its stale fixed rising-normal probe and 150 m radius guard; three legacy NPC-repeat tests retain a 100-second budget for the shorter layouts. Dedicated grid/fork/full-lap acceptance passes. No physical guard or failed assertion is suppressed.

## Split timing and experience

Striker, production NPC controls, real terrain, ordinary throttle with physical steering/airbrakes/service brake. Times interpolate the actual split entry and merge; every run has zero recovery.

| Course | Class 1 lower / upper | Class 3 lower / upper |
| ------ | --------------------- | --------------------- |
| Coast  | 13.523 / 13.330 s     | 9.758 / 9.542 s       |
| Solar  | 14.389 / 14.827 s     | 10.304 / 10.587 s     |
| Night  | 12.388 / 12.536 s     | 8.846 / 8.953 s       |

Coast/Solar have only 12 m vertical separation and lateral divergence, without a sheltered/open distinction. They meet neither the requested strongly different split experiences nor a final gameplay release gate. Night preserves its distinct over/under experience. Completion tests do not establish that airbrakes are necessary for the fastest clean lap.
