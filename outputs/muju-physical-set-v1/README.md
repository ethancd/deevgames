# Muju physical set v1

This folder holds three printable variants of one modular Muju tabletop set for a Bambu Lab H2C,
each with every part modelled. It contains parametric CAD, STEP/STL/3MF/GLB exports, assemblies
for all 108 piece states, a BOM, fit coupons, digital validation and a local comparison gallery.

**Status: digitally validated and sliced (Bambu Studio, H2C profile), physically untested.** Read [`STATUS.md`](STATUS.md)
for what was and was not done.

| Start here | |
|---|---|
| Local gallery | [`gallery/index.html`](gallery/index.html). It must be served over HTTP; see below. |
| Print and assembly guide | [`print/README.md`](print/README.md) |
| Physical test plan | [`print/PHYSICAL-TEST-SEQUENCE.md`](print/PHYSICAL-TEST-SEQUENCE.md) |
| BOM | [`print/BOM.md`](print/BOM.md) · [`print/BOM.csv`](print/BOM.csv) |
| Downloads | [`downloads/`](downloads/): a ZIP per variant, the calibration set and the source |
| Models | [`models/<variant>/{stl,step,glb}/`](models/) and [`models/shared/`](models/shared/) |
| Decisions and dimensions | [`research/engineering-decisions.md`](research/engineering-decisions.md) |
| Research | [`research/research.md`](research/research.md) |
| Concepts | [`concepts/README.md`](concepts/README.md) |
| Digital checks | [`validation/digital-checks.md`](validation/digital-checks.md) |
| Slicer checks | [`validation/slicer/slicer-checks.md`](validation/slicer/slicer-checks.md) |
| Manifest | [`manifest.json`](manifest.json): part ids, quantities, dimensions, paths, source hashes |

## The three variants

| | Facet | Pebble | Turned Court |
|---|---|---|---|
| Brief direction | crisp chamfered | soft octagonal | restrained turned/fluted |
| Edges | 45° chamfers | rounded corners and quarter-round edges | plinth, crown, broad flutes, stepped glyph plateau |
| Interfaces | IF1 | IF1 | IF1 (identical; one calibration serves all three) |
| Objects per set | 891 | 891 | 891 |

## View the gallery

```sh
cd outputs/muju-physical-set-v1
python3 -m http.server 8000
# open http://localhost:8000/gallery/
```

The server is local only. Nothing here is published. The viewer (three.js r170, MIT) is
vendored in `gallery/vendor/`, so no network is needed. If WebGL is unavailable, the still
renders in `renders/` (and the gallery's image sections) still work.

## Regenerate

Requires Python 3.10+ and, for renders and QA, Node 22 with the `playwright` package and its
Chromium. Run from the repository root:

```sh
python3 -m pip install -r outputs/muju-physical-set-v1/cad/requirements.txt
python3 outputs/muju-physical-set-v1/cad/build.py           # CAD -> STEP/STL/GLB, plate 3MFs, manifest (~2 min)
python3 outputs/muju-physical-set-v1/cad/assemblies.py      # 108 states, loose/beside, board, patch
python3 outputs/muju-physical-set-v1/cad/validate.py        # digital checks -> validation/
python3 outputs/muju-physical-set-v1/cad/reference_sheet.py # glyph reference sheet
python3 outputs/muju-physical-set-v1/cad/concepts.py        # vector concept boards
python3 outputs/muju-physical-set-v1/cad/worstcase_drawing.py
node    outputs/muju-physical-set-v1/cad/render.mjs         # renders of the exported GLBs (~25 min, SwiftShader)
python3 outputs/muju-physical-set-v1/cad/gallery_content.py
python3 outputs/muju-physical-set-v1/cad/slice_check.py     # slice every plate in Bambu Studio (macOS app path; ~4 min)
python3 outputs/muju-physical-set-v1/cad/package.py         # BOM (with slicer totals), ZIPs, SHA256SUMS
node    outputs/muju-physical-set-v1/cad/gallery_qa.mjs     # browser QA -> validation/gallery-qa/
```

All dimensions live in [`cad/params.json`](cad/params.json). The generator reads
`muju/src/components/ElementGlyph.tsx`, `muju/src/game/resourceMap.ts` and `units.ts` directly, so
it must run inside this repository. The source hashes it used are recorded in `manifest.json`.

Impact mapping: `python3 tools/muju-content-dag.py plan --kind print` (node `physical-set`).
This surface changes no rules, AI, site or Academy content.
