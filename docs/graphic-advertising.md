# Graphic campaigns

Eight original campaigns share a single generated atlas. NEMU uses a crescent and orbital grid; KOTORI uses a bird, diagonal rays and halftone; SATO uses a patterned planet and broad red ribbons; DOPPLER uses concentric waveforms; MOTH uses a lavender insect and honeycomb; RIFF uses a lightning cut and circular field; IONPEAR uses a friendly orbital fruit; ARC uses a turbine and sweeping red arcs. Large names remain readable without explanatory copy.

Course palettes select campaigns deliberately:

| Course         | Campaigns                                                                 |
| -------------- | ------------------------------------------------------------------------- |
| Kaiseki Coast  | NEMU, SATO, IONPEAR, KOTORI: cream, coral and botanical space-pop         |
| Solar Array    | KOTORI, SATO, RIFF, ARC: radiation, energy and machinery                  |
| Noctilucent    | NEMU, DOPPLER, MOTH, IONPEAR: nocturnal life and transmission             |
| Whiteout       | MOTH, NEMU, DOPPLER, ARC: pale forms, lunar cools and observatory signals |
| Monsoon        | KOTORI, IONPEAR, MOTH, SATO: tropical fauna, fruit and warm counterpoints |
| Cinderline     | RIFF, SATO, ARC, DOPPLER: electric yellow, red and turbine motion         |
| Vesper Circuit | DOPPLER, MOTH, RIFF: cyan/magenta transmission and nightlife              |

The existing three/four large campaign placements and slim Pierre Belmondo lore panels are retained. No road, finish district, race logic, sign position, panel size or support geometry is changed. Two light rails per panel occupy campaign-specific edges. The original generated board is retained intact; UVs exclude its white presentation margins. Provenance is beside the asset.

## Resource contract

One shared 2170×725 texture replaces the 4096×768 roadside atlas (approximately 8 MiB versus 16 MiB with RGBA mipmaps). Spatial panel batches, two face triangles per sign, housings, rails and support counts are unchanged. Existing facade advertising and Pierre boards retain their separate artwork. No transparent overlays, per-frame animation, extra sign placements or draw layers are added.

## Acceptance

CPU checks cover source dimensions/provenance, actual emitted panel UVs, presentation-margin exclusion, single-texture batching, geometry counts and seven-course terrain/road clearance. Build and formatting are required before integration.

Actual raceview acceptance requires the serialized GPU slot. Capture each course's first two large campaigns at approach and closest readable distance, with its own lighting, at 1440×900 and 390×844. Include at least one split-side installation and dark Vesper/Noctilucent frames. Judge the final low-res image, not only a texture preview: emblem/name hierarchy, neighboring-cell bleed, white-margin leakage, rail clipping, obstruction, distant shimmer and excessive brightness. Compare renderer calls/triangles/textures against the same candidate before this change. Inspect the remaining campaign faces in a contact sheet and release the GPU slot afterward. No browser or GPU acceptance is implied by the source-art inspection or CPU tests.
