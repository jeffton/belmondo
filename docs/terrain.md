# Course geography

- **Kaiseki Coast:** coastal headlands, graded streets, grounded shopping terraces and a deep sea gap beneath the signature jump.
- **Solar Array:** a high sandstone pass, solar shelves and a bored mountain tunnel. A separate faceted rock volume forms the mountain and portals while preserving an open racing void.
- **Noctilucent:** reclaimed freight districts, canals and a high trussed crossing above a physically open lower route.

`src/terrain.js` supplies spatially chunked land meshes, `heightAt(x, z)` and `sweepSurface(from, to, clearance)`. Height queries and swept contact use the same Float32 heights and triangle diagonals as rendering. Sweeps return `null` or `{ fraction, point, normal }`; clearance is the vertical distance from the racer origin to its lower hull. Land contact is distinct from road hover, checkpoints and pickups.

Earthwork cells are constrained against every active deck's actual banked plane, including both split routes. Each affected mesh corner follows the deck normal rather than a flat centreline ceiling. Waterfront basement reservations protect existing shop and ferry-terminal floors. Bridge piers occur where the course crosses water or separated elevated routes; the jump corridor has no piers. Upper-bridge sections do not raise earth through the lower road. `supportClearAt(u, branch)` rejects any pier/outrigger envelope crossing a lower deck. Terrain extent follows actual route bounds while retaining 23-metre cells; road and scenery sampling use physical distances. Finish architecture consumes the terrain surface without modifying it.

The racing surface is a worn industrial induction guideway: broad streaked plates, recessed service shoulders and cast impact blocks outside the physical wall. Longitudinal highway stripes and car-racing curbs are absent. Directional chevrons are reserved for functional boost pads; fork warnings remain separate.

The OpenAI-image reference in [art/terrain-geography-reference.png](art/terrain-geography-reference.png) guides landform and foundation design; it is not a gameplay screenshot. Generated with `gpt-image-2.5-flare` on 11 November 2026.

CPU checks cover real mesh/height agreement, complete route clearances, open jump ravines, foundation footprints, transformed rock grounding and swept contact through intermediate terrain ridges. Visual acceptance requires full-route chase/first-person inspection and actual keyboard/touch runs; software-renderer timings are not mobile-device measurements.
