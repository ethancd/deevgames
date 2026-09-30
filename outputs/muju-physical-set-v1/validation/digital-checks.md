# Digital checks

Generated 2026-09-30T22:09:58+00:00 by `cad/validate.py`. **Digital evidence only:** exported files re-imported and
tested with mesh booleans (manifold3d), sections (trimesh) and strict 3MF reads (lib3mf 2.5). Slicer results are separate
([`slicer/slicer-checks.md`](slicer/slicer-checks.md)); nothing was printed. Machine-readable results: [`validation.json`](validation.json).

**Result: all checks passed.**

## Files

- 221/221 STL part files pass: watertight, consistent winding, positive volume, one connected body, volume within 0.5 % of the B-rep, bounding box equals the manifest, resting on Z=0 in print orientation.
- Largest STL/B-rep volume difference: 0.031 %.
- 117 plate 3MFs read in lib3mf strict mode: warnings 0, all meshes manifold and oriented: True, units mm: True, slicer settings embedded: False (geometry-only by design).

## Interfaces (per variant)

| Check | facet | pebble | turned | turned-keyed | turned-ring |
|---|---|---|---|---|---|
| Glyph tang in base: interference (only crush ribs expected, mm³) | fir 0.289, lig 0.289, wat 0.289, sha 0.289, pla 0.289, met 0.289 | fir 0.289, lig 0.289, wat 0.289, sha 0.289, pla 0.289, met 0.289 | fir 0.289, lig 0.289, wat 0.289, sha 0.289, pla 0.289, met 0.289 | fir 0.289, lig 0.289, wat 0.289, sha 0.289, pla 0.289, met 0.289 | fir 0.289, lig 0.289, wat 0.289, sha 0.289, pla 0.289, met 0.289 |
| Glyph inserted backwards collides with key (all 6) | True | True | True | True | True |
| Base on T2 / T2 on T3 interference (ribs only, mm³) | 0.049 / 0.049 | 0.049 / 0.049 | 0.049 / 0.049 | 1.019 / 1.015 | 1.019 / 1.015 |
| Min wall slot-to-outside at z=5.5 (section) | 8.576 mm | 8.541 mm | 7.676 mm | None mm | None mm |
| Floor between recess and slot | 0.9 mm | 0.9 mm | 0.9 mm | n/a (annular groove; core margin 3.04 mm) mm | n/a (annular groove; core margin 3.04 mm) mm |

Crystals (shared): cube-on-cube interference 0.0 mm³, cube on tile stud -0.0 mm³, half token on cube -0.0 mm³; stud engagement 1.6 mm; radial clearance 0.125 mm; four-high stack 25.6 mm.

## Assemblies

- 180 of 180 element × owner × tier states resolve to existing GLB and STL files. Every T3 contains base, T2 and T3. Maximum pairwise interference inside any state: 1.019 mm³ (IF1 crush ribs; IF2 flex-beam bump preload).

## Board

- **facet:** 100 tiles = 98 gray + 1 ivory + 1 charcoal; A1 ivory, J10 charcoal; neighbour interference 0.0 mm³; outline [499.6, 499.6] mm, no tab beyond it: True; crystals 504 (resourceMap.ts total 504); types {'corner-sw': 1, 'edge-s': 5, 'edge-s-flat': 3, 'corner-se': 1, 'edge-w': 8, 'interior': 52, 'interior-flat': 12, 'edge-e': 8, 'corner-nw': 1, 'edge-n': 5, 'edge-n-flat': 3, 'corner-ne': 1}.
- **pebble:** 100 tiles = 98 gray + 1 ivory + 1 charcoal; A1 ivory, J10 charcoal; neighbour interference 0.0 mm³; outline [499.6, 499.6] mm, no tab beyond it: True; crystals 504 (resourceMap.ts total 504); types {'corner-sw': 1, 'edge-s': 5, 'edge-s-flat': 3, 'corner-se': 1, 'edge-w': 8, 'interior': 52, 'interior-flat': 12, 'edge-e': 8, 'corner-nw': 1, 'edge-n': 5, 'edge-n-flat': 3, 'corner-ne': 1}.
- **turned:** 100 tiles = 98 gray + 1 ivory + 1 charcoal; A1 ivory, J10 charcoal; neighbour interference 0.0 mm³; outline [499.6, 499.6] mm, no tab beyond it: True; crystals 504 (resourceMap.ts total 504); types {'corner-sw': 1, 'edge-s': 5, 'edge-s-flat': 3, 'corner-se': 1, 'edge-w': 8, 'interior': 52, 'interior-flat': 12, 'edge-e': 8, 'corner-nw': 1, 'edge-n': 5, 'edge-n-flat': 3, 'corner-ne': 1}.
- **turned-keyed:** 100 tiles = 98 gray + 1 ivory + 1 charcoal; A1 ivory, J10 charcoal; neighbour interference 0.0 mm³; outline [499.6, 499.6] mm, no tab beyond it: True; crystals 504 (resourceMap.ts total 504); types {'corner-sw': 1, 'edge-s': 5, 'edge-s-flat': 3, 'corner-se': 1, 'edge-w': 8, 'interior': 52, 'interior-flat': 12, 'edge-e': 8, 'corner-nw': 1, 'edge-n': 5, 'edge-n-flat': 3, 'corner-ne': 1}.
- **turned-ring:** 100 tiles = 98 gray + 1 ivory + 1 charcoal; A1 ivory, J10 charcoal; neighbour interference 0.0 mm³; outline [499.6, 499.6] mm, no tab beyond it: True; crystals 504 (resourceMap.ts total 504); types {'corner-sw': 1, 'edge-s': 5, 'edge-s-flat': 3, 'corner-se': 1, 'edge-w': 8, 'interior': 52, 'interior-flat': 12, 'edge-e': 8, 'corner-nw': 1, 'edge-n': 5, 'edge-n-flat': 3, 'corner-ne': 1}.

