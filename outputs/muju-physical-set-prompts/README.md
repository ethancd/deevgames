# Muju physical-set prompt pack

Prepared 2026-09-30. These are prompts for making the models, not a claim that the new models have already been made or printed.

For an end-to-end run, give an agent this instruction:

> Read `outputs/muju-physical-set-prompts/00-master-prompt.md` and execute it. Treat `01-shared-design-brief.md` as the shared requirements. Produce all three complete variants, their model files, and the local comparison gallery.

For separate sessions, run the numbered stage prompts in order. Each stage reads the shared brief and the previous stage's artifacts. All paths are relative to the repository root; no particular local checkout path is required.

Cloud checkouts include the [recovered print reference](../muju-print-reference-b5117f43/README.md) and a [snapshot of the previous concept gallery](../muju-baroque-reference-v1/README.md). The original local design directories and backup commit are optional historical references. Use the bundled copies when those originals are absent. Discover the tools available in the execution environment; if image generation, CAD, or slicing is unavailable, report that specific limitation and continue independent work without inventing generated assets or validation results.

| File | Purpose |
|---|---|
| [00-master-prompt.md](00-master-prompt.md) | Coordinate the full project and define completion |
| [01-shared-design-brief.md](01-shared-design-brief.md) | Preserve agreed design, colors, quantities, and source references |
| [02-research-prompt.md](02-research-prompt.md) | Research printing, inspect Muju, and learn from prior art |
| [03-concept-art-prompt.md](03-concept-art-prompt.md) | Develop three coherent variants and illustrated construction studies |
| [04-modeling-prompt.md](04-modeling-prompt.md) | Build every component and assembly in every variant |
| [05-validation-and-print-pack-prompt.md](05-validation-and-print-pack-prompt.md) | Check geometry, prepare fit coupons, slicing evidence, and inventory |
| [06-gallery-prompt.md](06-gallery-prompt.md) | Build and verify a browsable gallery of the actual models |

The default deliverable root is `outputs/muju-physical-set-v1/`. Keep the recovered Tier 1 package and the existing Baroque gallery intact. The 891-part inventory is for **one** complete variant; producing three design alternatives does not mean printing three full sets.
