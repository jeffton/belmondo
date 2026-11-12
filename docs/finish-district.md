# Finish straight

`config.sections.finishStraight` is an unwrapped normalized interval crossing the authored geometry seam. The timing plane is its downstream endpoint, `track.finishS`. `buildFinishDistrict(scene, track, textures, environment)` fills both sides of that entire straight with grounded spectator terraces. `getFinishDistrictLayout(track)` exports their complete oriented footprints. Kaiseki shop districts use shared geographic reservations outside the spectator zone.

A worn checkerboard covers the complete straight. A crisp transverse stripe and the single dynamic countdown/lap/FINISH board share `track.frame(track.finishS)`. Distance boards sit 300, 160 and 60 station metres upstream. The player grid starts 18 station metres upstream, with nine-metre grid spacing.

## Geometry and crowds

Terraces have approximately 48-metre cullable sections with service gaps and nine-metre shoulders. Foundations intersect the visible terrain and clear its sampled maximum. The dynamic board provides the timing arch; spectator architecture stays outside the racing corridor.

- **Kaiseki:** civic steps and transit roof blades.
- **Solar:** sandstone banks and industrial shade fins.
- **Noctilucent:** dockside terraces and loading-hall balconies.

Structure boxes share spatial/material instance batches. Each crowd card depicts four original pixel-art spectators on crossed planes. A vertex shader animates cheering without uploading transforms or redrawing textures; `update(elapsed)` changes one uniform. World owns scene disposal.

## Acceptance

`tests/finish-district.test.js` checks complete foundations, road clearance, gallery reservations, the shared timing-stripe station, actual checker-mesh coverage along the full straight, crowd triangle cost and stable instance uploads. GPU acceptance covers approach/finish visibility at speed, chase/cockpit, desktop/mobile, crowd rendering and starting-signal sightlines.
