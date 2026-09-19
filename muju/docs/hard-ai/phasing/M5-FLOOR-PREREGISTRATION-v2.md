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
- **The ninth, `M5-SD-28`, converts one hand-off later.** The occupation is
  answerable, so v1's `first-handoff-or-terminal` horizon ends at `playing` and
  hides it. Under the intruder-survival horizon required below it resolves as
  `victory/home-occupation` at the mover's next turn start, and again scores
  zero.

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
its own accept predicate would leave uncredited. `veto.ts` enumerates the
mover's own Act (and a Prepare root's promotions) with canonical legality and
de-duplication, settles each reached state to the case's declared macro
endpoint and horizon, and flags a line when either

- the settled endpoint is `victory` with `winner === root mover`, or
- the state establishes a home occupation whose Prepare snapshot is `mate`
  under `analyzeHomeDefenseEvidence` at the canonical 20 000-node proof budget

**and** `evaluateDecision` does not score that line as a pass. Cases declaring
`terminalPolicy: 'allow-root-mover-win'` pass by construction, not by
exemption: their accept credits the win, so `evaluateDecision` returns pass and
nothing is flagged. Exhausting the 200 000-state probe budget is a refusal, not
a clean result.

Out of scope, stated so it is not mistaken for coverage: a win produced by the
scripted pass-only continuation starving the defender's upkeep is not searched.

### Intruder survival (summon-disruption)

Every disruption decision takes a scripted `pass-only@1` horizon of **at least
one additional hand-off**, and its accept requires the intruding unit to be
**present at the endpoint**. A raid that disrupts a commitment and is captured
on the reply no longer scores. Note the interaction the veto makes visible:
extending the horizon is what exposes `M5-SD-28`, so the two requirements must
be satisfied together, not one after the other.

### Multi-answer tactics cases

The four "plugged" tactics cases are positions with several equally valid
targets scored as if one were canonical. v2 either widens accept to an any-of
over the equally valid targets, or states the canonical argument for uniqueness
in the case rationale. Scoring one of several correct answers as the only
correct answer is not permitted to stand.

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
