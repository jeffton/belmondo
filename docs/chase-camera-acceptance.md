# Chase camera clearance

The chase camera follows the player's local deck and exposed terrain at steep drops. The target retains its existing horizontal offset, heading damping and focus transport. Surface clearance is applied to the target and final smoothed camera position; first-person cockpit and demo framing retain their own placement. Ship movement, routes and collision physics are unchanged.

Projection uses the player's contact station and branch, excludes jump gaps, and ignores terrain roofs inside bored tunnels. It cannot select the upper deck of Night's over/under crossing.

## Acceptance

- NOCTILUCENT, station 0.87145: the horizontal chase camera intersects the upstream drop lip by 4.1 m. Actual World raceview captures show the deck underside filling the frame without clearance, and the ship/road/drop visible with clearance.
- Moving camera sweeps cover all seven courses and three branch states.
- Independent banked road-point comparisons cover all seven courses; projected heights agree within 2 cm.
- Night's lower crossing, flat framing, airborne height and final focus-transport clearance pass regression tests.
- Independent Sol review approved camera implementation and tests.

Local visual evidence: `/var/tmp/belmondo-camera-before/`, `/var/tmp/belmondo-camera-after/`.
