# NULL // VECTOR

Original browser-based anti-gravity combat racer. Three circuits, eight pilots, three craft, five weapons, split routes and ballistic jumps. Built with Three.js and Vite. No account, backend, analytics or uploaded audio.

## Play

https://antigrav.roybot.se

- **Keyboard:** W/↑ thrust, A/D or ←/→ steer, Q/E separate airbrakes, S/↓ brake, Space fire, P/Esc pause.
- **Gamepad:** left stick steer, A/R2 thrust, L1/R1 airbrakes, X fire, B brake, Start pause.
- **Touch:** automatic thrust, proportional left steering pad, separate airbrakes and large brake/fire buttons. Landscape recommended; portrait supported.

Cyan pads boost; lime pads supply one weapon. Choose left/sky or right/coast before a split. The coast route is lower and narrower; the skyline route is wider and elevated. Route lengths and corner profiles differ by circuit. Keep speed over gaps. Time attack removes opponents and weapons. Three-lap records are stored locally per circuit/craft/mode.

## Sound

Hover/turbine, airbrakes, boost, weapons, impacts and countdown are synthesized in Web Audio. Effects have an independent volume control and mute; pause and blur silence the racing bus. Choose audio files/folders or drop a folder to use local music; it stays on-device. Playlist playback loops. Spotify integration is excluded by its [developer policy](https://developer.spotify.com/policy), which prohibits games. See [music API](docs/music.md).

## Development

```sh
npm ci
npm run dev
npm test
npm run test:browser
npm run test:steering
npm run test:audio
npm run build
```

The browser test expects Vite at `http://127.0.0.1:5178`; start it with `npm run dev -- --port 5178`. Set `GAME_URL` to test another deployment. `npx playwright install chromium` installs its browser. SwiftShader is enabled for headless Linux without a GPU.

Physics uses 120 Hz fixed steps. Every craft uses the same road-relative lateral inertia, centrifugal forces, wall response, jump integration and weapons. AI follows different lines with individual target speeds and shared physics; there is no position-based rubber-banding. Separate sampled route geometry includes its own tangents, curvature and distance metric; alternatives reconnect into common race progress. Rendering uses instanced architecture, flat-shaded craft and pooled effects. Shared low-resolution materials cover dark asphalt, ceramic cladding, glazing, hull panels, water and inlaid pickup pads. Spatial instancing and road chunks allow frustum culling of distant districts. Texture coordinates use world distance on roads and tunnels. Sustained slow frame timing reduces render resolution after a measured 2.5-second window. Rendering and quality choices are visible in the read-only `window.nullVector.telemetry` getter.

## Visual direction

OpenAI Image design boards are in `public/art/`; **Design study** opens the Japanese waterfront reference. Layered shopfronts, warm glazing, balconies, neon signage, ceramic/glass towers and moving sky-transit shape the actual city. White Y-supports with vermilion trusses, cyan glass rails and precise inlaid road graphics frame the circuit. Coastal, desert and harbor terrain provide grounded foundations and distant landmarks. No WipEout assets, marks, music or circuit layouts are included. Fonts are self-hosted under their included OFL licenses.

## Deployment

`scripts/deploy.sh` builds and atomically points `/var/www/antigrav/current` at a new static release. Existing releases are retained. Nginx serves only this domain; no application service or database is required. See `deploy/nginx.conf` for HTTPS configuration.

## Verification

`npm test` runs full three-lap simulations on every track, checking completed laps, physical route separation/reconnection, flight/touchdown, finite AI state, inertial controls, weapon interactions and low-speed jump recovery. Browser smoke tests exercise desktop keyboard controls, all circuits, pause/blur, local-audio playback, dialogs, landscape touch controls and portrait layout. `test:steering` checks rendered screen-space displacement for keyboard, touch and simulated gamepad steering/airbrakes, plus button selection and popup-free boost. `test:audio` measures the actual racing PCM bus and twenty rendered synthesis cases, including silence during mute/pause/blur. Screenshots and audition audio are written to the untracked `test-artifacts/` directory.

Headless software rendering validates functionality, not physical-phone GPU performance or subjective driving feel. Gamepad mappings are implemented but require a physical controller for hardware verification.
