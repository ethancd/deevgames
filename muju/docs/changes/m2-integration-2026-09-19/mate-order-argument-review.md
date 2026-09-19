# Round 6 MATE/order argument — bounded independent review

2026-09-19. Read-only review of `M2-STATUS.md` §2.6.5, canonical/packed home provers, and the directly relevant table/generator/cache consumers. Read `AGENTS.md` and `muju/docs/CONTENT_DAG.md`. No source edits, test/prover/search execution, opening data, sealed inputs, or full Gate1 outcomes. The coordinator owns raw sweep aggregation; its million-position claims are not independently certified here.

**Conclusion:** the narrow Phasing act-only, no-rescue MATE node-count argument is sound under the current failure-key and transition assumptions. It removes the earlier proposed mandatory order guard for semantic TT scores *solely because* capped RESCUE/UNKNOWN or uncapped rescue witnesses differ. It does not prove that every existing cache value or selective candidate list is representation-independent. The documentation should separate those claims.

## 1. Why the MATE argument works, and its limits

Canonical `homeCheckmate.ts:94–122` checks for rescue, excludes non-playing/bound-failing states, checks the failure memo, and only then charges a node. It inserts a failed key only after exploring all children. Exhaustion returns immediately up the stack without inserting incomplete ancestors. Phasing enters `act` directly (`:160`), not Standard's preparation DFS. The packed implementation has the same order (`prover.ts:554–567,626–669,723–734`), decrements AP on every recursive attack/move (`:614,:657`), and resets its failed set for every call (`:727`).

For a **no-rescue** position, define N as the number of distinct expandable keys in the finite reachable graph after terminal/damage-bound pruning. AP is part of the key and strictly decreases, so a key cannot recur on the active stack. Once a branch returns, its fully searched keys are memoized. Consequently every reachable expandable key is charged exactly once, independent of DFS traversal order. At a cap of N, all remaining revisits hit the memo before `spend`; at a smaller cap, at least one new key remains and sets sticky exhaustion. Thus, **on a no-rescue graph**, MATE iff N <= cap. The initial damage-bound shortcut is the N = 0 case. Rescue states return RESCUE or UNKNOWN, never MATE, regardless of traversal order.

This argument assumes (a) order changes successor order, not the legal successor set or bound; (b) the key identifies the state needed by those successors/bounds; (c) exact memo identity, or the implementation's ordinary negligible-hash-collision assumption. Canonical's fixed root-index relabeling and order-preserving removals make the keys of array-permuted roots isomorphic within this act-only search (`homeCheckmate.ts:90–92`; `prover.ts:305–340`). Packed's 64-bit Zobrist key is probabilistic identity, not a collision-free mathematical set. The claim does not automatically extend to Standard preparation, arbitrary external interruption, future proof-number search, or future consumers of RESCUE/UNKNOWN as a semantic verdict.

`core/state.ts:1697–1701` consumes only `HomeVerdict.MATE` for the full home-checkmate decision. Canonical `homeCheckmate.ts:183` does likewise. Accordingly the alleged order-dependent *home-checkmate terminal result* is not established by the existing RESCUE/UNKNOWN example. “Every other field is identical” is too literal: `ord`, `pendOrd`, IDs/slot representation and their history remain different. The relevant claim is equivalence of semantic game state under identity/slot relabeling, including the terminal decision.

## 2. Explicit correction to the earlier cache note

The earlier `work/m2-round6-cache-contract-review.md` is retained as historical analysis. Its general statement that an after-probe cutoff counter cannot protect an earlier cache hit remains true **if** the omitted distinction affects the cached value. However, its proposed blanket pre-lookup order-signature requirement was too strong for the specific present MATE-only adjudication path. The theorem above discharges that premise for this path; different witness lengths/work do not by themselves imply an incorrect semantic TT score or require changing public Kpos/Kturn.

The coordinator's already-executed `work/m2-uncapped-witness-order-probe.json` (SHA256 `e55c5bbb2c8b5cb59cea41d1cc43f8af98d63a1a514da7aaa17664c61ffe1e11`) contains two legal purchase-order prefixes, matching key tuple `[4053927936,375495259,3524920211,2269831762]`, and canonical RESCUE at 4 nodes/4 actions versus 3 nodes/3 actions, both uncapped; packed agrees. This establishes order-sensitive witness/work, not a wrong TT score, differing legal action set, or differing MATE result. No reviewer execution was performed.

