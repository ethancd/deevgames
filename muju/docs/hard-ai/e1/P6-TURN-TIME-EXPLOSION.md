# P6 — the turn-time explosion in `hard@ablate:k96` vs `hard@desktop`

The E1.3 equal-time pricing row `hard@ablate:k96` (A) vs `hard@desktop` (B) at
`wall:3000`, run at commit `3953411b`, has 3,951 seat-turns. 3,930 of them are
under 3.1 s. Twenty-one are not, and five of those are between 23 s and **179 s**
— against a 3,000 ms allowance, in an engine that has had an explicit abort
watchdog since A11.

This document says where those seconds go, which of the three hypotheses the
evidence supports, why the deadline cannot in principle stop it, what the
smallest fix would be, and what the row's numbers are still worth.

**The one-line answer.** Root candidate generation calls the full
home-checkmate prover through `Replica.make`, once per within-turn node that
touches a corner. Those calls are charged **nothing** on the work meter, and
the generator is the one phase of a search that never polls `stop()`. So in a
position where the prover is expensive, root generation runs for as long as it
takes — 63 s or 115 s on the two turns measured — with neither the work rung
nor the wall deadline able to interrupt it. It is a **position pathology**, not
an arm effect and not a regression.

---

## How it was measured

`lab/hard-ai/bench/p6-turn-time.ts`, added by this diagnosis. It reconstructs
the recorded position with `analyze/replay.ts` (`loadReplay` + `reconstruct`,
the canonical rebuild `docs/hard-ai/e1/ANALYZE.md` describes) and then times the
engine's own public pieces around it:

```bash
cd muju
node --import tsx lab/hard-ai/bench/p6-turn-time.ts \
  --replay <run>/replays/e1-g2-s540_0_30-B-white.json \
  --side black --turn-index 19 --engine ablate:k96 --mode one
```

`--mode one` is the phase attribution; `--mode rung` re-runs root generation at
each `WORK_LADDER` rung; `--mode sweep` replays a seat's turns through one
engine in wall mode so the device profile evolves as it did in the game. The
script is a diagnostic: it imports nothing into the engine, is imported by
nothing, and takes no heavy slot (every run below was a single measured search,
run one at a time; ~10.5 minutes of one core in total).

Every number below was measured in a **fresh single-engine process** on the
recorded state. Nothing about the ladder, the worker or the second engine was
needed to reproduce it.

---

## The position

`e1-g2-s540:0:30`, replay `e1-g2-s540_0_30-B-white.json` (white `hard@desktop`,
black `hard@ablate:k96`, black won in 23 turns). The worst turn is the black
seat's turn 20, `players.black.turnMs[19] = 170,814 ms`:

> game turn 20, **black to move**, turn phase `place`, `actionsRemaining` 4,
> `upkeepPending` false.
> White: **16 units** — 14 × `fire_1`, 1 × `plant_1`, 1 × `water_3` — bank **94**.
> Black: **6 units** — 3 × `fire_1`, 1 × `metal_1`, 1 × `water_1`, 1 × `water_3` — bank **8**.
> Board: 201 crystals left over 51 cells.

The other game's worst turn, `e1-g5-s615:3:23` white turn 19
(`players.white.turnMs[18] = 179,066 ms`), is the same position **mirrored**:

> game turn 20, **white to move**, turn phase `place`, `actionsRemaining` 4.
> White: 8 units — 5 × `fire_1`, 1 × `plant_1`, 1 × `water_1`, 1 × `water_3` — bank 27.
> Black: **16 units** — 14 × `fire_1`, 1 × `lightning_1`, 1 × `water_3` — bank **54**.
> Board: 219 crystals left over 59 cells.

Both are the same shape: a mid-game position around turn 20 where **one side has
massed fourteen tier-1 fire bodies** and a large bank, and the side to move is
generating candidate turns in the presence of that mass. That is the whole
trigger. It is not about whose turn it is — both seats of both games explode,
in the same three-turn window, because both are searching the same board.

---

## The attribution table

