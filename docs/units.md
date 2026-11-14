# Display units

RAPTOR defines the visual metres scale: its solid airframe is 6 m long.
The rendered Float32 geometry spans local z from −3.2899999618530273 to
3.569999933242798: 6.859999895095825 world units. Exhaust is excluded;
the contact envelope is not the airframe. `src/units.js` therefore defines
1 world unit = 0.8746355818881814 m.

HUD km/h = horizontal world units/second × metres/unit × 3.6.
RAPTOR's theoretical level, straight, full-throttle equilibrium without boost:

| Class       | World units/s | Display km/h |
| ----------- | ------------: | -----------: |
| INDUCTION   |      208.6001 |          657 |
| RESONANCE   |      243.3668 |          766 |
| SINGULARITY |      278.1335 |          876 |

These solve the existing thrust/drag balance, not a speed cap. Turns, slopes,
collisions and boosts still affect actual speed.

Fork-warning labels use the same scale: their existing 270/150/60-unit
approaches read 236/131/52 m. Their placement is unchanged. The missile briefing
reports its unchanged 220-unit lock range as 192 m. The HUD speed bar,
craft-stat scores, camera effects, exhaust and audio are relative indicators,
not metre or km/h readouts; they retain their original ratios. Read-only pilot
telemetry continues reporting simulation units.

This is a display change only. Physics, geometry, controls, AI, class pace,
lap times, records and progression are unchanged. No storage migration or
record reset is required. Existing stylised scenery is not resized.
