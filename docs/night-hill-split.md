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

## Browser acceptance

Frozen source `bad0f9cdd8750cb54da8f13db7e8177b4d850201`; built JS SHA-256 `26bfe0d23acb0141e6cacfe89bc7c928a410c8521effca37f799e7eccd109c4e`. LOW-RES remained the default.

| Actual input | Class | Fork         | Minimum shield | End progress |
| ------------ | ----- | ------------ | -------------- | ------------ |
| Keyboard     | C1    | Lower tunnel | 100            | .53665       |
| Keyboard     | C3    | Upper hill   | 100            | .53845       |
| CDP touch    | C2    | Lower tunnel | 87.7           | .54287       |
| CDP touch    | C2    | Upper hill   | 93.9           | .53904       |

All four runs started at the grid in the actual application. An external feedback pilot sent keyboard or real CDP touch events using read-only telemetry; it did not assign bodies, progression, controls or internal AI. Every-frame checks confirm earned fork identity through the separated section, forward progression, zero recovery snaps, physical flight through the following gap and a grounded landing. First-person view was activated through input during each run. All four runs had zero JavaScript/HTTP errors. The controlled ordinary/boosted all-class matrix is CPU coverage, not a claim of six browser matrix cells.

### Visual fixtures and retained evidence

The 36 stationary seeded captures comprise 24 desktop and 12 mobile chase/first-person views of both routes, covering tunnel entry/interior, upper crossing, crest and reversed merge. These are geometry/camera inspection, not driving proof. The lower route has tunnel skin; the upper route remains open to the sky. Branch-specific acoustics were checked through predicate tests and caller inspection, not a subjective browser listening test.

Private traces, input/frame logs, captures and `acceptance-summary.json` are retained under `/var/tmp/belmondo-night-split-qa/`. Failed external-pilot runs are retained separately: a start-input synchronization failure, stale CDP brake release, and upper-route landing failures before pilot gain/pace correction. No product geometry or physics changed during browser QA. Each owned browser and the QA servers were closed; the shared Batty browser was untouched.
