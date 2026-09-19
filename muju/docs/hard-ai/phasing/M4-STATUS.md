# M4 — Phasing macro turns, Prepare plans and horizon tables

2026-09-19, isolated `codex/phasing-m4`, based on reviewed M2/support integration
`0ecd0f9dbd71d7135d97e49cdd7e4cd971de5872`. M4 implementation and its scoped exit checks are complete.
This is not completion of the Phasing migration or its release gates. Evidence and all failed
diagnostics are preserved in `docs/changes/m4-search-2026-09-19/`.

## Implemented contract

A generated turn now covers the mover's entire remaining macro:
Act → END_ACTION → outgoing income/upkeep → Prepare → END_PLACE, stopping at
the first terminal or handoff to the opponent's full Act. Partial Act, Prepare
and pending-upkeep roots retain their actual boundary. The action search emits
Act prefixes; the central completion path supplies the legal remainder.
Replay rejects a correctly keyed but incomplete END_ACTION prefix and any
continuation after handoff. PAY_UPKEEP travels with the turn's owned four-word
keep mask through generation, copying, pooling, ordering and replay.

Keep choices are ranked without dependence on node tables, with a surviving
home occupier prioritized. Purchases use the original live-anchor union minus
existing commitments: no purchased unit chains a new anchor or acts now.
All affordable tier-I definitions are considered; mining is delayed and
disruption is charged as tempo risk, not destroyed escrow material. Prepare
promotion includes occupier and blocker fortification, singly or as a pair (see
the 2026-09-19 addendum). HOME_FORTIFY is tactical;
DISRUPT is not. SUMMON_STRIKE is removed. HOME_RACE emits a delayed commitment.
No memo keyed only by spawn mask and bank was introduced: promotion, damage,
ordered keep choice and tactical context are additional semantic inputs.

Current attack tables use living units and remaining AP. The next-Act horizon
projects already paid commitments, including a preceding opponent batch when
needed; each batch uses its common original arrival board. Current pending
units are inert and future arrivals require no new cash. This projection assumes
no intervening moves; it is not a prediction of the opponent's response. Target
healing follows the relevant handoff. Slot-indexed table-cache hits require the
exact slot-to-square mapping as well as their ordinary position identity.

Numeric macro TT entries apply only at full Act/AP4 roots without pending
upkeep or current-turn progress. Directed tiny-tree tests compare independently
enumerated configured children with TT on/off, warm full-root entries and
poisoned partial-root entries. They do not enumerate every legal game turn.
High-bit turn signatures compare correctly against signed killer/counter arrays.

Forced candidates displace ordinary ones when capacity permits. Actual per-ply
capacity reaches generation; all-forced overflow is explicit and marks search
truncated, rather than silently slicing the interior list. Forced home entry
receives its Prepare fortification even when the ordinary Act beam omitted it.
The independent 44-root run still encountered explicit overflow on five roots:
143, 221, 59, 183 and 393 omitted offers. These are not unique-line counts, and
neither complete forced coverage nor exhaustive move generation is claimed.

Quiescence charges actual in-flight subtree work and polls the local policy
stop during generation. After the allocation cap, later depth-zero leaves
route directly through ordinary terminal/static evaluation; their EVAL/global
work remains charged. Entered quiescence work is not clipped. The existing R5
criterion is quiescence work / allocated RUNG ≤ 0.35, as already documented in
DEVIATIONS.md (2026-09-15), the benchmark and gates. An old unit test used spent
total work instead. Its failed output remains preserved, as does the later real
allocated-rung failure that prompted the routing fix. No rate or gate changed.
The focused fixture passes; this is not a universal bound on arbitrary atomic
operation cost. A stop before iterative deepening starts retains truncation.

## Evidence and limits

The independent plan was recorded before validation. Inputs were all 40 authored
canonical M5 candidate diagrams, the initial Phasing position, and three declared
partial-Act prefixes. Candidate SHA256:
`86512dc5573b1283be2c4c28644ea28dadc0f6caaf83f5271cc31091e37b6b72`.
These are authored legality inputs, not scored suite answers, openings or floors.

