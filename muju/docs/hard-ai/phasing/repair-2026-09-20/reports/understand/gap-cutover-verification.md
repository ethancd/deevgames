HEADLINE: Flipping defaults to Phasing and opening the three AI guards is type-clean and the browser vs-AI flow is sane on both engine routes at the 10 s quick pace (no errors, no fallbacks, turns 4-10 s), but it is NOT test-clean: 49 vitest files / 245 tests, 7 of 20 AI e2e tests and 33 of 72 CI-gating online e2e tests fail, all from Standard expectations rather than product defects. Leaving board.ts:204 alone (src/ and server/ never rely on it) cuts the vitest damage to 14 files / 64 tests. Separately, HEAD is already broken in two ways nobody had measured: CI is red at HEAD (4 env-only test failures, so Pages has not auto-deployed for 71 commits), and the shipped Standard + Hard default never plays a HardEngine plan (packError fallback to v2 every turn) because the engine went Phasing-only while hardEnabled stayed true.

## Remaining work
- S - Turn CI green at HEAD so Pages can deploy again: set fetch-depth: 0 on actions/checkout in .github/workflows/deploy.yml (gate1.ts:105 and the suites contract test run `git show <old commit>:path`) and either install ripgrep on the runner or stop tests/lab/gate1-shard.test.ts depending on an `rg` binary. Blocked by nothing; 71 commits are waiting behind it.
- S - Fix the live routing bug independent of any cutover: Standard + Hard sends engine:'hard' to a Phasing-only engine and falls back every turn. Either set hardEnabled=false now (config.ts:47) or make useAI request the hard engine only when state.ruleset === 'phasing'. Blocked by nothing; matters most for Render, which deploys master with no tests.
- S - Re-point e2e/hard-ai.spec.ts at explicit Phasing states and fix the ?hardMs assertion (expect <= 1200 and the reserve-adjusted first request, not === 1200); port ai-worker.spec.ts:83-91 (Standard handoff assumption) and ai-timer.spec.ts's 'End turn →' helper. Then add ai-worker, hard-ai, phasing-ai and ai-timer to a CI Playwright config; today no CI job runs any of them, yet the preregistration unlock row depends on ai-worker.spec.ts.
- M - Cutover variant B (recommended first step): flip UI + server/MCP defaults and open the three guards, leave board.ts:204 alone. Port 14 vitest files / 64 tests (9 server files / 48 tests that create rooms without a ruleset; 5 UI/guard files / 16 tests) and 33 online e2e tests (action-budget, analysis, crystal-handicap, replay, history, pass-play, upkeep, online, lobby, home-checkmate). Blocked only by the owner's decision on the preregistration unlock row (it names hardEnabled=false + Gate 1 evidence).
- S - Rewrite the guard tests whose whole purpose is asserting the guards are closed: tests/ai/phasing-preview.test.ts, tests/ai/phasing-preview-worker.test.ts, tests/components/phasing-preview-ui.test.tsx, e2e/phasing-ai.spec.ts:46, and tests/ai/hard-hook-fallback.test.ts (16/16 fail only because requests now carry the phasingPreview marker). Blocked by deciding whether the marker/guard is deleted or kept as a kill switch.
- L (or S via codemod) - Flipping board.ts:204 itself: 49 files / 245 tests. Cheapest honest route is a mechanical codemod adding an explicit 'standard' fourth argument to the 171 test + 27 e2e + 31 lab implicit call sites, which keeps historical expectations valid while the default changes; a true port of tests/game (13 files / 93 tests) to Phasing turn order is the L version. Blocked by the decision whether Standard is retired from the engine or only from the UI/server.
- S - Pin the local toolchain: add .nvmrc / engines (Node 24) or set NODE_OPTIONS=--no-webstorage in the test script, so `npm test` on Node >= 25 does not fail jsdom localStorage tests.
- S - Re-run the full vitest suite once on an idle machine (about 12-16 min wall) to confirm the six load/env-classified files (suites-phasing-veto, ladder-runner, gate1, negamax-sign, calibrate-cold, gate1-calibration) are green without contention; they passed on CI except where noted.

