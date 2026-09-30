# Status — Muju physical set v1

Updated 2026-09-30 (second session: flat zero-crystal tiles, slicer checks on a Mac with Bambu Studio). Built from the prompt pack `outputs/muju-physical-set-prompts/` (master
prompt 00, brief 01, stages 02–06), executed end to end without approval checkpoints. The exact
repository revision and the sha256 of every Muju source read are in `manifest.json → sources`.

## Added in the second session (2026-09-30)

- **Flat tiles** on the 18 squares that start with 0 crystals (no studs).
- **Slicer checks:** every plate is sliced headlessly in Bambu Studio (`cad/slice_check.py`).
- **Turned Court · Keyed** and **Turned Court · Rings:** two piece variants with interface
  **IF2**. A tube collar fits an annular groove, four in-plane flex beams with bump preload
  grip it, a one-way back key aligns the layers, and a turquoise tier-dot inlay sits on every
  layer (T1 = 1 dot, T2 = 2, T3 = 3). Keyed has solid pedestals; Rings has hollow T2/T3. Both
  reuse Turned Court's glyphs, tiles and crystals. Five IF2 coupons are in `print/calibration/`.
- **Board colour by starting crystals** (mock-up): 16 Bone White, 8 Ash Gray, 4 Nardo Gray,
  0 Dark Gray, with the homes in the army colours.
- **Board in nine sections** (3×3 corners, 3×4 edges, 4×4 centre) for Facet, Pebble and
  Turned Court, in the gray and gradient schemes, with one multi-part 3MF per section.
- Design record: `research/engineering-decisions.md` → *Addendum 2026-09-30*.

## Evidence ladder

| Evidence kind | State |
|---|---|
| Concept sketches (`concepts/`) | **Done.** 9 vector boards (3 per variant) plus saved raster prompts. No AI raster art: no image-generation tool was available. |
| Actual models (`models/`) | **Done.** 221 manifest parts: 3 styles × (6 glyphs + base, T2, T3 + 12 tile types + 29 section colour parts) = 150; 2 IF2 variants × (base, T2, T3, 3 dots + 18 aliases of Turned Court glyphs and tiles) = 48; 23 shared (2 crystal, 21 coupon). STEP, STL, GLB. 117 plate 3MFs (multi-part where there are two or more colours) |
| Model renders (`renders/`) | **Done.** 50 scene renders, 116 part renders (board-section colour parts are shown in the board scenes instead) and 180 state renders of the exported GLBs (three.js in headless Chromium). Key new renders inspected. |
| Digital checks (`validation/`) | **Passed:** 0 failures. 221/221 files, 117 3MF strict reads, fits by mesh booleans (IF1 and IF2), keying, wrong-tier rejection, dot seating, 180 states, board, nine-section boards, crowded patch, inventory 891 per variant. |
| Gallery QA (`validation/gallery-qa/`) | **Passed:** 92/92 browser checks (5 variants, 8 board scenes each incl. gradient and 9-section boards), 0 console/HTTP errors, desktop 1440 px and mobile 390 px |
| Slicer checks (`validation/slicer/`) | **Passed:** all 117 plates slice headlessly in Bambu Studio 02.08.02.61 (H2C 0.4 nozzle, 0.20mm Standard, Textured PEI; guide settings), every object present, no warnings, no supports. Single-tile sets 43–47 h / 1.4 kg; 9-section board 14.5–16.7 h / 0.8 kg; IF2 army plates ~8 h each. **Multi-colour plates (tier dots, gradient sections, home squares) were sliced as one-filament geometry**: the CLI cannot slice multi-filament H2C plates without a GUI-made project, so colour-swap time is not included and part-to-filament assignment is unconfirmed. Bridges and the IF1 0.9 mm floor were not inspected in a layer preview. |
| Physical prints | **Not performed.** No printer was started and no filament was bought. `print/PHYSICAL-TEST-SEQUENCE.md` has blanks. |

## Completed artifacts

- **Research:** `research/research.md`; printing guidance, filament shortlist, prior art and a
  dated source ledger (29 read, 18 not retrieved); glyph reference sheet; captures of this
  commit's local UI; `engineering-decisions.md`; dimensioned `worst-case-tile.svg`.
- **Three variants:** Facet, Pebble and Turned Court. Each has six glyphs, a base, T2, T3, nine
  tile types (including ivory A1 and charcoal J10 homes) and the shared crystal and half token.
  891 objects per set, verified by manifest.