Production generator/scorer/pool/rescue wiring at 50,000 generator work emitted
**3,380 candidates across 44 roots**. Every candidate was independently replayed:
**18,029 canonical actions and ordered state comparisons, 3,380 full-byte unmakes,
44 actual Hard results at 25,000 search work, four rejected fault probes, zero
failures and zero source drift**. Search depths were forty at depth1, one at
depth2 and three at depth3. Every returned candidate was checked, not every legal
candidate. Fault probes covered truncation, opponent continuation, wrong end key
and missing owned upkeep data. Full report SHA256:
`902cc2c0e483d228a316b5c5ba3b3525e8292eaa41e05842021daa28bdaf3ae4`.
The final deadline-corrected runtime repeated the same counts with zero failures
or drift; acceptance2 SHA256 is
`e5b55e35788eb8c05633bcd3722545cb5c618e065d477539fb13023d6ac7d35d`.

All six TypeScript configurations and the dependency scan passed. The last
targeted runtime check passed 108 tests. The first broad default-selection run
passed 822 and failed four, with zero skipped tests: a real-wall throughput
assumption, two geometry fixtures missing the explicit next-Act table, and an
invariant fixture with a spent attacker. Corrections and final results are recorded
in the accompanying change record; earlier failures remain intact. Broad2 passed
827 tests. Final review then found a two-poll deadline race; its fix passed
101 affected tests, the repeated independent row and **829/0/0 tests across
67 files** in broad3. Final app/Hard types and dependency scan passed; the other
four type configurations were also rechecked on the final runtime.

The deadline correction saves up to eight ranked complete initial candidates
with independent action/mask storage before deepening reuses its buffers. If
search stops before any answer exists, canonical verification selects a saved
macro at depth zero. A post-generation watchdog poll avoids beginning a new
child after expiry. Exposed candidates retain their original generator provenance.
Directed tests poison reused buffers and check both initial-stop windows, keys
and owned upkeep. The defensive zero-candidate/error escape paths are not
certified as clean results; they cannot count as passing release evidence.

Passed M4 tests are restored to default selection. The old P6/P8 files retain
their Standard snapshots, catalogue mocks and historical performance pins;
active Phasing tests exercise stop/cap/telemetry, canonical completion,
determinism and TT suppression. M5/M6 exclusions are still explicit and pending.
Trace output identity and final membership are tested; the old generator stage
vocabulary and removal attribution are not certified for Phasing.

The separate frozen A2 baseline row completed 1,024 games. Its independent audit
passed all 167,863 actions / 168,887 frames with zero issues, but **Gate 1 failed**:
Expand h0 drew all 128 games (behavior and strength failure); medium h3 won all
128 games against the candidate baseline (strength failure). This is a valid
negative result, not a void row. No thresholds, seeds, rules or outcomes changed.
The Hard M4 checks do not alter that V2 result or establish Hard strength.

M5 suite authoring/floors, M6 hand evaluation/tuning, M7 acceptance, worker/browser
gates and M8 cutover remain incomplete. Existing T6 Standard-runner versus
Phasing-only Hard dependency failures stay visible. No release guard, difficulty
preset, sealed set, production database, deployment or historical evidence was
changed. This branch is prepared implementation, not a released Phasing game.

## Addendum, 2026-09-19 — engine-homerace follow-up (`claude/phasing-followup`)

Three defects an independent review of this port found, fixed at the cause in
`src/ai/hard/{gen,search}/**`. Nothing in `src/game/**`, `src/ai/simulate.ts`,
the worker guards or the UI gates changed. No pre-registered floor, frozen pin,
perft/key/replica golden or v1 suite classification moved.

### 1 HOME_RACE is an ordinary purchase, not a Standard win-now line