Each column is one fresh process, one engine, `searchTurn(state, { targetMs:
3000, deadlineMs: 3000 })`. "must-answer + verify" is the whole call minus the
separately measured root generation; the subtraction is sound because the
in-engine search reports exactly the same `turnNodes` (671) that the standalone
generation spent, so it did exactly the same generation work.

| phase | g2 black t20, `k96` | g2 black t20, `desktop` | g5 white t19, `desktop` |
| --- | ---: | ---: | ---: |
| `Replica.pack` | 0 ms | 1 ms | 1 ms |
| `buildTables` (level-2, `tables/context.ts`) | 4 ms | 4 ms | 5 ms |
| book probe | 0 ms | 0 ms | 0 ms |
| `targetMs` + `chooseWork` | 0 ms | 0 ms | 0 ms |
| **root `TurnGenerator.generate`** (`generateAt` at ply 0) | **63,635 ms** | **63,603 ms** | **114,933 ms** |
| must-answer scan + `verifyTurn` (rest of `searchRoot`) | ~80,576 ms | ~21,564 ms | not separated |
| `iterativeDeepening` | 0 nodes, never ran | 0 nodes, never ran | — |
| **whole `searchTurn`** | **144,211 ms** | **85,167 ms** | — (recorded 179,066 ms) |
| recorded `turnMs` in the run | 170,814 ms | — | 179,066 ms |

And the meter's own view of that same generation:

| | g2 black t20, `k96` | g2 black t20, `desktop` | g5 white t19, `desktop` |
| --- | ---: | ---: | ---: |
| root candidates returned | 110 | 38 | 36 |
| place plans | 16 | 16 | 14 |
| work units the generation spent | **679** | **679** | **506** |
| … of which `TURN` (1 unit per within-turn node) | 671 | 671 | 498 |
| … of which `PROVER` | **0** | **0** | **0** |
| full prover calls `Replica.make` actually ran | (not counted) | (not counted) | **330** |
| effective throughput | **0.0107 units/ms** | **0.0107 units/ms** | **0.0044 units/ms** |
| the rung the engine picked | 400,000 | 400,000 | 400,000 |

The work rung was **400,000 units**. Root generation spent **679**. The meter
was never within three orders of magnitude of exhausting, so no rung the ladder
can pick would have bounded this phase — `--mode rung` is therefore a constant
function and is not reported. The engine's own price model says this generation
cost 679 µs; it cost 63.6 s. The model is off by a factor of ~94,000.

The whole-search stats say the same thing from the other end. Both arms, on the
worst turn:

```
depth 0   nodes 0   qnodes 0   turnNodes 671   evals 0
work 4,023 (desktop) / 12,903 (k96)   of a 400,000 rung
byClass  MACRO 0, QUIESCE 0, TURN 671, GEN 16, KILLTABLE 1, DFPN 0, EVAL1 0, EVAL2 0, PROVER 82
stopReason "abort"   source "fallback"   plan length 1
```

**The exploded turn never searched a single node.** It spent 85–144 s in root
generation and the must-answer scan, the watchdog fired the instant control
reached a poll site, and the seat played a bare `phaseEndAction`.

### Where the seconds actually are

`node --cpu-prof` over the 65 s root generation of the worst turn, self time:

| | self ms | share |
| --- | ---: | ---: |
| `damageBoundCore` (`tactics/prover.ts`) | 43,045 | 66.0 % |
| `reachableFrom` (`tactics/prover.ts`) | 16,766 | 25.7 % |
| `act` (`tactics/prover.ts`) | 2,999 | 4.6 % |
| `stableSort` (`tactics/prover.ts`) | 975 | 1.5 % |
| `computeKey` (`tactics/prover.ts`) | 806 | 1.2 % |
| everything else | ~560 | 0.9 % |

**99.0 % of root generation is `tactics/prover.ts`.** On the g5 turn the count
is exact: 330 full-prover calls in 114,933 ms — **348 ms per call**, each
allowed up to `PROOF_NODES = 20,000` proof nodes. Roughly two of every three
within-turn nodes the generator visits pay one.

---

## Why neither the rung nor the deadline can stop it

The prover is reached from generation like this:

