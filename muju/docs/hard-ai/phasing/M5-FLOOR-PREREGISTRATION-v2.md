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
| home-defence proof nodes | 20 000 (injectable) | refuse, naming the budget and the line |
| rent-bearing units for keep-set enumeration | 12 | refuse, naming the bound |
| promotable units for promotion subsets | 12 | refuse, naming the bound |

**Correction (review finding, 2026-09-19).** The proof-node row above previously
read "canonical `unknown` ⇒ not a mate", and that is the one bound in this probe
that failed OPEN: `establishesHomeMate` collapsed the canonical tri-state
(`'mate' | 'rescue' | 'unknown'`) to `result === 'mate'`, so a root whose defence
could not be decided inside the budget was reported as *no uncredited win* — a
clean bill of health produced by running out of search. `establishesHomeMate` now
returns the tri-state, `unknown` is recorded as a bound hit, and
`assertNoUncreditedWin` therefore throws. The budget is a parameter of
`uncreditedMoverWins`/`assertNoUncreditedWin`/`vetoUncreditedWins` so the refusal
is testable; `tests/lab/suites-phasing-veto.test.ts` starves it to one node on the
two-promotion fortify root and pins the refusal, and pins that shrinking the
budget never turns the Prepare-promotion root's refusal into a clean bill.

**The probe also honours the two guards `resolveHomeCheckmate` applies before it
awards a mate**, because a line canonical will not award is not a win any accept
predicate had to credit, and flagging it refused sound roots:

- `victoryRule === 'elimination'` — home occupation never wins, so there is
  nothing uncredited;
- counter-invasion — an opposing occupier of the **mover's own** corner means the
  earlier invasion already owns the win and canonical refuses to award this one.

Both are pinned with constructed roots on which the promotion that mates under
the shipped rules produces no canonical award (`phase` stays `playing`) while
`analyzeHomeDefense`, asked on its own, still answers `mate` — the exact gap the
previous implementation reported as a free win.

The two 12-unit bounds match canonical `upkeepActions`, which is exhaustive up
to twelve rent-bearing units and degrades to four heuristic sets above it; the
probe refuses rather than search a proper subset of the mover's own choices.
Re-run over all 131 v1 macro-decisions, no case hit any bound.

**Re-run over v1 (code only; no fixture byte changed).** Old probe: 20 roots
flagged. New probe: **21** — the same 20, plus `M5-SD-28-home-blocks-all-
rectangles`, whose six flagged lines are all `stage: 'prepare'`,
`reason: 'home-checkmate'`, each ending in a `PROMOTE_UNIT`. Nothing was
un-flagged.

**Re-run again after the fail-closed and award-guard corrections above**
(131 macro-decisions built from the v1 builders in this worktree): **21 flagged,
0 bound hits**, the same 21 case IDs. The corrections therefore change no v1
verdict — no v1 root depends on an undecided proof, on elimination-only victory
or on a counter-invasion — and the flagged set is:

| Family | Cases |
|---|---|
| summon-disruption (9) | `M5-SD-01-occupied-low-cost`, `M5-SD-02-occupied-miner`, `M5-SD-03-interior-block`, `M5-SD-04-inclusive-edge`, `M5-SD-06-temporary-intrusion`, `M5-SD-07-split-rectangles`, `M5-SD-09-shared-intersection`, `M5-SD-18-arrival-immediate-attack`, `M5-SD-28-home-blocks-all-rectangles` |
| tactics (4) | `phasing-tactics-two-lanes-{fire_2,shadow_1}-vs-water_2`, `phasing-tactics-two-lane-approach-{fire_2,shadow_1}-vs-water_2` |
| home-mate invader (8) | `phasing-{promotion-dependent-rescue,public-bank-no-promotion-money,newly-placed-unit-cannot-promote,at-most-one-promotion}-mate` and their `-rotated-black-mate` twins |

