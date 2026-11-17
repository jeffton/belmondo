# BELMONDO

Original browser-based anti-gravity combat racer. Eight circuits, eight pilots, three craft, five weapons, split routes and ballistic jumps. Built with TypeScript, Three.js and Vite. No account, backend, analytics or uploaded audio.

## Play

https://belmondo.roybot.se

Choose format, speed class, circuit and craft. Arrows or D-pad/left stick select options and their previews directly; Enter/A confirms, Esc/B goes back. Navigation follows the visible layout and skips locked circuits. Pause and result actions use an orange selection and mascot. Touch and mouse select directly. LOWRES, briefing and sound controls are in the footer; LOWRES applies to the live circuit and rotating models. Class names are display labels; records use stable class IDs and physical pace.

- **Keyboard:** W/↑ thrust, A/D or ←/→ steer, J/L airbrakes, I nose down / K nose up, Space fire, V camera, Esc pause.
- **Gamepad:** left stick steers and pitches (up: nose down; down: nose up), L2/R2 analog left/right airbrakes, hold A for thrust and release to coast, X fire, Y camera, Start pause. Compatible controllers provide brief dual-motor rumble for impacts, landings, weapons and boosts; feedback stops on pause, results, loss of focus or disconnect. Rumble is independent of audio volume. Browsers without gamepad haptics retain all controls.
- **Touch:** automatic thrust. Left stick steers and pitches; push up to lower the nose. Right halfstick applies the corresponding airbrake sideways and reduces thrust downward; diagonals combine, release restores thrust. Fire sits above the right stick. VIEW switches chase/first-person; landscape recommended.

INDUCTION (1.2×) runs 3 laps, RESONANCE (1.4×) 4, and SINGULARITY (1.6×) 5. The first three circuits are open per class; each later circuit requires wins on every earlier one. Previously unlocked circuits remain accessible when a new circuit is inserted. Time Attack shares access but never unlocks tracks. Local records are separated by class, physical pace, craft and mode. The HUD separates SPEED and THRUST and shows current/completed lap times beside the lap counter.

Cyan BOOST pads accelerate; amber/magenta WEAPON pads supply one weapon. Equipped items have individual silhouettes, names and colors: red MISSILE (homing), magenta PULSE, amber MINE, cyan SHIELD and electric-blue TURBO. Equipped items appear below the timer at the top of the HUD; the indicator disappears when unarmed. Fire with Space, the inventory button or the separate mobile FIRE control. A connected vermilion apron leads to the takeoff lip; a single broad ivory sill identifies the receiving edge. Paint is coverage-filtered directly into the road for LOWRES readability, without arrows or pickup symbols. Roadside FORK signs count down to the splitter. Choose a lane before the routes separate; joined fork and merge decks remain open across the seam. Routes differ in elevation, width, length and corner profile. Keep speed over gaps. Time attack removes opponents and weapons. Records are stored locally per circuit layout, craft, mode and physical speed class; records from different layouts remain separate. The 1.2/1.4/1.6 scale replaces 1.0/1.2/1.4: C1 and C2 inherit the previous faster tiers, and C3 is 14.3% faster than the previous maximum. This breaks record comparability: previous records remain stored on-device, but the changed classes use a separate pace-qualified record key and start with an empty local record.

The last completed Combat podium appears as a rotating gold, silver or bronze cup in the race report and upper-right paddock menu, matching the circuit-button trophies. Starting another race clears it. Time Attack, elimination and finishes outside the top three award no cup; this session-only display does not change records or progression. Reduced-motion preferences keep the cup still.

## Circuits

Difficulty progression:

- **Whiteout — 7.5 km:** descending glacial-basin spiral, orange observatories and a snowbridge crossing above a blue-ice gallery.
- **Monsoon — 7.5 km:** terraced hydraulic city, a curved dry lock below retained reservoirs and a pump-island fork.
- **Kaiseki Coast — 5.9 km:** linked waterfront esses, a deep curved headland bore versus a high inlet flyover, and a long ravine jump with an aligned landing straight.
- **Solar Array — 6.6 km:** alternating outcrop bends, a curved rock-cut tunnel and a split-route corner sequence.
- **Faultline:** highland-rim esses, an exposed quarry-bench fork versus a deep mineral bore, a curved cross-pit launch and low extraction shelves weaving beneath the upper approach.
- **Cinderline — 8.2 km:** three continuous-deck compression waves, a basalt-gorge S-route versus a broad banked caldera rim, and grounded geothermal works.
- **Noctilucent — 6.1 km:** grade-separated figure-eight, a 124 m-high crossing and a steep descent into the home straight.
- **Vesper Circuit:** tight elevated metropolitan turns, tunnels and sustained airbrake demands.

