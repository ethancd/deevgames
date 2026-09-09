# Muju v2.0 — The Great Mining Simplification

You are working in the deevgames monorepo on Muju Hono Tanka (`muju/`). Base your work on production `master` at `/Users/ashkie/src/deevgames`, commit `16ccfd7` ("Draw after ten quiet player turns at turn end", spec v1.9). Follow the repository's stale-branch guard (commit `3b0dfed`). Create a fresh worktree at `/Users/ashkie/src/deevgames-muju-mining` on a new branch `codex/muju-passive-mining`. This is a source change and a lab study, not a production deployment; do not publish unless I explicitly ask afterward.

Read before touching anything: `muju/SPEC.md` (v1.9 — especially §2 turn order, §5.1 the well, §5.5 upkeep, the inactivity clock, and the §7 tables), `muju/JUDGMENT_LOG.md` (E-1..E-3, J-001..J-014), `muju/docs/UPKEEP_DRAW-2026-09-08.md`, `muju/docs/DRAW_TEN-2026-09-08.md`, `muju/docs/TIER3_CAP-2026-09-08.md`, `muju/docs/MAP_D_PLAYTESTS-2026-09-07.md` and `MAP_STUDY-2026-09-07.md` (the well-based economics you are replacing), `muju/docs/AI_IMPLEMENTATION_STATUS.md` (what the WASM kernel does and does not search), `muju/docs/ELEGANCE_COMPARISON-2026-09-09.md` (the design target: more consequential meanings per familiar decision), `muju/docs/DESIGN_REVIEW.md`, and the root `CLAUDE.md` rule that a design change is not complete until every related document reflects it.

## The rule change

Mining stops being an action and becomes a property of standing somewhere.

> **At the end of your turn, every one of your units takes crystals from the square it stands on: up to its Mining stat, up to what the square holds.**

That is the whole rule. Consequences, all of which must hold:

- The **mine action is removed.** There is no `MINE` action type, no `canMine`, no `hasMined`, no mining keyboard shortcut. The six actions are moves and attacks only.
- **Depth is removed.** A cell has one number, its reserve. There is no `minedDepth`, no "dry for this unit," no layers, no rope. A unit with Mining M on a cell with reserve R takes `min(M, R)`; the cell's reserve falls by that amount. Mining 0 units take nothing, ever.
- Every unit takes, unconditionally — units that moved, attacked, were placed this turn, or were promoted this turn all take at end of turn. There is no idle condition.
- Passive income is public (positions and stats are public), so it flows into `resourcesGained` exactly as mined crystals do now. Nothing about hidden information changes.
- **Map:** Unequal routes keeps its exact layout and 180° symmetry; reserves change from 0 / 3 / 4 / 5 to **0 / 4 / 8 / 10** (blank approaches, ordinary ground, shelves, rich wells and homes). Total **520** crystals. Update `src/game/resourceMap.ts`, its name/revision note, and the conservation tests.
- **Catalogue unchanged.** Mining stats stay exactly as v1.9 (Fire 1/1/1, Lightning 0/0/0, Water 2/2/3, Shadow 0/1/2, Plant 3/4/5, Metal 2/3/4); all other stats, costs, build times, Cleave, tier-3 cap, and elements unchanged.
- **Upkeep unchanged** (T1 0 / T2 1 / T3 2, T1 retained, keep-set choice when short). Income lands at the end of your turn and rent is paid at the start of your next one.
- **Inactivity clock:** a turn is quiet if it produced no enemy kill by attack **and no passive income at turn end** (total taken across all your units is zero). Positive income resets the counter exactly as a positive mine action does today. The ten-quiet-turn draw is otherwise unchanged.
- **Home occupation, elimination, resignation** unchanged.

Turn boundary order, end of turn: queue phase ends → passive mining resolves for the mover → inactivity counter updates and the draw check runs → next player's turn start (home occupation / elimination → upkeep → heal and queue advance → place). Passive mining is not undoable; undo stays within the turn as it does now.

Design rationale, for the spec, the judgment log, and the report: the well made the economy a sequence of one-shot draws whose total was fixed by the map, so the mining stat mostly changed how many actions a draw cost, and on three-layer ground a Mining-3 and a Mining-1 came out nearly even per action. Passive mining makes income a function of position — the same thing combat, rectangles, and home invasion are functions of — so one move can improve income, threaten a route, change spawn geometry, and affect home defense at once, which is the design target the elegance comparison names. The reserve scale 4 / 8 / 10 is chosen so that turns-to-empty separates the mining ladder across terrain classes rather than on any one cell: ordinary ground separates Mining 1 / 2 / 4 (4 / 2 / 1 turns), the shelf separates 2 / 3 / 4 (4 / 3 / 2), the rich wells separate 3 / 4 / 5 (4 / 3 / 2). Experts strip rich ground fast and must keep moving (an action per turn); foragers sit on cheap ground for free. Not being able to mine is now the only way a piece can cost and never pay. Under tier upkeep the expert's net income on rich ground is roughly a Muju's; the expert's value is tempo and denial plus its combat stats, and the study should say whether that is enough.