- `search/root.ts:282` sets `p.proverMode = PROVER_FULL` for the whole root, as
  it must: a candidate line may step onto the enemy corner and `Replica.make`
  only adjudicates that with the prover on.
- `search/root.ts:288` calls `generateAt(s, p, t, 0)`.
- `search/pvs.ts:275-294` `generateAt` calls `gen.generate(p, t, s.score,
  s.meter, ...)`. It passes the meter. **It does not pass, and the generator
  does not have, any reference to `s.stop()`.**
- `gen/generate.ts:384`, `gen/generate.ts:419` and `gen/actionsearch.ts:599`
  are the generator's only interruption points, and all three test
  `meter.exhausted()` only.
- `gen/actionsearch.ts:590/612/804` apply each line through `Replica.make`.
- `core/state.ts:1335-1350` `provesHomeCheckmate` runs
  `homeVerdict(p, p.side, PROOF_NODES, this.proverScratch, 0)` at
  `proverMode = 2` — **with no `meter` argument**, so `prover.ts:770`'s
  `meter.spend(WORK_CLASS_PROVER, 1)` never fires.
- `search/pvs.ts:254-259` `chargeProver` is what bills the
  `Replica.fullProverCalls` delta. It is called from `pvs.ts:241` (the search's
  `makeTurn`) and `order.ts:308` (the ordering pass) — and from nowhere else.
  **`generateAt` never calls it.** That is why `PROVER` reads 0 for a
  generation that ran 330 prover calls.

So the generator is doubly blind: it cannot be stopped by the clock because it
never reads it, and it cannot be stopped by the rung because the cost it is
incurring is not charged to the rung.

The deadline itself is wired correctly everywhere it exists:

- `engine.ts:227` — `stop: () => this.aborted || (this.deadlineMs > 0 && now() >= this.deadlineMs)`.
- `engine.ts:392` — `this.deadlineMs = startedAt + (explicitDeadline ?? abortFactor × tms)`, armed after packing, `buildTables` and the book probe. Those cost 5 ms here, so that gap is not the problem.
- `search/pvs.ts:296-297` — `isTruncating(s) = s.meter.exhausted() || s.stop()`, used at `pvs.ts:445` and `pvs.ts:526`; direct `s.stop()` polls at `pvs.ts:562`, `pvs.ts:600` (where `stopReason` is decided) and `pvs.ts:620`.

**Every one of those poll sites is inside `pvs.ts`, i.e. inside
`iterativeDeepening`. `search/root.ts` contains no `s.stop()` call at all.**
Root generation and the must-answer scan both run before the first poll site is
ever reached. The watchdog is not late by a few milliseconds; it is
structurally unreachable for the whole first phase of a root search.

That also explains the shape of the `must-answer + verify` row. The must-answer
scan walks the root candidate list with the full prover live, and is likewise
unpolled — which is the one place the **arm** matters: at K=96 it walks 110
candidates instead of 38 and the phase costs 80.6 s instead of 21.6 s
(0.73 s vs 0.57 s per candidate). `k96` does not cause the explosion; it
multiplies the half of it that scales with K.

---

## Hypothesis verdict

**(a) The position makes an uninterruptible phase explode — CONFIRMED.** It
reproduces in a fresh process, with one engine, on the reconstructed state, on
the first attempt, for both arms. Root generation is the phase; the full
home-checkmate prover inside `Replica.make` is the cost; neither the meter nor
the deadline can reach it.

**(b) Two `HardEngine`s in one process interact — NOT NEEDED, and refuted as a
cause.** The explosion is fully reproduced by one engine in a process that
builds exactly one. Nothing process-wide (GC, `hardBotTiming`, shared module
state) is required to explain any of the measured time, and 99 % of it is
accounted for inside `tactics/prover.ts` by CPU profile. This hypothesis was
therefore not pursued further, per the "only if 2-4 leave it open" rule.

**(c) Something merged after `d3fe704a` changed behaviour — REFUTED, twice.**

- By inspection. `git diff --stat d3fe704a 3953411b -- muju/src/ai/hard` touches
  **`engine.ts` only** (41 insertions). `tactics/prover.ts`, `gen/generate.ts`,
  `gen/actionsearch.ts`, `core/state.ts`, `search/root.ts` and `search/pvs.ts` —
  every file on the path above — are byte-identical between the baseline commit
  and the run commit.
