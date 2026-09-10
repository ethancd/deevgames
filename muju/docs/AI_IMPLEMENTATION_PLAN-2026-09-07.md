> **Historical baseline — superseded on the v2.1 feature branch (2026-09-09).**
> The well, depth, mine action, build queue/times, hidden economy and three-phase
> teaching below are historical. Current rules use passive 0/4/8/10 reserves
> (520 total), public tier-1 purchase and later-turn promotion. See [SPEC](../SPEC.md),
> [mining report](MINING_SIMPLIFICATION-2026-09-09.md) and
> [placement report](PLACEMENT_SIMPLIFICATION-2026-09-09.md). Old measurements
> remain labeled by their original versions; none establishes v2.1 balance.
> Production release status is tracked by the repository’s deployment workflow.

# Muju AI: stronger play and faster local execution

Status: implementation plan only. Written 2026-09-07 for execution in a new session.

## Recommendation and scope

Keep Muju entirely client-side on the existing static Cloudflare Pages site. First measure the engine, move search to a dedicated browser Web Worker, remove repeated work, and improve the plans it considers. Evaluate single-threaded WebAssembly only after those steps reveal a remaining computational bottleneck. A useful outcome may be an optimized TypeScript worker with no WASM at all.

The objective is an understandable Easy opponent, a coherent Medium opponent, and a tactically reliable, strategically adaptable Hard opponent. Preserve the diversity and character of the game. Freeze the 10×10 board, map D, v1.3 unit catalogue, six shared actions, hidden-information rules, and current home-or-elimination victory rule. This is an AI project, not permission to change game balance to help the AI.

No AI server, API calls during play, server-side search, database, new hosting provider, online training, or shared-memory threading is required. Offline analysis and compilation happen on developer machines/CI. There is no current promise of offline page loading; retaining static hosting does not itself add offline support.

## Start here in the next session

Read this document, repository `CLAUDE.md` and `.claude/napkin.md`, then `muju/SPEC.md`. Inspect status before touching files. Do not work in a peer's dirty checkout.

Known local worktree containing this plan: `/Users/ashkie/src/deevgames-home-victory`, branch `codex/muju-home-victory`. Production source at planning time: `e70a0574c8246e06c7217bb2c0f157324e11c859`; deployment receipt is under `muju/lab/results/home-victory-2026-09-07/production/`. Fetch origin and inspect current `origin/master` before choosing the implementation base. Create an isolated `codex/` worktree from the latest compatible production source; read this plan from the known worktree if it is not yet on master. Never overwrite newer Muju work to recreate this snapshot.

`muju/AI_ENGINE_PLAN.md` is historical: its opening assessment describes the predecessor engine. This document supersedes its assessment and execution order. Some of its intended belief-model behavior is not implemented; do not treat its checklists as evidence of current functionality.

Suggested opening prompt for a new session:

> Read `/Users/ashkie/src/deevgames-home-victory/muju/docs/AI_IMPLEMENTATION_PLAN-2026-09-07.md`. Implement it in an isolated worktree, starting with measurement and the worker. Preserve current Muju rules, map and units. Complete and record each stage's acceptance checks. Make the WASM decision from measured end-to-end results, and keep a session handoff with completed work and the exact next step.

## Verified starting architecture

| Area | Existing implementation | Implication |
|---|---|---|
| Entry | `src/ai/engine.ts` wraps `AIEngineV2`; `src/hooks/useAI.ts` takes the first returned action and searches again | This is the production execution path to preserve in tests |
| Difficulty | Easy: 100 iterations, 800 ms search target, beam 10, 10 particles, tactical depth 0; Medium: 500/1500/30/30/1; Hard: 1200/3000/50/50/2 | Same evaluation and strategy vocabulary, different effort; these are not measured turn durations |
| Candidate construction | `planner/beam.ts`: normally at most four action entries per segment, one entry in other phases, final output capped at 20 plans | Search can chain segments, but a useful five/six-action setup may be pruned early; action entries and action costs are not identical |
| Tactical templates | `planner/templates.ts`: immediate kill and move-then-kill | No explicit full-turn home rescue or supported invasion templates |
| Search | `search/mcts.ts`: up to four tree segments plus four greedy continuation segments, sampling hidden state at iteration start | Do not describe this as a fixed number of full turns or a complete information-set solution |
| Tactical extension | `eval/sharpener.ts`: attacks only, depth 0/1/2 | Does not explicitly add movement, rotation, promotion or full-reply home verification |
| Execution | Search is synchronous computation inside an `async` function; no worker | `await` alone does not move CPU work off the browser UI thread |
| Timing | MCTS checks time between iterations; initial candidate generation is outside that timer | Budgets can overrun inside expensive planning; full decision/turn time needs measurement |
| Telemetry | `nodesSearched` reports configured iterations, not actual work | Replace misleading counters before comparing performance |
| Repeated work | Beam prefixes are replayed; scoring and tagging each simulate candidates; MCTS regenerates plans; evaluation repeatedly derives mobility/spawn sets | These are observed repeated operations, not yet profiled percentages |
| Hidden state | `state/observation.ts`, `belief/*`: mask exact enemy money/queue; infer from events and random purchase hypotheses | Improve inference while retaining the information boundary; more particles alone may repeat a poor model |
| Economy | `evaluation.ts`: baseline material uses purchase cost; other terms separately value money/mining/mobility | The static solver is an offline instrument, not currently imported into the AI |

