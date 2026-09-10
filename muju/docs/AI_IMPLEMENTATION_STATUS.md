# Current branch status — v2.1, 2026-09-09

The combined simplification branch uses the **real public GameState** in MCTS
and worker protocol **2**. Observation/event masking, belief particles, queue
reconciliation and re-determinization have been deleted. Both banks are public.
Queue value is removed; evaluation uses projected end-of-turn income and
highest on-board tier per element. Beam states settle income through the
canonical transition. Bounded Place candidates include purchases by element,
miners on ore, defensive Water/Metal purchases, anchor promotions and multiple
Hi purchased beside a target then attacking in the same turn.

The rebuilt kernel uses **ABI 4**. Tactical proofs retain current-turn movement,
attacks/Cleave and home-blocked promotion subsets. **General placement and
purchases remain outside the proof:** such queries return unknown. When an
invader occupies home, every spawn rectangle is blocked, so the rescue proof
can still enumerate legal promotion subsets without purchases. Income only
arrives after Act and cannot finance a promotion in the preceding Place phase.
This scope choice avoids claiming complete search over a potentially large
purchase space. JS validates successful witnesses; differential tests and
browser worker/fallback/rescue tests cover the retained scope.

Existing search budgets, seeded fixed-work accounting, cancellation, watchdog,
JS fallback and React acknowledgment behavior remain. No equal-budget win-rate
improvement or Medium income calibration is claimed; both are registered
future studies. The initial update validates operation, not strength. See the
[placement report](PLACEMENT_SIMPLIFICATION-2026-09-09.md) for evidence and limits.

## Historical implementation record

> **Historical baseline — superseded on the v2.1 feature branch (2026-09-09).**
> The well, depth, mine action, build queue/times, hidden economy and three-phase
> teaching below are historical. Current rules use passive 0/4/8/10 reserves
> (520 total), public tier-1 purchase and later-turn promotion. See [SPEC](../SPEC.md),
> [mining report](MINING_SIMPLIFICATION-2026-09-09.md) and
> [placement report](PLACEMENT_SIMPLIFICATION-2026-09-09.md). Old measurements
> remain labeled by their original versions; none establishes v2.1 balance.
> Production release status is tracked by the repository’s deployment workflow.

> v1.6 follow-up: [upkeep and inactivity draw](UPKEEP_DRAW-2026-09-08.md) supersede the no-upkeep game lengths, cap rates and carrying values below. Historical measurements are preserved.

> Catalogue/visual-rank numbers superseded by v1.5: [tier-3 cap report](TIER3_CAP-2026-09-08.md). Historical measurements below remain unchanged.

# Muju AI implementation — 2026-09-07