- By measurement. A `git worktree` at `d3fe704a` (since removed), running the
  same reconstructed state through `new HardEngine(hardEnginePatch('desktop'))`
  with the pre-A11 call `searchTurn(state, { targetMs: 3000 })`:

  | | `d3fe704a` | `3953411b` |
  | --- | ---: | ---: |
  | wall around the call | **87,682 ms** | **85,167 ms** |
  | `turnNodes` | 671 | 671 |
  | `work` | 4,023 | 4,023 |
  | `proverCalls` | 82 | 82 |
  | `stopReason` | `abort` | `abort` |
  | `source` | `fallback` | `fallback` |
  | profile after the search | `{ unitsPerMs: 1, samples: 1 }` | `{ unitsPerMs: 200, samples: 0 }` |

  Identical explosion, identical work, identical outcome. The 200-game baseline
  never saw it because it played `aiv2-hard`, which does not produce a
  fourteen-`fire_1` mass at turn 20; the position, not the code, is new.

The one real difference that table shows is A16 (`b36cabac`) working as
designed. At `d3fe704a` a 4,023-unit, 87-second search was fed to
`updateProfile` and drove `unitsPerMs` to the floor of **1**, which pins every
later rung in that game to `WORK_LADDER[0]`. A16's `MIN_PROFILE_SAMPLE_WORK`
floor rejects that sample, so the profile survives at 200. **A16 protects the
aftermath, not the turn.** It is a mitigation of a consequence, not of the bug,
and it is not the cause of anything in this row.

---

## The smallest fix I would propose (not implemented)

**Make the generator interruptible by the same `stop()` the search already
uses.** `generateAt` (`search/pvs.ts:275-294`) has `s.stop` in scope and already
hands the generator a `WorkSink`. Hand it a sink whose `exhausted()` is
`base.exhausted() || s.stop()`, and add the same `s.stop()` guard to the root's
must-answer scan loop in `search/root.ts`. That is a handful of lines, no new
configuration knob, no change to any price constant, and it reuses the three
interruption points the generator already has (`generate.ts:384`,
`generate.ts:419`, `actionsearch.ts:599`), so the granularity is one within-turn
node — 348 ms at the worst measured prover cost, against a 3,000 ms allowance.

Three things to say about it plainly.

- **It costs nothing in strength, and probably gains.** Today an exploded turn
  returns `source: 'fallback'`, `depth: 0`, `nodes: 0` and a plan of length 1 —
  the seat burns 170 s and then plays a bare phase end. Under the fix it would
  return the best of a truncated but real candidate list at 3 s. A truncated
  list beats a phase end.
- **Do not "fix" it by billing the prover instead.** Calling `chargeProver`
  from `generateAt` is a one-liner and is the obviously symmetric change, but it
  does not solve this: at `PROVER = 40` units per call, the g5 turn's 330 calls
  price at 13,200 units against a 400,000 rung, so the meter still would not
  fire. The price model says 40 µs; the measurement says 348 ms. Billing the
  prover is worth doing for honest accounting (and would make
  `proverCallsPer1000Macro` mean what `bench/run.ts` claims), but it is a
  separate change and it is not the interrupt.
- **Re-pricing the prover, or generating at `proverMode = 1`, are the bigger
  alternatives, and both change play.** `proverMode = 1`'s admissible damage
  bound during generation with the full prover reserved for the root's
  must-answer and `verifyTurn` stages would cut the cost at the source, but it
  changes which candidates exist. That belongs in an E2 experiment with its own
  A/B, not in a timing fix.

---

## What the row's numbers are still worth

**W/D/L stands, with one caveat that is about play and not about clocks.** No
illegal action, no crash, no divergence: `anomalies` is empty and
`replicaDivergences` is 0 on the affected games. Both engines ran under the same
rule and both hit the pathology — the two games' exploded turns are split 3/2
and 2/3 across the seats. The caveat is that on those five-plus turns the seat
played a `fallback` phase end rather than a searched turn, so **2 of the 32
pairs contain turns that were not decided by search at all**. That is a
play-quality footnote on two games, not a reason to discard the row: it is
symmetric in kind, it is caused by the position rather than by either arm, and
it cannot be attributed to K=24 vs K=96.