Unit lookup already uses a Map; do not spend time replacing an imagined linear catalogue lookup. Occupancy lookup and movement BFS, candidate replay, allocation, and repeated evaluation are better profiling candidates. Do not conflate browser Web Workers with Cloudflare Workers: the former run on the player's device.

## Evidence to preserve

Read `docs/HOME_VICTORY-2026-09-07.md` and `docs/MAP_D_PLAYTESTS-2026-09-07.md` with their methods and limitations.

The home-rule study contains 2,240 scripted runs, not 2,240 games of the shipped Easy/Medium/Hard AI. Four actual-AI home-defense probes used easy/fast overrides. Main-suite capped games fell to 280/960, but several passive policies still stalled. A proactive guard suite had zero home wins by round five in its 160 new-rule games. This motivates anticipatory defense and purposeful invasion; it does not establish their optimality.

A seat audit removed duplicate self-play controls: new-rule main suite had 329 first-player wins, 313 second-player wins, 258 caps; guard suite 82/54/24. Combined decisive first-player share was 52.8%, with substantial matchup variation. Freeze raw historical evidence. Treat starting-seat and orientation effects as evaluation dimensions, not grounds to alter rules during this project.

## Delivery sequence and checkpoints

Each stage is a separately reviewable commit or small commit series. Keep `muju/docs/AI_IMPLEMENTATION_STATUS.md` with the base/current commit, completed checkboxes, benchmark commands and results, failures, accepted tradeoffs, and next concrete task. Record measurements with device/browser, source and catalogue hashes, seed, budget mode, and cold/warm status. Do not mark a stage complete solely because code exists.

### P0 — Measurement, reproducibility, and acceptance fixtures

Deliver proposed `lab/bench/` CLI/browser runners, versioned position fixtures, a machine-readable baseline, and honest engine statistics.

- Inject RNG and a monotonic clock/search budget rather than globally replacing `Math.random`. Thread seeded RNG through particle IDs, sampling and resampling. Verify the lab engine adapter actually uses its supplied seed; currently its `onGameStart` does not wire that seed into the engine.
- Support deterministic fixed-work runs for algorithm comparisons and deadline-limited runs for real player experience. Exact replay is promised for fixed-work/seed mode, not wall-clock cutoffs.
- Record actual iterations, expansions, candidate counts, simulation/evaluation calls, cache hits, completed turn boundaries, tactical status, elapsed decision/turn time, and timeout reason. Avoid calling unlike work units “nodes.”
- Measure initial candidate generation, templates, beam expansion, scoring, move generation, belief work, MCTS, serialization and UI dispatch separately. Profile startup, crowded midgame, promotions/queue placement, quiet endgame and home emergencies. Use archived reachable states plus hand-built tactical fixtures.
- Establish Chrome desktop and Safari/iOS or a named representative mobile device baseline. A throttled desktop run is a proxy and must be labeled as such. Report medians and p95; do not claim WASM/mobile improvements without measurements.
- Add fixed information-equivalence tests: identical public history and own private state must produce identical fixed-seed decisions when only the actual enemy hidden state changes. Extend beyond the existing zero-iteration search test.
- Audit UCT payoff/prior perspective and numerical scale against explicit minimax toy trees. Treat any discovered defect as a separate correctness fix, not an undocumented performance gain.

