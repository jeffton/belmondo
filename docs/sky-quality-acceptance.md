# Horizon sampling

## Cause and change

The CINDERLINE screenshot shows long horizontal steps in the painted distant ridges. `paintSky` classified each latitude texel as entirely sky or entirely mountain. Linear texture filtering softened those already-rasterized steps; increasing the panorama resolution alone retained them.

Far ridges, near ridges and city roofs use fractional latitude-texel coverage. The seven authored panoramas share a 2048×1024 source budget. Profiles, colors, biome features, clouds and celestial directions are unchanged. Nearby terrain geometry and the LOW RES framebuffer retain their faceted/pixelated style.

Three.js r187 converts this equirectangular background to a cubemap. The normal background path does not use PMREM/CubeUV; background blur is zero. Source and cube use linear/mipmapped filtering. LOW RES renders the complete scene at 55% of viewport size; it does not choose a different panorama.

## Acceptance

- Seven courses × desktop 1500×768 / portrait 390×844 × LOW RES / clean × before / after: 56 actual World/Race fixture captures. Representative stationary chase views, not native driving or mobile-hardware performance tests.
- CINDERLINE has an additional shallow-horizon diagnostic with foreground objects hidden. Its race capture uses the open start straight; the redesigned route does not share the screenshot's exact original position.
- Visual inspection: shallow ridge shelves are removed without blurring the course; vertical city silhouettes and each biome remain distinct. LOW RES retains its intentional raster size.
- CINDERLINE source regression: maximum adjacent-column contrast at a shallow far ridge falls from 53 to 15 levels; near ridge from 43 to 3.
- Three course cycles, all seven skies: 21 replacements retain two textures, one background geometry, one draw call and 12 triangles. No resource growth.
- Source plus generated cubemap, RGBA8 including mipmaps: approximately 42.7 MiB per active sky. This matches the four expansion skies' existing budget; the original three increase by approximately 32 MiB. Only one course background is retained.
- Independent Sol review approved the implementation. Focused sky tests and production build pass. Full-suite acceptance belongs to release integration.

Raw captures, diagnostic scripts and resource measurements: `/var/tmp/belmondo-sky-polish-qa/` on the QA host.
