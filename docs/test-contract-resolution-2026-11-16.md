# Gameplay test contracts — 16 November 2026

## Banking: product correction

Cinderline and Vesper exceeded the existing 0.008 radian/metre bank-gradient limit (0.008184 and 0.008158). A station-distance smoothing kernel replaces a fixed sample-count kernel. Their maxima are 0.006447 and 0.006432; the limit is unchanged and tests sample every 0.25 metre. Centerlines, tangents, widths, route lengths and timing stations are unchanged. Maximum bank adjustment across all courses is 1.57°.

Bank-contact fixtures select real decking rather than the virtual center of a disconnected fork. Moving reversal tests exercise all three classes without damage or loss of hover. Controls, AI, records and progression are unchanged.

Preservation snapshots distinguish alignment from banking: baseline-derived centerline, tangent, width, station, metric, bounds and rail-profile digests remain exact. Terrain retains exact bank-neutral landscape digests, topology/XZ preservation and actual banked full-width deck clearance. Bank-dependent shoulder grading changes elevation by at most 1.033 metres; restoring baseline orientation reproduces the original terrain bytes.

## Whiteout: authored route contract

The generic 150-metre radius quota describes the base course, not the accepted glacial crossing. It remains enforced on the base road. The authored fork is covered by geometry continuity, clearance, projection, all 18 craft/class/route player-control laps and the existing 18-case TURBO matrix. Player-control laps have no rail contact, rescue or damage, preserve sequential gates, and differ by at most 1.404% between routes. See `test-contract-resolution-whiteout-coast.md`.

## Historical Coast: traffic versus preference

NPC branch parity is a steering preference, not a guaranteed collision-free traffic outcome. Solo tests verify intended selection; traffic tests require both roads, stable branches while disconnected, ordered gates and rescue-free merges. The historical geometry fixture remains covered.

## Solar and Cinderline: event-bounded collision fixtures

The Solar fixture crossed the connected seam successfully, then continued transversely into the opposite outer rail. It measures the crossing event and retains no-contact, no-damage and grounded requirements.

The Cinderline fixture correctly collided with the splitter, then drove straight off a diverging deck. It checks the damaging impact itself, grounded support and hull-safe bounds rather than an arbitrary endpoint after 80 unsteered frames. Neither case requires product changes.

## Verification

- Complete Node inventory: 946 unique tests, 946 pass, zero failures/skips/timeouts. Every shard is capped at 55 seconds. The three snapshot-repair files are rerun against unchanged product-source hashes; all other complete-suite shard results remain applicable.
- Strict browser/worker typechecks, production build, changed-file formatting and independent Sol review pass.
- Actual WebGL gameplay covers Cinderline and Vesper in three classes on desktop and portrait, with craft diversity. All 12 grid-start drives cross the affected reversal without airborne bank frames or JavaScript errors. Vesper's external test driver has minor ordinary outer-rail contacts; banking does not lose deck support.
- Full outcomes and shard provenance: `/var/tmp/belmondo-ts-qa/final-fa6aaca-aggregate.json`. WebGL telemetry/screenshots: `/var/tmp/belmondo-bank-webgl/`.