Gate: repeatable fixed-work decisions and correct actual-work counters; baseline files and tactical expectations established before optimization. Remeasure existing test counts rather than copying the last 574-unit/19-browser totals as current proof.

### P1 — Worker execution and enforceable budgets

Deliver proposed `src/ai/worker/{protocol,client,entry}.ts` plus hook integration. Keep the core engine runnable in Node for the lab.

- Use a dedicated module worker with Vite's statically analyzable constructor, e.g. `new Worker(new URL('./entry.ts', import.meta.url), { type: 'module' })`. Verify against the installed Vite 7 version; no framework upgrade is needed just for this feature.
- Define versioned requests/responses: game ID, player, state revision, request ID, seed, difficulty/budget, public observation/events, and own private state. The worker owns belief/search state; maintain separate player contexts for AI-vs-AI. The UI owns the authoritative game, saves and animation.
- Send a masked observation plus own private state, not an unrestricted opponent snapshot. Refactor the engine boundary where needed. Validate any returned action again against the current authoritative state.
- Discard results after restart, undo, load, mode/difficulty change, unmount, victory or superseding revision. Do not let delayed results act in a new game. Add browser tests for all these races.
- A cancellation message cannot interrupt a currently synchronous worker loop. Make expensive search stages cooperatively chunked with deadline checks, or terminate/recreate the worker for immediate cancellation. Check inside beam/template/tactical loops, not only between MCTS iterations. Use message passing; no SharedArrayBuffer is needed.
- Use one shared decision deadline and a remaining-turn budget covering all stages, preserving a best legal result. Allocate more effort to forced threats and consequential purchases than obvious actions. Keep animation delays separate from CPU accounting.
- Keep the first-action/replan contract initially. Later reuse a verified plan or search subtree only when its expected state and information history match. Never blindly play a stale suffix.
- Define an explicit worker-error path: invalidate the request, expose a recoverable error/retry, and optionally use a tightly bounded JS fallback. Never silently convert worker failure into resignation or a long main-thread search.

Gate: same fixed-work outcomes in worker and direct execution; no stale/illegal actions; menu/animation responsive during Hard search; cancellation and deadline tests pass; static production build fetches its worker chunk correctly under `/muju/`.

Proposed performance acceptance targets, to calibrate in P0 rather than present as measured facts: p95 menu response under 100 ms during search, no individual AI-caused main-thread task over 50 ms, and p95 decision-budget overrun below the larger of 50 ms or 10% on the named test device. Initially retain existing difficulty search ceilings for comparison, but enforce them across the whole decision; then select explicit per-turn limits from measured player experience.

### P2 — Reduce computation and allocation in TypeScript

Profile after P1, then implement the highest-cost items one at a time. Do not assume every candidate below is worth shipping.

1. Store the simulated state with each beam prefix. Apply each extension once and share its result between scoring, tagging and continuation. Avoid eager unused debug/fallback candidate generation, or reuse root plans where the hidden-state hypothesis is compatible.
2. Compute per-state derived data once: occupancy index for 100 squares, unit indexes, move/attack lists, spawn availability and evaluation features. Reuse only under a key that includes all relevant inputs.
3. Replace allocation-heavy BFS string sets/queue shifting with indexed arrays and a head cursor where profiling supports it. Retain exact blocked-path and multi-action movement semantics. Preserve destination ordering during pure performance comparisons; audit directional bias separately.
4. Deduplicate equivalent resulting states and use bounded caches/top-k selection when beneficial. Hashes must account for side to move, phase, actions, damage/reset flags, promotions, resources, queue timing, cell depth, rules and catalogue; belief-dependent caches also need observation/particle identity. Use collision checks and game-lifetime limits.
5. Consider incremental evaluation and verified search reuse after actual actions. Retain root information-set boundaries; no caching a sampled opponent's private knowledge as universally true.

Gate: differential legal-action/transition/evaluation checks against the unchanged rules engine, fixed-work behavior agreement for semantic-preserving optimizations, and measured end-to-end benefit. A proposed screening threshold is at least 15% representative decision-time or useful-work improvement for a substantial optimization; keep smaller low-risk simplifications if they reduce complexity. Report when ordering changes alter search behavior.

### P3 — Reliable tactical planning for the current victory rule

Deliver a reusable tactical service, proposed `src/ai/tactics/home.ts`, and fixture suite. Use the authoritative simulator first; optimize later.

