# M2 — the packed replica becomes Phasing-only

Status of the M2 exit criteria on `claude/hard-phasing-m2`, worktree
`/Users/ashkie/src/deevgames-claude-hard-m2`, after converger round 3 (the last).

**Spec**: `muju/docs/PHASING-2026-09-16.md`.
**Oracle**: `src/game/{rules,turn,summoning,legality,homeCheckmate,board}.ts` and
`src/ai/simulate.ts`. Where this document and the canonical engine disagree, the
canonical engine wins.

---

## Verdict

| # | Exit criterion | Result |
|---|---|---|
| 1 | `npm run hard:types` and `npx tsc --noEmit -p .` clean | **PASS** |
| 2 | `hard:fuzz` transition / legality / arrival, 0 divergences | **PASS on legality and arrival; two known prover shapes remain on transition, 0 unclassified** |
| 3 | `hard:perft`: replica equals canonical on every Phasing fixture, counts frozen | **PASS** |
| 4 | Replica-layer unit tests green | **PASS** |
| — | Upper layers kept compiling, their tests quarantined in one place | **PASS** |

Criterion 2 is the one that is not clean, and it is not clean for a reason M2
cannot fix in its own lane: every remaining divergence is inside
`src/ai/hard/tactics/prover.ts`, which design item H places out of scope and
forbids changing here.

**Round 2 changed what this section says.** Round 1 reported ONE divergence
class. Round 2 added a narrow classifier to the fuzzer so that a divergence which
is *not* the documented debt can never hide behind it — and that classifier
immediately found a **second class, failing in the opposite direction**, which
round 1's twenty seeds had never hit and whose existence round 1's build report
had explicitly argued was harmless. Both classes are now characterised, each
reduced to a three-unit deterministic reproduction, and pinned by tests that fail
the moment M4 fixes them.

