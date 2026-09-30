# Prompt: verify models and prepare the print package

Read the shared brief and the generated manifest/models. Validate every variant and package it for someone with a Bambu Lab H2C. Save evidence under `outputs/muju-physical-set-v1/validation/` and print deliverables under `print/`. State precisely which checks were actually performed.

Digital checks:

1. Re-import exported files. Check scale, bounding boxes, closed/manifold solids, winding, positive volumes, missing/thin features, unexpected disconnected shells, and agreement between STL/3MF and source geometry. Account for intentionally separate components in assembly exports.
2. Verify interface dimensions and insertion paths, minimum walls around cavities, intended engagement, release access, and assembly collision clearances. Inspect cross-sections, not just exterior pictures. Check every glyph's peg, not just the easiest example.
3. Verify complete T3 assemblies preserve T2; both ownership appearances exist; all 108 element/owner/tier states resolve; all required standalone parts exist in all variants; and the manifest's per-variant inventory totals 891 objects before coupons or explicitly disclosed extras.
4. Assemble the 100-tile board digitally. Verify interlock compatibility, outer edges, exactly 98 gray and two owner-colored tiles, and the A1/J10 home placement. Read resourceMap.ts programmatically to check the resource count and populate crystal stacks.
5. Inspect densely occupied neighboring tiles, four-high resource stacks, maximal glyph extents, legal pending-marker coexistence, finger access, and sightlines. Note where digital clearance still requires an actual ergonomic trial. Check support requirements and bed-contact surfaces for each print orientation.

Where Bambu Studio or a suitable slicer is available, use a current H2C-compatible profile and inspect actual sliced previews. Record version, nozzle, plate, filament profiles, walls, layers, infill, supports, and failures. Plan sensible single-color batches, including hundreds of crystals, without assuming the entire 891-part set fits one plate. Check all toolhead/plate restrictions from the current profile. Do not start a printer. If slicer access is unavailable, leave the project ready to import and label slicer verification pending; do not fabricate mass or time estimates.

Create a short physical test sequence:

- Print a tile-interlock pair, representative crystal stack, and interface clearance coupons in intended materials.
- Test all six glyphs in one base, then a complete T3 assembly in each owner material. Measure insertion/removal effort, secure lifting, repeated assembly wear, wobble, and layer failure.
- Test a small tile patch with the largest adjacent T3 assemblies, resource stacks, and a loose summon. Check whether taking one cube removes the whole column and whether moving a piece disturbs resources.
- Adjust recorded fit parameters from measured results before recommending a full production run. Provide blanks for measurements and clear pass/fail criteria; do not mark physical tests passed without evidence.

Produce a BOM in CSV and human-readable form, grouped by variant, color/material, geometry, and quantity. Include per-part and total mass, print time, purge/support/adhesion waste, and filament cost where actual slicing supports them. Otherwise give explicitly labeled estimates with assumptions. Distinguish consumed-filament cost from buying whole spools in ten colors; date any price sources. Keep calibration waste separate from the production inventory.

Deliver a small calibration package, each variant's complete print package, editable sources, preview images, source/asset credits, checksums, and concise assembly/printing instructions. If some items remain digitally valid but physically untested, say so directly. Final filenames and download links must correspond to real files, not placeholder links.
