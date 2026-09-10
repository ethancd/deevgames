> **Historical baseline — superseded on the v2.1 feature branch (2026-09-09).**
> The well, depth, mine action, build queue/times, hidden economy and three-phase
> teaching below are historical. Current rules use passive 0/4/8/10 reserves
> (520 total), public tier-1 purchase and later-turn promotion. See [SPEC](../SPEC.md),
> [mining report](MINING_SIMPLIFICATION-2026-09-09.md) and
> [placement report](PLACEMENT_SIMPLIFICATION-2026-09-09.md). Old measurements
> remain labeled by their original versions; none establishes v2.1 balance.
> Production release status is tracked by the repository’s deployment workflow.

> v1.6 follow-up: [upkeep and inactivity draw](UPKEEP_DRAW-2026-09-08.md) supersede the no-upkeep game lengths, cap rates and carrying values below. Historical measurements are preserved.

# Muju AI correctness repair — 2026-09-07

> Subsequent authorized work: the static value solver and v1.3 catalogue changes are now implemented. See [implementation and validation](BALANCE_IMPLEMENTATION-2026-09-07.md). The original report below describes its earlier checkpoint.

Base: `512fe0dccf4ed68a69014d7e26ff28ac9ca6b808`. Work branch: `codex/muju-correctness-balance`. This is a source repair, not a production deployment. Unit statistics, elemental relationships and intended gameplay rules are unchanged. See [balance analysis](BALANCE_REVIEW-2026-09-07.md) for separately evaluated prototypes.

## What changed

Human play, AI execution and search now share the same immutable action transition and legality boundary. Previously the human reducer checked rules that the AI simulation omitted, even though that simulation also applied the AI's real moves. Illegal actions now return the original state without consuming resources or actions.

| Failure | Repair | Regression evidence |
|---|---|---|
| D1: AI queues/places units without required tech | Queue generation, queue application and placement validate ownership, tech and funds | Correctness tests reject inaccessible tiers and recheck after tech-anchor loss |
| D2/D14: illegal spawn, occupied/unreachable movement, ghost attacks | One authoritative validator checks phase, actor, readiness, coordinates, move budget, target and repeat-attack rules | Rejection matrix and real-state legal-plan tests |
| D3: hidden queued spending influences AI | Keep committed spending internally; expose only `resourcesManifested` to the opponent observation. Candidate generation uses that observation too | Hidden-stockpile/queue/spending variants produce the same seeded decisions |
| D4/D11/D12: phase transitions disagree or wait for impossible work | Both paths use common phase helpers; queue actionability checks affordable tech-legal builds, not place-only promotions | Shared-reducer phase/accounting fixtures |
| D5: legitimate AI turns stop after 20 dispatches | Remove arbitrary cap; legal work consumes actions, funds, placement/promotion opportunities or a phase | Hook test completes 30 queued purchases and hands over the turn |
| D6: build-option helper ignores tech | Require board/player context and use `canBuildUnit` | Build-option fixtures with explicit prerequisites |
| D13 extension: independently simulated IDs disagree with real reducer | Deterministic state-derived queue IDs and queue-derived piece IDs, checked against live identifiers | ID uniqueness tests and every-step shadow/reducer equality |
| Placement is skipped only in the AI's local shadow state | Explicit `END_PLACE_PHASE` action is generated and dispatched through the real reducer | Hook test handles an empty or illegal proposal in placement |
| Multi-action movement costs one action in simulation | Charge the full shortest-path movement cost | Full-cost movement fixture |
| Plans with different targets collapse under the same ID | Include action destinations, targets and placement coordinates in plan IDs | Distinct-target plan test |
| MCTS expands only the first root choice | Progressive widening at the current node before descent; exclude branches absent from the current sampled state | Synthetic search fixture proves alternatives are explored |
| Opponent branches cooperate with root player | Flip exploitation value at opponent nodes, while retaining exploration and acting-player priors | Opponent UCT fixture |
| Tactical negamax changes sides after every action | Preserve evaluation perspective; maximize/minimize by the actual turn owner | Same-player multi-action tactical fixture |
| Buying an asset incurs a second economic penalty | Reward actual resources gained, rather than subtracting purchase cash again after evaluation already values the asset transfer | Purchasing-versus-hoarding score regression |
| AI resigns despite its own bank/reinforcements | Do not resign while holding resources or queued reinforcements, or when an immediate winning attack exists | Economic/resignation regression and targeted engine probe |
| Belief persists across seat changes/new-game rollback | Reset on seat changes or backwards round/income history | Engine lifecycle guards; full suite remains green |

