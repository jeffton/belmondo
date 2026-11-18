# Visual language

Precision-built racing infrastructure in inhabited landscapes: charcoal induction decks, pale ceramic cassettes, substantial metalwork, mineral terrain and selective luminous graphics. Silhouette, structural depth and broad surface values take precedence over fine grain.

- Decks use staggered plates, rolled sheen and directional abrasion; pickups and rail boundaries retain visual priority.
- Pickup inserts use quiet graphite beds and broad, unlettered symbols: cyan paired forward vanes for boost, an amber split socket for weapons. Shape and colour distinguish them without labels, tiny hardware or scanlines. Artwork reads left-to-right from chase view; canvas up follows the route.
- Ceramic faces have recessed cassettes, glaze variation and cast sill shading. Natural rock uses a separate mineral texture.
- Tunnel thresholds, ceilings and lower galleries use branch-local baked values. The existing key/fill rig and celestial directions remain fixed.
- Selective chamfered portal collars and recessed service bays provide real depth outside every driving corridor and billboard sightline.
- Snowfields stay quiet; wet ground and mineral beds use broad value masses rather than pixel noise.

LOWRES dimensions, filtering, cameras, routes, physics, pickups, timing and record identities are unchanged. Structural meshes use shared materials and spatially culled instancing; sectional lighting is baked during course construction.

## Track signage

Four freestanding landmarks per lap: three sponsor campaigns and the Pierre Belmondo founder board. Each is staged on an incoming racing line and aimed back at its own approach. Use landscape units with a strong graphic silhouette and a short headline rather than making a tangential face wider. The sponsor art shares one texture atlas; Kaiseki shop plaques use square layouts from the same artwork. Vesper’s municipal plates keep their district labels and use simple civic pictograms.

Cream plates, dark letterforms and red arrows distinguish actionable route guidance from sponsor graphics. Keep the fork's existing branch labels, warning cadence and geometry. Signs must clear all decks and modeled infrastructure; run `node scripts/check-billboard-clearance.mjs scan` and the LOWRES chase-camera matrix in `tests/billboards.browser.mjs`.

## References

Original PS1 reference material informs the construction and value hierarchy, not copied assets:

- [Original WipEout texture formats](https://phoboslab.org/log/2015/04/reverse-engineering-wipeout-psx)
- [WipEout 3 gameplay and environments](https://www.thepixelempire.net/wip3out-ps-review.html)
- [Wayne Imlach on WipEout 3 art direction](https://www.thepixelempire.net/pixel-qa---wayne-imlach-lead-designer-wip3out.html)