Record this as **J-015** in the house format, with the alternatives considered (worker-or-soldier idle condition; graded ore with action mining; deep-well gate at Mining 3; reserves doubled to 6 / 8 / 10) and why each was not taken.

## Implementation

Derive everything from `min(unit.mining, cell.resourceLayers)`; there should be one function that computes a unit's end-of-turn take and one that applies it for a player, used by the reducer, `ai/simulate`, the planner's simulated states, the harness, and the solver.

Touchpoints I know about; find the ones I don't, and list every file in the report:

- `src/game/mining.ts`: rewrite. Remove `calculateMiningYield`'s depth logic, `canMine`, `canMineAction`, `executeMine`, `isDryForUnit`, `getReachableResources`'s depth clause. Keep `getTotalBoardResources`. Add `endOfTurnIncome(state, player)` returning the per-unit takes and the new state.
- `src/game/types.ts`: drop `minedDepth` from `Cell`, `hasMined` from `Unit`, `MINE` from the action union; bump `SCHEMA_VERSION` (older unfinished games start fresh via the existing mismatch path — say so in the report).
- `src/game/board.ts`, `turn.ts`: end-of-turn hook; remove `hasMined` from `resetUnitActions`; the inactivity-counter update reads the income total.
- `src/game/legality.ts`, `src/ai/moves.ts`, `src/ai/simulate.ts`, `src/ai/planner/*`, `src/ai/evaluation.ts`: remove mine generation/application; `miningPotential` becomes projected end-of-turn income for the current positions (and, if cheap, one-move-ahead income); beam plans should see that a move onto fresh ore pays at turn end. Beliefs: passive income is public and deterministic, so hypotheses about the hidden queue subtract nothing new — confirm the conservation identity still holds in tests.
- WASM kernel `assembly/tactics.ts` and `lab/ai/fixtures.ts`: the kernel does not search mining today, but it carries `hasMined`-adjacent state and the "unnecessary mining" fixtures; remove both, keep the ABI version honest, rebuild with `npm run ai:wasm`, and keep the JS/WASM differential tests green.
- Lab harness and bots: every scripted bot has a `MINE` scoring branch (`lab/harness/bots/*.ts`, `lab/experiments/*-policies.ts`, `home-policies.ts`) — remove it, and make the `MOVE` scoring in Expand, Balanced, Turtle, AntiRush, MiningDenial, InvestT2/T3, RouteTech/RouteBasic and HomeTech prefer destinations by `min(M, reserve)` at the destination minus the reserve they leave behind. Telemetry: per player per round, passive income, crystals remaining on the board, units on zero-reserve cells, income by unit tier and element; per game, round at which 90% of the 520 is gone.
- Static solver `lab/solver`: replace the corridor-extraction model with a passive model — crystals per turn by unit on cells of 4 / 8 / 10, turns-to-empty, and the coordinated-kill and financing frontiers unchanged. `npm run balance:check` must still find 18 distinct profiles, zero same-tier dominance, and a sole-cheapest task witness per unit under the new task grid. Pin the v1.9 catalogue-plus-well model as `lab/solver/baseline-v1.9.json`. Do not tune any stat to make a witness appear; report gaps. `lab/maps` is a historical study of the well and stays frozen.
- UI: remove the Mine button and the M shortcut; the cell shows its reserve as a numeral (the five-slot gauge, sockets and rock marks go away — the reserve palette is now 0–10, keep it sequential and legible in grayscale on a 390px phone); the "Depths" toggle becomes a reserve-numeral toggle or is removed; the Key explains one number per cell and one per piece; the selected-unit panel shows "takes N here at turn end"; the move preview shows the destination's take; the action bar or resource display shows **projected income this turn** live as pieces move; the end-of-turn recap lists income by unit and total; the tutorial's mining page is rewritten from the catalogue and the map constants; the Combat/Cleave page drops "or mining between attacks."
- Docs: `muju/SPEC.md` → **v2.0 (2026-09-09) — passive mining, reserves 4/8/10**: rewrite §5.1 as three sentences, remove depth everywhere, update §1 (520 total), §2 (turn order with end-of-turn income), §4.2 (Cleave wording), the inactivity-clock clause, §8 (income is public), and the version history. `muju/docs/MINING_SIMPLIFICATION-2026-09-09.md` in the `UPKEEP_DRAW` voice: rule, rationale, every file touched, hypotheses registered before running, paired results with natural wins / draws / caps separate, adversarial review, limits, reproduction, test counts, "tested branch, not a production deployment." Supersession pointers at the top of `MAP_STUDY`, `MAP_D_PLAYTESTS`, `BALANCE_IMPLEMENTATION`, `UPKEEP_DRAW`, and `AI_IMPLEMENTATION_STATUS` where they describe the well. `lab/docs/SPEC_AUDIT.md` traceability for the new clauses. Add a note to `STRATEGY_HANDOFF-2026-09-08.md` that the strategy-guide curriculum's mining episode is obsolete under v2.0.

