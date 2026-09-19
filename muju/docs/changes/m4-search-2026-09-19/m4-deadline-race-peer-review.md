# M4 deadline salvage — coordinator review, 2026-09-19

Reviewed Galileo's four-file correction against the reported two-poll race.
No additional source finding. Normal successful-search scores/work rules are
unchanged; there is a bounded root allocation/copy and an additional stop poll.

The root saves at most eight ranked records before iterative deepening reuses
its turn and keep buffers. `copyTurn` owns the actions and optional upkeep mask.
Verification is deferred to the actual no-answer path, uses an empty shared
keep table and therefore cannot accidentally decode with a regenerated choice.
Each rejected candidate increments the divergence counter. A completed or valid
partial search answer remains preferred. This is bounded salvage, not an
exhaustive recovery procedure or a strength claim.

The first root iteration now observes the watchdog after generation and before
ordering/children. Its zero-child interrupted result cannot publish a numerical
search answer; iterative deepening records abort/truncation and retains any
previously completed result. With no earlier answer, the saved initial candidate
is verified and returned at depth zero with its own canonical key. The exposed
candidate list explicitly comes from the original generator snapshot even if a
later live probe buffer exists. No stopped iteration is labelled completed.

The first regression expires at the initial iterative-deepening poll after all
earlier polls were false. The second uses real regeneration, deliberately
poisons the original destination actions/masks, chooses a nonfirst legal initial
record, and stops before any child search. It requires the copied PAY_UPKEEP,
full canonical handoff/end key, abort/depth0/no fallback, zero searched children
and original-list provenance. The previous implementation would fail these
assertions. Existing last-completed-depth and real-wall deadline checks remain.

Coordinator executions: `m4-final-race-types-1` passed; affected seven files
passed **101/0/0** in `m4-final-race-focused-1`, all with zero source drift.
Independent acceptance2 passed all44 roots/3380 candidates/18029 actions and
state comparisons/3380 full unmakes/44 Hard results/four detector faults with
zero failures and source drift. Final broad regression remains a separate run.

Independent report SHA256:
`e5b55e35788eb8c05633bcd3722545cb5c618e065d477539fb13023d6ac7d35d`.

This review does not certify the defensive zero-generated-candidate escape or
recovery when all eight preserved candidates fail canonical validation. The
normal generator contract requires a candidate; the accepted fixtures satisfy
that contract. Such error paths must remain visible as failures and cannot be
used as clean release evidence. No universal runtime deadline/latency bound is
claimed by the deterministic watchdog tests.
