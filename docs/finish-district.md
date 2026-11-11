# Finish district

`buildFinishDistrict(scene, track, textures, environment)` adds scenery only. `update(elapsed)` advances a shared crowd shader uniform; it does not upload instance transforms or redraw textures. World owns normal scene disposal.

The finish portal is exactly at `track.frame(0)`, matching the checker and timing line. Approach boards sit 300, 160 and 60 metres before it. The starting signal at +42 metres remains a separate structure.

## Foundations

`getFinishDistrictLayout(track)` exports oriented corners, centre, right/forward axes and dimensions. `environment.heightAt(x, z)` must sample the rendered terrain. Each slab extends below its sampled minimum and above its sampled maximum; no terrain or course edits are performed here.

| Centre u | Side | Width × length | Inner shoulder |
| -------- | ---- | -------------- | -------------- |
| .956     | +1   | 22 × 68 m      | 9 m            |
| .993     | −1   | 26 × 52 m      | 9 m            |
| .012     | −1   | 18 × 38 m      | 13 m           |

Kaiseki's reserved galleries at .925–.983/−1 and .008–.102/+1 stay separate. Foundation tests check their complete footprints, not just centres. Portal footings sit at ±(road half-width + 4 m), each 2.8 × 4 m.

## Course identities

- **Kaiseki:** civic steps, staggered transit roof blades and a ticket pavilion.
- **Solar:** sandstone spectator banks, test-apron shade fins and a service hangar.
- **Noctilucent:** open terminal quay, occupied loading-hall balcony and dock hall.

Spectators share one low-poly geometry and material, instanced separately per structure for culling. Their raised arms sway in the vertex shader.

## Acceptance

`node --test tests/finish-district.test.js` checks terrain intersection, complete scenery clearance, reserved galleries, exact finish alignment and instance-upload behaviour. GPU acceptance must inspect each final approach and finish at C3 speed, chase/cockpit, desktop/mobile, including the crowd shader and starting-signal sightline.
