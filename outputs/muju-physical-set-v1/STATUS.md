# Status — Muju physical set v1

Updated 2026-09-30. Built from the prompt pack `outputs/muju-physical-set-prompts/` (master
prompt 00, brief 01, stages 02–06), executed end to end without approval checkpoints. The exact
repository revision and the sha256 of every Muju source read are in `manifest.json → sources`.

## Evidence ladder

| Evidence kind | State |
|---|---|
| Concept sketches (`concepts/`) | **Done.** 9 vector boards (3 per variant) plus saved raster prompts. No AI raster art: no image-generation tool was available. |
| Actual models (`models/`) | **Done.** 72 part geometries (20 per variant + 12 shared/coupon files); STEP, STL, GLB; 53 geometry-only plate 3MFs |
| Model renders (`renders/`) | **Done.** 25 scene renders, 72 part renders and 108 state renders of the exported GLBs (three.js in headless Chromium). All inspected. |
| Digital checks (`validation/`) | **Passed:** 0 failures. Files, 3MF strict reads, fits by mesh booleans, keying, sections, 108 states, board, crowded patch, inventory. |
| Gallery QA (`validation/gallery-qa/`) | **Passed:** 53/53 browser checks, 0 console/HTTP errors, desktop 1440 px and mobile 390 px, screenshots inspected |
| Slicer checks | **Not performed.** Bambu Studio / OrcaSlicer could not be downloaded (egress limited to this repository on GitHub). Plates are ready to import. |
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
- Nine tile subtypes (edge/corner) so the border has no protruding tabs. The 100-tile total and
  the 98 / 1 / 1 colour split are unchanged. There are no separate connectors.
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
- No slicer binary: slicer verification is pending.

## Unresolved fit and ergonomic decisions (need a print)

1. Final clearances for all five interfaces, in each owner material: run `print/calibration/`.
2. **Crowding:** stacks on neighbouring tiles are 1.0 mm apart across a seam. If fingers cannot
   take single cubes, move to a 52–54 mm pitch (or shrink T3).
3. **Loose glyph beside a T3 with full stacks:** the largest glyphs overhang the tile edge
   (metal 48 mm², water 31 mm²) without touching anything. Accept, or scale glyphs about 10 %
   smaller.
4. PETG crystal socket on PLA studs versus on PETG studs: does mining lift the column?
5. The 0.9 mm floor between base recess and glyph slot: confirm on the slicer preview.
6. Colour check of Ash Gray against Ivory, Charcoal and Cobalt, and of Teal translucency at 6 mm.
