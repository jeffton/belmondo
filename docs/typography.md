# BELMONDO typography

Archivo is the single Latin type family across the wordmark, main menu, pause menu, race HUD, controls and central screens. Its variable width and weight axes provide one coherent hierarchy:

- **Identity:** extra-condensed black italic, with a vermilion rule.
- **Headlines:** condensed black, upright.
- **Instruments and actions:** compact semibold/bold; tabular numerals stabilize times and speeds.
- **Reading text:** normal-width regular; small labels retain contrast and spacing.

The reference is the disciplined graphic hierarchy of [The Designers Republic’s PS1 racing work](https://www.thedesignersrepublic.com/project/wipeout), not copied logos or imitation sci-fi lettering. Archivo’s [headline origins](https://fonts.google.com/specimen/Archivo) and broad width range support both race graphics and readable interface text. [Saira](https://www.omnibus-type.com/fonts/saira/) was also considered for its industrial range; Archivo provides a more neutral grotesk base for the original identity.

## Local font assets

The interface makes no runtime request to a font service.

**Archivo:** unmodified variable upright and italic TTFs from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/archivo), downloaded 11 November 2026. Original filenames: `Archivo[wdth,wght].ttf` and `Archivo-Italic[wdth,wght].ttf`. Local filenames: `public/fonts/archivo-variable.ttf` and `archivo-italic-variable.ttf`. Weight range 100–900; width range 62–125%. Copyright 2020 The Archivo Project Authors. SIL Open Font License 1.1, included as [`archivo-OFL.txt`](../public/fonts/archivo-OFL.txt). [Original project](https://github.com/Omnibus-Type/Archivo); [designer’s specimen](https://www.omnibus-type.com/fonts/archivo/).

Noto Sans JP supplies Japanese glyphs for environmental artwork, with its included [`OFL license`](../public/fonts/notosansjp-OFL.txt) and [source](https://github.com/google/fonts/tree/main/ofl/notosansjp). Existing Barlow, IBM Plex and Chakra Petch files retain their bundled licenses; they are not loaded by the interface stylesheet.
