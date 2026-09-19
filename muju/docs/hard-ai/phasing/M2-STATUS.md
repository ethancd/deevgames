# M2 — the packed replica becomes Phasing-only

Status of the M2 exit criteria on `claude/hard-phasing-m2`, worktree
`/Users/ashkie/src/deevgames-claude-hard-m2`, after **round 6**.

Round 4 widened the lane to `src/ai/hard/tactics/prover.ts` and closed every
divergence class rounds 1-3 had documented as debt. Round 5 closed something
else: two places where the EVIDENCE could not have seen a bug, found by an
independent review (Codex) which, for the second one, did not argue the point
but proved it with a fault-injection probe. Round 5 found no new replica defect
— it made two green checks mean what they had been claimed to mean, and it is
now shown, test by test, that each surface's counter can move. §2.5.

**Round 6 found a real one, in the adjudicating path.** The same independent
review supplied two minimal legal reproductions showing that the replica derived
canonical `board.units` ORDER from the slot index, which stops being the
canonical order as soon as an arrival reuses a dead slot — and that order decides
a capped `analyzeHomeDefense` verdict. Order is now carried as state (`ord` /
`pendOrd`), and the three independent reasons 28.55M fuzzed actions could not have
seen it are each closed. §2.6.

**Spec**: `muju/docs/PHASING-2026-09-16.md`.
**Oracle**: `src/game/{rules,turn,summoning,legality,homeCheckmate,board}.ts` and
`src/ai/simulate.ts`. Where this document and the canonical engine disagree, the
canonical engine wins.

---

## Verdict

| # | Exit criterion | Result |
|---|---|---|
| 1 | `npm run hard:types` and `npx tsc --noEmit -p .` clean | **PASS** |
| 2 | `npm run hard:deps` clean | **PASS** (44 files, 0 violations) |
| 3 | `hard:fuzz` on **all five** surfaces — transition, legality, arrival, **prover**, **gate-preservation** — 0 divergences of every kind | **PASS**. Round 4: 28.55M walk actions. Round 5, with the FULL-STATE unmake comparison: a further 6.5M + 6.5M gate actions, all zero (§3.1). Round 6, with canonical-ORDER comparison and the INCREMENTAL prover comparison added: 6.5M walk + 6.5M gate actions again, all zero, on 4.6M order-sensitive prover comparisons of which 645,000 were on order-permuted states (§3.2) |
| 4 | `hard:perft --check` under both engines equal, counts frozen | **PASS** in every round including 6, nothing moved; `fixtures.json` byte-identical (sha256 `76db5122…`), `fixturesMismatch 0`, `digestMismatches 0`, `replicaAgreed true` under both `--engine canonical` and `--engine replica` |
| 5 | Full `npx vitest run` green | **PASS**, 138 files / 1,917 tests (`hard:test`: 42 files / 530) |
| — | Upper layers kept compiling, their tests quarantined in one place | **PASS**, one file fewer |
| — | Every surface's zero counter is shown to be able to MOVE | **PASS**, 17 fault-injection cases in `tests/lab/fuzz-fault-injection.test.ts` (§2.5.3), including round 6's reproduction of the arrival-order defect through the public seam |

**Round 4 is the round in which criterion 3 became clean.** Rounds 1-3 ended with
**71** transition divergences (4 + 19 + 48, the split this document's own table
below records; an earlier draft of this paragraph said 49, which matched nothing),
all of them the same out-of-scope file — the packed
prover implementing STANDARD home defence while the replica is Phasing-only — and
with two loud exemptions (`--allow-known-prover-gap` and a `compareDigests` mate
allowance) holding the gate open for them. Both exemptions, the classifier that
gated them, and both divergence classes are gone. Alongside that, round 4 fixed
three defects two reviewers raised that were **not** the prover: a
hash-only distance-cache hit that predates Phasing and is still on `master`, a
`Kturn` alias on `progressThisTurn`, and three occupancy lanes that no
differential surface compared.

---

## 1. Typecheck and layering

```
npm run hard:types      # tsc -p lab/hard-ai/tsconfig.json --noEmit   -> clean
npx tsc --noEmit -p .                                                 -> clean
npm run hard:deps       # -> {"filesScanned":44,"violations":[],
                        #     "layeringViolations":0,"nondeterminismViolations":0,
                        #     "bigintViolations":0}
```

All three clean, and clean again after every round-4 edit. `hard:deps` matters
here specifically: removing `WITNESS_KEEP` deleted the only reason
`tactics/prover.ts` imported `core/spawn.ts` and the only reason
`search/root.ts` imported `KEEP_SET_CAPACITY`, and the layering check confirms
nothing new was reached for in their place.

## 2. What round 4 changed

### 2.1 The packed prover is Phasing (ACT-ONLY)

`src/ai/hard/tactics/prover.ts` mirrored `analyzeHomeDefense`'s **Standard**
shape: `prepare` (keep / keep+promote / release at the old tier, per owned unit)
and then `act`, with the damage bound charging rent. Canonical Phasing is
act-only:

```
bound   = enoughPossibleDamage(ready, target, !isPhasing(state))   homeCheckmate.ts:78
rescued = isPhasing(state) ? act(ready, []) : prepare(0, cash, [], [])  homeCheckmate.ts:160
```

Because `Replica.make` consults this module inside the transition, Standard's
logic leaked into adjudicated results in **both directions**:

- **over-claim (UNSOUND)**, ~1 in 750k applied actions: `damageBoundCore` skipped
  any defender unit with `rent > cash`, and both entry points passed
  `preparing: true`. A BROKE defender was treated as having no army, the
  admissible bound reported "not enough possible damage", and `runProver`
  returned MATE at `method: 1` with **zero** search nodes — never reaching the
  rescue search that would have refuted it.
- **under-claim**, ~1 in 8M: Standard's `prepare` could promote a unit or DROP a
  tier-2+ one, and dropping one takes a friendly **blocker** off the attacker's
  route. The prover found defences Phasing forbids and missed mates canonical
  awards.

The fix, at cause:

| what | before | after |
|---|---|---|
| `damageBoundCore` | `(dp, preparing)`, with a rent term, a `rent > cash` skip and a promoted-attacker choice | `(dp)`, written for `preparing === false` only |
| `damageBound` (proverMode 1) | `damageBoundCore(sc..., true)` | `damageBoundCore(sc...)` |
| `runProver` | `damageBoundCore(dp, true)` then `prepare(0, defenderCash)` | `damageBoundCore(dp)` then `act(0)` |
| `buildOwned` | slot order, **stable-sorted by distance** to the occupier | slot order, **unsorted** |
| `homeWitness` | `PAY_UPKEEP` + promotions + conditional `END_PLACE` + the act line | the act line alone |

`buildOwned` is the subtle one and it is a correctness change, not a cleanup.
Canonical `act` iterates `s.board.units.filter(u => u.owner === defender)`. Under
Standard that array was `[...enemy, ...kept]`, rebuilt by `prepare` in its own
distance order, so the replica's distance sort was right. Under Phasing `act`
receives `ready.board.units` — the original array — so imposing a distance sort
reorders every candidate list below it and moves the node count.

**Round 4 then got the replacement order wrong, and round 6 fixed it.** This
section used to say the original array "is ascending slot order because `pack`
assigns slot `i` to `state.board.units[i]`". That is true of a FRESHLY PACKED
state and false of every state reached incrementally: an arrival takes the lowest
DEAD slot, while canonical APPENDS it (`summoning.ts:24`). It also said
arrivals resolve in ascending-square order, which is the replica's own slot
allocation and not canonical's order at all — canonical resolves in
`pendingSummons` (commit) order, and canonical wins. Canonical order is now a
plane of its own (`PackedState.ord`) and `buildOwned` sorts by it. See §2.6.

**Node accounting was verified against `homeCheckmate.ts`, not assumed.**
Canonical spends a node in `prepare` and in `act`; under Phasing `prepare` is
never entered, so the replica spends exactly one node per surviving `act` node
and none anywhere else. That is what makes UNKNOWN-at-cap verdicts agree, and the
prover surface checks it directly (`nodeMismatch`, below).

Everything that became dead was **deleted**, not left in place: `prepare`,
`recordPrepareLeaf`, `WITNESS_KEEP`, `canActInPlace`, the `leafView`/`newLeafView`
machinery, `SPAWN_SCRATCH`, `P_PROMOTED`, `WITNESS_KEPT_SLOTS`,
`WITNESS_PROMO_SLOTS`, `OWNED_KEY`, `defenderCash`, `witnessCash`,
`witnessKeptCount`, `witnessPromoCount`, and the `preparing` branch of the bound.