**The timing table is contaminated for exactly those two games,** and in a way
that matters for the mean and the tail but — usefully — not for p95:

| over 3,951 seat-turns | whole row | excluding the two games |
| --- | ---: | ---: |
| p50 | 1,760 ms | 1,759 ms |
| p90 | 2,941 ms | — |
| **p95** | **3,009 ms** | **3,008 ms** |
| p99 | 3,031 ms | 3,026 ms |
| max | **179,066 ms** | 9,246 ms |

Twenty-one turns exceed the 3,309 ms high-water mark of the 200-game baseline,
spread over 9 of 64 games. Sixteen of those are between 3.3 s and 9.3 s — the
**same mechanism at small scale**, and the reason `e1-g2-s0:3:5` white turn 14
costs 9,246 ms. Five are the explosion proper. Any `meanTurnMs`, `maxTurnMs` or
overrun count for this row should be read excluding `e1-g5-s615:3:23` and
`e1-g2-s540:0:30`, and the exclusion should be stated rather than silently
applied.

**For E5's p95 gates, the number to take away is not the p95.** A p95 gate on
this row passes either way — five bad turns in 3,951 cannot move a 95th
percentile, and that is precisely the problem: **a p95 turn-time gate cannot
detect this class of failure at all.** As long as one phase of a root search is
both unbilled and unpolled, the engine has no bound on a single turn, only a
distribution that looks obedient. E5 should gate on `max` (or p99.9) and on
`hardTiming.overruns`/`abortRate` next to p95, and should treat a single turn
over, say, 3 × the allowance as a hard failure rather than a tail sample. On
this row that rule fires on 21 turns and 9 games; on the baseline it fires on
none.

---

## Files

- `lab/hard-ai/bench/p6-turn-time.ts` — the reproduction harness (`--mode one|rung|sweep`).
- Artifacts read, never written: `/Users/ashkie/src/deevgames-e1-run/muju/lab/results/hard-ai-e1/ablate/k96/ladder/{games.jsonl,replays/}` at `3953411b`.

---

## Fix (lane 9)

Implemented on `claude/hard-ai-e1-lane9`. The diagnosis's own proposal, plus
the two things it turned out to need: the root has to be able to make a move
out of a truncated candidate list, and the salvaged move still has to be
canonically verified — which is where the residual seconds now are.

### The change

Three files, 205 lines including the comments.

- **`search/pvs.ts` — `generateAt` hands the generator a stop-aware
  `WorkSink`.** `StopAwareSink.exhausted()` is `base.exhausted() || stop()`,
  with `stopped` latched so a cut generation reads no further clock. It reuses
  the generator's three existing interruption points (`gen/generate.ts:384`,
  `gen/generate.ts:419`, `gen/actionsearch.ts:599`) at their existing
  granularity — one within-turn node. One module-level instance, armed per
  call: the search is synchronous and `generate` never re-enters `generateAt`,
  so no two generations are live at once. A generation the sink CUT also sets
  `s.truncated`, so a node that searched a deadline-shortened list cannot
  publish its value to the transposition table — `isTruncating` only notices a
  partial candidate LOOP, not a partial candidate LIST.
- **`search/root.ts` — the must-answer scan polls `s.stop()`** once per
  candidate it actually pays for (after the flag mask skips the ones it does
  not). Abandoning the scan is safe: a proven terminal the scan never reached
  is still a candidate in the list, so the worst case is playing it as an
  ordinary move instead of as a proven win.
