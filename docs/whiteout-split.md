# Whiteout: snowbridge and blue-ice gallery

The fork exchanges sides around a grade-separated crossing. The upper snowbridge follows an exposed crest above the lower ice gallery; the lower road has a clear, sheltered curve beneath an actual ice roof. Both routes offer a weapon, not a boost-versus-weapon tradeoff. The descending basin spiral, base road, fork stations and layout identity are preserved.

The crossing has 55 world units of deck separation. Each route retains independent rails and road projection through the overlapping footprints. The two noses remain joined, level and tangent-aligned. Scenery leaves at least 26 world units above the complete racing envelope; the gallery soffit is 30 units above its road. There are no pillars through the lower route. Routes share the existing ordered physical timing gates; crossing proximity cannot award another route's progress.

## Timing and driving

Baseline: `78d038b`. Eighteen pickup-free traversals start from the normal grid using production AI and body physics: three craft, three classes, both branches. All choose their intended route, earn six sequential approach/merge gates and clear the fork without rail contact, recovery, stalls or wrong-branch steps. The largest paired sector-time difference is 2.73%.

INDUCTION sector seconds:

| Craft   | Snowbridge | Ice gallery |
| ------- | ---------: | ----------: |
| Striker |      5.370 |       5.481 |
| Raptor  |      5.049 |       5.111 |
| Wraith  |      6.442 |       6.618 |

A separate conservative pilot uses ordinary player steering, throttle, airbrakes and pitch through complete laps: INDUCTION 7.067 / 7.033 seconds, SINGULARITY 5.292 / 5.267 seconds. Both branches finish with zero rail contact or recovery, full shield and all 32 ordered gates. This driver slightly prefers the ice gallery; stock AI slightly prefers the bridge. These are measured drivers, not optimal human lap times.

An additional 18-case TURBO matrix uses the normal weapon action before the fork for every craft/class/branch and earns the merge without rail contact, recovery or missing gates.

Natural seven-NPC packs in all three classes produce 21 legal merges without rail contacts, recovery, wrong branches or elimination. Ordinary ship-to-ship contact remains possible; displacement-step proxies are not collision counts.

## Verification and records

Crossing tests cover full rails, projection ownership, smooth joins and the actual side exchange. Environment tests cover complete road widths and 26-unit overhead envelopes across both decks, real roof coverage, open upper sky and grounded ice faces. Accepted road/rail hashes protect the other six circuits.

Before/after desktop and portrait screenshots and physics-driven videos cover approach, decision, entry, crossing, exit and merge. Every captured gate is checked relative to the actual finish station. Render tests use headless SwiftShader, not physical-phone hardware. The labelled pre-fork stationary fixture is followed by uninterrupted production physics/AI; it is not a full touchscreen-driven race.

The authored bridge/ice scenery uses three static draws and 2,440 triangles, with no new textures or assets. Matched desktop captures peak at +4 scene draws and +2,908 triangles versus baseline; visibility and road geometry also affect those totals. Median headless draw submission is 1.6 ms desktop and 1.3–1.4 ms portrait. These are server/SwiftShader samples, not phone GPU measurements.

Existing layout IDs, on-device records and progression remain intact. Historical Whiteout times were set on different fork geometry and are not directly comparable with fresh laps. No physics, AI controller, recovery, progression or record-storage behavior changes are part of this design.
