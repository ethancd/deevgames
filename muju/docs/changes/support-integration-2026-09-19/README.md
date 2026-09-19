# T2d and T6 support integration — 2026-09-19

This isolated integration combines the reviewed complete Prepare legality and
Gate 1 A2 correction at `32f83b88541e8a63ecb9b9f62d468cf17219011e` with the
restricted match service and authenticated engine-seat changes at
`5345b6bd36a1efc4b7202cd4698924a11e31a565` (including `5d3dc222`). The automatic
merge required no conflict resolutions or additional runtime edits.

The shared rules generator remains complete; summon-risk preferences remain in
the V2 planner. T6's complete local server enumeration is retained, alongside
the private token-derived `authenticatedPlayer`, instance-local single-room
HTTP/MCP/stdio scope, bare-tier undo denial and pinned issued-seat contract.
The actual match controller and player sandbox remain future prerequisites.
The seat runner remains Standard-only with its fixed 60-second configuration.

Branch: `codex/phasing-support-integration`. The separate 1,024-game A2
experiment continues in its immutable `32f83b88` checkout. This support merge
does not restart or pool that experiment, and its focused tests are not a
strength or responsiveness measurement. The A2 preregistration, fixed seeds,
acceptance thresholds and preserved VOID A1 evidence remain unchanged.

`verification.json` and associated logs contain the new integration checks:
focused server/seat/legal-oracle/Gate 1 contract tests, six TypeScript projects,
DAG validation and whitespace validation. `source-sha256.json` identifies the
combined sources. The independent review is retained alongside these files.
All earlier parent-branch evidence, including initial failing checks, remains
historical and unmodified.

## DAG disposition and remaining gates

- AI planning, server, MCP, online types and match tools: combined without
  additional runtime changes; covered by the focused integration checks.
- Game rules, catalogue, saved-state schema and worker/UI guards: unchanged.
  Canonical Phasing-only T5 remains on its separate M8 preparation branch.
- Hard M2/M4/M5/M6 and strength: blocked on their own implementation and frozen
  gates. This merge does not import or accept the in-progress M2 corrections.
- Academy: the previously prepared notice remains included from the shared
  `3423fe85` base; no new media, speech, publication or deployment.
- Release: prepared support integration only. No full release, Gate 0/1/2/3,
  Phasing Hard match readiness, M8 cutover, production guard opening or live
  deployment is established by this record.

Claude retains ownership of final Hard integration on `muju/phasing-only`.
This branch provides a single reviewed support ref for that later merge.
