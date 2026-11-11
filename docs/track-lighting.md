# Circuit lighting and barriers

Opaque ceramic wall panels sit over a dark alloy plinth, with thick ivory caps and sparse amber reflectors. Inner faces follow the existing clipped track bounds and shared fork seam. The 1.7 m collision-height silhouette is preserved; wall thickness extends outward, not into the racing lane.

Coast uses a low warm western key against cool fill. Desert uses a separate grazing amber direction. Both have a visible sun and small source-aligned lens flare with Three.js depth occlusion. Night uses cool moonlight and seven physical projector fixtures. Projector pools are baked into road/concrete vertex colours during construction, with eight transverse road strips sampling their centres. These pools do not cast dynamic shadows. No additional per-pixel projector lights or shadow maps are used.

`track-lighting.js` owns the lighting setup and celestial movement. The sun/moon follows camera translation at a fixed world direction; it does not follow camera aim. Lens-flare framebuffer resources are disposed before rebuilding the scene; normal scene cleanup disposes fixture geometry, materials and glow textures.

## Design reference

[OpenAI-generated lighting and barrier board](../public/art/track-lighting-reference.png), generated and visually inspected on 11 November 2026. This is a design reference, not a runtime texture. The material proportions, restrained amber reflectors, cool/warm contrast and distinct night projector pools informed the implementation.

- Generator: `skills/openai-image/openai-image.mjs` in the Roy workspace.
- Requested orchestration model: `gpt-5.6-sol`.
- Requested image model: `gpt-image-2.5-flare`.
- Generation ID: `ig_0ab51103b258594a016af4d8638a1487d2a5594ca8dae5faf0`.
- Prompt: “Art direction reference sheet for an original PS1-era anti-gravity racing circuit: opaque heavy ceramic and extruded alloy track barriers, low broad solid walls with dark recessed joints and thick ivory caps, narrow amber reflectors, never translucent plastic or wireframe. Three lighting studies: coastal low warm sunset against cool cyan shadow; red desert grazing amber sun with purple shaded escarpments; midnight freight harbor, visible pale moon and white industrial projectors creating distinct pools of light. Readable racing road, restrained directional lens flare near actual sun only. No text, no logos. Show close track-level barrier material detail and three landscape mood thumbnails.”
