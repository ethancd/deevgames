# M5 suite engineering floors — preregistration v2

Supersedes `M5-FLOOR-PREREGISTRATION-v1.md`, which is frozen and unedited. v1
fixtures stay byte-identical; nothing in this document changes a v1 case, a v1
classification or the v1 floor contract. v2 is a new manifest with a new
manifest hash, new fixtures under `fixtures/v2/`, and a new floor-contract
schema `muju-phasing-suite-floor-v2`.

## What was already known when this was written

This is written after the v1 measurement ran and after two independent reviews
of it. That is the whole reason the floor rule below is mechanical rather than
judged. Specifically, the author of this document had available, and states
plainly:

- **The v1 bundle measurement was executed.** Its per-family earned counts
  therefore exist and could have been used to set v2 floors. They must not be,
  and the rule in "Floors" makes that impossible to do quietly.
- **Both independent reviews were read**, including their findings that the
  summon-disruption and invariants families were unfit to gate anything, and
  their per-case lists. Those findings define the v2 authoring work below.
- The author of this document did **not** open the v1 per-case outcome rows
  (`fixtures/v1/cases.jsonl` or any measurement `result.json`) while writing
  it. That is a statement about this document only. It is not a claim that the
  v1 outcomes are unknown to the project — they are known, which is exactly why
  no v2 floor may be derived from an observed count.

## Floors

**Rule: v2 reuses the v1 ALLOWED-MISS budget per family, applied to the v2
offered counts.** The allowed-miss vector is the v1 offered count minus the v1
`minimumEarned`, recovered from the frozen v1 preregistration:

| Family | v1 offered | v1 minimum earned | **Allowed miss (v2 budget)** |
|---|---:|---:|---:|
| tactics | 63 | 57 | **6** |
| invariants | 18 | 17 | **1** |
| home-mate | 28 | 28 | **0** |
| economy | 20 | 20 | **0** |
| summon-disruption | 14 | 13 | **1** |
| home-fortify | 6 | 6 | **0** |

A v2 contract therefore declares `allowedMiss`, not `minimumEarned`. The
enforced floor is derived at validation time:

```
minimumEarned[family] = offered(v2 manifest, family) - allowedMiss[family]
```

`contract.ts` pins the vector as `V1_ALLOWED_MISS` and refuses any v2 contract
whose `allowedMiss` differs from it, in either direction. A v2 floor cannot be
loosened to fit an outcome without changing committed code and the pin that
this document names, which is a visible act rather than a quiet edit.

The offered counts will change: v2 removes or re-authors defective decisions
and demotes three invariant pairs to diagnostics (below). The budget does not
change with them. A family that loses offered units keeps the same number of
permitted misses, so the floor tightens in proportion — which is the correct
direction once the unfit cases are gone.

## Why v1's disruption and invariants families could not gate

### 1. Nine disruption decisions sat on an uncredited mover win

Reproduced canonically in this worktree by
`lab/hard-ai/suites/phasing/veto.ts` and pinned by
`tests/lab/suites-phasing-veto.test.ts`:

- **Eight roots mate inside the mover's own Act.** In
  `M5-SD-01/02/03/04/06/07/09/18` the Black raider walks to A1 in two or three
  moves; `END_ACTION_PHASE` settles into Prepare, `resolveHomeCheckmate` finds
  no White rescue, and the macro endpoint is `victory/home-checkmate`. The
  accept predicate is `all(game-phase playing, army ≥ 1 both sides,
  summon-resolution disrupted)`. Winning the game scores **zero**.
- **The ninth, `M5-SD-28`, is worse than first recorded.** The earlier text
  here said the occupation was answerable and only converted to
  `victory/home-occupation` one hand-off later, under the intruder-survival
  horizon. That was an artefact of the narrow probe. With the two-stage
  enumeration below, `M5-SD-28` **mates at v1's own `first-handoff-or-terminal`
  horizon**: the raider reaches A1 in three moves, `END_ACTION_PHASE` settles
  into Prepare, and **one promotion of the raider** puts it beyond White's
  reply, so `resolveHomeCheckmate` awards `victory/home-checkmate` on the
  promotion. Six such lines exist from that root. The conversion at the
  extended horizon is still there as well. This is the one v1 macro-decision
  the wider enumeration flags that the narrow one did not; re-running the probe
  over all 131 v1 macro-decisions found no other, and removed none.