Grandstands and road-integrated checkerboard line each complete home straight. Both crossing levels use their actual road surfaces; proximity cannot award progress on another part of the circuit.

Whiteout, Coast and Cinderline's fork choices carry equal weapon rewards and compete through different driving lines rather than boost compensation. Existing records and progression remain stored; historical times use different fork geometry. See [split-route design and verification](docs/split-route-design.md).

## Sound

The eight-track original Eleven Music soundtrack plays shuffled bags without back-to-back repeats. Music starts at reduced volume on keyboard, pointer/touch or browser-supported controller menu input. Chromium requires a controller button, not just the stick; Safari uses its native controller-connection gesture. Browser autoplay settings still apply; see [activation support and verification](docs/menu-music-input.md). Music assets are distributed with the game, not the public source; see [music setup and rights](docs/music.md#soundtrack-credits). Music follows race pause/resume and has a separate volume from synthesized turbines and original generated weapon, impact and race cues. Sound-effect provenance is documented in [generated SFX](docs/generated-sfx/README.md). Choose audio files/folders or drop a folder to use local music; it stays on-device. BELMONDO OST restores the built-in tracks. Spotify integration is excluded by its [developer policy](https://developer.spotify.com/policy), which prohibits games. See [music API](docs/music.md).

Menu selection, confirmation and back actions use original short synthesized tones, including pause and dialogs. They follow effects volume independently of music; zero is silent. Hover, unchanged selections and controller inputs before browser audio activation produce no queued feedback.

## Development

Repository: https://github.com/jeffton/belmondo. Local checkout: `/home/roy/github/belmondo`.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run test:browser
npm run test:steering
npm run test:audio
npm run test:music
npm run build
```

Node 26 or later runs the JavaScript test harnesses and erases imported TypeScript directly. `npm run typecheck` checks browser and worker entrypoints separately with strict types; `npm run build` includes this check. Vite strips types without changing its browser target. Three.js and its matching `@types/three` package stay on the same release.

`GAME_URL=http://127.0.0.1:5178 node tests/menu-flow.browser.mjs` checks the setup menu, desktop/portrait/landscape bounds, selection retention, live 3D previews and race/return lifecycle.

`GAME_URL=http://127.0.0.1:5187 node tests/menu-audio.browser.mjs` verifies real Web Audio output, autoplay locking, keyboard/gamepad/touch navigation, paused dialogs, zero effects volume and unchanged records.

The browser test expects Vite at `http://127.0.0.1:5178`; start it with `npm run dev -- --port 5178`. Set `GAME_URL` to test another deployment. `npx playwright install chromium` installs its browser. SwiftShader is enabled for headless Linux without a GPU.

Physics uses 120 Hz fixed steps with authoritative world position, velocity and yaw, finite grip, separate airbrake drag, wall penalties and ballistic jumps. Road projection determines contact and ordered sector gates validate laps; it does not steer or reposition craft around corners. AI supplies controls to the same body integrator. All eight craft exchange momentum through oriented hull contacts; sustained side pressure can pin a rival against the physical barrier, with speed loss and scrape damage. Protection absorbs damage without removing collision forces. Broad-radius circuits have wide, physically separate split routes and launch ramps. Failed jumps and exhausted shields reboot the craft at a stationary recovery point. Straight-line cruise depends on craft and speed class; Wraith is slowest, Striker intermediate and Raptor fastest. Boost adds smoothly spooled thrust; aerodynamic drag removes the extra speed gradually after its force decays. Rendering defaults to nostalgic low resolution; the quality toggle preserves your chosen setting. It uses instanced architecture, flat-shaded craft and pooled, layered weapon effects. Shared low-resolution materials cover dark asphalt, ceramic cladding, glazing, hull panels, water and inlaid pickup pads. Spatial instancing and road chunks allow frustum culling of distant districts. Texture coordinates use world distance on roads and tunnels. Sustained slow frame timing reduces render resolution after a measured 2.5-second window. Rendering and quality choices are visible in the read-only `window.nullVector.telemetry` getter.

## Visual direction

BELMONDO takes its name from WipEout’s fictional anti-gravity pioneer Pierre Belmondo. Its original Belmondo Circuit display lettering, supporting Archivo text, vermilion rule and B/ monogram form one interface identity across menu, pause, HUD and controls. Font sources, licenses and the width/weight hierarchy are documented in [typography](docs/typography.md). `public/art/generate-belmondo-mark.py` renders the livery mark and favicon from the bundled font; run it before `generate-craft-atlas.py`. The original OpenAI Image BELMONDO logo study is retained in `public/art/openai-image-2026-11-11T16-12-43-447Z-ig_0eeef9339863fc27016af493e300ec87d2967f05257c4944aa.png`.

Kaiseki Coast is an authored waterfront: close shopping galleries and balconies, a covered transit interchange, folded ferry-terminal roof, asymmetrical split districts and a landing landmark. Eight original OpenAI-generated shop interiors sit in recessed 3D bays, with planters, exposed services and original tenant signs beside the racing deck; open harbor sections separate the districts. Its dusk palette, ceramic structures and wet-road highlights follow the OpenAI Image flagship design board in `public/art/`. Coastal terraces, transit infrastructure and ferries extend its landscape. Solar Array runs through desert ridges, solar plants and refinery structures; Noctilucent passes freight quays, cranes and tank districts. Eight original OpenAI-generated roadside poster designs give each course bold advertising without overhead banners. Architecture is spatially batched for frustum culling.

OpenAI Image design boards are in `public/art/`; **Design study** opens the Japanese waterfront reference. Layered shopfronts, warm glazing, balconies, neon signage, ceramic/glass towers and moving sky-transit shape the actual city. White Y-supports with vermilion trusses, cyan glass rails and precise inlaid road graphics frame the circuit. Coastal, desert and harbor terrain provide grounded foundations and distant landmarks. No WipEout assets, marks, music or circuit layouts are included. Fonts are self-hosted under their included OFL licenses.

## Deployment

`scripts/deploy.sh` builds and atomically points `/var/www/belmondo/current` at a new static release. Existing releases are retained. Nginx serves only this domain; no application service or database is required. See `deploy/nginx.conf` for HTTPS configuration. The retired `antigrav.roybot.se` hostname returns HTTP 410 without redirecting. Both TLS vhosts enable HTTP/2 so browsers can reuse a connection established with Batty's shared wildcard certificate.

## Verification

`npm test` checks passive corner failure versus planned steering, inertia, combined airbrakes, wall penalties, connected road projection, ordered lap gates, ballistic jumps, ramp lips, recovery, weapons and earned AI laps across all eight circuits, including authored terrain and class/fork/TURBO matrices. Browser smoke tests exercise desktop keyboard controls, all circuits, pause/blur, local-audio playback, dialogs, landscape touch controls and portrait layout. `test:steering` checks rendered screen-space displacement and inward banking for keyboard, touch and simulated gamepad steering/airbrakes, plus button selection and popup-free acceleration. `test:audio` measures the actual racing PCM bus and twenty rendered synthesis cases, including silence during mute/pause/blur. `test:music` checks native MP3 playback, playlist advancement, local-file replacement, transport lifecycle and independent volume controls. `node tests/gameplay.browser.mjs` drives through actual browser input and read-only telemetry; `node tests/visibility.browser.mjs` checks overtaking, frustum reentry, first-person camera banking and mobile HUD spacing with standalone rendered fixtures. `node tests/input-chords.browser.mjs` checks simultaneous steering, airbrakes and pitch across keyboard, gamepad and multitouch. `node tests/contacts.browser.mjs` renders reciprocal contacts, sustained barrier pressure and clean overtaking. `node tests/world-lifecycle.browser.mjs` checks restart/rebuild resource stability and loaded texture reuse. Authored scenery clearance and driving contracts live in the Node suite; screenshots are not performance benchmarks. Screenshots and audition audio are written to the untracked `test-artifacts/` directory. See [test coverage and cleanup](docs/test-cleanup-2026-11-16.md) for retained checks and retired acceptance harnesses.

Headless software rendering validates functionality, not physical-phone GPU performance or subjective driving feel. Gamepad mappings are implemented but require a physical controller for hardware verification.
