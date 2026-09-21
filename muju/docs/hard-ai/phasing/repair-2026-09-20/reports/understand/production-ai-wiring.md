HEADLINE: On master and on the live Render site (which auto-builds master with no test gate), a player who picks Hard under Standard gets legacy AIEngineV2 every turn. `hardEnabled` is true, but the HardEngine replica has been Phasing-only since 142f090, so each turn returns `pack-error` and falls to the v2 per-action loop. The new Hard engine only plays behind the personal `?phasingAi=1` preview, and no Phasing gate (0/1/2/3) has passed. Making it the default Hard under Phasing is a small change: three UI/worker guards that all read `readPhasingAiPreview()`, because the AIEngineV2 fallback is already wired. The blocker is strength evidence: bootstrap weights with 5 of 62 features nonzero, failed suite floors, and three owner reports of bad play.

## Remaining work
- S — Fix the Standard Hard regression now. Either gate `useHard` on `state.ruleset === 'phasing'` in src/hooks/useAI.ts:125, or set `hardEnabled=false`, so Standard Hard takes the budget-scaled v2 whole-turn path instead of a pack-error plus the 3 s-capped per-action loop every turn. Nothing blocks this, and it becomes moot if Standard is retired in the same release.
- S — Open the Phasing AI guards. Replace the personal opt-in with a release constant in src/ai/phasingPreview.ts (keeping `?phasingAi=0`), default ModeSelect's ruleset to 'phasing', and remove the 'Preview · unreleased AI' badge and the 'AI plays Standard rules' copy. Blocked on a decision to waive or amend the preregistered Gate 1 unlock, preferably as a dated amendment.
- S — Decide what default Hard routes to under Phasing. Option A keeps `hardEnabled=true`, so HardEngine (bootstrap weights) plays and v2 is the fallback. Option B sets `hardEnabled=false` so Hard means aiv2-hard and HardEngine is reached with `?hardAi=1`, which is the preregistered first rollout row. Blocked on any head-to-head evidence; Gate 2 has never run under Phasing.
- M — Update the tests that pin the closed guards (tests/ai/phasing-preview.test.ts, tests/ai/phasing-preview-worker.test.ts, tests/components/phasing-preview-ui.test.tsx, tests/hooks/phasing-ai-funding.test.tsx, e2e/phasing-ai.spec.ts test 1), and re-point e2e/hard-ai.spec.ts at Phasing initial states, since it is currently stale and would fail. Blocked only by installing dependencies (this checkout has no node_modules).
- S — Get CI green on master. Four lab tests fail on the runner (one needs `rg`; the rest are lab instrument assertions). Gate them the way PR #23 did, or install ripgrep in deploy.yml. Nothing blocks this.
- S — Reconcile the two production surfaces. Render serves HEAD. Pages serves the 2026-09-18 bundle and only updates by manual publish (Deploy step skipped, no CLOUDFLARE_API_TOKEN). Either publish Pages, redirect it to Render (09e916f made Render canonical), or add the secret. Blocked on the owner's credentials.
- M — Give the Phasing HardEngine an evaluation beyond material, bank and economy: the corpus → fit → validation work M6 deferred, or a few hand-set weights for the terms the owner's reports implicate (hanging pieces, centre and space, discounting disruption value). The measured config hash changes, so this needs a preregistration amendment.
- M — Run a calibrated Gate 1 row with the A5 adapter and then a Gate 2 head-to-head (hard@desktop vs aiv2-hard under muju-phasing-2). The A5 adapter pacing fix must land first, and the run needs a quiet machine.
- S/M — Build a White opening book (the owner's request). BK03 book plumbing exists but EMPTY_BOOK is the default and no book has been built. Needs a trusted source for lines and an amendment, or placement outside the measured adapter.
- S — Exempt the Hard route from the 25% Prepare reserve in src/ai/turnFunding.ts and useAI.ts:257, since HardEngine plans the whole Phasing turn in one request. Keep the reserve for the fallback path. Nothing blocks this.
- M — Device profiles (E5.3). The browser always uses the DESKTOP shape, `profileFor`/calibrate is never called from the worker, and the phone rung and Gate 3 responsiveness are unmeasured. Blocked on access to devices.
- S — Doc hygiene. The opening paragraph of ENGINE-SEAT-MATCH-2026-09-19.md contradicts its own Phasing-only section, and hardOptIn.ts, protocol.ts and RELEASE-2026-09-18.md still describe a Standard HardEngine as what ships.

## Open questions
- Does the Phasing HardEngine with bootstrap weights actually beat aiv2-hard under muju-phasing-2? No committed result answers this. Gate 2 never ran, and the only signals are failed suite floors and three negative owner anecdotes.
- Is the owner willing to amend or waive the preregistered staged unlock (Gate 1 before any Phasing vs-AI) in order to retire Standard? The code change is trivial; the process commitment is what blocks it.
- Which URL do players actually use: Render (HEAD, where Standard Hard is degraded) or Pages (2026-09-18 bundle, where Standard Hard is the real engine)? Commit 09e916f says Render is canonical, but ModeSelect's back link still points to deevgames.pages.dev.
- On retirement, what happens to existing Standard saves (`elemental-tactics-save`, schemaVersion 6) and Standard online rooms? The DAG forbids reinterpreting stored state under different rules. Should they be refused, archived, or left playable for humans only?
- Is the unmerged `codex/phasing-only-canonical` (T5) branch, referenced in docs/changes/2026-09-19-draw-clock-20.md, the intended vehicle for retiring Standard? It is not in this clone's remotes.
- I could not run anything locally because this checkout has no node_modules. The claim that e2e/hard-ai.spec.ts fails at HEAD and the exact per-turn behaviour under pack-error come from reading code plus the commit message's own admission, not from a run.

## Findings
- [verified-in-code-or-results] The HardEngine replica is Phasing-only. `Replica.pack` throws PackError for any non-phasing state, and `HardEngine.searchTurn` turns that into an empty plan with `fallback: 'pack-error'`. (/Users/ethancd/src/deevgames/muju/src/ai/hard/core/state.ts:615-616; /Users/ethancd/src/deevgames/muju/src/ai/hard/engine.ts:519-531; introduced by commit 142f090 (2026-09-19 01:02))
- [verified-in-code-or-results] The release flag `hardEnabled` is true, so every Hard seat sends `engine:'hard'` unless the player opts out with `?hardAi=0` or `localStorage['muju.hardAi']='0'`. Under Standard that produces a pack-error every turn, `recordHardFallback('packError')`, and the rest of the turn runs on the legacy per-action AIEngineV2 loop, which caps each decision at min(share, 3000 ms). The 30 s and 60 s paces therefore buy nothing on this path. (src/ai/hard/config.ts:47; src/ai/hardOptIn.ts:210-221; src/hooks/useAI.ts:125,289,336-358; src/ai/engine-v2.ts:42,125; commit 425efa4 message: 'under Standard the Hard seat falls back to the legacy engine every turn because the replica is Phasing-only')
- [verified-in-code-or-results] The Phasing AI preview turns on with `?phasingAi=1`, which persists `localStorage['muju.phasingAi']='1'`; `?phasingAi=0` clears it. It defaults to off and is read once per game start. That one function is the only thing that opens all three guards: the worker's Phasing refusal, ModeSelect's ruleset control for AI modes, and GameScreen's `aiSeatsAllowed`. (src/ai/phasingPreview.ts:41-88; src/ai/worker/handler.ts:113; src/components/ModeSelect.tsx:55-58,109-113,280-282,298; src/components/GameScreen.tsx:98-103,270,278; src/hooks/useAI.ts:109-116)
- [verified-in-code-or-results] Under Phasing with the preview on, Hard runs the real HardEngine with the DESKTOP profile on every device, EMPTY_BOOK, and default weights `phasing-accounting-bootstrap-v1`. It is called with targetMs = deadlineMs = the turn allowance minus a reserve of 2 × (budget / 8), which gives 7.5 / 22.5 / 45 s for the quick / normal / deep paces. Easy and Medium, and Hard with `?hardAi=0`, run the Phasing-ported AIEngineV2 with up to three searches per turn. (src/ai/worker/handler.ts:59-62,133-166; src/ai/hard/engine.ts:262-269; src/ai/hard/eval/weights.ts:44; src/ai/turnFunding.ts:54-76; src/ai/turnTime.ts:14-18; src/hooks/useAI.ts:256-258)
- [verified-in-code-or-results] Render serves master HEAD. Its bundle contains `muju.phasingAi`, 'Preview · unreleased AI' and 'Report this position', plus compactReport's '(partial)' string from a02bbb7, and its lazy engine chunk contains 'the replica is Phasing-only'. Standard Hard on the live Render site is therefore the v2 fallback. (curl of https://deevgames-muju.onrender.com/muju/ returned assets/index-Brouqdz7.js, entry-eJsBPXxd.js and engine-CQYKLyuK.js (grep counts 1/1/2/1 and 1); muju/ONLINE.md:63-73 says Render builds the Dockerfile from master)
- [verified-in-code-or-results] Cloudflare Pages serves an older bundle, the 2026-09-18 Standard Hard release. It has `muju.hardAi` and `hardMs` but no `phasingAi`, no 'Thinking time' paces, and an engine chunk without the Phasing-only refusal. The workflow's Deploy step is skipped even on green runs because no CLOUDFLARE_API_TOKEN is configured, so Pages only changes when published manually. (curl of https://deevgames.pages.dev/muju/ returned index-DvxegQEU.js and engine-DQcl4NFA.js (grep counts 0); `gh run view 35447835829` shows 'Deploy: skipped' and 'Explain manual deployment: success'; .github/workflows/deploy.yml Deploy step `if: env.CLOUDFLARE_API_TOKEN != ''`)
- [verified-in-code-or-results] CI on master HEAD is red. Run 35475103182 on a02bbb7 fails at the 'Verify Muju rules, multiplayer and MCP' step on four lab instrument tests. One of them fails with 'spawnSync rg ENOENT'. None of the four touches the routing code. (`gh run list --workflow deploy.yml`; `gh run view 35475103182 --log-failed` (tests/lab/gate1-shard.test.ts, tests/lab/gate1.test.ts ×2, tests/lab/suites-phasing-contract.test.ts))
- [inferred] `e2e/hard-ai.spec.ts` is stale. It starts Standard `createInitialGameState()` games and asserts `packError == 0` and `plansReplayed > 0`, and it has not been edited since d764dd7, before the Phasing-only replica landed. CI never runs it because `playwright.online.config.ts`'s testMatch excludes it, and commit 425efa4's verification list omits it as well. (muju/e2e/hard-ai.spec.ts:182-207; `git log -- e2e/hard-ai.spec.ts` (last commit d764dd7); muju/playwright.online.config.ts testMatch; src/game/board.ts:204 (default ruleset 'standard'))
- [verified-in-code-or-results] The 2026-09-18 Hard release evidence (R1 +124 Elo, R2 +237 Elo vs aiv2-hard at wall:8000) was measured under Standard with the Standard replica. None of it applies to the engine now on master. (muju/docs/hard-ai/RELEASE-2026-09-18.md:22-23,33-34,122-135; Phasing-only replica commit 142f090 is dated a day after the release)
- [doc-claim-only] The Phasing preregistration defines a staged unlock. Gate 1 plus the e2e opens Phasing vs-AI with Hard routed to aiv2-hard (`hardEnabled=false`). Gate 0 opens `engine:'hard'` for `?hardAi=1` only. Gates 0, 2 and 3 together set `hardEnabled=true`. None has passed: Gate 1 'remains NOT PASSED', and the latest pilot is ineligible because of an adapter pacing defect (addressed by amendment A5). (muju/docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md:55-98,216; commits 0a6e988 and 0d3f5e3)
- [doc-claim-only] The Phasing HardEngine fails its pinned suite floors. In M5 v1: invariants 5/18 (floor 17) and summon-disruption 5/14 (floor 13). In the v2 suites: invariants 8/15 (floor 14), economy 19/20 (floor 20) and summon-disruption 12/14 (floor 13). The cause is that the bootstrap weights have only 5 nonzero features out of 62. (muju/docs/hard-ai/phasing/M6-STATUS.md:7-16,22; commit 00dfc8f message)
- [doc-claim-only] The owner's three reports from the live preview (hard/deep, no fallbacks in diag) show a first turn that shuffles a Fire back into its home corner, a Lightning that over-commits to disrupt a 3-crystal summon and is left hanging, and a lone Fire left en prise. He asked for a White opening book, which is not implemented; EMPTY_BOOK is the default. (muju/docs/hard-ai/phasing/PREVIEW-REPORTS-2026-09-19.md:14-79; src/ai/hard/engine.ts:264)
- [inferred] Under the Hard Phasing route, a quarter of the turn allowance is reserved for the upkeep and Prepare segments. HardEngine returns the whole Phasing turn (Act, end, summon, end) in one plan, so that reserve is normally never spent. (src/ai/turnFunding.ts:61-76; PREVIEW-REPORTS diag lines show `requests` equal to turns played (requests=1 hardTurns=1 plansReplayed=1 for a full 'F1>…; end; +L1i10; end' turn))
- [verified-in-code-or-results] The engine seat (`tools/engine-seat`) is Phasing-only and closed by default. It refuses any room unless its config carries the literal `phasingHardReadiness: "M7-passed"`. It runs HardEngine with a 55 s target and a 60 s watchdog and has no v2 fallback. The opening paragraph of its doc still says 'unconditional Standard check', which contradicts the doc's later section and the code. (muju/tools/engine-seat/contract.ts:14,58-64; muju/tools/engine-seat/runner.ts:14-29,101; muju/docs/ENGINE-SEAT-MATCH-2026-09-19.md:4-6 vs 195-204)
- [verified-in-code-or-results] Engines are instantiated in only two places: the worker handler, which serves the two `useAI` seats in GameScreen, and the engine-seat tool. Online rooms and the analysis board never construct an engine. (grep for `new AIEngineV2|new HardEngine|useAI(` across src, server and tools: src/ai/worker/handler.ts:61,124; src/components/GameScreen.tsx:266,274; tools/engine-seat/runner.ts:101)

## Report
# What AI a player actually faces today, and how Hard is gated

Today, picking Hard under Standard on master or on the live Render site gets legacy AIEngineV2 every turn. The new Hard engine plays only behind the personal `?phasingAi=1` preview. The details follow.

All paths are under `/Users/ethancd/src/deevgames/muju/`. I ran nothing locally because this checkout has no `node_modules`. The evidence is code reading, git history, `gh` run data, and read-only fetches of the two live bundles.

## 1. Routing

`src/hooks/useAI.ts` resolves three things once per game start and resets them in `cancel()`:

- **Hard route:** `hardOptIn = resolveHardAiRoute()`, which is `optOut ? false : (hardEnabled || optIn)` (`src/ai/hardOptIn.ts:210-221`). `hardEnabled` is `true` (`src/ai/hard/config.ts:47`).
- **Hard budget override:** `hardBudgetMs = readHardTurnBudgetMs()`, the `?hardMs` override clamped to [1000, 120000]. It applies to the Hard seat only.
- **Phasing preview:** `phasingPreview = readPhasingAiPreview()`. `?phasingAi=1` persists `localStorage['muju.phasingAi']='1'`; `?phasingAi=0` clears it; default is off.

The rest of the path:

- **Engine choice:** `useHard = hardOptIn && difficulty === 'hard'` (line 125). There is no ruleset term in it.
- **Turn funding:** one allowance per turn from `src/ai/turnTime.ts`. Easy gets 1/3/10 s, Medium 3/10/30 s and Hard 10/30/60 s for quick/normal/deep. Quick is the default.
- **Worker:** `src/ai/worker/handler.ts:113` refuses any `ruleset:'phasing'` state unless the request carries `phasingPreview: true`, and only `useAI` sets that marker. With `engine:'hard'` it lazy-imports `HardEngine` and calls `searchTurn(state, {targetMs: decisionMs, deadlineMs: decisionMs})`. Otherwise it runs `AIEngineV2.findBestAction` with `scaleToBudget` on in turn mode.

Since commit 142f090 (2026-09-19 01:02) the HardEngine replica is Phasing-only. `src/ai/hard/core/state.ts:615-616` throws `PackError` for anything else. `engine.ts:519-531` returns `{actions: [], fallback: 'pack-error'}`. `useAI.ts:289` then records the fallback and finishes the turn on the v2 per-action loop.

The 2026-09-18 release that flipped `hardEnabled` was measured with a Standard replica (`docs/hard-ai/RELEASE-2026-09-18.md`). That engine no longer exists on master.

## 2. Decision table (master HEAD a02bbb7)

| Ruleset | Difficulty | Flags | Engine that decides | Budget | Fallback |
|---|---|---|---|---|---|
| Standard | easy | any | AIEngineV2 easy preset, whole-turn (`mode:'turn'`) | 1/3/10 s turn; search clock 0.8 s at quick, about 2.5 s and 8.5 s when scaled | Worker error or illegal plan action → v2 per-action loop on the remaining allowance. An illegal per-action proposal shows an error banner. |
| Standard | medium | any | AIEngineV2 medium preset, whole-turn | 3/10/30 s turn; search clock 1.5 s, about 7.5 s, about 24.5 s | Same as easy. |
| Standard | hard | none (default) | Requests `engine:'hard'`, gets `pack-error` every turn, then AIEngineV2 hard preset in the per-action loop | 10/30/60 s funded, but each decision is capped at min(share, 3000 ms); normal and deep buy nothing | Already in fallback every turn. `[hard-ai] fallback packError` is logged and "AI is using its backup engine" flickers. |
| Standard | hard | `?hardAi=0` or `muju.hardAi='0'` | AIEngineV2 hard preset, whole-turn, budget-scaled | search clock 3 s / 22.5 s / 45.5 s | v2 per-action loop. |
| Standard | hard | `?hardMs=N` | As the default Hard row | N ms turn, clamped to [1000, 120000] | As the default Hard row. |
| Standard | any | `?phasingAi=1` | No effect. The marker is only set when the state is Phasing. | — | — |
| Phasing | any | none (default) | No engine. ModeSelect hides the ruleset control for AI modes and forces Standard. "Continue saved game" is disabled outside Pass & Play. GameScreen disables both seats. The worker refuses. | — | If forced, the worker replies "AI supports Standard rules only…" and the hook shows an error. |
| Phasing | easy / medium | `?phasingAi=1` | AIEngineV2 (Phasing port, ABI 7), up to three whole-turn searches per turn (Act, upkeep, Prepare) | 1/3/10 s or 3/10/30 s turn; each search gets the remainder minus `segmentsAfter × budget/8` | Per-action loop with divisor `actionsRemaining + 3`. A 64-search safety stop ends the turn with `phaseEndAction`. |
| Phasing | hard | `?phasingAi=1` | Real HardEngine: DESKTOP profile on every device, `EMPTY_BOOK`, weights `phasing-accounting-bootstrap-v1`. It normally plans the whole turn in one request. | target = deadline = allowance minus 25% reserve, so 7.5 / 22.5 / 45 s. Rung is the largest `WORK_LADDER` step ≤ unitsPerMs × target; the cold profile is 200 u/ms and the ladder tops out at 51.2M. | `pack-error`, `engine-error`, `divergence`, `invalidSuffix`, `emptyPlan` and `workerError` are each counted on `window.__mujuHardDiag`. The rest of the turn runs on AIEngineV2's per-action loop from the same allowance. |
| Phasing | hard | `?phasingAi=1` plus `?hardAi=0` | AIEngineV2 hard preset under Phasing | 10/30/60 s | Per-action loop. |

- **Opt-in recap:** the Phasing preview is `?phasingAi=1`, which is sticky; `?phasingAi=0` clears it. The Hard opt-in (`?hardAi=1` or `muju.hardAi='1'`) is redundant while `hardEnabled` is true. Only the opt-out `?hardAi=0` matters.
- **Online and analysis:** online rooms and the analysis board never construct an engine.
- **Engine seat:** `tools/engine-seat` is Phasing-only and refuses every room unless its config says `phasingHardReadiness: "M7-passed"` (`contract.ts:58-64`). It has no v2 fallback.

## 3. Deployed versus master

| Surface | What it serves | How it updates |
|---|---|---|
| Render (`deevgames-muju.onrender.com`) | HEAD. Its bundle contains `muju.phasingAi`, the preview badge, "Report this position" and compactReport's `(partial)` string from a02bbb7. Its engine chunk contains "the replica is Phasing-only". | Builds the Dockerfile from master with no test gate. |
| Cloudflare Pages (`deevgames.pages.dev/muju/`) | The 2026-09-18 Standard Hard release. It has `muju.hardAi` and `hardMs` but no `phasingAi`, no "Thinking time", and no Phasing-only string in the engine chunk. | Manual publish only. The workflow's Deploy step is skipped even on green runs because no `CLOUDFLARE_API_TOKEN` is set (`gh run view 35447835829`). |

Consequences for players:

- On Render, Standard Hard is the degraded fallback row. This is a regression that contradicts `RELEASE-2026-09-18.md`. Commit 425efa4's message does admit it: "Known and unchanged: under Standard the Hard seat falls back to the legacy engine every turn."
- On Pages, Standard Hard is still the measured +237 Elo engine with a single 8 s budget.

CI on master is red (run 35475103182). Four lab instrument tests fail, one of them with `spawnSync rg ENOENT`. Nothing covers the Standard Hard regression:

- `e2e/hard-ai.spec.ts` asserts `packError == 0` on Standard games and has been stale since d764dd7, so it would likely fail at HEAD.
- `playwright.online.config.ts` excludes that spec, so CI never runs it.

## 4. Where the Hard conversion left off (routing view)

The preregistration (`docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md:92-98`) stages the unlock:

| Evidence | Unlocks |
|---|---|
| Gate 1 plus e2e | Phasing vs-AI opens with Hard routed to aiv2-hard (`hardEnabled=false`). |
| Gate 0 | `engine:'hard'` for `?hardAi=1` only. |
| Gates 0, 2 and 3 | `hardEnabled=true`. |

None of these has passed:

- **Gate 1:** "remains NOT PASSED". The latest pilot is ineligible because the adapter starved follow-up searches to 1 work unit in 24% of Hard turns. Amendment A5 changes the funding definition.
- **Suites:** the first v2 suite measurement (00dfc8f) is valid but fails its floors: invariants 8/15 (floor 14), economy 19/20 (floor 20), summon-disruption 12/14 (floor 13). Five of the seven invariant misses are exact indifference, because the bootstrap weights have 5 nonzero features out of 62.

The preview (425efa4) sidesteps the gates as a personal opt-in. Plumbing is clean: every report shows `requests == hardTurns == plansReplayed` with zero fallbacks. Play quality is not:

- Black's first turn shuffles a Fire and retreats to its home corner.
- A Lightning dives in to disrupt a 3-crystal summon and is left hanging.
- As White, a lone Fire is sent across the board and left en prise.

The owner's opening-book request is unimplemented, and `EMPTY_BOOK` is the default.

## 5. If Standard were deleted tomorrow

With the guards untouched, there would be no local AI at all. ModeSelect would have nothing to offer in AI modes, and the worker and GameScreen refuse Phasing without the opt-in.

With the guards opened and current routing, Hard would be the Phasing HardEngine with accounting-bootstrap weights (material, bank, economy delta, pending value), no book, and the DESKTOP shape on phones, given 7.5 to 45 s per turn. It would make legal, tactically competent moves: tactics 61/63, home-mate 28/28. But it is positionally indifferent and misprices hanging material and disruption.

Whether it beats aiv2-hard under Phasing is unknown; no Gate 2 row has ever run. Easy and Medium would be the Phasing V2 port, which has not passed Gate 1 either.

## 6. Smallest wiring change for "new Hard engine is default Hard under Phasing, AIEngineV2 as fallback"

The fallback half already exists and needs no change:

- `hardEnabled=true` routes Hard to HardEngine.
- All six failure kinds drop to the v2 per-action loop within the same allowance.
- The preview marker is forwarded on the fallback request.

Only the Phasing guards block it, and all three read one function. The change is:

1. `src/ai/phasingPreview.ts`: add a release constant in the style of `hardEnabled`, so that `on = phasingAiEnabled || stored`. Keep `?phasingAi=0` as the escape hatch. That single change opens `handler.ts:113` (via the marker), ModeSelect's `canChooseRuleset`, and GameScreen's `aiSeatsAllowed`.
2. `src/components/ModeSelect.tsx:46`: default `ruleset` to `'phasing'`. If Standard is retired, remove `RulesetSelect` and fix `chosenRules` at line 109. Drop the badge and the "AI plays Standard rules" copy (`ModeSelect.tsx:282`, `RulesetSelect.tsx:18-25`). Drop the preview note and button gating in GameScreen.
3. Invert the tests that pin "closed without opt-in": `tests/ai/phasing-preview*.test.ts`, `tests/components/phasing-preview-ui.test.tsx`, and the first test in `e2e/phasing-ai.spec.ts`. Re-point `e2e/hard-ai.spec.ts` at `createInitialGameState(undefined, 4, 0, 'phasing')`.
4. Optional one-liners:
   - Gate `useHard` on `state.ruleset === 'phasing'`. This fixes Standard Hard immediately if Standard lingers at all.
   - Exempt the Hard route from the 25% reserve in `turnFunding.ts`, since HardEngine plans the full turn in one request.

If the owner prefers the preregistered first step, the same guard opening combined with `hardEnabled = false` (a one-word edit at `config.ts:47`) gives Hard as aiv2-hard by default, with HardEngine reachable through `?hardAi=1`.

Either way this is a `rules`/`ai`/`release` closure in the content DAG. `docs/CONTENT_DAG.md:139-141` requires recording which rules revision every save, room and strength record belongs to. Standard saves (`elemental-tactics-save`) must be refused or archived, never reinterpreted.

## 7. Pragmatic path from here (from this domain)

1. **Stop the silent regression.** Put the ruleset term in `useHard`, or retire Standard in one step.
2. **Open the guards for Phasing with the fallback intact.** Decide between HardEngine and aiv2-hard as default Hard with one cheap head-to-head row, not the full gate apparatus.
3. **Spend engine effort on evaluation.** Give weight to the features the owner's three reports implicate (hanging pieces, space, discounting disruption value), and add a small White opening book. Skip further instrument work.
4. **Make CI green and the two deploy surfaces agree.**