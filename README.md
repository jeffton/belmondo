# BELMONDO

Original browser-based anti-gravity combat racer. Three circuits, eight pilots, three craft, five weapons, split routes and ballistic jumps. Built with Three.js and Vite. No account, backend, analytics or uploaded audio.

## Play

https://antigrav.roybot.se

- **Keyboard:** W/↑ thrust, A/D or ←/→ steer, J/L airbrakes (Q/E also work), I nose down / K nose up, S/↓ brake, Space fire, V camera, P/Esc pause.
- **Gamepad:** left stick steers and pitches (up: nose down; down: nose up), A/R2 thrust, L1/R1 airbrakes, X fire, B brake, Y camera, Start pause.
- **Touch:** automatic thrust, two-axis flight stick: left/right steers, push up lowers the nose, pull down raises it. Separate airbrakes and brake/fire buttons work while holding the stick. VIEW switches chase/first-person; landscape recommended.

Cyan BOOST pads accelerate; amber/magenta WEAPON pads supply one weapon. Equipped items have individual silhouettes, names and colors: red MISSILE (homing), magenta PULSE, amber MINE, cyan SHIELD and electric-blue TURBO. Equipped items appear below the timer at the top of the HUD; the indicator disappears when unarmed. Fire with Space, the inventory button or the separate mobile FIRE control. Roadside FORK signs count down to the splitter. Choose a lane before the routes separate; joined fork and merge decks remain open across the seam. Routes differ in elevation, width, length and corner profile. Keep speed over gaps. Time attack removes opponents and weapons. Three-lap records are stored locally per circuit/craft/mode.

## Sound

The original three-track soundtrack starts with Phase Index. Glass Current and Ion Drift add syncopated breaks; the playlist loops. Music follows race pause/resume and has a separate volume from synthesized turbine, weapon and impact effects. Choose audio files/folders or drop a folder to use local music; it stays on-device. BELMONDO OST restores the built-in tracks. Spotify integration is excluded by its [developer policy](https://developer.spotify.com/policy), which prohibits games. See [music API](docs/music.md).

## Development

```sh
npm ci
npm run dev
npm test
npm run test:browser
npm run test:steering
npm run test:audio
npm run test:music
npm run build
```

The browser test expects Vite at `http://127.0.0.1:5178`; start it with `npm run dev -- --port 5178`. Set `GAME_URL` to test another deployment. `npx playwright install chromium` installs its browser. SwiftShader is enabled for headless Linux without a GPU.

Physics uses 120 Hz fixed steps with authoritative world position, velocity and yaw, finite grip, separate airbrake drag, wall penalties and ballistic jumps. Road projection determines contact and ordered sector gates validate laps; it does not steer or reposition craft around corners. AI supplies controls to the same body integrator. All eight craft exchange momentum through oriented hull contacts; sustained side pressure can pin a rival against the physical barrier, with speed loss and scrape damage. Protection absorbs damage without removing collision forces. Broad-radius circuits have wide, physically separate split routes and launch ramps. Failed jumps and exhausted shields reboot the craft at a stationary recovery point. Approximate straight-line cruise is 131 m/s for Wraith, 159 for Striker and 174 for Raptor. Boost adds smoothly spooled thrust; aerodynamic drag removes the extra speed gradually after its force decays. Rendering uses instanced architecture, flat-shaded craft and pooled effects. Shared low-resolution materials cover dark asphalt, ceramic cladding, glazing, hull panels, water and inlaid pickup pads. Spatial instancing and road chunks allow frustum culling of distant districts. Texture coordinates use world distance on roads and tunnels. Sustained slow frame timing reduces render resolution after a measured 2.5-second window. Rendering and quality choices are visible in the read-only `window.nullVector.telemetry` getter.

## Visual direction

BELMONDO takes its name from WipEout’s fictional anti-gravity pioneer Pierre Belmondo. Its self-hosted Barlow Condensed wordmark, vermilion rule and B/ monogram form an original identity; the craft livery uses the same wordmark. `public/art/generate-belmondo-mark.py` renders the livery mark and favicon from the bundled font; run it before `generate-craft-atlas.py`. The original OpenAI Image BELMONDO logo study is retained in `public/art/openai-image-2026-11-11T16-12-43-447Z-ig_0eeef9339863fc27016af493e300ec87d2967f05257c4944aa.png`.

Kaiseki Coast is an authored waterfront: close shopping galleries and balconies, a covered transit interchange, folded ferry-terminal roof, asymmetrical split districts and a landing landmark. Eight original OpenAI-generated shop interiors sit in recessed 3D bays, with planters, exposed services and original tenant signs beside the racing deck; open harbor sections separate the districts. Its dusk palette, ceramic structures and wet-road highlights follow the OpenAI Image flagship design board in `public/art/`. Coastal terraces, transit infrastructure and ferries extend its landscape. Solar Array runs through desert ridges, solar plants and refinery structures; Noctilucent passes freight quays, cranes and tank districts. Eight original OpenAI-generated roadside poster designs give each course bold advertising without overhead banners. Architecture is spatially batched for frustum culling.

OpenAI Image design boards are in `public/art/`; **Design study** opens the Japanese waterfront reference. Layered shopfronts, warm glazing, balconies, neon signage, ceramic/glass towers and moving sky-transit shape the actual city. White Y-supports with vermilion trusses, cyan glass rails and precise inlaid road graphics frame the circuit. Coastal, desert and harbor terrain provide grounded foundations and distant landmarks. No WipEout assets, marks, music or circuit layouts are included. Fonts are self-hosted under their included OFL licenses.

## Deployment

`scripts/deploy.sh` builds and atomically points `/var/www/antigrav/current` at a new static release. Existing releases are retained. Nginx serves only this domain; no application service or database is required. See `deploy/nginx.conf` for HTTPS configuration.

## Verification

`npm test` checks passive corner failure versus planned steering, inertia, combined airbrakes, wall penalties, connected road projection, ordered lap gates, ballistic jumps, ramp lips, recovery, weapons and earned AI laps on all three production circuits. Browser smoke tests exercise desktop keyboard controls, all circuits, pause/blur, local-audio playback, dialogs, landscape touch controls and portrait layout. `test:steering` checks rendered screen-space displacement and inward banking for keyboard, touch and simulated gamepad steering/airbrakes, plus button selection and popup-free acceleration. `test:audio` measures the actual racing PCM bus and twenty rendered synthesis cases, including silence during mute/pause/blur. `test:music` checks native MP3 playback, playlist advancement, local-file replacement, transport lifecycle and independent volume controls. `node tests/gameplay.browser.mjs` drives through actual browser input and read-only telemetry; `node tests/visibility.browser.mjs` checks overtaking, frustum reentry, first-person camera banking and mobile HUD spacing with standalone rendered fixtures. `node tests/input-chords.browser.mjs` checks simultaneous steering, airbrakes and pitch across keyboard, gamepad and multitouch. `node tests/contacts.browser.mjs` renders reciprocal contacts, sustained barrier pressure and clean overtaking. `node tests/flagship.browser.mjs` checks authored scenery clearance, scene lifecycle, keyboard/touch driving and frame timings; landmark fixtures are separate from actual-play captures. Screenshots and audition audio are written to the untracked `test-artifacts/` directory.

Headless software rendering validates functionality, not physical-phone GPU performance or subjective driving feel. Gamepad mappings are implemented but require a physical controller for hardware verification.
