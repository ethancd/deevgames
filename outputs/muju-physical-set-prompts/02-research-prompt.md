# Prompt: research printing, Muju, and prior art

Read `outputs/muju-physical-set-prompts/01-shared-design-brief.md`. Complete the research needed to engineer this physical set on a Bambu Lab H2C. Write findings under `outputs/muju-physical-set-v1/research/` and update the project status. Do the research, not just a proposed bibliography.

1. Inspect the live Muju UI and the local component, glyph, palette, resource-map, and rule sources. Capture representative views and extract a six-element reference sheet from the real glyphs. Identify what comes from canonical artwork and what the physical brief deliberately changes. Inspect the recovered Tier 1 ZIP without modifying the archive; read its source and validation records before reusing code. View the actual Baroque images and note useful and unsuitable features.
2. Browse current primary manufacturer and engineering guidance. Confirm H2C build envelopes for the relevant print mode, nozzle assumptions, material compatibility, practical batch workflows, and slicer support. Research minimum feature sizes, layer-direction strength, overhangs/bridges, shrinkage, elephant-foot relief, sliding versus snap fits, fatigue, tile warping, and small-part bed adhesion. Include PLA-to-PLA and PETG-to-PLA interfaces. Cite dated sources and distinguish manufacturer guidance from your own design inference.
3. Compare relevant prior art: modular tabletop tiles, removable tabletop miniature bases, stacking token systems, original stud/socket blocks, and printed glyph or signage joints. Select a few examples with useful construction lessons. Record links, what each teaches, and any asset license before reusing geometry. Avoid merely collecting attractive pictures or assuming existing CAD is free to redistribute.
4. Evaluate a keyed peg/socket for each upright glyph, retained base/T2/T3 interfaces, loose tile interlocks, and crystal stacking. Choose candidate mechanisms with section sketches and explain print orientation, insertion direction, release method, expected weak point, and practical alternatives. A removable fit need not use a fragile cantilever snap. Keep visible octagonal bases and the additive tier stack.
5. Resolve a first engineering envelope: tile pitch/thickness, stud position, crystal pitch and stack height, three pedestal widths/heights, glyph envelope, fingers' access, and board outer boundary. Show a dimensioned worst-case tile occupied by a T3 piece and four four-high resource stacks, including an adjacent occupied tile and pending-glyph placement.
6. Propose material-specific fit coupons with a labeled clearance sweep. Clarify whether each quoted clearance is radial, diametral, per side, or total. Do not claim one universal tolerance. Investigate whether a 5–6 mm crystal is pleasant to handle before fixing that dimension. Include a practical larger-cube alternative if necessary, with its impact on the board.
7. Produce a provisional filament shortlist using current Bambu listings and the ten-color brief. Verify availability and price for the applicable region, clearly dating them. Gray, ivory, charcoal, saturated blue, and translucent cyan must remain distinguishable in the assembled object. Explain whether a different material for crystals changes fit or handling. Do not purchase anything.

Useful starting sources, to verify and supplement:

- https://help.prusa3d.com/article/modeling-with-3d-printing-in-mind_164135
- https://wiki.bambulab.com/en/h2c/h2c-filament-printing-guide
- https://wiki.bambulab.com/en/knowledge-sharing/transparent-petg
- https://wiki.bambulab.com/en/filament-acc/filament/dry-filament
- https://us.store.bambulab.com/products/pla-matte
- https://us.store.bambulab.com/products/pla-basic-filament
- https://us.store.bambulab.com/products/pla-metal
- https://us.store.bambulab.com/products/petg-translucent

Deliver `research.md`, a source ledger, Muju reference images, a prior-art comparison, and `engineering-decisions.md`. End the latter with chosen initial dimensions, interface parameters, open physical-test questions, and constraints for all three concepts. Research should result in actionable design decisions; keep optional embellishments outside the required inventory.
