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
promotion includes occupier and blocker fortification. HOME_FORTIFY is tactical;
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
