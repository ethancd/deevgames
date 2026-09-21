HEADLINE: Phasing is opt-in on every player-facing surface on master (a02bbb7, equal to origin/master). Standard is the default in 12 separate places, and an undefined `ruleset` means Standard everywhere. The AI stack has already moved to Phasing. HardEngine refuses Standard states (`core/state.ts:615`) while `useAI` still routes Hard to it with no ruleset check. So in today's default vs-AI game (forced Standard) "Hard" takes a pack-error fallback to the old v2 engine every turn, and the E6-released Hard engine cannot play the ruleset the UI forces. I established this by reading code only; nothing was executed because `node_modules` is not installed. The cheap route to "Phasing is the only live ruleset" is to flip the 12 defaults and open the 3 AI guards while keeping the `isPhasing` branches so stored Standard saves, rooms and replays stay readable. Deleting the 48 `isPhasing` call sites is the separate T5/M8 "canonical removal". Its branch, `codex/phasing-only-canonical`, is not in this clone or on origin.

## Remaining work
- S: stop the silent Hard downgrade. Add a ruleset check beside muju/src/hooks/useAI.ts:125 (`useHard` only when the state is Phasing), or make vs-AI default to Phasing. Fix or retire the stale Standard cases in e2e/hard-ai.spec.ts:182-207. Blocked only by an owner decision on whether Standard vs-AI should exist at all.
- S/M: flip the 12 Standard defaults to Phasing and stop offering Standard for new games. The sites are board.ts:204, ModeSelect.tsx:46 and :109, OnlineLobby.tsx:30, online/client.ts:71, server/schema.ts:48, server/mcp.ts:67, observation.ts:121-122 and :189, AnalysisScreen.tsx:30, and the four `phasing = false` prop defaults. Keep the `isPhasing` branches so stored Standard data still reads correctly. Before flipping board.ts:204, add an explicit 'standard' argument to the 50 implicit test files and about 25 lab scripts that need Standard. Blocked by the owner accepting an AI that has passed no release gate in vs-AI Phasing.
- S: open the three Phasing AI guards (worker/handler.ts:113, ModeSelect.tsx:113 and :298, GameScreen.tsx:103). Retire `phasingPreview.ts` or turn it into a plain diagnostics flag. Invert or delete the guard tests: tests/ai/phasing-preview-worker.test.ts:42, tests/components/phasing-preview-ui.test.tsx:65, :98 and :111, and e2e/phasing-ai.spec.ts:46. Blocked by the project's self-imposed preregistered gates (Gate 0-3, M7) or an explicit owner override.
- M: server retirement policy. Reject `ruleset: 'standard'` on create. Decide what happens to 'muju-online-6' rooms: let active games finish, or return `RULES_CHANGED`. Remove or redirect the 'muju-online-2/3' in-place migration, which currently upgrades into Standard (rooms.ts:236-247 and the SQL at :302-305). Decide whether to adopt 'muju-online-5'. Update tests/server/rooms.test.ts:106-125. Blocked by the missing T5 branch and an archive-policy decision. Do not touch the production SQLite database.
- M: read-only viewing of retired Standard rooms. The archive list shows them, but every read returns 409 (rooms.ts:239-241). This needs a view-only read path plus retained Standard replay and label code in src/game/replay.ts:76,81,100, moveHistory.ts:69 and analysis.ts:20. tests/fixtures/codex-claude-2026-09-12.json can serve as the captured retired-rules fixture the DAG asks for.
- M: local save policy. Bump `SCHEMA_VERSION` to 9. For saves whose ruleset is not 'phasing' (every v5 and v6 save), choose between keeping them resumable as Standard, offering view-only analysis, or clearing them. Never convert one (persistence.ts:8-15,72-110). Update tests/save-rules-revision.test.ts.
- M: rewrite the Standard-flow e2e specs for Phasing. Seven assert Standard phase copy; up to 13 inject Standard saves. Several probably hide rule-neutral coverage (cleave, metal, tier3-cap, visuals) that only needs a Phasing fixture. Add the Phasing e2e specs to CI, which today runs only `npm test` and `npm run test:online:e2e`.
- L (T5/M8 canonical removal; optional and can come last): delete the 48 `isPhasing` sites and the Standard-only code (turn.ts, homeCheckmate.ts `prepare()`, simulate.ts, the engine-v2.ts rescue proof, server/analysis `actionReady` and `turnFor`). Narrow the `Ruleset` type. Rewrite or delete tests/game/turn.test.ts (8 cases), home-checkmate.test.ts (10), crystal-handicap (3), hooks/upkeep-undo (4), server/analysis.test.ts (26) and the v2 correctness tests. Decide the fate of the 12 quarantined files. Blocked by the save and room policies above, and the T5 branch may need re-deriving.
- M: documentation and agent text, as CLAUDE.md requires. Make Phasing the normative text in SPEC.md (lines 3-11 still call Phasing optional). Rewrite the observation.ts rules prose so Phasing is top-level rather than an override. Update the mcp.ts instructions and tool descriptions, public/skills/*/SKILL.md, MCP_TOOL_TAPS.md, InstructionsModal, ONLINE.md, and add a JUDGMENT_LOG entry.
- L: Academy. Deploy the prepared Phasing notice, then re-record R01, R04-R07, R09 and R10. This has its own release path and is blocked on the narration and media pipeline. It does not block the game cut-over.

## Open questions
- Where is `codex/phasing-only-canonical` (T5), along with `muju/phasing-only` and the `standard-final` tag? None is in this clone or on origin; all are presumably on the /Users/ashkie machine. Should it be recovered, or re-derived from master? rooms.ts:29-33 says it must be rebased to map 'muju-online-6' and 'muju-phasing-2' either way.
- Is the current master build actually deployed? If it is, live vs-AI 'Hard' is already the v2 engine through the pack-error fallback, and the published R2 '+237 Elo' claim describes an engine players cannot reach. Does the owner know this?
- What should happen to active Standard online rooms ('muju-online-6') and Standard local saves at cut-over: finish under Standard, freeze as view-only, or `RULES_CHANGED`? Only querying the production SQLite database can say how many exist, and I did not do that.
- Is the owner willing to override the preregistered release gates and open the Phasing AI guards with an 'unrated' label? Gate 1 A2 is recorded as a valid FAILED and the M5 v2 floors as not passed. Otherwise 'Phasing-only' would mean no vs-AI mode at all until the gates pass.
- Should `createInitialGameState` drop its default and require an explicit ruleset? That forces every caller to be audited, where flipping the default to 'phasing' would silently change about 75 implicit callers.
- Should Standard survive as an explicit lab-only ruleset for reproducing historical evidence (E0-E4 ladders, the R2 release, the 12 quarantined tests)? Or should those be pinned to a git tag and the code deleted?
- With Phasing as the only ruleset, does the Black crystal-handicap copy and logic still make sense? The Standard rule 'Black skips Place with 1-2 crystals' disappears, and under Phasing both sides start in Act.

## Findings
- [verified-in-code-or-results] An undefined `ruleset` means Standard at the root predicate. `isPhasing` is `state.ruleset === 'phasing'`, `rulesetLabel` falls back to 'Standard', and both `GameState.ruleset` and `GameConfig.ruleset` are optional (the type comment reads 'Missing in historical saves means Standard'). (muju/src/game/rules.ts:3-5; muju/src/game/types.ts:16,28,136-137)
- [verified-in-code-or-results] `createInitialGameState` defaults its fourth parameter to 'standard'. 88 test/spec files call it; 50 of them never mention phasing and so build Standard states implicitly. About 25 lab experiment scripts do the same. Flipping this default would silently change what all of them test. (muju/src/game/board.ts:204-205,249-250. Counts are from grep over tests/, e2e/ and src/ for `createInitialGameState(` with and without 'phasing'. Implicit lab callers include lab/hard-ai/perft/run.ts:141, lab/hard-ai/oracles/canonical-check.ts:156 and lab/experiments/**.)
- [verified-in-code-or-results] Local play defaults to Standard. The ModeSelect state initialises to 'standard', and `RulesetSelect` (Phasing badged 'Experimental') is shown only for Pass & Play. vs-AI and AI-vs-AI force 'standard' unless the personal `?phasingAi=1` preview is on. A saved Phasing game cannot be continued in an AI mode without the opt-in. (muju/src/components/ModeSelect.tsx:46,58,109-114,280-283,298; muju/src/components/RulesetSelect.tsx:13-27; muju/src/ai/phasingPreview.ts:1-40)
- [verified-in-code-or-results] Three guards keep AI seats off Phasing. The worker handler throws 'AI supports Standard rules only' unless `request.phasingPreview` is set. ModeSelect refuses to start. GameScreen disables AI seats through `aiSeatsAllowed = !phasing || phasingPreview`. Tests pin all three closed. (muju/src/ai/worker/handler.ts:113; muju/src/components/ModeSelect.tsx:113; muju/src/components/GameScreen.tsx:89-103; tests/ai/phasing-preview-worker.test.ts:23,42; tests/components/phasing-preview-ui.test.tsx:65,98,111; e2e/phasing-ai.spec.ts:46)
- [verified-in-code-or-results] HardEngine is Phasing-only. `Replica.pack` throws `PackError` for any state whose ruleset is not 'phasing', including an undefined ruleset. The change landed in commit 142f090 (2026-09-19), which is an ancestor of master. (muju/src/ai/hard/core/state.ts:4-7,612-617; `git merge-base --is-ancestor 142f090 HEAD` succeeded.)
- [verified-in-code-or-results] Shipped-path hazard: `useAI` routes difficulty 'hard' to HardEngine with no ruleset check (`useHard = hardOptIn.current && difficulty === 'hard'`), and `hardEnabled` is true. vs-AI is forced to Standard. So `HardEngine.searchTurn` returns `fallback: 'pack-error'` with no actions, `useAI` sets `fellBack = true`, and the legacy v2 per-action loop plays the turn. By default 'Hard' is therefore the v2 engine on every turn. I traced this through the code and did not execute it; `node_modules` is absent. (muju/src/hooks/useAI.ts:125,258,283-288; muju/src/ai/hard/config.ts:47; muju/src/ai/hard/engine.ts:518-531; muju/src/ai/hardOptIn.ts:210-213. tools/engine-seat/contract.ts:38-45 describes the same pack-error-every-turn failure for Standard rooms.)
- [inferred] `e2e/hard-ai.spec.ts` is stale. 'difficulty hard runs HardEngine ... with no opt-in' starts from a Standard `createInitialGameState()` and asserts `packError === 0` and `plansReplayed > 0`. The file was last modified at d764dd7 (2026-09-18 23:01), before the Phasing-only replica at 142f090 (2026-09-19 01:02). CI runs only `npm test` and `npm run test:online:e2e`, so nothing catches it. (muju/e2e/hard-ai.spec.ts:111-119,182-207; `git log -- e2e/hard-ai.spec.ts`; .github/workflows/deploy.yml:37-49; muju/playwright.hard.config.ts `testMatch` is ['hard-ai.spec.ts'].)
- [verified-in-code-or-results] Online and MCP also default to Standard. The lobby state is 'standard' and `createRoom` defaults its parameter to 'standard'. The server `createSchema` uses `.default('standard')` with the description 'Standard is the AI benchmark'. `muju_rules` defaults its input to standard, and `rules.rulesets.default` is 'standard'. The MCP server instructions and tool descriptions present Standard first. (muju/src/online/OnlineLobby.tsx:30,153-154; muju/src/online/client.ts:71; muju/server/schema.ts:48-50; muju/server/mcp.ts:39,66-69; muju/server/observation.ts:120-129,189-191)
- [verified-in-code-or-results] The server reads a missing ruleset as Standard in six places: two SQL `COALESCE(json_extract(data,'$.state.ruleset'),'standard')` lobby and archive queries, the staging status, the observation turn context, the analysis model description, and the analysis tactical cache key. (muju/server/rooms.ts:299,320,522; muju/server/observation.ts:23; muju/server/analysis/core.ts:93,113)
- [verified-in-code-or-results] Room rules versions are 'muju-online-6' (Standard) and 'muju-phasing-2' (Phasing). Legacy 'muju-online-2/3' rooms are migrated in place to `RULES_VERSION`, which is Standard, and those two versions are also hardcoded in the active-lobby SQL. Any other version returns 409 `RULES_CHANGED` with the row left untouched. The docs say archived rooms at retired versions are unopenable, not just unplayable. (muju/server/rooms.ts:23-42,236-247,302-305,424-426; muju/docs/changes/2026-09-19-draw-clock-20.md:1021-1024; tests/server/rooms.test.ts:106-125)
- [verified-in-code-or-results] Local saves are at `SCHEMA_VERSION` 8 and schemas [5,6,7,8] are readable. v5 and v6 saves carry no ruleset and are read as Standard. `validateGameState` allows an undefined ruleset. `RESET_GAME` and new-game creation pass an undefined ruleset straight through to the Standard default. (muju/src/utils/persistence.ts:8-15,182; muju/src/hooks/useGameState.ts:91,108,185)
- [verified-in-code-or-results] The Standard-only rules code a Phasing-only cleanup would delete:
- turn.ts: the `startTurn` pre-upkeep path, `automaticUpkeepUndo`, `finishTurnStart`, and the non-Phasing arms of `startActionPhase` and `endTurn`.
- homeCheckmate.ts: the `prepare()` upkeep/promotion rescue DFS (about 35 lines) and the promotion arm of the damage bound.
- simulate.ts: instant `placeUnit` in `applyBuyUnit` and the auto-advance in `finishPlacement`.
- engine-v2.ts: the post-upkeep rescue proof. (muju/src/game/turn.ts:30-40,44-58,64-78,104-114; muju/src/game/homeCheckmate.ts:78,129-160,179; muju/src/ai/simulate.ts:119-136; muju/src/ai/engine-v2.ts:134-142)
- [verified-in-code-or-results] Non-test, non-comment `isPhasing(` call sites number 48:
- server/analysis: 15
- src/game: 14
- server/observation.ts: 5
- src/ai top level: 5
- src/ai/planner: 3
- src/ai/hard/verify: 2
- src/components: 2
- server/rooms.ts: 1
- lab/harness: 1
A broader regex that also catches `?? 'standard'`, `phasing ?` JSX ternaries and default parameters finds about 121 sites:
- src/components: 40
- src/game: 21
- server/analysis: 19
- server top level: 12
- src/online: 5
- src/ai: 5
- src/utils: 4
- src/ai/hard: 4
- tools/engine-seat: 3
- src/ai/planner: 3
- src/hooks: 2
- lab/harness: 2
- src/ai/worker: 1 (Grep counts saved at /private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/branch_sites.txt. The per-file list is reproduced in the report.)
- [verified-in-code-or-results] Lab and AI tooling is already Phasing-first. lab/harness/runner.ts creates 'phasing' states and throws on a non-Phasing `initialState`. `HARNESS_RULES_VERSION` is 'muju-phasing-2'. tools/engine-seat refuses non-Phasing rooms and requires `phasingHardReadiness: 'M7-passed'`. The WASM tactics kernel is ABI 7, 'Act roots only, no resource or promotion inputs'. lab/hard-ai/ladder/ruleset.ts warns that a Standard opening replayed as Phasing does not fail loudly. (muju/lab/harness/runner.ts:133-134; muju/lab/harness/types.ts:16-31; muju/tools/engine-seat/contract.ts:14,60-63; muju/assembly/tactics.ts:1,142; muju/src/ai/wasm/kernel.ts:31; muju/lab/hard-ai/ladder/ruleset.ts:1-30)
- [verified-in-code-or-results] vitest.config.ts quarantines 12 test files whose expectations were written for Standard or the old weights and have not been ported. Their recorded failure counts include eval-correct 14/27, approach-tie 5/5, eval-audit 7/10, and a collection error in suites.test.ts. CI's `npm test` therefore skips them. (muju/vitest.config.ts:26-88)
- [verified-in-code-or-results] The docs and the code disagree. SPEC.md and the MCP rules text say 'Standard remains the default' and 'Built-in AI remains Standard-only'. In code both engines have been ported to Phasing, Hard is Phasing-only, and Hard cannot play Standard at all. (muju/SPEC.md:5,11; muju/server/observation.ts:122,129 against muju/src/ai/phasingPreview.ts:5-8 and muju/src/ai/hard/core/state.ts:615)
- [verified-in-code-or-results] The plan of record for Standard retirement is docs/changes/2026-09-phasing-only.md, a 27-node DAG plan. 21 nodes are 'pending', 5 Academy nodes are 'blocked', and only wasm-tactics and ai-search are 'changed'. The plan defers canonical removal to the T5/M8 branch `codex/phasing-only-canonical`, which reserves rules version 'muju-online-5'. That branch, `muju/phasing-only`, and the `standard-final` tag named in the preregistration are all missing from this clone and from origin. `git tag` is empty, and `git ls-remote` shows no matching heads. (muju/docs/changes/2026-09-phasing-only.md (node dispositions; lines 412,424); muju/server/rooms.ts:29-33; muju/docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md:11-25; `git branch -a`, `git tag` and `git ls-remote --heads origin` output.)
- [inferred] Reinterpreting a stored Standard state as Phasing is destructive. A Standard turn start sits in `turn.phase: 'place'` with `actionsRemaining: 4` and a possible `upkeepPending`. Under Phasing, 'place' is the end-of-turn Prepare phase, `END_PLACE_PHASE` hands the turn off (`startActionPhase` calls `handOffTurn`), and the Act phase would be skipped. The lab invariant 'Phasing Prepare/upkeep retains Act actions' would throw. (muju/src/game/turn.ts:36-40,75-79; muju/lab/harness/invariants.ts:87-88)
- [verified-in-code-or-results] The analysis board defaults to Standard: any `?ruleset` value other than 'phasing' gives 'standard', and the page links to the other ruleset's board. Four component props also default to `phasing = false`: ActionBar, UnitShop, BlackCrystalHandicap and InstructionsModal. (muju/src/components/AnalysisScreen.tsx:30,128,154; muju/src/components/ActionBar.tsx:16; muju/src/components/UnitShop.tsx:12; muju/src/components/BlackCrystalHandicap.tsx:4; muju/src/components/InstructionsModal.tsx:78)
- [verified-in-code-or-results] 19 of the 27 e2e specs never mention Phasing and run through the default Standard UI or injected Standard saves. Seven assert Standard phase copy such as 'Start actions': action-budget, ai-timer, lobby, mobile, online, pass-play and upkeep. 13 of the 15 specs that inject an 'elemental-tactics-save' at `schemaVersion` 6 never mention Phasing. Dedicated Phasing e2e coverage is one test in phasing.spec.ts and three in phasing-ai.spec.ts. (Grep over muju/e2e/*.spec.ts; the per-spec table is in the report.)
- [doc-claim-only] The Academy course still teaches the Standard turn order in lessons R01, R04-R07, R09 and R10. A Phasing notice is prepared in build-release.py and verify-live.py asserts on it, but the docs say it is prepared and not deployed. `rules-verification.json` still says v2.9. (muju/academy/build-release.py:162-163; muju/academy/verify-live.py:28-35; muju/docs/changes/2026-09-19-academy-phasing-notice.md:1-10; muju/docs/changes/2026-09-19-draw-clock-20.md:1018-1020)

## Report
# Where the Standard/Phasing split lives in executable code (master a02bbb7, 2026-09-20)

I established everything below by reading code and git history. I ran no tests, because `node_modules` is not installed in `muju/`. Local master equals origin/master.

## 1. Root definitions

- `src/game/rules.ts:3-5`: `isPhasing = state.ruleset === 'phasing'`, and `rulesetLabel` falls back to 'Standard'. An undefined ruleset therefore means Standard everywhere.
- `src/game/types.ts:16,28,137`: `Ruleset = 'standard' | 'phasing'`. The field is optional on both `GameConfig` and `GameState`, and the type comment reads "Missing in historical saves means Standard."
- `src/game/board.ts:204`: `createInitialGameState(..., ruleset: Ruleset = 'standard')`. Phasing adds `pendingSummons: []` and nothing else.
- The reducer is `src/ai/simulate.ts` (`applyAction`). The browser, the server and the lab all use it.

## 2. Default ruleset per surface

| Surface | Default today | Standard selectable? | Evidence |
|---|---|---|---|
| Pass & Play | Standard | Yes. Phasing is badged "Experimental". | ModeSelect.tsx:46,58,280; RulesetSelect.tsx |
| vs-AI and AI-vs-AI | Standard, forced | Phasing only with the personal `?phasingAi=1` preview | ModeSelect.tsx:109-113,298 |
| Online lobby UI | Standard | Yes | OnlineLobby.tsx:30,153; online/client.ts:71 |
| Server room create (HTTP and MCP) | Standard. The schema describes it as "Standard is the AI benchmark". | Yes | server/schema.ts:48; rooms.ts:411-426 |
| MCP `muju_rules` and the rules object | Standard. The Phasing text is a nested override. | Yes | mcp.ts:66-68; observation.ts:120-129,189-191 |
| Analysis board | Standard unless `?ruleset=phasing` | Yes, via a link to the other board | AnalysisScreen.tsx:30,154 |
| `createInitialGameState` | Standard | — | board.ts:204 |
| Hard engine replica | Phasing only; it throws `PackError` otherwise | No | src/ai/hard/core/state.ts:612-617 |
| WASM tactics kernel (ABI 7) | Act roots only, with no resource or promotion inputs | — | assembly/tactics.ts:1,142 |
| lab/harness runner | Phasing only; it throws on a non-Phasing state | No | lab/harness/runner.ts:133-134 |
| tools/engine-seat | Phasing only, closed by default; it needs `phasingHardReadiness: "M7-passed"` | No | tools/engine-seat/contract.ts:14,60-63 |
| Academy | Recordings teach Standard. A Phasing notice is prepared but not deployed (doc claim). | — | academy/build-release.py:162-163 |

Players default to Standard on every surface, while the AI and lab machinery has already moved to Phasing. The two halves do not match, and section 3 shows the consequence.

## 3. The shipped-path bug this exposes

- `useAI.ts:125` sets `useHard = hardOptIn.current && difficulty === 'hard'`, with no ruleset check. `hardEnabled` is `true` (hard/config.ts:47).
- vs-AI is forced to Standard.
- `HardEngine.searchTurn` calls `pack`, which throws `PackError`. The engine returns `{actions: [], fallback: 'pack-error'}` (engine.ts:518-531).
- `useAI.ts:283-288` records the fallback and continues with the v2 per-action loop.

So by default "Hard" is the v2 engine on every turn. tools/engine-seat/contract.ts:38-45 describes exactly this failure for Standard rooms.

The e2e that would catch it (`e2e/hard-ai.spec.ts:182-207`, which asserts `packError === 0` from a Standard initial state) predates the Phasing-only replica: the spec was last touched at d764dd7, and the replica landed at 142f090. It is also outside CI, because deploy.yml runs only `npm test` and `npm run test:online:e2e`.

Making Phasing the vs-AI default would remove this mismatch.

## 4. Branch-site counts

Exact non-test, non-comment `isPhasing(` call sites: 48.

- server/analysis, 15: tactics 4, core 2, index 3, economy 3, geometry 2, units 1
- src/game, 14: turn 6, homeCheckmate 3, replay 3, moveHistory 1, rulesetLabel 1
- server/observation.ts: 5
- src/ai top level, 5: simulate 2, turnFunding 2, engine-v2 1
- src/ai/planner, 3: beam, scoring, summons
- src/ai/hard/verify/perft.ts: 2
- src/components, 2: GameScreen, UpkeepPanel
- server/rooms.ts: 1
- lab/harness/invariants.ts: 1

A broader regex adds `?? 'standard'`, `=== 'phasing'`, `phasing ?` JSX ternaries and default parameters. It finds about 121 sites:

- src/components: 40 (GameScreen alone is 17)
- src/game: 21
- server/analysis: 19
- server top level: 12
- src/online: 5
- src/ai: 5
- src/utils: 4
- src/ai/hard: 4
- tools/engine-seat: 3
- src/ai/planner: 3
- src/hooks: 2
- lab/harness: 2
- src/ai/worker: 1

Per-file counts are saved in the scratchpad file `branch_sites.txt`.

Standard-only code that a cleanup would delete:

- turn.ts: the pre-upkeep `startTurn` path (:36-40), `automaticUpkeepUndo` (:44-58), `finishTurnStart` (:68-73), and the Standard arms of `startActionPhase` and `endTurn`.
- homeCheckmate.ts: the `prepare()` DFS (:129-160) and the promotion arm of the damage bound (:78).
- simulate.ts: `finishPlacement` auto-advance and instant `placeUnit` (:119-136).
- engine-v2.ts: the post-upkeep rescue proof (:134-142).
- server/analysis/core.ts: `actionReady` and the Standard arm of `turnFor` (:85-107).
- All Standard copy in the components.

## 5. Places that silently read an undefined ruleset as Standard

1. `isPhasing` and `rulesetLabel` (rules.ts:4-5).
2. The `createInitialGameState` default (board.ts:204). There are 50 implicit test files and about 25 lab scripts, including lab/hard-ai/perft/run.ts:141, oracles/canonical-check.ts:156 and audit/seed-cases.ts:56. lab/hard-ai/ladder/openings.ts:231 passes 'standard' explicitly, which is the correct pattern.
3. `useGameState.ts:91,108`: `options.ruleset` and `state.ruleset` pass through undefined. Line 185 clears undo history on `END_ACTION_PHASE` unless the state is Phasing.
4. `ModeSelect.tsx:109`: `savedGame?.ruleset ?? 'standard'`.
5. `persistence.ts:8,182`: v5 and v6 saves have no ruleset and are valid. Readable schemas are [5,6,7,8].
6. Server: rooms.ts:299,320 (SQL `COALESCE`), :522; observation.ts:23; analysis/core.ts:93,113 (the cache key).
7. rooms.ts:236-247: legacy 'muju-online-2/3' rooms migrate into `RULES_VERSION`, which is Standard. Those two versions are also hardcoded in the lobby SQL at :303.
8. Component prop defaults `phasing = false`: ActionBar:16, UnitShop:12, BlackCrystalHandicap:4, InstructionsModal:78.
9. `AnalysisScreen.tsx:30`: any non-'phasing' query value gives Standard.
10. `compactReport.ts:105` and `positionReport.ts:76`: `?? 'standard'`, and a null rules revision.
11. `worker/handler.ts:113`: only an explicit 'phasing' ruleset triggers the guard, so an undefined ruleset is searched as Standard.
12. `lab/harness/types.ts:16`: "A record with NO rulesVersion is Standard."

Two sites fail closed, which is the right behaviour: hard/core/state.ts:615 and engine-seat/contract.ts:60-61.

**Migration hazard.** If "Phasing-only" is done by deleting branches or making `isPhasing` always true, every stored object in items 5-7 is reinterpreted as Phasing. A Standard turn start sits in `turn.phase: 'place'` with `actionsRemaining: 4`. Under Phasing, 'place' is the end-of-turn Prepare phase, so `END_PLACE_PHASE` hands the turn off and the Act phase is skipped (turn.ts:75-79). lab/harness/invariants.ts:87 would throw on it. lab/hard-ai/ladder/ruleset.ts:17-23 already documents that a cross-ruleset replay "does not fail loudly". The DAG (content-dag.json:107,141) prescribes four things: never reinterpret a stored state, bump the versions, archive read-only, and keep a captured fixture.

## 6. What "Phasing is the only live ruleset" requires, by surface

- **Browser new-game UI.** Default to Phasing. Remove `RulesetSelect` from new-game flows, or reduce it to a hidden constant. Show no ruleset badge, or show "Phasing" only on legacy games.
- **AI.** Open the three guards: handler.ts:113, ModeSelect.tsx:113 and :298, GameScreen.tsx:103. Retire `phasingPreview.ts`. The `turnFunding.ts` and planner branches then collapse to their Phasing arms.
- **Local saves.** Move to `SCHEMA_VERSION` 9. For a non-Phasing save, choose one of three policies: resume as Standard (keep the branches), offer view-only analysis, or clear it. Do not convert.
- **Rooms.** Make new rooms Phasing only, and reject 'standard' in `createSchema`. Decide what happens to active 'muju-online-6' games. Removing 'muju-online-6' from the accepted versions gives `RULES_CHANGED` with the row untouched, which is the existing precedent. But such rooms become unopenable (draw-clock doc, item 7), so read-only viewing is new work. Remove the 'muju-online-2/3' migration, which upgrades into Standard.
- **MCP and agent text.** Default `muju_rules` and `rules.rulesets` to Phasing. Restructure the rules object so Phasing is top-level. Make the tool descriptions drop their Standard-first phrasing.
- **Analysis board.** Default to Phasing. Keep Standard only when it is entered from a Standard score.
- **Replay and history.** Keep the `isPhasing(before)` labels in replay.ts, moveHistory.ts and analysis.ts as the presentation needed to view retired games.
- **Lab.** Already Phasing-only. Historical Standard experiments need an explicit 'standard' argument before the default flips.
- **Academy.** Deploy the notice, then re-record R01, R04-R07, R09 and R10. This is a separate release path.

## 7. Tests: rewrite or delete

| Group | Files | Action |
|---|---|---|
| Guard-pinning tests | tests/ai/phasing-preview-worker.test.ts, phasing-preview.test.ts, tests/components/phasing-preview-ui.test.tsx, e2e/phasing-ai.spec.ts:46 | Invert or delete when the guards open |
| Standard turn-order semantics | tests/game/turn.test.ts (8 cases), home-checkmate.test.ts (10), crystal-handicap.test.ts (3), hooks/upkeep-undo.test.ts (4), hooks/turn-replay and pass-play, server/analysis.test.ts (26), server/clocks, clock-pressure and history, ai/correctness, search-correctness, turn-execution, worker-turn | Rewrite to Phasing. If only the defaults are flipped, keep these as an explicit-'standard' legacy suite. |
| Already quarantined | 12 files in vitest.config.ts:26-88 | Delete them as historical records pinned to a tag, or port them. The file names an owner for each. |
| Rule-neutral tests using the Standard default | About 30 of the 50 implicit files, for example board, building, cleave, mining, metal, tier3-cap, resource-map | Pass 'phasing' explicitly. Most should hold, but I did not run them. |
| e2e | 19 of 27 specs never mention Phasing. Seven assert Standard phase copy (action-budget, ai-timer, lobby, mobile, online, pass-play, upkeep). 13 inject Standard v6 saves. hard-ai.spec.ts is already stale. | Rewrite for the Phasing flow and add the Phasing specs to CI |

Existing Phasing coverage:

- Rules and server: tests/game/phasing.test.ts (11 cases), tests/server/phasing.test.ts (3), tests/server/phasing-analysis.test.ts (8), tests/ai/phasing.test.ts (10).
- Hard AI and lab: 45 of 68 tests/ai/hard files and 32 of 53 tests/lab files mention Phasing.
- e2e: phasing.spec.ts has one test and phasing-ai.spec.ts has three.

## 8. Where the docs and the code disagree

- SPEC.md:5 and :11, and observation.ts:122 and :129, say Standard is the default and that "Built-in AI remains Standard-only". In code both engines play Phasing, and Hard plays only Phasing.
- PHASING-PREREGISTRATION-2026-09-18.md:11-25 names a `standard-final` tag, but `git tag` is empty. The nearest anchor is 142f090's parent, 2922375. I did not inspect the replica at 2922375, so that anchor is my inference.
- rooms.ts:29-33, ONLINE.md:546 and several change records cite the branches `codex/phasing-only-canonical` and `muju/phasing-only`. Neither exists locally or on origin.
- docs/changes/2026-09-phasing-only.md is the retirement plan. Of its 27 nodes, 21 are pending, five Academy nodes are blocked, and two are marked changed.

## 9. Recommended order of work (my recommendation)

1. Flip the defaults and open the guards: the 12 default sites and the 3 guards. Keep every `isPhasing` branch, so stored Standard saves, rooms and replays keep working with no reinterpretation risk. This also fixes the Hard downgrade and makes the Phasing AI work in sections 1-3 visible to players.
2. Set the server and save retirement policy, and build a read-only archive path.
3. Do the canonical deletion (T5/M8) last, and only if the maintenance cost justifies it. The 48 `isPhasing` branches are cheap to keep.