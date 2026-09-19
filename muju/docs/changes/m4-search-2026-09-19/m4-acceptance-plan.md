# M4 independent acceptance plan — frozen before implementation validation

Coordinator, 2026-09-19 04:32 CDT. No strength or timing result.

Run only after the three M4 source owners stop writing and hand off. Use the
shared heavy queue and a unique artifact path. Record source hashes before
imports/execution and after, Git state, driver hash and exact case-source hash.
A drifting source or interrupted run cannot establish acceptance.

Input: all forty authored canonical roots in
`m5-new-suite-candidates-2026-09-19.json`, SHA256
86512dc5573b1283be2c4c28644ea28dadc0f6caaf83f5271cc31091e37b6b72.
These are synthetic authored positions, not openings, game outcomes, scored
suites or accepted M5 floors. Add declared partial-Act roots reached by one
legal canonical action from selected Act diagrams, and initial Phasing Act. The partial roots use the first MOVE/ATTACK witness
branch from SD-01, SD-10 and SD-22, applying only its first action; this choice
is declared before execution. Total:44roots.
No sealed/val opening or active A2 outcome read. No self-play/corpus generation.

For each root, generate with the actual profile generator at fixed50,000work,
require at least one candidate, then inspect EVERY emitted candidate. Independently
walk its packed actions with its OWN keep mask and canonical applyAction:
- no action by the opponent or after a terminal;
- each action legal and makes a transition;
- canonical and incremental packed states agree after every action, including
  ordered units/pending, reserves, bank, flags, terminal, phase and turn state;
- complete macro reaches first opponent Act with full AP, or terminal;
- claimed end key matches canonical, no silent truncation, maximum24actions;
- full-byte unmake restores root; generation also restores its root;
- production decoder and verifyTurn agree with independent replay.

Run one actual Hard search per root at fixed25,000work, require no fallback and
verify all returned actions and full boundary independently. This is legality
and integration evidence only; stale M6 weights confer no strength claim.

Fault probes must reject a correctly-keyed truncated END_ACTION candidate, a
candidate continuing into the opponent turn, wrong end key, and missing owned
upkeep choice with an empty fallback table. Retain failures if found and rerun
only after an explained correction. The frozen input set is not shrunk.

Separate authored tiny-tree tests supplied by the macro owner cover negamax
and TT on/off equivalence, full/partial root domains, pending keys and keep-mask
representation. Coordinator reviews those assertions independently. Separate
source owners validate horizon tables and Prepare plans; all active M2 tests,
restored M4 tests, types and hard:deps run in the combined stable tree. No new
quarantine, blanket skips, guard opening or M4 completion based on only a
subset. M5/M6/M7 and live release remain separate.
