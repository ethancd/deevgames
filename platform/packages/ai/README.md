# @deev/ai

Generic game AI over `@deev/core`'s `GameDef` contract: alpha-beta minimax for
perfect-information games and re-determinized ISMCTS (information-set Monte
Carlo tree search) with particle beliefs for hidden-information games. Both
factories produce lab-compatible bots — no adapter layer, no casts.

```ts
import { makeMinimaxBot, makeIsmctsBot } from '@deev/ai';
import { runSeries } from '@deev/lab';

const bot = makeMinimaxBot(def, evalFn, { budget: 'hard' });        // perfect info, 2 seats
const bot2 = makeIsmctsBot(def, { beliefModel, budget: 'hard' });   // hidden info, 2 seats

await runSeries({ game: def, config, bots: [bot, bot2], games: 200, seedStart: 1 });
```

## Scope and hard requirements

**2-seat zero-sum only.** Both `makeMinimaxBot` and `makeIsmctsBot` are built
for exactly two seats playing a zero-sum game (one side's gain is the other's
loss). This is enforced, not just assumed:

- `makeMinimaxBot` throws at construction if `def.observe` is defined ("use
  makeIsmctsBot") and throws at `choose()`-time the moment a third distinct
  seat is observed (it discovers seats lazily — see `src/minimax.ts` — since
  `GameDef.seats()` needs a `config` that isn't available in this seam).
- Both bots throw immediately if handed an empty `ctx.legal` (a contract
  violation per `@deev/core`: legal is never empty for an acting seat).

Games with more than two seats, or non-zero-sum payoffs, are out of scope.
Passing one in gets a loud, immediate error — never silently wrong play.

**Deterministic-`apply` assumption.** Both algorithms assume `GameDef.apply`
is deterministic given its explicit `rng` argument — i.e., a chosen action
always leads to one of a small number of *known* successor states reachable
only through that rng stream, not an unbounded stochastic outcome the search
needs to average over. Minimax's negamax and ISMCTS's simulation/rollout both
walk a single successor per action. Games with heavy chance elements *within*
a single action (dice, hidden shuffles resolved mid-action) are not modeled by
either search — that's expectimax territory (a chance-node search averaging
over `apply`'s outcome distribution), which is **explicitly out of scope for
this pass** and named here as future work, not silently mishandled. Don't
point either bot at a heavily-stochastic `apply` and expect correct behavior;
it will run, but the search tree it builds won't reflect the real game.

**Synchronous `choose()`.** Both bots' `choose()` is a plain synchronous
function, matching lab's `ScriptedBot` contract. There is no worker/thread
wrapper in this package — if a consuming game needs to keep a UI thread
responsive during a `'max'`-budget search, that's a wrapper to build at the
call site (or a future pass here), not something this package provides.

**ISMCTS strategy-fusion caveat.** Re-determinizing every iteration (sampling
a fresh full world from the belief, then running one MCTS step against a
single shared tree) is the standard, practical approach to searching
information-set games — but it has a well-known limitation called *strategy
fusion*: the tree's statistics get blended across different information-set
worlds that a truly optimal player would sometimes play differently. This
package's ISMCTS makes that trade-off deliberately (it's the field's standard
practical answer, not a bug) rather than attempting a fully rigorous
counterfactual-regret-style solve. Expect strong, practically useful play —
not game-theoretically perfect play — in hidden-information games.

**Deferred: sharpener / engine-orchestrator layer.** muju's reference
implementation has two layers this package does not reproduce:
`src/ai/eval/sharpener.ts` (a tactical-sharpening pass that re-scores
near-terminal positions with cheap lookahead on top of the static evaluator)
and `src/ai/engine-v2.ts` (an orchestrator gluing belief update, planning,
search, and evaluation into one difficulty-driven engine object with its own
config/preset lifecycle, `setDifficulty`/`setWeights`/`setConfig` methods,
etc.). Both are real, useful patterns — documented here for a future pass —
but out of scope for this package, which stops at the composable primitives
(`composeEval`, `makeMinimaxBot`, `makeIsmctsBot`, `beamSearchPlans`) a game
or a future orchestrator layer can build on.

## Provenance

| Module | Provenance |
| --- | --- |
| `bot.ts` | New — `AiBot` extends `@deev/lab`'s `ScriptedBot` with `lastSearch` diagnostics. |
| `budget.ts` | New — generalizes muju's `AIEngineV2`/`DIFFICULTY_PRESETS`/`DIFFICULTY_CONFIGS` (`src/ai/engine-v2.ts`, `src/ai/types.ts`) into algorithm-agnostic pure-number presets. |
| `eval.ts` | New combinator generalizing muju's named-factor `evaluatePosition`/`DEFAULT_WEIGHTS` pattern (`src/ai/evaluation.ts`, `src/ai/types.ts`); `optionalityFactor` is the `.claude/skills/minimax-ai` optionality principle made generic. |
| `minimax.ts` | New — alpha-beta negamax per the `minimax-ai` skill, adapted to `GameDef`'s `toAct`-driven turn model; opt-in transposition table keyed by `@deev/core`'s `stateHash`. |
| `planner.ts` | Ported from muju's `src/ai/planner/{beam,types}.ts` (`beamSearchPlans`, `TurnPlan` → `Plan`), generalized over any action type; `mergePlans` generalizes the beam's own dedupe step. |
| `belief.ts` | Ported from muju's `src/ai/belief/{particle,types,update}.ts`, generalized from the game-specific `OpponentParticle`/`BeliefState` to `Particle<H>`/`BeliefState<H>` over an opaque hidden type. |
| `ismcts.ts` | Ported from muju's `src/ai/search/{uct,mcts,redeterminize}.ts` + `engine-v2.ts`'s determinize→search→aggregate flow, generalized over `GameDef` and fixed in two deliberate ways (below). |

Muju (`muju/src/ai/**`) is reference-only and was never modified.

### Deliberate fixes over the muju reference

- **Progressive-widening order.** muju's `search/uct.ts` takes
  `[...node.children.values()].slice(0, maxChildren)` — plain `Map` insertion
  order, an accident of expansion order, not a designed prior ranking. This
  package's `selectChild` explicitly sorts candidates by prior score
  descending before slicing to the top-`maxChildren`, so progressive widening
  actually widens toward the most promising moves first.
- **Root expansion.** muju's tree (root included) expands lazily, one child
  per visit. This package seeds the *root* fully upfront (every candidate
  plan gets a zero-visit child before the first iteration) so
  `lastSearch.root` always reports the complete candidate set — including
  when no planner is supplied, where root arity must equal `ctx.legal`'s
  length. Deeper nodes still expand lazily, matching muju.

### Belief update: the house pattern

When a game exposes deterministic public deltas (a revealed card, a public
resource gain), every particle should be updated by that exact delta — it's
known, not sampled. A public event that implies a *known spend* from hidden
resources should hard-filter particles that can't afford it (they're
falsified, not merely less likely). `BeliefModel.observe` returning `null`
means exactly that: this particle is now infeasible. The default policy when
a filter empties the particle set is to **reinitialize** from `sampleWorld`
(the caller has genuinely lost track and should say so via a fresh sample,
not misinform itself further) — muju's own `belief/update.ts` instead keeps
the stale pre-filter set on empty (`particles.length > 0 ? particles :
belief.particles`); that's noted here as the one deliberate divergence.

