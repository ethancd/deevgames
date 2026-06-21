# Napkin — MMS Army-Combat UI rebuild

## Domain Notes
- Repo root has many games; THIS task = `might-and-magic-spire/packages/app/**` ONLY.
- Do NOT touch packages/engine or packages/schema (other agents own them; real engine swaps at integration).
- The worktree branched from the WRONG base (69e313c, pre-MMS). Reset --hard to 5900a16
  (orchestrator tip `claude/mms-orchestrator-phase-0-60vsr7`) which has the integrated MMS game.
  Branch name: worktree-agent-aafee595584dd8cdc.
- App imports engine ONLY through src/engine/index.ts seam. UI never imports @mms/engine directly.
- Stack uses `creatureId` (NOT sourceId) for art lookup per pinned contract.
- Necropolis design tokens: grave/bone/verd/blood/necro, Cinzel font-display, .engraved,
  .verd-frame, .bg-necropolis, animate-shake/pulse-blood/fade-in.

## Commands
- pnpm --filter @mms/app test / typecheck / build  (run from might-and-magic-spire/)

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|
| 2026-06-21 | self | Assumed cwd had might-and-magic-spire | Worktree was on wrong branch; reset to 5900a16 |

## Patterns That Work
- Seam: set USE_REAL_ENGINE=false (real @mms/engine is still old STS API). buildRealApi()
  kept as dormant typed factory (RealModule type) so dormant path typechecks without importing
  incompatible legacy @mms/engine. Orchestrator flips flag + restores `import * as real` at integration.
- CodexScreen still imports adaptCreature/adaptArtifact from @mms/engine (old adapters) — UNTOUCHED, still passes.
- mockEngine pulls @mms/data (creatures/artifacts/spells/heroes) directly for real stats+art refs.
- TS narrowing gotcha: checkOutcome() mutates combat.outcome but TS keeps the 'ongoing' narrow
  from the early-return guard → "no overlap" errors. Fix: make checkOutcome RETURN the outcome
  and compare the return value, not c.outcome.
- vitest globals=true auto-cleans between tests, but multiple render() in ONE test coexist in
  document → scope queries with within(container) or getAllByTestId.
- Build runs sync:content (copies 72 webp). 35 tests, all green.
