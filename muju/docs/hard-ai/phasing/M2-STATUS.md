# M2 — the packed replica becomes Phasing-only

Status of the M2 exit criteria on `claude/hard-phasing-m2`, worktree
`/Users/ashkie/src/deevgames-claude-hard-m2`, after **round 5**.

Round 4 widened the lane to `src/ai/hard/tactics/prover.ts` and closed every
divergence class rounds 1-3 had documented as debt. Round 5 closed something
else: two places where the EVIDENCE could not have seen a bug, found by an
independent review (Codex) which, for the second one, did not argue the point
but proved it with a fault-injection probe. Round 5 found no new replica defect
— it made two green checks mean what they had been claimed to mean, and it is
now shown, test by test, that each surface's counter can move. §2.5.

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
| 3 | `hard:fuzz` on **all five** surfaces — transition, legality, arrival, **prover**, **gate-preservation** — 0 divergences of every kind | **PASS**. Round 4: 28.55M walk actions. Round 5, with the new FULL-STATE unmake comparison: a further 6.5M walk actions + 6.5M gate actions + 39,000 prover cases + 3,120 arrival cases, all zero (§3.1) |
| 4 | `hard:perft --check` under both engines equal, counts frozen | **PASS**, nothing moved; `fixtures.json` byte-identical (sha256 `76db5122…`) |
| 5 | Full `npx vitest run` green | **PASS**, 137 files / 1,908 tests (`hard:test`: 41 files / 525) |
| — | Upper layers kept compiling, their tests quarantined in one place | **PASS**, one file fewer |
| — | Every surface's zero counter is shown to be able to MOVE | **PASS**, 13 fault-injection cases in `tests/lab/fuzz-fault-injection.test.ts` (§2.5) |

**Round 4 is the round in which criterion 3 became clean.** Rounds 1-3 ended with
49 transition divergences, all of them the same out-of-scope file — the packed
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
receives `ready.board.units` — the original array, which is ascending slot order
because `pack` assigns slot `i` to `state.board.units[i]`. Sorting it would
reorder every candidate list below it and move the node count.

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
| digest blindness itself | — | 11 single-field corruptions: `occ`, `occBy`, `occTier`, `pendBB`, `initialReserve`, `slotCount`, `proverMode`, `catalogSignature` leave `fuzzDigest` bit-identical (8 of 8), while `gained`, `materialCc` and `bank` change it (the control group). The snapshot names all 11 |
| transition | `firstDifference(p, pack(applyAction(...)))`, occupancy lanes included | the second `make` of each action corrupts `occTier` → `divergences > 0` |
| rehash | `recompute{Kpos,Kturn,OccHash}` against the incrementally maintained keys, every 64 actions | `make` flips a bit of `kposLo` that survives the re-make → `rehashMismatches > 0` |
| `pack(unpack(p))` round trip | `firstDifference(p, roundTripPacked)`, every 64 actions | `unpack` reports one crystal too many → `roundTripMismatches > 0` |
| legality multiset | replica's generated set vs `generateAllActions` + expanded MOVEs | `genActions` drops its last candidate → `legalitySetMismatches > 0` |
| prover verdict | `homeVerdict` vs `analyzeHomeDefenseEvidence` | the mock flips MATE↔RESCUE after case 40 → `fuzzVerdictMismatch > 0` |
| prover node count | `proverStats().nodes` vs `evidence.nodes` | the mock adds ONE node → `nodeMismatch > 0` (this is the sharp one: it moves before the verdict does) |
| gate preservation | `replicaOutcome(p)` vs `canonicalOutcome(next)` after every action | `make` awards a draw on its 50th call → `mismatches > 0` |
| harness invariants | `checkInvariants(next)` | already fault-sensitive: it is canonical-side and throws; rounds 1-3 recorded real hits |
| perft | frozen counts under both engines | already fault-sensitive: `fixturesMismatch`/`digestMismatches` are what caught the M1 regressions |

Each faulty run is paired with a clean run of the same shape reporting zero, so
the counter is not merely non-zero by construction.

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

**Gate-preservation** (batches A+B): **10,000,000 played actions**, 155,006 games,
`mismatches 0`, `proofsCompared 374,274`, `homeCheckmates 24,595`. Its games are
`createInitialGameState(..., 'phasing')`, and the id-adoption it does after each
action was widened from BUY (which places nothing under Phasing) to any action
that introduced a unit, which is the ARRIVAL at a hand-off.

**Arrival surface**: 17,200 cases, 0 skips, 0 mismatches across all eight kinds,
with all six intrusion shapes exercised.

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

## 5. Tests

```
npx vitest run       ->  137 files, 1,908 tests, 0 failures, exit 0
npm run hard:test    ->   41 files,   525 tests, 0 failures
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

And it rewrote two:

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
   as it already does for `sq`/`owner`; `corpus.ts mirror180` must do the same to
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
   consumers can refuse to publish from such a node.

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
    up to ~1,300 words. Every current driver unwinds in lock step or resets `top`
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


No disagreement with `docs/PHASING-2026-09-16.md` was found in the canonical
engine in any round. The canonical engine was right in all 71 divergences rounds
1-3 measured, and round 4 fixed the replica to match it rather than adjusting any
expectation toward the replica. No round edited the canonical engine or
`src/game/**`, and round 5 edited no `src/**` file at all: its whole surface is
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
