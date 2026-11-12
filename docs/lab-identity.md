# PIP / grid laboratory

PIP is BELMONDO’s original lab-courier character: a clipped white capsule, mint visor, coral aerial and lilac fins. The SVG source is [`pip-lab-mark.svg`](../public/art/pip-lab-mark.svg). Header, action controls, pause panel and physical start signal share its proportions and palette. It is not a fictional advertising brand.

| Ink       | Paper     | Coral     | Mint      | Lilac     | Focus lime |
| --------- | --------- | --------- | --------- | --------- | ---------- |
| `#142333` | `#f3f5e7` | `#ff654d` | `#9bffd9` | `#bcafff` | `#d7ff88`  |

The graphic reference is the playful, disciplined contrast of Japanese design-lab signage and [The Designers Republic’s original racing identities](https://www.thedesignersrepublic.com/project/wipeout). Character outlines and compositions are original; no game assets or logos are copied. Circuit display lettering and Archivo support typography are documented in [typography](typography.md).

## Physical start signal

`buildStartGantry(scene, track)` keeps the existing `{ update, assembly }` API. Its signal stays at track station 42, ahead of the unchanged timing line. Large Circuit 3/2/1/GO cards, progressive capsule lamps and PIP’s changing expression carry the countdown. Mint mechanical fins snap at each stage and fan outward at GO. Motion uses race countdown/time, so pausing also freezes it; there is no independent timer or HUD countdown.

The 1024×256 canvas uploads only when its stage or loaded lettering changes. Fin transforms animate without repainting the texture. Existing scene traversal disposes the canvas texture, materials and geometry.

The label **スタート** means **start**. [`grid-start-katakana.png`](../public/art/grid-start-katakana.png) contains this real lexical label typeset in Noto Sans JP, not invented characters. It was rendered with Pillow at 64 px from [Google Fonts’ Noto Sans JP variable TTF](https://github.com/google/fonts/blob/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf), alpha-cropped and padded by three pixels. Its [font license](../public/fonts/notosansjp-OFL.txt) is bundled. No external font request is made during play.

On touch landscape screens, compact speed/thrust instruments sit below POSITION at upper left, with shield below them. The center-bottom chase view remains clear of instruments; flight-stick and action-button locations are retained.