The eight home-mate roots are flagged `stage: 'act'`, `reason: 'elimination'`;
the thirteen others are `home-checkmate` and each has at least one
`stage: 'prepare'` line.

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
| **A — `remote-tracking`** | `git branch -r --contains <contract commit>` is non-empty **and at least one of those refs belongs to a remote whose `git remote get-url` is not this machine** | A copy of that exact commit object exists in a fetched remote-tracking ref for a remote somewhere else. An amend or rebase yields a different id that the ref no longer contains, and the mismatch is visible to anyone who fetches. | **When** the remote received it. That no measurement was run before the push. That the remote is trustworthy. |
| **B — `local-only`** | otherwise | That the bytes measured are the bytes committed, and that the commit is an ancestor of the measured HEAD. | **Anything about time.** An amend or rebase after an off-record run passes every check in this tier. |

**Correction (review finding, 2026-09-19): tier A was grantable by a local
clone.** The condition was `git branch -r --contains` alone, and `git clone` of
the directory next door produces exactly that ref — as do a `file://` URL and a
remote pointing at `localhost`. None of them corroborates anything off this
machine, which is the entire claim of the tier. `resolveContractCommit` now
resolves each containing ref to its remote (longest matching remote name) and
`git remote get-url`, and classifies a URL as local-only when it is a filesystem
path, a Windows drive path, a `file:` URL, a loopback host (`localhost`,
`*.localhost`, `127.0.0.0/8`, `0.0.0.0`, `::1`) or unparseable — failing toward
the weaker claim. Tier A requires at least one non-local URL.

`ContractCommit` carries `remoteWitnesses` (`{ ref, remote, url, localOnly }` per
containing ref) and `witnessUrls` (the distinct non-local URLs that granted the
tier), and both are written into `started.json` and `result.json` and printed
with the `WITNESS:` line, so a reader sees *which* remote was taken as the
witness and which were rejected rather than trusting the tier word.
`tests/lab/suites-phasing-contract.test.ts` clones a temp repository, asserts the
remote-tracking ref is genuinely present, and pins tier B for it; a ref with no
configured remote behind it and a `file://` remote are pinned tier B as well.

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
- **First measurement only, keyed on the MANIFEST HASH ALONE.** If the ledger
  already carries a line for this manifest hash, or a `result.json` for this
  manifest hash exists under any of the declared search roots, the run is
  refused.

  *Correction (review finding, 2026-09-19).* Both halves of this check
  previously keyed on the contract — one on `(manifest, contract commit)`, the
  other on `(manifest, contract file hash)` — which made them defeatable by the
  single move they exist to stop: amend the contract commit after an off-record
  run, and both keys change while the manifest, the thing whose engineering
  floor is being read, is untouched. Neither the contract commit nor the
  contract bytes are consulted now.

  The one way to measure a manifest twice is a contract that declares
  `supersedes: { ledgerSeq, chain }` naming the **most recent** ledger line for
  that manifest, with that line's chain value — which cannot be written without
  the ledger the run is about to verify. When it validates, `result.json` leads
  with `priorMeasurementsOfThisManifest` beside `witnessTier`, so a superseding
  re-measurement is as visible as the tier is. A `supersedes` with nothing to
  supersede is itself a refusal, and a prior `result.json` with no ledger line
  behind it is refused outright: there is nothing to name and the ledger is
  incomplete.

  The search no longer depends on a directory being called `results`, which let
  a second reading hide behind a rename or a `--out` outside the repository.
  `findPriorMeasurements(roots, manifestSha256)` takes its roots from the
  caller: the ledger's own directory, the parent of this run's `--out`, and the
  repository top.

- **Every recorded measurement must still resolve against this history.**
  Before the run, each ledger line's recorded contract commit is checked for
  ancestry of `HEAD`. Rewriting the commit a recorded measurement was made
  against does not erase the record — the record stops resolving, and the next
  run refuses naming the line. This closes the amend hole from the other side:
  the amend is no longer merely *detectable by a third party*, it is *fatal to
  the next local run*.
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

## The v2 contract file

