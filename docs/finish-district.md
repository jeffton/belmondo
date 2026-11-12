# Finish straight

`config.sections.finishStraight` is an unwrapped normalized interval crossing the physical `s=0` timing seam. `buildFinishDistrict(scene, track, textures, environment)` fills both sides of that entire straight with grounded spectator terraces. `getFinishDistrictLayout(track)` exports their complete oriented footprints. Kaiseki shop districts use shared geographic reservations outside the spectator zone.

A worn checkerboard is embedded in the road along the complete straight, including both sides of the timing seam. It has no arrow, pad frame or illumination that could suggest a pickup. The finish portal is exactly at `track.frame(0)`; approach boards sit 300, 160 and 60 metres before it. The starting signal remains a separate structure.

## Geometry and crowds

Terraces have approximately 48-metre cullable sections with service gaps and nine-metre shoulders. Foundations intersect the visible terrain and clear its sampled maximum. Portal footings sit at ±(road half-width + 4 m), each 2.8 × 4 m.

- **Kaiseki:** civic steps and transit roof blades.
- **Solar:** sandstone banks and industrial shade fins.
- **Noctilucent:** dockside terraces and loading-hall balconies.

Structure boxes share spatial/material instance batches. Each crowd card depicts four original pixel-art spectators on crossed planes. A vertex shader animates cheering without uploading transforms or redrawing textures; `update(elapsed)` changes one uniform. World owns scene disposal.

## Acceptance

`tests/finish-district.test.js` checks complete foundations, road clearance, gallery reservations, the physical timing portal, actual checker-mesh coverage along the full straight, crowd triangle cost and stable instance uploads. GPU acceptance covers approach/finish visibility at speed, chase/cockpit, desktop/mobile, crowd rendering and starting-signal sightlines.
