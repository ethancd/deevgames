# Prompt: build every part in every variant

Read the shared brief, research decisions, and all three concept proposals. Create the actual editable models, exports, and assemblies under `outputs/muju-physical-set-v1/`. Use an available reproducible CAD/solid-modeling workflow appropriate to precise fits. Record tool versions and a minimal regeneration command. Keep parameters in one documented location; do not leave key dimensions scattered across scripts.

Implement a common interface specification covering glyph-to-base, base-to-T2, T2-to-T3, crystal-to-crystal, crystal-to-tile, and tile-to-tile. Preserve compatible interfaces across variants where possible; disclose exceptions. Model real cavities and lead-ins, mating overlap, elephant-foot relief, and assembly clearances. Hidden joints must not stop a glyph lying down or make a pedestal impossible to print.

For each variant, produce:

- Six canonical colored glyphs, one model per element, with robust tips and a keyed removable attachment. Preserve recognizable flame, bolt, droplet, crescent, leaf, and anvil silhouettes. Same physical glyph upright or loose; no separate pending token.
- One octagonal ownership-base geometry, instantiated in ivory and charcoal. A base socket must orient the glyph intentionally and resist accidental rotation.
- A T2 addition and a separate T3 addition, both octagonal and increasingly wide, instantiated in both army colors. The T3 assembly explicitly contains the original base **and** T2 **and** T3 parts. Evaluate the weakest retention joint when lifted by the glyph.
- Puzzle-interlocking square board tiles with four integrated resource studs. Include ordinary and the two home appearances, plus any necessary edge/corner connector subtypes. Ensure a complete 10 × 10 board assembles without connector clashes or unexplained missing border parts.
- A stackable whole-crystal cube and distinct half-crystal token. Design the top stud and bottom socket together, and verify the socket also fits the tile stud. Document whether the half token is stack-compatible; it is accounting stock, not required to encode the board's initial reserves.
- Fit coupons for every interface, with physically readable variant/clearance labels. Use representative geometry, wall thickness, print orientation, and materials.

Export each distinct printable object as STL in millimeters. Provide 3MF assemblies/packages with clear component/material names and correct coordinates. Distinguish geometry-only 3MF from slicer-project 3MF; do not imply printer settings or spool assignments are embedded when they are not. Include editable native source and neutral solid exchange formats when the chosen workflow supports them reliably. Export GLB views with the ten-color palette for the gallery.

Create assembly definitions for all six elements × both owners × all three tiers in each variant. Include standing and loose-glyph views, exploded tier stacks, four resource states (0/4/8/16), a tile connection demonstration, and a full board using the canonical resource map. A shared parameterized assembly definition may generate the 36 states rather than duplicating source. All states must actually resolve to existing model files.

Make a manifest containing stable part IDs, variant, role, quantity, material/color, dimensions, source/export paths, assembly membership, orientation, and validation status. Separate part geometry from color instances and print quantities. A shared crystal geometry may be reused across variants if justified, but it must appear and function in every complete variant. Do not claim three complete sets after modeling only one element or one pedestal system.

Use actual exported geometry to make inspection renders. Iterate on mesh validity, collisions, unstable proportions, sharp points, blocked sockets, hidden resource stacks, and awkward handling. If a concept cannot be made printable, preserve its design intent in a documented engineering revision. Never alter the game rules to accommodate geometry.