**Written, 2026-09-19 (lane `suites-v2-authoring-2`): `fixtures/v2/floor-contract.json`
now exists**, because the three fields below became determinable once the bundle
was authored. Its values and the remaining coordinator steps are recorded in
"What was actually authored" at the end of this document. The original reasoning
is kept verbatim because the *form* of the file, and the order of operations
below, are unchanged.

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
table above, is refused by `validateFloorContract`. `supersedes` is omitted on a
first measurement; the schema accepts it only as
`{ "ledgerSeq": <int ≥ 1>, "chain": "<64 hex>" }`, and the measurement refuses it
unless it names the most recent ledger line for this manifest.

It must be committed **alone**, with no `result.json`, `cases.jsonl`,
`started.json`, `failure.json`, ledger line, or any path under a `results/`
directory in the same commit; `resolveContractCommit` refuses that commit
otherwise.

**Order of operations for the coordinator, in full.** (1) Author the v2 bundle
and record its manifest hash. (2) Read the adapter's `sourceSha256` and
`weightsSha256` off the engine build that will be measured, and write them into
`engineSourceSha256` / `weightsSha256`; any other build is refused at run time by
`assertContractBuild`, so these cannot be filled in speculatively. (3) Write
`fixtures/v2/floor-contract.json` with those three hashes and the `allowedMiss`
vector above. (4) Commit that file **alone**. (5) Push it, if a remote that is not
this machine is available — a `file://` or localhost remote does not earn tier A,
and neither does a clone of a sibling directory. (6) Only then run
`hard:suite:phasing:measure`. Steps (3) and (4) cannot be merged with (6): an
untracked or working-tree-modified contract is refused outright, which is the
mechanism that makes the floor a preregistration rather than a description.

The measurement is a **first-measurement instrument**: once one run has recorded
a `result.json` or a ledger line for **this manifest hash**, whatever contract it
used, a second run is refused. A re-measurement is a new contract version with
its own rationale that additionally declares `supersedes: { ledgerSeq, chain }`
naming the reading it replaces.

One more thing is still missing before v2 can be measured, and this document
does not pretend otherwise: **no root has been re-authored and `fixtures/v2`
does not exist.** The veto, the scoring contract and the contract integrity
machinery are code; the cases they will be applied to are not written.

> **Superseded, 2026-09-19 by lane `suites-v2-authoring-2`.** The paragraph above
> was true when it was written and is kept for the record. The roots have now
> been re-authored and `fixtures/v2` exists; see "What was actually authored".

## Authoring status, 2026-09-19 (lane `suites-v2-authoring`)

This section records what is done and what is not, so the next lane does not have
to re-derive it. **`fixtures/v2` does not exist yet**, and none of the 21 flagged
roots has been re-authored. What this lane finished is the contract machinery and
the three code blockers that stood between it and any v2 bundle at all.

### Done: contract machinery (review findings closed)

All four review findings are closed, each with a regression test that fails on
the previous code: fail-closed proof cap and the two canonical award guards in
the veto; first measurement keyed on the manifest hash alone with an explicit
`supersedes`; ledger-commit ancestry; witness tier resolved by remote URL;
caller-supplied prior-measurement search roots. Pinned by
`tests/lab/suites-phasing-contract.test.ts` and
`tests/lab/suites-phasing-veto.test.ts` (49 tests).

### Done: the three code blockers on expressing a v2 bundle

Each was a fact about the **v1 release** written into a **validator** as a
literal, where a later release cannot restate it. All three are now derived or
declared, and none of the checks they used to provide was dropped.

1. **The manifest schema was pinned to v1's shape.** `caseCount: 225`,
   `memberCount: 245`, `cases: length(225)` and the per-family vector were zod
   literals, so no other composition parsed. The counts are now **carried by the
   manifest** (`caseCount`, `memberCount`, and an optional `familyCounts`) and
   cross-checked against the case list the manifest actually ships, in every
   direction — total, logical members, and per family. A manifest that misstates
   its own composition is refused with the numbers named; one that honestly
   states a different composition is now expressible. The frozen v1 manifest
   carries no `familyCounts` and still parses unchanged. `score.ts` and
   `run.ts` size `expectedCases` / `complete` / the author report from the
   manifest instead of from 225.

   One check the literals provided only by accident is now explicit: a family
   with **no cases** is refused, because each family is pinned to one suite file
   and an empty family's floor is vacuous. This was caught by the new test
   against the first cut of the generalisation.

   `RELEASE_COUNTS` survives as `V1_RELEASE_COUNTS` — a named reference to the
   v1 composition, no longer the validator's law.

