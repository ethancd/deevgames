# M6 pre-execution driver review

Read-only scope: work/freeze-m6-bootstrap.mts and
work/verify-m6-independent.mts, plus source definitions needed to check their
calls. No driver, evaluator, engine, corpus or fixture-data execution; no source
edits. References below describe the scripts inspected before coordinator
corrections. Findings were sent immediately to the coordinator.

## Corrections recommended before execution

1. **Independent acceptance must veto recorded correctness counters.** The
   Hard-search check at232–236 currently checks fallback and canonical/end-key
   replay only. A recovered replica divergence or proof cutoff can therefore
   leave report.success true at250. Assert zero replicaDivergences,
   cappedProverCalls, economyCappedProverCalls and preparationEconomyCapped-
   ProverCalls, plus actually recorded generator rescue/economy caps and
   root-table forecast caps. Ordinary fixed-work exhaustion is a different
   event and need not be forbidden. Keep the counters in the report.

2. **Freeze the entire material contract.** Bootstrap line33 checks the sparse
   feature vector but not the full18 material vector. Nine motifs touch only
   some definitions. Before evaluating, compare every material entry with the
   canonical catalogue purchase cost times100, using the declared definition
   order. Otherwise an untested material prior could change while all18 golden
   cases pass. The expected-score formula itself uses canonical costs and is
   independent of the evaluator.

3. **Preserve final provenance on failure and detect added sources.** Bootstrap
   lines15–16 bind a fixed path list and line73 checks it only on success. Use
   a repeated source scan and write final drift information on the failure
   path too. Source/hash/git setup currently precedes the local try; a startup
   failure releases the shared queue through withHeavySlot, but lacks the
   driver's goldens failure artifact. Best effort finalization should preserve
   that reason where possible. Pin resolved weights before the first case, so
   failed goldens also identify the vector they exercised.

4. **Protect canonical root input during independent replay.** Independent
   lines144,230–234 retain and replay the same root object. Packed snapshots
   protect packed restoration but would not expose a search that mutated the
   caller's canonical GameState before returning. Snapshot the canonical root
   before any operation and assert it remains unchanged afterward; retain that
   original root in the failure artifact.

5. **Make resolved engine identity explicit.** Source inspection confirms
   new HardEngine() currently resolves DESKTOP, DEFAULT_WEIGHTS and EMPTY_BOOK
   (engine.ts258–263); no wrong-profile defect was found. Nevertheless this
   acceptance artifact should directly record/assert the actual vector hash,
   feature schema/version, book identity and resolved config, instead of
   leaving readers to infer them from source hashes. This does not require a
   different computation or new chosen scores.

## Checks that are coherent

- The bootstrap driver's18 roots are nine inline authored constructions and
  their separately evaluated rotations. It imports mirror180 as a source
  helper; it never invokes a stored-position loader or Hard search. All
  current import paths/signatures checked are valid.
- The expected value is canonical catalogue principal + actual bank + the
  independent canonical pass-only live ledger + pending principal/service.
  Its only service-bearing commitment has an immediate incoming Act after
  enemy Prepare, so omitting implementation risk selection from the expected
  formula is justified for this bounded fixture. No other pending fixture has
  resource service to discount. Canonical terminal stopping is retained and no
  future pass-policy terminal utility is added.
- Signed live ledger is formed before whole-crystal truncation; pending
  assets are formed as a signed sum before truncation. This matches the
  declared accounting units. Viewpoint antisymmetry is asserted within each
  same position; no cross-rotation equality is asserted.
- The independent driver binds the exact pre-M6 authored candidate input
  bytes, expands40 roots into the same44-root domain, and preserves every
  generated candidate's packed actions and canonical replay. Per-action
  canonical/replica state equality, complete-turn boundary, fresh endpoint
  key, decoder agreement, full-byte unmake and four negative verifier faults
  are checked. These are legality/replica acceptance checks, not M5 strategic
  scoring or a strength measurement.
- Both drivers require fresh absolute outputs and the real shared heavy
  queue, rejecting bypass/override environment variables. The independent
  report keeps per-root errors and fails when roots, errors or source drift do
  not meet its declared domain. Neither driver tunes weights or changes case
  classifications from outcomes.

No execution result, passing M6 claim, Gate0/Gate1 claim or release conclusion
is established by this source review.

## Bounded implementation handoff

After coordinator authorization, the two outside-repository drivers were
updated; repository source was not edited and neither driver was executed.
Coordinator-owned zero-cap/divergence vetoes, the full18 material assertion,
and explicit NULL_METER call remain intact.

- Both drivers now rescan source paths after success or failure, including
  added/deleted paths, retain before/after hashes, and veto driver/source drift.
  Input bytes are also rehashed by independent acceptance. Startup source/git
  work is inside the protected callback, so failures release the real queue and
  produce a failed artifact where the output can be written safely.
- Bootstrap pins the weights before evaluating; every case preserves its
  original canonical root, expected/actual values when reached, failure reason,
  and a finally-path canonical immutability check. Failed or mutated cases veto
  the aggregate. Its identity correctly describes Evaluator only, without
  claiming a book or search operation.
- Independent acceptance records and asserts the resolved production desktop
  configuration, EMPTY_BOOK object, feature schema/count/names, serialized
  weights hash/version/label and evaluator/engine weight agreement. Every new
  generator/search engine must share that identity. The identity is checked
  before search can update the throughput profile.
- Canonical roots are copied into the report before generation/search; partial
  setup, generator, search and finally-path checks detect caller mutation.
  The44-root domain, budgets, canonical replay, full unmake and fault coverage
  remain unchanged. No extra search, strategic score, fitting or data read was
  added.

Static constructor review confirmed mergeConfig preserves the declared desktop
configuration while copying mutable nested objects; its only default identity
substitutions are the required production weights and EMPTY_BOOK. Remaining
validation is coordinator-owned queued execution against the frozen source.
