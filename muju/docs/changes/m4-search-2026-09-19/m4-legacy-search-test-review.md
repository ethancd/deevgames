# M4 legacy search-test port review (read-only)

No edits or executions. Read the four tests and their search/generator/canonical APIs only; did not open any corpus, opening or outcome file. Source remains in active integration. Inspected test SHA256:

- pvs: `34cdda8952fec517cf6bfb44cc151c85851c531913ea6c4b62a83e051f9f9020`
- order: `5b5ae3bf7d9ce821a20d2c5a3afba58fc1f2037eeadba4ded419c9d5c8a7ba69`
- mate-score: `4ca344dcafe675cf31445c9ad037e9bf836310c8f68f2725e42f199bc01a180c`
- root-exposure: `7730712d8de465a8c52101334c93c15fd27a1a4b870edc0c4d4842da5711a7b6`

## pvs.test.ts

**Port required: measured Standard work/trip assumptions are not semantics.** Initial Phasing Act now generates Act → mining/upkeep → Prepare → handoff, so fixed initial-position 3,000 work does not imply a completed depth 1, and the measured stop-call band 36–58 does not identify a partially searched deeper iteration. Do not repair these by fitting a new trip band to whichever move the engine currently chooses.

- One-ply identity: retain the independent child maximization, but use a tiny authored Phasing tree whose complete generation/search fits a declared bounded budget, assert no truncation/exhaustion, require **every** candidate to apply fully instead of silently ignoring `applied !== count`, and assert each nonterminal child switched side into full Act. Give the manual full-window quiescence traversal enough bounded work to complete independently; the old shared meter can exhaust at a different point from alpha-beta PVS, making an inequality an artifact of two partial searches. The macro owner's exact tiny-tree test should supply the stronger complete-enumeration proof.
- The test titled “a deeper search never reports a lower depth” performs only one search. Either accurately name it a completion test or compare declared max-depth 1 versus 2 on a tiny fixture with both completed; avoid a title claiming an untested monotonicity property.
- The 0.45 gate test should control the gate's actual precondition. On a tiny max-depth-2 fixture, use the completed-depth callback to spend the meter just above the existing 45% threshold after depth 1; assert no second iteration begins and the completed answer is retained. A companion just-below-threshold case can establish that the gate itself is exercised. No new performance threshold is needed.
- Cancellation identity: retain a full completed baseline by depth, capture stop-call counts at completed-depth boundaries, and interrupt a declared point *inside* a subsequent iteration (or use a controlled tiny search callback/probe). Require at least one interrupted run with depth ≥1 and an actual incomplete deeper iteration; the current `if (depth===0) continue` can skip every meaningful comparison. Compare copied action words, count, owned keepMask, end key and score, not only end key: M4 introduces another mutable field whose aliasing must be caught. Add an early-stop case separately, where no completed depth exists and a legal complete fallback is the intended contract.
- Existing work-rung allowance `+5000` needs its stated overshoot derivation checked against the new macro accounting; do not silently enlarge it just to pass. A small bounded fixture can test cooperative work-stop behavior without turning this into a timing/strength experiment.
- df-pn UNKNOWN wiring remains useful but needs a fixture/config that actually reaches the existing hook (depth ≥3, eligible full Act domain and corner horizon). Assert calls >0 as it already does. Disable extensions/aspiration for a controlled test if needed; do not assert equal completed depths from two budget-truncated initial searches.
- Rescue test comments and Prepare/upkeep roots are Standard semantics. Root already owns its correction: rescue witness belongs to Act; Prepare cannot spend four new actions. Keep a positive Act canonical-replay/forced-flag case and negative Prepare/upkeep cases, without dropping the old distinction silently.

## mate-score.test.ts

The terminal arithmetic and TT normalization tests remain rules-neutral; retain them.

The “replayed canonically” end-to-end test currently checks only result metadata. Add actual `applyAction` replay and legal/actor/boundary assertions. For the existing living Hi entering J10, Phasing does **not** award home mate upon MOVE: it remains Act, then must survive outgoing mining/upkeep and reach Prepare at END_ACTION. The fixture has no rent, so a legal complete winning line should stop at the terminal without END_PLACE or opponent action. Preserve the current mate threshold/source/fallback assertions; they are not a new strength floor.

The loss fixture has an established opposing occupation. Assert no fallback and replay the complete returned line to a canonical Black win. The established occupation wins at handoff before a counter-invasion can steal it; simply `scoreCc < 0` also accepts a negative nonterminal evaluation and does not establish this intended loss semantics. If inspecting score magnitude, use the existing mate-score contract on this forced terminal, not a new tuned threshold.

## order.test.ts

The table shapes, cutoff bookkeeping, fixed ordering constants and deterministic comparison are largely rules-neutral. Maintain their assertions. Ensure all generated turns contain the full Phasing macro before SEE applies them, with each owned upkeep choice.