2. **`rulesVersion` was the literal `'muju-phasing-1'`** — in the `SourceBinding`
   type, in the `binding` zod schema, in `sourceBinding()`, and a fourth time in
   the engine adapter's position gate. `RULES_VERSIONS` now admits both
   revisions so v1 documents keep **parsing**, and the current revision is
   **derived from the shipped inactivity constant** rather than written down
   again: `INACTIVITY_LIMIT === 20` ⇒ `muju-phasing-2`,
   `LEGACY_INACTIVITY_LIMIT` ⇒ `muju-phasing-1`, any other limit is a refusal.
   A binding therefore cannot claim `muju-phasing-1` while the code it binds
   counts to twenty — the exact drift a source binding exists to catch, and the
   one thing the literal could not see. `verifySourceBinding` still demands the
   current revision, so a v1 document parses and does not verify, which is the
   intended split. The adapter's redundant fourth copy was removed in favour of
   `CURRENT_RULES_VERSION`.

   Pinned by `tests/lab/suites-phasing-v2-schema.test.ts` (10 tests). Every one
   of them fails on the pre-change code, verified by re-running the file against
   the `HEAD` copies of `manifest.ts`, `canonical.ts`, `format.ts`, `score.ts`,
   `engine-adapter.ts` and `run.ts`: 10 failed / 0 passed before, 10 passed
   after.

3. **The veto is wired into the author path.** `run.ts` exports
   `vetoDocument(document, restore, proofNodes?)`, which applies the free-win
   veto to every macro-decision in a document and **collects** findings instead
   of throwing, so one run names every defective root rather than stopping at
   the first. This is the hook the v2 builder turns into an invalid bundle on a
   non-empty list.

   Re-run here over all **131** macro-decisions built from the v1 builders in
   this worktree: **21 flagged, 0 bound hits**, byte-for-byte the case list in
   the table above (9 summon-disruption, 4 tactics, 8 home-mate invader). That
   is an independent reproduction of the count this document already claimed,
   made through the author-path wiring rather than through the probe directly.
   `tests/lab/suites-phasing-veto.test.ts` pins the nine disruption IDs, pins
   that `home-fortify` comes back **clean** (its six `allow-root-mover-win`
   decisions pass by construction, not by exemption), and pins that starving the
   proof budget to one node can only ever produce *more* findings, never fewer.

### Still open: the authoring itself

**Closed, 2026-09-19, by lane `suites-v2-authoring-2`; every bullet below is
done and is itemised in "What was actually authored".** The list is kept as the
work statement it was.

The case design is untouched and is the whole of the remaining work:

- the nine disruption roots re-authored to remove the free win while keeping
  each disruption motif (`M5-SD-28`'s objective is itself a home entry and needs
  redesign at a non-corner square, or dropping with a stated reason);
- the four two-lane tactics roots and the eight home-mate invader roots;
- the four "plugged" multi-answer tactics cases moved to `any-of@1`;
- the intruder-survival horizon on every disruption decision;
- the invariants split (15 gating at `search-gap`, fixed work 120 000;
  inv9/inv11/inv13 demoted to diagnostics), inv16 authored against the
  **20-ply** limit via the constant, and the economy forecasts re-derived where
  the longer clock moves them;
- `fixtures/v2` generated with its own manifest, and
  `fixtures/v2/floor-contract.json` written per "Order of operations" above.

**Why `fixtures/v2` was not frozen in this lane**, restated because it still
holds and is a property of the worktree rather than of the case design. A bundle
is pinned twice over and both pins move under a shared tree:

