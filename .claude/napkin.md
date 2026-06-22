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

## LIGHT balance set (2026-06-21, engine §3 BALANCE_PROPOSALS)
- THIS session's task = engine LIGHT balance (NOT the app). Worktree branched from 69e313c
  (pre-MMS) AGAIN; reset --hard to 14d3d8e (tip of claude/mms-orchestrator-phase-0-60vsr7,
  which has full engine + BALANCE_PROPOSALS.md). Branch: worktree-agent-a00942a5bfab0e8f6.
- App contract (packages/app/src/engine/contract.ts) is STRUCTURAL and does NOT import the
  engine's SpellEffect/EquipmentEffect/Stack — new engine-internal fields (noShoot, blindedFrom,
  rollmode/reset/buffAll, bothArmies/skipUndead/backRankOnly/noShoot/reset flags) are additive-safe,
  NO app/mock change needed. Verified: app typecheck+test(38)+build all green.
- Testing castSpell deterministically: startRun + chooseNode(row-0 combat node) to get a real
  combat + currentNodeId, THEN overwrite combat.yourArmy/enemyArmy + hero.spellbook with hand-built
  adaptStack stacks. GOTCHA: a spell that wipes the only enemy stack settles the win and NULLs
  run.combat → use big high-hp stacks (necropolis_bone_dragon hp150) so combat stays ongoing.
- Roster is ALL undead → Death Ripple (skipUndead) hits your army for 0; Liches are the only shooters.
- Final: typecheck 4/4, engine 105 (was 86, +19 light), app 38, schema 12, data 19; app build OK.

## CORRECTION (real path)
- The harness PINS edits to /Users/ashkie/src/deevgames/.claude/worktrees/agent-a97a9513628618ab8 ONLY.
- Fixed by: `git checkout -b leyline/mms-balance-batch claude/mms-orchestrator-phase-0-60vsr7` INSIDE the pinned worktree.
- Now at c498ff0, spire project present. ALL edits go under:
  /Users/ashkie/src/deevgames/.claude/worktrees/agent-a97a9513628618ab8/might-and-magic-spire

## Relics-deliver session (2026-06-21, this task)
- Pinned worktree: /Users/ashkie/src/deevgames/.claude/worktrees/agent-aaec6c6dcdd16315d
- Branched leyline/mms-relics-deliver off acccf20 (== leyline/mms-balance-batch tip). pnpm install was needed.
- Task: grantSpell + castOnStart EquipmentEffect kinds; Hero.baseSpellbook; recomputeHero rebuilds spellbook; castOnStart applied at openCombat. Engine-only, NO packages/app.
- §16 Item C already prepended "+4 Defense" to AOTD bonuses; batch.test pins defense===4. Now ADD castOnStart parse on top (the on-combat-start casting that §16 deferred is now being implemented).
- spell_misfortune absent in data → spellById returns undefined → skip gracefully in recomputeHero/openCombat.
- deriveId("Slow")=spell_slow: name.toLowerCase().replace(/[^a-z0-9]+/g,"_") then trim leading/trailing _.

## EDGE: app typecheck (relics-deliver)
- CodexScreen.tsx imports adaptEquipment DIRECTLY from @mms/engine (not via the structural contract seam),
  and does `e.amount` over the whole EquipmentEffect union. Adding grantSpell/castOnStart (no `amount`)
  BROKE `pnpm --filter @mms/app typecheck/build`. "Don't change app" vs "build green" conflict.
  Resolution: minimal display-only narrowing `'amount' in e ? ...(e.amount) : ...(e.spellIds.join())`.
  No behavior change, debug Codex tile only. Required to keep the DONE-WHEN build gate green.

## Patterns That Work (spire batch)
- light.test.ts combatRun() harness is the template for engine combat tests (startRun → chooseNode → overwrite combat).
- Conditional rng.next() (gated on attacker ability) does NOT break byte-identical determinism — ability-less attackers never draw.
- Death-blow test: compare same-seed Dread Knight WITH vs WITHOUT the ability (filter abilities) → identical pre-double roll → assert dealt is exactly 2x.
- hasAbility is case-insensitive SUBSTRING; "curse" matches both Black/Dread Knight ability lists.
- Verified gates: pnpm -r typecheck, pnpm -r test (schema12/data19/engine124/app38), pnpm --filter @mms/app build.

---

# MMS Data — Castle + Stronghold factions (2026-06-22, worktree-agent-af32b5c4694d62bcd)

