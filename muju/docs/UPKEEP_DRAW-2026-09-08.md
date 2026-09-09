> v1.8 correction: T1 units must be kept during upkeep. The study below records historical v1.6 behavior; its voluntary T1 release rule is superseded.

> v1.7 follow-up: Lightning I/II ATK is now1/2, Lightning III mining0, Metal III mining4. Measurements below preserve the earlier catalogue; see [balance follow-up](BALANCE_FOLLOWUP-2026-09-08.md).

# Tier upkeep and inactivity draw — September 8, 2026

Status: implementation and study verified. The user explicitly authorized publishing the combined tier cap + upkeep + draw on September 8 after verification. v1.6 was published from c3f2b7e at https://c5532b4c.deevgames.pages.dev and production deevgames.pages.dev/muju/. Live upkeep/draw/tiercap browser checks6/6 and full-site390/834 smoke passed. v1.7 supersedes only the four later requested stats.

## Registered before the first study game

The control is the final 18-unit catalogue (including Tanka Speed 2) with upkeep and the draw disabled. This isolates the new rules from the independently recorded 24→18 catalogue study. Historical v1.4 results remain in the tier-cap report and are not mislabeled as this control. Shipped is 0/1/2/3 rent; steep is 0/1/3/5, lab only. Both new-rule variants draw after 20 complete quiet player turns.

1. E13 safety caps approach zero, with the previous capped mass split between natural wins and inactivity draws.
2. Income leaders convert roaming-versus-home and investment-versus-home games into more natural wins; higher-tier home garrisons decay. Compare tier-2+ counts by round.
3. Free tier-1 swarms and Fire pressure gain against defensive/economy policies. Distinguish natural wins from draws and inspect rent releases.
4. Investment policies reach tier 3 later and pay meaningful rent before conversion. Check whether pressure defeats them naturally.
5. Free tier-1 invaders gain home-win share; compare garrison rent losses and combat losses.
6. Balanced mirror first-player fairness remains close to the paired control.
7. Twenty quiet plies exceed naturally finished control games' longest quiet stretch. Measure the full control distribution rather than assume this is true.
8. At Medium UI settings, upkeep decisions preserve affordable useful armies and the AI avoids an immediately preventable draw while ahead. This is a bounded test, not a proof of optimal play.

## Implemented interpretation

- Own turn start: home occupation, existing board elimination, inactivity draw, then upkeep, healing and build-queue advancement. The six-action budget is untouched by rent.
- T1/T2/T3 pay 0/1/2 from the existing bank. The schedule also defines historical T4 rent3. Queued units pay nothing until their next own turn after placement.
- All-keep is automatic when affordable. Optional per-player review exposes voluntary release even with enough cash, including free T1 units. A forced shortfall opens a keep-set choice. Empty army loses by upkeep elimination.
- Public committed and manifested spending both include paid rent. Voluntary release does not imply a low bank, so no poverty bound is inferred from a removal.
- A positive-yield mine or enemy attack kill immediately resets the public counter; that progress turn ends at0. A quiet completed player turn adds1. At20, draw follows existing wins and precedes upkeep. Chip attacks, movement, queueing, placement, promotion and release never reset it.
- This chooses 20 complete quiet turns over literal action-reset-then-unconditional-increment, which would display1 at the end of a progress turn.
- Save schema4 preserves pending upkeep and terminal draw reason; older saves restart through the existing version-mismatch path.
- AI keep-set enumeration retains free units, enumerates all affordable rent-bearing subsets through12 units, then uses deterministic cost/defense/attack/mining candidate sets. Real transitions apply rent throughout search; there is no arbitrary unit-value rent discount. Tactical proofs reject pending upkeep and are attempted again on paid boards.

## Validation and results

The hypotheses above were written before the pilot. Outcomes below were added after the recorded games completed.

## Paired results

All 9,280 scripted games used paired seeds and both seats with the same final18 catalogue, shared transition and strict legality. Every game passed resource conservation, ownership, occupancy and action-budget invariants. No illegal actions or no-op anomalies. The corrected turn-start telemetry rerun repeats these same seed blocks; it is not another independent sample.