- `loadBundle` compares `artifactPins()` — every `.ts` in the suite directory —
  against `manifest.artifacts`. The v1 manifest pins 20 artifacts and does not
  list `veto.ts`, which the instrument commit added, so
  `loadBundle('fixtures/v1/manifest.json')` refuses with *"Builder/predicate/
  validator artifact set or bytes differ"* in this tree. This was already true
  at the branch point, before this lane's edits, and this lane adds further
  `.ts` changes to the same directory.
- every position embeds `rulesSourcesSha256 = hashJson(canonicalSourceHashes())`
  over `src/game/**.ts` plus `src/ai/simulate.ts`. v1 records `2940e1e1…`; this
  tree computes a different hash because the 20-ply inactivity change landed.

So v2 fixtures must be generated **after** the rules and suite sources for the
measured build have settled, with the generating run's `canonicalSourceHashes()`
recorded beside them. Freezing them earlier reproduces exactly the staleness
that v1 is in now.

The v1 fixtures are byte-identical across this lane: all ten files under
`fixtures/v1/` hash the same before and after (`manifest.json`
`c7db0acc…`, `tactics.suite.json` `281d0444…`, `summon-disruption.suite.json`
`6911ba68…`, `home-mate.suite.json` `83451fbb…`, `home-fortify.suite.json`
`8f0fd575…`, `invariants.suite.json` `0f89191d…`, `economy.suite.json`
`ed3fc64a…`, `author-report.json` `5491c638…`, `floor-contract.json`
`8b25ea5c…`, `execution.json` `2b9efd9f…`).

Nothing in this section changes a floor, a classification or the allowed-miss
vector. The authoring requirements in "v2 authoring contract" above stand
unchanged.

---

## What was actually authored, 2026-09-19 (lane `suites-v2-authoring-2`)

**`fixtures/v2` exists, is complete and is valid.** `run.ts author-v2` and an
independent `validate` from a fresh process both report
`valid: true, release: "v2", cases: 225, members: 245, errors: [], vetoRefused: []`.
The v1 fixtures are byte-identical across this lane: all ten files under
`fixtures/v1/` hash the same before and after.

### What was known when this was written, restated honestly

Everything the section "What was already known when this was written" says still
holds and is now the more important for having been acted on. This lane was
executed **after** the v1 measurement (`m6-suite-measure-1`: tactics 62/63,
invariants 5/18, home-mate 28/28, economy 20/20, summon-disruption 5/14,
home-fortify 6/6) and **after three independent reviews** — the two named above
plus the veto's own re-run, which found the eight home-mate invader roots that
neither review did. Those outcomes were visible while this lane worked.

That is exactly why **no v2 floor was chosen here.** The floor rule was fixed
before this lane started and is mechanical: `minimumEarned = offered(v2) -
allowedMiss(v1)`, with `V1_ALLOWED_MISS` pinned in `contract.ts` and refused in
either direction. The lane changed offered counts (invariants 18 → 15) and the
floors moved with them by that formula alone. Nothing in the authoring below was
chosen because an engine passed or missed it; every accept predicate, horizon
and endpoint number is recomputed canonically at author time from the shipped
rules, and no Hard engine was run against v2 at any point.

### The veto, wired so a defective bundle cannot exist

- `authorBundle(directory, release)` runs `vetoDocument` over every document of a
  **v2** bundle and records each finding as a family error, so `valid` cannot be
  true while one stands.
- `validateBundle` — the path `measure.ts` calls before the engine runs — **re-runs
  the veto itself** for a v2 bundle rather than trusting the shipped author
  report, and reports `release` and `vetoFindings` on the result.
- Enforcement is gated on `manifest.release`, which is `'v2'` on the new manifest
  and **absent** on the frozen v1 manifest (`releaseOf` reads an absent field as
  `v1`). v1 therefore keeps loading as the historical record it is, with its 21
  flagged roots.
- Both directions are pinned by `tests/lab/suites-phasing-v2-authoring.test.ts`:
  the same six documents, with v1's summon-disruption family swapped in, are
  **refused** under `release: 'v2'` naming all nine roots and **accepted** under
  `release: 'v1'`.
- A superseded bundle now says so. `loadBundle` on `fixtures/v1/manifest.json`
  reports *"Superseded bundle: builder/predicate/validator artifact set or bytes
  differ, so this manifest is pinned to an older suite tree…"*, naming the added
  and changed artifacts, instead of a bare hash error. No v1 byte was touched.