Implementation commit: `4917121cad982b023ee637a848d70a5632869474`. Branch: `codex/muju-wasm-ai`. Permanent worktree: `/Users/ashkie/src/deevgames-muju-ai`. Base: production `e70a0574c8246e06c7217bb2c0f157324e11c859`, fetched before creating the isolated worktree. No rules, map D layout, catalogue prices/stats, action limits, or victory timing were changed. The user subsequently requested production deployment. This implementation was fast-forwarded to production `master` at `ccdd9c59b79d5a6d49d0e1eccf6db5bebb26c74c` and published on 2026-09-07 at [deevgames.pages.dev/muju/](https://deevgames.pages.dev/muju/); immutable deployment: [221ebf01](https://221ebf01.deevgames.pages.dev).

The user's implementation request explicitly favored WASM and skipping JavaScript benchmarking. This changes the plan's ordering: a native tactical kernel ships with the worker, without a JavaScript profiling/optimization bake-off or a claimed WASM speedup ratio. The strategic planner remains TypeScript. This is a functioning hybrid AI, not a full rewrite of the game engine in WASM.

## Cleave follow-up (2026-09-07)

The subsequent v1.4 combat release adds kill-gated attacks capped by tier while
retaining the v1.3 catalogue. The kernel now uses **ABI 2**: each unit carries an
independent total attack count (including eliminated targets) and a last-kill flag;
the catalogue also carries tier. JS and WASM enforce the same chain eligibility,
and DFS restores count/flag as well as damage and occupancy when backtracking.
The measurements and result directories below describe the original AI release,
not a new balance calibration under Cleave. See `CLEAVE_RELEASE-2026-09-07.md`.

## Implemented

- **Worker boundary:** versioned game/request/revision/player identity, masked opponent state, own private state, seed and budget. The worker owns separate player contexts. Results are checked against the authoritative game. Restart, pause, mode changes, difficulty changes and unmount invalidate pending work. Termination interrupts even a native call. A watchdog exposes a recoverable Retry path; no worker failure becomes resignation or a hidden pass.
- **UI execution:** first-action/replan behavior is retained, with explicit React reducer acknowledgment after every dispatched action. Browser QA caught and fixed an intermediate version that stopped after the first attack because a zero-delay timer preceded React's commit.
- **WASM tactics:** AssemblyScript 0.28.9 is pinned in the existing npm lockfile. ABI 1 transfers a compact integer position and canonical catalogue/attack matrix once per search, returning a witness. The numerical DFS mutates/undoes preallocated state and uses indexed BFS. It includes exact multi-action movement, same-target attack limits, accumulated damage, coordinated attacks, clearing blockers, rotations, and legal promotion subsets.
- **Proof scope:** `proved`, `disproved`, or `unknown`. Disproof is exhaustive only for target removal during the current action turn, plus placement-phase promotions when an invader occupies home. Home blocks every spawn rectangle; mining cannot fund a promotion later in the same turn. Those omissions are therefore complete for this specific problem. General placement search returns unknown. A budget cutoff never becomes a proof. Successful witnesses are replayed through canonical `isLegalAction`/`applyAction` before use. Elimination and turn-start home resolution remain canonical JS operations.
- **Tactical play:** obvious elimination wins and proved home rescues take priority. Root candidates include multi-unit combination kills and direct raids. Both direct raids and beam lines ending on home receive a complete defender-response check, using the opponent's public stockpile upper bound for possible promotions. A reachable corner alone gets a modest prior, not a victory value. Unknown responses remain uncertain.
- **Planner:** preserve each beam prefix's simulated state and reuse it for score/tagging; extend action segments to the full remaining six-action budget; reserve output slots for defense, attacks, raids, mining, promotion and expansion. Root candidate construction leaves time/work for response checks and MCTS. Old zero-scored kill templates cannot disappear solely because their scores were never evaluated. Indexed cached BFS preserves canonical move ordering; its cache is weakly keyed by immutable board identity.
- **Search accounting/reproducibility:** seeded RNG is passed through sampling and the lab adapter; fixed-work mode has no wall-clock cutoff. `nodesSearched` now means completed MCTS iterations, including zero when a tactical override answers directly. Counters separate tactical DFS visits, generated beam candidates, beam/MCTS transitions, evaluation calls and crossed turn boundaries; they are not interchangeable work units. Search budgets cover root generation, native search, MCTS and sharpener checks. UCT root payoffs and acting-player priors are normalized to comparable scales; perspective regression tests remain in place.
- **Beliefs:** replace the historically broken indefinitely accumulating speculative queue with bounded public-conservation hypotheses. Keep an explicit saving sample; use only feasible current technology and affordable purchases. Stockpile plus hidden queue cost equals public gained minus manifested spending. Queue readiness respects the earliest possible turn start. The posterior is reused until relevant opponent observations change. Legacy placement reconciliation now consumes a previously paid hypothetical queue entry instead of charging twice.
- **Static hosting:** Vite emits content-hashed worker and WASM assets under `/muju/assets/`. `npm run build`, `npm test` and `npm run dev` compile the kernel automatically. The full-site verifier checks runtime asset references and the WASM magic bytes. Fetch/compile failure falls back to bounded JS tactics inside the worker and is visible to the player as a backup engine. No server, shared memory, COOP/COEP, or new hosting service is required.

## Difficulty and budget contract

| Preset | Decision ceiling | Whole-turn CPU allowance | Tactical DFS visit cap | Beam | MCTS ceiling |
|---|---:|---:|---:|---:|---:|
| Easy | 800 ms | 1,800 ms | 5,000 | 10 | 100 |
| Medium | 1,500 ms | 4,000 ms | 100,000 | 30 | 500 |
| Hard | 3,000 ms | 8,000 ms | 600,000 | 50 | 1,200 |

The turn allowance is shared across placement/action/queue decisions; animation waits are separate. Obvious wins can return immediately, and emergencies receive more of the remaining allowance. Ordinary search gets a phase/action-dependent share. The lab's `createEngineBot({difficulty, speed: 'ui'})` loads the same WASM kernel and uses these turn allocations; its historical default `fast` remains explicitly a screening override. Fixed-work screening is also labeled separately. These are explicit effort presets, **not a statistically calibrated difficulty ladder**.

## Validation and reproducible records

`lab/ai/fixtures.ts` contains 15 authored positions with their rotated/opposite-seat counterparts (30 cases). Nine per orientation are rescuable and six are not. Cases cover cheap/zero-attack invaders, two Fire II versus Metal IV, three-attacker rotation, promotion-dependent saving, insufficient/hidden budgets, unnecessary mining, blocked approaches, multi-action movement, existing damage, already-attacked targets, placed/promoted restrictions and ineligible defenders. Independent hand-authored witnesses and canonical-JS differential tests are included.

- `lab/results/ai-wasm-2026-09-07/final-tactics/`: 90 preset/case combinations; all 54 feasible rescues completed. Includes per-case work and time, source/catalogue/binary SHA-256, device, Node version, seed and cold instantiation.
- `final-production-puzzles/`: compare an independently archived `e70a057` engine with the candidate on all 18 feasible rescue cases using Medium and a 4-second turn allowance (50 ms late tolerance). The reference's unseeded RNG is acknowledged; this is an observed focused puzzle comparison, not a paired league or a throughput benchmark. Exact fixtures and per-case outcomes are retained.
- `final-screen/`: one frozen seed block, eight strategy opponents, both seats, 20-round cap, 1,200-work screening override. Natural wins and caps are separate. No material adjudication counts as a game win. This is a small diagnostic screen, not a strength certification.
- Earlier directories without `final-` are development snapshots, retained separately. Their metadata/results must not be conflated with the final runs.

The native binary is 7,645 bytes, 3,490 gzip bytes. The named developer device is an Apple M2 Max, macOS arm64, Node 24.11.1. Node cold instantiation is recorded separately from decision CPU time. Browser checks use isolated headless Chrome and a matching Playwright WebKit runtime; WebKit on a Mac is not a real iPhone/Safari device measurement.

Commands from `muju/`:

```sh
npm ci
npm test
npm run build
npm run balance:check
npm run balance:types
npx tsc -p lab/experiments/tsconfig-home.json --noEmit
npx tsc -p lab/ai/tsconfig.json --noEmit
npm run ai:tactics -- /tmp/muju-tactics-new-run
npm run ai:league -- /tmp/muju-league-new-run
# Archive e70a057's muju/src and package.json independently, supply its root:
node --import tsx lab/ai/compare-production.ts /tmp/reference/muju /tmp/comparison-new-run
MUJU_BASE_URL=http://127.0.0.1:PORT/muju/ npm run test:e2e
PLAYWRIGHT_BROWSER=webkit MUJU_BASE_URL=http://127.0.0.1:PORT/muju/ npm run test:e2e -- e2e/ai-worker.spec.ts
```

Choose a free loopback port after checking listeners. Serve a completed `bash build-all.sh` output from `_site`; the tests exercise the production `/muju/` base. `node tools/smoke-site.cjs BASE_URL` verifies Muju, FORGE and Oracle. The result runners refuse to overwrite an existing output directory. `balance:check` writes a runtime field in its historical result file; retain the committed historical artifact when only this nondeterministic timing changes.

## Completed acceptance checks

- 621 unit tests across 30 files passed. The strengthened information-equivalence test executes three completed MCTS iterations with a fixed seed; the final 10 worker/boundary tests also passed.
- Chrome 152: 24 browser tests passed; all five worker tests passed again after the final lifecycle checks. WebKit 26.6: all five worker tests passed, including native asset loading, two-attack rescue, victory termination, restart, pause/resume, mode switch and fallback.
- Full static build, runtime-asset verifier, catalogue solver check and TypeScript checks passed. Full-site smoke checks at 390px and 834px covered Muju's board/save flow, both FORGE art skins and gameplay, and Oracle combat/restart.
- Medium rescued 18/18 positions in the focused production comparison; the archived production engine rescued 12/18 within the same declared turn allowance.
- The final 16-game screening run produced 12 natural candidate wins (11 home occupation, one elimination), four caps and zero illegal actions. Balanced, Tier1Spam and AntiRush account for the caps. There was one seed block, so no confidence interval or general win-rate claim is attached.
- `verification.json` records the code commit, browser versions/results and single menu-response samples. QA pictures show the native combination resolving and the menu open during the active Hard worker. Compatibility/lifecycle-only finishing changes were checked after the normal-game strength snapshot.

## Remaining research and limits

This implementation does not claim completion of every research gate in the original multi-stage plan. The explicitly skipped JS benchmark stage, real iPhone/Safari latency calibration, large held-out paired leagues, difficulty-ladder confidence intervals and feature ablations remain unmeasured. The belief posterior is a bounded conservative approximation, not a validated history-complete economic particle filter. Strategic intent is a reconsidered prior, not a persistent opponent model. The native exhaustive proof applies only to the declared tactical scope, not arbitrary game-tree victory. These limits do not change the rules or permit reading hidden state.

Next research step: run the UI-budget adapter against production and diverse opponents on a held-out seed block, inspect capped Balanced/AntiRush matchups, then measure a real mobile device before tuning the effort ladder. Production acceptance passed after publication: all five live worker tests, all-three-game smoke checks at 390px and 834px, and byte-for-byte verification of 14 pages/code assets on both the production alias and immutable deployment. WASM MIME and magic bytes were verified. GitHub build/gameplay checks passed; publishing used the existing local Wrangler credential because the workflow upload credential remains unset. The deployment receipt and test evidence are in `lab/results/ai-wasm-2026-09-07/production/`.

Toolchain reference: [AssemblyScript compiler](https://www.assemblyscript.org/compiler.html), [runtime](https://www.assemblyscript.org/runtime.html), and [Vite workers/assets](https://vite.dev/guide/features.html#web-workers). The npm toolchain was chosen to fit this TypeScript repository without adding Rust/toolchain provisioning to CI.
