# Printing and assembling a Muju set (Bambu Lab H2C)

**Status: digitally validated, physically untested.** No part here has been printed or sliced.
The fits are candidates. Print the calibration coupons first (below), measure them, and update
`cad/params.json` before a production run. Nothing in this folder starts a printer.

One complete set = **891 printed objects** in one variant (Facet, Pebble or Turned Court). The
three variants are design alternatives. You print only one of them.

## What to download

| You want | File |
|---|---|
| Fit coupons (print these first) | [`../downloads/muju-physical-calibration-IF1.zip`](../downloads/muju-physical-calibration-IF1.zip) or [`calibration/`](calibration/) |
| Facet — full print package | [`../downloads/muju-physical-facet.zip`](../downloads/muju-physical-facet.zip) · plates in [`facet/plates/`](facet/plates/) |
| Pebble — full print package | [`../downloads/muju-physical-pebble.zip`](../downloads/muju-physical-pebble.zip) · plates in [`pebble/plates/`](pebble/plates/) |
| Turned Court — full print package | [`../downloads/muju-physical-turned.zip`](../downloads/muju-physical-turned.zip) · plates in [`turned/plates/`](turned/plates/) |
| Quantities, mass estimate, spools | [`BOM.md`](BOM.md) · [`BOM.csv`](BOM.csv) |
| Physical test plan with blanks | [`PHYSICAL-TEST-SEQUENCE.md`](PHYSICAL-TEST-SEQUENCE.md) |
| Individual parts | `../models/<variant>/stl/`, `step/`, `glb/` |

Each variant ZIP holds every production STL, the plate 3MFs, this guide, the BOM and the editable
source. STEP files (neutral B-rep) are in `../models/<variant>/step/` and `../models/shared/step/`.

### Geometry-only 3MF, not slicer projects

Every `.3mf` here is a **geometry-only** 3MF: millimetre units, named objects, positions on a
300 × 320 mm plate, and a named base material with a display colour per object. It contains **no**
printer, process or filament profile, no AMS slot mapping and no G-code. Bambu Studio will ask
you to choose the printer and filaments. Map the material name (for example `ivory — Bambu PLA
Matte Ivory White`) to the spool you loaded. The display colour alone does not select a spool.

## Printer set-up assumptions

These come from Bambu Studio's shipped H2C profiles (see `../research/printing-guidance.md`). Check
them against the current Bambu wiki. The wiki pages could not be fetched from the build
environment.

- **Bambu Lab H2C**, 0.4 mm nozzle, **Textured PEI** plate (the H2C default; Cool Plate and Smooth
  PEI are marked unsupported for the H2C in the slicer data).
- **One colour per plate.** No purge tower is needed. Plates keep parts inside the 300 × 320 mm area
  that both toolheads can reach, so either nozzle can print them.
- **PLA:** 0.20 mm layers, 3 walls, 4 top and 4 bottom layers, 15–20 % infill. **Glyphs:** use 100 %
  infill or 4 walls for stiffness. They are thin, and matte PLA is weaker across layers (the glyphs
  are PLA Basic).
- **PETG crystals:** 0.20 mm layers (0.16 mm for crisper cubes), 3 walls, 100 % infill for even
  translucency. Use a thin glue layer on Textured PEI if the profile recommends it. Dry PETG first
  (55–65 °C, about 12 h per the slicer data).
- Keep **elephant-foot compensation** at the profile default (0.15 mm). The models already have
  0.3–0.5 mm bottom chamfers. Do **not** turn on extra hole/contour compensation until the coupons say so.

## Plates for one variant (replace `facet` with your variant)

| Plate file(s) | Filament | Contents |
|---|---|---|
| `facet-gray-tiles-plate01…06.3mf` | PLA Matte medium gray | 98 ordinary tiles: 52 interior + 12 flat interior, 5 + 3 flat south edge, 5 + 3 flat north edge, 8 west edge, 8 east edge, NW and SE corners |
| `facet-ivory-army-plate01.3mf` | PLA Matte Ivory White | 48 bases, 18 T2, 6 T3, A1 home tile |
| `facet-charcoal-army-plate01.3mf` | PLA Matte Charcoal | 48 bases, 18 T2, 6 T3, J10 home tile |
| `facet-fire-glyphs-plate01.3mf` … `metal` | PLA Basic Red / Yellow / Cobalt Blue / Purple / Bambu Green, PLA Metal Copper Brown | 16 glyphs each |
| `facet-crystals-a-plate01.3mf`, `-b-` | PETG Translucent Teal | 275 + 275 cubes and the half-crystal token |

Army plates hold 73 objects. If adhesion or job length is a concern, split them in the slicer; the
positions are only a starting layout.

### Turned Court · Keyed and · Rings (IF2 pieces with tier dots)

These two variants print their glyphs, tiles and crystals from the **Turned Court** plates. Only
the pieces differ:

| Plate file | Filaments | Contents |
|---|---|---|
| `turned-keyed-ivory-army-plate01.3mf` (and `-charcoal-`, and `turned-ring-…`) | slot 1: army colour (PLA Matte Ivory White / Charcoal); slot 2: **PLA Basic Turquoise** | 6 T3, 18 T2, 48 bases. Each is a two-part object: body + tier dot |
| `turned-keyed-ivory-home-plate01.3mf` (and `-charcoal-`) | army colour | the A1 / J10 home tile |