Exact game-value/proof reuse can be valid across such semantic transpositions. The current df-pn body is an UNKNOWN stub (`tactics/dfpn.ts:78–93`); `pvs.ts:591–598` only publishes PROVEN/DISPROVEN values. Neither this wiring nor the stub proves a future selective df-pn implementation sound; that future proof remains its own obligation.

## 3. Claims that the MATE theorem does not establish

### Witness consumers and selective-search reproducibility

The statement that no consumer reads an order-sensitive result is incorrect as a description of the whole search. `search/root.ts:152` installs `homeWitness`; `gen/generate.ts:1035–1054` takes its returned length and actual line and injects that candidate. This happens for uncapped successful proofs too. A different valid line can produce a different selected continuation and different subsequent generator work even when full-prover calls cost the same amount.

That is an M4 selective-search/reproducibility concern, not automatic failure of semantic transposition equivalence. `generate.ts:1264–1271` deduplicates by ending Kpos, and `gen/actionsearch.ts:558` prunes by Kturn. Those merges can be semantically legitimate while failing a stronger promise of identical selected candidates, witness bytes, or fixed-work traces across representations. The product should state which promise it makes. Canonical replay's Kpos-only end check (`verify/replay.ts:105`) likewise verifies semantic end identity, not preservation of canonical iteration order. No incorrect cached numeric score was demonstrated in this review.

### A separate pre-hit representation obligation: slot-indexed NodeTables

`tables/context.ts:344–347` returns a memo hit solely from square-keyed Kturn and catalogue signature. The returned value includes slot-indexed `killActions`, `killCrystals`, `killNeedsBuy`, `killNow.entry`, `approach`, `retreats`, and `chain` (`:94–107,:274–303`). Equivalent packed boards can assign units to different slots, including fresh packs of differently ordered canonical arrays. The memo does not remap these arrays on a hit. `pvs.ts:568,:576` reuses per-ply tables; `eval/evaluate.ts:144–151` reuses the evaluator's table object.

This is a concrete source-contract gap for any caller that presents two same-key, slot-permuted representations to the same `NodeTables`. For example, swapping representations of two targets with unequal kill entries requires swapping their cached entries, whereas the current hit returns the old arrays. That scenario was not executed here, and the particular witness probe's scalar entries were not measured. A caller invariant that excludes such consecutive reuse could establish safety, but it is not enforced by `buildTables`.

**Requirement before claiming this memo safe:** guard a hit with the slot-to-square/identity mapping, rebuild/remap slot-indexed outputs, make the tables square-addressed, or establish/enforce that caller invariant. This does not require adding canonical `ord` to semantic Kpos. An `ord`-only permutation with slots fixed does not itself trigger this issue. The prover theorem and a later cap counter cannot repair a stale representation-bound table; this should remain an explicit table/cache owner item, independent of M2's home-adjudication correction.

### Bounded keep sets: the selection issue exists below 64 too

`gen/upkeep.ts:222–231` enumerates by slot; `:254–260` breaks equal-score ties by enumeration index. `gen/generate.ts:178,:480` explores only four keep sets at interior nodes. Therefore M2-STATUS's statement that below 64 the emitted full keep-set universe is complete can remain correct for the replica legality surface, but it does not establish downstream selective-search invariance.

A source-level example is three equal positive-priority rent units with enough cash for two: seven affordable subsets comprise three pairs, three singletons, and empty. Ranked order starts with all three pairs, then a slot-order-selected singleton. The interior prefix of four changes under a slot permutation despite seven being below 64. This is a reasoning example, not an executed fixture or proof of a numeric score change. `inject` offers the first keep set for its quiet line (`generate.ts:849–851`), so it does not universally restore omitted ordinary upkeep branches.

M4 can choose a square-based total tie-break, an explicit representation-dependent approximation contract, or stronger cache/selectivity checks. A selective-search score/bound needs justification under the chosen contract; semantic board equivalence alone does not prove identical bounded search output. Treat this separately from full legal-set completeness and from MATE adjudication. No blanket TT corruption conclusion follows from it without a relevant hit/score demonstration or an exact-search contract.

