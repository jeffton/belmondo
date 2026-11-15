# Kaiseki Coast: headland bore and inlet flyover

The lower route descends past occupied waterfront frontage into a sustained, enclosed curved bore through the headland. The upper route climbs onto a high open flyover above an excavated sea inlet. They have independent horizontal alignments, elevation profiles and turning directions, not a shared spline with adjacent lane offsets. The bore uses grounded rock, dark lining, chamfered roof, ribs and sparse warm lamps; the flyover keeps its open coastal horizon.

Both routes retain one weapon opportunity. Shops occupy the approach and shoreward exit rather than the bore or exposed bridge. A broad common merge apron gives the different approaches room to settle before the ravine turn. BORE/SKYWAY destination signs identify the choice before separation; the central board sits above both full road envelopes on grounded outboard supports.

## Physical routes

The independent interior lies at stations `.315–.415`, between the existing fork necks. World-space cubic Bézier segments use shared tangents at interior knots and match the accepted neck directions at their ends. Arc-length sampling feeds the existing station-indexed route arrays; road tangents and physical distance metrics are calculated from those actual points.

Across stations `.345–.390`, routes remain more than 250 world units apart horizontally and more than 100 vertically. Maximum separation is approximately 370 horizontal and 149 vertical units. Their driving headings differ by more than 25 degrees through substantial parts of the interior. The lower sector is approximately 1,809 world units; the upper approximately 1,871. Physical length alone does not determine timing.

The fork stations `.285–.445`, initial necks, finish origin and layout ID are retained. Full widths and actual terrain are used for collision bounds, projection, physical gates and scenery clearance. There are no movement overrides, speed bonuses, AI controller changes or new checkpoint rules. Six unaffected circuits retain their accepted physical road/rail hashes.

## Gameplay evidence

Pickup-free stock drivers cover all three craft, classes and branches from the normal grid: 18 legal merges, no rail contacts, recoveries, stalls, wrong branches or lost gates. Largest paired sector difference: 2.18%.

INDUCTION sector seconds, bore / flyover:

| Craft   |   Bore | Flyover |
| ------- | -----: | ------: |
| Striker | 10.687 |  10.728 |
| Raptor  | 10.623 |  10.633 |
| Wraith  | 12.050 |  12.311 |

A separate pilot retains player ID 0 and uses ordinary throttle, steering and analog airbrakes without changing position, velocity, branch or gate state. All 18 solo craft/class/route runs merge with full shield and no rail contact, recovery, stall or wrong branch; largest paired difference is 2.55%. The explicit 4% regression tolerance is a design target, not an in-game restriction or a claim about optimal human times.

Natural seven-NPC packs earn 21 legal merges across all classes without rail contact, recovery, stalls or wrong branches. Another 18 ordinary-input player runs include the full opposing grid: all merge with correct gates and no rail contacts or recovery. Genuine ship contacts occur; contact-event counts and displaced-racer-step proxies are not interchangeable. Traffic timing is not used as clean-route fairness evidence.

Eighteen TURBO approaches, covering every craft/class/route, also earn the merge with full shield, no rail contact and no recovery.

## Rendering and records

Before/after videos and screenshots use uninterrupted production physics after a labelled stationary pre-fork fixture. Desktop and portrait captures cover approach, the actual disconnected nose, both interiors and the merge. These are server/SwiftShader render checks, not physical-device performance or full human-driven touchscreen races. Environment tests raycast the complete racing widths plus margins and 26 units of overhead space; roofs and grounded feet are real geometry.

The actual nose is detected from disconnected collision bounds, not the start of the configured split interval. Captures at 60 and 20 units before that nose show the correct destination order. A right-offset portrait chase view can crop the opposite label at those final moments; both words and arrows are legible earlier in its continuous approach. This is evidence for an advance choice cue, not a claim that every offset shows both labels simultaneously.

Existing local records and progression remain stored under the original layout identity. Historical Coast times use different geometry and cannot be compared directly with fresh laps. The shared station-based ranking system remains intact; it is not a prediction of remaining travel time inside alternative routes.
