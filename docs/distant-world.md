# Distant worlds

Each course has an original, authored 360° matte-painted horizon: coastal islands and terraced settlements, layered desert mesas and power silhouettes, or a midnight ridge with freight docks and city towers. Clouds, atmospheric haze and restrained night windows give each landscape a distinct identity. Nearby terrain and districts provide translation parallax; the distant sphere responds only to camera rotation.

`src/sky.js` paints one 1024×512 RGBA panorama when a course is built. It is the scene background, not a lighting environment or additional scenery meshes. Longitude endpoints and both poles are continuous, and the lower hemisphere matches the course's actual fog. A clear pocket shares the physical sun/moon's direction so painted terrain cannot falsely overlap their discs.

The source occupies 2 MiB. Three.js 0.187 converts it to a 512px cubemap, approximately 8 MiB including mipmaps, plus render-target depth storage. Course rebuilds dispose the source background; Three.js's disposal listener releases its derived cube target. No panorama generation occurs in the frame loop.

## Acceptance

- Eight focused CPU checks cover seamless longitude, poles, fog, celestial clearance, deterministic course diversity and independent texture ownership. Full suite: 186 tests; build and formatting pass.
- Independent Sol review approved orientation, colour space, celestial clearance and source/derived resource disposal.
- Browser visual and repeated-rebuild resource acceptance is pending; CPU checks do not establish visual quality or device performance.