## 4. Handoff / acceptance boundary

- **Proven safe within stated scope:** retaining order outside semantic Kpos/Kturn for the current Phasing MATE-only home-checkmate decision; no demonstrated order-induced terminal split remains on this argument.
- **Documentation correction needed:** narrow §2.6.5's “only order-sensitive thing,” “no consumer reads,” and “every other field identical” language; explain witness/selection and slot-representation obligations separately. A zero cap counter does not measure uncapped witness sensitivity. Reversing order is one useful permutation test, not exhaustive permutation proof; the mathematical argument, not the sample count, carries the universal no-rescue result.
- **Pre-lookup obligation still open:** slot-bound NodeTables require representation-safe reuse or an enforced caller invariant. This is independent of a mandatory ordinal guard on semantic TT scores.
- **Can be tracked in M4:** candidate/witness determinism and bounded keep-set selection, including the below-64 interior prefix. This review neither requires a blanket key-format change nor certifies full selective-search TT reproducibility.
- No M2/Gate0/Gate1/Hard acceptance is inferred. Parent owns aggregate metrics, directed execution, and future-prefix evidence.

## Source pins and drift

Checkout `/Users/ashkie/src/deevgames-claude-hard-m2`. The last observed HEAD is `ecf37daf9b4e82b0f17630c45bd7832a77153b3b`; the supplied prior witness artifact reports older HEAD `879fe201ff181944577a4c1491876bf4d777a85e` with dirty round-6 edits. Source hashes below, captured during review and rechecked at its end, did not drift. This is a file-pin review, not an assumption that the earlier dirty-tree/HEAD label still applies. Paths below are relative to `muju/`.

| Source | SHA256 |
| --- | --- |
| `docs/hard-ai/phasing/M2-STATUS.md` | `d54a0bf76d228a5e4110bf8ea93c024aa695285e3d697e4e628310f4e2d2ae38` |
| `src/game/homeCheckmate.ts` | `4ea0a6b2f3d261a50ae690d6fe2fc9d8cd4d853891d3e21a43c91a5a68826cac` |
| `src/ai/hard/tactics/prover.ts` | `a4115a129d2484b58bbcbcbc59b0cef42e7a53239dc730b90088fb80fdb9fb96` |
| `src/ai/hard/core/state.ts` | `6760a278e12eaa1abb970e0ef6a2d19a63a11e9092e6cee845af5d228a8ff6f1` |
| `src/ai/hard/tables/context.ts` | `32b1c1890d872a6073a8282e73f3ee19e43eb89c4a9245120851680c9d0ca250` |
| `src/ai/hard/search/pvs.ts` | `70a76609276470dcf3399db65bf22011cf8dbb541dd12aa6bd582ac88435707e` |
| `src/ai/hard/search/tt.ts` | `dfeff41f52508aa0cb98231864e3b1a14be8b75eb00aee14e432519ded8da2e1` |
| `src/ai/hard/gen/generate.ts` | `4828a499c3563b3b9a624900bde3680595705bbb21e358dde30284c920bb8ba1` |
| `src/ai/hard/gen/actionsearch.ts` | `4067b1935752619ae35f1d1ec50cef8e7fedcdf6c97784a7992c10661f75334b` |
| `src/ai/hard/gen/upkeep.ts` | `4e66317b9c4fda6aa0c47573d20fa69c961becf8511500593864be5c465bc545` |
| `src/ai/hard/verify/replay.ts` | `9a668791a1456edf0cd777460150bb8b5ff7419f196b36610cec40e542c00a19` |
| `src/ai/hard/tactics/dfpn.ts` | `61f06c3c975e5fd39ed540f4d8884a5786afd12372cb8c4472d79bf0295186c2` |
| `src/ai/hard/eval/evaluate.ts` | `3cb129d2732ac4d05d33642edb1dd533ed7f164d22bbefde640874e1430bd914` |
| `src/ai/hard/search/root.ts` | `2332c620413d6abb9e5c130d7d021032cf6b3db3a08d2f6d7b45ede66ad57efa` |