**Consumers, adjusted only as far as needed to COMPILE** (gen/** and search/**
remain Standard and quarantined until M4; none of their logic was ported):

- `gen/generate.ts`: `RescueWitness` loses its `KeepSetTable` parameter —
  `(p, invader, out) => number`. The parameter existed only so the installer
  could copy the prover's private witness keep-set into the node's table.
- `search/root.ts`: `adoptWitnessKeepSet`, `KEEP_WORDS` and the
  `export { WITNESS_KEEP }` re-export are gone; `installRescueWitness` is one
  line.

### 2.2 The distance cache accepted a hit on a 32-bit hash — **and this is on `master`**

`core/movement.ts`'s `DirectMappedDistanceCache.get` validated a hit with
`keyOrigin === origin && keyHash === p.occHash`. `occHash` is a 32-bit XOR fold
over occupied squares (`recomputeOccHash`), so **distinct occupancies collide**
and the cache could return another position's BFS distance row — making
`Replica.genActions` and `isLegal(MOVE)` impure. Fixed the way the second-level
`DirectMappedReachMemo`/`MemoTable` already did it: the four occupancy words are
stored with the entry and compared on a hit, and a mismatch is a miss. `occHash`
remains the bucket selector and nothing else.

**This defect PREDATES Phasing.** It is in the engine shipped on `master` and is
not an M2 regression; it is fixed here because M2's own generators sit on top of
it.

`tests/ai/hard/distance-cache-collision.test.ts` (new, 5 cases) builds the
collision deterministically. The hash is linear over GF(2), so a nonempty
dependency among the per-square words is found by Gaussian elimination over a
fixed candidate list — squares 50..82, giving

```
WALL_SQUARES = [50, 52, 55, 60, 62, 63, 66, 67, 69, 70, 75, 78, 79, 81, 82]
```

whose 15 words XOR to zero. Two packed states — a mover on square 0 with those 15
squares walled, and the same mover on an empty board — therefore share
`occHash = 2334605397` while their `occ` words differ. The test asserts the
collision is real, that the true BFS rows differ, that one shared
`DistanceCache` returns the correct row for BOTH in sequence, and that
`Replica.genActions` offers the walled squares as MOVE destinations under one and
never under the other. **Verified to FAIL on the unfixed code** (2 of its 5 cases,
in exactly the predicted way) and to pass on the fixed code.

**No golden, determinism or frozen pin moved.** Nothing changed status in the
suite before and after the fix, and both perft engines still reproduce every
frozen count — so no pin had encoded a collision.

Audited alongside it: every other cache/TT/memo under `src/ai/hard/**` that could
accept a hit on a hash alone where a full key is cheaply available. Nothing else
is the same bug class. Worth recording:

| site | key on a hit | can a false hit change an observable result? | action |
|---|---|---|---|
| `core/movement.ts MemoTable` (reach memo) | full 5- or 8-word key | no | already correct |
| `gen/actionsearch.ts TurnTT`, `gen/generate.ts` dedupe | full 64-bit key + generation stamp | only on a real 64-bit collision | none needed |
| `search/tt.ts TranspositionTable` | index consumes `lo`, only `hi` stored (~50 effective bits) | score: yes, standard TT tradeoff; best move: no — `search/order.ts` only credits a `bestEndLo` against a turn the generator itself produced | none |
| `search/tt.ts ProofCache` | ~47 effective bits | heuristic, and inert (df-pn is an M14 stub) | none |
| `tactics/prover.ts FailedSet` | full 64-bit Zobrist pair, both lanes, reset per run | in principle yes | **deliberate**: it is the packed replica of canonical's `Set<string>`; ≈2.7e-10 per call at 1e5 nodes |
| `core/catalog.ts catalogSignature` | one **32-bit** signature, underlying rules never compared | structurally the same idiom, but the keyspace is a handful of dev/test rule configs and it is consulted at setup, never search-driven | **reported, not fixed** — see REMAINING 9 |
| `book/**` | full 64-bit key + candidate-list membership + a canonical `verifyTurn` replay | no | none needed |

### 2.3 `progressThisTurn` is now in `Kturn`

`progress` was in no key. Under Standard that was survivable: it is set by a
capture, and a capture leaves `atkCount`/`F_LAST_KILLED` evidence on the killer,
which `Kturn` hashes. Under Phasing that evidence can be **erased inside the same
turn** — `END_ACTION` settles the mover's own upkeep and `PAY_UPKEEP` can RELEASE
the very body that made the capture, taking its square, its attack count and its
kill flag off the board. Two reachable Prepare states then agree on `Kpos` and on
every `Kturn` extra and differ only in `progress`, and their `END_PLACE`
successors differ: clock reset to 0 against clock incremented. The inactivity
draw is a terminal, so a within-turn TT sharing that entry answers with a wrong
game result, not a wrong heuristic.

A one-key `progress` plane is **appended after `pend`** in `buildZobrist`, folded
into `Kturn` when `progress === 1` (`xorKturnExtras`, so `check`'s from-scratch
recompute carries it), and maintained through a `setProgress` helper used by every
mutation path and both unmake paths (`makeAttack`, `makeEndPlace`, and the
`ATTACK`/`END_PLACE` cases of `unmake`).

Because the fill is append-only and `progress` is 0 at every hand-off by
construction (`turn.ts:120-124` clears it), **no macro-boundary key moved**: the
macro TT, the book and the perft fixtures all key positions that have
`progress === 0`, and their keys are bit-identical. `tests/ai/hard/zobrist.test.ts`
pins the fill order and the append (`progress` last, `pend` before it).

`tests/ai/hard/progress-key.test.ts` (new, 4 cases) plays the reviewer's alias
through both engines: White's `fire_2` kills Black's `water_1`, `END_ACTION`, then
a `PAY_UPKEEP` that releases the `fire_2`; against the same board with no victim
at all. Measured: `Kpos` equal, `pieceAt` equal on all 100 squares, `phase`,
`actions`, `upkeepPending`, `clock` and `side` equal, `progress` 1 against 0,
`Kturn` **different** — and different by *exactly* the progress key, so nothing
else was re-keyed. Then `END_PLACE` from each: clock 0 against clock 1, with the
canonical engine agreeing on both.

### 2.4 The differential's blind spots

`lab/hard-ai/fuzz/differential.ts`:

- **`occ`, `occBy`, `occTier` were compared by nothing.** `firstDifference` and
  `Replica.digest` both walk `pieceAt`; `occHash` is computed from `sq`;
  `Replica.check` proves `occ`/`occBy` self-consistent but never equal to
  canonical's, and proves nothing at all about `occTier`. All three are now
  compared word by word, next to the `pendBB` loop.
- **`replica.check(p)` now runs on EVERY action when `--legality-every 1`** is in
  force, and keeps the cheaper 64-action cadence otherwise. `stateChecks` reports
  the count, and `tests/lab/hard-fuzz.test.ts` pins both cadences.
- **RESIGN has a nonzero walk weight.** It is legal in every phase
  (`legality.ts:20,24`) and has one-line make/unmake support, but no generator
  emits it, so the walker injects it on a `--resign-rate` fraction of plies
  (default 0.002) and `pickAction` weights it at 1. The injection is drawn from a
  **separate RNG stream**, so `--resign-rate 0` replays a seed bit-identically to
  a pre-round-4 walk — which is how the seeds of earlier rounds are re-run below
  as true repros, and which was verified by diffing 17 walk counters against
  `HEAD`'s `differential.ts` on seeds 7, 38, 104 and 145 at their original action
  counts (identical on every counter).
- **A TERMINAL HISTOGRAM** is reported and printed. It is keyed
  `<victoryReason>:<winner|draw>@<action>`, because canonical gives the same
  `victoryReason` to an elimination at an ATTACK and to one at the hand-off; the
  action suffix is the only thing that separates them, and without it a coverage
  claim about either branch is unverifiable. §5 is written from it.

`classifyKnownProverGap`, `standardRescueExceedsPhasing`, `defenderRent`, the
`ignoreResult` parameter of `firstDifference`, the `knownGap` field of a
reproducer, the four classifier metrics and the `--allow-known-prover-gap` flag
are all **deleted**. `--allow-standard-surfaces` and the boxed skip it guarded are
deleted too: the prover and gate-preservation surfaces are in the default surface
set and run on every invocation.

## 2.5 Round 5: two validation blind spots, and what closed them

Neither was a wrong answer. Both were checks that could not have reported one.

### 2.5.1 The Phasing replay test exempted its own failures

`tests/ai/hard/verify-replay-phasing.test.ts` is the ONLY active Phasing
coverage of `verify/replay.ts` (`tests/ai/hard/replay.test.ts` is quarantined
until the turn generator is ported), and it carried a `knownProverGap`
allowance: a failed `verifyTurn` was silently accepted whenever the canonical
engine had awarded a `home-checkmate` victory somewhere inside the line, and its
first test tolerated up to **11** such failures out of 120. The allowance was
written for round 3's Standard prover and its header still described the gap as
one-sided ("the packed prover can only ever UNDER-claim"), which round 4 had
already shown to be false of the damage BOUND.

Round 4 removed the cause. Round 5 removes the allowance, the predicate and the
cap: **every** qualifying replayed turn must now verify — canonical accepts
every action AND lands on the exact `Kpos` the replica recorded.

Measured after the removal, with no other change: **0 failures**, on all three
walks — 120/120 turns in the crossing-both-boundaries test, 66/66 in the
commitment test, 83/83 in the arrivals test, 269 verified turns in all. The
exemption had been excusing nothing since round 4; it was excusing the *shape*
of a failure, and would have gone on excusing a real one.

Two assertions were ADDED so "no failures" cannot become true vacuously by the
walk never reaching an adjudication: the first test now counts the lines that
run into a canonical victory (**13**, of which **2** are `home-checkmate` — the
exact class the allowance used to absorb) and requires at least one of each.

### 2.5.2 The unmake check could not see occupancy corruption

The reviewer's finding, and the sharper of the two. In
`lab/hard-ai/fuzz/differential.ts` the immediate unmake identity check compared
`fuzzDigest` — `Replica.digest` (which walks `pieceAt`) plus the pending plane,
the pending counts and both banks. That digest omits `occ`, `occBy`, `occTier`,
`initialReserve`, `gained`, `slotCount`, `catalogSignature`, `proverMode` and
both id planes. Round 4's occupancy comparisons live in `firstDifference`, which
runs only AFTER the action is made a second time — and re-making repairs any
lane `make` writes unconditionally.

It was demonstrated, not argued: a bounded 400-action in-memory probe that
replaced `unmake`'s restored `occTier` with the POST-action values produced
**164 incorrect restorations** while divergences, unmake, legality, rehash,
round-trip and invariant counters all stayed **0**, even at
`--legality-every 1`.

**The fix, at the cause.** `lab/hard-ai/fuzz/statesnap.ts` (new) is a
`PackedSnapshot` driven by the SHAPE of the state rather than by a field list:
every own enumerable property that is an `ArrayBuffer`-backed view is copied and
compared byte for byte, every `number` property is copied and compared, the two
`string[]` id planes are compared entry by entry, and **any other kind of field
is a hard error** — so a field added to `PackedState` later cannot be silently
skipped. It is captured immediately before `make` and compared immediately after
`unmake`, before the re-make. `tests/lab/state-snapshot.test.ts` (new, 4 cases)
asserts the covered key set is exactly `Object.keys(allocState())`, that an
unknown field throws, and — field by field, all 45 of them — that a one-byte
corruption of each is reported.

Applied in **both** places the fuzzer checks unmake: the transition walk and the
ARRIVAL surface (whose `END_PLACE` is the widest `make` in the replica, and so
the one a digest was least able to police). `tests/ai/hard/make-unmake.test.ts`
had the same weakness — 20-odd `expect(replica.digest(p)).toBe(before)` sites —
and every one of them is now a full-state `expectRestores`, including the 1,211-position
sweep and both action-by-action unwind stacks.

**What the stricter check found: no replica defect.** Over 6.5M actions the
full-state comparison reports 0. The one field `make`/`unmake` does not restore
literally is the LENGTH of the two cold id arrays: an arrival taking a slot index
past the current end grows `originIds`, and `unmake` writes `''` back there
rather than shortening it. That is a length with no information in it (`unpack`
reads `''` and absent identically, `core/state.ts:687,714`), so the snapshot
compares the two planes over the UNION of the lengths with absent read as `''` —
which still reports an id LEFT BEHIND at a grown index. Recorded as REMAINING 16.

**A real harness defect it did find.** Injecting a systematic fault hung the
fuzzer: a divergence abandons the game BEFORE `metrics.actions` is incremented,
so a fault present in every game leaves the action budget untouched and
`runFuzz`'s outer loop starts games forever. Both walk loops now stop at their
reproducer cap (32 divergences for the transition walk, 16 for gate
preservation), which a failing run has already reached.

### 2.5.3 Can this check actually fail? — every surface

The general form of the reviewer's question, answered per surface by a test that
injects a fault and watches the counter move. The faults go in through a lab-only
`replica?: Replica` option on `FuzzOptions`/`ArrivalOptions`/`GatePreservationOptions`
that the test fills with a `Replica` SUBCLASS, or through a vitest mock of
`tactics/prover.ts` that is inert until a test arms it: **the production
`Replica` carries no test hooks.**

| surface | what it compares | how we know it can fail |
|---|---|---|
| unmake identity | EVERY field of `PackedState`, byte for byte, captured before `make` and compared after `unmake` | 4 cases: `unmake` leaves `occTier` / `occBy` / `pendBB` / a `uflags` bit wrong → `unmakeMismatches > 0` in a 400-action walk. Reverted to the old `fuzzDigest` comparison, the first three report **0** and only `uflags` is caught — the blind spot, reproduced on demand |
| unmake, ARRIVAL surface | same, around the `END_PLACE` hand-off | `occTier` fault → `unmakeMismatches > 0` in 40 cases; **0** under the old digest |
| digest blindness itself | — | 15 single-field corruptions: `occ`, `occBy`, `occTier`, `pendBB`, `initialReserve`, `slotCount`, `proverMode`, `catalogSignature` and round 6's `ord`, `ordNext`, `pendOrd`, `pendOrdNext` leave `fuzzDigest` bit-identical (12 of 12), while `gained`, `materialCc` and `bank` change it (the control group). The snapshot names all 15 |
| transition | `firstDifference(p, pack(applyAction(...)))`, occupancy lanes included | the second `make` of each action corrupts `occTier` → `divergences > 0` |
| rehash | `recompute{Kpos,Kturn,OccHash}` against the incrementally maintained keys, every 64 actions | `make` flips a bit of `kposLo` that survives the re-make → `rehashMismatches > 0` |
| `pack(unpack(p))` round trip | `firstDifference(p, roundTripPacked)`, every 64 actions | `unpack` reports one crystal too many → `roundTripMismatches > 0` |
| legality multiset | replica's generated set vs `generateAllActions` + expanded MOVEs | `genActions` drops its last candidate → `legalitySetMismatches > 0` |
| prover verdict | `homeVerdict` vs `analyzeHomeDefenseEvidence` | the mock flips MATE↔RESCUE after case 40 → `fuzzVerdictMismatch > 0` |
| prover node count | `proverStats().nodes` vs `evidence.nodes` | the mock adds ONE node → `nodeMismatch > 0` (this is the sharp one: it moves before the verdict does) |
| gate preservation | `replicaOutcome(p)` vs `canonicalOutcome(next)` after every action | `make` awards a draw on its 50th call → `mismatches > 0` |
| canonical ORDER (round 6) | `orderKey` inside `firstDifference`, rank-normalised | `OrderSwapFault` swaps two living slots' birth sequence on the SECOND `make` → `divergences > 0` with `unmakeMismatches` still 0 |
| incremental prover (round 6) | verdict AND node count on the state the walk BUILT, at caps 1,2,3,5,8 and `PROOF_NODES`, fresh pack as control | `SlotOrderFault` reproduces the round-4 defect through the public seam (`ord[slot] = slot` after every `make`) → the gate surface's `incrementalProverVerdictMismatches` + `incrementalProverNodeMismatches` move, while `freshPackProverMismatches` stays 0 — which is the blind spot, on demand |
| id planes replaced wholesale (round 6) | `PackedSnapshot`'s id lanes, now reading the LIVE field | `unmake` replaces `originIds` / `pendIds` with a copy → `unmakeMismatches > 0`; under the pre-fix cached-array read, both report 0 |
| harness invariants | `checkInvariants(next)` | already fault-sensitive: it is canonical-side and throws; rounds 1-3 recorded real hits |
| perft | frozen counts under both engines | already fault-sensitive: `fixturesMismatch`/`digestMismatches` are what caught the M1 regressions |

Each faulty run is paired with a clean run of the same shape reporting zero, so
the counter is not merely non-zero by construction.

## 2.6 Round 6: canonical UNIT ORDER was derived from the slot index

This one IS a wrong answer, and it was in the adjudicating path.

### 2.6.1 What was wrong

Canonical `board.units` is a **birth sequence**. `resolveSummons` appends the
arrivals to the tail of the array in `pendingSummons` order
(`summoning.ts:24`, `units: [...state.board.units, ...summoned.map(...)]`), and
every removal in the engine is a `filter` or an in-place `map`, so survivors keep
their relative order — including promotion, which replaces in place
(`promotion.ts:96-98`, `ai/simulate.ts:162-169`) rather than remove-and-append.

The packed replica gives an arrival the **lowest dead slot**. For a freshly
packed state slot `i` holds `board.units[i]`, so the two orders agree; after one
death-and-arrival, or one `PAY_UPKEEP` release below the high-water mark, they do
not. Round 4 changed `tactics/prover.ts buildOwned` to iterate defender units in
SLOT order on the stated assumption "slot order == canonical `board.units`
order" (§2.1 above said so too, and said the arrival order was ascending-square;
both were wrong — canonical order wins). `resolveArrivals` compounded it by
resolving commitments in ascending-square order and taking the arrival's identity
from the slot it landed in, so the square-keyed pending plane's loss of commit
order became a loss of canonical unit order.

That order is RESULT-bearing, not cosmetic. `analyzeHomeDefense` reads
`board.units` order through three **stable, non-total** sorts
(`homeCheckmate.ts:104` attacks by target distance, `:114` moves by destination
distance, `:126` the `prepare` owned list) and short-circuits on the first
rescue, under a node cap of `PROOF_NODES = 20000` (`homeCheckmate.ts:23`) whose
exhaustion is reported as `'unknown'` (`:170`) — and `resolveHomeCheckmate`
awards nothing on `'unknown'` (`:183`).

### 2.6.2 How it was found, and why 28.55M fuzzed actions missed it

Found by an independent runtime review (Codex), which did not argue it but
supplied **two minimal legal reproductions**, nine actions each, every action
asserted legal in both engines:

- **arrival order**: Black commits Fire at 89 then Lightning at 79 — buy order is
  the reverse of ascending square — hands off twice, then White invades 98→99 and
  `END_ACTION`. Canonical appends `[Fire89, Lightning79]`; the replica resolved
  `[Lightning79, Fire89]`.
- **dead-slot reuse**: ONE commitment. `PAY_UPKEEP` releases a WaterII in a low
  slot, and the LightningI arrival reuses that slot ahead of an existing FireI,
  while canonical appends it at the tail. Preserving pending order alone would not
  have fixed this path.

Both split identically: at cap 3 canonical said `unknown`/3 nodes and the
incremental replica said `rescue`/3; at cap 20,000 canonical spent 4 nodes and the
replica 3. A fresh `replica.pack(canonicalState)` agreed with canonical at every
cap. The two order-distinct states have **identical `Kpos` and `Kturn`**.

Three independent reasons the evidence could not see it, all now closed:

1. **The prover surface packs every case fresh** (`prover-surface.ts:445`,
   `replica.pack(state, packed)` immediately before comparing), which restores
   canonical order by construction. It compared 60,000 cases and could not have
   disagreed.
2. **`firstDifference` is slot-permutation blind by design**: every loop
   dereferences through each state's own `pieceAt` or its own square-keyed plane.
   That blindness is correct for `digest` — the search is entitled to transpose
   buy-order permutations — and it was the only comparison the walk had.
3. **`Replica.digest`'s docstring made the blindness a design commitment**
   ("buy-order permutations transpose"), which is true of every rule and false of
   the capped prover.

### 2.6.3 Everywhere canonical ORDER is observable (the audit)

Read out of `src/game/**` and the canonical-side `src/ai/**`. "RESULT" means it
can change a returned value, not merely the order of an enumeration that is later
aggregated order-insensitively.

| # | site | order-sensitive how | RESULT? |
|---|---|---|---|
| 1 | `ai/simulate.ts:131-133` | the ONLY `pendingSummons` writer; appends, so the array is in commit order | — (it is the source) |
| 2 | `summoning.ts:22` | `pending.filter(s => s.owner !== player)`: survivors keep commit order | — |
| 3 | `summoning.ts:17-20` | `own`/`summoned`/`disrupted` are subsequences of commit order; MEMBERSHIP is order-free (one snapshot) | order reaches `lastSummoning` and `moveHistory.ts:113-119` notation |
| 4 | **`summoning.ts:24`** | arrivals APPENDED in commit order — the one place pending order becomes unit order | **YES, transitively** |
| 5 | `board.ts:124,139,153,277`, `combat.ts:135,149,156`, `movement.ts:59`, `promotion.ts:96-98`, `upkeep.ts:29`, `moveHistory.ts:138` | append / `filter` / in-place `map` | all order-PRESERVING; promotion does NOT re-append |
| 6 | `homeCheckmate.ts:126` | `owned` sorted by distance, comparator NOT total ⇒ ties keep array order; drives the `prepare` DFS and `[...enemy, ...kept]` at `:134` | **YES** (Standard only; Phasing never enters `prepare`) |
| 7 | **`homeCheckmate.ts:101-109`** | `owned = units.filter(...)` then `attacks.sort(non-total)`; first rescue short-circuits | **YES** — this is the Phasing path |
| 8 | **`homeCheckmate.ts:113-119`** | same for MOVEs | **YES** |
| 9 | `homeCheckmate.ts:90-92` | the memo key is a `join` over the CURRENT array with indices from the ROOT array | node count, hence verdict at the cap |
| 10 | `homeCheckmate.ts:33-48` | `enoughPossibleDamage` iterates units into a 0/1 knapsack | **NO** — max over subsets, order-free |
| 11 | `upkeep.ts:36-44` | `upkeepActions` DFS over the filtered array | candidate SET is order-free; the returned array's order is not |
| 12 | `upkeep.ts:47-51`, `:56-63` | greedy / default keep-set sorts are made TOTAL by `(y, x)` | **NO** |
| 13 | `upkeep.ts:17-30` | `isUpkeepSelectionLegal` / `settleUpkeep` use `Set`s; release is `filter` | **NO** |
| 14 | `victory.ts:33-54` | `checkVictory` compares lengths | **NO** |
| 15 | `victory.ts:103-106` `getHomeOccupier`, `board.ts:67-72` `getUnitAt` | first-match `find`, but the predicate pins ONE square and two units never share one (`legality.ts:29-31`, `movement.ts:258`, `summoning.ts:19`) | **NO** in any reachable state |
| 16 | `mining.ts:19-22` | amounts computed against the pre-income cell | **NO**; `:24`'s `byCell` Map would silently overwrite a duplicate, unreachable per 15 |
| 17 | `spawning.ts:98-118`, `:207-224` | `getAllSpawnPositions` returns anchor-order; `getLargestSpawnZone` takes the FIRST maximal zone | zone choice is RESULT; the replica uses bitboards, not these |
| 18 | `ai/moves.ts:15-48,82-85` | generated action order follows `board.units`; `getSortedActions` sorts by type only | enumeration; RESULT wherever a consumer truncates |
| 19 | `ai/planner/placement.ts:36-55`, `beam.ts:33`, `strategies.ts:42-58`, `engine-v2.ts:63-105,151-183`, `ai/tactics/home.ts:38-48` | `slice(0, 8)`, `slice(0, 2)`, `slice(0, 32)`, `[0]` after a stable non-total sort, `break` on a budget | **YES** — but these are the OLD engine, out of M2's lane; recorded, not touched |
| 20 | `online/incomingPlayback.ts:42-43` | `JSON.stringify(state.board) !== …` and the same on `pendingSummons` | **YES** — a pure permutation silently drops playback, which is a second reason `unpack` must emit canonical order |
| 21 | `ai/simulate.ts:15-21` `nextUnitId` | `Set` of ids, scans upward | **NO** — id assignment is order-free |
| 22 | `hard/verify/perft.ts:230-241` | dedup rank is square-keyed and TOTAL | **NO** — perft counts are order-invariant, which is why nothing there moved |

### 2.6.4 The fix: order is carried as state, never derived

`PackedState` gains one plane and one counter per sequence:

| field | meaning |
|---|---|
| `ord[MAX_SLOTS]` | the slot's rank in canonical `board.units` |
| `ordNext` | next birth sequence number |
| `pendOrd[2 * PEND_STRIDE]` | the commitment's rank in canonical `pendingSummons`, ONE global sequence for both sides, like the single canonical array |
| `pendOrdNext` | next commit sequence number |

- `pack` assigns `ord[i] = i` and `pendOrd` from the array index — canonical order
  by definition;
- `makeBuy` takes `pendOrdNext++`; `unmake` restores the counter from the record
  rather than decrementing, so an out-of-order unwind fails loudly;
- `resolveArrivals` computes each arrival's rank in a **pre-pass** (the walk
  clears `pendOrd` as it consumes it) and assigns `ordBase + rank`;
- deaths, upkeep releases and promotion touch nothing: a dead slot keeps its stale
  value, and `unmake` of an ATTACK/`PAY_UPKEEP` resurrects the slot with its
  original `ord` still in place;
- the `END_PLACE` undo record grows from 9 to **11** words per commitment (the
  reused dead slot's stale `ord`, the commitment's `pendOrd`), plus one word for
  `ordNext`; worst case ~1,510 of `UNDO_WORDS = 8192`;
- `unpack` emits `board.units` in `ord` order and `pendingSummons` in `pendOrd`
  order, so `pack(unpack(p))` and every canonical comparison are order-exact;
- `Replica.check` requires the living `ord` values to be DISTINCT and below
  `ordNext` (same for `pendOrd`), so no consumer can silently fall back on the
  slot index as a tie-break.

**Slot allocation is unchanged** — still ascending square, still lowest dead slot.
That is the deliberate choice with the smallest hot-path cost and the smallest
blast radius: the hot path pays one `Int32Array` per state in `copyState`, two
words per commitment in the undo record, and one insertion sort of the defender's
army per FULL-PROVER call (not per node, and the prover is gated by `needsProof`).
Deriving the order from a reordered slot allocation instead would have changed
`genActions`/`genPlace` enumeration order and with it every frozen search result,
for no gain: only ORDER is load-bearing, and it is now a plane of its own.

`tactics/prover.ts buildOwned` sorts by `ord`. Nothing else in the prover needs
it: `damageBoundCore` is a 0/1 knapsack (order-free, item 10 above) and
`computeKey` is an XOR (commutative), keyed by slot where canonical is keyed by
the ROOT array index — a fixed bijection through `ord`, so the two `failed` sets
fold exactly the same transpositions.

### 2.6.5 KEYS: order is NOT hashed, and here is the argument

Order-distinct states share `Kpos`/`Kturn` (the reproducer proves it directly).
Hashing order in would destroy real transpositions, so it is only acceptable if
order can change a RESULT that a key-addressed cache carries. It cannot:

1. **A capped prover search is the only order-sensitive thing in the replica.**
   The candidate order at each `act` node is `OWNED` order (the stable sorts keep
   it as the tiebreak); everything else the prover computes is order-free (the
   knapsack bound, the XOR key).
2. **The MATE verdict is order-INDEPENDENT.** `runProver` returns
   `rescued ? RESCUE : exhausted ? UNKNOWN : MATE`. If a rescue exists anywhere in
   the tree, a search that does not exhaust finds it, so `MATE` implies the tree
   was searched to completion with no rescue. With no rescue, every reachable node
   that passes the bound is expanded exactly once — `FAILED` absorbs repeats, and
   no key can repeat on one stack path because `actionsRemaining` strictly
   decreases — so the node total `N` is a function of the reachable key SET alone.
   Hence `MATE` iff `N <= cap`, and `N` does not depend on order.
3. **Therefore `make` is order-independent.** `provesHomeCheckmate` consumes only
   `verdict === MATE`, so the packed state `make` produces — `result`, `reason` and
   every other field — is identical for order-distinct inputs. What order CAN
   change is the `RESCUE`-vs-`UNKNOWN` label and `STATS.nodes`, neither of which
   any consumer reads: `STATS` is a live view of the last call, and the search
   meters full-prover CALLS (`fullProverCalls`, priced per call at
   DESIGN §5.11.6), not nodes.
4. **No cache carries an order-sensitive value.** `FailedSet` is reset at the top
   of every `runProver` (`FAILED.reset()`), so no proof is ever reused across
   states. `ProofCache` (`search/tt.ts:265`) is keyed on `Kpos` but stores only
   EXACT df-pn verdicts — `MATE` from `PROVEN`, `DISPROVEN` from a disproof —
   never a budget-truncated `UNKNOWN` (`pvs.ts:568-574`), and an exact verdict is
   order-independent for the same reason as 2. The TT stores scores, which true
   transpositions are already entitled to share.

So order stays OUT of `Kpos` and out of `Kturn`, and is carried as ordinary state.

**Step 2 is MEASURED, not only argued.** `compareIncrementalProver` re-proves
every position it measures at the production cap a second time with the birth
sequence REVERSED — the maximal permutation available — and counts any case where
that moves the MATE classification, or a mate's node count, as a violation
(`proverOrderInvarianceViolations`). Reversal is applied to the ORDER plane alone,
so nothing else about the position changes. Over the round-6 sweep: **1,014,000+
positions re-proved, 0 violations** (§3.2). If step 2 were wrong, this counter is
what would say so, and the M10 release gate now requires it to be 0 with its case
count above 0.

**Residual risk, stated plainly.** The argument in 2 is about `act`'s DFS with a
sticky `exhausted` flag and a failure memo; it would NOT survive a prover that
proved mates by a proof-number search, or a consumer that started reading
`RESCUE`-vs-`UNKNOWN` or `STATS.nodes` as a value. The guard against both is the
`cappedProverCalls` counter: every full-prover call inside `make` that ends at the
cap is counted and reported (`HardSearchStats.cappedProverCalls` in the search,
`gateProverCapHits` in the fuzz metrics, and `hard:fuzz` prints the exposure line
pass or fail), so any run in which order could have mattered at all is visible and
can be vetoed on that evidence rather than on this argument. A second residual is
narrower and recorded as REMAINING 5: above `KEEP_SET_CAPACITY` the replica's
keep-set tie-break is its own enumeration index while canonical's is array order,
so on an order-permuted state the two can choose a different 64 — inside a region
where set equality was already undefined.

### 2.6.6 MEASURED: how far real positions are from the cap

From the round-6 sweep's gate-preservation walks, at the PRODUCTION cap
(`PROOF_NODES = 20000`), over positions reached INCREMENTALLY through `make`:

| quantity | value |
|---|---|
| positions measured at the production cap | **1,014,307** (gate walk) + 24,234 (walk + arrival) |
| max prover node count | **385** |
| p99 / p99.9 | **7 / 15** nodes |
| positions at 7 nodes or fewer | **99.67%** |
| positions at or above the cap | **0** |
| gate proofs inside `make` that ended at the cap (`gateProverCapHits`) | **0** |
| `proverOrderInvarianceViolations` (birth sequence REVERSED) | **0** of 1,038,541 |

The full distribution is in §3.2. The cap is **52x** the worst position observed in
a million, and `gateProverCapHits` is 0 on every one of the 26 seeds — so the one
regime in which candidate order could change an adjudicated result was never
entered, independently of §2.6.5's argument, and the argument itself was measured
directly by re-proving every one of those positions with the order reversed.

### 2.6.7 How the evidence hole is closed

| new/changed | what it does |
|---|---|
| `tests/ai/hard/arrival-order.test.ts` (new, 5 cases) | both reproductions, walked INCREMENTALLY through `make` in both engines, verdict AND node count compared at caps 1,2,3,4,5 and `PROOF_NODES`, with the fresh-pack control; a test that slot order and canonical order genuinely disagree in both positions (so a future change to slot allocation cannot make them vacuous); §2.6.5's MATE order-invariance on both positions; and a full unmake identity of the two order planes and both counters. **Shown to fail on the pre-fix code** by deleting the `ord` sort from `buildOwned`: both reproductions then report `rescue`/3 against canonical `unknown`/3 at cap 3, and both fresh-pack controls still pass |
| `differential.ts firstDifference` | compares canonical ORDER (`orderKey`, rank-normalised) — so the transition surface, the arrival surface and the `pack(unpack(p))` round trip all police it |
| `differential.ts compareIncrementalProver` | the prover on the state the walk ACTUALLY BUILT, against canonical, at caps 1,2,3,5,8 and `PROOF_NODES`, with the fresh pack as a control. Wired into the transition walk, the arrival surface and the gate-preservation walk |
| `proverOrderPermuted` | COVERAGE: comparisons whose position really has slot order ≠ canonical order. `hard:fuzz` FAILS a gate run of >= 4,000 actions that reports 0, because a zero mismatch count beside a zero here is exactly what round 4 had |
| `proverOrderInvarianceCases/Violations` | §2.6.5's MATE order-invariance, re-proved with the birth sequence REVERSED on every position measured at the production cap |
| `cappedProverCalls` / `gateProverCapHits` | the order-exposure meter of §2.6.5, also published as `HardSearchStats.cappedProverCalls` |
| `lab/hard-ai/verify/gates.ts` | the M10 release gate now requires the incremental-prover counters at 0, `proverOrderPermuted > 0` (non-vacuity), `proverOrderInvarianceViolations === 0` with cases > 0, and `gateProverCapHits === 0` as a tripwire |
| `tests/lab/fuzz-fault-injection.test.ts` (+4 cases, 13 -> 17) | `OrderSwapFault` perturbs the birth sequence on the second `make` -> `divergences > 0` with `unmakeMismatches` still 0; `SlotOrderFault` reproduces the round-4 defect through the public seam (`ord[slot] = slot`) -> the gate surface's incremental prover counters move while the FRESH-PACK control stays 0; two `IdArrayReplaceFault` cases for §2.6.8 |
| `statesnap.ts` | the id lanes now read the LIVE field and report `<key>-array-replaced`, like the typed-array lanes |

### 2.6.8 `PackedSnapshot`'s id lanes compared a cached array

Also from the review, and latent rather than live: `firstDifference` read
`lane.src` — the array object bound once by `derive` — instead of
`p[lane.key]`, so an `unmake` that replaced `originIds`/`pendIds` with a NEW
array would have been compared against the pre-`make` contents, matched, and
reported `null`. `core/state.ts` only ever mutates those arrays in place, so
nothing was being missed; the guard the typed-array lanes already had is now
spelled out for the id lanes too, with a fault case per plane. The documented
`''`/absent normalisation over the union of the two lengths is unchanged.

## 3. Differential fuzz

`hard:fuzz`'s default surface set is now all five. The prover and gate-preservation
surfaces keep their single-surface artifact shapes (top level, and
`gatePreservation`) because the M10 gate chain in `lab/hard-ai/verify/gates.ts`
invokes them one at a time and relies on the sibling merge; in a combined run they
nest.

Four batches, run at 0 tolerated divergences of any kind:

| batch | seeds | per seed | walk actions | games |
|---|---|---|---|---|
| A | 200-219 (fresh) | 250,000 actions, 1,500 prover cases, 120 arrival cases, 250,000 gate actions | 5,000,000 | 29,042 |
| B | 220-239 (fresh) | as A | 5,000,000 | 28,628 |
| C | rounds 1-2's divergent seeds: 7, 14, 15, 25, 31, 38, 43, 44, 47, 49, 50, 57, 59, 61, 67, 69, 70, 72, 75 | 250,000 actions, 400 arrival cases, `--resign-rate 0` | 4,750,000 | 25,505 |
| D | round 3's divergent seeds: 76, 83, 87, 93, 96, 99, 100, 102, 104, 106, 107, 108 at 250,000; 118, 126, 127, 128, 132, 133, 134, 137, 138, 139, 141, 144, 145, 146, 149, 150, 151, 153, 154, 155, 156, 159, 160, 161, 163, 164, 165 at 400,000 transition-only | 13,800,000 | 74,733 |
| | **total** | | **28,550,000** | **157,908** |

Batches C and D use `--resign-rate 0` so each seed replays the **same games** it
played in the round that found a divergence there. Every seed that previously
reported a divergence now reports **0**.

| counter | A | B | C | D | total |
|---|---|---|---|---|---|
| transition divergences | 0 | 0 | 0 | 0 | **0** |
| legality-set mismatches | 0 | 0 | 0 | 0 | **0** (2,218,750 checks) |
| pending-legality mismatches | 0 | 0 | 0 | 0 | **0** (4,619,946 probes) |
| unmake / rehash / round-trip mismatches | 0 | 0 | 0 | 0 | **0** |
| harness invariant violations | 0 | 0 | 0 | 0 | **0** |
| `Replica.check` calls | 78,120 | 78,120 | 74,214 | 215,622 | **446,076** |
| keep-set truncations (designed cap) | 0 | 0 | 0 | **2** | **2** |
| buys | 602,694 | 600,155 | 557,945 | 1,621,902 | **3,382,696** |
| arrivals | 546,645 | 544,834 | 506,999 | 1,475,059 | **3,073,537** |
| refunds | 27,947 | 27,927 | 26,577 | 76,062 | **158,513** |

The two keep-set truncations are in batch D, on seeds 76 and 87 — the same two
nodes round 3 found, which is independent evidence that `--resign-rate 0` really
does replay the old walk.

**Provenance limit of these four batches, stated rather than implied.** The 98
retained per-seed JSONs record `git: 142f0904` and their timestamps, but no hash
of the working tree they actually ran against — and the round-4 fixes were
uncommitted while they ran, so the commit they name is their PREDECESSOR, not
their source. They are therefore evidence of a run, not a pinned preregistered
release row, and round 6 has in any case superseded what they can be read to
prove: the surfaces they exercised could not see canonical unit order at all
(§2.6.2). `hard:fuzz` now writes `gitDirtyFiles` and `treeMatchesCommit` beside
`git` so a later artifact cannot make the same implicit claim.

### 3.1 Round 5, with the full-state unmake comparison

Re-run from scratch after §2.5.2, because the round-4 batches above were taken
with a check that could not see three of the lanes. Two batches, 26 seeds, all
five surfaces on every seed, 0 tolerated divergences of any kind:

| batch | seeds | per seed | walk actions | games |
|---|---|---|---|---|
| A | 300-319 (fresh) | 250,000 actions, 1,500 prover cases, 120 arrival cases, 250,000 gate actions | 5,000,000 | 28,679 |
| C | 7, 14, 15, 38, 104, 145 — seeds that diverged in rounds 1-3, at `--resign-rate 0` so each replays its ORIGINAL walk | as A | 1,500,000 | 8,116 |
| | **total** | | **6,500,000** | **36,795** |

| counter | A | C | total |
|---|---|---|---|
| transition divergences | 0 | 0 | **0** |
| unmake mismatches (FULL STATE, every field) | 0 | 0 | **0** |
| rehash / round-trip mismatches | 0 | 0 | **0** |
| legality-set mismatches | 0 | 0 | **0** (812,500 checks) |
| pending-legality mismatches | 0 | 0 | **0** (1,695,284 probes) |
| keep-set truncations (designed cap) | 0 | 0 | **0** |
| harness invariant violations | 0 | 0 | **0** |
| `Replica.check` calls | 78,120 | 23,436 | **101,556** |
| buys / arrivals / refunds | 600,092 / 544,507 / 27,887 | 176,963 / 160,740 / 8,336 | **777,055 / 705,247 / 36,223** |
| ARRIVAL surface: cases, mismatches of all eight kinds | 2,400, 0 | 720, 0 | **3,120, 0** |
| PROVER surface: fuzz cases / verdict / node / witness mismatches | 30,000 / 0 / 0 / 0 | 9,000 / 0 / 0 / 0 | **39,000 / 0 / 0 / 0** (25,521 witnesses replayed, 588 cutoff cases, `clockFixtureOk` on all 26) |
| GATE PRESERVATION: actions, mismatches | 5,000,000, 0 | 1,500,000, 0 | **6,500,000, 0** (244,253 proofs compared, 15,782 home checkmates) |

The six batch-C seeds are a subset of rounds 1-3's divergent seeds, chosen to
span both original classes (the seed-7 bound over-claim and the seed-38 release
under-claim) and both later rounds. They are re-run as true repros: at
`--resign-rate 0` the walk is bit-identical to the one that found the
divergence.

**Artifacts.** `lab/results/hard-ai-verify/fuzz.json` is REGENERATED from the
current source (batch A's first seed, all five surfaces) — it had been a stale
seed-4242 run from a round that was still failing, carrying dead
`knownProverGapDivergences` fields and `legalitySetMismatches: 1`, with nothing
in the file to say so. The 26 per-seed artifacts are NOT checked in: they are
near-identical files whose entire content is zeros. They are represented by
`lab/results/hard-ai-verify/fuzz-round5-campaign.json`, a manifest carrying the
seeds, the exact invocations, the aggregate counters and the provenance. Both
now record provenance honestly: `hard:fuzz` writes `gitDirtyFiles` and
`treeMatchesCommit` beside `git`, because an artifact that names only a commit
is MISLEADING when the code under test is uncommitted — which is how every
converger round runs.

**Prover surface** (batches A+B): **60,000 fuzz cases + 40x28 authored fixtures**,
`fuzzVerdictMismatch 0`, `nodeMismatch 0`, `fixtureMismatch 0`,
`witnessChecked 39,111`, `witnessIllegal 0`, `witnessNotRemoved 0`,
`cutoffCases 925` (the node cap bit, which is the only regime where search ORDER
can change the answer), `clockFixtureOk true` on every seed. Its positions are
Phasing (`ruleset: 'phasing'`), its fixtures are read through `asPhasing`, and its
witnesses replay from canonical `ready` — defender to move, ACTION phase, four
actions, army healed and reset — because that is the position Phasing's
`act(ready, [])` searches. Its `clockFixture` was rewritten for Phasing's gate:
the MOVE onto the corner adjudicates nothing, the invader's own `END_ACTION` does,
and the unproven occupation is drawn at the following `END_PLACE`.

**Gate-preservation** (batches A+B): **10,000,000 played actions**, 154,987 games,
`mismatches 0`, `proofsCompared 374,274`, `homeCheckmates 24,595`. (The game count
said 155,006 until round 6 re-summed the retained artifacts: the root metrics of
batches A and B give 77,503 + 77,484 = 154,987. Actions, mismatches, proofs and
home-checkmates all matched.) Its games are
`createInitialGameState(..., 'phasing')`, and the id-adoption it does after each
action was widened from BUY (which places nothing under Phasing) to any action
that introduced a unit, which is the ARRIVAL at a hand-off.

**Arrival surface**: 17,200 cases, 0 skips, 0 mismatches across all eight kinds,
with all six intrusion shapes exercised.

### 3.2 Round 6, with canonical ORDER and the INCREMENTAL prover comparison

Re-run from scratch again after §2.6, because the round-5 batches were taken with
comparisons that were slot-permutation blind and with a prover surface that packed
every case fresh. Three batches, 26 seeds, all five surfaces on every seed, 0
tolerated divergences of any kind:

| batch | seeds | per seed | walk actions | games |
|---|---|---|---|---|
| A | 400-409 (fresh) | 250,000 actions, 1,500 prover cases, 120 arrival cases, 250,000 gate actions | 2,500,000 | 14,350 |
| B | 410-419 (fresh) | as A | 2,500,000 | 14,525 |
| C | 7, 14, 15, 38, 104, 145 — seeds that diverged in rounds 1-3, at `--resign-rate 0` so each replays its ORIGINAL walk | as A | 1,500,000 | 8,116 |
| | **total** | | **6,500,000** | **36,991** |

| counter | value |
|---|---|
| transition divergences | **0** |
| **canonical ORDER differences** (`orderKey` inside `firstDifference`) | **0** — on the walk, the arrival surface and the round trip |
| unmake mismatches (FULL STATE, every field, id lanes now read live) | **0** |
| rehash / round-trip mismatches | **0** |
| legality-set mismatches | **0** (812,500 checks) |
| pending-legality mismatches | **0** (1,698,672 probes) |
| keep-set truncations (designed cap) | **0** |
| harness invariant violations | **0** |
| `Replica.check` calls (now also checking both order sequences) | **101,556** |
| buys / arrivals / refunds | **779,793 / 707,701 / 36,333** |
| ARRIVAL surface: cases, mismatches of all eight kinds | **3,120, 0** (0 skips, 4,097 arrivals, 2,172 refunds) |
| PROVER surface: fuzz cases / verdict / node / witness mismatches | **39,000 / 0 / 0 / 0** (26x28 fixtures, 25,271 witnesses replayed, 585 cutoff cases, `clockFixtureOk` on all 26) |
| GATE PRESERVATION: actions, mismatches | **6,500,000, 0** (100,917 games, 244,989 proofs compared, 15,823 home checkmates) |

And the counters round 6 added — the ones round 4's evidence did not have:

| counter | walk | arrival | gate | total |
|---|---|---|---|---|
| INCREMENTAL prover comparisons (verdict AND nodes, 6 caps) | 144,168 | 1,236 | 6,085,842 | **6,231,246** |
| `incrementalProverVerdictMismatches` | 0 | 0 | 0 | **0** |
| `incrementalProverNodeMismatches` | 0 | 0 | 0 | **0** |
| `freshPackProverMismatches` (the control) | 0 | 0 | 0 | **0** |
| `proverOrderPermuted` — comparisons on a state whose SLOT order differs from canonical order | 23,620 | 0 (structural, REMAINING 17) | 574,851 | **598,471** |
| positions measured at `PROOF_NODES` | 24,028 | 206 | 1,014,307 | **1,038,541** |
| `proverOrderInvarianceViolations` (§2.6.5, birth sequence REVERSED) | 0 | 0 | 0 | **0** |
| `gateProverCapHits` — gate proofs inside `make` that ended AT the cap | 0 | 0 | 0 | **0** |

The `proverOrderPermuted` row is the one that makes the rest mean something. Round
4's 28.55M actions had no comparison that could see canonical order at all; this
sweep made 598,471 prover comparisons on states where slot order and canonical
order really do differ, and `hard:fuzz` now FAILS a gate run of >= 4,000 actions
that reports 0 there.

**The node-count distribution at the production cap**, over the gate walk's
1,014,307 measured positions (the §2.6.6 measurement):

| nodes | positions | cumulative |
|---:|---:|---:|
| 0 | 356,515 | 35.15% |
| 1 | 76,283 | 42.68% |
| 2-3 | 356,391 | 77.82% |
| 4-7 | 221,599 | 99.67% |
| 8-15 | 2,896 | 99.95% |
| 16-31 | 433 | 99.99% |
| 32-63 | 295 | 100.00% |
| 64-127 | 69 | 100.00% |
| 128-255 | 23 | 100.00% |
| 256-511 | 9 | 100.00% |
| >= 20,000 | **0** | — |

Max **385** nodes against a cap of **20,000**: the cap is 52x the worst position
observed in a million, p99 is 7 nodes and p99.9 is 15. `gateProverCapHits` is 0 on
every seed, so the one regime in which candidate order could change an adjudicated
result was never entered.

**Artifacts.** The 26 per-seed artifacts are again not checked in — files whose
entire content is zeros — and the aggregate above is what represents them, with
the same `gitDirtyFiles`/`treeMatchesCommit` provenance fields in each.

## 4. Perft

```
npx tsx lab/hard-ai/perft/run.ts --check                    # canonical
npx tsx lab/hard-ai/perft/run.ts --check --engine replica   # replica
```

Both: `fixturesChecked: 7`, `fixturesMismatch: 0`, `digestMismatches: 0`,
`mismatches: 0`, `replicaAgreed: true`. The Phasing initial triple
**14959 / 1850 / 797** matches under both engines, and the Standard triple
14959 / 1053 / 797 is still computed and checked under `--engine canonical`.

**No frozen count moved, and none needed to.** The prover change moves mate
verdicts, so terminal nodes were the thing to watch; `lab/hard-ai/perft/fixtures.json`
is untouched. Two reasons it survived: the perft dedup keys are canonical
`midStateKey`/`endStateKey` strings rather than Zobrist keys, so the `progress`
plane cannot reach them; and no fixture's tree contains a node where the old
Standard prover and the new Phasing one disagree (the over-claim needs a broke
defender with exactly one rent-bearing body on a corner, at ~1 in 750k actions).
Had one moved, canonical is the oracle and the fixture would have been re-frozen
only once `replica == canonical`; that did not arise.

**Round 6 did not move one either, and this was the round most likely to.** The
order fix changes which slot an arrival's IDENTITY sits in — but not which slot it
takes, and not any square — and the only thing that reads the new plane is the
prover's candidate order, which no perft count depends on: `verify/perft.ts`'s
dedup rank is square-keyed and TOTAL (`:230-241`), so the enumeration is
order-invariant by construction. Re-verified after the fix under both engines:
`fixtures.json` still sha256 `76db5122…`, `fixturesMismatch 0`,
`digestMismatches 0`, `replicaAgreed true`, the Phasing triple unchanged at
14959 / 1850 / 797 and the Standard triple at 14959 / 1053 / 797.

## 5. Tests

```
npx vitest run       ->  138 files, 1,917 tests, 0 failures, exit 0
npm run hard:test    ->   42 files,   530 tests, 0 failures
```

Round 3 ended at 132 files / 1,861 tests (`hard:test` 38 / 497); round 4 at
135 / 1,891. Round 4's three new files are `tests/ai/hard/prover.test.ts` (out of
quarantine, 19 cases), `tests/ai/hard/distance-cache-collision.test.ts` (new, 5)
and `tests/ai/hard/progress-key.test.ts` (new, 4).

Round 5 adds two files and 17 cases, both under `tests/lab` (they drive the lab
harness, not `src/ai/hard/**`, which is why `hard:test` is unchanged at 41/525):

- **`tests/lab/fuzz-fault-injection.test.ts`** (new, 13) — the §2.5.3 table,
  executable. One case per surface, each paired with a clean run of the same
  shape reporting zero.
- **`tests/lab/state-snapshot.test.ts`** (new, 4) — `PackedSnapshot` covers
  exactly `Object.keys(allocState())`, throws on a field of an unknown kind,
  reports a one-byte corruption of every field one at a time, and refuses to
  compare a state it did not capture.

Round 6 adds one file and four cases to another, and rewrites one expectation:

- **`tests/ai/hard/arrival-order.test.ts`** (new, 5) — the two reproductions of
  §2.6, walked incrementally through `make` in BOTH engines, verdict and node
  count compared at six caps including 3 and `PROOF_NODES`, with the fresh-pack
  control; the slot-order-vs-canonical-order disagreement itself, so a later
  change to slot allocation cannot make the file vacuous; §2.6.5's MATE
  order-invariance on both positions; and a full unmake identity of
  `ord`/`pendOrd` and both sequence counters.
- **`tests/lab/fuzz-fault-injection.test.ts`** (13 -> 17) — `OrderSwapFault`,
  `SlotOrderFault` and two `IdArrayReplaceFault` cases (§2.5.3's last four rows).
- **`tests/ai/hard/pack-roundtrip.test.ts`** — the case that PINNED the old
  behaviour ("commitments come back square ascending, buy order deliberately
  forgotten") now requires canonical COMMIT order, since that order decides
  `board.units` order one hand-off later.

And round 5 rewrote two:

- **`tests/ai/hard/verify-replay-phasing.test.ts`** — the `knownProverGap`
  allowance, the `proverGaps` counters and the `< 12` cap are DELETED, the header
  rewritten to state what the file now proves, and two non-vacuity assertions
  added (§2.5.1). 269 replayed turns, 0 tolerated failures.
- **`tests/ai/hard/make-unmake.test.ts`** — every "unmade back to where it
  started" assertion moved from `replica.digest` to a full-state
  `PackedSnapshot`, including the 1,211-position sweep (one capture per
  position, compared after each of its ~20,000 actions) and both unwind stacks.
  The `digest` comparisons that remain are make-side: replica against
  `applyAction`.

### Rewritten from the canonical Phasing engine, not relaxed

- **`tests/ai/hard/prover.test.ts`** — left the quarantine. Case by case, with no
  case deleted: the bound's "flips at exactly 9 crystals" became "charges NO rent
  and admits NO promotion, at every cash level"; the witness replays from
  canonical `ready` instead of the defender's upkeep; the three `make`-gate cases
  step onto the corner and then play `END_ACTION`, because Phasing adjudicates in
  Prepare, and a new case asserts that the MOVE itself adjudicates NOTHING; the
  transposition-set case was re-pinned from `rescue/22/search` (a Standard
  `prepare` promotion, White holding 24 crystals) to canonical Phasing's
  `mate/9/search`, at every budget from 24 up. The squeezed-cap sweep's cap range
  moved from 1..48 to 1..12: an act-only tree is at most 22 nodes over those 1,500
  positions, so the old range almost never bit (10 exhaustions) and the exhaustion
  regime — the only regime where search order can change the answer — would have
  gone untested. At 1..12 it is 38, and the assertion **kept its old threshold**
  (`> 20`) rather than being lowered to fit. A new assertion requires the sweep's
  deepest tree to exceed 15 nodes, so "node for node" is not being claimed off
  one-node bounds.
- **`tests/ai/hard/phasing-prover-debt.test.ts`** — was the over-claim tripwire.
  Same positions; the case that asserted the replica's wrong answer now asserts
  agreement, and a fourth case asserts the sharper property: the defender's bank
  changes neither the bound, nor the verdict, nor the node count.
- **`tests/ai/hard/phasing-prover-underclaim.test.ts`** — was the under-claim
  tripwire, both arms. Same positions; both wrong-answer cases now assert
  canonical's mate.
- **`tests/ai/hard/fuzz-reduced-positions.test.ts`** — pinned `classifyKnownProverGap`,
  which no longer exists. The file was KEPT rather than removed, because its
  positions are the evidence: all three (the seed-7 bound repro, the promotion
  arm, the seed-38 release arm) now assert full `digest` equality between replica
  and canonical, which is stronger than the verdict agreement the sibling files
  assert. Its former REFUSAL cases — "a mate over-claim against a solvent defender
  must never be excused" — have become "no over-claim happens at either cash
  level". 9 classifier cases became 7 equality cases.
- **`tests/ai/hard/make-unmake.test.ts`** — the `compareDigests` mate-verdict
  exemption and the `classifyKnownProverGap` gate on it are deleted; every field
  of every digest must now match, `result.reason` included, on all 1,211
  positions. The header keeps the history, because of how it failed: the exemption
  justified itself with "the packed prover can only ever UNDER-claim", which is
  true of the SEARCH and false of the BOUND — and the bound runs first, so a
  1%-of-actions allowance absorbed an unsound verdict for two rounds.
- **`tests/ai/hard/zobrist.test.ts`** — `progress` added to the plane table, the
  fill order and the `Kturn`-only mutation list; the append assertion now names
  `progress` last and `pend` second-to-last.
- **`tests/lab/hard-fuzz.test.ts`** — two new cases: the terminal histogram's key
  shape and that RESIGN actually fires, and that `check` runs per action at
  `--legality-every 1` and on the sparse cadence otherwise.

### Coverage: what the fuzz walk reaches, and what it does not

Read off the round-4 terminal histogram (157,908 games). This is the honest
version of a claim earlier rounds made in prose.

**Covered by the fuzz walk**, with counts from batches A+B (57,670 games):

| canonical terminal | histogram key | games |
|---|---|---|
| inactivity draw at the hand-off | `inactivity:draw@END_PLACE_PHASE` | 35,949 |
| elimination at an ATTACK | `elimination:{white,black}@ATTACK` | 2,845 |
| upkeep elimination at an explicit `PAY_UPKEEP` | `upkeep-elimination:*@PAY_UPKEEP` | 2,490 |
| resignation | `resignation:*@RESIGN` | 3,606 |
| home occupation at the hand-off | `home-occupation:*@END_PLACE_PHASE` | 872 |
| home checkmate at the invader's `END_ACTION` | `home-checkmate:*@END_ACTION_PHASE` | 149 |
| home checkmate at a `PAY_UPKEEP` inside Prepare | `home-checkmate:*@PAY_UPKEEP` | 59 |

**Covered only by the 1,200-position corpus sweep and the named replica tests,
never by the walk:**

- `PAY_UPKEEP` releasing a side's LAST unit
  (`tests/ai/hard/make-unmake.test.ts`, `tests/ai/hard/terminal-order.test.ts`) —
  the walk does reach `upkeep-elimination@PAY_UPKEEP`, but only via a keep-set it
  was offered, never via the forced-empty-keep-set node those tests construct;
- the arrival-surface positions generally: a commitment that was valid when paid
  and invalid at arrival is reached by state surgery, not by legal play;
- `pack` refusing a Standard state, a tier-2+ pending summon, or a mismatched
  paid cost.

**Not covered at all** — recorded as REMAINING 1-3 below:

- **`makeEndAction`'s automatic-upkeep `checkVictory` terminal.** When
  `reviewUpkeep` is off for the mover, `END_ACTION` settles upkeep itself and can
  eliminate the mover. The histogram has **no** `upkeep-elimination:*@END_ACTION_PHASE`
  bucket in 157,908 games, and no test constructs one. It is reachable — a side
  all of whose bodies are tier 2+ and which can afford none of them — just rare.
- **Elimination at the hand-off.** `makeEndPlace` step 4 runs `checkVictory` on
  BOTH sides before resolving arrivals. No `elimination:*@END_PLACE_PHASE` bucket
  appears.
- **Double elimination.** `makeEndPlace` returns `Result.DRAW`/`ELIMINATION` when
  both sides are empty. No `elimination:draw` bucket appears, at any action.

`RESIGN` was in this list until round 4 and is now covered — but by an INJECTED
action, because no generator emits RESIGN. There is no `gen/**` resignation path
to test.

## 6. Quarantine

**One place**: the `M2_QUARANTINE` array at the top of `muju/vitest.config.ts`,
applied through vitest's `exclude`. `MUJU_RUN_QUARANTINE=1` disables it.

Round 4 moved exactly this much:

- `tests/ai/hard/prover.test.ts` **left** the list (see §5).
- `tests/ai/hard/p8-rescue-cap.test.ts` **stayed**, and moved from the prover
  section to the search section: it fails on `gen/generate` and `search/root`, not
  on the prover — its fixture is a Standard engine turn that now takes the
  `pack-error` fallback path. Confirmed by running it with the ported prover.
- `tests/ai/hard/home.test.ts` **stayed**, for the reason it always had:
  `tables/home` enumerates Standard's "BUY, END_PLACE, MOVE the bought unit"
  lines, and under Phasing the buy arrives a turn later.
- The prover section of the list and its stale "can only UNDER-claim" reasoning
  are deleted.

The restoration debt is now **237** passing cases measured file by file (246 minus
`prover.test.ts`'s 9), 236 in a whole-suite run, with 123 further cases in those
files already failing. The remaining rows are unchanged and are listed in
`vitest.config.ts`; they are M4 (gen/**, tables/home, search/**, verify/replay's
fixture), M5 (the lab suites and bench harnesses) and M6 (eval/** and its tables).

---

## Remaining, for the milestones that own it

The first three are the coverage gaps §5 names. None is a known divergence — there
are none left — they are branches no surface exercises.

1. **`makeEndAction`'s automatic-upkeep `checkVictory` terminal is untested.**
   Owner: the harness lane. Fix sketch: the walk randomises `reviewUpkeep` per
   side already; bias a small fraction of games to an all-tier-2+ army with an
   empty bank, or add a corpus position whose mover holds only rent-bearing bodies
   it cannot pay for and assert `END_ACTION` eliminates it in both engines.

2. **Double-elimination results are untested** (`makeEndPlace` returning
   `DRAW`/`ELIMINATION` with both sides empty), and so is **elimination at the
   hand-off** more generally. Owner: the harness lane. Fix sketch: a
   `terminal-order.test.ts` case with one unit each, arranged so the hand-off's
   `checkVictory` sees both boards empty — reachable through a mutual
   upkeep release plus an arrival that refunds.

3. **RESIGN is covered only by injection.** No generator emits it, so the walk
   adds it to the candidate list from a separate RNG stream. If a milestone ever
   wants RESIGN in the search's own vocabulary, this is where the coverage claim
   has to be restated.

4. **`book/probe.ts mirrorInto` and the lab corpus's `mirror180` do not rotate or
   side-swap the PENDING plane**, so `canonicalKey` is not mirror-invariant once a
   commitment exists. Latent only because the shipped book is empty. **Owner: the
   book milestone.** Fix sketch: `mirrorInto` must map each `pendDef`/`pendCost`
   entry at index `side * PEND_STRIDE + s` to `(1 - side) * PEND_STRIDE + (99 - s)`
   and rebuild `pendBB`/`pendCount`/`pendCostSum` from the mirrored plane, exactly
   as it already does for `sq`/`owner` — and round 6 adds `pendOrd` to the list of
   square-indexed planes it must remap (`ord` needs nothing: it is slot-indexed and
   `mirrorInto` keeps slot identity); `corpus.ts mirror180` must do the same to
   `state.pendingSummons` (position and owner both). Until then, any Phasing
   symmetry work — the eval-symmetry gate, corpus doubling — is unsound.
   (`corpus.ts mirror180` is pinned by a test in `tests/ai/hard/perft.test.ts`.)

5. **`KEEP_SET_CAPACITY = 64` truncation makes keep-set completeness undefined
   above the cap.** `upkeepActions` enumerates every affordable subset of up to
   twelve rent-bearing bodies while the replica's `KeepSetTable` holds 64 ranked
   sets, so at a truncated node no differential comparison can assert set
   equality. The harness asserts everything that IS defined there — per-set
   soundness, pairwise distinctness, and full equality when canonical offered no
   more than the cap — and round 4 reached two such nodes in 2.2M legality checks.
   **Owner: M4, the generator.** Fix sketch: raising the cap is a generator
   decision; alternatively `genKeepSets` could report truncation on the table so
   consumers can refuse to publish from such a node. Round 6 adds one detail to
   the same undefined region: `rankKeepSets` breaks priority ties by the
   REPLICA's enumeration index, which is slot order, while canonical's
   `upkeepActions` enumerates in `board.units` order — so on an order-permuted
   state above the cap the two engines can choose a different 64. Below the cap
   every affordable subset is emitted and the set is complete either way, which is
   why nothing moved; above it, equality was already undefined.

6. **The distance-cache defect of §2.2 also exists on `master`.** The fix here is
   confined to this worktree's `core/movement.ts`. Owner: whoever lands M2 —
   it should be ported to `master` independently of the Phasing work, since it is
   an impurity in the shipped engine's move generation.

7. **`core/catalog.ts`'s `catalogSignature` is a 32-bit stand-in for catalogue
   identity**, compared alone by `gen/actionsearch.ts`, `gen/turn.ts` and
   `book/probe.ts`. Structurally the same idiom as §2.2's bug, but the keyspace is
   a handful of dev/test rule configurations and it is consulted at setup rather
   than driven by search. Reported, not fixed. Owner: M4.

8. **`Replica.needsProof`'s mode-0 assertion order.** `proverMode === 0` asserts
   before the Phasing phase gate, so it throws on ACT positions where the gate
   would have returned false anyway. Deliberate — mode 0 keeps its contract rather
   than silently widening — but a mode-0 caller that relied on Standard's timing
   sees the throw move from the MOVE to the END_ACTION.

9. **Unit-id fidelity for arrivals bought inside the search.** Canonical mints a
   pending's id at BUY time (`unit-<player>-<buyTurn>-<n>`) and the unit inherits
   it on arrival; `unitIdFor` derives from the CURRENT turn number, so such an
   arrival is named differently and `toAIAction`/`fromAIAction` can fail to decode
   it on a line crossing an `END_PLACE`. `pendIds` preserves fidelity for root
   commitments and design item G says search arrivals need no name. Does not
   affect `verifyTurn`, which replays one macro turn. A real fix needs the buy turn
   stored in the plane. M4, with the generator.

10. **`lab/hard-ai/verify/gates.ts` still gates M1 on the Standard triple**
    (`perftActions_initial_4`, `perftMidStates_initial`, `perftTurns_initial`).
    Meaningful under `--engine canonical`, `null` under the Phasing-only replica. A
    replica-engine gate row needs criteria naming `phasingActions_initial` /
    `phasingMidStates_initial` / `phasingTurns_initial`. Outside this lane.

11. **The position corpora are still Standard**
    (`positions/{fuzz-1000,economy,tactics,openings,authored}.jsonl`), which is why
    the replica-layer corpus tests read them through `asPhasing` — a Phasing
    position over the same BOARD, never the ruleset reinterpretation design item A
    forbids. `hard:fuzz --sample` emits Phasing positions tagged `phasing`.

12. **`MAX_TURN_ACTIONS = 24` is too small in principle.** A Phasing BUY takes no
    slot, so purchases in one Prepare are bounded by the bank rather than the
    board. Only `gen/**` reads it. Documented at the constant in `types.ts`.

13. **`UNDO_WORDS = 8192` has less headroom.** `END_PLACE` is the widest record at
    up to ~1,510 words after round 6 added the two order words per commitment
    (was ~1,300). Every current driver unwinds in lock step or resets `top`
    per applied action, so nothing overflows today.

14. **`pack` accepts a tier-2+ pending summon.** Unreachable (`BUY_UNIT` is
    tier-1 only, `legality.ts:28`) and `check()` throws on it. Left as design
    item A specifies.

15. **The tag `standard-final` does not exist.** The pre-M2 Standard fixtures are
    blob `a96e09d7` at commit `2922375e`, recorded in a comment at the top of
    `lab/hard-ai/perft/phasing-fixtures.ts`.

16. **`make`/`unmake` do not restore the LENGTH of `originIds`/`pendIds`.** They
    are `string[]`, not typed arrays: an arrival taking a slot index past the
    current end grows the array, and `unmake` writes `''` back at that index
    rather than shortening it. Found by round 5's full-state comparison, which
    is why that comparison reads absent and `''` as the same thing and compares
    the two planes over the union of their lengths — an id LEFT BEHIND at a
    grown index is still reported. Inert: `unpack` treats `''` and absent
    identically (`core/state.ts:687,714`), the planes are cold data no search
    reads, and no key hashes them. Fixing it at the cause would mean recording
    two array lengths in every undo record for a field the search never touches.
    Owner: whoever next opens `resolveArrivals`.

17. **The ARRIVAL surface's order-permuted coverage is structurally zero.** Every
    case is synthesised as a canonical `GameState` and then PACKED, which renumbers
    the slots densely in canonical order, so the single `END_PLACE` that follows
    has no dead slot below the high-water mark to reuse and its arrivals land at
    the top of both orders. It therefore reports `proverOrderPermuted: 0` by
    construction, and order-permuted coverage belongs to the gate-preservation
    walk, which is incremental for whole games (645,000 such comparisons in round
    6's sweep). Owner: the harness lane. Fix sketch: apply two or three real
    `make` actions to the packed state before the hand-off, so a death opens a low
    dead slot inside the replica rather than inside the canonical array.

18. **The OLD engine's order sensitivities are recorded, not fixed.** §2.6.3 items
    17-19: `ai/planner/placement.ts`'s `slice(0, 8)` over `board.units`,
    `beam.ts`/`strategies.ts`'s truncation after a stable non-total sort,
    `engine-v2.ts`'s `slice(0, 32)` keep-set rescue scan and `plans[0]`,
    `ai/tactics/home.ts`'s capped DFS, and `spawning.ts getLargestSpawnZone`'s
    first-maximal-zone choice all make a `board.units` permutation change a
    RESULT. None is in the Hard engine's lane and none is reached by the replica,
    which uses bitboards and its own generators; but a `pack`/`unpack` round trip
    through the replica now preserves canonical order, so the one place this could
    have bitten a shipped path — `online/incomingPlayback.ts:42-43`, whose
    `JSON.stringify` board comparison drops playback on a pure permutation — is
    closed as a side effect rather than by intent. Owner: the engine-v2 lane.

19. **`ord`/`pendOrd` are 32-bit counters, rebased only by `pack`.** They increase
    by one per arrival and per BUY along a single un-unwound line and are restored
    exactly by `unmake`, so a search from a packed root cannot approach 2^31; a
    driver that made millions of arrivals forward-only without ever re-packing
    could. `Replica.check` asserts every living value is below its counter, which
    is what would catch it. Owner: whoever adds such a driver.


No disagreement with `docs/PHASING-2026-09-16.md` was found in the canonical
engine in rounds 1-5; ROUND 6 FOUND ONE IN THE REPLICA (§2.6) and the canonical
engine was again the oracle. The canonical engine was right in all 71 divergences rounds
1-3 measured, and round 4 fixed the replica to match it rather than adjusting any
expectation toward the replica. No round edited the canonical engine or
`src/game/**`. Round 6's surface is
`src/ai/hard/{types.ts,core/state.ts,tactics/prover.ts,search/pvs.ts}`,
`lab/hard-ai/fuzz/{statesnap,differential,prover-surface,run}.ts`,
`tests/ai/hard/{arrival-order.test.ts (new),pack-roundtrip.test.ts,packed-fixture.ts}`,
`tests/lab/fuzz-fault-injection.test.ts`, `lab/hard-ai/verify/gates.ts`,
`lab/results/hard-ai-verify/perft.json` and this document; it ran no
`git add/commit/stash/checkout/reset` either. Round 5 edited no `src/**` file at
all: its whole surface is
`lab/hard-ai/fuzz/{statesnap.ts (new),differential.ts,prover-surface.ts,run.ts}`,
`tests/lab/{fuzz-fault-injection,state-snapshot}.test.ts` (new),
`tests/ai/hard/{verify-replay-phasing,make-unmake}.test.ts`,
`lab/results/hard-ai-verify/{fuzz.json,fuzz-round5-campaign.json (new),perft.json}`
and this document. It ran no `git add/commit/stash/checkout/reset`. Round 4 touched
`src/ai/hard/{tactics/prover,core/movement,core/state,core/zobrist,gen/generate,search/root}.ts`,
`lab/hard-ai/fuzz/{differential,prover-surface,run}.ts`,
`tests/ai/hard/{prover,phasing-prover-debt,phasing-prover-underclaim,fuzz-reduced-positions,make-unmake,zobrist,distance-cache-collision,progress-key}.test.ts`,
`tests/lab/hard-fuzz.test.ts`, `vitest.config.ts` and this document, and ran no
`git add/commit/stash/checkout/reset`.

---

## Reproducing round 6

```
cd muju
npm run hard:types
npx tsc --noEmit -p .
npm run hard:deps
npx vitest run
npx tsx lab/hard-ai/perft/run.ts --check
npx tsx lab/hard-ai/perft/run.ts --check --engine replica

# the two reproductions and the fault injections, on their own
npx vitest run tests/ai/hard/arrival-order.test.ts \
               tests/ai/hard/pack-roundtrip.test.ts \
               tests/lab/fuzz-fault-injection.test.ts \
               tests/lab/state-snapshot.test.ts \
               tests/lab/hard-fuzz.test.ts

# batch A + B: 20 fresh seeds, all five surfaces, ~32 s each
for s in $(seq 400 419); do
  npx tsx lab/hard-ai/fuzz/run.ts --actions 250000 --arrival-cases 120 --cases 1500 \
    --seed $s --no-repro --out lab/results/hard-ai-fuzz-round6/s$s.json
done

# batch C: rounds 1-3's divergent seeds, replaying their ORIGINAL walks
for s in 7 14 15 38 104 145; do
  npx tsx lab/hard-ai/fuzz/run.ts --actions 250000 --arrival-cases 120 --cases 1500 \
    --seed $s --resign-rate 0 --no-repro --out lab/results/hard-ai-fuzz-round6/s$s.json
done
```

Expected: every command exits 0, with every mismatch counter 0 on every seed —
including round 6's `incrementalProverVerdictMismatches`,
`incrementalProverNodeMismatches` and `freshPackProverMismatches` — AND with
`proverOrderPermuted` non-zero on the gate surface of every seed, because a zero
mismatch count beside a zero there is exactly the evidence round 4 had.
`gateProverCapHits` must be 0; `hard:fuzz` prints the exposure line either way.

**To see the defect itself rather than take §2.6 on trust**, delete the insertion
sort from `tactics/prover.ts buildOwned` (so board order comes from the slot index
again, which is what round 4 shipped) and re-run:

```
npx vitest run tests/ai/hard/arrival-order.test.ts
```

Both reproductions then fail with `rescue`/3 nodes against canonical `unknown`/3
at cap 3, and the fresh-pack control in each still passes. The same fault through
the public seam is `SlotOrderFault` in `tests/lab/fuzz-fault-injection.test.ts`,
which moves the gate surface's incremental prover counters at seed 11 in 8,000
actions while leaving `freshPackProverMismatches` at 0.

**The external reproducers**, which are inputs to this round rather than part of
the tree (Codex's, read-only; they only write evidence files):

```
node --import tsx <workspace>/m2-arrival-order-repro.mts   <output.json>
node --import tsx <workspace>/m2-dead-slot-order-repro.mts <output.json>
```

Both now report canonical == incremental == fresh-pack on verdict AND node count
at caps 1, 2, 3, 4, 5 and 20,000, and `canonicalOrder == incrementalOrder`.

---

## Reproducing round 5

```
cd muju
npm run hard:types
npx tsc --noEmit -p .
npm run hard:deps
npx vitest run
npx tsx lab/hard-ai/perft/run.ts --check
npx tsx lab/hard-ai/perft/run.ts --check --engine replica

# the two rewritten tests and the two new ones, on their own
npx vitest run tests/ai/hard/verify-replay-phasing.test.ts \
               tests/ai/hard/make-unmake.test.ts \
               tests/lab/fuzz-fault-injection.test.ts \
               tests/lab/state-snapshot.test.ts

# batch A: 20 fresh seeds, all five surfaces, ~12 s each
for s in $(seq 300 319); do
  npx tsx lab/hard-ai/fuzz/run.ts --actions 250000 --arrival-cases 120 --cases 1500 \
    --seed $s --no-repro --out lab/results/hard-ai-fuzz-round5/s$s.json
done

# batch C: rounds 1-3's divergent seeds, replaying their ORIGINAL walks
for s in 7 14 15 38 104 145; do
  npx tsx lab/hard-ai/fuzz/run.ts --actions 250000 --arrival-cases 120 --cases 1500 \
    --seed $s --resign-rate 0 --no-repro --out lab/results/hard-ai-fuzz-round5/s$s.json
done
```

Expected: every command exits 0, with `divergences: 0` and every other mismatch
counter 0 on every seed — including `unmakeMismatches`, which is now the
full-state comparison. To see the blind spot itself rather than take §2.5.2 on
trust, revert `runFuzz`'s unmake check to `fuzzDigest(replica, p) !== digestBefore`
and re-run `tests/lab/fuzz-fault-injection.test.ts`: the `occTier`, `occBy`,
`pendBB` and ARRIVAL cases report **0** and fail, while the `uflags` case still
passes.

## Reproducing round 4

```
cd muju
npm run hard:types
npx tsc --noEmit -p .
npm run hard:deps
npx vitest run
npx tsx lab/hard-ai/perft/run.ts --check
npx tsx lab/hard-ai/perft/run.ts --check --engine replica

# batches A and B: 40 fresh seeds, all five surfaces, ~5 minutes each
for s in $(seq 200 239); do
  npx tsx lab/hard-ai/fuzz/run.ts --actions 250000 --arrival-cases 120 --cases 1500 --seed $s
done

# batch C: rounds 1-2's divergent seeds, replaying their ORIGINAL walks
for s in 7 14 15 25 31 38 43 44 47 49 50 57 59 61 67 69 70 72 75; do
  npx tsx lab/hard-ai/fuzz/run.ts --actions 250000 --arrival-cases 400 --cases 1 \
    --seed $s --resign-rate 0 --surfaces transition,legality,arrival
done

# batch D: round 3's divergent seeds, same split it used
for s in 76 83 87 93 96 99 100 102 104 106 107 108; do
  npx tsx lab/hard-ai/fuzz/run.ts --actions 250000 --arrival-cases 400 --cases 1 \
    --seed $s --resign-rate 0 --surfaces transition,legality,arrival
done
for s in 118 126 127 128 132 133 134 137 138 139 141 144 145 146 149 150 151 \
         153 154 155 156 159 160 161 163 164 165; do
  npx tsx lab/hard-ai/fuzz/run.ts --actions 400000 --surfaces transition \
    --arrival-cases 1 --cases 1 --seed $s --resign-rate 0
done
```

Expected: every command exits 0, with `divergences: 0` on every seed. Seeds 76 and
87 additionally report `legalityKeepSetTruncations: 1`, which is the designed cap
and not a mismatch. There is no tolerance flag any more: any divergence, of any
kind, on any surface, fails.

The three former debt reproductions need no fuzzing:

```
npx vitest run tests/ai/hard/phasing-prover-debt.test.ts \
               tests/ai/hard/phasing-prover-underclaim.test.ts \
               tests/ai/hard/fuzz-reduced-positions.test.ts \
               tests/ai/hard/progress-key.test.ts \
               tests/ai/hard/distance-cache-collision.test.ts
```
