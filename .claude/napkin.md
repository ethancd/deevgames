# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|

## User Preferences
- Muju balance work: commit/push checkpoints to `claude/refine-muju-balance-nulzjj` as you go; do NOT open a PR unless asked.
- Record every autonomous design ruling in `muju/JUDGMENT_LOG.md`.
- Design rulings E-1..E-3 are settled — do not re-litigate (rush>expand intended; mass-Fire_1 rush target 35-55% WR vs competent defense; no persistent per-unit HP).

## Patterns That Work
- (approaches that succeeded)

## Patterns That Don't Work
- (approaches that failed and why)

## Domain Notes
- Muju Hono Tanka: custom board game app in `muju/`. Player IDs are 'white'/'black' (not 'player'/'ai').
- AI's real moves bypass validation (APPLY_AI_ACTION → ai/simulate.ts skips meetsTechRequirement + isValidSpawnPosition) — D1-D3 in SPEC_AUDIT.md, deferred to Phase 4a per J-002.
- resourcesSpent updates at queue-time (human) vs place-time (AI) — leaks hidden queue info into AI belief model.
- `npm test` in muju/ — 460 tests green as of handoff. Property tests slow (~65s) because vitest runs everything in jsdom; consider `// @vitest-environment node` for tests/game/**.