- **`search/root.ts` — `pickUnsearched`, the salvage.** `searchRoot` used to
  return `phaseEndAction` whenever `iterativeDeepening` came back with no best
  turn, and with generation now interruptible that is exactly what a
  deadline-cut root reaches — with a full candidate list and zero searched
  nodes. It now picks the highest-`gainCc` candidate (ties to the lower index),
  canonically verifies it, and returns it as `source: 'search'`, `depth: 0` —
  the same shape `iterativeDeepening` already uses for a truncated iteration's
  best. Up to 8 candidates are tried before giving up and ending the turn.
  **The salvage is gated on `stop()` sampled BEFORE `iterativeDeepening`**, and
  that is load-bearing twice over: under fixed `work` it is constantly false,
  so the branch is byte-for-byte the `phaseEndAction` it always was; and it is
  the only state in which `s.turns[0][0..n)` is still the root's own list,
  since `rootIteration`'s `generateAt(s, p, t, 0)` overwrites that array and
  `s.keep[0]` with it. A deadline that fires INSIDE iterative deepening is left
  to that search's existing `rootPartial`.
- **`search/time.ts` — `WorkMeter.count`,** and `pvs.ts`'s `countProver` next
  to `chargeProver`. The generator's full-prover calls are now COUNTED in
  `stats.proverCalls` and `byClass[PROVER]` — they were counted nowhere, which
  is why an exploded turn reported `PROVER 0` for a generation that had run
  330. They are deliberately NOT PRICED: `chargeProver` would add
  `40 × calls` to `meter.used` (13,200 units on the g5 turn), which moves every
  fixed-`work` result in the lab, in CI and in the E1 baseline while still
  leaving the rung three orders of magnitude from bounding the phase. This
  document already called billing the prover "a separate change"; counting is
  the half that costs nothing, and re-pricing belongs to E2 with its own A/B.
  So `byClass[c] × WORK_COST[c]` is now an upper bound on what `c` contributed
  to `used`, exact for every class but `PROVER`.

No configuration knob, no price constant, no `HardConfig` field: `hard@desktop`'s
resolved config hash is unchanged (`tests/lab/baseline-identity.test.ts`).

### Measured, before and after

Fresh single-engine process per cell, `new HardEngine()` (= `hard@desktop`),
`searchTurn(state, { targetMs: 3000, deadlineMs: 3000 })`, on the two
reconstructed positions. Same box, same day, same background load (an
`action-width-wide` ladder row was running on two cores throughout, which is
why the before numbers are a little under the ones measured for the diagnosis).

| | g2 black t20, before | g2 black t20, after | g5 white t19, before | g5 white t19, after |
| --- | ---: | ---: | ---: | ---: |
| whole `searchTurn` | **80,288 ms** | **8,603 ms** | **132,686 ms** | **8,824 ms** |
| `stats.elapsedMs` | 80,286 ms | 8,601 ms | 132,685 ms | 8,823 ms |
| root generation (of that) | 60,567 ms | ~3,200 ms | 105,654 ms | ~3,200 ms |
| nodes searched | 0 | 0 | 0 | 0 |
| `turnNodes` | 671 | 10 | 498 | 19 |
| `stopReason` | `abort` | `abort` | `abort` | `abort` |
| `source` | **`fallback`** | **`search`** | **`fallback`** | **`search`** |
| plan length | **1** (bare phase end) | **5** | **1** | **6** |
| `scoreCc` | 0 | 955 | 0 | 2,805 |
| `work` | 4,023 | 82 | 4,002 | 83 |
| `byClass[PROVER]` | 82 (must-answer only) | 13 (generation, counted) | 86 | 11 |

Root generation measured on its own, at the rung the engine picks (400,000),
with a plain `WorkMeter` and no stop predicate — i.e. the fixed-`work` path —
is **unchanged**: 58,942 ms / 38 candidates / 679 units / 240 full-prover calls
on g2 (60,567 ms before), 105,482 ms / 36 / 506 / 330 on g5 (105,654 ms
before). That is the determinism argument as a measurement rather than an
argument: with no deadline armed, nothing about generation moved.

### The determinism argument

With fixed `work`, `engine.ts#searchTurn` never arms the watchdog —
`this.deadlineMs` stays 0 and `this.aborted` is false — so
`stop: () => this.aborted || (this.deadlineMs > 0 && now() >= this.deadlineMs)`
is constantly false. Therefore:

- `StopAwareSink.exhausted()` is `base.exhausted()`, on the same meter, at the
  same three sites: generation is the same generation.