| Suite | Rules | Attack elimination | Home wins | Upkeep elimination | Inactivity draws | Safety caps | Median round |
|---|---|---:|---:|---:|---:|---:|---:|
| E13 (960 each) | Control: no rent/draw | 302 | 398 | 0 | 0 | 260 | 21 |
| E13 | Shipped0/1/2 | 407 | 315 | 83 | 155 | 0 | 15 |
| E13 | Steep0/1/3 | 400 | 318 | 83 | 159 | 0 | 15 |
| E9 (3,200 each) | Control: no rent/draw | 2,516 | — | 0 | 0 | 684 | 19 |
| E9 | Shipped0/1/2 | 2,541 | — | 136 | 523 | 0 | 13 |

E9 deliberately retains its original elimination-only, uniform500 board to isolate regression in the tuning matrix. E13 uses Unequal routes and home occupation. These suites are not pooled to claim a global win rate. Full per-pairing splits are in [matchups](../lab/results/upkeep-draw-2026-09-08/matchups.md), with raw records, exact seeds, source hashes and the aggregate JSON beside it.

The260 previously capped E13 games became123 inactivity draws,97 attack eliminations,27 home wins and13 upkeep eliminations. Other pairings also change, so that paired split is more informative than subtracting overall totals. Steep yields four fewer natural wins and four more draws than shipped; this screen supplies no reason to prefer it.

## Hypothesis outcomes

1. **Safety caps: supported in this screen.** Zero caps in both new-rule suites. E13 natural wins rise700→805; E9 natural wins2,516→2,677. Draws remain a distinct result.
2. **Conversion: supported for the plain investment/home matchup, mixed elsewhere.** InvestT3/HomeT3 changes from40 caps to16 investor natural wins and24 draws. Mean final gross income is157.9 versus56.75 under shipped. The home side's mean tier2+ count is1.175 at round10 and0 at round20, versus1.65 and1.625 in control. Survivor counts are40 then37 under shipped: later averages condition on games still running. The aware/invading variant is less favorable: Invade:InvestT3/Aware:HomeT3 natural score23–2 with15 caps becomes19–19 with2 draws. This is not universal conversion success.
3. **Swarm subsidy: pressure gains are real but the exact proposed Tier1Spam matrix was not added.** InvestT3 versus Rush flips from33–5 natural plus2 caps to16–21 plus3 draws. The full E9 pressure/economy matrix is retained in the pairing table. Tier1Spam is tested against the real AI in both seats, not independently against every defensive policy; no result for an unrun cell is implied. Rent removes5,273 E13 units, making the loss of paid Cleave defenders observable. We do not claim every removal occurred just before a useful chain.
4. **Tech carrying cost: supported for E13, with selection effects.** Players reaching tier3 fall817→474; among those that reach it, median first round3→4 and mean5.17→5.54. Total E13 paid rent is23,066. InvestT3/HomeT3 pays4,351 across40 games. The investor no longer beats Rush naturally overall. E9's survivor-conditioned median is9→8, so later-tech is not universal and reaching-tier3 counts must accompany timing. RouteTech was not a separate cell.
5. **Free home invaders: supported; the stronger garrison-loss claim is not established.** Tier1 wins are201/398 (50.5%) in control and228/315 (72.4%) shipped. Radi wins122→137; MetalIII Tanka wins67→1, while MetalII Mazask wins47→71. This is a substantial strategic change despite unchanged stats. Across all armies rent losses5,273 are fewer than combat losses12,520; these totals are not a claim about a specially classified home garrison. Released-unit records include distance from home for subsequent inspection.
6. **Balanced mirror fairness: unchanged in the paired screen.** Each seat has6 natural wins and28 caps in control; under shipped each has12 natural wins and16 draws. The same result occurs under steep. One mirrored policy sample is not proof of first-player balance for all play.
7. **Twenty exceeds every natural quiet stretch: rejected.** Of700 natural control finishes, median maximum quiet stretch is1,95th percentile4, maximum21. Two mirrored Invade:Balanced games at seed2298459914 reach21 before naturally finishing. Those particular paired shipped games still finish by home occupation, but the historical21 establishes that the20 threshold can truncate genuine play. E9 control natural maximum is17. This is an explicit rule choice, not evidence that every quiet game is dead.
8. **AI: legality and focused decisions verified; strong army-sustainability claim not proved.** Twelve games at actual Medium UI budgets (4,000 ms shared per AI turn), one seed block against Rush, Tier1Spam, AntiRush, Balanced, HomeT3 and InvestT3 in both seats:5 wins,7 losses, no draws/caps/illegal actions/invariant failures. Three losses are upkeep elimination. The engine sees real rent transitions and chooses legal deterministic kept sets, but it still sometimes purchases an army it cannot sustain. A focused ahead-on-material clock19 test mines to avoid the draw; pending-upkeep proofs are rejected and a paid home-rescue board is proved. This is correctness evidence, not a claim that the AI never makes an avoidable strategic error.