- Search legal clearing sequences through the actual placement/promotion/action phases and remaining six-action budget. Moves may cost multiple actions; each unit's attacks/promotions have their existing limits. Include clearing an adjacent lane, rotating attackers, coordinated damage, and turn-ending transitions.
- Return `proved`, `disproved within explicitly complete scope`, or `unknown/budget exhausted`, with a witness and scope. The existing lab `clearHomePlan` is a useful prototype, but its beam failure does not prove impossibility.
- Prefer immediate legal wins and prevent demonstrable immediate losses, including elimination alternatives. Resolve home occupation only at the correct owner's turn start, before healing/queue/placement. Do not add a timer or a different rule for the AI.
- Evaluate an invasion against a defender reply; extend tactically unstable leaves across the relevant turn boundary instead of treating a corner bonus as a guaranteed win. Hidden defender resources/promotions require hypotheses or conservative feasible bounds; label conditional conclusions. Never read the true hidden stockpile to prove safety.
- Add anticipatory reachability: enemy action-cost distance to home, interception opportunities, available clearing formations, and cost of retaining a defender. Being able to reach home is a threat indicator, not proof of a winning invasion.

Required puzzles: cheap invasion cleared in one attack; Metal IV cleared by two Fire II; three-attacker rotation; promotion-dependent rescue; tempting unnecessary mining before a required defense; blocked approach; both-home race; zero-attack occupier; elimination beating an occupation race; automatic turn transition; impossible-within-complete-small-fixture rescue; hidden-budget-dependent defense. Rotate/swap fixtures, and include both seats. Independently replay witness solutions; do not generate expected answers solely with the implementation under test.

Gate: all declared exact small-fixture solutions correct, no false proof from a cutoff, and Medium/Hard solve the selected mandatory defensive suite within their budgets. Easy should still take obvious wins and one-action saves; difficulty should arise from limited foresight, not deliberate nonsense.

### P4 — Diverse strategic plans and better value estimates

Deliver strategy-aware candidate allocation, proposed `planner/strategies.ts`, and solver-derived features with documented limits.

- Seed candidates from proactive defense, interception, fast raids, supported Metal invasion, contested-ore expansion, efficient promotion and elimination. Port useful ideas from lab `Aware`, `Invade`, `Siege` and `Guard` policies into candidate generators, not unconditional production openings.
- Reserve some beam/output capacity by strategic purpose and distinct resulting state. Preserve initially costly setup lines long enough to evaluate their payoff. Injected tactical plans must not disappear merely because their initial heuristic score is zero.
- Use previous strategic intent as a candidate/prior, with explicit reconsideration on threats and new information. Avoid both aimless replanning and rigid commitments. Tactical survival overrides ordinary preferences.
- Use exact action-distance, terrain/traffic, available ore depth, extraction payback, promotion delay, deployment delay and attacker count. Learn from static solver thresholds; do not turn its role-witness counts into universal unit prices or require equal usage of every unit.
- Extract browser-safe small tables or pure functions from `lab/solver/model.ts` if useful, preserving catalogue/model versioning. Do not ship the full offline analysis or import Node/file-writing code into the browser. Occupation models must account for the new reply-turn rule; old one-hit/open-corridor bounds are not complete proofs.
- Keep a coherent evaluation decomposition to avoid paying twice for cash converted into units, or multiplying territory/mobility/ore counts into spurious advantages. Test concrete tradeoffs and held-out states.

Gate: candidate-set coverage on strategic fixtures; improvement against diverse opponents at equal wall-clock cost, with ablations for tactical service, strategy allocation and economic features. Prefer broader practical counterplay over a single dominant hardcoded build.

### P5 — Belief quality and difficulty calibration

- Audit queue advancement, placement reconciliation and economic conservation in particle history before increasing particle counts. In particular, ensure a hypothesized purchase is not charged again when its placement is revealed, and that hypothetical units cannot remain indefinitely in an impossible queue.
- Represent plausible saving, rushing, mining investment and promotion intentions consistent with public events. Distinguish an economic upper bound from a lower bound. Keep uncertainty rather than fabricating confident enemy plans.
- Add synthetic observed histories with known feasible/infeasible hypotheses; measure coverage and calibration. Opponent reply generation must not choose actions using information that opponent could not know. Root sampling alone is not proof of correct information-set reasoning.
- Tune Easy for clear short-term choices, Medium for coherent development and dependable local defense, Hard for full combinations, anticipatory defense and adapting among plans. Freeze named presets with their actual work/turn budgets; do not claim a measured difficulty ladder until head-to-head results support it.