Under Standard a home race was a win THIS turn (`BUY`, `END_PLACE`, walk into
the enemy corner with the same turn's actions). Under Phasing the BUY is a
PENDING commitment that arrives at the owner's NEXT turn start and only then
needs four move-actions, so it can never decide the turn that carries it. It
nevertheless kept every Standard privilege: emitted `FORCED` for every Act
endpoint × every qualifying `(definition, square)`, in `TACTICAL_FLAGS` so
quiescence searched it, in `NO_PRUNE_FLAGS` so it was never pruned or reduced,
carrying the top `ORDER_HOME_RACE` bonus, and scanned first by the root's
must-answer layer.

All five are gone. `expand` emits a race as an ordinary `HOME_RACE | PURCHASE`
candidate, capped at the two best squares by (corner cost, price, square)
(`HOME_RACE_EMIT`); every other race commitment is still reachable as a purchase
plan, which `planFlags`/`buildCombos` already retain (F13). `ORDER_HOME_RACE`
now applies to `HOME_ENTRY` only — an actual entry into the corner this turn.
The flag itself survives for ordering and telemetry.

Measured at fixed work, same inputs, same box. Over the 44 acceptance roots at
120,000 search work, 16 roots run a real search: **13 of the 16 gained a ply and
none lost one** (depths before `d1×7 d2×4 d3×4 d4×1`, after
`d2×5 d3×7 d4×3 d5×1`). Four roots now return a proven win the shipped code
missed at the same budget (`SD-10`, `SD-13`, `SD-29`, `SD-10-after-first-witness`
all move from `+400`/`-100` to `±997,000`; `HF-10` from `-5,400` to `-994,000`).
On the directed `negamax-sign` position the depth-5 forced win that the shipped
search needed 1,600,000 work to see is now found at 800,000 — **2× less work for
the same answer**, with depths 1-4 scoring identically.

### 2 A disrupting turn completes through the ordinary Prepare path

`injectDisrupt` injected one best MOVE and completed it `forcedOnly`, so a
disrupting turn idled its other three actions and bought nothing: it spent an
action to refund the enemy and used none of the tempo. The injection now
completes the same prefix a SECOND time through the ordinary Prepare path
(purchase plans, promotions, races). Those candidates are NOT forced — a forced
Prepare plan is exempt from futility pruning and LMR at every node, which is the
defect (1) just removed.

Over the 44 roots at 50,000 generator work: `DISRUPT` candidates 27 → 48, of
which **3 carry a buy and 21 a promotion, against 0 and 0 before**, with the
candidate count (1,048) and the forced count (229) **unchanged** — the improved
content costs no forced pressure. The rejected alternative (forced Prepare
plans) produced 369 disrupt candidates but raised forced from 229 to 571.
`DISRUPT` stays out of `TACTICAL_FLAGS`: a refund loses no material.

### 3 Prepare can promote two bodies, and the four-buy contract

`PlaceCombo` carried a single promotion index, so a `HOME_FORTIFY` mate needing
BOTH the corner occupier and a rescue-path blocker promoted was ungenerable at
any depth. `runFortifyPairs` now emits FORTIFY PAIRS, and only while an own unit
holds the enemy corner. Pairing is quadratic in promotable bodies, so it is
bounded (`FORTIFY_PAIR_POOL`, `MAX_FORTIFY_PAIRS`, both 24) and the pairs that
include the occupier are emitted first, because that is what such a mate is made
of.

**The four-buy contract.** Under Phasing a BUY takes no board slot, so the RULES
bound one Prepare's purchases only by the bank; a legal turn may buy more bodies
than any plan this generator writes, and `verify/replay.ts` accepts such a turn
from anywhere else. What is bounded is what `gen/**` PROPOSES:
`gen/purchase.ts PURCHASE_MAX_BODIES = 4`. With that, the longest turn the
generator can emit is `4 actions + END_ACTION + PAY_UPKEEP + 4 buys +
2 promotions + END_PLACE = 13`, against `MAX_TURN_ACTIONS = 24`. The stale
comment on that constant (which still described Standard's slot-bounded buys and
an eight-promotion Prepare) now states this. Raising `PURCHASE_MAX_BODIES` above
18 would be the first change that also has to move `MAX_TURN_ACTIONS`.

### Verification

`tests/ai/hard`: **895 of 896 pass**, up from 892 (five new regression tests;
see the goldens below). The one failure is `calibrate-cold.test.ts` "measures the
box with a real search and sizes the rung from that measurement", which is an
`engine.ts` policy test outside this lane and is reported, not patched: the cold
probe's single depth-1 iteration on its `MIDGAME` fixture now costs **12,461
units against 15,821 before**, and A16's `MIN_PROFILE_SAMPLE_WORK` floor is
12,500 — the probe misses a usable sample by 39 units. The probe did not finish
the position (it still stops on the work policy after 611 ms of real search), so
the floor is rejecting a good measurement; `probe.work >= MIN_PROFILE_SAMPLE_WORK`
is a proxy for "finished the position", which `stats.stopReason === 'complete'`
states directly. That is a call for the owner of `engine.ts`; no fixture, floor
or budget was moved to make it pass. The drop is caused by dropping `FORCED`,
not by the `HOME_RACE_EMIT` cap (measured at 12,450 with the cap removed).

The M4 independent acceptance driver (`docs/changes/m4-search-2026-09-19/
verify-m4-independent.mts`, repointed at this worktree; input SHA256 unchanged
at `86512dc5…`) was run on both trees:

| | baseline `a0551c8c` | after |
|---|---|---|
| roots | 44 | 44 |
| candidates | 3,339 | 1,051 |
| canonical actions / ordered state comparisons | 16,996 | 4,493 |
| full-byte unmakes | 3,339 | 1,051 |
| forced injections | 2,647 | 232 |
| `forcedOverflow` (forced offers dropped) | **690 over 5 roots** | **0** |
| Hard searches at 25,000 work | 44, no fallback | 44, no fallback |
| search depths at 25,000 work | `d1×40 d2×1 d3×3` | `d1×38 d2×3 d3×2 d4×1` |
| fault probes rejected | 4 | 4 |
| failures / source drift | 0 / 0 | 0 / 0 |

Every emitted candidate still passes `verifyTurn`, the production decoder and an
independent canonical replay with its own keep mask. The explicit forced
overflow this status recorded on five roots is gone, because the list is no
longer full of speculative buys before the first ordinary candidate.

Typecheck: `lab/hard-ai`, app, server and solver configs are unchanged from
baseline — one pre-existing error in `tests/lab/suites-phasing-veto.test.ts`
(a suite-verdict narrowing, untouched by this lane) on both trees.
`npm run hard:determinism` fails identically on both trees with
`Phasing weight schema/version mismatch` from its Standard-era corpus; the
in-process determinism gate `tests/ai/hard/determinism.test.ts` passes.

### Goldens that moved, and why

Three assertions encode the flag set or the ordering this change makes by
design. Each was rewritten to the NEW contract and strengthened, never relaxed:

- `quiesce.test.ts` "is exactly F24's five flags" → "F24's list less HOME_RACE".
  `TACTICAL_FLAGS` 6,159 → 4,111 (`HOME_RACE` 2,048 removed). The test now also
  asserts `isTacticalTurn` is false for `HOME_RACE` and that the bit is clear.
- `interfaces.test.ts` §4.13 frozen shape: the same `TACTICAL_FLAGS` value, plus
  a new `TACTICAL_FLAGS & HOME_RACE === 0` assertion.
- `generate.test.ts` "injects delayed home-race commitments as FORCED" → "emits
  a delayed home-race commitment as an ordinary purchase, never FORCED", plus a
  new cap test pinning the two best squares (H8, G9) on the same fixture.
- `negamax-sign.test.ts` "a one-ply search prefers a kill to a quiet move" →
  "a shallow search prefers a kill … and a deep one finds the win". The kill
  assertion is kept for every iteration that cannot yet see the mate (depths
  1-4, scores identical to baseline) and the completed search is now required to
  return the depth-5 proven win. The old form would have required the engine to
  be worse.

Nothing that pins rules, keys, perft, replica behaviour, a pre-registered floor
or a v1 suite classification was touched.