## Adversarial review and decisions

- Voluntary release makes the prompt's proposed “removed unit proves bank below rent” inference unsound. It is deliberately not implemented.
- Selecting no paid units does not silently keep free units: the actual action explicitly names all kept IDs, so a human can release free units too. AI candidates retain free units and enumerate the meaningful rent-bearing choices.
- An opponent's queue stays hidden while public rent updates the same conservation identity. Paying rent never counts as mining or combat. The harness checks both committed and manifested identities after every action.
- Pending upkeep does not heal units, advance queues, permit promotions or permit skipping phases. Native and JS tactical solvers return unknown until the paid board exists. Their within-turn scope is unchanged; ABI3 remains valid.
- The clock is public and survives observation/redeterminization. Terminal evaluation and plan scoring return0 for draws. Win precedence and save round-trips have direct tests.
- Deterministic upkeep tie-breaking uses board coordinates, not random instance-ID suffixes. The bounded candidate fallback above12 paid units is a search limitation; actual human legality remains unrestricted.
- The map opening/financing helper subtracts rent before promotions so its cash witnesses continue replaying through current rules. No topology/map study was rerun.
- Earlier unfinished saves are discarded by schema4. Current pending choices and draws persist. Tutorial page ordering and browser fixtures are updated.
- The source branch retains the tier-cap branch name because the user added upkeep to the same authorized task. Spec/ruling numbers advance to v1.6/J-012/J-013 after the tier cap's J-011.

## Verification

- `npm test`:668/668,35 files, including19 new upkeep/draw/AI/harness tests.
- Full production build includes `npm run ai:wasm`, TypeScript and Vite; the three-game `bash build-all.sh` verifies successfully.
- `npm run balance:check`: all18 current catalogue roles have sole-cheapest declared mission witnesses, no static dominance. This test does not model rent and is not a balance guarantee under upkeep.
- Type checks: gameplay, lab, AI, map model, static solver, home, map-D and tier/upkeep experiment configurations pass.
- Chrome:39/39. New forced upkeep and inactivity-victory cases pass at390/834; existing320-wide and landscape fitting checks also pass after adjusting the resource-card layout.
- Tactical suite:30 positions,90 difficulty checks,54/54 proved rescues cleared by the real AI.
- WebKit:9/9 covering upkeep, draw, tiercap and Cleave.
- Full-site smoke:390/834, hub, Muju save, Forge skins and Oracle combat/refresh all pass.
- Rendered phone upkeep choice and tablet draw inspected for readable text, affordable confirmation and explicit result.

## Reproduction

Run from `muju/` with its locked dependencies installed. E13, per variant and shard0..3:

