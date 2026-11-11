# BELMONDO typography

**Belmondo Circuit** is original display lettering shared by the wordmark, menu choices, pause and results headings, race numerals and major controls. Archivo provides small labels, reading text and precision timers. The same display/support hierarchy applies across every screen.

## Original display face

Circuit is built from hand-authored route geometry on a 600 × 700 cap grid: heavy strokes, flat-cut terminals, chamfered junctions, compressed proportions and a fixed forward rake. Angular counters in B/D/O, the raised central junction in M and the squared launch arch in A form its signature. Digits have equal advances to prevent speed and position jitter. Small technical labels remain in Archivo rather than compressing the display face below readable sizes.

No third-party font outlines, WipEout logos or Psygnosis assets are used. The reference is the graphic discipline of [The Designers Republic’s PS1 racing work](https://www.thedesignersrepublic.com/project/wipeout), not copied letterforms.

The complete original glyph source and builder are in [`build-belmondo-circuit.py`](../public/fonts/build-belmondo-circuit.py). The build requires FontTools; version 4.68.0 was used for verification:

```sh
python public/fonts/build-belmondo-circuit.py
```

The script produces `public/fonts/belmondo-circuit-bold.ttf`, including font metadata and fixed timestamps for byte-reproducible output. Capitals, lowercase-to-capital mappings, tabular digits and interface punctuation are included. Copyright 2026 BELMONDO contributors. Font software and glyph source are licensed under the included [SIL Open Font License 1.1](../public/fonts/belmondo-circuit-OFL.txt).

## Supporting fonts

All fonts are served locally; the interface makes no runtime request to a font service.

**Archivo:** unmodified variable upright and italic TTFs from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/archivo). Original filenames: `Archivo[wdth,wght].ttf` and `Archivo-Italic[wdth,wght].ttf`. Local filenames: `public/fonts/archivo-variable.ttf` and `archivo-italic-variable.ttf`. Copyright 2020 The Archivo Project Authors. SIL Open Font License 1.1, included as [`archivo-OFL.txt`](../public/fonts/archivo-OFL.txt). [Original project](https://github.com/Omnibus-Type/Archivo); [designer’s specimen](https://www.omnibus-type.com/fonts/archivo/).

Noto Sans JP supplies Japanese glyphs for environmental artwork, with its included [`OFL license`](../public/fonts/notosansjp-OFL.txt) and [source](https://github.com/google/fonts/tree/main/ofl/notosansjp). Existing Barlow, IBM Plex and Chakra Petch files retain their bundled licenses; they are not loaded by the interface stylesheet.