Gate: information-equivalence and belief-history tests pass; stronger presets improve the held-out tactical/league measures without cheating, excessive latency or an unexplained easy-over-hard inversion. If inversion occurs, diagnose pruning, model error and budget allocation before merely adding time.

### P6 — Conditional single-threaded WASM experiment

WASM is statically hosted browser code: compile on the developer machine/CI, publish the `.wasm` asset with JS, instantiate it inside the browser worker. Streaming compilation expects `application/wasm`. Single-threaded WASM and ordinary dedicated workers do not require shared-memory isolation headers. MDN documents loading and workers; Vite documents emitted worker/WASM assets. [1–3]

Only start this experiment if profiling after P2–P4 identifies a hot numerical/rules kernel worth moving. Candidate kernels are packed-state move generation, apply/undo plus evaluation, or batched tactical search. Moving a tiny scoring function while repeatedly serializing whole object graphs is unlikely to be a useful boundary; benchmark that overhead explicitly.

- Compare optimized TypeScript against a narrow Rust/WASM prototype (or another toolchain only for a demonstrated repository advantage). This adds build/toolchain complexity even though hosting stays static. Pin compiler/tool versions and lockfiles; keep a documented JS path.
- Use a versioned compact state/action ABI with typed arrays, integer coordinates and stable rule/catalogue identity. Prefer batches or a complete search operation per boundary crossing. Keep canonical JS rules as the reference; differential-test legal actions, transitions, damage/reset, promotions, queues, terminal timing and deterministic fixed-work outputs across many reachable states.
- Keep the UI protocol independent of the backend. Handle compilation/fetch failure, unsupported features and cancellation. Bound WASM execution in cooperative chunks; a long native call also cannot process a queued worker cancellation message until it returns.
- Measure end-to-end decision latency/useful expansions, cold compile/startup, transfer/serialization, compressed download, memory and real Safari/Chrome behavior. Verify any increased throughput actually improves play at the same turn budget.
- Proposed go/no-go: at least 1.5× end-to-end useful-search throughput or a material p95 latency reduction on the named mobile target at equivalent strength, no correctness regression, and acceptable startup/download cost. If only a microbenchmark improves, retain the JS worker and record the rejection.
- Defer shared-memory WASM threads, SharedArrayBuffer and multi-worker search pools. Shared memory requires secure-context/cross-origin isolation and associated headers/resource compatibility; it is unnecessary for the recommended first implementation. It can still be statically hosted, but adds deployment and device complexity. [4]

Gate: measured decision recorded as adopt/reject/defer. “No WASM needed” completes this stage when supported by the profiles; a rewrite is not mandatory.

## Static build and deployment details

Current Vite base is `/muju/`. `build-all.sh` builds Muju/FORGE/Oracle, copies their `dist` directories into `_site`, and runs `tools/verify_site.py`. Hashed worker and WASM assets should travel through that existing path. Test asset loading on a nested production URL, not only the dev server.

Extend verification to load emitted worker/optional WASM dependencies; current HTML-link checks do not discover every runtime import. Inspect production MIME types and actual content. If a header override is necessary, Cloudflare Pages accepts a static `_headers` file. The current verifier rejects dot-prefixed files, not underscore-prefixed `_headers`; nevertheless verify correct packaging. A rules file must reach `_site/_headers` at the Pages project root: simply placing it under copied `_site/muju/` does not establish that. Do not introduce site-wide COOP/COEP for ordinary worker/single-thread WASM. [5]

Keep content-hashed assets, explicit failure fallback, and no backend endpoint. Pin any WASM build step in CI and local build instructions. Update `SPEC.md`, player help only where behavior explanations warrant it, and remove misleading legacy AI comments/configs after checking references.

At release time, follow the user's then-current deployment instruction and repo workflow. Fetch current master before building a full-site replacement. The last GitHub workflow built and checked successfully but skipped publishing because its optional Cloudflare credential was unset; the release used the existing local deployment configuration. Do not equate a green workflow with a live upload. Never put credentials in this plan, Git, logs or client assets. Verify Muju plus FORGE and Oracle after any full-site deploy; record release commit, immutable deployment URL and live asset hashes. Roll back using a source revert and the existing deployment path if needed.

## Evaluation plan and stopping rules

Run correctness before expensive tournaments, and use profiles to size batches. Proposed starting coverage:

