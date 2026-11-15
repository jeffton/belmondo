# Split routes

## Driving choices

**Whiteout:** the open snowbridge crosses above a separate blue-ice gallery. Routes exchange sides with 55 world units between their crossing decks. The ridge route has an exposed crest; the ice route has a sheltered alignment beneath a physical roof. Both carry one weapon pad. See [Whiteout verification](whiteout-split.md).

**Kaiseki Coast:** independent alignments take the lower route through a sustained curved headland bore and the upper route onto a high, open inlet flyover. Their horizons, turning directions and elevation journeys differ. A broad common apron settles both approaches before the ravine turn. Both carry one weapon pad. See [Coast verification](coast-split.md).

**Cinderline:** the lower route threads a narrower continuous basalt gorge through opposing bends. The wider upper route follows a banked caldera-rim arc with an open horizon. Both carry one weapon pad; neither needs a compensating boost.

Monsoon retains its pressure conduit/reservoir ascent, Solar Array its industrial arcade/collector field, Noctilucent its grade-separated crossover and Vesper its market/rooftop split.

## Geometry and race rules

Each carriageway is a physical road surface with its own tangents, distance metric, width, banking and collision bounds. Coast's interior uses independent world-space cubic Bézier paths between preserved necks. Other courses use authored branch displacements and height profiles. None adds steering forces or moves a craft onto its racing line.

Routes share a base station and 32 ordered physical timing gates. There is one split interval per circuit, not a general route graph. Ranking inside a split measures earned station progress, not estimated remaining driving time. Each body must physically earn its own branch's gates and merge.

AI branch preference remains racer-ID parity. Body integration, AI controls, ship contacts, jump physics, recovery and progression are unchanged. Layout IDs and on-device records remain intact. Historical Whiteout/Coast/Cinderline times were set on different fork geometry and are not directly comparable with fresh laps.

## Verification

`tests/creative-split-racing.test.js` checks 54 pickup-free grid-start traversals across Whiteout, Coast and Cinderline: all three craft, classes and branches. It checks legal route choice, sequential physical gates, merge completion, contacts, recoveries and stalls. The explicit 4% sector-time tolerance is a design-regression target, not a gameplay speed limit or a claim about optimal human laps.

INDUCTION stock-driver sector seconds, lower/inner versus upper/outer for Coast and Cinderline:

| Circuit       |         Striker |          Raptor |          Wraith |
| ------------- | --------------: | --------------: | --------------: |
| Kaiseki Coast | 10.687 / 10.728 | 10.623 / 10.633 | 12.050 / 12.311 |
| Cinderline    |   7.928 / 8.014 |   7.430 / 7.369 |   9.411 / 9.705 |

`tests/fork-diagnostics.mjs` writes reproducible road-only measurements; `tests/fork-pack-diagnostics.mjs` measures natural grid traffic. `tests/coast-player-input.test.js` separately checks an ordinary-input pilot without assigning NPC identity or changing body state. Geometry/environment tests cover real route divergence, joined noses, full road-envelope clearance, roofs, terrain, equal rewards and independent projection. Accepted physical hashes protect the six circuits outside Coast.

Before/after renderer captures use actual production physics from a labelled stationary pre-fork fixture. They cover desktop and portrait approaches, decisions, both branches and merges; captured gates are checked against the actual finish station. Course-specific reports describe their measurements and evidence limits. Headless SwiftShader is not a physical-phone GPU benchmark, and stock-driver tests do not establish human-optimal times or complete armed-race balance.