```
node --import tsx lab/experiments/e16-upkeep-e13.ts 20 SHARD 4 off
node --import tsx lab/experiments/e16-upkeep-e13.ts 20 SHARD 4 shipped
node --import tsx lab/experiments/e16-upkeep-e13.ts 20 SHARD 4 steep
node --import tsx lab/experiments/e16-upkeep-e9.ts SHARD 4 off
node --import tsx lab/experiments/e16-upkeep-e9.ts SHARD 4 shipped
node --import tsx lab/experiments/e16-upkeep-ai.ts
python3 lab/experiments/summarize-upkeep.py
```

Each harness process runs games sequentially and resets injectable knobs in `finally`. Separate shards may run in separate processes. E13 manifests carry source/catalogue hashes, seeds, pairings and dates. Raw records are gzip-compressed after verification; the summarizer supports both compressed and fresh plain outputs.

## Changed-file inventory

- `muju/JUDGMENT_LOG.md`
- `muju/SPEC.md`
- `muju/docs/AI_CORRECTNESS-2026-09-07.md`
- `muju/docs/AI_IMPLEMENTATION_STATUS.md`
- `muju/docs/BALANCE_IMPLEMENTATION-2026-09-07.md`
- `muju/docs/HOME_VICTORY-2026-09-07.md`
- `muju/docs/MAP_D_PLAYTESTS-2026-09-07.md`
- `muju/docs/TIER3_CAP-2026-09-08.md`
- `muju/docs/UPKEEP_DRAW-2026-09-08.md`
- `muju/e2e/ai-worker.spec.ts`
- `muju/e2e/cleave.spec.ts`
- `muju/e2e/mobile.spec.ts`
- `muju/e2e/upkeep-draw.spec.ts`
- `muju/e2e/visuals.spec.ts`
- `muju/lab/docs/SPEC_AUDIT.md`
- `muju/lab/experiments/e16-upkeep-ai.ts`
- `muju/lab/experiments/e16-upkeep-e13.ts`
- `muju/lab/experiments/e16-upkeep-e9.ts`
- `muju/lab/experiments/summarize-upkeep.py`
- `muju/lab/experiments/tsconfig-tier3.json`
- `muju/lab/harness/invariants.ts`
- `muju/lab/harness/legal.ts`
- `muju/lab/harness/runner.ts`
- `muju/lab/harness/types.ts`
- `muju/lab/maps/model.ts`
- `muju/src/ai/engine-v2.ts`
- `muju/src/ai/evaluation.ts`
- `muju/src/ai/moves.ts`
- `muju/src/ai/planner/scoring.ts`
- `muju/src/ai/simulate.ts`
- `muju/src/ai/state/observation.ts`
- `muju/src/ai/state/types.ts`
- `muju/src/ai/tactics/home.ts`
- `muju/src/ai/types.ts`
- `muju/src/ai/wasm/kernel.ts`
- `muju/src/components/AIConsole.tsx`
- `muju/src/components/GameScreen.tsx`
- `muju/src/components/InstructionsModal.tsx`
- `muju/src/components/UnitInfo.tsx`
- `muju/src/components/UnitShop.tsx`
- `muju/src/components/UpkeepPanel.tsx`
- `muju/src/components/VictoryScreen.tsx`
- `muju/src/game/board.ts`
- `muju/src/game/legality.ts`
- `muju/src/game/turn.ts`
- `muju/src/game/types.ts`
- `muju/src/game/upkeep.ts`
- `muju/src/game/victory.ts`
- `muju/src/hooks/useAI.ts`
- `muju/src/hooks/useGameState.ts`
- `muju/src/index.css`
- `muju/src/utils/persistence.ts`
- `muju/tests/ai/upkeep-clock.test.ts`
- `muju/tests/game/cleave.test.ts`
- `muju/tests/game/tier3-cap.test.ts`
- `muju/tests/game/upkeep-draw.test.ts`

Study outputs live under `muju/lab/results/upkeep-draw-2026-09-08/`: E13 off/shipped/steep manifests and raw games, E9 off/shipped raw games, AI games/summary, aggregate summary, matchup table, and per-round tier curves. Prior tier-cap results remain unchanged.

Implementation commit: `1b0d0ce8b255955ec1a16e47d548c2c751e51b48`.
