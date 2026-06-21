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

## Integration Switchover (2026-06-21)
- Base for switchover = orchestrator tip `claude/mms-orchestrator-phase-0-60vsr7` (21f4fe9),
  which merges the rebuilt engine (worktree-agent-aafee...) + app. My agent worktree branched
  from 69e313c (pre-MMS); fast-forward MERGE (not reset --hard — that's blocked by classifier)
  to 21f4fe9 brings in the integrated game.
- Seam flipped: USE_REAL_ENGINE=true, `import * as real from '@mms/engine'`, buildRealApi() binds
  to ACTUAL engine signatures (commandStack positional kind+targetId; legalCommandTargets;
  recruitAt/upgradeAt/learnAt/buyAt(run,nodeId,id); pickReward(run,INDEX) via indexOfChoice).
- Engine Stack: added `creatureId` alias = sourceId in adaptStack ONLY (every other stack is a
  spread or adaptStack → propagates). 82 engine tests stayed green (additive).
- equipArtifact: HeroDoll passes Equipment `.id` (engine `equip_*`); engine resolves it. ownedArtifacts
  projects engine Equipment (description→bonuses) + mock `_bag` so satchel works under both engines.
- KEY UNIFICATION: mock now stores economy offers on `run.pendingRewards` (the SAME field the real
  engine uses), so the live (real) engine's pendingRewards(run) reads them even for mock-built test
  runs. Screens (Dwelling/Altar/Shrine/Merchant) are pendingRewards-driven; App gates economy screens
  on `pendingRewards().length>0` then falls through to map.
- CodexScreen used RETIRED adapters (adaptCreature→CardDef, adaptArtifact/signatureRelicForHero→Relic).
  Pre-existing typecheck break in the base. Reworked to army adapters (adaptStack/adaptEquipment);
  updated codex.test.tsx to army-model assertions. Dropped Card import there.
- realEngineSeam.test.ts now drives the REAL engine: track acted via combat.actedStackIds (engine
  internal) not s.hasActed; pick affordable/free reward offers (engine strictly rejects unaffordable).
- Final: typecheck clean; schema12 data19 engine82 app35; app build OK; determinism + creatureId verified.

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
