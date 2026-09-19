# M5 adapter source handoff

New lease files only: muju/lab/hard-ai/suites/phasing/engine-adapter.ts and
muju/tests/lab/suites-phasing-engine.test.ts. Root owns contract/measure/runner.
Source is paused for the coordinator's queued types/stub tests. This lane has
executed no Hard instance, search, evaluation, or measured suite.

API: createPhasingEngineAdapter({seed,weights?,restoreBinding,createEngine?})
returns identity, engineIdentity, evaluate(position,perspective), search(position,
work), executeCase(caseRecord,resolve). executeCase returns {execution,diagnostics}
with per-member eval/search entries; chosen actions remain in execution.turn(s).
AdapterRefusal retains diagnostic counters and actions from rejected results.

Production facade uses hardEnginePatch('desktop', owned resolved weights), explicit
EMPTY_BOOK and the actual HardEngine evaluator/search. Full evaluation uses
ctx.eval.full with the same vector/evalFix context; search accepts only positive
fixed work. Seed and vectors are copied; seed is still recorded/called even
though current HardEngine's RNG setter is a documented no-op. Each operation
gets a fresh engine and private root snapshot. A module-wide Promise queue
serializes process-global rule installation across adapters and awaited searches,
with known prior rules restored in finally.

Selected lines undergo real canonical full-macro replay and fresh Replica packing
of the endpoint to compare the engine's claimed Kpos; semantic hashes remain the
predicate authority. Reject fallback/book/unknown source, any divergence/proof
cap, illegal/incomplete/cross-handoff lines, input mutation, invalid fixed-work
statistics, wrong end key, and proven-terminal claims canonical replay refutes.

Identity separately pins Hard/canonical/adapter sources, normalized resolved
desktop config, full weight vectors/version, feature/packed/action/Zobrist ABI
sources/constants, fixed seed and EMPTY_BOOK. No numeric ABI was invented.
Injected test computation has a different executionKind/identity from production;
the measurement contract should require production explicitly.

Tests use injected recording facades, real canonical replay and real fresh pack.
They cover config/vector isolation, no placeholder/default-profile accident,
identity variation, veto channels, canonical input protection, asynchronous rule
serialization/restoration after rejected search, and both pair metrics/diagnostics.
The production factory is lazy, including the production identity-only test.

Prior shared scaffold evidence (coordinator-owned): fourth focused 103 passed,
0 failed, 0 skipped, zero drift; third types passed. The first actual CLI author
bundle reported valid 225 cases / 245 members with all canonical author checks;
this is pre-adapter author evidence, not a score/acceptance result. Earlier failed
diagnostics are retained. No old artifacts, weights, books, corpora or sealed data
were modified/read by the adapter implementation.

Coordinator verification subsequently passed 125 tests / 0 failures / 0 skips
across seven focused files and Hard types, with zero source drift. Those checks
precede the small full-statistics addition: successful and refused searches now
retain every HardSearchStats field, converting byClass to a plain JSON array;
tests assert the complete diagnostic record survives a JSON round trip. Source
and tests are paused for the next coordinator check; this lane ran no tests.

Read-only measure.ts / contract.ts review found no actionable scoring or input
binding defect. The CLI requires the exact manifest-bound preregistration,
validates canonical author evidence before engine use, requires a production
adapter, writes engine/input identity before execution, preserves a fixed case
denominator, and checks source/input/engine drift afterward. Family minima and
149 offered decision units / 76 coverage-or-structural cases are consistent.
Expected UNKNOWN for the bounded structural proof protocol is distinct from an
unresolved strategic proof. These remain suite engineering targets, not a claim
of migration, strength or release completion.

The coordinator authorized closing the partial-pair evidence residual. Each
completed operation is now retained by name, and a later refusal carries
failedOperation and completedOperations inside error.diagnostics. Existing
measure.ts serialization already preserves this payload; no CLI change was
needed. Typed refusal/actions remain unchanged, and initialization failures
retain earlier evidence without inventing engine counters. A focused injected
regression covers failure during the second evaluation, second search, and
second engine construction, including JSON persistence and global-rule restore.
This delta and the full-statistics assertions await coordinator execution;
repository source/tests are paused and this lane ran no tests or Hard operation.
