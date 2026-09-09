# Muju static value solver — v2.1

This is a pre-playtest instrument, not a universal unit rating or a game-playing
bot. Run from `muju`:

```sh
npm run balance:static
npm run balance:check
npm run balance:types
npm test -- --run tests/ai/static-value.test.ts
```

Outputs are `lab/results/current-static/current.json` and `.md`, including
catalogue/model hashes and explicit witnesses. `baseline-v1.9.json` pins the
exact pre-change catalogue source, well solver source and map source from
`16ccfd7`. Earlier baselines/results remain historical. To reproduce them, use
their recorded commit; current CLI rejects old rule variants instead of
silently applying the passive model to a historical comparison.

The model measures:

- **Distinctness:** full stat/cost/element profiles; strict same-tier dominance
  compares identical elemental relationships. It excludes build times, which
  are no longer a rule.
- **Role witnesses:** cheapest qualifying units across strike, collect and
  anchor tasks. Passive collection tasks span reserve 4/8/10, finite horizons
  and quotas; there is no action charged for mining. A strike can require
  income at the ending position, with movement/attack costs unchanged. Each
  current unit has a sole-cheapest witness in this declared grid. Counts depend
  on the grid and do not measure mission frequency, counterplay or total value.
- **Finite income:** `passiveCurve` repeatedly takes `min(Mining,remaining)`
  while stationary; cumulative income is `min(initial reserve, Mining×turns)`.
  `turnsToEmpty` is `ceil(reserve/Mining)` for positive Mining, 0 for empty
  cells and no finite result for Mining 0 on ore. No corridor action-mining
  optimization or depth access remains. Relocation, traffic and competing
  miners belong in the game study.
- **Combat frontiers:** elemental attack, discrete movement thresholds and
  cost/actions/bodies Pareto frontiers for coordinated kills. These are local
  bounds with up to four approach lanes; they ignore traffic and casualties
  en route. Chip damage must complete inside the defender's exposure window.
- **Financing:** `accessTimeline` uses explicitly stipulated external end-turn
  income, starting Fire/Water/Plant exemplars, rent before Place, tier-1 buying
  and at most one promotion per later own turn. A unit unable to pay rent is
  released and must restart the climb. It does not predict an entire opening
  or grant that income independently to all lines in the same game.

Tests compare elemental powers to combat, finite-cell income to the game rule,
small kill frontiers to exhaustive enumeration, financing to explicit timing,
and preserve a sole-cheapest witness per unit. `balance:check` currently finds
18 distinct profiles, zero same-tier dominance and zero missing sole witnesses.
No stat was tuned to obtain these results. The frozen `lab/maps` study is not
rerun or rewritten; its old well model must be used at its recorded commit.
