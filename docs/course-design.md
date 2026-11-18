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
- Judge place identity and spatial rhythm through a driven sequence. Desktop and portrait may reveal different parts; neither needs to explain every technical waterline or industrial connection.
- Sequence enclosure and release. Existing cuttings, galleries, open water, roof routes and canyon streets should frame the next place. Strengthen an existing landmark or remove competing detail before adding another object.
- Position structures for the chase view. NOCTILUCENT's open high bridge is an intentional release against VESPER's enclosed city. A raised-truss experiment read as floating wings from the cockpit and was rejected; more skyline is not automatically better.
- Bake broad terrain distinctions into vertex colour: snow against blue ice, deep vegetation against exposed banks, cool basalt against sparse sulfur beds. Avoid repetitive fine stripes or grain on every surface.
- Check accents in motion. Cyan belongs to pickups and selected urban signals, orange to polar instruments, warm work areas to the night harbour, lime machinery and mineral faces to the quarry. Not every neighbouring surface needs the same contrast.

## Circuit identities

| Circuit      | Driving / spatial signature                                                             | Visual hierarchy                                                                     |
| ------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| WHITEOUT     | Tightening observatory spiral, climbing valley, ridge versus ice cut                    | Quiet snow, blue ice, a supported optical vault and restrained instruments           |
| MONSOON      | Spillway basin, pump chamber, technical outlet, climbing fork                           | Pale hydraulic masses, blue water, deep green banks and pressure works               |
| PALM BREAKER | Waterfront combinations, bore versus skyway, institute, coastal yard and receiving mole | Warm sea/sky, open public court, pale ceramic masses and selective vermilion         |
| SOLAR ARRAY  | Collector hillside, mountain tunnel, route choice, process-to-rock release              | Warm earth, continuous dark collector bands, grounded service halls and cool steel   |
| FAULTLINE    | Rising rim, bench versus bore, great jump, broad-to-tight extraction return             | Broad mineral faces, reclaimed green, turquoise water and a connected working cut    |
| CINDERLINE   | Exposed ridge, caldera release, gorge versus rim, retained works shelf                  | Cool basalt, sparse sulfur and a low condenser silhouette facing the approach        |
| NOCTILUCENT  | Freight climb, crossing levels, open bridge, descent into a freight apron               | Dark water, connected quays, readable cargo hoists and selected warm terminal masses |
| VESPER       | Rooftops, covered arrival, open court and terminal hall, market, tower canyon           | District-scale colour fields, deep occupied openings and restrained interior light   |

## Verification

Use the actual `Track`, `Race`, terrain, `World` and chase camera. Run the changed circuit's existing radius, bank, fork and preserved-region guards before expensive captures. A clean sector in one craft/class does not replace those checks. Static plan views help diagnose geometry; they do not establish driving feel or visual quality.

Compare matched LOWRES desktop and portrait/mobile views through approaches, commitment points and exits. Run continuous legal-input sequences to check turn preparation, pickup choices, flight and landing; distinguish scenario initialization from subsequent driving. Review consecutive frames for shimmer, clipping, hidden decisions and competing silhouettes. Obtain an independent code and visual/motion review. Transfer the capture slot only after its owner explicitly confirms browser closure; queued steering does not interrupt an in-flight tool.

Run the all-craft/class/branch AI matrix, physical player/fork and flight tests, radius and terrain-clearance guards, then the complete suite, typecheck and build. Measure scenery clearance on both crossing levels; a decorative structure must not fill a legal airborne corridor. Keep records, progression and user storage intact. Do not weaken unrelated assertions to accommodate a candidate. Report simulated frame cadence and renderer counts as such, not device FPS.

## References

- [Wayne Imlach interview and Wip3out screenshots](https://www.thepixelempire.net/pixel-qa---wayne-imlach-lead-designer-wip3out.html): cleaner palette, broad architecture and selective colour.
- [Scott Naylor interview](https://www.wipeoutzone.com/features.php?id=86): Wip3out's city/industrial direction and the contributions of Nicky Westcott and Nick Phillips.
- [Original PS1 data and texture/vertex-lighting analysis](https://phoboslab.org/log/2015/04/reverse-engineering-wipeout-psx) · [WipEout / 2097 viewer](https://phoboslab.org/wipeout/).
- Project specifics: [circuit rhythm](course-rhythm.md), [split-route design](split-route-design.md), [visual language](ps1-art-direction.md), [shared fork boundaries](shared-fork-boundaries.md).