On import, check in Bambu Studio that each piece shows two parts with the dot on filament 2. The
3MF carries Bambu's part-to-filament map, but it has not been confirmed in the Bambu Studio
window. Print upright, groove down: the groove ceilings are 2 mm annular bridges and need no
support. Do not add a brim; it would fill the beam slits.

### Board in nine sections (alternative to the 100 tiles)

`print/<variant>/sections/<variant>-sections-gray-<sw|s|se|w|c|e|nw|n|ne>-plate01.3mf` and
`…-sections-gradient-…`: one section per plate, flat, top up.

- **Gray scheme:** all sections are single colour (PLA Matte Ash Gray) except SW (the A1 square
  in Ivory White) and NE (the J10 square in Charcoal).
- **Gradient scheme:** every square is coloured by its starting crystals, as listed in the
  table below. Each section is a multi-part object, one part per colour, with Bambu filament
  slots in the order given by the 3MF's material list.

| Squares | Filament |
|---|---|
| 16 | PLA Matte Bone White |
| 8 | Ash Gray |
| 4 | Nardo Gray |
| 0 | PLA Basic Dark Gray |
| A1 / J10 homes | army colours |

The section joints use the tile tabs (0.25 mm per side). The 4 × 4 centre is the largest print,
209 mm across with its tabs.

### Print orientations (as modelled, no supports needed)

| Part | Orientation | Notes |
|---|---|---|
| Tile | Flat, studs up | 4 mm thick. Add a brim to the corner and edge types only if they lift. |
| Ownership base | Upright: recess down, slot up | Recess ceiling (14.3 mm octagon) bridges. 0.9 mm of material separates recess and slot. |
| T2 addition | Upright: recess down, boss up | Recess ceiling bridges. |
| T3 addition | Upright: flat bottom, boss up | |
| IF2 base / T2 (Turned Court · Keyed, · Rings) | Upright: groove down, slot or collar up | The annular groove ceiling bridges about 2 mm. Beam slits must stay open. No brim. |
| IF2 T3 | Upright: flat bottom, collar up | Rings: open bore, no bridging |
| Board section | Flat, top up | Brim optional on the corner sections |
| Glyph | Flat, front face up | Tang lies in the plane. Layers run parallel to the glyph, so the thin direction is strong in bending. |
| Crystal | Socket down, stud up | 3.45 mm socket ceiling bridges. |
| Half token | Upright on its triangle, notch down | The half-round notch on the cut face bridges 1.8 mm up; no support. |

## Assembly

1. **Board.** Tile type follows position: east and north tabs where a neighbour exists, west and
   south sockets where one exists. Lay tiles from **A1** (Ivory's left-front corner: the ivory
   corner tile) row by row. Each tile drops straight down into its neighbours' sockets. The
   charcoal corner tile is **J10**. Rank 1 faces the Ivory player and file A is on Ivory's left.
   The on-screen board draws rank 1 at the top, so the physical board is the screen view seen from
   Ivory's seat.
2. **Crystals.** Place them from the canonical map (`muju/src/game/resourceMap.ts`: 0 / 4 / 8 / 16).
   A tile holding 4 gets one cube on each stud; 8 gets two-high stacks; 16 gets four-high stacks.
   Total: 504. Mine from the top of a stack. The half-crystal token is Black's 0.5 handicap
   crystal. It fits on a stud or a stack top but has no stud of its own.
3. **Pieces.** Push a glyph's tang straight down into a base slot. It fits only one way: the
   chamfered tang corner goes to the slot's front-right filled corner, and the glyph faces the
   front. **Promote** by lifting the piece and pressing it onto a T2 (octagon boss into the base
   recess). For T3, press that stack onto a T3. Keep all three layers; never swap T2 for T3.
   Separate layers by pulling them straight apart, using the wider step of the layer below as a
   finger grip.
4. **Pending summons (Phasing Prepare).** Take a glyph from supply, or pull it out of a base, and lay
   it **flat, face up** on the committed square. Nothing else marks it. Orient it so the symbol
   reads **upright from its owner's seat**; that orientation identifies whose summon it is when both
   players' pending glyphs are on the board. On arrival, push the glyph into a base of the owner's
   colour. If the summon is disrupted (occupied or unsupported square), return the glyph to
   supply and refund the crystals.
   - A real piece may stand on a square with a pending glyph (SPEC §5.2). Slide the loose glyph
     into that square's free corner. It may overhang the tile seam slightly next to a large piece
     (see `../validation/digital-checks.md`). Its centre stays on its own square, and that square
     is where it belongs.

## Before a full run

Print `calibration/` first and follow [`PHYSICAL-TEST-SEQUENCE.md`](PHYSICAL-TEST-SEQUENCE.md).
Change only `cad/params.json`, then regenerate:

```sh
python3 -m pip install -r outputs/muju-physical-set-v1/cad/requirements.txt
python3 outputs/muju-physical-set-v1/cad/build.py
python3 outputs/muju-physical-set-v1/cad/assemblies.py
python3 outputs/muju-physical-set-v1/cad/validate.py
python3 outputs/muju-physical-set-v1/cad/package.py
```