A searched plan is truncated to its legal prefix in the real position. An empty result falls back to a legal candidate or explicit phase end. An immediately winning legal attack takes priority. This prevents an imagined future opponent deployment from creating executable ghost targets.

Accounting has two distinct meanings: `resourcesSpent` tracks committed purchases, including hidden queues; `resourcesManifested` tracks public placement and promotion spending. Placement does not charge committed spending a second time. The internal field names are not the visibility contract: the opponent observation masks committed spending with the manifested amount.

D7–D9 are intentional design rules and remain: no on-board anchor means elimination despite queued pieces; damage clears at the owner's next turn; one unit cannot attack the same target twice in that turn. D10 remains a planning limitation: generated single moves are speed-bounded, but the AI can chain them; any multi-action movement submitted to the transition pays its full legal cost.

## Verification

- Baseline: 479 tests passed before changes.
- Final full suite: **508 tests across 24 files passed** (`npm test -- --run`).
- Production TypeScript/Vite build passed (`npm run build`).
- Lab TypeScript check passed (`npx tsc -p lab --noEmit`).
- **17,920 scripted balance games** on the corrected transition: zero illegal emissions and zero invariant failures. These test many state transitions but are not a test of AI search strength.
- The actual browser build completed an Easy AI turn, returned control to White at round 2, saved the position, and restored the same round after reload without page errors. The rendered board and turn controls were visually inspected ([round-2 screenshot](../lab/results/e8-2026-09-07/browser-round2.png)). The browser verification is distinct from hook mocks.
- Engine probe outcomes and the earlier economic-regression probe are recorded separately in [comparison.md](../lab/results/e8-2026-09-07/comparison.md). The completed post-fix hard-fast/Rush cell won both seats by elimination, with zero illegal actions or invariant failures. The broader run was stopped during Tier1Spam after more than 19 minutes total runtime because dense-position search was expensive; no unfinished outcome is counted. These two games and reduced search budgets are smoke checks, not difficulty calibration.

Reproduce from the `muju` directory with dependencies installed:

```sh
npm test -- --run
npm run build
npx tsc -p lab --noEmit
node --import tsx lab/experiments/catalog-audit.ts
node --import tsx lab/experiments/e8-design-screen.ts baseline 40
node --import tsx lab/experiments/e8-design-screen.ts lightning_early 40
node --import tsx lab/experiments/e8-design-screen.ts confirm_base 200
node --import tsx lab/experiments/e8-design-screen.ts confirm_lightning 200
node --import tsx lab/experiments/e8-design-screen.ts engine 1
python3 lab/experiments/summarize-e8.py
```

Each experiment writes its named result file; copy existing results before intentionally rerunning. Other candidate names and exact parameter changes are in the experiment source. Production does not import those patches.

## Limits and follow-up

This establishes explicit rules enforcement and repairs identified search logic errors. It does not prove optimal play, eliminate all possible engine bugs or calibrate difficulty. Beliefs and tactical evaluation remain approximations; event inference can miss details between observations, and MCTS still uses bounded depth and incomplete candidate sets. Search wall-clock limits are checked between iterations, not within an expensive beam expansion, so dense positions can exceed the nominal time budget. The small engine probes cannot establish a reliable win-rate improvement.

The existing 20-dispatch lab option is retained only as an opt-in historical approximation and defaults off. It does not recreate an actually frozen UI. Old reports and result hashes are preserved as history; September results should not silently replace their meaning.
