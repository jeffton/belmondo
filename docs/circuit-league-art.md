# BELMONDO league graphics

Three team emblems connect craft selection, the timing board, airframes and results. The timing board displays registration numbers; results pair the emblem with the same craft name used in selection. PIP is the starter. The three teams retain the existing ship names, craft IDs, NPC colours and performance:

| Airframe | Entry      | Chase read                                                         |
| -------- | ---------- | ------------------------------------------------------------------ |
| STRIKER  | VEX / 01   | Vermilion cut across the left foil and deck; broad forked mark     |
| RAPTOR   | LUX / 27   | Light central strip and mint right-hand print; split diagonal mark |
| WRAITH   | PHASE / 44 | Ivory deck with a lilac face; clipped double-bar mark              |

Team colour is redundant with position and shape. Read the craft at LOWRES, not from a turntable close-up. The factory print changes existing UVs, not the silhouette, contact hull, shadow, or number of material draws. Its single atlas contains the established ceramic and mechanical panels. Regenerate it with `node scripts/build-team-livery.mjs` (ImageMagick); the original raster and team vector definitions are the two sources. The generated concept board is a reference, not a game texture.

On a course, the immediate line and physical signals have priority: preserve pad markings, transparent jump asphalt and the visibility of the next bend. Make each place distinct with large structures and controlled colour, not more HUD, distant text or constant extra light. Compare matched chase views in motion with the native LOWRES buffer, including portrait. Software GPU timings do not represent phone FPS.
