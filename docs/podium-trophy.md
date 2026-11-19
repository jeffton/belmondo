# Podium cup

The race report shows a gold, silver or bronze 3D cup for Combat places 1–3. Time Attack, elimination and lower placements show no cup. Practice results may show a cup without saving records. The paddock uses only the small course-selection trophies for saved Combat podiums.

The model extrudes the circuit-button SVG silhouette, including both open handles, with angular beveled edges and the same three colors. One lazy WebGL renderer draws one mesh; it runs only while a podium race report is displayed, stops when the document is hidden, and honors reduced motion. No persistence, race physics, record or progression code changes.

## Verification

`node tests/podium-trophy.browser.mjs` runs the real app, renderer, Race and RAF from a test-only near-finish fixture. It checks crossing, immutable result/persistence, result-to-paddock flow, cup color/place, bounds and text/action separation, rotation, one draw call, fewer than 500 triangles, the absence of a 3D cup in the paddock and Time Attack, and the retained course-selection trophy. It does not claim a full race was driven.

Matrix verified: Combat places 1/2/3/4, Combat elimination, Time Attack finish/elimination; all three classes; 1280×800, 390×844 and 844×390; keyboard, touch and simulated controller; reduced motion. Screenshots are under untracked `test-artifacts/podium/`.

The source-level test owns this result contract. The compiled-bundle probe depended on minifier-specific source rewriting and is excluded from the maintained suite; deployment smoke tests do not claim fixture-driven podium coverage.

Build, formatting and 40 finish/progression unit regressions pass. The complete suite was attempted with a 55-second cap: 542 passed, 35 failed, 28 cancelled; existing geometry/AI/layout hashes and the existing missing-rumble mock fail, with remaining cases cancelled at the time limit. The full suite is not green.