- `mustAnswer`'s new poll is a constant `false`: the scan is the same scan.
- `pickUnsearched` is gated on `s.stop()` and never runs: the
  `phaseEndAction` branch is the branch it was.
- `countProver` moves `byClass` and `stats.proverCalls` only. `meter.used` —
  the one number every `exhausted()` reads — is untouched.

Pinned by measurement, not only by reading: `searchTurn(g2, { work: 2000 })`
returns `endKey 385c9f3fa38e47f1`, `work 4440`, `depth 0`, `source 'search'`
and the identical 6-action plan before and after the fix. That case is
`tests/ai/hard/p6-stoppable-generation.test.ts`, whose constants were measured
against the unmodified tree at `6b6f625f`. `hard:determinism`, `hard:perft`,
`replay.test.ts` and `lab/hard-ai/verify` are all green.

### What remains

**A third cost centre this diagnosis did not separate: the CANONICAL engine.**
Of the 8.6 s a cut search now takes on the g2 turn, ~3.2 s is the search (a
3,000 ms deadline plus one within-turn node of overshoot) and **~5.4 s is
`verify/replay.ts verifyTurn`** — the canonical replay of the single chosen
turn. Per-action timings on that plan:

```
END_PLACE_PHASE   applyMs 0
ATTACK            applyMs 0
MOVE (to 0,0)     applyMs 1464     <- a black body steps onto white's corner
MOVE              applyMs 1419
END_ACTION_PHASE  applyMs 1428
```

Once a body occupies the enemy corner, **every** canonical `applyAction`
re-adjudicates the home gate against sixteen enemy bodies, at ~1.4 s a call.
That is `src/ai/simulate.ts` / `src/game/`, outside `src/ai/hard/`; no deadline
inside the search can reach it, and it is paid on every path that returns a
real turn — the fully searched one included. A `hard@desktop` that SEARCHES
this position successfully still overruns its allowance by ~5 s. Fixing it is
a canonical-engine job (memoise the home verdict per position, or give
`applyAction` the replica's answer) and it is the natural next P-item.

**The first ~1.5 s of generation is still unpollable.** DESIGN §5.6's forced
injections run before the generator consults its sink at all (14 injections,
6 full-prover calls, 1,476 ms on the g2 turn). It costs no OVERSHOOT — it is
inside the deadline — but it eats half a 3,000 ms allowance before the beam
starts. Adding a fourth interruption point there would also be a new truncation
site under fixed `work`, so it wants a lane that can price that.

**The prover cost model is still wrong by ~10^4.** `WORK_COST[PROVER]` is 40
units (≈ 40 µs) against 250-350 ms measured. Counting the generator's calls
makes `bench/run.ts`'s `proverCallsPer1000Macro` mean what it claims; it does
not make the rung able to bound a prover-heavy phase. Re-pricing the prover, or
generating at `proverMode = 1` with the full prover reserved for the
must-answer and verify stages, both change which candidates exist and belong in
an E2 experiment with its own A/B.

**E5's gates are unchanged by this.** A p95 turn-time gate still cannot see
this class of failure — after the fix the worst turns are ~8.6 s against a
3,000 ms allowance, which is 2.9× the allowance and still invisible to p95. The
recommendation above stands: gate on `max` (or p99.9) and on
`hardTiming.overruns` / `abortRate`, and treat a single turn over 3× the
allowance as a hard failure. Note that the `source: 'fallback'` symptom is
gone — those turns now play a real, verified move — so an `abortRate` gate
alone would no longer distinguish them from ordinary deadline-cut turns; the
`max` clause is the one that matters.

### Files

- `src/ai/hard/search/pvs.ts` — `StopAwareSink`, `GEN_SINK`, `countProver`, `generateAt`.
- `src/ai/hard/search/root.ts` — `mustAnswer`'s poll, `pickUnsearched`, `searchRoot`'s salvage branch.
- `src/ai/hard/search/time.ts` — `WorkMeter.count`.
- `tests/ai/hard/p6-stoppable-generation.test.ts` + `p6-g2-black-t20.json`, `p6-g5-white-t19.json` — the two recorded positions as self-contained `GameState` fixtures.
