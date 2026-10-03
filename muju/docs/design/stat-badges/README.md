# Stat badges on the selected piece: five prototypes (2026-10-03)

Owner idea: when a piece is selected, show its ATK, DEF, SPD and MINE around the
piece, color-coded: red ATK, blue DEF, yellow SPD, green MINE.

`prototype.mjs` draws each variant onto the real Learn to Play board in a
Playwright session against the dev server: it selects a piece and injects the
badges. Each sheet below shows V1–V5 left to right for one scene:

| Sheet | Scene |
|---|---|
| `sheet-hi.png` | A Hi selected (elements-2) |
| `sheet-pon-preview.png` | A Poṉ previewing an attack on a Sjór (elements-2) |
| `sheet-irumbu.png` | An Irumbu (metal-3) |
| `sheet-on-crystals.png` | A Muju on a lit 16-crystal square (mine-7) |

Speed 0 and Mining 0 are dimmed, not hidden.

| Variant | What | Verdict |
|---|---|---|
| V1, corner chips | Solid colored chips on the token's corners: ATK top left, DEF top right, SPD bottom left, MINE bottom right. Damage appears inside DEF as a struck-out value (it replaces the red "−1" badge while selected). | Legible on every square, including lit crystal squares. **Recommended**, with V5. |
| V2, glyph chips | The same, with a sword, shield, arrow or crystal glyph before each number. | Self-explaining, but the pills crowd small squares and would cover neighbors on a 10×10 phone board. Use the glyphs as the Key's legend instead. |
| V3, card indices | Bare colored numerals in the square's corners. | The cleanest look, but it fails on lit crystal squares: the corner lights sit exactly there, and the numbers wash out. |
| V4, stat ring | Four arcs around the token, each as long as the stat relative to its maximum. | Pretty, but the numbers are hard to read at phone size, and it fights the selection ring. |
| V5, combat-aware | V1, except that during an attack preview the ATK chip shows the effective attack against that target ("1+1"), and the target shows only its current DEF. Both glow when the blow kills. | Puts the attack arithmetic and the element ±1 on the board, where the eye already is. **Recommended**, with V1. |

## Open details

- **Whether to show chips on an enemy you inspect.** Probably yes, with the same
  chips. Show reach already opens on inspection.
- **Yellow SPD next to the gold selection outline.** Consider an amber that
  separates better.
- **On a 10×10 phone board,** the chips must scale with the cell (about 40% of
  the token) and keep a minimum 11 px numeral.
- **Learn to Play:** the chips would make the "Your next move" panel's numbers
  redundant, in line with the near-wordless screen.
