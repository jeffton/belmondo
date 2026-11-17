# Shared fork boundaries

The common road and both fork halves use one canonical cross-section at each authored fork endpoint. Branch clip/bounds and full-width UV coordinates describe the authored route; the shared vertices define its physical surface.

Canonical cross-sections occupy the four station intervals adjoining the two endpoints. Each adjoining common-road quad has a boundary midpoint and an undivided opposite edge. This costs two triangles per course, or sixteen on NOCTILUCENT's eight-strip road, with no extra draw calls.

Renderer and collision Float32 triangle hashes match. Frozen interior hashes verify the geometry outside those four intervals. Boundary-edge tests require bit-identical common/fork vertices at both endpoints on every course.

Independent interpolation of branch tangents can separate nominally shared endpoints. The MONSOON regression tests the ray through the 8.83 mm gap at split entry, u=0.765; the shared cross-section provides continuous support there.
