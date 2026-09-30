# Models

Each distinct printable geometry is exported three ways by `cad/build.py`:

- `stl/<part>.stl`: millimetres, in **print orientation**, resting on Z = 0. Tessellated from the
  B-rep at 0.01 mm linear tolerance.
- `step/<part>.step`: the neutral B-rep solid (OpenCascade). The glyph face profiles are exact
  stacked 0.1 mm offset slabs, because the kernel cannot fillet the traced outlines. That is why
  glyph STEP files are large.
- `glb/<part>@<colour>.glb`: a light tessellation for viewing, one file per colour instance, with
  sRGB-correct PBR colours from the palette.

| Folder | Parts |
|---|---|
| `facet/`, `pebble/`, `turned/` | glyph-fire … glyph-metal, base, t2, t3, and tile-{interior, edge-s/n/w/e, corner-sw/se/nw/ne} |
| `shared/` | crystal, half-crystal (used by every variant), and the IF1 calibration coupons |

Colour and quantity per set are in `../manifest.json` (instances) and `../print/BOM.md`. The
corner-sw geometry printed in ivory is the A1 home tile; corner-ne in charcoal is J10.