### Builder entry point and author input

`npm run hard:suite:phasing -- author-v2 --out <NEW_DIR>` (mode `author-v2`;
`authorBundle(dir, 'v2')` in code). The v2 builders live in
`lab/hard-ai/suites/phasing/build-v2.ts` and the v2 authoring is declared in the
**new** author input `author-inputs/new-candidates-v2.json`, beside the
byte-pinned `new-candidates-v1.json`, which is unchanged. The v2 input is a
declarative delta pinned to the v1 input's SHA-256; the builder **re-derives**
root states, witness traces and recorded endpoints canonically in the authoring
process instead of reading v1's frozen observations.

### Every root the veto flagged, with its disposition

| Case | Disposition | Reason |
|---|---|---|
| `M5-SD-01-occupied-low-cost` | re-authored (garrison) | Raider mated on the empty White corner; `fallback` Plant I relocated from B1 to **A1**. |
| `M5-SD-02-occupied-miner` | re-authored (garrison) | Same; `fallback` → A1. |
| `M5-SD-03-interior-block` | re-authored (garrison) | Same; `fallback` → A1. |
| `M5-SD-04-inclusive-edge` | re-authored (garrison) | Same; `fallback` → A1. |
| `M5-SD-06-temporary-intrusion` | re-authored (garrison) | Same; `fallback` → A1. |
| `M5-SD-07-split-rectangles` | re-authored (garrison) | Same, but the root has no spare body: a new `home-guard` Plant I is added at A1. |
| `M5-SD-09-shared-intersection` | re-authored (garrison) | Same; new `home-guard` at A1. |
| `M5-SD-18-arrival-immediate-attack` | re-authored (garrison) | Same; `fallback` → A1. |
| `M5-SD-28-home-blocks-all-rectangles` | **replaced** by `M5-SD-28-single-anchor-interior-block` | Its objective *was* the home entry, so a garrison would delete the objective. Redesigned: the Water I raider spends all four AP walking B4→B3→B2→**C2** and blocks the single supporting rectangle at a **non-corner interior square**, denying the Plant I commitment on B2; A1 carries a `home-guard`. |
| `phasing-tactics-two-lanes-fire_2-vs-water_2` | re-authored (garrison) | Spare lane body walked to the empty enemy corner J10 and mated; a Black `home-guard` Plant I now holds J10. Lane geometry, banks, reserves and the double-attack witness are unchanged. |
| `phasing-tactics-two-lanes-shadow_1-vs-water_2` | re-authored (garrison) | Same. |
| `phasing-tactics-two-lane-approach-fire_2-vs-water_2` | re-authored (garrison) | Same. |
| `phasing-tactics-two-lane-approach-shadow_1-vs-water_2` | re-authored (garrison) | Same. |
| `phasing-promotion-dependent-rescue-mate` + `-rotated-black-mate` | **explicitly credited** | The flagged win *is* the point: the case asks the invader to convert an established occupation into a finished game, and v1 refused only because `home-defense@1` declines a terminal snapshot and accept named one reason. v2 declares `terminalPolicy: 'allow-root-mover-win'` and an `any-of@1` accept over `home-checkmate` **and** `elimination`. The quiet control still wins nothing, so it stays a decision. |
| `phasing-public-bank-no-promotion-money-mate` + `-rotated-black-mate` | explicitly credited | Same, per case. |
| `phasing-newly-placed-unit-cannot-promote-mate` + `-rotated-black-mate` | explicitly credited | Same, per case. |
| `phasing-at-most-one-promotion-mate` + `-rotated-black-mate` | explicitly credited | Same, per case. |

That is the complete list: 21 of 21. The re-run of the veto over the v2 bundle's
**131 macro-decisions returns 0 findings and 0 bound hits.**