## Open questions
- Which commits are Render and Pages actually serving? Bundle hashes of both differ from a local HEAD build and from each other. Render's dashboard 'Last successfully deployed commit' answers it in a minute; if Render is at HEAD, production Hard on Standard is already the silent v2 fallback.
- Does 'only ruleset live' mean UI/server/MCP defaults only (variant B, board.ts:204 untouched) or retiring Standard from the engine and its tests? The blast radius differs by 3.5x (14 vs 49 vitest files).
- Why does the v2 'hard' preset search only ~3.0 s when handed 7.5 s at quick pace? engine-v2.ts:42 has mctsTimeLimit: 3000 and scaleConfigForBudget is meant to lift limits for whole-turn requests; the probe suggests it is not lifting this one under Phasing. If so, 'normal' (30 s) and 'deep' (60 s) buy nothing on the v2 route.
- Is HardEngine's behaviour against a passive opponent (30 crystals hoarded, no pending summons, no win in 5 turns, while v2-hard won on turn 5) representative? n=1 under heavy load; a 20-game scripted-passive-opponent check per engine would settle it in roughly 15 minutes.
- Should the three guards be deleted at cutover or kept as a kill switch (for example ?phasingAi=0 forcing pass-and-play only)? That decides whether the guard tests are deleted or inverted.
- What is the policy for saved Standard games and Standard online rooms after cutover? ModeSelect still resumes a Standard save as Standard (savedGame?.ruleset ?? 'standard'), and with hardEnabled=true those resumed games hit the pack-error fallback.

