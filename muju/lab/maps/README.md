# Five fixed mineral maps

This is a **local lab study**, not a change to the shipped game. The v1.3 unit catalogue, live board initialization, 10×10 board, six shared actions, mining-depth semantics, and spawning rules are unchanged.

## Run and inspect

From `muju/`:

```sh
npm run balance:maps
npm run balance:maps:types
npm run balance:maps:page # Playwright Chromium, or set CHROME_PATH
npm test -- tests/ai/map-value.test.ts tests/ai/static-value.test.ts
```

Open `lab/results/map-study-2026-09-07/index.html` directly in a browser. The page is self-contained and needs no server, external libraries or network. `comparison.md` is the numerical report; `comparison.json` contains all data, hashes and assumptions; individual A–E JSON files retain route witnesses. The generator overwrites only its named outputs. Preserve historical results before rerunning a changed model.

## Candidate design

- **A / Uniform wells:** original five layers everywhere, 500 crystals.
- **B / Five islands:** three-layer ground with identical deep 2×2 patches at four corners and center.
- **C / Two wings:** same depth histogram as B; move the non-home deep patches into a paired off-center expansion.
- **D / Unequal routes:** C plus compact four-layer shelves on one route and two-layer approaches on the other.
- **E / Braided frontiers:** staggered deep expansion wells, a medium shelf and secondary pockets, shallow approaches, modest center. This is the most elaborated candidate, not an assertion that every strategic aspiration has been established.

B–E each contain **340 crystals**. All retain five-layer starter/home squares and 180° symmetry. B also has reflection symmetries. The B→C contrast isolates placement with an identical histogram. C→D→E keeps total stock fixed while changing both placement and depth mix. A→others includes a 32% stock reduction; it does not isolate geography alone.

The actual rules are in `maps.ts`, in board coordinates with row zero at the top. `cells[y*10+x]` is total initial capacity; `minedDepth=0`. A fresh two-layer square is not equivalent to a five-layer square whose first three layers have been removed.

Rule-list length and neighboring depth changes are descriptive measures, not validated cognitive-complexity scores. D expands C's rules rather than hiding inherited complexity behind “start with C.”

## Exact regional mine routes

`mineRoute` exhaustively enumerates mine-event sequences, with movement cost `ceil(Manhattan distance / speed)` and one further action per extraction. Each well pays at most once to a fixed-mining unit. Non-mining movement can be compressed to shortest paths because the local model has no obstacles, adversary, other bodies or path-dependent effects. Movement may pass outside the district; mining may not.

Fresh-well yield is `min(M, capacity)`. The depleted counterfactual removes the top three layers everywhere first, so yield becomes `max(0, min(M, capacity) - min(3, capacity))`. This explicitly represents Muju's depth-access rule. It is not a forecast of a particular game's depletion pattern.

The result is exact only for an already-acquired, fixed-stat single unit mining in that district, starting at its named point or traveling from home (board index 11), over at most six actions. It includes a maximizing route and action cost. Speed/mining +1 comparisons hold other stats, starting point and district fixed; Mining remains capped at five. The independent test enumerator performs primitive move/mine actions instead of mine-event transitions.

## Opening income witnesses and upper bounds

The beam search uses the actual Fire, Water and Plant starting pieces, the same shared depletion map, collision-aware movement, and six actions per own turn. Enemy starters remain fixed and pass. Every reported route is replayed through production `isLegalAction` / `applyAction`, in both seats; the replay checks income, bank, promotions and final positions. These are unopposed economic probes, **not competitive match results**.

Policies:

- `bank`: keep the original three pieces and maximize gross extraction.
- `plant`: promote the starting Plant as soon as affordable at each placement phase; maximize gross extraction. This tests one investment policy, not an optimal mixed army.
- `home`: bank with all movement confined to the starting 4×4.
- `east`, `south`, `center`: bank with an explicit 0.4-point-per-square destination preference for at least one unit. Those scores are search guidance, not asserted crystal values. Results are not Pareto frontiers and do not mean the named region is established or defended.

Income plus a small one-step extraction heuristic selects the beam. Widths 64, 256 and 1024 are retained, and the best witnessed result for each horizon is kept across widths. Wider beams can discard a valuable narrower-beam path; the convergence table exposes this. Each horizon may have a different witness. Financing uses all income prefixes of **one final bank witness**, never a splice of incompatible best prefixes.

For unupgraded starters, an optimistic upper bound lets each piece mine `ceil(actions/2)` wells of its best reachable depth, ignores collisions and double counts shared wells. It then optimizes allocation of the shared action budget across all three pieces. This is valid because every mine after a unit's first requires at least one relocation action; its fixed Mining stat exhausts all layers it can reach on one visit. A feasible route matching this bound certifies income optimality in this restricted no-production/no-opponent model. It says nothing about investing, attacking, protecting, or opponent interference.

Reserve probes spend only 3/4/5 of each turn's six actions on the economy, to expose the opportunity cost of other duties. The reserved actions are not simulated defense. These use width 256 and remain lower-bound witnesses.

## Tier financing, roles, and spatial danger

The finance model follows one promotion line, prices upgrades by cost differences, queues non-starting T1s, respects build delays, pays income after placement, and forbids promotion on placement or twice in a phase. Income is stipulated from a bank route, with no income after its five measured turns. Purchase/upgrade feedback, new-unit traffic, opposing moves and competing spending are excluded. Report this as **conditional financed access**, never earliest actual playable access.

The role grid uses seven named districts, fresh and stripped mining, budgets 1–6, extraction thresholds 1–15, and all catalogue guards. It also asks for home-to-district occupation/survival and mixed travel/mine/strike tasks against catalogue targets. All units compete at their fixed full prices. Witness counts reflect grid construction, not frequency, matchup win rate or economic importance. The far district is needed to represent the speed-6 unit's long-distance niche; omitting long distances hid that niche even on A.

Geometry records district resources, start distances, corner-to-district spawn-rectangle area/resources, and an optimistic Radi travel cost to invade the rectangle. These calculations omit intervening pieces and purchases. Rotational replay proves corresponding legal opportunities; it does **not** prove fairness under alternating turns.

## Perturbation test

Swap two adjacent rotational orbits while excluding the starting 2×2 homes. This preserves total stock and the exact depth histogram. Re-run width-256 bank/Plant witnesses and replay their final paths through production rules. Compare the resulting range with the width-256 parent, not a different search width. Because search is approximate, differences may include optimizer sensitivity as well as map sensitivity.

No catalogue edits should be made to satisfy these measurements. First examine scenario relevance, alternative witnesses, missing constraints and adversarial responses.