**Why a Plant I garrison and not something else.** Plant I is the inert durable
tier-1 body: attack 0, defence 3, upkeep 0, never released by its owner's
upkeep. Every raider in these roots has an effective attack strictly below 3
against it — Lightning I 1+1=2, Water I 2−1=1, Shadow II 3−1=2 — so no root
raider can clear the corner at all, let alone clear it and still hold the AP to
enter. The garrison is applied to the **seed**, and the root is re-derived by
replaying the same authored setup actions, so the commitment, the rectangles and
the raider are untouched.

### Intruder survival on every disruption decision

All **14** summon-disruption decisions carry
`horizon: { scripted, pass-only@1, additionalHandoffs: 1, homeFirst: true }` and
an accept that requires the named intruder present at that endpoint
(`assertsIntruderSurvival` is asserted per case at author time and in the test).
For each, the accepted answer is shown **strictly better than the rejected one
at the survival horizon by canonical replay**, on a stated measure:

| Case | Measure | Accepted | Rejected |
|---|---|---|---|
| `M5-SD-01` | denied arrival, defender army at the horizon | 2 | 3 |
| `M5-SD-02` | denied arrival | 2 | 3 |
| `M5-SD-03` | denied arrival | 2 | 3 |
| `M5-SD-04` | denied arrival | 2 | 3 |
| `M5-SD-05` | denied arrival | 2 | 3 |
| `M5-SD-06` | denied arrival | 2 | 3 |
| `M5-SD-07` | denied arrival (one of two commitments) | 4 | 5 |
| `M5-SD-09` | denied arrival (both commitments) | 3 | 5 |
| `M5-SD-10` | denied arrival + anchor captured | 1 | 3 |
| `M5-SD-13` | denied arrival + both anchors cleaved | 1 | 3 |
| `M5-SD-14` | **terminal**: accepted ends the game for the mover; rejected leaves a playing position in which the commitment arrives | win | army 2 |
| `M5-SD-18` | denied arrival | 2 | 3 |
| `M5-SD-28` (redesigned) | denied arrival | 3 | 4 |
| `M5-SD-30` | **terminal**: the rejected control is a canonical **loss** for the mover at this horizon | playing, rescuer alive | mover loses |

The tempo measure is written into the accept predicate, not only into prose: the
accepted answer must leave the defender's army at or below the accepted count
*and* disrupt the commitment *and* keep the intruder on the board, so the
equality on material-plus-bank that the independent replay found in 8 of 14 v1
decisions cannot recur. **The final disruption offered count is 14**; no
disruption case was dropped.

### The four multi-answer tactics cases

`canonicallyRemovableTargets` enumerates, canonically, every enemy body the
mover can remove from the root within its AP, and the builder **refuses** a case
whose declared target set disagrees with it. The split is a fact about the
catalogue, not a choice:

- **`any-of@1` over `u0, u1, u2, u3`** (all four independently removable):
  `phasing-tactics-plugged-{fire_1,fire_2,fire_3,lightning_2}-vs-fire_3`. Each
  attacker's effective attack meets the Plant I plugs' defence 3 (Fire I 2+1,
  Fire II 3+1, Fire III 4+1, Lightning II 2+1).
- **Canonical uniqueness argument, single target retained**:
  `phasing-tactics-plugged-{water_1,water_2,water_3,shadow_1}-vs-fire_3`. Their
  effective attack against Plant I is 1, 1, 2 and 1 — strictly below defence 3 —
  so the canonical enumeration removes `u0` and nothing else.

### Invariants

Fifteen gating pairs at `primaryMetric: 'search-gap'`, `work: 120000` per member:
1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 17, 19, 20. Three non-gating
`diagnostic` pairs offering **0**: `inv9-chip-across-turn`, `inv11-home-bare`,
`inv13-turtle`, each for the reason its own rationale already gave. Invariants 15
and 18 remain `structural` with `primaryMetric: 'none'`. `inv16` is authored
against the **20-ply** limit through the shipped `INACTIVITY_LIMIT` constant
(premise `inactivity-plies eq 19` versus `eq 2`), which is the only invariant
whose content moved between revisions.

