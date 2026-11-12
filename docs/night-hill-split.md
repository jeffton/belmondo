# Night hill split

The Night fork occupies the existing progress window .28–.45. Route -1 passes through a bored hill; route +1 climbs above it, crosses the tunnel route and joins from the opposite side. Route identity remains fixed as its physical side changes. The record layout is `noctilucent-3`.

## CPU geometry

- Split window: 1,033 m; enclosed hill passage: 304 m (.34–.39).
- Fork crossing: .365, 45 m deck separation.
- Minimum plan radii: lower 150.79 m, upper 172.59 m.
- Maximum absolute grades: lower 7.21°, upper 15.66°.
- The upper truss has 11 grounded supports, excluded around the lower-road envelope.
- Original whole-course crossing: .232295/.767042, 124 m separation.
- Home straight, descent and .46–.555 runway/.462 ramp/.48 jump retain their geometry.

Only physical entry/exit seams join the roads. Local ordering determines seam edges, clipping, rail faces and splitter contacts. The elevated crossover has independent full rails. Tunnel skin and music acoustics use the selected lower branch.

AI selects an intended fork while its entry is still connected. Upper-fork AI reads crest curvature and brakes through the ordinary control integrator; player physics and inputs are unchanged.

## CPU acceptance

`node --test tests/night-hill-split.test.js` covers both fork choices from .26, all three classes, ordinary and boosted approaches, locked physical route selection, merge and the following jump. It requires zero recoveries, retained shield, actual gap flight and an earned landing.

Geometry tests raycast the complete hill/truss meshes across both road widths, verify land clearance and grounded mountain/support feet, and test wrong-level projection, reversed seam ordering, separate rails and branch-specific tunnel membership. Existing whole-course crossing and descent tests remain applicable.

## GPU acceptance (pending)

Use a frozen build, LOW-RES default, desktop keyboard and actual CDP touch input. Do not replace input driving with AI, direct body placement, progression writes or model-only proofs.

1. Drive Night C1 with keyboard through each fork, from the common approach, beyond merge and the following jump. Repeat the upper route at C3 with a boosted approach, using normal braking. Record input and per-frame position/contact/branch/shield/recovery telemetry.
2. Repeat both fork choices at C2 with real touch controls. Require sustained movement, correct route identity until the physical merge, gap flight and landing.
3. Inspect chase and first-person views for the lower portal, tunnel interior, undercrossing, upper crest/supports, opposite-sided merge and jump run-up. Check full-width clearances and nearby scenery, not just centerline snapshots.
4. Confirm tunnel music echo and roof/ribs only on the lower fork; upper road stays open to the sky. Check pause/resume and both sides of the tunnel boundary.
5. Verify the original whole-course crossing/descent, start/finish, mobile UI and render budget against the accepted baseline. Inspect the physical seam and rail transitions in motion.