**Lab-only variants (do not ship), each behind a pinned injectable:** `actions-5` (`MAX_ACTIONS_PER_TURN` 5, since none of the six now go to mining), and `reserves-6-8-10` (the doubled map, for the ordinary-ground comparison).

## Lab study (register hypotheses first, then run)

Write these into the report before the first game:

1. **Pace.** Cumulative crystals extracted by round 5 / 10 / 15 and round-to-90%-exhaustion, shipped versus v1.9, per policy pairing. Expect a similar early economy (about 6/turn from the starters), a larger mid-game economy, and exhaustion around round 10–14.
2. **Ladder separation.** In InvestT2 and InvestT3 Plant lines versus mass-Muju, the share of shelf-and-well crystals taken by tier-2+ Plants exceeds their share of ordinary-ground crystals; mass-Muju out-earns on ordinary ground and loses on the wells. This is the hypothesis the 4/8/10 scale exists to satisfy; if it fails under `reserves-6-8-10` as well, the scale is not the reason.
3. **Expert net value.** Tier-3 Plant lines pay rent from rich-ground income and finish more games naturally than in v1.9 (their value is tempo and denial, not net income) — or they don't, and the report says so.
4. **Foragers.** In Fire rush versus AntiRush and Turtle, the share of the rusher's income earned by Mining-1 units standing on enemy-side ground; whether forward armies are now self-funding and whether that changes natural-finish rates.
5. **Denial.** MiningDenial (squatting) natural wins versus Balanced, Expand, and Turtle rise versus v1.9.
6. **Snowball and comeback.** Correlation between income lead at round 6 and natural win, shipped versus v1.9; the share of natural wins by the player behind in cumulative income at round 6.
7. **Clock.** Quiet-turn draws occur only after 90% exhaustion; report draw rate, cap rate (should stay near zero), and mean rounds by pairing.
8. **Actions.** Under `actions-5`, mean game length and natural-finish rate versus shipped; whether rush lines lose more than economy lines.
9. **AI.** The engine never leaves a Mining ≥ 2 unit on a zero-reserve cell while a fresh adjacent cell is free and no threat is adjacent; the search values a move onto ore; the AI's income per round tracks the scripted Balanced bot's within 20% at Medium.
10. **Fairness.** White's share in Balanced mirrors unchanged.

Run with paired seeds, both seats, natural wins / draws / caps separate, zero illegal actions and invariant failures required (add the invariant: total crystals on board + both players' gained ≡ 520):

- E13 main suite (24 pairings × 20 seed blocks × 2 seats) under shipped rules versus v1.9 control.
- E9 confirmation matrix (16 matchups × 200), shipped versus v1.9.
- The E11 investment pairings (InvestT2/T3 vs InvestT1, Rush, LightningRush, MiningDenial, HomeT3, Balanced) under shipped, `reserves-6-8-10`, and v1.9.
- One reduced pass (8 pairings × 20 blocks) under `actions-5`.
- The AI engine at Medium UI budget against Rush, AntiRush, Balanced, InvestT3, and MiningDenial, both seats, small N (hypothesis 9).
- Do not rerun the map-study or topology suites.

## Acceptance

`npm test` green (the current suite with the mining and depth tests rewritten, plus new tests: end-of-turn take by unit/cell combinations including Mining 0 and reserve 0; unconditional take for moved/attacked/placed/promoted units; order at the turn boundary and clock reset on positive income; conservation ≡ 520; map values and rotation; no `MINE` action is ever legal or generated; upkeep-after-income accounting; save round-trip and schema rejection; solver witnesses; harness telemetry), `npm run build`, `npm run ai:wasm`, `npm run balance:check`, `npm run balance:types`, `npx tsc -p lab --noEmit` and the home/map-d/ai lab tsconfigs, `MUJU_BASE_URL=… npm run test:e2e` on Chrome with new cases for the reserve numerals, the projected-income readout, the end-of-turn recap, the absence of a Mine control, and a tutorial page that matches the constants; WebKit for the new cases at 390×664; full-site `bash build-all.sh` and the 390px / 834px smoke checks.

Commit in the house style ("Replace the well with passive end-of-turn mining on a 4/8/10 map", then "Record mining simplification study"), push the branch, and stop. Summarize: the rule text as implemented, the ten hypotheses with results, the shipped / `reserves-6-8-10` / v1.9 comparison in one table, the `actions-5` result in one line, every decision you made that I did not specify, and anything you could not verify.