### 2. Four tactics decisions carried the same free win

`phasing-tactics-two-lanes-{fire_2,shadow_1}-vs-water_2` and
`phasing-tactics-two-lane-approach-{fire_2,shadow_1}-vs-water_2`. The spare
lane unit `u2` walks to the enemy home corner `{x:9,y:9}` in three or four
moves and mates there while `u0` is never touched; accept requires
`target-removed@1` with `cause: own-act-attack`, so the win scores zero.

### 3. Eight home-mate invader decisions, found by the veto and by neither review

`phasing-{promotion-dependent-rescue,public-bank-no-promotion-money,
newly-placed-unit-cannot-promote,at-most-one-promotion}-mate` and their
`-rotated-black-mate` twins. The invader can simply eliminate the defender's
last unit. `home-defense@1` refuses a terminal snapshot ("home proof requires a
playing snapshot"), so an outright win scores zero. These are re-authoring work
in the same class as the nine and are recorded here so they are not lost.

### 4. All 18 preference pairs gated on a static evaluation

`primaryMetric: 'eval-gap'` compares the tested engine's own full-evaluation of
two positions. A static-eval probe cannot gate a search engine: it measures the
leaf function, not the thing being released, and an engine can search correctly
while its static evaluator orders two quiet positions the other way.

## v2 authoring contract

These are requirements on the v2 bundle, not on v1.

### Free-win veto (author-time, mandatory)

Every `macro-decision` is refused unless the root mover has **no** winning line
its own accept predicate would leave uncredited. A line is flagged when either

- the settled endpoint is `victory` with `winner === root mover`, or
- the state establishes a home occupation whose Prepare snapshot is `mate`
  under `analyzeHomeDefenseEvidence` at the canonical 20 000-node proof budget

**and** `evaluateDecision` does not score that line as a pass. Cases declaring
`terminalPolicy: 'allow-root-mover-win'` pass by construction, not by
exemption: their accept credits the win, so `evaluateDecision` returns pass and
nothing is flagged.

**The enumeration has two stages, because a Phasing turn has two phases.** A
turn is Act (four AP of MOVE/ATTACK) → `END_ACTION_PHASE` → income and upkeep →
Prepare (`turn.phase === 'place'`, `actionsRemaining === 0`) →
`END_PLACE_PHASE` → hand-off, and `resolveHomeCheckmate` refuses to award a
mate while `turn.phase !== 'place'`. **Every** home-checkmate win is therefore
awarded at the Prepare boundary, after the mover's own upkeep has had its
chance to release the occupier.

The first implementation of this veto was a single BFS bounded by
`root.turn.actionsRemaining` over MOVE and ATTACK, completing each line with
pass-only phase ends. An independent review found it blind in two ways, and
both are fixed here:

1. On a **Prepare root** it expanded nothing at all — canonical Phasing sets
   `actionsRemaining` to 0 on entering Prepare, all six v1 Prepare roots have
   AP 0, and the loop `continue`d at `depth === actionsRemaining`, so its
   `PROMOTE_UNIT` branch was dead code.
2. From an **Act root** it never tried enter-the-corner-then-promote (the
   HOME_FORTIFY motif), because the pass-only completion never promotes.

**Stage 1** is the Act BFS over MOVE/ATTACK, bounded by `actionsRemaining`
(sound, because no legal MOVE or ATTACK costs zero AP). **Stage 2** takes every
Act endpoint at which the mover occupies the enemy corner — and a Prepare root
directly — applies `END_ACTION_PHASE`, and then the canonical upkeep: when a
`PAY_UPKEEP` choice is pending it enumerates **every affordable keep-set**
(`upkeepActions`), because *releasing* a unit is how a mover frees the crystals
a mating promotion costs. **Stage 3** searches the legal `PROMOTE_UNIT` subsets
of the resulting Prepare snapshot. Canonical allows at most one promotion per
unit per placement phase (`canPromote` refuses `promotedThisPlacement`), so a
subset is a choice of units; `applyAction` re-adjudicates home checkmate after
every one of them, so the probe tests for a win **after each promotion** and
again at `END_PLACE_PHASE`, not only at the end of a subset. Elimination wins
and wins by the defender having no legal rescue are both covered: the first at
the Act node, the second by the Prepare adjudication.

Stage 2/3 runs exactly where the mover occupies the enemy corner. That is a
completeness claim, and it is this: inside the mover's own turn the canonical
routes to a mover win are elimination by an Act ATTACK (seen at the Act node),
home checkmate at the Prepare boundary, and home occupation at the mover's next
`startTurn` under the declared horizon. The last two both require a mover home
occupier, and upkeep only ever releases the *mover's own* units, so neither
upkeep nor promotion can eliminate the defender.

**Bounds, all of which fail closed.** Hitting any of them refuses the case; an
exhausted probe is never read as a clean bill of health.

| Bound | Value | On exhaustion |
|---|---:|---|
| canonical states expanded | 200 000 | refuse, naming the budget |
| home-defence proof nodes | 20 000 | canonical `unknown` ⇒ not a mate |
| rent-bearing units for keep-set enumeration | 12 | refuse, naming the bound |
| promotable units for promotion subsets | 12 | refuse, naming the bound |

The two 12-unit bounds match canonical `upkeepActions`, which is exhaustive up
to twelve rent-bearing units and degrades to four heuristic sets above it; the
probe refuses rather than search a proper subset of the mover's own choices.
Re-run over all 131 v1 macro-decisions, no case hit any bound.

**Re-run over v1 (code only; no fixture byte changed).** Old probe: 20 roots
flagged. New probe: **21** — the same 20, plus `M5-SD-28-home-blocks-all-
rectangles`, whose six flagged lines are all `stage: 'prepare'`,
`reason: 'home-checkmate'`, each ending in a `PROMOTE_UNIT`. Nothing was
un-flagged.

Out of scope, stated so it is not mistaken for coverage: `BUY_UNIT` in Prepare
(a commitment cannot arrive before the mover's next turn, and home blocks every
purchase rectangle), and a win produced by the scripted pass-only continuation
starving the defender's upkeep.

Implemented in `lab/hard-ai/suites/phasing/veto.ts`; pinned by
`tests/lab/suites-phasing-veto.test.ts`, which carries four constructed roots
(a Prepare root with a one-promotion mate, an Act root that enters then
promotes, a two-promotion fortify mate whose one-promotion variant is provably
still a `rescue`, and a root whose mate is only affordable after an upkeep
release), each of which the previous implementation reported as clean.

### Intruder survival (summon-disruption)

Every disruption decision takes a scripted `pass-only@1` horizon of **at least
one additional hand-off**, and its accept requires the intruding unit to be
**present at the endpoint**. A raid that disrupts a commitment and is then
released by its own upkeep, or answered, no longer scores.

The support exists in `format.ts` as `INTRUDER_SURVIVAL_HANDOFFS`,
`intruderSurvivalHorizon()`, `intruderPresentFact()`,
`requiresUnitAtEndpoint()` and `assertsIntruderSurvival()`. It is deliberately
**not** enforced inside `validateSuiteDocument`: the v1 documents must keep
loading byte-identically and no v1 disruption case carries it, so a v2 builder
calls the checker per case instead. Both halves are required together —
`assertsIntruderSurvival` is false for a horizon without the fact and for the
fact without the horizon — and inside an `any-of@1` accept the fact must appear
in **every** branch, or one branch would score a raid whose intruder is gone.

Note the correction the two-stage veto forces on the earlier text: `M5-SD-28`
is refused at v1's own horizon, so extending the horizon is not what exposes
it. The two requirements are still independent and both still apply.

### Multi-answer tactics cases

The four "plugged" tactics cases are positions with several equally valid
targets scored as if one were canonical. v2 either widens accept to an any-of
over the equally valid targets, or states the canonical argument for uniqueness
in the case rationale. Scoring one of several correct answers as the only
correct answer is not permitted to stand.

`any-of@1` is implemented in the predicate schema and evaluator. It passes when
**any** branch passes; with no passing branch, an unresolved branch makes the
whole predicate `indeterminate`, so an exhausted proof can never be silently
read as a miss. A budget proof may not hide inside one — `containsBudgetProbe`
recurses through `any-of@1`, so a decision or a scored pair that smuggles one
in is refused exactly as before.

### Invariants: split into a gating searched part and a non-gating diagnostic part

Chosen over "make every pair searched", because three pairs should not gate on
any metric — their own rationales say so.

**Gating (15 pairs, `primaryMetric: 'search-gap'`, fixed work 120 000 per
member, seed 1, desktop, EMPTY_BOOK):** invariants 1, 2, 3, 4, 5, 6, 7, 8, 10,
12, 14, 16, 17, 19, 20. Each violation is a canonical fact about the position
under Phasing timing — recruitment area, mobility, reach-and-retreat inside
four AP, finite reserve consumption, a rectangle voided by an actual intrusion
line, rent that cannot be paid after promotion, arrival-batch blocking, the
inactivity clock — not a transferred Standard-era heuristic. `eval-gap` is
still computed and reported for all of them as a diagnostic.

**Diagnostic, non-gating (3 pairs, offered 0):**

- **inv11 `home-bare`** — its own rationale calls the preference "an authored
  defense heuristic, not proof that a single plug guarantees safety". A
  heuristic may not gate a release.
- **inv13 `turtle`** — "Preference for expansion is a declared strategic
  comparison, not a theorem that greater area always wins."
- **inv9 `chip-across-turn`** — the rationale states outright that the case
  "does not demand a strict weighted preference between two otherwise identical
  healed boards", while v1 scored exactly that strict preference. The canonical
  content (a chip heals at the victim's incoming turn; the relocation mines 2
  before outgoing rent) is preserved as a diagnostic.

Structural invariants 15 and 18 keep `primaryMetric: 'none'` and earn nothing,
unchanged. Invariants offered falls 18 → 15; the allowed-miss budget stays 1,
so the invariants floor becomes 14 of 15.

**What "diagnostic" means mechanically.** `classification: 'diagnostic'` is a
third value on an invariant pair, alongside `preference` and `structural`, and
it is now implemented end to end:

- `decisionUnits` returns 0, so `describeCase` writes `offered: 0` and
  `validateManifestShape` **refuses** a manifest that gives a diagnostic an
  offered unit. It cannot enter any family denominator.
- `scoreCase` still records the reading — `metrics.evalGap`, `metrics.searchGap`
  when searched, `metrics.primary`, `metrics.work`, `metrics.classification`
  and `metrics.gating: false` — and does **not** convert it into a pass/fail
  predicate. The identical negative gap that makes a `preference` a miss leaves
  a `diagnostic` passing on its premises alone, and a positive gap earns it
  nothing either: it is outside the denominator in both directions.
- `aggregate` collects those readings into `summary.diagnostics` so a demoted
  pair stays visible in the summary, and refuses any result that claims
  `metrics.gating` under a diagnostic descriptor.
- The **premises are unchanged gates.** A diagnostic pair whose canonical
  premise is false still fails author evidence and still invalidates the run.
  Demotion drops the preference claim, not the canonical content.

`validateSuiteDocument` requires a diagnostic to name a metric (a diagnostic is
measured, so `primaryMetric: 'none'` is refused), requires a `search-gap`
metric — preference or diagnostic — to name the **fixed work per member** it is
measured at, keeps invariants 15 and 18 structural, and refuses a budget proof
in the premise of anything that carries a metric.

`search-gap` scoring follows the search and not the static evaluator: a
positive `eval-gap` cannot rescue a negative `searchGap`, and a missing search
reading is `status: 'error'` with `primary-search-missing`, never a skipped
row. This is wiring only — no measurement is taken here.

### Floor-contract integrity

`declaredAt` is a string written by whoever writes the contract and proves
nothing. v2 binds the contract to git. Before any case runs, `measure.ts`:

1. resolves the contract file's last commit reachable from `HEAD`, refusing an
   untracked contract outright — this is what stops a v2 measurement until the
   coordinator commits the contract;
2. refuses unless that commit is an **ancestor of HEAD**;
3. refuses unless its **committer date precedes the run start**;
4. refuses unless the bytes read equal `git show <commit>:<path>`, so a
   working-tree edit cannot be measured;
5. records `{ commit, committedAt, path }` in `started.json` and `result.json`
   alongside `weightsSha256` and `engineSourceSha256`.

A v2 contract additionally **preregisters the build**: `engineSourceSha256` and
`weightsSha256` must equal the adapter's identity or the run is refused. A
floor declared against one build cannot be met by another.

#### What that list does NOT prove, and what was added

An independent review found the binding above defeatable, and it is right.
`%cI` is whatever `GIT_COMMITTER_DATE` said, so check 3 is an assertion by the
person being checked; an `amend` or `rebase` after an off-record run produces a
new commit that passes checks 1, 2 and 4 unchanged; and nothing above stops the
contract being committed in the same commit as the numbers it is supposed to
predate. None of that is fixable by looking harder at dates.

There is **no remote push permission in this task**, so a remote-tracking
witness cannot be *required*. It is implemented as the strongest available
tier, and the tier is recorded and printed rather than assumed:

| Tier | Condition | What it proves | What it does **not** prove |
|---|---|---|---|
| **A — `remote-tracking`** | `git branch -r --contains <contract commit>` is non-empty | A copy of that exact commit object exists in a fetched remote-tracking ref. An amend or rebase yields a different id that the ref no longer contains, and the mismatch is visible to anyone who fetches. | **When** the remote received it. That no measurement was run before the push. That the remote is trustworthy. |
| **B — `local-only`** | otherwise | That the bytes measured are the bytes committed, and that the commit is an ancestor of the measured HEAD. | **Anything about time.** An amend or rebase after an off-record run passes every check in this tier. |

`result.json` carries `witnessTier` and a `witness` sentence at the **top** of
the record, not buried inside `contractCommit`, and the runner prints
`WITNESS: local only` for tier B before its JSON summary.

**Defences that do not depend on trusting the clock**, all refusals:

- **Blob identity.** The contract's working-tree blob hash (`git hash-object`)
  must equal `git rev-parse <commit>:<path>`, in addition to the byte compare.
- **No results in the contract commit.** `git show --name-only` on the contract
  commit must touch no path under a `results/` directory and no
  `result.json` / `cases.jsonl` / `started.json` / `failure.json` /
  `measurement-ledger.jsonl`. A preregistration may not be committed together
  with its own numbers. The same contract committed on its own, with the
  results in a later commit, is accepted.
- **First measurement only.** If a `result.json` for the same manifest hash and
  the same contract file already exists anywhere under a `results/` directory,
  or if the ledger already carries this manifest under this contract commit,
  the run is refused. A re-run needs a new contract version.
- **Build identity.** The engine source hash and weights hash must equal those
  named in the contract (`assertContractBuild`), as above.
- **Append-only hash-chained ledger.** Every measurement that produces a
  `result.json` — including an invalid one and one that misses its floors —
  appends one line to
  `lab/hard-ai/suites/phasing/measurement-ledger.jsonl` carrying the manifest
  hash, contract commit, contract blob hash, contract file hash, engine source
  hash, weights hash, witness tier, start time and result hash, plus `prev`
  (the previous line's chain value, or `GENESIS`) and `chain =
  sha256(prev + stableJson(entry))`. `measure.ts` re-derives every earlier
  line's chain **before** the run and refuses on any break — an altered,
  reordered, removed or non-JSON line. The file is a `.jsonl` inside the suite
  directory precisely because `artifactPins()` walks only `.ts` there, so
  recording a measurement cannot invalidate the manifest of the measurement
  being recorded.

Each refusal is pinned by `tests/lab/suites-phasing-contract.test.ts` against a
throwaway git repository the test creates in a temp directory; none of those
tests runs git against the working repository.

**Stated plainly: no tier available here proves that no measurement was run
before the contract was committed.** Tier A makes rewriting the contract commit
detectable by a third party who fetches; tier B does not. Everything else above
narrows what a rewrite could usefully achieve — it cannot change the bytes, it
cannot carry the numbers, and it cannot produce a second reading of the same
preregistration without either a new contract version or a broken ledger chain.

## Scoring, unchanged from v1 and restated because it is load-bearing

Engine fallback, a turn carrying an error, an adapter exception (including a
timeout), a foreign engine identity, an execution-kind mismatch, illegality,
canonical divergence, or a missing/duplicate/extra result all produce
`status: 'error'`, `earned: 0`, and a failure code — they can never earn a
point, and they invalidate the run. No terminal-win override exists outside an
explicit `terminalPolicy: 'allow-root-mover-win'`; every economy decision is
`predicate-only` with `economy-ledger@1` asserting `surviveThroughout` over
**every** state of the trace, so a terminated, one-sided economy root fails.
Pinned by `tests/lab/suites-phasing-contract.test.ts`.

All zero-unit coverage and structural cases must pass. The expected one-node
UNKNOWN protocol probe in structural invariant 15 remains a required passing
budget-behaviour test, not an accepted unknown tactical answer.

## Standing conditions

These are engineering targets for this authored manifest. They are not
transferred empirical Standard floors, not statistical strength evidence, and
not a prediction that any engine build will pass. No case is demoted, removed,
relabelled or given a different objective because an engine misses it, and no
floor is lowered after outcomes. A v2 authoring correction after the contract
is committed requires a v3 and its own rationale, and invalidates comparison
against v2. Passing these suites alone never clears Gate 0, the failed baseline
sanity Gate 1, held-out strength, responsiveness, or deployment.

## Not yet written: the v2 contract file

`fixtures/v2/floor-contract.json` cannot be written honestly yet. Three of its
required fields are not determinable at the time of writing:

- `manifestSha256` — the v2 manifest does not exist until the defective roots
  are re-authored and the bundle is re-derived;
- `engineSourceSha256` and `weightsSha256` — the Hard engine is changing in
  another lane.

Everything that does not depend on those three values is fixed here and
machine-checked in `contract.ts`. The contract file is filled in as:

```json
{
  "schema": "muju-phasing-suite-floor-v2",
  "manifestSha256": "<hashJson(v2 manifest)>",
  "declaredAt": "<ISO-8601, before the commit>",
  "seed": 1,
  "profile": "desktop",
  "engineSourceSha256": "<adapter identity sourceSha256>",
  "weightsSha256": "<adapter identity weightsSha256>",
  "allowedMiss": { "tactics": 6, "invariants": 1, "home-mate": 0,
                   "economy": 0, "summon-disruption": 1, "home-fortify": 0 },
  "coverage": "all", "fallback": "veto",
  "illegalOrDivergent": "veto", "unresolvedProof": "veto",
  "rationale": "<cites this document>"
}
```

and must be committed before `hard:suite:phasing:measure` is run against it.
Writing it with invented hashes, or with `allowedMiss` values other than the
table above, is refused by `validateFloorContract`.

It must be committed **alone**, with no `result.json`, `cases.jsonl`,
`started.json`, `failure.json`, ledger line, or any path under a `results/`
directory in the same commit; `resolveContractCommit` refuses that commit
otherwise. Push it before measuring if the coordinator can, so the run records
witness tier A; otherwise the run records tier B and prints `WITNESS: local
only`, and the reader should treat the floor's *timing* as unwitnessed.

The measurement is a **first-measurement instrument**: once one run has
recorded a `result.json` for this manifest under this contract file, or a
ledger line for this manifest under this contract commit, a second run against
the same pair is refused. A re-measurement is a new contract version with its
own rationale.

One more thing is still missing before v2 can be measured, and this document
does not pretend otherwise: **no root has been re-authored and `fixtures/v2`
does not exist.** The veto, the scoring contract and the contract integrity
machinery are code; the cases they will be applied to are not written.
