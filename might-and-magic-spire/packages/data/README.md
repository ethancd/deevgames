# @mms/data — Researcher (Agent 1)

Owner: **Researcher**. Branch: `agent/researcher`.

Validated HoMM3 content lands here. You produce the `Source*` records and the
image manifest — nothing about gameplay is yours.

## Contract

- Consume `@mms/schema`. Every record must `Source*.parse()` clean before it is
  written; a record that fails validation does not get written.
- The schema is **fixed**. Fill it, don't extend it. Route any proposed change
  through the orchestrator.
- Every `imageRef` must resolve to an `ImageManifestEntry` in the manifest.

## Pipeline (in order)

1. Fetch and **cache raw HTML to disk** (`packages/data/.cache/`, gitignored)
   before parsing. Re-runs re-parse from cache, never re-hit the site.
2. Parse into `Source*` records, validating each against the Zod schema.
3. Separate image pass: download, dedupe, normalize to web-sized WebP, write
   `assets/images/<ref>.webp` and the `ImageManifest`.

## Scope (v0)

All of Necropolis first — creatures, the necro/death heroes, combat spells, a
spread of artifacts across all four classes — then breadth if time allows.

## Output

`packages/data/REPORT.md` — a reconciliation report: record counts vs. expected,
every dropped record, every missing/guessed field flagged for human review.

Done when `@mms/data` validates clean against the schema, every `imageRef`
resolves, and the report shows exactly what's complete and what's thin.