## Domain Notes
- THIS task = add Castle (good) + Stronghold (neutral) HoMM3 rosters to `might-and-magic-spire/packages/data` ONLY.
- Touch ONLY creatures.json/heroes.json/manifest.json/REPORT.md/assets + build/parse/image scripts. A concurrent agent owns spells.json/artifacts.json.
- Same wrong-base gotcha as the app task: worktree branched from 69e313c (pre-MMS). MERGED `claude/mms-orchestrator-phase-0-60vsr7` in (git reset --hard is classifier-blocked).

## Patterns That Work (adding a faction)
- New `scripts/lib/curated-<faction>.ts` exporting creatures+heroes; wire into `build.ts` (spread into validateAll arrays); `pnpm build:data` regenerates JSON+manifest skeleton; `pnpm images` fetches art + real dims.
- `build:data` RESETS manifest dims to 100x130; `pnpm images` reads real dims back from disk. Always run images AFTER build.
- Guarded build.ts to write ONLY creatures/heroes/manifest (it used to clobber spells/artifacts from curated TS).

## Image pipeline gotchas
- thelazy combined base+upgrade pages: some upgrades (Orc Chief) have NO standalone page (404) — art is on the base page. Fix: CREATURE_PAGE_OVERRIDE in build.ts (points sourceUrl at base page) + IMAGE_NAME_ALIASES in parse.ts (Orc Chief->Orc Chieftain) + images.ts describe() derives creature name from `ref` not page title.
- Creature image matcher must drop HotA/HD variants (URL-encoded %28HotA%29) to select base-game (RoE) art.
- Lord Haart = both Castle Knight + Necropolis Death Knight -> id hero_lord_haart_knight. Tyraxor is Stronghold, not Castle.

---

# MMS Creature Abilities — FREE+LIGHT wins (2026-06-22, worktree-agent-acf6d73c3d4955e6a)

## Domain Notes
- THIS task = mechanize new Castle/Stronghold abilities in `might-and-magic-spire/packages/engine` ONLY:
  extraStrikes (double attack/shot), extra/unlimited retaliation, jousting (+dmg), Behemoth defense-shred, substring-landmine guard.
- I own battle.ts, types.ts Stack flags, resolveAttack/enemy-attack/on-hit sections of run.ts.
  AVOID content.ts, adapter.ts deriveHero, startRun, the app, RunState/Hero (concurrent faction-selection agent).
- Same wrong-base gotcha: worktree branched from 69e313c (pre-MMS). git checkout -b leyline/mms-creature-abilities off claude/mms-orchestrator-phase-0-60vsr7 (tip 66d1143). pnpm install needed.
- Exact data ability strings: double = "Shoots twice"/"Attacks twice"; retaliation = "Two retaliations"(=2)/"Unlimited retaliation"(=Inf);
  jousting = "Jousting"; behemoth = "Reduces enemy defense" (BOTH Behemoth + Ancient; distinguish Ancient by sourceId/name "ancient").
- Substring trap: "unlimited retaliation"/"two retaliations" do NOT contain "no enemy retaliation" → safe. Add a guard test anyway.
- Retaliation budget: keep hasRetaliated boolean for back-compat but base suppression on a new retaliationsUsed counter + retaliationBudget(stack). Reset retaliationsUsed alongside hasRetaliated at round start (run.ts ~996/1000) and settle survivors (~1117).

## Patterns That Work (creature abilities)
- GOTCHA: an existing test set `defender.hasRetaliated = true` directly (boolean-only legacy). New budget logic must fall back: `used = retaliationsUsed ?? (hasRetaliated ? 1 : 0)` so old boolean-only callers still get once-per-round.
- Deterministic multiplier tests (2x strike, jousting +25%): set damageMin==damageMax (fixed roll, stream-independent) → assert exact multiple. For death-blow style, compare same-seed WITH vs WITHOUT ability.
- extraStrikes loop: stop early if `newDefender.count <= 0` so the 2nd strike doesn't fire on a corpse; retaliation resolved ONCE after the loop (HoMM3: defender counters a double-attacker only once) — falls out free since retaliation is per-resolveAttack.
- Added hasAbilityPhrase (whole-string ===) for ALL new checks; used it for the no-enemy-retaliation suppression too (defensive). All existing no-retal creatures use exact "No enemy retaliation" so phrase-match keeps them working.
- Ancient Behemoth vs Behemoth: same ability string "Reduces enemy defense"; distinguish Ancient by sourceId/name includes "ancient" → larger shred.
- FINAL gates green: typecheck 4/4; tests schema12/data19/engine154(+18)/app38; app build OK. New test file: abilities.test.ts (18 tests).
