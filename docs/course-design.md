# Course design

BELMONDO is precision-built anti-gravity racing in inhabited landscapes. Learn from WipEout's composition and driving rhythm, not its layouts, brands or assets. Each circuit needs its own driving phrase, geography and silhouette; adding corners or props is not itself an improvement.

## Driving rhythm

- Compose acceleration → preparation → linked corners → release. An exit line should affect the next approach; isolated bends joined by long neutral straights do not make a combination.
- Judge the physical deck, not the control polygon. Measure signed heading, radius, lateral displacement and distance on the final fork routes. Small centreline wiggles can disappear inside a wide racing corridor.
- Let grade, crests and banking change the approach and commitment. A climb can build anticipation; it does not need a chicane. Keep sight of the next decision before the player commits.
- Preserve releases and characteristic easy sections. WHITEOUT's descending basin feeds a climbing counterturn in the valley; FAULTLINE's rising opening builds toward its rim, route choice and quarry jump, followed by technical extraction shelves.
- Keep route choices distinct. CINDERLINE's narrow reversing gorge contrasts with its broad banked rim. A tested upper-route counterturn increased its accumulated heading beyond the gorge's and was rejected: more activity erased the choice.

## Pickups, forks and flight

- Place boosts on a deliberate line: corner exit, optional aggressive entry or climbing release. The extra speed and following brake demand must be visible before collection. Do not scatter boosts to disguise an empty sector.
- Weapon pads can trade an ideal line for armament. Verify actual collection and follow-through with the production craft and speed classes; a dot in a layout drawing proves neither.
- Forks compete through driving lines, width, grade, enclosure and rewards together. Check both routes, their shared entry and their merge. Equal weapon rewards already suit WHITEOUT, COAST and CINDERLINE; do not add boost compensation automatically.
- A jump is road shape, speed and missing deck, not a scripted impulse. Maintain readable takeoff, clear receiving space and ordinary physical landing. A lower deck remains a valid physical surface, independently of checkpoint credit.
- Keep shared fork vertices shared in both renderer and collision geometry. Fix real cracks or contact errors; do not expand recovery grace to conceal them.

## Art direction at racing resolution

- Compose broad value masses before detail: a quiet dark deck, readable boundaries, substantial structures and selective accents. Preserve the character of each environment rather than making every course grey.
- Separate material roles. Solar collectors are dark machinery, not window facades; water is not patterned concrete; painted metal is not ceramic. Let pigment retain the road's texture, lighting and shadows.
- Use local construction depth: darker recesses and supports, readable soffits and coherent roof masses. A bright stripe on every floor turns a building into a wireframe.
- Sequence enclosure and release. Existing cuttings, galleries, open water, roof routes and canyon streets should frame the next place. Strengthen an existing landmark or remove competing detail before adding another object.
- Position structures for the chase view. NOCTILUCENT's open high bridge is an intentional release against VESPER's enclosed city. A raised-truss experiment read as floating wings from the cockpit and was rejected; more skyline is not automatically better.
- Bake broad terrain distinctions into vertex colour: snow against blue ice, deep vegetation against exposed banks, cool basalt against sparse sulfur beds. Avoid repetitive fine stripes or grain on every surface.
- Check accents in motion. Cyan belongs to pickups and selected urban signals, orange to polar instruments, warm work areas to the night harbour, lime machinery and mineral faces to the quarry. Not every neighbouring surface needs the same contrast.

## Circuit identities

| Circuit       | Driving / spatial signature                                       | Visual hierarchy                                                           |
| ------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| WHITEOUT      | Falling basin, climbing valley, exposed ridge versus ice cut      | Quiet snow, blue ice, dark observatory; orange instruments                 |
| MONSOON       | Spillway dive, dry lock, technical outlet, climbing fork          | Pale hydraulic structures, deep green banks, water and pressure works      |
| KAISEKI COAST | Waterfront combinations, bore versus skyway, climbing reversal    | Warm sea/sky, pale ceramic masses, dark recesses, selective vermilion      |
| SOLAR ARRAY   | Rock-cut climb, mountain tunnel, route choice, transmission turns | Warm earth, dark collectors, coherent service halls, cool technical steel  |
| FAULTLINE     | Rising rim, bench versus bore, great jump, extraction shelves     | Broad mineral faces, reclaimed green, turquoise water, isolated machinery  |
| CINDERLINE    | Narrow compound valley, caldera release, gorge versus rim         | Cool basalt, sparse sulfur, pale condenser silhouettes                     |
| NOCTILUCENT   | Freight climb, crossing levels, open high bridge, gravity descent | Dark water/warehouses, readable steel, selected warm terminal masses       |
| VESPER        | Rooftops, lower gallery, market, tower canyon, freight streets    | District-scale colour fields; readable soffits, restrained secondary light |

## Verification

Use the actual `Track`, `Race`, terrain, `World` and chase camera. Static plan views help diagnose geometry; they do not establish driving feel or visual quality.

Compare matched LOWRES desktop and portrait/mobile views through approaches, commitment points and exits. Run continuous legal-input sequences to check turn preparation, pickup choices, flight and landing; distinguish scenario initialization from subsequent driving. Review consecutive frames for shimmer, clipping, hidden decisions and competing silhouettes. Obtain an independent code and visual/motion review.

Run the all-craft/class/branch AI matrix, physical player/fork and flight tests, radius and terrain-clearance guards, then the complete suite, typecheck and build. Measure scenery clearance on both crossing levels; a decorative structure must not fill a legal airborne corridor. Keep records, progression and user storage intact. Do not weaken unrelated assertions to accommodate a candidate. Report simulated frame cadence and renderer counts as such, not device FPS.

## References

- [Wayne Imlach interview and Wip3out screenshots](https://www.thepixelempire.net/pixel-qa---wayne-imlach-lead-designer-wip3out.html): cleaner palette, broad architecture and selective colour.
- [Scott Naylor interview](https://www.wipeoutzone.com/features.php?id=86): Wip3out's city/industrial direction and the contributions of Nicky Westcott and Nick Phillips.
- [Original PS1 data and texture/vertex-lighting analysis](https://phoboslab.org/log/2015/04/reverse-engineering-wipeout-psx) · [WipEout / 2097 viewer](https://phoboslab.org/wipeout/).
- Project specifics: [circuit rhythm](course-rhythm.md), [split-route design](split-route-design.md), [visual language](ps1-art-direction.md), [shared fork boundaries](shared-fork-boundaries.md).
