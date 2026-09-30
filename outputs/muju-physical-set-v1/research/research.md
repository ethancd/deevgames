# Research — Muju physical set v1

Date: 2026-09-30. Detailed notes are in the linked files. Sources are cited as [S##] from
[`web-sources.md`](web-sources.md).

| Topic | File |
|---|---|
| H2C, PLA/PETG, FDM joint guidance | [`printing-guidance.md`](printing-guidance.md) |
| Filament shortlist (ten colours) | [`filament-shortlist.md`](filament-shortlist.md) |
| Prior art: joints, bases, stacking, studs | [`prior-art.md`](prior-art.md) |
| Source ledger (dated, retrieved vs not) | [`web-sources.md`](web-sources.md) |
| Glyph reference sheet (canonical → printable) | [`muju-glyph-reference-sheet.png`](muju-glyph-reference-sheet.png) / `.svg` |
| Observed Muju UI (local build of this commit) | [`muju-references/`](muju-references/) |
| Decisions, dimensions, open questions | [`engineering-decisions.md`](engineering-decisions.md) |

## Research limits

- The egress proxy blocked the Bambu wiki, the Bambu store, the H2C product page, Prusa,
  Formlabs, Hubs, Xometry and Printables. It also blocked the live site
  `https://deevgames.pages.dev/muju/`. The ledger lists each blocked page as "not retrieved" and
  cites nothing from it.
- Bambu facts therefore come from **Bambu Studio's shipped H2C profiles** (first-party slicer data
  on GitHub, commit dated 2026-09-28) [S01–S05]. That data is authoritative for what the slicer does.
  It is not a written guide.
- **Prices, stock and spool weights are not verified.** The BOM uses a placeholder price and says so.
- No image-generation tool, slicer binary or printer was available. The concept stage uses vector
  sketches; slicer checks and physical tests are recorded as pending.

## 1. Muju sources inspected (repository revision in `manifest.json`)

| Source | What it fixes for the physical set |
|---|---|
| `muju/src/components/ElementGlyph.tsx` (sha256 in manifest) | The six glyph paths: flame, bolt, droplet, crescent, leaf with a vein stroke, and anvil (two paths). Parsed programmatically; see the reference sheet. |
| `UnitArtwork.tsx`, `Unit.tsx` | On screen, army is shown by material/silhouette (round ivory, octagonal charcoal) and tier by 1–3 pips. The **brief deliberately changes** this: both armies use the same octagon and tier is shown by additive pedestals. |
| `muju/src/utils/colors.ts`, `index.css` | Element hues. Metal is copper/orange (`#F2A54C`, `#934A18`), not silver, which confirms the copper filament. The on-screen per-army tints are **not** used; one filament per element. |
| `muju/src/game/resourceMap.ts` | Read by `build.py`: 100 values, 504 crystals, counts 0:18 / 4:54 / 8:20 / 16:8 (asserted). Index = `y*10 + x`. |
| `board.ts` `getStartCorner` | White (0,0) = **A1**, Black (9,9) = **J10**. Coordinate labels: letter = x, number = y+1 (`Cell.tsx`). |
| `SPEC.md` §5.2–5.4, `turn.ts`, `summoning.ts` | Phasing timing, pending-summon rules and promotion (below). |
| `units.ts` | Tier-1 names for labels (Hi, Radi, Sjór, Loş, Muju, Poṉ). |
| `CrystalLights.tsx` | The UI shows reserves as lights at edge midpoints, then corners. The physical studs at the four edge midpoints match that reading. |

**Observed UI.** `muju-references/muju-ui-board-start.png` and `-closeup.png` are captures of this
commit's own build (Vite dev server, pass-and-play start). The live URL was blocked. The UI draws
rank 1 at the **top**. The physical board places rank 1 nearest the Ivory player, so seen from
Ivory's seat it is the on-screen board flipped top-to-bottom. The coordinates are the same.

### Rule reading relevant to the objects

- **Pending summons (SPEC §5.2).** A commitment is made in Prepare, at the end of the owner's turn,
  on an empty square in an unblocked spawn rectangle. It resolves at the owner's **next** turn start
  (`startTurn → resolveSummons`). "Real units may move through or stop on that square", so a
  pending marker **can** share a square with an occupying piece of either colour until arrival.
  An occupied square on arrival refunds the summon.
