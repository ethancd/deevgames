# Muju Tier 1 printable tokens

Twelve flat, raised-art pieces: all six Tier 1 elements for the White and Black
teams. White has a rounded body; Black has an angular body. Each piece has its
element symbol and **one Tier 1 pip**, both in the element's filament color.

| Element | Piece | Symbol filament |
|---|---|---|
| Fire | Hi | Red |
| Lightning | Radi | Yellow |
| Water | Sjór | Blue |
| Shadow | Loş | Purple |
| Plant | Muju | Green |
| Metal | Poṉ | Bronze or orange |

Use white or black filament for the body. These are color suggestions, so choose
the closest available filament. Ordinary bronze-colored PLA works; metal-filled
filament is not required. Use the same material type for the body and symbol.

## Start here

**For a printer with automatic color changes:** open the token you want from
`files/3mf/`. It contains one assembled token with two named parts. Assign the
base to white/black filament and the details to the element's color in your
slicer. Select your own printer and filament profiles, then slice.

**For a basic single-filament printer:** open that token's file from `files/stl/`.
Print in white or black up to **3.2 mm**, then change to its element color before
the first relief layer. At a constant 0.20 mm layer height, including the first
layer, the base is 16 layers; change filament before layer 17 (the layer ending
at Z=3.4 mm). Use the slicer's preview to select that layer, because a different
first-layer height changes the layer number. Your printer/firmware must support
the slicer's pause or color-change command. Print one element color per job.
This follows the usual [layer color-change workflow](https://help.prusa3d.com/article/color-change_1687).

Keep the flat underside on the bed and the artwork facing up. No support
structures are needed by this geometry. Start with a 0.4 mm nozzle, 0.20 mm
layers, 3 walls, 4 top/bottom layers and 15–20% infill; these are suggested
starting settings, not a tested printer profile. Use the filament maker's
temperature settings. Print one token first to check adhesion and symbol detail.

## Files and dimensions

- `files/3mf/`: 12 individual tokens, each with two aligned material parts.
- `files/stl/`: 12 fused, watertight tokens for a manual layer swap or one color.
  STL has geometry only: the filename does not set the filament color.
- `files/parts/`: matching `_base.stl` and `_details.stl` pairs. Fallback if your
  slicer ignores 3MF materials: import both files **as parts of one object**,
  preserving their coordinates. Do not drop the details separately onto the bed;
  their underside is intentionally at Z=3.2 mm.
- `files/element-pairs/`: a white and black piece of the same element per 3MF
  (3 filament colors; approximately 65 × 30 mm).
- `files/plates/white_six_elements.3mf` and `black_six_elements.3mf`: six
  assembled tokens in a 3 × 2 layout (approximately 102 × 66 mm; 7 colors each).
- `files/plates/all_12_tokens.3mf`: complete set in a 6 × 2 layout
  (approximately 210 × 66 mm; 8 colors). Use individual tokens or element pairs
  if your printer has fewer color slots or a smaller bed.
- `files/plates/*.stl`: fused six-token plates for single-color printing.
  One layer swap on these would give every element the same symbol color.

Dimensions are **millimeters**. Black bodies are 30 × 30 mm; White bodies are
approximately 27.91 × 30 mm. Both have a **3.2 mm base + 0.8 mm relief = 4 mm**
total height. Bases have small top and bottom chamfers. The leaf vein is a groove
through the raised symbol, exposing the base beneath. Uniform scaling in a
slicer is possible; scaling down also makes the details and the color-change
height smaller. The stock files fit comfortably on board squares at least 32 mm
wide. No board is included.

These are standard [3MF](https://3mf.io/spec/) geometry assemblies with named
base materials and preview colors. They contain no machine settings or G-code.
Map their material names to your actual filament: a preview color alone does
not select a spool. Display/import behavior varies between slicers.

## Provenance and validation

`build.py` reads the canonical unit names, `UnitArtwork.tsx` army shapes and
`ElementGlyph.tsx` symbols. It preserves one tier pip, slightly reduces the
symbols to clear the printable chamfer, and rounds needle tips by 0.16 mm.
Metal uses bronze/orange, consistent with the current site artwork. The pip
shares the symbol color to keep each token a two-filament print.

`manifest.json` records source hashes, commit, palette, dimensions and output
hashes. `validation.json` reports re-imported STL and 3MF mesh checks, outward
winding, solid shells, strict lib3mf reads, closed horizontal sections, and
gap-free/non-overlapping base-to-relief contact. Every fused token is one
connected solid. The separate detail part intentionally contains a symbol and
a disconnected pip; both are bonded to the same base when printed.

`preview.png` and `preview-top.png` render the exported geometry. Geometry
validation is complete; **these files have not been physically printed or
verified in a printer-specific slicer**.

## Regenerate

Regeneration requires this directory inside the full `deevgames` repository so
the generator can read the current Muju sources. Printing the supplied files
requires only a slicer, not Python or Blender. From this directory, using
Python 3.14 and Blender 5.1 (the versions used here):

```sh
python3 -m venv /private/tmp/muju-print-venv
/private/tmp/muju-print-venv/bin/python -m pip install -r requirements.txt
/private/tmp/muju-print-venv/bin/python build.py
blender --background --factory-startup --python render.py
/private/tmp/muju-print-venv/bin/python package.py
```

The renderer is separate from mesh generation. `build.py` does not require
Blender. On this Mac, Blender's first sandboxed background launch crashed before
running the script; the authorized background launch outside the sandbox works.
That initial launch did not write or alter any printable mesh.

For impact review, run `python3 tools/muju-content-dag.py plan --kind print`
from the repository root. This physical asset surface does not alter gameplay,
rules, AI, Academy content or deployed websites.
