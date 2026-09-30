# End-to-end prompt

Create a complete, reproducible set of 3D models for a physical Muju game, with three visual variants and a local interactive gallery comparing them. This is an engineering and design project: finish the individual model files, rather than stopping at attractive concept images or a plan.

Read `AGENTS.md`, `muju/docs/CONTENT_DAG.md`, and every file in `outputs/muju-physical-set-prompts/`. Use `01-shared-design-brief.md` as the authoritative physical design brief. The user's choices override old artwork where they differ. Read current game sources for the semantics that the objects must represent. Preserve unrelated work and historical print/design packages. This project does not request game-rule changes or deployment.

Create outputs under `outputs/muju-physical-set-v1/`, organized into `research/`, `concepts/`, `cad/`, `models/`, `assemblies/`, `renders/`, `print/`, `validation/`, and `gallery/`. Maintain a concise `STATUS.md` with completed artifacts, decisions, assumptions, and actual blockers. Record source revisions and relevant file hashes so a later reader knows which rules and glyphs you used.

Execute the stage prompts 02 through 06. Make routine choices and continue without an approval checkpoint between stages. Treat dimensions as adjustable engineering starting points; keep the construction system, inventory, palette, and board-color decision fixed. If a fit needs a human print trial, produce candidate clearances and coupons, flag that evidence as pending, and complete all independent digital work. Ask only for information that cannot reasonably be inferred and prevents meaningful progress.

Develop three variants: a crisp chamfered design, a softly rounded design with an octagonal footprint, and a restrained turned/fluted design informed by Muju's prior art. Refine their names and visual language during research. Every variant must include every component family and both army appearances. All six elements must be inspectable at all three tiers for each army: 36 assembled states per variant, 108 across the project. Shared parametric source and reused geometry are encouraged; no need for 108 separately sculpted pieces.

Use concept art to explore appearances, then build real parametric CAD or reproducible solid geometry. Export each printable part in millimeters as STL and in an appropriate 3MF package. Export lightweight GLB assets for viewing. Render the exported geometry and inspect those renders. Clearly label concept art, actual model renders, digital checks, slicer checks, and physical print results as different kinds of evidence.

Completion means:

- Research with dated links to primary printing guidance, observed Muju references, and a prior-art comparison.
- Three illustrated concepts that preserve the shared design.
- Every required part family in every variant, editable source, regeneration commands, and working exports.
- All assembly states, including additive tier stacks and loose phasing glyphs, represented in the gallery.
- A quantity-aware bill of materials, fit-test coupon set, print orientations, and honest validation records.
- A usable local gallery with actual model inspection, clear dimensions, downloads, and a full-board preview for each variant.

Do not describe a model as physically proven without physical testing. Do not start a printer, buy filament, or publish a site as part of this task. End with links to the gallery entry point, models, print instructions, and any unresolved fit decisions.