- **Overlap of cohorts.** White commits at the end of White's turn. During Black's turn, Black's
  own earlier commitments resolve at Black's turn start, then Black commits new ones in Black's
  Prepare. From that moment until White's next turn start, **both players' pending glyphs are on
  the board**. They can even share a square: a commitment only requires no *unit* there, and only
  one *own* commitment per square. A neutral glyph therefore needs an owner cue. Handling rule
  (physical, not a rule change): **lay it face-up so the symbol reads upright from its owner's
  seat.** No tray, marker or engine change.
- **Promotion (§5.4).** In place, once per turn, T1→T2→T3, never skipping. Additive pedestals map
  one-to-one: promote = lift the piece and press it onto the next pedestal.
- **Handicap.** Black starts with 0.5, 1.5 … 18.5 crystals (default 0.5), so a **half-crystal
  token** plus up to 18 whole cubes from stock (spares are in the 550).

## 2. Printing guidance — what changed the design

Details and citations: `printing-guidance.md`.

- **H2C area:** bed 330 × 320 mm. Both heads reach **300 × 320 mm** (X 25–325) [S01][S03].
  **Design:** every plate 3MF is packed into 300 × 320 with 8 mm margins.
- **Plate:** the Textured PEI default; Cool Plate and Smooth PEI are listed as unsupported on the
  H2C [S02]. **Design:** 0.3–0.5 mm bottom chamfers on every part instead of relying on a
  smooth-plate finish.
- **Elephant foot:** 0.15 mm profile compensation by default [S02]. **Design:** bottom chamfers,
  plus mouth chamfers on every socket that is printed opening-down (base/T2 recesses, crystal
  sockets).
- **Anisotropy:** across-layer impact strength of PLA Matte is about half that of PLA Basic in
  Bambu's data [S04]. **Design:** glyphs (PLA Basic/Metal) print **flat**, so their thin direction
  bends within layers. No retention feature is a cantilever snap loaded across layers.
- **Fits:** sources span 0.05–0.25 mm per side depending on printer and fit type [S14][S18–S24].
  No universal tolerance exists. **Design:** candidate fits plus coupon sweeps for every interface
  (see decisions).
- **PETG:** 245 °C with low fan and max 6 mm³/s for translucent PETG on 0.4 mm [S04]; it strings
  more than PLA. **Design:** simple cylindrical sockets with 0.3 mm entry chamfers. Crystals print
  socket-down at 100 % infill for even translucency.
- **Small parts:** 550 cubes are split across two plates to limit the cost of one adhesion failure.

## 3. Prior art — lessons taken (details and licences in `prior-art.md`)

| Example | Lesson applied | Geometry reused? |
|---|---|---|
| OpenLOCK / clip terrain tiles | Separate clips add parts and fiddliness. Integral broad tabs that drop in vertically are simpler; clearances around 0.1–0.25 mm per side. | No (licence unverified) |
| Gridfinity | 0.25 mm per-side grid gaps; crush ribs with small interference for repeatable press fits | No; ribs are our own geometry |
| LEGO-style stud/socket (LEGO.scad, MIT) | Stud-in-socket stacking with small engagement (1.7–1.8 mm) is enough for stacks that lift apart one at a time. We use our own Ø3.2 × 1.6 mm stud; **no brick compatibility**. | No |
| BOSL2 snap pins | Snap pins need ≥ 0.2 mm slop and fatigue in PLA. **Rejected** for the glyph/pedestal joints in favour of friction fits with crush ribs. | No |
| Slotta miniature bases | A slotted base with a tab gives orientation and removability. This is the model for the glyph tang and slot. | No |
| Board Game Insert Toolkit | 0.1 mm lid fits on tuned printers; tolerance depends on the printer | No |

No third-party geometry is used. All CAD is generated from `cad/params.json`.

## 4. Earlier Muju physical work

- **Tier-1 print package** (`outputs/muju-print-reference-b5117f43/`). Reused: the approach of
  parsing `ElementGlyph.tsx` with `svgpathtools` and shapely, rounding needle tips, and the plant
  vein as a groove/slot. Superseded: the flat relief tokens, round/angular army bodies and pips.
  The archive was read without modification.
- **Baroque concept gallery** (`outputs/muju-baroque-reference-v1/`, 18 concept images). Useful:
  a stepped turned plinth, fluting and a crowned top give the "Turned Court" language and read
  well at a glance. Unsuitable: tall monolithic figurines (not additive, fragile finials, heavy
  supports), inlaid pip jewels, and a silver/steel metal reading in places. The Turned Court
  variant borrows only plinth, crown and flutes.
