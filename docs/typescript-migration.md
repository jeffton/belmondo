# TypeScript

All 84 game modules use TypeScript. Three.js remains at 0.187.0 with matching `@types/three`; Vite remains at 8.3.8. TypeScript 7.0.2 is development-only.

## Development

Use Node 26 or later. JavaScript test harnesses import `.ts` modules through Node's native type erasure; browser fixtures use Vite-transformed modules. No runtime loader is added to the game.

- `npm run typecheck`: strict, no-emit browser and worker checks.
- `npm run build`: both checks followed by Vite's production build.
- `npm run format:check`: source, tests and documentation formatting.

`tsconfig.json` uses DOM globals; `tsconfig.worker.json` uses WebWorker globals without DOM. The worker's prepared result satisfies the same `PreparedCourse` contract consumed by the main thread. The shared celestial-direction calculation lives with the worker-safe course lighting data; the scene-lighting module re-exports it.

Types cover tracks/frames/sections, racer state and input, projectiles, terrain, staged world scenes, craft resources, menu navigation, audio controls, progression and worker buffers. Class declarations are erased, TypeScript runtime syntax is prohibited, and no blanket `any` or unchecked-file directives are used. Vite's browser target and rendering configuration are unchanged.

## Verification

The baseline is `ea3c8d8`. Comparison of type-erased source ASTs found 79 of 84 modules identical, including physics, collisions, track geometry, fixed-step timing, input and worker calculations. The five differences are equivalent DOM string coercions and helper declarations in `main.ts`/`podium-trophy.ts`, plus moving the unchanged celestial-direction function across three modules. Independent code and gameplay/system reviews examined these differences.

Production main JavaScript is 878,340 bytes versus 878,285 baseline (+55); gzip level 9 is 247,709 versus 247,705 (+4). Worker JavaScript is 161,186 versus 161,190 bytes (−4); gzip is 48,830 versus 48,832 (−2). Assets, records and progression formats are unchanged.

Deterministic baseline/candidate simulation compared all seven tracks × three classes × both forks: 42 complete NPC trial races per version, using real terrain and configured 3/4/5 laps. All 1,019,360 fixed steps, 168 laps and 5,376 gate crossings per version match exactly, including unrounded mutable state, events and final clocks. No rail touches or rescues occurred. This single-ship fixture uses one craft per class; combat and the other craft/class combinations remain covered by separate contract tests.

Tests that evaluate source snippets erase TypeScript first. The approved airbrake implementation retains its existing baseline hash after identical JavaScript formatting. Dynamic diagnostic imports and browser mock routes target `.ts` modules.

Node contract tests run in bounded file/course/case shards. Baseline and candidate have the same 932 unique contracts: 926 pass, the same six fail, and none are incomplete, missing or added. Existing baseline failures remain visible rather than changing physics to satisfy them: two banking envelopes, Whiteout's radius, historical Coast NPC fork parity, Solar's connected-seam contact and Cinderline's airborne splitter endpoint.

Software-WebGL comparison uses production builds, isolated storage and identical Chromium/SwiftShader settings. Matched Coast/class 0 and Cinderline/class 2 runs cover desktop and portrait viewports, with a reverse-order Coast repeat. Shared-host variation reversed the apparent winner between repetitions: these samples show neither a supported regression nor a speedup. They are not physical-phone or hardware-controller benchmarks. Full track/class/lap correctness is checked separately from frame pacing.

## Dependency notes

[TypeScript 7 release notes](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) describe the native compiler, stricter defaults, explicit global type packages and lack of a compiler API. BELMONDO uses the CLI only; Vite handles transpilation. No TypeScript compiler API plugin or enum/namespace emission is required.
