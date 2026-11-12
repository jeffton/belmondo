# Vesper Circuit

Original seventh course: a nocturnal, inhabited metropolitan race above a street
datum. Dense apartment/lift facades enclose the lower city; the upper course runs
on occupied rooftop foundations. The two return galleries trade a shorter covered
neon-market line for a longer, open 48 m higher rooftop boost line. This is not Noctilucent's freight loop.

## Contract

- Registry position 7; record identity `vesper-1`. Five laps and C1/C2/C3 physics
  are inherited unchanged. Existing course identities and sampled geometry remain
  unchanged against `73e1a27`.
- `metropolis-course.js` owns route control points, banks, physical fork and
  named sections. No invented jump, invisible braking force or body-physics edit.
- `metropolis-world.js` owns close occupied facades, structural rooftop ribbon,
  original municipal signs and restrained reflected-light strokes.
- Explicit metropolis recipe, city-datum terrain, rail palette, nighttime
  lighting and original full-sphere 2048 × 1024 skyline. The legacy `night`
  geometry switch remains disabled; it is specific to Noctilucent.
- Architecture tests clear both physical forks and banked road/hull envelopes;
  foundations sample the same terrain triangles used by collision.
- Shared facade/box resources and spatially instanced occupancy strips;
  scene-owned textures/materials/geometries use normal world teardown. No
  per-frame geometry, texture painting, generators or new reflection pass.

## Artwork

`public/art/vesper/provenance.json` identifies the original OpenAI-generated
municipal sign atlas. No reference images, external franchise assets or copied
track layouts were used. The atlas is unmodified. The skyline is original
procedural artwork, not an AI-generated panorama.

## Acceptance

The frozen candidate passes **89 focused tests in 22.8 seconds**, build and
formatting. Route and world changes have separate independent Sol approvals.
This is CPU acceptance, not visual/GPU acceptance.

- Physical distance is approximately 11.6 km, with 145 m elevation range.
  The linked rooftop phrase combines 130/85/100/150 m radii,
  90°/102°/78°/90° turns and short gaps.
- All 18 craft/class/fork laps use actual terrain, earn every gate, collect real
  boosts, retain shield 100 and have zero rail-touch/recovery frames.
- A poor A exit costs 1.53 seconds and 5.75 shield in B after correct B controls
  resume. In a bounded full-width racing-line search, clean air-enabled pace is
  20.57 seconds versus 23.27 seconds for independently tuned clean no-air pace.
  This demonstrates a pace advantage, not universal airbrake necessity.
- The upper fork is 1–2.5% quicker with its actual boost. C1 Striker is
  6.375/6.267 seconds lower/upper; C3 is 4.558/4.483 seconds. Other craft remain
  similarly balanced. No route-specific force or equal-time correction exists.
- Whole-world authored scenery: 297 close buildings, 6,661 instanced parts in
  46 batches, approximately 89,690 triangles, 697 rooftop foundation segments
  and 19 covered market bays. These are construction counts, not measured
  visible draw calls or GPU frame-time claims.

- Focused metropolis world tests: explicit registry/record identity, actual ground
  and building clearance, rooftop structural contacts, pickup choices, panorama
  ownership/resolution/seam and original-art provenance.
- Native CPU route matrix: every craft, speed class and fork, using real player
  controls without teleport, branch mutation or checkpoint recovery.
- Independent Sol review covers route and world separately.
- Generic advertising, pickup, sky, crowd and finish-district tests exercise the
  seventh registry entry too.
- Public assets, native browser inputs, desktop/mobile visual composition,
  resource cycling and measured GPU performance belong to the integrating
  owner's release gate. No GPU or production deployment is performed here.

## Integration

The vegetation module is a separate six-course release. When merging this course,
add an explicit `"VESPER CIRCUIT": { ranges: [], species: [] }` profile: its
sealed concrete roofs contain no authored soil. Do not select a legacy biome.

The generic `track.test.js` 150 m minimum-radius assertion predates technical
courses and also fails the unchanged Monsoon baseline. Keep the six legacy
route contracts; use the course's real-control feasibility and consequential
racing-line tests rather than flattening Vesper to meet that obsolete radius
rule. Investigate short curvature peaks by their actual support length/angle.

A default complete test run exceeds the 60-second command deadline in this
workspace. The unchanged Monsoon technical comparison also fails against this
branch's frozen Monsoon baseline; its owner is delivering that route separately.
Neither result is represented as a passing full-suite gate.
