# M6 invariant and purchase integration handoff

Checkout: work/deevgames-phasing-m6. Read AGENTS, CONTENT_DAG and approved
M6-BOOTSTRAP-CONTRACT. Changes are limited to eval/invariants.ts,
gen/purchase.ts and new tests/ai/hard/phasing-invariants.test.ts. No weights,
rules, forecast implementation, corpus, data or historical evidence edits.

The twenty invariant indices remain fixed. Bits 5 and 17 are explicit
structural zero: a snapshot cannot reconstruct a delayed commitment's role or
causal change in movement cost from Standard's F_PLACED flag. No pending body
is treated as immediately live. Bits 7 and 14 read firstBillReached and actual
rentShortfall, including income/refunds before that bill; 7 additionally
requires a promotion flag and 14 retains the no-kill condition. An unreached
bill is not called affordable. Bit 19 consumes already-paid next-Act arrival
exposure without the obsolete enemy-bank threshold. leadCc adds exact
refundable pending principal, preserving BUY/arrival/refund transfers.

Purchase ordering uses the root forecast's requiredReserve when a bill is
reached, zero otherwise. This is a fixed pre-purchase baseline heuristic; a
new commitment may change future income. The penalty never removes an
affordable legal plan. The obsolete LIQUIDITY_FLOOR export was removed.

Fourteen new cases (seven mirrored controls) cover equal-cash phase timing,
promotion with/without next-bill income, incoming refund and terminal-before-
bill, structural bits, zero-bank paid arrival versus uncommitted/blocked
controls, canonical principal transfers, and actual legal purchase plans
whose ordering differs only by reserve shortage. First-bill values are
cross-checked against the independent canonical forecast. No search/evaluation
outcomes or numerical performance floors were used to author these tests.

Static diff --check passed. No tests or runtime probes were executed by this
lane. Source is paused for coordinator checks. As explicitly requested, old
purchase.test.ts and invariants.test.ts assertions remain unchanged for the
first diagnostic, so the removed import and stale bit expectations will be
visible. Coordinator authorized narrowly porting those assertions afterward;
no quarantine change is requested.

The first coordinator diagnostic preserved 202 passes / 20 failures overall
with zero drift. This lane's two new mirrored Inv19 failures were a fixture
premise error: plant_1 has defense 3, while the intended soft-miner predicate
requires defense 1. The fixture now uses catalogue fire_1, asserts defense and
mining premises, and adds canonical arrival/move/attack removal evidence. The
readonly reserve-array reverse was corrected by making a copy first.

After that recorded diagnostic, the authorized narrow legacy ports were made:
5/17 now replay legal commitment/arrival and assert structural-zero provenance;
7 distinguishes first bill from eventual depletion; 14 uses actual due rent
and a no-rent control; the purchase test compares a matching F16 assignment
with/without only its zero-spawn coefficient, and tests reserve/no-reserve
ordering on affordable retained plans. No runtime predicate changed in this
correction. Ready for coordinator verification; no execution by this lane.