- **Assemblies:** 108 element × owner × tier states, loose glyphs, loose-beside-piece placements,
  0/4/8/16 resource tiles, tile join, crowded patch, full board with 504 crystals read from
  `resourceMap.ts`.
- **Print package:** `print/README.md` (H2C set-up, plates, orientations, assembly, pending-summon
  handling), BOM (CSV and Markdown), 35-object IF1 calibration set, test sequence, per-variant
  ZIPs, source ZIP and `SHA256SUMS`.
- **Gallery:** `gallery/index.html` (serve locally). It is generated from the manifest,
  assemblies and validation files.
- **Repository map:** a `physical-set` node and `print` kind in `muju/content-dag.json`, and the
  doc line in `muju/docs/CONTENT_DAG.md` (DAG check passes; 14/14 DAG tests pass). No game rule,
  AI, site or Academy file changed.

## Decisions and assumptions

- Interfaces: tang and slot with key chamfer and crush ribs; octagonal boss and recess with ribs;
  Ø3.2 mm stud with a 0.125 mm radial socket; drop-in round-head tile tabs. All candidates; see
  `research/engineering-decisions.md`.
- **Resized from the brief's starting point:** base / T2 / T3 = 25 / 28.5 / 32 mm across flats
  (not 28 / 32 / 34), so a hand-rotated T3 clears four stacks at the brief's 50 mm pitch. Heights
  are 7.5 / 4 / 4 mm; cubes are 6 mm.
- Nine tile outline types (edge/corner) so the border has no protruding tabs, plus flat (studless)
  interior, south-edge and north-edge tiles for the 18 squares that start with 0 crystals
  (12 + 3 + 3; derived from `resourceMap.ts`). The 100-tile total and the 98 / 1 / 1 colour split
  are unchanged. There are no separate connectors.
- Glyph changes from the canonical art: a 0.35 mm outward offset; the leaf vein as a closed
  through-slot plus a solid stem; bolt and leaf standing on a neck 2.5 mm off centre; the anvil's
  two paths fused. All disclosed in `manifest.json → glyph_changes`.
- Pending-summon ownership cue: the loose glyph reads upright from its owner's seat. This is
  physical handling, not a rule change. It resolves the brief window in which both players'
  cohorts are pending.
- Physical orientation: rank 1 is nearest Ivory and file A is on Ivory's left. The on-screen board
  draws rank 1 at the top.
- Filament leads come from Bambu's own slicer catalogue data. **Prices, stock and spool weights
  are not verified**: store pages were blocked. The BOM uses a labelled placeholder price.

## Blockers encountered (worked around, not resolved)

- Network policy blocked the Bambu wiki and store, the live Muju site, and most engineering
  references. The research used Bambu's slicer profiles on GitHub and the local build instead.
- No image-generation tool: vector concept sketches were made and prompts saved.
- No slicer binary in the first (cloud) session. Resolved in the second session on a Mac: `cad/slice_check.py`.

## Unresolved fit and ergonomic decisions (need a print)

1. Final clearances for all five interfaces, in each owner material: run `print/calibration/`.
2. **Crowding:** stacks on neighbouring tiles are 1.0 mm apart across a seam. If fingers cannot
   take single cubes, move to a 52–54 mm pitch (or shrink T3).
3. **Loose glyph beside a T3 with full stacks:** the largest glyphs overhang the tile edge
   (metal 48 mm², water 31 mm²) without touching anything. Accept, or scale glyphs about 10 %
   smaller.
4. PETG crystal socket on PLA studs versus on PETG studs: does mining lift the column?
5. The 0.9 mm floor between base recess and glyph slot: the bases slice without support; still look at the
   layer preview in Bambu Studio before the first army plate.
6. Colour check of Ash Gray against Ivory, Charcoal and Cobalt, and of Teal translucency at 6 mm.
7. **IF2 grip:** bump preload 0.10–0.25 mm (coupon sweep). The pull-off force of about 1 N is an
   estimate. Also check that the beams survive 100 cycles.
8. **Rings or solid pedestals:** tipping and feel in the hand (test I.7).
9. **Multi-colour plates:** open an IF2 army plate and a gradient section in Bambu Studio and
   confirm each part is on its filament. The CLI could not slice multi-filament H2C plates, so
   those were sliced as one-filament geometry.
10. **Gradient contrast:** Bone White (16) against the Ivory White home, and Nardo against Dark
    Gray, in hand.