## Modules

- `bot.ts` — `AiBot<O, A>`, `SearchInfo<A>` diagnostics shape.
- `budget.ts` — `SearchBudget`, `MINIMAX_BUDGETS`/`ISMCTS_BUDGETS` presets,
  `resolveBudget`. Difficulty is a budget (search depth/iterations/time),
  never a rules change — enforced by `SearchBudget` being pure numbers.
- `eval.ts` — `EvalFactor`, `composeEval` (a callable carrying `.factors`,
  `.with(overrides)`, `.explain(state, seat)`), `normalizeAdvantage`,
  `optionalityFactor`.
- `minimax.ts` — `makeMinimaxBot`. Iterative deepening when `budget.maxMillis`
  is set, a single fixed-depth search otherwise. `VICTORY = 1e9` is a large
  *finite* magnitude, not `Infinity`, so score arithmetic (negation,
  averaging in reports) stays finite. `searchRoot` (the underlying
  alpha-beta/no-pruning-toggle function) is exported for this package's own
  tests but not re-exported from `index.ts` — search internals are private.
- `planner.ts` — `Plan`, `TacticalTemplate`, `beamSearchPlans`, `mergePlans`.
- `belief.ts` — `Particle`, `BeliefState`, `createBelief`,
  `effectiveSampleSize`, `maybeResample` (systematic resampling),
  `sampleParticle`, `BeliefModel`.
- `ismcts.ts` — `makeIsmctsBot`. Per `choose()`: if the belief model supplies
  both `deriveEvents` and `observe`, the bot diffs the previous view against
  the current one and updates its own internally-held particle set before
  sampling; otherwise (and always for the very first choose() of a game) it
  samples straight from `beliefModel.sampleWorld`. UCT selection uses a prior
  bonus that decays as `prior / (1 + visits)`, with progressive widening
  capping the candidates considered to the top `⌊max(1, visits^0.5)⌋` by
  prior. **`evaluate()`/`def.score()` should return roughly-normalized
  values** (e.g., in the ballpark of `[-1, 1]`, matching how the terminal-only
  default behaves) — the UCT exploration constant is tuned for that scale;
  an unbounded evaluator (hundreds or thousands, the way some static
  evaluators are scaled) will swamp the exploration term and can lock the
  search onto the first plausible-looking move well before it's actually
  explored the alternatives. See `tests/fixtures/hidden-duel.ts`'s `score()`
  for a worked example of normalizing a tricks-based evaluator this way.
- `index.ts` — the two factories plus the composition toolkit
  (`composeEval`, `optionalityFactor`, `beamSearchPlans`, `mergePlans`,
  belief primitives, budgets). Search internals (`searchRoot`, ISMCTS's tree
  node shapes) are intentionally not exported here.

## Testing notes

All tests are seeded; determinism tests pin `iterations`/`maxNodes`/`depth`
and never use `maxMillis` (wall-clock budgets vary by machine). Fixtures live
in `tests/fixtures/`: `tic-tac-toe.ts` (perfect info), `nim.ts` (perfect info,
XOR ground truth via `nimValue`, written standalone — not shared with
`examples/pebble-duel` or `@deev/lab`'s own nim-shaped fixture, to avoid a
workspace cycle), `hidden-duel.ts` (hidden info: a 6-card, 3-trick duel with
`exactBelief`/`wrongBelief` belief models — see the fixture's own comments
for why the deal is re-dealt from the engine rng per game rather than fixed
by config, and why `wrongBelief`'s error is "forgets to exclude the seat's
own hand from the unknown-card pool" rather than an arbitrarily-contrived
mistake).

The belief-sensitivity test (`exactBelief` vs `wrongBelief`, head-to-head)
needs a larger game count (2000) than the other CI-based tests: most plies in
a 3-trick hidden-duel hand are forced or near-forced (a hand with one card
left has no real choice at all), so only a handful of decision points per
game are actually belief-sensitive, making the aggregate win-rate gap real
but small. It still finishes in well under 10 seconds at a light iteration
budget.