| Layer | Initial scope | Record / decision |
|---|---|---|
| Tactical suite | About 30–50 distinct authored positions, rotations/seats separate; fixed-work and shipped budgets | Solve rate, witness validity, false proofs, timeouts, p95 latency |
| Performance | About 20–30 reachable positions spanning early/crowded/endgame states; repeated cold/warm measurements | Actual work and useful work per ms, transfer cost, startup, memory, UI responsiveness |
| Screening league | 8–12 strategy opponents, 10 seed blocks each, both seats; include current production AI and passive/stall controls | Start small; expand only promising changes. No claim this is a statistically final sample |
| Confirmation | Frozen held-out seeds/positions; both seats; current-production vs candidate and difficulty ladder | Predeclare workload after measuring runtime; inspect paired confidence intervals and caps |
| Ablations | Remove one major improvement at a time | Attribute gains and costs; avoid tuning repeatedly on the held-out set |

Use `createEngineBot({ difficulty, speed: 'ui' })` for shipped-strength claims. Its current default is `fast`, which overrides important settings. Throughput runs may screen ideas but must be labeled. Test actual worker execution in browsers in addition to direct Node engine games. Equal-work comparisons establish algorithmic efficiency; equal-wall-clock comparisons establish what players receive.

Log natural wins by victory reason, caps separately, decisive win rate with denominator, game duration, first-seat results, unit/strategy usage, avoidable home losses, missed wins, repeated/no-progress plans, and both action/turn latency. Do not count material adjudications as actual victories. Pair seeds and seats; remove duplicate self-play swaps. Bootstrap seed blocks within matchup rather than assuming every paired game is independent.

To diagnose first-turn advantage, add a controlled starting-player option to the lab only, with correct round/queue initialization. Cross first mover with fixed board corner and rotated positions; normalize policy-relative ordering and seed streams deliberately. Swapping bot names alone does not separate moving first from coordinate-order artifacts. Keep the production opening unchanged.

A candidate is ready when it preserves rules/information boundaries, passes required tactical and cancellation fixtures, meets calibrated device budgets, and shows a credible held-out improvement at equal cost without hiding severe matchup regressions or increased stalls. Do not infer universal balance from unit-use counts. Additional runs are justified by unresolved uncertainty, not by a desire to accumulate a large headline number.

## Commands and deliverables

Existing commands, from the new implementation worktree's `muju/` directory:

```sh
npm ci
npm test
npm run build
npm run balance:check
npm run balance:types
npx tsc -p lab/experiments/tsconfig-home.json --noEmit
MUJU_BASE_URL=http://127.0.0.1:<free-port>/muju/ npm run test:e2e
```

Use a genuinely free loopback port after checking listeners; the example URL requires substitution and an already running built-site server. For full-site checks install the other games' locked dependencies, run `bash build-all.sh` from repo root, then run `node tools/smoke-site.cjs <base-url>` against the served build. Do not overwrite archived experiment output to run a new benchmark.

Add documented commands for the proposed benchmark, tactics, league and ablation runners when they exist; their names in this plan are proposals, not working CLIs. Expected deliverables are the worker and protocol, budget/RNG/stats infrastructure, optimized planner, tactical service, strategic candidates/economic features, audited belief model, calibrated presets, reference fixtures and reproducible results, a WASM decision record, and an updated session status/release report. Preserve a JS reference path if a second rules implementation is introduced.

## Sources checked for the hosting decision

1. [MDN: Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) — background execution, message passing, termination; a worker improves UI responsiveness without requiring a server.
2. [MDN: WebAssembly.instantiateStreaming](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static) — fetching/compiling a WASM asset and the `application/wasm` requirement.
3. [Vite: Features](https://vite.dev/guide/features.html#web-workers) and [static assets](https://vite.dev/guide/assets.html) — bundling worker/WASM assets. Current online documentation may describe a newer Vite than the installed v7; test against the repository lockfile and use supported `?url`/`?init` or standard worker patterns rather than assuming new import features exist.
4. [MDN: SharedArrayBuffer security requirements](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements) — isolation requirements concern shared memory; this plan avoids needing it.
5. [Cloudflare Pages: Headers](https://developers.cloudflare.com/pages/configuration/headers/) — static response headers through the project-root `_headers` output.

All performance gains and acceptance thresholds above are hypotheses/proposed gates until P0 and subsequent comparisons measure them.
