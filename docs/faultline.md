# FAULTLINE

Fifth circuit: an excavated green highland, with pale quarry benches, a western mineral-transfer hall, a cross-pit jump, low extraction shelves and a planted reclamation climb. Nine working districts, haul lanes, a bucket-wheel excavator and a separate elevated conveyor give the excavation a readable scale. The circuit has no fork.

## Driving

The physical ramp rises 60 world units before a 299-unit horizontal opening (about 261 metres at the game's craft scale). A straight, 76-unit-wide receiving apron lies about 81 units below the lip. Pitch and finite TURBO change the ballistic trajectory; no added lift, steering assistance or landing repositioning is applied. Tested flights land before the receiving straight ends, including held nose-down/up across all craft and classes. The outgoing sweep has a sampled minimum physical horizontal radius above 150 world units.

Two optional boosts and four weapon sockets sit outside the jump corridor. The mandatory flight does not require either boost or TURBO.

Recovery distinguishes forward airborne travel inside an authored receiving straight from lost racers. Horizontal velocity and displacement must both point forward. Sideways loss, stalling, reversal, passing the receiving straight and falling below the road retain recovery. Presentation-only post-finish motion interpolates continuously across missing decks; it does not alter the frozen race result.

## Identity and environment

`faultline-1-finish-end` is inserted after Solar Array. The previous seven layout IDs and record keys remain unchanged. Version-1 progression retains its previously unlocked layouts per class without awarding wins or trophies. New progression follows the displayed course order.

Visible terrain and collision queries share the worker-serialized heightfield. Graded road shelves, district pads and both finish spectator footprints belong to that surface. The missing road remains open over the deep pit. Quarry art is spatially instanced; the other circuits retain their existing environment paths.

## Verification

- Parameterized ballistic tests cover all three craft, all three classes, three held pitch positions and finite TURBO, plus failed-flight recovery boundaries.
- Full ordered-lap player and eight-ship NPC simulations exercise the production integrator and terrain. Player fixtures supply only ordinary inputs.
- Existing course, storage, record, camera, advertising, spectator and resource-lifetime contracts cover the expanded registry.
- Desktop and mobile WebGL captures inspect the approach, flight, receiving apron, transport hall and reclamation landscape. Geometry audits check scenery volumes against the banked racing corridor and worker hydration against direct construction.

The Node suite passes 1,118/1,118 cases without skips. Exact frame comparisons preserve the previous seven courses' geometry at 42,000 sampled frames. Nine complete player races cover 36 laps; final eight-ship packs finish all three classes without rail contact or recovery.

At 844×390 LOWRES, five representative views peak at 185,492 rendered triangles and 510 draw calls on FAULTLINE, versus 129,870/290 on Vesper and 84,198/268 on Cinderline. The larger open excavation intentionally costs more scenery than enclosed circuits. Resource-cycle checks retain stable geometry/texture counts when rebuilding the same circuit.

Software-rendered frame timings compare construction and scene cost, not physical-phone FPS. FAULTLINE's farther view retains opponent visibility across the excavation.