The SEE test's claimed pair is not actually selected: it finds **any** hanging candidate, then asserts `turns[0].hangCc <= maxHang`, a tautology for every list. It neither requires a safe candidate nor isolates SEE from the new Prepare purchase/promotion score differences. Build two explicit legal complete macros from one authored partial-Act/zero-bank fixture, canonical-replay them, and compare their actual next-opponent-Act removability/hang values with equal other ordering inputs. In Phasing, current own commitments are not live victims to hang; valid opponent commitments that arrive at handoff are live reply attackers. A small pending/no-pending pair would directly cover that changed horizon. Do not label a unit freshly bought in Prepare as a current attacker.

TT/killer tests should require a nonempty candidate set before indexing and use stable candidate identity (prefer full end key for the test's lookup) while keeping the production TT's intentional low-word API. No need to change the actual stored key design here.

## root-exposure.test.ts

**Required before any run: remove executable Standard corpus/opening reads from this active test.** The module currently reads `authored.jsonl` and `openings.jsonl` during collection, and creates an implicit Standard initial state. Besides being outside this run's authorized input scope, those states take Phasing pack-error fallback; the on/off identity tests can then pass vacuously because `Summary` omits fallback/source. Preserve historical corpus bytes. Replace the eight active test cases with eight explicit small authored Phasing states (e.g. initial Act, partial Act, Prepare, explicit upkeep, own pending, opponent valid pending, disrupted pending, live home rescue/fortification). Do not mechanically reinterpret the old JSONL records. Require fallback undefined and canonical complete replay for every identity comparison.

The final `promotion-kill` fixture and `work:4000 implies depth1 / work:400000 implies deeper` assumptions are Standard-specific. Use explicit `maxDepth` configurations and a tactical **next-Act** reply fixture. One concrete bounded candidate for authoring: White Prepare with Sjor E3 (4,2) and Muju A1, Black live Muju D4 (3,3) and a paid Metal-I commitment E4 (4,3). Black's D4 rectangle is clear, E4 arrives on END_PLACE and can immediately threaten the adjacent Sjor on the ensuing Black Act; no new affordable purchase or pre-Act promotion is needed. Canonically verify this fixture before trusting it; it has not been executed here. This is a fixture suggestion, not a fitted expected move.

Keep searched-score/null, chosen-score, generator-list/completed-depth, unique keys and instrumentation residue checks. Add explicit suite-level or dedicated-case non-vacuity: at least one completed-depth result and at least one actual ply-1 node. The current per-node loop passes on an empty list, and the chosen-score test returns early for every generator-list result. Pending commitments should remain represented in candidate/end keys even though no live body exists yet; canonical replay of Prepare BUY results is a useful specific assertion. Test dispatch using depth-controlled root iterations and the recorded generator field, rather than wall/work rung accidentally producing a desired depth.

## Boundary of this review

These are port recommendations and static findings, not permission to shrink test coverage or raise performance allowances. Retain first diagnostic failures. The exact tiny-tree/PVS proof, forced-injection canonical row, table horizon tests and all active M2 regressions remain separate required evidence. No source changes or acceptance claim resulted from this review.

## Port re-review

Read-only follow-up of current root ports. No clear new fixture/assertion defect found in the revised pvs/order/mate-score files. Current hashes: pvs `36763cf7338924f3bbed9a696631d2ed84c84347e5e6d2cf221ccbf3f12cd59d`; order `2b1ee92216ab5df7983be244c87439e14d292e50debf468b69401828f97b18a0`; mate-score `310d9ee2cad89338e0b6f8565c78b8770fe9ace8a1542318d2732cac4df05012`.

- PVS now asserts completion/nonexhaustion for the independent one-ply maximum, controls the existing 45% guard directly, and requires an actual aborted deeper search while preserving copied actions/count/mask/key/score. The `WorkClass.TURN` charge is exactly one unit, so spending `target-used` reaches the intended threshold. The tiny fixture itself does not exercise a non-null owned upkeep mask; retain the separate M4 keep-mask/pool/copy regressions for that field rather than claiming this one tiny fixture covers them.
- The positive rescue fixture can clear B1, move Hi from C1 to B1 and remove the invader in three Act actions. With review enabled, Phasing deliberately pauses at outgoing upkeep even with zero rent, so the PAY_UPKEEP expectation is consistent. The remote surviving Black Metal-I prevents the rescue from becoming an elimination terminal.
- The paired SEE fixture's arriving immobile Metal-I has POWER 2 against adjacent Sjor. Moving Sjor one square north removes that adjacency; the only other Black body is Muju, whose POWER 1 cannot remove it alone. With no reserves, bank, tactical flags, history or signature bonuses, the existing 400-cc material difference isolates SEE as intended. The no-arrival control preserves the same live board. The signed signature tests isolate killer/counter bonuses on otherwise identical complete macros.
- Mate-score now canonically replays the positive/loss cases and respects Act → Prepare home-mate timing. Existing Hi entry has no rent obligation, so its mate is adjudicated at END_ACTION; the loss fixture's established opposing occupation resolves at handoff and cannot be stolen by counter-invasion.

Runtime behavior and type checks remain pending the next stable coordinated run; this re-review does not certify them.
