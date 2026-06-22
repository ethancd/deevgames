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

# MMS Factions PLAYABLE (2026-06-22, worktree-agent-ade28fbf059140d7a)
## Domain Notes
- THIS task = make non-Necropolis factions playable. Add hero/faction selection (TitleScreen) + per-faction runs.
- Worktree started on leyline/initial-commit (pre-MMS). Created branch `agent/mms-factions-playable` off
  `claude/mms-orchestrator-phase-0-60vsr7` (latest orchestrator tip, data 42/46/68/67). All work under
  /Users/ashkie/src/deevgames/.claude/worktrees/agent-ade28fbf059140d7a/might-and-magic-spire
- I own: content.ts, adapter.ts (deriveHero), startRun/encounter/dwelling/RunState.faction in run.ts,
  types.ts RunState/Hero, app files. AVOID battle.ts + resolveAttack/on-hit sections of run.ts.
- Necromancy already skill-gated (applyNecromancy checks hero.skills["Necromancy"]). Non-necro sustain via
  Dwellings/Rest/gold. NO new growth subsystem.

## ENGINE done (this session)
- content.ts: added FACTIONS, DEFAULT_FACTION, creaturesOfFaction/basePool, ALL_BASE_CREATURES,
  heroesOfFaction, PLAYABLE_HEROES. Kept CREATURES/BASE_CREATURES/HEROES (Necropolis) for back-compat.
  GOTCHA: c.faction is the schema `Faction` enum, not string — cast `(c.faction as string)` in helpers.
- adapter.deriveHero: faction-general. starterSpellIds(faction); classBaseStats adds Knight/Cleric/
  Barbarian; specialtyCreatureId(specialty, factionBase) matches specialty vs faction base NAMES;
  army = tier-1 core (20) + specialty-or-tier-2 (10/5/2). Necropolis/Galthran byte-identical.
- run.startRun(seed, heroId?): default Galthran; sets RunState.faction. Passes ALL_CREATURES to deriveHero.
  rollEncounter uses ALL_BASE_CREATURES (cross-faction foes). rollDwelling(run,rng) uses basePool(run.faction).
  Boss stays Necropolis Lich-King theme. Hero.faction OPTIONAL (so other agent's battle/batch test hero
  literals don't break).
- WIN RATES (80 seeds, dumb bot): Necro 46%, Castle 45-49%, Stronghold 33%. Castle needed ZERO tuning.
- New test: factions.test.ts (11 tests). Engine 136 -> 147.

## APP done (this session)
- contract.ts: startRun(seed, heroId?); Hero.faction?, RunState.faction? (optional); added PlayableHero type.
- engine/index.ts seam: startRun threads heroId; exported FACTIONS, DEFAULT_HERO_ID, PLAYABLE_HEROES,
  heroesOfFaction (projected to PlayableHero). The seam uses USE_REAL_ENGINE=true so App tests on <App/>
  exercise the REAL engine — good for the Castle-routing integration test.
- mockEngine: makeHero(heroId)/startingArmy(heroId) faction-aware; rollDwelling(run,rng) uses run.faction.
  Necropolis path byte-identical (legacy 40 skel/12 wd/4 lich).
- useRun.startRun(seed, heroId?); App passes onStart={startRun} (TitleScreen onStart sig now (seed, heroId?)).
- TitleScreen rewritten: faction-grouped hero picker (testids hero-picker/faction-group/hero-option/
  hero-detail), portraits via ContentImage, default Galthran. Gothic chrome for all factions (deferred theming).
- COMBAT.md §20 documents the faction wiring + win-rate table + "no lever changed".
- DEFERRED: faction-specific visual chrome (all factions render Necropolis gothic palette for now).
- FINAL GATES: typecheck 4/4; schema 12 data 19 engine 147 app 40; app build OK.

---

# MMS Per-faction CHROME (2026-06-22, worktree-agent-a31c3c65644a0cdfa) — THIS task picks up the DEFERRED chrome above
## Setup
- Worktree was on `worktree-agent-...` branch with NO spire app on disk (task header lied about branch).
  `git reset --hard agent/mms-factions-playable` (ff34c3b, the latest with faction picker). pnpm install needed.
- Baseline: app test 40, typecheck clean, build OK.
## Mechanism (CSS-var indirection — zero component edits for palette)
- index.css `@theme` color values moved into root CSS vars; `@theme { --color-verd-300: var(--verd-300) }`.
  Per-faction `[data-faction="Castle"|"Stronghold"] { --verd-300: ...; --bone-100: ...; }` re-maps ramps.
  `.bg-necropolis`, `.engraved`, `.verd-frame` re-skinned per-faction scope. Necropolis = default (no override).
- data-faction set on the App shell wrapper (App.tsx `shell()`), derived from run?.faction ?? 'Necropolis'.
  TitleScreen sets it from the SELECTED hero (live preview) via its own wrapper data-faction.
## Test asserts (don't break)
- map heading /THE NECROPOLIS SPIRE/ (Necropolis default run only — keep exact). hero-detail matches /Castle/.
- New test: app shell carries data-faction reflecting selected hero / run.