## Board in nine sections

- **facet / gray:** 9 sections, 11 colour parts, colours match the scheme: True; section overlap 0.0 mm³; assembled outline [499.6, 499.6] mm; largest section 208.9 mm (bed 300 × 320).
- **facet / gradient:** 9 sections, 18 colour parts, colours match the scheme: True; section overlap 0.0 mm³; assembled outline [499.6, 499.6] mm; largest section 208.9 mm (bed 300 × 320).
- **pebble / gray:** 9 sections, 11 colour parts, colours match the scheme: True; section overlap 0.0 mm³; assembled outline [499.6, 499.6] mm; largest section 208.9 mm (bed 300 × 320).
- **pebble / gradient:** 9 sections, 18 colour parts, colours match the scheme: True; section overlap 0.0 mm³; assembled outline [499.6, 499.6] mm; largest section 208.9 mm (bed 300 × 320).
- **turned / gray:** 9 sections, 11 colour parts, colours match the scheme: True; section overlap 0.0 mm³; assembled outline [499.6, 499.6] mm; largest section 208.9 mm (bed 300 × 320).
- **turned / gradient:** 9 sections, 18 colour parts, colours match the scheme: True; section overlap 0.0 mm³; assembled outline [499.6, 499.6] mm; largest section 208.9 mm (bed 300 × 320).

## IF2 joints (Turned Court keyed / ring)

| Check | turned-keyed | turned-ring |
|---|---|---|
| Base on T2 / T2 on T3 overlap = bump preload only (mm³; bound) | 1.019 / 1.015 (≤ 1.584) | 1.019 / 1.015 (≤ 1.584) |
| Wrong rotation collides (min over 45/90/180/270°, mm³) | 5.833 / 5.803 | 5.833 / 5.803 |
| Base on a T3 (wrong tier) collides (mm³) | 183.139 | 183.139 |
| Tier dots flush in pockets (max overlap mm³) | -0.0 | -0.0 |
| Groove core clears the glyph slot by (mm) | 3.04 | 3.04 |

## Crowded patch and ergonomics (digital part only)

- **facet:** T3 pieces (one at 22.5°) vs 4-high stacks: 0.0 mm³; loose glyph vs pieces/stacks: 0.0 mm³; clearance 2.5 mm flats-facing, 1.182 mm worst rotation.
- **pebble:** T3 pieces (one at 22.5°) vs 4-high stacks: 0.0 mm³; loose glyph vs pieces/stacks: 0.0 mm³; clearance 2.5 mm flats-facing, 1.182 mm worst rotation.
- **turned:** T3 pieces (one at 22.5°) vs 4-high stacks: 0.0 mm³; loose glyph vs pieces/stacks: 0.0 mm³; clearance 2.5 mm flats-facing, 1.182 mm worst rotation.
- **turned-keyed:** T3 pieces (one at 22.5°) vs 4-high stacks: 0.0 mm³; loose glyph vs pieces/stacks: 0.0 mm³; clearance 2.5 mm flats-facing, 1.182 mm worst rotation.
- **turned-ring:** T3 pieces (one at 22.5°) vs 4-high stacks: 0.0 mm³; loose glyph vs pieces/stacks: 0.0 mm³; clearance 2.5 mm flats-facing, 1.182 mm worst rotation.

Loose glyph beside an occupying piece with four 4-high stacks (largest overhang beyond its tile, mm²; nothing touched):

| Tier | fire | lightning | water | shadow | plant | metal |
|---|---|---|---|---|---|---|
| T1 | 0.0 | 0.0 | 0.62 | 2.55 | 3.2 | 14.92 |
| T2 | 0.0 | 0.21 | 9.44 | 10.08 | 4.23 | 24.31 |
| T3 | 1.38 | 3.33 | 31.06 | 21.5 | 26.2 | 47.71 |

Still needs a hand trial: finger access to single cubes when stacks sit 1.0 mm apart across a seam; whether the loose-glyph overhang is acceptable;
wobble; retention force and wear. See `print/PHYSICAL-TEST-SEQUENCE.md`.

## Print orientation / supports (from the exported meshes)

| Part | Downward faces >45° above bed (mm²) | Highest such face (mm) | Bed contact (mm²) | Interpretation |
|---|---:|---:|---:|---|
| `facet.base` | 169.41 | 1.79 | 296.8 | recess ceiling bridge (14.3 mm) + key filler roof |
| `facet.t2` | 169.41 | 1.79 | 447.3 | recess ceiling bridge |
| `facet.t3` | 0.0 | 0.0 | 806.4 | chamfers only; no support |
| `turned.t3` | 0.0 | 0.0 | 806.4 | chamfers only; no support |
| `facet.glyph-plant` | 21.13 | 0.5 | 210.1 | chamfers only; no support |
| `facet.tile-interior` | 12.18 | 0.37 | 2346.5 | chamfers only; no support |
| `shared.crystal` | 9.34 | 1.8 | 16.4 | socket ceiling bridge (3.45 mm) |
| `shared.half-crystal` | 9.34 | 1.8 | 16.4 | socket ceiling bridge |

No part needs support material; every plate slices without support in Bambu Studio (see `slicer/`); a visual preview of the bridged ceilings is still owed.