Each of the fifteen retained pairs was re-read under Phasing timing before this
lane authored it; the per-pair reasons are recorded in
`author-inputs/new-candidates-v2.json` under `invariants.rationaleRecheck`. Each
states a canonical fact about the position — recruitment area, mobility,
reach-and-retreat inside four AP, finite reserve consumption, a rectangle voided
by an actual intrusion line, rent unpayable after a real promotion, arrival-batch
blocking, the inactivity clock — rather than a transferred Standard-era
heuristic. **No further pair was demoted.** Invariants offered falls 18 → 15 and
the floor becomes 14 of 15.

### Economy

**No economy forecast changes under the 20-ply clock, and none was re-derived.**
This is a measured claim, not an assumption: all thirty economy cases were
rebuilt from `build-economy.ts` under `muju-phasing-2` and compared case-by-case
against the frozen `fixtures/v1/economy.suite.json`; every case is identical
modulo the position-reference hashes that carry the source binding. The longest
economy horizon is eight additional pass-only hand-offs (nine plies from the
root), below both the old ten-ply and the new twenty-ply limits, and no economy
case asserts an inactivity fact. Pinned by a test.

### The v2 bundle

| Family | Cases | Offered | Allowed miss (v1 budget) | **v2 floor** |
|---|---:|---:|---:|---:|
| tactics | 79 | 63 | 6 | **57** |
| invariants | 20 | 15 | 1 | **14** |
| home-mate | 56 | 28 | 0 | **28** |
| economy | 30 | 20 | 0 | **20** |
| summon-disruption | 30 | 14 | 1 | **13** |
| home-fortify | 10 | 6 | 0 | **6** |

225 cases, 245 logical members, 131 macro-decisions, 146 offered units.
Manifest semantic SHA-256 **`454fe137aa5bf97f4703a209985e4743eb995719c09cb6bcf8ea6d130bc39453`**;
manifest file SHA-256 `ce248197d975c356c19db95d71cdc13d7d113cffaf228008ac73b4267826b00e`.

### `fixtures/v2/floor-contract.json`, and what the coordinator must still do

The file is written with `manifestSha256` above, the `allowedMiss` vector from
the frozen v1 budget, `seed: 1`, `profile: 'desktop'`, and the build it is
declared against:

- `engineSourceSha256` `e46f735eaaea2aa4df2d7eda276e7c6db366e1db587260fcefc8a0d678391dcd`
  = `hashJson(engineSourceHashes())`;
- `weightsSha256` `1addc7d64b574c2ea27df209d32a5e37bc0800e8e4948c2bd3f514c1f64c92e0`
  = `weightIdentity(DEFAULT_WEIGHTS)` (`phasing-accounting-bootstrap-v1`, version 2).

Both are pure hashes of this worktree, read without running a search. **If the
Hard engine or the weights change before the measurement, the contract must be
rewritten with the new hashes** — `assertContractBuild` refuses any other build
rather than crediting it against these floors.

The remaining steps belong to the coordinator and cannot be merged:

1. Confirm (or rewrite) the two build hashes against the build that will actually
   be measured.
2. **Commit `lab/hard-ai/suites/phasing/fixtures/v2/floor-contract.json` ALONE** —
   no `result.json`, `cases.jsonl`, `started.json`, `failure.json`, ledger line,
   or any path under a `results/` directory in the same commit.
   `resolveContractCommit` refuses that commit otherwise, and refuses an
   untracked or working-tree-modified contract outright. This is the mechanism
   that makes the floor a preregistration rather than a description.
3. Push that commit if a remote that is not this machine is available; a
   `file://` remote, a localhost remote or a clone of a sibling directory earns
   tier B (`local only`), which is recorded and printed rather than assumed.
4. **Only then** run `hard:suite:phasing:measure` against
   `fixtures/v2/manifest.json`, in a later commit. It is a first-measurement
   instrument keyed on the manifest hash alone; a second reading requires a new
   contract version declaring `supersedes: { ledgerSeq, chain }`.

Nothing in this section changes the allowed-miss vector, a classification or a
floor rule. The standing conditions above are unchanged: these are engineering
targets for an authored manifest, not strength evidence, and passing them clears
no release gate.
