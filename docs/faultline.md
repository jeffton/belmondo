# FAULTLINE

Fifth circuit: a reclaimed highland megaquarry. The upper-rim esses lead to two independent alignments: the elevated **BENCH**, exposed above the excavation, and the descending **BORE**, enclosed by copper-coloured mineral walls. A shared launch crosses the central pit. Lower extraction shelves weave beneath the high approach before climbing through the reclaimed uplands.

## Driving

The physical launch arc begins with zero additional slope and curvature, then progressively steepens into takeoff. Its roughly 253-metre opening retains a broad, lower receiving apron. Craft follow the ordinary ballistic integrator: pitch and finite TURBO affect flight, but neither added lift, steering assistance nor landing repositioning is applied. The mandatory flight does not require TURBO or a boost pad.

BORE and BENCH use independently authored three-dimensional curves, with distinct elevation and corner profiles. Connected entry and exit decks permit lane selection before separation. Weapon rewards are equal on both routes. Three grade-separated crossings weave the lower return beneath earlier sections of the circuit.

Recovery distinguishes forward airborne travel inside the receiving straight from lost racers. Sideways loss, stalling, reversal, passing the receiving straight and falling below the road retain recovery. Post-finish presentation does not alter the frozen race result.

## Landscape

Warm ironstone, chalk, copper and slate bands separate the quarry faces. Grassy benches, highland groves, gorse and rock outcrops break up the reclaimed rim. Turquoise water fills a retained cut beside BENCH and collects in the abandoned sump; the working excavator stands on its dry extraction apron. Orange and teal transfer structures, mineral-bore portals and the large excavator provide course-scale landmarks.

Visible terrain and collision queries share the worker-serialized heightfield. Scenery placement checks both split routes. Spatial instancing groups vegetation and industrial structures for frustum culling.

## Stored data

The stable layout ID is `faultline-1-finish-end`. Records, wins, trophies and previously unlocked circuits remain stored. The changed racing line makes historical FAULTLINE lap times incomparable; the game does not delete them. The previous seven circuits keep their geometry and identifiers.

## Verification

Ballistic tests exercise craft, speed class, pitch, TURBO and failed-flight recovery. Player-control and eight-ship simulations exercise ordered laps, both fork choices, contacts and landings through the production integrator. Geometry checks cover branch lengths, scenery clearance and the grade-separated crossing. Desktop and mobile race-camera captures cover both complete routes, the launch, landing and menu lifecycle.

At 844×390 LOWRES, 23 matched chase-camera views average 385 draw calls and 206,000 triangles. FAULTLINE’s 512-unit road batches reduce submissions by 23.5% against 256-unit batches, with 3.4% more triangles; sampled raster output is identical. The other circuits retain their existing batching. At the fork, actual BORE/BENCH views submit 596/661 calls and 310,000/339,000 triangles, versus 223 calls and 114,000 triangles on the unsplit baseline. The larger split vista costs more geometry. Software-rendered timings are not physical-phone FPS.