**Round 3 stopped taking the classifier's word for it.** It ran a third disjoint
sweep — **30,000,000 fresh applied actions**, seeds 76-165 — which produced 48
divergences, **43 of class 1, 5 of class 2, 0 unclassified**, and zero of every
other mismatch the harness tracks. It then took five of those repros, including
the first ever seen for class 2's *promotion* arm, and re-adjudicated each one
with the **canonical engine under both rulesets in turn**. In all five the
replica's verdict equals canonical's answer under STANDARD and differs from
canonical's answer under PHASING, with exactly one digest field apart — which is
what "the divergence is the prover's ruleset, and nothing else" actually looks
like when measured rather than argued. See [Round 3's out-of-sample
confirmation](#round-3s-out-of-sample-confirmation).

Combined across the three rounds: **48,750,000 applied actions, 71 divergences,
every one classified, 0 unclassified.**

Round 3 also closed two blind spots of its own inside the M2 lane — a keep-set
cap the first two rounds never reached, and a replica-layer exemption that was
sound in extent but rested on round 1's disproved premise. See [Round 3's
strengthenings](#round-3s-strengthenings).

---

## 1. Typecheck

```
npm run hard:types      # tsc -p lab/hard-ai/tsconfig.json --noEmit   -> clean
npx tsc --noEmit -p .                                                 -> clean
```

Both clean, and clean again after every round-3 edit. Round 1 found them already
repaired in the worktree (the replica-core lane had left
`tests/ai/hard/pack-roundtrip.test.ts:284` and `tests/ai/hard/spawn.test.ts:288`
in flight) and added two `strictNullChecks` fixes of its own. Round 2 needed no
typecheck fixes: the new classifier, the two new test files and the widened
metrics type-check under both configs as written, and neither did round 3: the
tightened keep-set and exemption assertions, including
`tests/ai/hard/make-unmake.test.ts`'s new cross-tree import of the fuzzer's
classifier, type-check under both as written.

## 2. Differential fuzz

Each round used seeds disjoint from the rounds before it — **1–20**, **21–75**,
**76–165** — so the action counts add rather than overlap. Round 3 ran

```
# seeds 76-115, all three surfaces
npx tsx lab/hard-ai/fuzz/run.ts --actions 250000 --arrival-cases 400 --seed <s> --allow-known-prover-gap
# seeds 116-165, transition only: more actions per minute on a loaded box
npx tsx lab/hard-ai/fuzz/run.ts --actions 400000 --surfaces transition --arrival-cases 1 --seed <s> --allow-known-prover-gap
```

at ~8–15 s per seed.

| | round 1 (seeds 1–20) | round 2 (seeds 21–75) | round 3 (seeds 76–165) | total |
|---|---|---|---|---|
| applied actions | 5,000,000 | 13,750,000 | **30,000,000** | **48,750,000** |
| games | 26,614 | 73,843 | 162,547 | **263,004** |
| buys | 587,303 | 1,617,877 | 3,528,757 | **5,733,937** |
| arrivals | 534,225 | 1,470,598 | 3,208,034 | **5,212,857** |
| refunds | 27,789 | 76,771 | 165,948 | **270,508** |
| legality-set mismatches | 0 | 0 (1,718,753 checks) | 0 (1,250,001 checks) | **0** |
| pending-legality mismatches | 0 | 0 (3,549,792 probes) | 0 (2,582,423 probes) | **0** |
| keep-set truncations | — | 0 | **2** (see below) | **2** |
| unmake / rehash / round-trip mismatches | 0 | 0 | 0 | **0** |
| harness invariant violations | 0 | 0 | 0 | **0** |
| transition divergences | 4 | 19 | 48 | **71** |
| — of them `overclaim-broke-defender` | 4 | 18 | 43 | **65** |
| — of them `underclaim-standard-rescue` | 0 (never hit) | 1 | **5** | **6** |
| — of them **unclassified** | — | **0** | **0** | **0** |

Round 3's divergent seeds, all classified: 76, 83, 93, 96 (×2), 99, 100, 102,
104 (×2 — one of each class), 106, 107, 108, 118 (×2 — one of each), 126, 127,
128, 132, 133, 134, 137, 138, 139, 141, 144, 145, 146, 149, 150, 151 (×2),
153 (×2), 154, 155, 156, 159 (×4), 160 (×2), 161, 163 (×2), 164, 165 (×2). The
under-claim class appeared on seeds 104, 118, 128, 134 and 145. The other 52
seeds were clean.

Arrival surface, the 40 all-surface seeds at 400 cases: **16,000 cases, 0 skips,
0 mismatches** across all eight kinds it tracks (transition via full packed-state
`firstDifference`, unmake identity, rehash, `pack(unpack(p))`, arrival flags,
refund arithmetic against `lastSummoning.disrupted`, the arriving side's plane
cleared, the other side's plane surviving). 8,097 cases contained an arrival,
5,906 a refund, 3,637 both, 15,480 had commitments on both sides, 5,413 were
terminal hand-offs that resolved nothing. Rounds 2 and 3 together: **32,000
cases, 0 skips, 0 mismatches**, with all six intrusion shapes exercised in the
thousands (`park-own`, `park-enemy`, `block-home`, `kill-anchor`,
`displace-anchor`, `none`).

Arrival **and** refund coverage is real, not incidental: 42–44% of round 3's
162,547 games contain at least one arrival *and* at least one refund (68,601
games), and 1,804,845 plies had a commitment outstanding for **both** sides at
once.

The prover surface (`prover`, `gate-preservation`) is skipped by default with a
boxed log naming M4, exit 0, as item 5 of the harness lane's brief specifies.
`--allow-standard-surfaces` still runs it.

### The divergence classifier, and why it is not a way of hiding anything

Round 1 reported "4 divergences, all one shape" as prose. Nothing in the harness
checked that claim, so a *new* divergence class would have been reported by the
same counter, in the same run, with the same exit code — and round 2 found
exactly such a class within 55 seeds. `classifyKnownProverGap`
(`lab/hard-ai/fuzz/differential.ts`) closes that hole.

It recognises each documented class by a conjunction that has to hold in full:

- the two packed states are the same position in **every** field but
  `result`/`reason` (`firstDifference(a, b, ignoreResult)`), so any divergence
  that also moves a square, a bank, a key or the pending plane is never
  classified;
- the verdicts differ in that class's specific direction; and
- the defender actually **holds the Standard-only resource** that explains it —
  short of its own rent for the over-claim, and a strictly larger Standard rescue
  set for the under-claim (see `standardRescueExceedsPhasing`).

The metrics split `divergences` into `proverOverclaimDivergences`,
`proverUnderclaimDivergences` and `unclassifiedDivergences`. By default **both**
classified and unclassified divergences still fail the run, exactly as before;
`--allow-known-prover-gap` tolerates only the classified ones, loudly, naming the
fix milestone and the pinning test, and **never** tolerates
`unclassifiedDivergences`. That last property was verified empirically, not just
read off the code: forcing the classifier to return `null` turned seed 31's run
into `unclassifiedDivergences: 1` and a failing exit even with the flag set.

`tests/ai/hard/fuzz-known-gap.test.ts` pins the classifier from both sides —
it must recognise each real class, and it must **refuse** a mate over-claim
against a *solvent* defender, an under-claim by a defender with no Standard-only
option, a verdict divergence carrying any other field difference, a non-mate
reason, and the agreeing case. A classifier that is too generous silently
converts a regression into a tolerated one, so those negative cases are the
load-bearing half.

### The two remaining divergence classes

Both are `src/ai/hard/tactics/prover.ts` implementing STANDARD home defence while
the replica is Phasing-only, and both show up the same way — the `result` field
alone (digest field 23, `result.reason`), with board, pending plane, reserves, all
five keys, banks, phase, actions, upkeep, clock and material byte-identical.

Canonical Phasing gives the defender its **present army** and four actions and
nothing else:

```
rescued = isPhasing(state) ? act(ready, []) : prepare(0, cash, [], [])   homeCheckmate.ts:159
bound   = enoughPossibleDamage(ready, target, !isPhasing(state))         homeCheckmate.ts:79
```

The packed prover hardcodes Standard on **both** halves, and the two halves fail
in opposite directions.

#### Class 1 — `overclaim-broke-defender` (the bound). 22 of 23 observations.

```
action    = END_ACTION_PHASE or PAY_UPKEEP
replica   = 1.4 / 2.4   (a win, reason home-checkmate)
canonical = 0.0         (ongoing)
```

`damageBoundCore(dp, preparing)` skips any defender unit with `rent > cash`
(`prover.ts:418`), and both entry points the replica reaches pass
`preparing: true` unconditionally (`damageBound` at `prover.ts:720`, `runProver`
at `prover.ts:738`). Under Standard that term is right — the defender pays upkeep
before it fights, so a unit whose rent it cannot afford is released and
contributes no damage. Under Phasing rent never comes up. A **broke** defender is
therefore treated as having no army at all, the admissible bound reports "not
enough possible damage", and `runProver` returns `MATE` at `method: 1` with
**zero** search nodes, never reaching the rescue search that would have found the
line.

**This is the unsound direction** — the replica believes in a mate it does not
have. The M2 build report argued the Standard prover could only ever *under*-claim
a Phasing mate, because Standard's rescue set is strictly larger. That is true of
the *search* and false of the *bound*: Standard's upkeep release **shrinks** a
broke defender's army, so the bound prunes rescues that exist. The exemption
reasoning in `tests/ai/hard/make-unmake.test.ts`'s `compareDigests` rested on that
same wrong premise; **round 3 corrected it and narrowed the exemption to
`classifyKnownProverGap`**, so that file no longer tolerates a mate split it
cannot name.

**Minimal reproduction** — three units, deterministic, in
`tests/ai/hard/phasing-prover-debt.test.ts`:

- White `lightning_1` on (9,9), Black's home corner — the occupier.
- White `fire_1` on (0,0) so White is not eliminated. White bank 6.
- Black's **only** unit: `fire_2` (tier 2, upkeep 1) on (7,5). Black bank **0**.
- White to move, phase `action`. Apply `END_ACTION_PHASE`.

Canonical: still `playing`, and `analyzeHomeDefenseEvidence` returns `rescue` with
the witness `MOVE (7,7) → MOVE (7,9) → MOVE (8,9) → ATTACK (9,9)` — exactly four
actions, Black's rent never consulted. Replica: `WHITE_WIN` / `HOME_CHECKMATE`.
Give Black **one** crystal and the replica agrees. That single crystal is the
whole bug.

#### Class 2 — `underclaim-standard-rescue` (the search). NEW in round 2.

```
action    = PAY_UPKEEP        (seed 38, game 675, ply 286)
replica   = 0.0               (ongoing)
canonical = 2.4               (Black wins, home-checkmate)
```

Standard's `prepare` offers three arms per owned unit
(`homeCheckmate.ts:146-158`):

1. keep it, when `rent <= cash`;
2. keep it **promoted**, when `rent + promoCost <= cash`;
3. **drop it entirely** — at any cash, but only for tier 2+ ("Tier 1 is
   mandatory, even when it blocks a rescuing attacker").

Phasing's `act` may do none of these. The packed prover implements `prepare`, so
it finds defences Phasing forbids and reports no mate where canonical awards one.

Arm 3 is the one the fuzzer hit, and it is **not about money at all**: releasing a
tier-2+ unit takes a friendly **blocker** off the board. The observed position had
27 units; greedy minimisation reduced it to three that still diverge, pinned in
`tests/ai/hard/phasing-prover-underclaim.test.ts`:

- Black `lightning_1` (defense 1) on (0,0), White's home corner — the occupier.
- White `plant_2` (tier 2) on (3,0) — White's **own** unit.
- White `water_1` (speed 1, attack 2) on (4,0). White bank **1**, Black bank 2.
- Black to move, phase `action`. Apply `END_ACTION_PHASE`.

`water_1` would reach the corner in exactly four actions —
(4,0) → (3,0) → (2,0) → (1,0) → `ATTACK (0,0)` — but White's own `plant_2` stands
on (3,0), and at speed 1 that is the only route in range. Canonical Phasing keeps
the blocker and awards Black the mate. Remove the `plant_2` — precisely what arm 3
does — and the same defender rescues with the witness `MOVE, MOVE, MOVE, ATTACK`.
White's 1 crystal affords no promotion to anything (`plant_2` needs 1 + 8,
`water_1` 0 + 4), so money cannot explain this one; the test asserts that too, so
a future catalogue change cannot quietly turn it into a second copy of arm 2.

This direction is **safe for search soundness** — the engine misses a mate rather
than inventing one — which is exactly why round 1 reasoned about it and never
measured it. It is still a divergence from canonical, so the M2 gate sees it.

#### The fix, for M4 — one change closes both

Pass `preparing: false` at `prover.ts:720` and `prover.ts:738` (the replica is
Phasing-only, so `!isPhasing(state)` is constantly false), and replace
`prepare(0, defenderCash)` at `prover.ts:750` with the act search alone. That
removes the rent term from the bound, which is class 1, and the promotion and
release arms from the rescue, which is class 2. The `preparing: true` branch and
`prepare` itself then become dead code.

Not done here: `tactics/prover.ts` is out of M2's scope per design item H and
outside this lane's editable set — round 3's brief did not widen it either.
**Widening the lane to that one file is the single change that would make
criterion 2 fully clean** — it is three lines, and both pinning tests are already
written to fail when it lands.

### Round 3's out-of-sample confirmation

The classifier decides what a divergence *is*, so trusting it to prove its own
correctness would be circular. Round 3 therefore took five repros from its sweep
— four of them positions no earlier round had seen — and re-adjudicated each with
the **canonical engine**, once with the position's own `ruleset: 'phasing'` and
once with the same board as `'standard'`, reading the verdict, the method and the
rescuing witness off `analyzeHomeDefenseEvidence` both times.

The prediction, if the debt is exactly "the packed prover implements Standard's
home defence and nothing else is wrong", is precise: `replica == canonical under
Standard`, `replica != canonical under Phasing`, and the two packed states apart
in the `result` field alone. All five matched it.

| seed | action | replica | canonical Phasing | canonical Standard | fields apart | Standard-only arm |
|---|---|---|---|---|---|---|
| 118 | `PAY_UPKEEP` | `1.4` mate | `rescue` (search, 2 nodes) | `mate` (**damage_bound**, 0 nodes) | 1 (`result`) | release of the only attacker, `shadow_2` rent 1 vs bank 0 |
| 104 | `END_ACTION_PHASE` | `1.4` mate | `rescue` (search, 2 nodes) | `mate` (**damage_bound**, 0 nodes) | 1 (`result`) | same, `lightning_1` occupier on (9,9) |
| 145 | `PAY_UPKEEP` | `0.0` ongoing | `mate` (search, 52 nodes) | `rescue`, `upkeep_choice` + `blocker_clearing` | 1 (`result`) | forced release of `water_2` (rent 1, bank 0) frees (1,1) on the only route |
| 134 | `END_ACTION_PHASE` | `0.0` ongoing | `mate` (search, 1 node) | `rescue`, `upkeep_choice` | 1 (`result`) | keep 4 of 5, the released body was blocking |
| 128 | `END_ACTION_PHASE` | `0.0` ongoing | `mate` (**damage_bound**, 0 nodes) | `rescue`, **`promotion`** | 1 (`result`) | a promotion out of a bank of 8 |

Three things came out of this that the previous rounds did not have.

**1. The promotion arm is real, not just constructible.** Round 2 pinned it with a
hand-built position and observed only the release arm in the wild; seed 128 is a
live fuzz observation of it — `PAY_UPKEEP[keep 10] → PROMOTE_UNIT → END_PLACE →
MOVE → MOVE → MOVE → ATTACK`, from a defender holding 8 crystals. The
classifier's two-mechanism predicate (`standardRescueExceedsPhasing`) is what
recognised it, and a promotion-blind predicate would have reported it
unclassified, which is the failure mode round 2 built the predicate to avoid.

**2. Both classes are the same term with opposite signs.** Every one of these five
turns on `preparing` alone, and four of the five have a defender with a bank of
**0** and exactly one rent-bearing body. When Standard releases that body it
*shrinks* the defence — and which way the verdict then moves depends only on what
the body was doing:

- it was the **attacker** → the bound loses the damage, class 1, the replica
  invents a mate (seeds 118, 104);
- it was a **blocker** on the attacker's route → the search gains a path, class 2,
  the replica misses a mate (seeds 145, 134).

That is why one change closes both, and why "Standard's rescue set is strictly
larger" was never a safety argument: the *set* is larger, the *bound* is weaker,
and the bound runs first.

**3. Nothing else diverges.** Across all five, exactly one of the 26 digest fields
differed — never a square, a bank, a reserve, a key, the pending plane, the phase,
the clock or the material. The replica's Phasing state transition is not implicated
in any of the 71 divergences seen in 48.75M actions.

### Round 3's strengthenings

Both were places where the M2 lane checked less than it could, found by looking at
what the sweep had *newly* touched rather than at what had failed.

**The keep-set cap.** `legalityKeepSetTruncations` had been 0 through rounds 1–2
and fired twice in round 3 (seeds 76 and 87, 2 nodes in 1.25M legality checks).
It is a designed cap, not a divergence — `upkeepActions` enumerates every
affordable subset of up to twelve rent-bearing bodies while the replica's
`KeepSetTable` holds 64 (DESIGN §3.2/§5.10) — so set *equality* is genuinely
undefined at such a node. But the harness *returned* there, leaving the node
asserted only by the per-set soundness loop, which happily accepts **64 copies of
one legal set**. A truncated node now additionally requires the emitted sets to be
pairwise distinct, and requires full equality after all in the one case where
canonical offers no more than the cap (nothing was dropped, so equality survives).
The identical hole existed in the replica-layer test that reaches the same branch
— `tests/ai/hard/state.test.ts`'s `genKeepSets` sweep also did `continue` on
truncation — and is closed the same way, so the property is pinned without needing
a fuzz seed to land on it. Both were verified against the live nodes: seeds 76 and
87 re-run clean with the truncation counted and the new checks passing, and three
further fresh seeds (166–168, 750,000 more actions, all three surfaces) confirm the
strengthened harness is still clean on ordinary nodes — one classified over-claim
on seed 168, nothing else.

**The `compareDigests` exemption.** `tests/ai/hard/make-unmake.test.ts` exempted
*any* `result`-field difference with `HOME_CHECKMATE` on either side, capped at 1%
of applied actions, and justified it with round 1's premise that the packed prover
"can only ever UNDER-claim". Round 2 disproved the premise but recorded the
exemption as out of its lane; round 3 owns that file, so the exemption is now
gated on `classifyKnownProverGap` — the same narrow two-class predicate the fuzz
gate uses, including its full field comparison and its Standard-only-resource
requirement. A mate over-claim against a **solvent** defender, or any other new
shape, now throws instead of being absorbed by the allowance, and the test asserts
that the classified splits account for all of the exempted ones. It passes as
written on the 1,200-position corpus sweep, which is itself a result: every
mate-verdict split in that suite is one of the two documented classes. The stale
"can only UNDER-claim" reasoning is also corrected in `vitest.config.ts`'s
quarantine note for `prover.test.ts`, which still carried it.

## 3. Perft

```
npx tsx lab/hard-ai/perft/run.ts --check                    # canonical
npx tsx lab/hard-ai/perft/run.ts --check --engine replica   # replica
```

Both: `fixturesChecked: 7`, `fixturesMismatch: 0`, `digestMismatches: 0`.
The Phasing initial triple **14959 / 1850 / 797** matches under both engines, and
the Standard triple 14959 / 1053 / 797 is still computed and checked under
`--engine canonical` so the M1 gate row keeps its meaning.

Counts are **frozen**: `lab/hard-ai/perft/fixtures.json` is schema
`muju-perft-fixtures-v2` and this round flipped `replicaAgreed` to **true**, which
is the record that the replica reproduced every frozen number. The seven Phasing
fixtures (`prepare-broke`, `prepare-rich`, `full-turn`, `pendings-both-sides`,
`arrival-and-refund`, `upkeep-review-pending`, `home-occupation`) each carry a
`positionDigest` checked *before* the counts, so a drifted recipe reports as a
drifted position rather than as a count mismatch.

`sequences` is not comparable to any pre-M2 number: Prepare is enumerated as an
unordered set, which is exact under Phasing (and only under Phasing) because a
BUY records a commitment instead of placing a unit, so no Prepare action changes
occupancy and therefore none changes another's spawn validity.

## 4. Tests

```
npx vitest run       ->  132 files, 1861 tests, 0 failures, exit 0
npm run hard:test    ->   38 files,  497 tests, 0 failures
```

Both re-run after every round-3 edit. (This table said `35 / 479` for `hard:test`
until round 3; that was round 1's count, left stale when round 2 added its two
files.) Round 2 added 2 files and 18 tests to the green run (130/1843 ->
132/1861); round 3 added assertions to two existing files rather than files of its
own. Nothing was deleted in any round.

### Changed in round 3

Both changes are strengthenings of existing replica-layer assertions, described
under [Round 3's strengthenings](#round-3s-strengthenings):

- **`tests/ai/hard/state.test.ts`** — the `genKeepSets` differential sweep used to
  `continue` past a truncated node, which left the ranked-and-capped branch
  asserted only by "every emitted set is canonically legal". It now also requires
  the 64 emitted sets to be pairwise **distinct**, and requires full set equality
  in the one case where truncation dropped nothing.

- **`tests/ai/hard/make-unmake.test.ts`** — the `compareDigests` mate-verdict
  exemption is now gated on `classifyKnownProverGap`, so only the two documented
  M4 prover classes are tolerated and an unclassified mate split throws. Its
  header carried round 1's disproved "can only ever UNDER-claim" reasoning, which
  is corrected in place.

### Added in round 2

- **`tests/ai/hard/phasing-prover-underclaim.test.ts`** (new, 6 tests) — the
  pinned reproduction of divergence class 2, both mechanisms: the promotion arm
  with its exact cash boundary (the engines agree below `fire_1`'s promotion cost
  of 4 and diverge at and above it), and the blocker-release arm minimised from
  the real seed-38 position to three units. Two of its cases measure the
  mechanism on the **canonical engine alone** — mate with the blocker present,
  rescue with it gone — so they stand whatever the replica does, and one asserts
  the defender can afford no promotion there, guarding against the file silently
  drifting into testing the same arm twice. Its last case asserts the replica's
  *wrong* answer on purpose and is the M4 tripwire.

- **`tests/ai/hard/fuzz-known-gap.test.ts`** (new, 9 tests) — the classifier from
  both sides, described under §2. Four of the nine are refusals, which is the
  half that matters.

### Added in round 1

Changed in round 1 (all in this lane):

- **`tests/ai/hard/income.test.ts`** — the corpus case was the one genuine
  replica-layer failure left: `core/income.ts` is in the replica lane and its
  corpus test packed Standard positions straight from
  `lab/hard-ai/positions/{authored,fuzz-1000}.jsonl`. Now read through
  `asPhasing`, like `state.test.ts` and `make-unmake.test.ts` already do, with
  the canonical engine asked about the *same* state the replica packed.
  Also **added** a case pinning that income, upkeep and rent ignore the pending
  plane: a commitment is a debited bank entry and nothing else until it arrives,
  so it mines nothing and owes no rent. An implementation that folded the plane
  into either sum would surface here rather than as a search-score drift ten
  layers up. 8 tests, all green.

- **`tests/ai/hard/verify-replay-phasing.test.ts`** (new) — `verify/replay.ts` is
  in the M2 replica lane, but every case in `tests/ai/hard/replay.test.ts`
  reaches `verifyTurn` through `search-fixture.ts`, which builds a `HardEngine`
  and asks `gen/**` for candidates. Quarantining that file would have left the
  module with **no Phasing coverage at all** while the turn shape changed
  underneath it. This file builds its `Turn` records by hand instead: a legal
  line is walked with the replica's own `genActions`/`genPlace`/`genKeepSets`,
  the packed actions are copied into a `Turn` and `endLo`/`endHi` are read off
  the replica's own end position. Five cases: a macro turn crossing END_ACTION
  and END_PLACE (>50 of 120 trials cross both), a turn whose Prepare records a
  commitment (>40 trials), a hand-off resolving the *other* side's commitments
  into arrivals (>60 trials), truncation at the first refused action, and a
  one-bit-wrong `Kpos` caught by the re-pack comparison. The prover
  over-claim above is the one thing it tolerates, via a `knownProverGap`
  predicate that matches only a canonical `home-checkmate` victory reached inside
  the line and is capped at 12 of 120 trials.

- **`tests/ai/hard/phasing-prover-debt.test.ts`** (new, 3 tests) — the pinned
  reproduction of divergence class 1 in §2, plus the one-crystal control. Its
  third case asserts the replica's *wrong* answer on purpose and says so in the
  loudest terms available; when M4 fixes the prover that case fails, which is the
  tripwire. Delete it then, together with
  `tests/ai/hard/phasing-prover-underclaim.test.ts`, and take
  `tests/ai/hard/prover.test.ts` out of quarantine instead.

Across both rounds: nothing was deleted, no replica-layer assertion was weakened,
and no Standard golden was re-pinned to a Phasing value.

---

## Quarantine

**One place**: the `M2_QUARANTINE` array at the top of `muju/vitest.config.ts`,
applied through vitest's `exclude`. `MUJU_RUN_QUARANTINE=1` disables it, which is
how M4/M5/M6 will drive their ports:

```
MUJU_RUN_QUARANTINE=1 npx vitest run tests/ai/hard/pvs.test.ts
```

File-level exclusion is the only mechanism available: `tests/lab/**` is outside
this lane's editable set, so per-case skips there were not an option, and the
brief asks for one list rather than edits spread across 27 files.

Every file below still fails for a *correct* reason — it builds a Standard
fixture that `pack` now refuses, or asserts Standard's turn shape. None was
edited. "passing" is how many of its cases passed before being parked, which is
what the restoring milestone owes back: **246** measured file by file, 245 in a
whole-suite run (one `root-exposure` case passes in isolation and fails under the
full run's load). A further **123** cases in these files were already failing.

### M4 — the turn generator (`gen/**`)

A Phasing BUY takes no slot, places no unit and never auto-advances Prepare, so
every place-plan, pool and enumeration assumption here is Standard's.

| file | layer | passing |
|---|---|---|
| `tests/ai/hard/canonical.test.ts` | `gen/actionsearch` + `gen/turn` set-equality gate | 17 |
| `tests/ai/hard/generate.test.ts` | `gen/generate` candidate contract | 11 |
| `tests/ai/hard/gen-trace.test.ts` | `gen/trace` interior nodes | 13 |
| `tests/ai/hard/purchase.test.ts` | `gen/purchase` `planPurchases` spend / `spawnAfter` | 19 |
| `tests/ai/hard/turnpool.test.ts` | `gen/turn` pool + `decodeTurn` replay | 10 |

### M4 — the prover (`tactics/prover.ts`)

Carries the live verdict divergence of §2, not merely failing assertions.

| file | layer | passing |
|---|---|---|
| `tests/ai/hard/prover.test.ts` | `tactics/prover` verdicts | 9 |
| `tests/ai/hard/p8-rescue-cap.test.ts` | P8 rescue-cap pin | 1 |

### M4 — `tables/home`

Its lines are "BUY, END_PLACE, MOVE the bought unit"; under Phasing the buy
arrives a turn later, so the line is no longer legal end to end.

| file | layer | passing |
|---|---|---|
| `tests/ai/hard/home.test.ts` | `tables/home` `homeRaceAvailable` | 13 |

### M4 — the search (`search/**`) and the engine

| file | layer | passing |
|---|---|---|
| `tests/ai/hard/pvs.test.ts` | `search/pvs` | 1 |
| `tests/ai/hard/quiesce.test.ts` | `search/quiesce` | 1 |
| `tests/ai/hard/order.test.ts` | `search/order` + `tt` | 8 |
| `tests/ai/hard/search-tie-break.test.ts` | `search/order` tie-break arm | 2 |
| `tests/ai/hard/root-exposure.test.ts` | `search/root` + `search/probe` | 25 |
| `tests/ai/hard/mate-score.test.ts` | search mate scoring through the engine | 7 |
| `tests/ai/hard/p6-stoppable-generation.test.ts` | P6 stoppability pin, `search/time` | 1 |
| `tests/ai/hard-engine-fallback-elapsed.test.ts` | engine fallback kind: now `pack-error`, not `engine-error` | 2 |

### M4 — `verify/replay`, only because its fixture needs the generator

Covered for M2 by `tests/ai/hard/verify-replay-phasing.test.ts`; returns as
written in M4.

| file | layer | passing |
|---|---|---|
| `tests/ai/hard/replay.test.ts` | `verify/replay` via the generator | 1 |

### M5 — the lab suites and the reference/bench harnesses

| file | layer | passing |
|---|---|---|
| `tests/lab/suites.test.ts` | `suites/run` over the engine | 0 (the file failed to collect) |
| `tests/lab/exam.test.ts` | exam over `search/root` + `pvs` | 23 |
| `tests/lab/reference.test.ts` | engine reference determinism | 21 |
| `tests/lab/analyze.test.ts` | `analyze/replay` over `search/root` | 10 |
| `tests/lab/profile.test.ts` | `bench/profile` over the whole stack | 7 |
| `tests/lab/turn-allowance.test.ts` | `search/pvs` turn allowance | 21 |

### M6 — the evaluation (`eval/**`) and the tables that feed it

| file | layer | passing |
|---|---|---|
| `tests/ai/hard/eval-correct.test.ts` | `eval/evaluate` + features + invariants | 15 |
| `tests/ai/hard/approach-tie.test.ts` | `tables/approach` tie-break | 0 |
| `tests/lab/eval-audit.test.ts` | `audit/eval-audit` over eval weights | 3 |
| `tests/lab/recall.test.ts` | recall over eval weights | 5 |

---

## Remaining, for the milestones that own it

1. **The prover over-claim, class 1 of §2.** The one *unsound* open issue. M4.
   Pinned by `tests/ai/hard/phasing-prover-debt.test.ts`. Until it is fixed the
   packed engine can believe in a mate that does not exist, at roughly **1
   position in 750k** applied actions over the combined 48.75M (65 observations).
   Round 3 confirmed two of them out of sample against the canonical engine: in
   both, canonical under Phasing rescues in 2 nodes and canonical under Standard
   returns `mate` from the **damage bound at 0 nodes**, which is the replica's
   answer exactly.

2. **The prover under-claim, class 2 of §2.** Safe for search soundness — the
   engine misses a mate rather than inventing one — but a real divergence from
   canonical, and the same three-line M4 change closes it. Round 2 had a single
   observation; round 3 has five more, so the rate is now measured rather than
   guessed at roughly **1 in 8M** applied actions (6 in 48.75M), and its
   *promotion* arm finally has a live observation (seed 128) rather than only a
   constructed one. Pinned by
   `tests/ai/hard/phasing-prover-underclaim.test.ts`.

   Both classes together are the reason criterion 2 is not clean, and both live
   in one out-of-scope file. **Widening this lane to `tactics/prover.ts` is the
   single change that would finish criterion 2.**

3. **Keep-set completeness above the 64-set cap is undefined, by design.** The
   replica's `KeepSetTable` holds `KEEP_SET_CAPACITY = 64` ranked sets while
   `upkeepActions` enumerates every affordable subset of up to twelve rent-bearing
   bodies, so at a truncated node no differential comparison can assert set
   equality. Round 3 was the first sweep to reach one (2 nodes in 1.25M legality
   checks) and now asserts everything that *is* defined there — per-set soundness,
   pairwise distinctness, and equality when canonical offered no more than the cap
   — but the cap itself remains a real limit on what the fuzzer can prove about
   very rich upkeep positions. Raising it is a generator-milestone decision, not
   an M2 one.

4. **`Replica.needsProof`'s mode-0 assertion order.** `proverMode === 0` asserts
   before the new Phasing phase gate, so it now throws on ACT positions where the
   gate would have returned false anyway. Deliberate — mode 0 keeps its contract
   rather than silently widening — but a mode-0 caller that relied on Standard's
   timing sees the throw move from the MOVE to the END_ACTION.

5. **Unit-id fidelity for arrivals bought inside the search.** Canonical mints a
   pending's id at BUY time (`unit-<player>-<buyTurn>-<n>`) and the unit inherits
   it on arrival, usually on a later turn; `unitIdFor` derives from the *current*
   turn number, so such an arrival is named differently and
   `toAIAction`/`fromAIAction` can fail to decode it on a line crossing an
   END_PLACE. `pendIds` preserves fidelity for root commitments and design item G
   says search arrivals need no name, so this is within spec. It does not affect
   `verifyTurn`, which replays a single macro turn and so never has to name an
   arrival (checked this round). A real fix needs the buy turn stored in the
   plane. M4, with the generator.

6. **`lab/hard-ai/verify/gates.ts` still gates M1 on the Standard triple**
   (`perftActions_initial_4`, `perftMidStates_initial`, `perftTurns_initial`).
   Those keys stay meaningful under `--engine canonical` but are `null` under the
   Phasing-only replica. A replica-engine gate row needs a criterion naming
   `phasingActions_initial` / `phasingMidStates_initial` / `phasingTurns_initial`
   instead. Outside this lane.

7. **`corpus.ts mirror180` does not mirror `pendingSummons`**, so a mirrored
   Phasing position keeps a side's commitments on its old squares while the units
   move. Pinned by a test in `tests/ai/hard/perft.test.ts`; must be closed before
   any Phasing symmetry work (the eval-symmetry gate, corpus doubling). Outside
   this lane.

8. **The position corpora are still Standard**
   (`positions/{fuzz-1000,economy,tactics,openings,authored}.jsonl`), which is why
   the replica-layer corpus tests read them through `asPhasing`. That helper
   builds a Phasing position over the same *board* and is not the ruleset
   reinterpretation design item A forbids, but a Phasing-native corpus would be
   better. `hard:fuzz --sample` now emits Phasing positions tagged `phasing`.

9. **`MAX_TURN_ACTIONS = 24` is too small in principle.** A Phasing BUY takes no
   slot, so purchases in one Prepare are bounded by the bank rather than the
   board, and a rich side can exceed 24 half-actions. Only `gen/**` reads it, so
   the buffers it sizes belong to the generator's milestone. Documented at the
   constant in `types.ts`.

10. **`UNDO_WORDS = 8192` has less headroom.** END_PLACE is now the widest record
   at up to ~1,300 words (9 per commitment + 4 per healed unit). Every current
   driver unwinds in lock step or resets `top` per applied action, so nothing
   overflows today. Revisit if a caller ever holds several macro turns at once.

11. **`pack` accepts a tier-2+ pending summon.** Unreachable (`BUY_UNIT` is
   tier-1 only, `legality.ts:28`) and `check()` throws on it, but a reader may
   expect `pack` to own that refusal alongside the cost mismatch. Left as design
   item A specifies.

12. **The tag `standard-final` does not exist.** The pre-M2 Standard fixtures are
    blob `a96e09d7` at commit `2922375e`, recorded in a comment at the top of
    `lab/hard-ai/perft/phasing-fixtures.ts`;
    `lab/hard-ai/positions/authored.jsonl` is untouched on disk.

13. **Arrival-surface positions are reached by state surgery** (synthesised
    commitments, teleported units) rather than proven reachable by legal play —
    deliberate, since "a commitment that was valid when paid is invalid at
    arrival" is rare in legal play. Every one is validated against
    `lab/harness/invariants` plus unit/bank/square checks, and 0 cases were
    skipped at current settings.

No disagreement with `docs/PHASING-2026-09-16.md` was found in the canonical
engine in any round. The canonical engine was right in all **71** fuzz divergences
across the three rounds, and right again in round 2 where a first guess at the
under-claim's cause was wrong: the mechanism was read off `homeCheckmate.ts`'s
three `prepare` arms and confirmed against the engine, not assumed. Round 2's
first classifier keyed the under-claim on promotion affordability alone, which
failed to recognise the real seed-38 position — the engine corrected it, and the
predicate now states the condition under which Standard's rescue set is strictly
larger than Phasing's. Round 3 asked the canonical engine the same question a
sixth way, under each ruleset in turn on five fresh repros, and it answered
consistently every time.

No round edited the canonical engine, `src/game/**`, or anything else outside its
permitted set. Round 3 touched only `lab/hard-ai/fuzz/differential.ts`,
`tests/ai/hard/{state,make-unmake}.test.ts`, `vitest.config.ts` and this document,
and ran no `git add/commit/stash/checkout/reset`.

---

## Reproducing this round

```
cd muju
npm run hard:types
npx tsc --noEmit -p .
npx vitest run
npx vitest run tests/ai/hard                 # the hard:test row
npx tsx lab/hard-ai/perft/run.ts --check
npx tsx lab/hard-ai/perft/run.ts --check --engine replica

# round 3's sweep: 90 fresh seeds, ~15 minutes total on a loaded box
for s in $(seq 76 115); do
  npx tsx lab/hard-ai/fuzz/run.ts --actions 250000 --arrival-cases 400 --seed $s --allow-known-prover-gap
done
for s in $(seq 116 165); do
  npx tsx lab/hard-ai/fuzz/run.ts --actions 400000 --surfaces transition --arrival-cases 1 --seed $s --allow-known-prover-gap
done

# round 2's sweep: 55 fresh seeds, all three surfaces, ~12 minutes total
for s in $(seq 21 75); do
  npm run hard:fuzz -- --actions 250000 --arrival-cases 400 --seed $s --allow-known-prover-gap
done

# round 1's sweep, for the combined totals
for s in $(seq 1 8);  do npm run hard:fuzz -- --actions 250000 --arrival-cases 600 --seed $s --allow-known-prover-gap; done
for s in $(seq 9 20); do npm run hard:fuzz -- --actions 250000 --surfaces transition,legality --seed $s --allow-known-prover-gap; done
```

Expected: vitest, perft and every fuzz seed exit 0, with
`unclassifiedDivergences: 0` on all of them. 38 of round 3's 90 seeds report a
non-zero `divergences`, every one classified (the list is in §2); seeds 76 and 87
additionally report `legalityKeepSetTruncations: 1`, which is the designed cap and
not a mismatch. 16 of the 55 round-2 seeds report a non-zero `divergences`, every
one of them classified: seed 38 carries one of each class, seeds 47 and 61 carry
two over-claims each, and seeds 25, 31, 43, 44, 49, 50, 57, 59, 67, 69, 70, 72, 75
carry one over-claim each.

Drop `--allow-known-prover-gap` to see the strict gate: those 16 seeds then exit
1, which is the round-1 behaviour and remains the default. `unclassifiedDivergences`
fails a run either way. Divergence repros land in
`lab/results/hard-ai-fuzz-<date>/` and each one records its own `knownGap` label.

The two reproductions need no fuzzing at all:

```
npx vitest run tests/ai/hard/phasing-prover-debt.test.ts \
               tests/ai/hard/phasing-prover-underclaim.test.ts \
               tests/ai/hard/fuzz-known-gap.test.ts
```
