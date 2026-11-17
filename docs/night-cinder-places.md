# Harbor basin and volcanic works

## NOCTILUCENT

The climbing deck, open crossing and bridge exit overlook one long harbor basin. A wet repair berth and a freight quay occupy opposite ends of the bowl; the lower crossing remains between them. The repair vessel sits in real water. The descent ends beside a freight terminal sharing the harbor's pale concrete, blue-metal machinery and muted cargo-red identification.

The global sea is −16 m; quays are at least −10 m. Foundations intersect the final terrain, including its indexed triangle extrema. Neither crossing receives an overhead chord or new architecture in its horizontal racing corridor.

## CINDERLINE

The caldera release leads onto an exposed basalt backbone. Low flanks reveal the jump and its receiving ridge against the volcanic skyline. Existing grading carries the unchanged racing deck; the gap and volcano geometry retain their own roles.

A retained shelf in the lower gorge holds one connected pale geothermal works: a long turbine hall, five condenser beds and a common pipe header. The plant stays low rather than becoming an industrial wall above the exposed upper rim. The narrow compound valley, lower-gorge steering and broad banked upper route remain intact.

## Integration

Call the two builders once after `buildCity` in `World.buildSteps`, with the existing scene, track, circuit textures and final environment:

```ts
if (track.config.name === "NOCTILUCENT")
  buildNightHarbor(this.scene, track, textures, environment);
if (track.config.name === "CINDERLINE")
  buildCinderWorks(this.scene, track, textures, environment);
```

Terrain owns the collision and visible land. Cache `createNightHarborBasin(track)`, `createCinderRidgeLandform(track)` and `createCinderWorksLandform(track)` once per terrain build. Apply:

1. `nightHarborBaseHeight(basin, x, z, base)` to the NOCTILUCENT base, **before road grading**.
2. `cinderRidgeBaseHeight(ridge, x, z, base)` after `biomeLandHeight` for volcanic terrain, **before road grading**.
3. `cinderWorksLandHeight(works, x, z, y)` **after gorge shaping**, before `landHeight` returns. Retain whole-cell road clearance afterward.

`tests/helpers/places-terrain-fixture.js` contains exact source integrations for the isolated pre-merge fixture. After integration, use the real `createTerrain` directly in the tests and remove that temporary helper.

Remove overlapping scenery rather than layering it:

- NOCTILUCENT city landmarks at `.572`, `.663`, `.817`, `.917`.
- NOCTILUCENT route districts PROCESS WORKS, LOWER DOCKS and NIGHT TERMINAL.
- CINDERLINE's old CONDENSER FIELD at `.78`. Keep its earlier geothermal works, basalt formations and volcanoes.

## Validation

The focused checks cover complete oriented foundations and actual box/roof footprints against all routes, indexed terrain contacts, sea/berth/keel relationships and the low plant's relation to the upper rim. They do not replace actual crossing/flight runs or LOWRES chase-camera art review. No runtime updates, additional lights, transparency, shadow passes or dependencies are used.