## Findings
- [verified-in-code-or-results] CI at HEAD (a02bbb7) is RED in the vitest step, so the Cloudflare Pages path has not deployed HEAD. 203 files ran: 200 passed, 3 failed (4 tests), all environment-only: gate1-shard ('spawnSync rg ENOENT'), gate1 x2 ('git show a0551c8:...PHASING-PREREGISTRATION' fails on the fetch-depth:1 checkout), suites-phasing-contract (git binding). Online e2e, smoke and Deploy steps were skipped. Last green deploy run was d764dd7 (2026-09-19T14:08Z); 71 commits on master since. (gh run view 35475103182 (step 'Verify Muju rules, multiplayer and MCP' X); gh run list --workflow deploy.yml; git log --oneline d764dd7..HEAD | wc -l = 71; cleaned log in scratchpad/out/ci-head.clean.log lines 963-1013)
- [verified-in-code-or-results] The task premise 'Render deploys master with no test gate' is correct for Render but not for Pages: Render builds muju/Dockerfile (npm run build && npm run server:types, no tests); Pages is gated by npm test + test:online:e2e. tsc (app and server) is clean on the flipped tree, so Render's only gate would pass a cutover that breaks ~300 tests. (muju/Dockerfile:6; muju/ONLINE.md:64-72; .github/workflows/deploy.yml 'Verify Muju rules' and 'Check Muju online' steps; scratch run: npx tsc --noEmit -p tsconfig.json and -p server/tsconfig.json both silent on the patched clone)
- [verified-in-code-or-results] At HEAD the shipped default (Standard, vs AI, difficulty Hard, no flags) never plays a HardEngine plan: every turn is a pack-error fallback to the v2 per-action loop. Probe: packError 1, plansReplayed 0, fallbacks 1, lastFallback 'packError', budgetExhausted 1, AI turn 13.0 s wall at the 10 s quick pace, while the console claims 'runs the real HardEngine'. Cause: HardEngine became Phasing-only at 142f090 (2026-09-19 01:02) while hardEnabled stayed true. (src/ai/hard/core/state.ts:616; src/ai/hard/config.ts:47 (hardEnabled: boolean = true); src/ai/hard/engine.ts:530; scratch probe output in scratchpad/out/pw-base-stddiag.log)
- [verified-in-code-or-results] e2e/hard-ai.spec.ts is stale and fails 2 of 6 at HEAD (line 198 plansReplayed > 0 got 0; line 227 invalidSuffix expected 1 got 0), exactly because of the pack-error fallback above. It was last edited at d764dd7 (2026-09-18 23:01), two hours before the engine went Phasing-only, and no CI config runs it: playwright.online.config.ts testMatch omits ai-worker, hard-ai, phasing-ai and ai-timer. (scratchpad/out/pw-base-specs.log (18 passed, 2 failed of 20); git log -- muju/e2e/hard-ai.spec.ts; muju/playwright.online.config.ts testMatch)
- [verified-in-code-or-results] At HEAD the other AI browser specs pass on system Chrome against a vite preview of the HEAD build: ai-worker.spec.ts 7/7 (on Standard states), phasing-ai.spec.ts 3/3 (including 'Hard plays a complete Phasing turn with no engine failure counted' via ?phasingAi=1), ai-timer.spec.ts 4/4. (scratchpad/out/pw-base-specs.log)
- [verified-in-code-or-results] The CI-gating online e2e suite is effectively green at HEAD: 69 of 72 pass; the 3 failures are artifacts of my scratch config moving the server off port 8928, which online.spec.ts:94,222 and room-lifecycle.spec.ts:54 hardcode (ECONNREFUSED 127.0.0.1:8928). (scratchpad/out/pw-online-base.log lines 79-128; e2e/online.spec.ts:94,222; e2e/room-lifecycle.spec.ts:54)
- [verified-in-code-or-results] Full flip (board.ts:204 default to 'phasing'; ModeSelect x2, AnalysisScreen, online/client.ts, OnlineLobby, server/schema.ts, server/mcp.ts, server/observation.ts x2 defaults; readPhasingAiPreview() forced true to open all three guards; hardEnabled left true) gives vitest 203 files / 2867 tests: 55 files / 254 tests fail. Six of those files fail for load or environment reasons on HEAD too (suites-phasing-veto, ladder-runner, gate1, negamax-sign timeouts; gate1-shard rg ENOENT; calibrate-cold). Flip-induced: 49 files / 245 tests, and all 49 pass on unmodified HEAD (targeted rerun: 50 of 52 pass, the 2 failing being gate1-shard and calibrate-cold). (scratchpad/out/flip-{1..6}of6.json, flip-induced.json, rebase.log; patch saved as scratchpad/out/variantB-ui-server-guards.patch plus board-flip.patch)
- [verified-in-code-or-results] Breakdown of the 49 flip-induced files: tests/game 13 files / 93 tests; tests/server 11 / 59; tests/ai 11 / 49 (hard-hook-fallback 16/16, worker-turn 9/16, turn-execution 9/10, phasing-preview 8/13); tests/hooks 9 / 32; tests/ai/hard 2 / 4 (perft Standard triple, action ids); tests/lab 2 / 4; tests/components 1 / 4. Every failure message I read is a Standard expectation or a guard-closed assertion, not an engine defect. (scratchpad/out/flip-induced.json; node summarize.mjs flip output)
- [verified-in-code-or-results] board.ts:204's implicit 'standard' default is used ONLY by tests, e2e and lab: src/ has 0 implicit call sites and server/ has 0. Implicit call sites: tests 171 calls in 56 files, e2e 27 in 11 files, lab 31 in 21 files (explicit 'phasing': 69 / 1 / 8). Of the 56 implicit test files, 38 fail under the flip and 18 still pass. (scratchpad/out/count-calls.mjs output and implicit-files.json; src/game/board.ts:204)
- [verified-in-code-or-results] Variant B (keep board.ts:204 as is; flip only UI and server/MCP defaults and open the guards) reduces the vitest damage to 14 files / 64 tests when the 49 affected files are re-run: 9 server files / 48 tests (mcp 11, rooms 12, staging 9, clock-pressure 7, history 4, clocks 2, lobby 1, phasing 1, crystal-handicap 1) plus 5 UI/guard files / 16 tests (phasing-preview 6, phasing-preview-ui 4, hooks/crystal-handicap 4, game-setup 1, phasing-ai-funding 1). Caveat: only those 49 files were re-run under B, not the whole suite. (scratchpad/out/variantB.log (Test Files 14 failed | 35 passed (49); Tests 64 failed | 505 passed (569)))
- [verified-in-code-or-results] AI e2e on the flipped build: 13 pass / 7 fail of 20. hard-ai.spec.ts is automatically re-pointed (it uses the implicit default) and its two HEAD failures now PASS (5/6); the remaining failure is ?hardMs expecting decisionMs === 1200 while Phasing reserves a floor for later segments. ai-worker.spec.ts passes 6/7 on Phasing states unchanged; the one failure (line 91) is test setup assuming END_ACTION_PHASE hands the turn to black. ai-timer.spec.ts fails 4/4 because its helper clicks Standard's 'End turn →' button. phasing-ai.spec.ts:46 fails by design (asserts the guard is closed). (scratchpad/out/pw-flip-specs.log lines 26-164)
- [verified-in-code-or-results] The CI-gating online e2e suite under flipped UI/server defaults: 36 pass / 36 fail, of which 3 are my port artifact, so 33 of 72 are flip-induced (action-budget 3, analysis ~10, crystal-handicap 6, replay 5, history 2, pass-play 2, upkeep 2, online 2, lobby 1, home-checkmate 1). This is the suite that gates the Pages deploy. (scratchpad/out/pw-online-flip.log)
- [verified-in-code-or-results] Browser sanity at quick pace (10 s) on the flipped build with no URL flags: Phasing is default-checked; HardEngine route played 5 AI turns at 8.9 / 9.9 / 4.4 / 5.4 / 4.3 s wall, each request funded 7500 ms (10000 minus 2 x 1250 reserve), searches 1.9-7.5 s, hardTurns 5, plansReplayed 5, every failure counter 0, no page errors or alerts. Watch AI Hard v Hard: 11 hard turns in 90 s, 0 fallbacks. HEAD with ?phasingAi=1 gives the same numbers. (scratchpad/out/pw-flip-probe.log and pw-base-probe.log PROBE_RESULT lines; src/ai/turnFunding.ts:53 (PREPARE_RESERVE_DIVISOR = 8))
- [verified-in-code-or-results] With ?hardAi=0 (the same route hardEnabled=false takes: engine field absent, AIEngineV2 'hard' preset) the Phasing browser path is also sane at quick pace: 4 AI turns at 6.4 / 8.9 / 8.9 / 9.9 s wall, 7 v2 whole-turn requests, 0 errors, 0 alerts, 0 per-action fallbacks. Each v2 search ran ~3.0 s (3001-3024 ms) despite 7.5 s being offered, matching the preset's mctsTimeLimit: 3000. The game ended on v2's 5th turn with a home-invasion win over my passive (pass-every-turn) human; my first probe misread that victory as a hang until the state dump showed phase 'victory', winner 'black'. (scratchpad/out/pw-flip-probe.log; scratchpad/out/hang-dump-base.json; src/ai/engine-v2.ts:42)
- [verified-in-code-or-results] Anecdote, not a strength measurement (n=1 game per route, passive opponent, machine load 10-27): after 5 turns HardEngine had 6 units, 0 pending summons and 30 crystals unspent and had not won; v2-hard had spent to 0 crystals, promoted to plant_3, queued 3 summons and won by home invasion on turn 5. (PROBE_RESULT blackResources/blackPending/blackUnits fields in scratchpad/out/pw-flip-probe.log)
- [verified-in-code-or-results] Local-environment trap: this machine runs Node v26.5.1 (CI pins 24). Node 26's built-in web-storage global shadows jsdom's localStorage, so plain `npm test` fails tests/hooks/crystal-handicap.test.tsx 7/7 at HEAD ('Cannot read properties of undefined (reading setItem)'). NODE_OPTIONS=--no-webstorage restores CI behaviour; all my numbers use it. There is no .nvmrc or engines field. (scratchpad/out/base-1.node26-nowebstorage-flag-missing.log lines 64-193; node --version; .github/workflows/deploy.yml node-version: '24')
- [verified-in-code-or-results] `npm test` rewrites a tracked file via pretest (asc -> src/ai/wasm/tactics.wasm), but the committed binary is fresh: a rebuild into scratch is byte-identical (sha256 6d3cf333...573c), so running vitest without pretest is equivalent. (muju/package.json pretest; muju/asconfig.json; shasum of scratch rebuild vs src/ai/wasm/tactics.wasm)
- [verified-in-code-or-results] The 12-file PHASING_QUARANTINE is as described (215 test files on disk, 203 run by default, 12 excluded unless MUJU_RUN_QUARANTINE=1). Some lab tests contend on a machine-global lock (~/.local/state/muju-heavy, 2 slots); another reader's ladder run held it and caused ladder-runner timeouts until I isolated with MUJU_HEAVY_DIR. (muju/vitest.config.ts:26-88; lab/hard-ai/ladder/heavy.ts:91-95; scratchpad/out/base-1of6.log heavy-queue lines)
- [inferred] Neither live host appears to serve the HEAD bundle: a local HEAD build emits index-D0_s_yQZ.js, Render serves index-Brouqdz7.js and Pages serves index-DvxegQEU.js. Hash differences across build environments are possible, so this is suggestive only. (curl of https://deevgames-muju.onrender.com/muju/ and https://deevgames.pages.dev/muju/ vs scratch dist/index.html)

## Report
# Gap-fill: what breaks if defaults flip to Phasing and the three AI guards open

Everything below was measured today (2026-09-20) on commit a02bbb7. The live checkout was never modified: I worked in two `git clone --local` copies under the scratchpad (one unmodified, one patched), symlinked `node_modules`, bound preview servers to 127.0.0.1 only, and removed the clones afterwards. Logs, JSON reports, the experimental patch and the probe specs are in `/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/out/`.

## Short answer

- **Type-clean, not test-clean.** `tsc` for app and server passes on the flipped tree. Vitest does not: 49 files / 245 tests fail because of the flip. AI e2e: 7 of 20 fail. CI-gating online e2e: 33 of 72 fail.
- **Every failure I read is a test expectation, not a product defect.** Standard turn order, Standard button labels, default-ruleset assertions, or tests whose purpose is to assert the guards are closed.
- **The browser vs-AI flow is sane on both routes at quick pace.** No page errors, no alerts, no fallbacks, AI turns 4-10 s.
- **HEAD is already broken in two ways nobody had measured** (next section).

## Two pre-existing problems at HEAD

**1. CI is red, so Pages is not deploying.** GitHub Actions run 35475103182 on a02bbb7 failed in the vitest step. 203 files ran, 200 passed, 3 failed (4 tests), all environment-only:

| File | Cause |
|---|---|
| `tests/lab/gate1-shard.test.ts` | `spawnSync rg ENOENT` (no ripgrep on the runner) |
| `tests/lab/gate1.test.ts` (2 tests) | `git show a0551c8:...` fails on the `fetch-depth: 1` checkout (`lab/ai/gate1.ts:105`) |
| `tests/lab/suites-phasing-contract.test.ts` | contract bound to git history |

Online e2e, smoke and Deploy were skipped. The last green deploy run was d764dd7 (2026-09-19T14:08Z); 71 commits on master since. The premise "Render deploys master with no test gate" is right for Render (`Dockerfile:6` runs only `npm run build && npm run server:types`), but Pages is gated by `npm test` + `test:online:e2e`.

**2. Shipped Standard + Hard never plays a HardEngine plan.** `hardEnabled` is `true` (`src/ai/hard/config.ts:47`), but the engine became Phasing-only at 142f090 (`core/state.ts:616`). A probe of the default flow (Standard, vs AI, Hard, no flags) returned:

`packError: 1, plansReplayed: 0, fallbacks: 1, lastFallback: 'packError', budgetExhausted: 1`

The AI turn took 13.0 s at the 10 s pace, while the console still says "runs the real HardEngine". This is why `e2e/hard-ai.spec.ts` fails 2 of 6 at HEAD (lines 198 and 227). That spec was last edited two hours before the engine change, and no CI config runs it.

## HEAD baseline

| Check | Result |
|---|---|
| Vitest (CI, Node 24) | 200 / 203 files pass; 3 env failures above |
| Vitest (local, shards 1-2 + targeted 52-file rerun) | all pass except load/env: gate1-calibration (2485 < 3000 work units under load), ladder-runner x2 (machine-wide heavy-queue held by another reader), suites-phasing-veto x2 (240 s / 300 s timeouts), calibrate-cold x2, gate1-shard (rg) |
| AI e2e (4 specs, 20 tests) | 18 pass; 2 fail, both hard-ai.spec.ts, cause above. ai-worker 7/7, phasing-ai 3/3, ai-timer 4/4 |
| Online e2e (72 tests) | 69 pass; 3 fail only because my scratch config moved off port 8928, which `online.spec.ts:94,222` and `room-lifecycle.spec.ts:54` hardcode |

Local trap: this machine has Node 26.5.1. Its built-in web-storage global shadows jsdom's `localStorage`, so plain `npm test` fails `tests/hooks/crystal-handicap.test.tsx` 7/7. `NODE_OPTIONS=--no-webstorage` restores CI behaviour; all numbers here use it. The committed `tactics.wasm` is byte-identical to a fresh rebuild, so skipping `pretest` changes nothing.

## The flip experiment

Patch (scratch only): `board.ts:204` default to `'phasing'`; defaults in `ModeSelect.tsx` (two sites), `AnalysisScreen.tsx`, `online/client.ts`, `OnlineLobby.tsx`, `server/schema.ts`, `server/mcp.ts`, `server/observation.ts` (two sites); `readPhasingAiPreview()` forced to `true`, which opens all three guards at once. `hardEnabled` left `true`.

**Vitest, full suite:** 203 files / 2867 tests, 55 files / 254 tests fail. Six files fail for load or environment reasons on HEAD too. **Flip-induced: 49 files / 245 tests**, and all 49 pass on unmodified HEAD.

| Area | Files | Tests |
|---|---|---|
| tests/game | 13 | 93 |
| tests/server | 11 | 59 |
| tests/ai | 11 | 49 |
| tests/hooks | 9 | 32 |
| tests/ai/hard | 2 | 4 |
| tests/lab | 2 | 4 |
| tests/components | 1 | 4 |

**The key structural fact:** `src/` and `server/` have zero implicit callers of `createInitialGameState`. The default at `board.ts:204` is used only by tests (171 calls / 56 files), e2e (27 / 11) and lab (31 / 21). Of the 56 implicit test files, 38 fail under the flip and 18 still pass.

**Variant B** (leave `board.ts:204` alone; flip UI + server defaults and open guards): re-running the 49 files gives **14 files / 64 tests**.
- 9 server files / 48 tests: rooms created without a ruleset (mcp 11, rooms 12, staging 9, clock-pressure 7, history 4, clocks 2, lobby 1, phasing 1, crystal-handicap 1).
- 5 UI/guard files / 16 tests: phasing-preview 6, phasing-preview-ui 4, hooks/crystal-handicap 4, game-setup 1, phasing-ai-funding 1.
- Caveat: only those 49 files were re-run under B.

**AI e2e on the flipped build:** 13 pass / 7 fail.
- `hard-ai.spec.ts` re-points itself (it uses the implicit default): its two HEAD failures now pass, 5/6. The remaining failure expects `?hardMs=1200` to produce `decisionMs === 1200`; Phasing reserves 2 x budget/8 for later segments (`turnFunding.ts:53`).
- `ai-worker.spec.ts` passes 6/7 on Phasing states unchanged. Line 91 assumes `END_ACTION_PHASE` hands the turn to black. This is the spec the preregistration's unlock row names.
- `ai-timer.spec.ts` fails 4/4: its helper clicks Standard's `End turn →`.
- `phasing-ai.spec.ts:46` fails by design (asserts the guard is closed).

**Online e2e under flipped UI/server defaults:** 36 pass / 36 fail, 3 being my port artifact, so **33 of 72** are flip-induced. This suite gates the Pages deploy.

## Browser sanity at the 10 s quick pace

Flipped build, no URL flags, human passes every turn. Phasing is default-checked.

| Route | AI turn wall (s) | Funding | Search (s) | Failures |
|---|---|---|---|---|
| HardEngine (default) | 8.9, 9.9, 4.4, 5.4, 4.3 | 7500 ms per request | 1.9-7.5 | hardTurns 5, plansReplayed 5, all counters 0 |
| `?hardAi=0` (= `hardEnabled=false`, v2 hard preset) | 6.4, 8.9, 8.9, 9.9 | 7500 / 7000 / 4499 ms | ~3.0 each | 0 errors, 0 alerts, 0 per-action fallbacks |
| Watch AI, Hard v Hard | 11 turns in 90 s | | | 0 fallbacks |

HEAD with `?phasingAi=1` reproduces the same numbers, which confirms the opt-in exercises the same code the cutover would.

Two observations from those runs, neither a strength measurement (n=1, passive opponent, load 10-27):
- v2 searches ~3.0 s regardless of the 7.5 s offered, matching `mctsTimeLimit: 3000` (`engine-v2.ts:42`). If `scaleConfigForBudget` is not lifting it, the 30 s and 60 s paces buy nothing on that route.
- After 5 turns HardEngine held 30 unspent crystals with nothing queued and had not won; v2-hard spent to zero, promoted to plant_3 and won by home invasion on turn 5. My first probe misread that win as a hang; the state dump (`phase: 'victory', winner: 'black'`) corrected it.

## What this means for the cheap cutover

The cutover is cheap in source (about 11 lines) and would sail through Render's gate, which is the risk. The honest cost is test porting: variant B is 64 vitest tests + 33 online e2e + about 7 AI e2e, all mechanical. Flipping the engine default on top adds 181 more vitest tests, most cheaply handled by a codemod that makes the historical Standard call sites explicit.

Order that keeps both release paths safe:
1. Green CI (fetch-depth and ripgrep).
2. Fix the Standard+Hard routing so master is safe to deploy.
3. Put the AI e2e specs in CI.
4. Variant B.

## Limits

- Machine load was 10-27 on 8 cores from other readers throughout; timing-sensitive tests were classified by comparing against HEAD, not assumed.
- Only half the suite was re-run locally on HEAD; the CI log covers the rest.
- Browser probes are single games against a passive human.
- I did not run `e2e/mobile`, `visuals` or the other specs in the default Playwright config, nor the lab scripts (21 implicit-caller files); the lab scripts were counted, not executed.