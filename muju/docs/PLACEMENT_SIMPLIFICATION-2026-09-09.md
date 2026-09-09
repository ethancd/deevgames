# Placement simplification — 2026-09-09

Status: implementation and bounded verification complete. Comparative balance study deferred. **Tested branch, not a production deployment.**

Both simplifications are implemented together on `codex/muju-placement-simplification`, based on production `16ccfd7`. Mechanics are fixed as requested. The designer made engineering and future testing suggestions; catalogue stats/costs, board topology, haste and action budget are unchanged. Only the requested mechanics are changed.

## Registered study hypotheses

The original proposed hypotheses and matrix follow, registered before the new lab runs. The full comparative study is future work; bounded verification below must not be presented as evidence for unrun hypotheses. An initial obsolete unit-suite run preceded this registration and is not a balance experiment.

### Registered future lab study (original proposed protocol)

1. **The designer's claim — tier-1 wide does not snowball.** Under passive mining on 4/8/10, a mass-tier-1 economy is capped by the four 10-crystal home cells reachable without moves and by 4-crystal ground that mines out fast, while its bodies get chewed through by Cleave-capable defenders. Measure Tier1Spam and Fire Rush versus Balanced, AntiRush, and InvestT3: income by round for both sides, tier-1 share of army by round, natural wins / draws, and mean units lost per round. The claim holds if spam's income curve flattens by round 8 while the investing side's does not, and spam's natural-win share does not rise versus the base. (If on the `16ccfd7` base, run this anyway and label it "under the well.")
2. **Tempo parity.** Rounds from purchase to first action for Hi, Hono, Kagari, Sjor, Straumr, Aegirinn, Inyan, Mazask, Tanka are 0 / 1 / 2 (buy, promote, promote) and match or beat the base's build-time-plus-placement timings; Rush versus AntiRush and Expand natural-finish rates move by less than the paired interval. Build times' removal helps expand lines (Inyan/Muju had build 2) more than rush — report whether AntiRush gains.
3. **Summon-and-strike.** Count kills where the killing attacker was placed the same turn. Report the share of tier-3 deaths caused this way, shipped versus base, and whether it rises when the bank is public (bots don't adapt; say so).
4. **The corner sprint.** Home wins by round 5 by Lightning I, shipped versus base, with and without the Guard policy. Expect no rise; the sprint has the same timing as today.
5. **The visible climb.** Share of units that begin a promotion climb and die before reaching tier 3, by element, versus the base's share of queued tier-3s that never place. If the climb is sniped far more than the queue was, the "no promotion on placement turn" rule is costing tier-3 access and the report should quantify it, not change it.
6. **Perfect-information AI.** At equal turn budgets, the engine's natural-win rate versus the scripted ladder rises with the belief layer gone; the engine never ends a place phase with an affordable, safe, positive-income purchase unmade; it never buys into a blocked rectangle (illegal by construction — assert zero).
7. **Endings.** Draw and cap rates versus base; no new stall introduced by the removal of queue persistence.
8. **Fairness.** White's share in Balanced mirrors unchanged.

Run with paired seeds, both seats, natural wins / draws / caps separate, zero illegal actions and invariant failures required (add: bank never negative; purchases only tier 1; every promotion's unit existed at phase start):

- E13 main suite (24 pairings × 20 seed blocks × 2 seats), shipped versus base.
- E9 confirmation matrix (16 matchups × 200), shipped versus base.
- E11 investment pairings (InvestT2/T3 vs InvestT1, Rush, LightningRush, MiningDenial, HomeT3, Balanced), shipped versus base, with income-by-round telemetry.
- The E14 Guard pairings for hypothesis 4.
- The engine at Medium UI budget against the scripted ladder (Random, Greedy, Rush, Tier1Spam, AntiRush, Balanced, InvestT3, MiningDenial), both seats, small N, shipped versus base at the same budget (hypothesis 6).
- Do not rerun the map-study or topology suites.


## Implemented rules and rationale

**Place:** in any order, buy any number of affordable tier-1 units on empty
squares in unblocked spawn rectangles, and promote units that existed at
Place start to their next tier, paying the cost difference. Each unit can
promote at most once per turn, never on its placement turn. Tier 3 is terminal.
**Act:** six shared moves/attacks; placed and promoted units act immediately.
End Act settles passive income, then the clock/draw, then the next turn.

There is no build queue, queue phase, build time, explicit tech requirement
or hidden stockpile. `resources` and `resourcesGained` are public. The bank
replaces blocked-queue persistence and the visible climb replaces higher-tier
delay. A purchased tier-1 must survive two opponent turns to reach tier 3.
Haste is retained exactly, including Lightning-I rushes and summon-and-strike.
J-018 records the rejected alternatives and the two load-bearing sub-rulings.

| Quantity | Implemented v2.1 | v1.9 base |
|---|---|---|
| Phases | Place · Act | Place · Act · Queue |
| New bodies | Public tier-1 purchase at Place | Hidden paid queue, delayed placement, direct higher-tier construction |
| Tier-2/3 access | In-place promotion only | Promotion or tech-gated construction |
| Purchased line's earliest active tiers, adequately funded | Buy +0 / +1 / +2 own turns | Depends on build time and placement; no new comparative sample |
| Bank / AI state | Public; real-state MCTS | Hidden; observations/beliefs/re-determinization |
| Economy | Passive 4/8/10, 520 | Well 0/3/4/5, 308 |
| Catalogue and combat | Exact v1.9 stats/costs and combat | Pinned control |
| Paired natural wins / draws / caps | Not measured | Not measured in this change |

The comparator is production v1.9 because the mining branch did not exist.
Both changes are implemented together; this table does **not** isolate the
placement change's causal effect from passive mining.

## Results against the eight registered hypotheses

| # | Hypothesis | Result in this implementation |
|---|---|---|
| 1 | Tier-1 wide does not snowball | Unmeasured. Unlimited affordable purchases and unconditional income are retained, including the feared opening. |
| 2 | Tempo parity | Funded buy/promote/promote timing 0/1/2 and immediate action verified. Comparative AntiRush/Rush finish rates unmeasured. |
| 3 | Summon-and-strike | Legal same-turn purchase/attack verified; telemetry counts kills. Comparative tier-3 death share unmeasured. |
| 4 | Corner sprint | Haste, Radi stats and home timing unchanged; no E14 Guard rate comparison. |
| 5 | Visible climb | Once per turn and no purchase-turn promotion verified; snipe frequency/intended-tier attrition unmeasured. |
| 6 | Perfect-information AI | Observation/belief layer removed, real worker state and legal purchase plans verified; equal-budget win gains and universal spending claim unmeasured. |
| 7 | Endings | Income/clock, elimination and home order verified; no paired draw/cap estimate. |
| 8 | Fairness | Balanced mirrors not rerun; White advantage remains an open concern. |

## What was deleted

| Deleted source | Lines at v1.9 |
|---|---:|
| `src/ai/belief/particle.ts` | 80 |
| `src/ai/belief/reconcile.ts` | 36 |
| `src/ai/belief/types.ts` | 14 |
| `src/ai/belief/update.ts` | 107 |
| `src/ai/state/events.ts` | 27 |
| `src/ai/state/eventsLog.ts` | 83 |
| `src/ai/state/observation.ts` | 55 |
| `src/ai/state/types.ts` | 43 |
| `src/ai/search/redeterminize.ts` | 55 |
| **Observation/belief/re-determinization source total** | **500** |
| `src/components/BuildQueue.tsx` | 19 |
| `src/components/CrystalWell.tsx` | 25 |

Additional removals within retained files include queue transitions/generation,
private spending state, queue valuation, particle context, mine actions/depth,
18 build-time fields and the old queue/well tutorial. The obsolete observation
test file (106 lines) and action-mining map-value test (62 lines) are removed;
replacement tests cover current income and public-state behavior.

## Implementation and verification

Implementation commit: `8f3871b` (based on production `16ccfd7`).

The final source implements both prompts together as v2.1. Catalogue stats and
costs, the six actions, 10×10 layout/rotation, Cleave, haste, home occupation,
owner-turn healing, upkeep and draw timing are held to the requested mechanics.
There is no opening handicap, center obstacle, board-size change, summoning
sickness or other balance adjustment.

- **542 tests pass in 34 files**, including the full suite, seeded legal
  playout invariants, shared reducer/simulator behavior, purchase/climb timing,
  mining over all 18 units and reserves 0–10, conservation, save/undo boundaries,
  public worker state, real-state planning and JS/WASM differential checks.
- **32 Chrome browser cases pass**, covering combat/worker regressions as well
  as buying, public banks, reserves, live income, recap, promotion restriction,
  persistence, tutorial and eight viewport sizes. Five new cases pass in WebKit,
  including the 390×664 layout. Visual inspection caught an undersized phone
  board; the shop and selected-piece information now share one panel.
- `npm run build`, `npm run ai:wasm`, `npm run balance:check`,
  `npm run balance:types`, the main lab, home, map-d, tier3 and AI TypeScript
  configurations pass. Full-site `bash build-all.sh` and 390px/834px browser
  smoke checks pass. No site was published.
- Static results: **18 distinct profiles, zero same-tier dominance, zero
  missing sole-cheapest witnesses**. No catalogue tuning. See
  [current solver output](../lab/results/current-static/current.md).
- Replay viewer verified with a new v2 replay (reserve 10, public purchases,
  turn-end income) and a preserved v1 replay. Historical playback remains
  explicitly labeled. A single Balanced/Rush seed used to exercise the viewer
  ended naturally by upkeep elimination on round 10, with zero illegal actions
  or invariant failures; this is an instrument check, not a paired estimate.

The original pre-change suite had tests for deleted rules. Removed/replaced
well, queue and observation tests do not remain as meaningless green assertions;
retained tests and new coverage address the current rules. Counts are not a
measure of comparative balance confidence.

## Engineering decisions and deviations from the suggested workflow

The designer's final direction made the mechanics sacrosanct and engineering
and future testing suggestions. Within that scope:

1. Use one combined branch, `codex/muju-placement-simplification`, from
   production `16ccfd7af9a850bd347d2079c78eeaab325fff12`. Neither proposed branch
   existed when work began. The isolated worktree is
   `/tmp/deevgames-muju-placement`, inside the available writable sandbox;
   production's checkout and unrelated untracked work are preserved. This
   avoids building an intermediate hidden-economy AI only to delete it next.
2. Append **J-017/J-018**, because J-015/J-016 already record T1 retention and
   the ten-turn draw. Do not overwrite those rulings. Spec v2.0 denotes mining
   and v2.1 the combined result; neither is a separate production deployment.
3. Use save **schema 5** for the combined incompatibility. Older unfinished
   saves start fresh through the existing mismatch path. Worker protocol is
   **2**, WASM ABI **4**. Preserve the kernel's bounded tactical proof scope;
   general purchases return unknown, with bounded purchase planning in JS.
4. Keep `resourceLayers` as the internal reserve field, with no depth field.
   `reserveTake` supplies `min`; the per-unit take and player settlement are
   shared. The static model uses the same minimum operation and explicit
   finite-cell horizons, not a corridor action-mining model.
5. Retain derived total spending and upkeep subtotals **only as lab telemetry**;
   no hidden/private spending fields remain in player state. Replay/game schemas
   become v2 and store an array of 100 reserves, so 10 is one cell value.
6. Keep reserve numerals on by default with a toggle. Show the shop or selected
   piece in the same panel, live projected income above actions, and an expandable
   per-unit settled-income recap. Tutorial pages derive catalogue/map values
   from constants. Existing strategy videos are marked obsolete, not regenerated.
7. Add bounded Place candidates for miners, blockers, anchor promotions and
   multiple adjacent Hi purchases followed by attacks. Scripted bot movement
   preferences include destination take minus current take. These are heuristics,
   not a promise to spend every affordable crystal or a proof of stronger AI.
8. Pin the v1.9 catalogue/well/map source in `lab/solver/baseline-v1.9.json`.
   Preserve historical results and `lab/maps` unchanged. Old experiment
   entrypoints now stop with reproduction guidance: their fixed historical
   output paths/manifests cannot safely describe v2.1. Reusable policies and
   the current harness are ported; the full new experiment manifests/matrices
   remain future work.
9. Defer the large paired E13/E9/E11/E14/Medium-engine studies and the pinned
   `actions-5` / `reserves-6-8-10` experiment packages. The current harness can
   accept reserve layouts, but that is not presented as a completed comparator.
   No map-study or topology games were rerun.
10. Commit implementation and its canonical docs together, then record the
    verification/study reports in a second commit. One combined implementation
    commit replaces the two suggested source-change lanes.

## Telemetry and remaining measurement work

The harness records settled income by player/round, remaining board reserves,
units on depleted cells after settlement, income by tier/element, first round
at 90% depletion, purchases by definition, promotions, tier-1 army share and
same-turn placed-attacker kills. The income sample's `bank` is **immediately
before end-turn collection**, not the requested turn-start bank. Kill attribution
to a future intended promotion tier, tier-3 summon-kill share and detailed home
invader summaries still need dedicated study instrumentation. Replays expose
the underlying states for further analysis; no missing series was inferred.

For future reports, distinguish natural attack/home/upkeep wins, inactivity
draws and capped/adjudicated games. Legacy generic harness summaries include
adjudication in aggregate wins; do not call those aggregates natural-win rates.
The small instrument checks here are not the requested comparative experiments.

## Adversarial review and limits

Review covered the dangerous boundaries: buying through a blocked rectangle,
same-turn buy/promote, repeated promotion, uncharged purchases, stale actions,
income after movement/attack/promotion, Mining 0, depleted ground, income before
rent, the tenth quiet turn before an imminent home win, and undo crossing an
income settlement. The Sjor-to-E5 opening and an infiltration response are
legality fixtures. They neither prove nor refute an overwhelming White advantage.

The maximum strategic branching from unrestricted affordable purchases is
large. Planning is bounded; exhaustive purchase proof and equal-budget strength
are not verified. An affordable income-generating purchase is not automatically
the best use of a bank that could fund a promotion or future rent. Similarly,
quiet-turn draws are not mechanically restricted to 90% board depletion:
ore may remain elsewhere while both armies earn nothing. These are empirical
study questions, not extra rules or universal guarantees.

Static witnesses establish local task distinctions, not task frequency,
whole-game unit viability or fairness. No result here warrants changing the
specified mechanics. **Tested branch, not a production deployment.**

## Reproduction

From `muju/` in the feature branch:

```sh
npm ci
npm test
npm run build
npm run ai:wasm
npm run balance:check
npm run balance:types
npx tsc -p lab --noEmit
npx tsc -p lab/experiments/tsconfig-home.json --noEmit
npx tsc -p lab/experiments/tsconfig-map-d.json --noEmit
npx tsc -p lab/experiments/tsconfig-tier3.json --noEmit
npx tsc -p lab/ai/tsconfig.json --noEmit
```

From the repository root, run `bash build-all.sh`, then serve `_site` locally.
With that server's `/muju/` URL as `MUJU_BASE_URL`, run `npm run test:e2e` in
`muju/`. For the new WebKit subset, also set `PLAYWRIGHT_BROWSER=webkit` and
select `mobile.spec.ts` / `visuals.spec.ts` cases for 390×664, passive reserves,
buy-now/promotion timing, tutorial and reserve numerals. Run
`node tools/smoke-site.cjs http://127.0.0.1:PORT` from the root for the two
full-site widths. `CHROME_PATH` can select installed Chrome. The implementation
run used existing local dependency installations through worktree symlinks;
no dependency or lockfile changes were required.

For historical control experiments use a separate checkout at `16ccfd7`, with
its own engine and manifests. Do not load old records as current gameplay or
rerun the frozen map comparison under the new economy.

## Complete combined-change file manifest

Both reports list the same combined branch scope. Historical result files and
`lab/maps/` are not modified. The list includes newly preserved prompt/design
references and both reports; runtime deletions are itemized above/in the placement
report. Paths are relative to the repository root.

```text
docs/game-design-dossier.md
muju/AI_ENGINE_PLAN.md
muju/AI_ENGINE_QUESTIONS.md
muju/JUDGMENT_LOG.md
muju/SPEC.md
muju/assembly/tactics.ts
muju/docs/AI_CORRECTNESS-2026-09-07.md
muju/docs/AI_IMPLEMENTATION_PLAN-2026-09-07.md
muju/docs/AI_IMPLEMENTATION_STATUS.md
muju/docs/BALANCE_FOLLOWUP-2026-09-08.md
muju/docs/BALANCE_IMPLEMENTATION-2026-09-07.md
muju/docs/BALANCE_REVIEW-2026-09-07.md
muju/docs/CLEAVE_RELEASE-2026-09-07.md
muju/docs/DESIGN_REVIEW.md
muju/docs/DRAW_TEN-2026-09-08.md
muju/docs/ELEGANCE_COMPARISON-2026-09-09.md
muju/docs/EMPTY_APPROACHES-2026-09-07.md
muju/docs/HOME_VICTORY-2026-09-07.md
muju/docs/MAP_D_PLAYTESTS-2026-09-07.md
muju/docs/MAP_D_RELEASE-2026-09-07.md
muju/docs/MAP_STUDY-2026-09-07.md
muju/docs/MINING_SIMPLIFICATION-2026-09-09.md
muju/docs/MOBILE_UX-2026-09-07.md
muju/docs/PASS_PLAY_FIX-2026-09-07.md
muju/docs/PLACEMENT_SIMPLIFICATION-2026-09-09.md
muju/docs/PROMPT_mining_simplification.md
muju/docs/PROMPT_placement_simplification.md
muju/docs/STRATEGY_HANDOFF-2026-09-08.md
muju/docs/TIER3_CAP-2026-09-08.md
muju/docs/UPKEEP_DRAW-2026-09-08.md
muju/docs/VISUAL_SYSTEM-2026-09-07.md
muju/docs/v1.1-spec.md
muju/e2e/ai-worker.spec.ts
muju/e2e/cleave.spec.ts
muju/e2e/mobile.spec.ts
muju/e2e/pass-play.spec.ts
muju/e2e/tier3-cap.spec.ts
muju/e2e/upkeep-draw.spec.ts
muju/e2e/visuals.spec.ts
muju/lab/ai/fixtures.ts
muju/lab/docs/EXPERIMENTS.md
muju/lab/docs/PLAN.md
muju/lab/docs/SPEC_AUDIT.md
muju/lab/docs/STATUS-2026-06-10.md
muju/lab/experiments/catalog-audit.ts
muju/lab/experiments/e10-map-d.ts
muju/lab/experiments/e11-map-d-investment.ts
muju/lab/experiments/e12-map-d-topology.ts
muju/lab/experiments/e13-home-victory.ts
muju/lab/experiments/e14-home-guard.ts
muju/lab/experiments/e15-tier3-e13.ts
muju/lab/experiments/e15-tier3-e9.ts
muju/lab/experiments/e16-upkeep-ai.ts
muju/lab/experiments/e16-upkeep-e13.ts
muju/lab/experiments/e16-upkeep-e9.ts
muju/lab/experiments/e8-design-screen.ts
muju/lab/experiments/e9-static-balance.ts
muju/lab/experiments/historical-experiment.ts
muju/lab/experiments/home-engine-probes.ts
muju/lab/experiments/home-policies.ts
muju/lab/experiments/map-d-investment-policies.ts
muju/lab/experiments/map-d-policies.ts
muju/lab/harness/bots/archetypes.ts
muju/lab/harness/bots/bot-utils.ts
muju/lab/harness/bots/engine.ts
muju/lab/harness/bots/greedy.ts
muju/lab/harness/bots/mono.ts
muju/lab/harness/bots/probes.ts
muju/lab/harness/cli.ts
muju/lab/harness/invariants.ts
muju/lab/harness/legal.ts
muju/lab/harness/runner.ts
muju/lab/harness/types.ts
muju/lab/results/current-static/current.json
muju/lab/results/current-static/current.md
muju/lab/solver/README.md
muju/lab/solver/baseline-v1.9.json
muju/lab/solver/model.ts
muju/lab/solver/run.ts
muju/lab/tools/replay-viewer.html
muju/src/ai/belief/particle.ts
muju/src/ai/belief/reconcile.ts
muju/src/ai/belief/types.ts
muju/src/ai/belief/update.ts
muju/src/ai/engine-v2.ts
muju/src/ai/evaluation.ts
muju/src/ai/moves.ts
muju/src/ai/planner/beam.ts
muju/src/ai/planner/placement.ts
muju/src/ai/planner/scoring.ts
muju/src/ai/search/mcts.ts
muju/src/ai/search/redeterminize.ts
muju/src/ai/simulate.ts
muju/src/ai/state/events.ts
muju/src/ai/state/eventsLog.ts
muju/src/ai/state/observation.ts
muju/src/ai/state/types.ts
muju/src/ai/tactics/home.ts
muju/src/ai/types.ts
muju/src/ai/wasm/kernel.ts
muju/src/ai/wasm/tactics.wasm
muju/src/ai/worker/client.ts
muju/src/ai/worker/handler.ts
muju/src/ai/worker/protocol.ts
muju/src/components/AIConsole.tsx
muju/src/components/AIRecap.tsx
muju/src/components/ActionBar.tsx
muju/src/components/BuildQueue.tsx
muju/src/components/Cell.tsx
muju/src/components/CellReserve.tsx
muju/src/components/CrystalWell.tsx
muju/src/components/GameScreen.tsx
muju/src/components/InstructionsModal.tsx
muju/src/components/PhaseIndicator.tsx
muju/src/components/ResourceDisplay.tsx
muju/src/components/UnitInfo.tsx
muju/src/components/UnitShop.tsx
muju/src/components/VictoryScreen.tsx
muju/src/components/VisualKey.tsx
muju/src/game/board.ts
muju/src/game/building.ts
muju/src/game/legality.ts
muju/src/game/mining.ts
muju/src/game/promotion.ts
muju/src/game/resourceMap.ts
muju/src/game/turn.ts
muju/src/game/types.ts
muju/src/game/units.ts
muju/src/game/upkeep.ts
muju/src/game/victory.ts
muju/src/hooks/useGameState.ts
muju/src/index.css
muju/src/utils/persistence.ts
muju/tests/ai/correctness.test.ts
muju/tests/ai/engine.test.ts
muju/tests/ai/evaluation.test.ts
muju/tests/ai/map-value.test.ts
muju/tests/ai/moves.test.ts
muju/tests/ai/observation.test.ts
muju/tests/ai/placement.test.ts
muju/tests/ai/search-correctness.test.ts
muju/tests/ai/simulate-ids.test.ts
muju/tests/ai/simulate.test.ts
muju/tests/ai/static-value.test.ts
muju/tests/ai/turn-execution.test.ts
muju/tests/ai/upkeep-clock.test.ts
muju/tests/ai/worker.test.ts
muju/tests/game/audit-fixtures.test.ts
muju/tests/game/board.test.ts
muju/tests/game/building.test.ts
muju/tests/game/cleave.test.ts
muju/tests/game/home-victory.test.ts
muju/tests/game/mining.test.ts
muju/tests/game/promotion.test.ts
muju/tests/game/properties.test.ts
muju/tests/game/resource-map.test.ts
muju/tests/game/spawning.test.ts
muju/tests/game/tier3-cap.test.ts
muju/tests/game/turn.test.ts
muju/tests/game/units.test.ts
muju/tests/game/upkeep-draw.test.ts
muju/tests/game/victory.test.ts
muju/tests/hooks/pass-play.test.ts
muju/tests/lab/harness.test.ts
tools/smoke-site.cjs
```
