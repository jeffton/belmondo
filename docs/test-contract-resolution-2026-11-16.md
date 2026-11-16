# Gameplay test contracts — 16 November 2026

## Banking: product correction

Cinderline and Vesper exceeded the existing 0.008 radian/metre bank-gradient limit (0.008184 and 0.008158). A station-distance smoothing kernel replaces a fixed sample-count kernel. Their maxima are 0.006447 and 0.006432; the limit is unchanged and tests sample every 0.25 metre. Centerlines, tangents, widths, route lengths and timing stations are unchanged. Maximum bank adjustment across all courses is 1.57°.

Bank-contact fixtures select real decking rather than the virtual center of a disconnected fork. Moving reversal tests exercise all three classes without damage or loss of hover. Controls, AI, records and progression are unchanged.

## Whiteout: authored route contract

The generic 150-metre radius quota describes the base course, not the accepted glacial crossing. It remains enforced on the base road. The authored fork is covered by geometry continuity, clearance, projection, all 18 craft/class/route player-control laps and the existing 18-case TURBO matrix. Player-control laps have no rail contact, rescue or damage, preserve sequential gates, and differ by at most 1.404% between routes. See `test-contract-resolution-whiteout-coast.md`.

## Historical Coast: traffic versus preference

NPC branch parity is a steering preference, not a guaranteed collision-free traffic outcome. Solo tests verify intended selection; traffic tests require both roads, stable branches while disconnected, ordered gates and rescue-free merges. The historical geometry fixture remains covered.

## Solar and Cinderline: event-bounded collision fixtures

The Solar fixture crossed the connected seam successfully, then continued transversely into the opposite outer rail. It measures the crossing event and retains no-contact, no-damage and grounded requirements.

The Cinderline fixture correctly collided with the splitter, then drove straight off a diverging deck. It checks the damaging impact itself, grounded support and hull-safe bounds rather than an arbitrary endpoint after 80 unsteered frames. Neither case requires product changes.
