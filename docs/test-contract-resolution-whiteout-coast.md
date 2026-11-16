# Whiteout and historical Coast test contracts

## Whiteout crossing

The original generic 150m bend-radius check predates the accepted snowbridge/ice-gallery redesign. Its minimum sampled radius is 131.86077m, on the upper crossing at station 0.806667. The unchanged base road has a 157.56889m minimum. A tighter radius alone does not establish a driving defect: ships can brake and the fork was designed as a technical route choice.

Retain the 150m quota outside the redesigned fork, including its unchanged base alignment. Do not replace it with a 130m quota chosen to fit the measured minimum. Validate the redesigned fork through physical driving, its existing continuous-deck and tangent-aligned-join checks, separate deck projection/rails, and clearance tests.

Expand the independent player-control pilot to all three craft, all three classes and both routes: 18 complete laps, each with all 33 sequential gates, zero rail contacts, zero recoveries and full shields. Each pair remains within the existing 4% competitive-time envelope; measured maximum is 1.404%. The pilot uses ordinary bounded stick, throttle and airbrakes. Stick demand accounts for craft handling, and corner speed respects the craft's physical stick-yaw budget; it does not alter body physics, lock routes or teleport. The separate existing 18-case TURBO approach matrix also passes with clean physical merges.

## Historical Coast traffic

The exact historical v3 Coast fixture reproduces NPC 5 selecting route +1 rather than its odd-ID preference -1 in class 0, while airborne at the split entrance (station 0.325325). All seven ships still physically merge without recovery; both roads are used. Production AI treats parity as a steering preference, then follows the road physically reached. Projection and traffic contacts, not an ID assignment, determine the actual branch.

Separate the two contracts:

- In isolation, real AI steering from the ordinary grid must select its intended odd/even route in every class.
- In traffic, both branches must be driven; every ship must retain its selected disconnected road, survive, earn consecutive physical timing gates and clear its own merge without rescue.

Run both contracts against historical Coast/Solar and current Coast/Solar/Noctilucent. This preserves the meaningful fork-driving regression without requiring traffic to override physical collision outcomes to maintain an ID schedule.

No game source, geometry, physics, records or progression changes are required.
