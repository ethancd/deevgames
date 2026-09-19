# M6 continuation map — Phasing evaluation and bootstrap

2026-09-19. Read-only map of the frozen plan, `/Users/ashkie/.claude-max/plans/can-you-plan-out-bright-nova.md` §4e (lines 144–156) and §4i, against the uncommitted M4 tree at `/Users/ashkie/Documents/Codex/2026-09-18/wba/work/deevgames-phasing-m4`, HEAD `0ecd0f9dbd71d7135d97e49cdd7e4cd971de5872`. AGENTS/CONTENT_DAG were read. Paths below are relative to that checkout, normally under `muju/`.

Only this outside-repository map was written for this task. No engine, test, oracle, corpus generation or tuning command ran. No opening/corpus/sealed data files or historical outcome artifacts were opened; discovery searches returned some historical-document/source-comment snippets, which are not used as empirical evidence here. The current M4 source freeze remains in force. Parent owns M4 acceptance; its latest focused3 diagnostic was 350 passing / 3 failing, with two stop-truncation and one quiescence-budget defects routed to the macro owner. This map does not claim M4, M5, M6 or any release gate complete.

## Binding sequence

The frozen plan requires **hand-derived Phasing evaluation before any self-play**. PendingValue must exist first; treating BUY as a bank loss with no corresponding asset would produce a degenerate no-buy corpus. Sequence: implement and prove semantic feature/economy contracts → document and pin bootstrap hand weights (zero ungrounded stale terms) → freeze M5 suite versions, score floors and new goldens before tuning → generate eligible dev-only self-play/corpus → Texel on dev → selection/validation on val → re-pin selected generated weights, weight version, `MUJUBK03` and resolved identity.

Source and authored-test work below can proceed after M4 stability without learning anything from val/sealed. Running corpus/tuning or calling the bootstrap a strength baseline cannot proceed merely because these source edits compile. M5's ~30 summon-disruption/~10 home-fortify authored candidates are not accepted scored suites or numeric floors; intermediate consequence witnesses are not complete-macro best/avoid oracles. Their independent canonical replay establishes legality, not a search score floor. The parent must establish those boundaries separately. Gate 1 baseline sanity, full Gate 0 veto, val success, sealed strength and responsiveness remain separate; none is inferred here.

## Concrete source slices and dependencies

### A. Timing and economy (prerequisite for liquidity and risk values)

1. `src/ai/hard/tables/economy.ts:180–307` currently projects only live slots, holds rent constant, takes live `strike` for relocation risk, and starts both sides at `p.bank[side]`. Its loop already computes `running += incomeT - upkeepPerTurn` before checking negativity; do not claim this arithmetic itself is still rent-before-income. The missing work is a **phase-aware first payment/income horizon**, delayed bodies/refunds, and the valuation discount convention. Name whether each output is the imminent unsettled closure, the next own Act closure, or a full-own-turn forecast.
2. At an Act macro root, the mover has not earned current income or paid its current rent; the waiting side has already paid its preceding turn's rent. In Prepare, income is already credited and rent is either paid or explicitly pending. An unpaid Prepare bill cannot be financed by counting the same income twice. Write directed canonical witnesses for Act, paid Prepare, and upkeep-pending Prepare, for both requested sides. Same numerical banks do not imply the same cash-flow timing.
3. Derive expected arrivals from M4 `core/spawn.ts:308–339` (`validPendingMask`, `nextActProjection`) and canonical handoff order. The current mover's following Act has an intervening enemy batch; the imminent opponent has one arrival window. Reuse same-snapshot validity and simultaneous occupancy; do not let one arrival anchor its siblings. Income starts only after a body has arrived and completed its Act; a refunded commitment returns cash at that arrival boundary. State clearly which projection assumes no intervening moves or upkeep releases. Do not confuse conditional relocation forecasts with canonical legal rollout evidence.
4. `lab/hard-ai/oracles/economy.ts:173–185` is currently a held-unit projection that subtracts rent before calling `endOfTurnIncome`, allows debt and never resolves arrivals. The end balance alone cannot distinguish order. Replace/extend its independent reference with actual frozen canonical Phasing timing and explicit prepayment/postpayment balances; keep a separately named held-board forecast if needed. Its default `loadCorpus()` at 132 reads authored/openings/fuzz JSONL. Do **not** execute that default while porting; add explicit authored input or a dedicated generated no-corpus oracle mode first.
5. `core/income.ts:38–51` supplies existing gamma and `RENT_PV=422`; `features.ts:177–182` caps BankLiquid at 8; weights charge Rent at -422 and the default economy stream subtracts rent again. Re-derive which horizon/discount each term prices and charge rent once in the valuation ledger, while continuing to subtract actual rent in the insolvency cash-flow ledger. The existing `EvalFix.rentOnce`/relocation flags are research-arm switches, not automatic proof that their old coefficients suit Phasing. A Phasing baseline must state its policy, not silently inherit whichever optional flag was absent.
6. `gen/purchase.ts:78` still exports `LIQUIDITY_FLOOR=6`; `invariants.ts:357` uses a separate literal 6. Coordinate a narrow follow-on lease to replace both with the same meaningful `max(0, due_next - income_next)` reserve or to remove an obsolete ranking penalty. This is a dependency of M6, not authorization to reopen M4 generator policy independently. Pending escrow is not spendable cash before a refund.

### B. Pending features and table provenance

Preserve existing indices 0–57 (including the 20 invariants at 38–57). The smallest specified extension is:

| Index | Name | Semantic contract to freeze before implementation |
|---|---|---|
| 58 | PendingValue | Per commitment: full refundable escrow plus `(1-risk) × discounted value`, then signed side difference. Never discard escrow when the current projection is invalid: it is refundable, not destroyed material. Define the incremental future-value basis explicitly so it is not accidentally counted again in live Material/PstMine/EconDelta. |
| 59 | ArrivalThreat | Threat attributable to an already-paid valid arrival at the declared next-Act horizon, using the simultaneous occupancy and healing assumptions implemented by M4; no bank-gated hypothetical purchase. |
| 60 | DisruptPressure | Reachable opportunity to delay currently valid enemy commitments, preserving alternative anchors and target occupation; a refund is tempo/escrow delay, not a kill or lost material. |
| 61 | RentShortfall | Nonnegative imminent required reserve/shortfall under the phase-aware income-before-rent contract; define whether the feature is required reserve or the amount missing after available cash, and keep that definition identical in tests and weights. |

`features.ts:57,59,127,137` and config's duplicated count at `config.ts:480` become 62. Do not renumber earlier features or reuse invariant slots. Update names and stages, out-buffer lengths, serializer and interface tests together. Layering forbids config importing eval: keep a checked duplication or deliberately move a shared shape constant to a permitted lower layer.

M4 dependencies are already present: pending planes/cost sums in PackedState; Kpos/Kturn pending identity; current `killNow` vs future `killActions`; live next-Act `strikeNext`; paid-arrival-only legacy-name `strikeIfBought`; projected home geometry; and slot-mapping guarded NodeTables. Preserve these rather than reverting to old hypothetical BUY/PROMOTE threats.

Two non-obvious integration requirements:

- `features.ts:364–375,488–489` partitions Hanging/HangingBuy using `killNeedsBuy`. M4 intentionally writes that field as zero (`context.ts:216,254`), because arrivals cost no new cash. Therefore the old HangingBuy feature is now inert. Add explicit **arrival dependence** provenance (or a live-only-vs-live-plus-arrival comparison) to the future kill table; rename/restate index 29 as hanging-to-arrivals under the new feature schema. A selected plan containing an arrival does not prove the kill *requires* one if an equally cheap live-only plan exists. Define partition/overlap deliberately so one target is not unintentionally charged twice by Hanging, index 29 and ArrivalThreat.
- The purchase heuristic at `gen/purchase.ts:170–227` already intersects all supporting anchor rectangles, considers reachable live enemy occupations and charges delay rather than destroyed material. It explicitly omits captures/combinations/future arrivals. Eval cannot import gen without reversing layers. Move/share a pure geometry helper in a permitted core/table layer only if a common contract is intended; otherwise document that evaluation uses a distinct bounded heuristic. A boolean geometric vulnerability must not be called an empirically calibrated probability. Risk coefficients/discount basis need written hand derivation, not numbers chosen after observing games.

`leadCc` (`invariants.ts:388–391`) currently ignores pending escrow. DrawPressure and invariant 16 then call a side poorer merely because it legally paid into a commitment. Add the appropriate refundable-asset contribution under the same accounting contract; reserve future service value for the intended evaluator feature, not an unexplained second lead bonus.

### C. Existing feature/invariant semantics that must be restated or zero-weighted

- BankLiquid/BankExcess (indices 2/3) and BankConvertible (6): remove the unexplained reactive-purchase option value and derive thresholds from payment timing; Prepare commitments are delayed assets. Keep scale/rounding explicitly signed and deterministic.
- SpawnZero (9), Inv1 (38), ElementCoverage (22): legal future recruitment space is distinct from already-paid arrivals and current attack coverage. `elementCoverage` at 257–275 currently grants coverage for any affordable tier-1 definition even without a legal spawn square; cash alone must not imply an attacker now. State the useful future interpretation or give it zero bootstrap weight.
- HomeThreat/Countdown/Plug/Rescuers (13–16) and Inv10/11: M4 home tables now use a future paid-arrival horizon. Define which turn the quantity describes and which live/arrival bodies are actual rescuers. `homeBare` at 398–419 still combines a live speed-3 runner or bank≥3 with spawn geometry; replace that obsolete purchase-budget story with actual horizon evidence.
- Inv7 (feature 44): a Prepare promotion increases **future** rent after this turn's income/rent settlement. Use the next unpaid bill, not a bill already paid at END_ACTION.
- Inv14 (51): replace the fixed 6-crystal threshold and explain whether the old “unless a kill occurred” exemption remains justified. A kill does not itself pay next rent.
- Inv18 (55): Phasing intentionally permits ending Prepare while buys are affordable. Keep the feature zero/protocol-only or give it a new explicitly frozen behavioral definition; never classify a legal early END_PLACE as a protocol violation.
- Inv5/17 (42/54): `F_PLACED` comments at `invariants.ts:131–192,246` still describe a purchase becoming an immediate live body. Pending commitments cannot block current movement; actual arrivals are reset at startTurn. Rewrite these as useful delayed-arrival/commitment judgments with the relevant data, or zero their stale weights. Do not fabricate F_PLACED on pending bodies to preserve old tests.
- Inv19 (56) tests paid-arrival `strikeIfBought` but still requires enemy bank≥3 (`invariants.ts:255–266`). Remove that bank dependence for prepaid arrival threats.
- Inv3/4/20 and StrandPunish use the approach/retreat/killNow mix (`invariants.ts:97–128`, `features.ts:385–424`). Audit their time horizons: current flags/AP, next-Act healing and projected arrival occupancy cannot be mixed silently. Retain the M4 table distinction, and use authored controls where current and future answers differ.
- Invariant penalties remain features, not generator filters. Keep `INVARIANT_COUNT=20` unless a separately approved feature-contract change requires otherwise.

### D. Staged evaluator, bounds, weights and version identity

The current stage ranges are contiguous: stage0 0–4, stage1 5–22, stage2 23–57 (`evaluate.ts:137–152`). `STAGE_OF` automatically makes every appended index stage2, and `stage2` sums through FEATURE_COUNT-1. Placing all four new table-dependent features in stage2 is the least invasive shape, **provided the lazy bound includes them**. If escrow is intentionally placed earlier, update both extraction and summation (explicit stage membership or separate added terms), not just STAGE_OF; otherwise it is omitted or counted twice.

`boundStage2` (`features.ts:571–639`) currently bounds live material/mining/rent only. Paid escrow, arrival service and additional delayed miners can exceed these live-only bounds. Derive conservative bounds for all new terms and every altered economy term before permitting lazy exits. For a temporary bootstrap, computing full evaluation unconditionally is sounder than retaining an unproved bound, but must be measured as a deliberate performance change. Add varied-window comparisons to full evaluation, side-swap antisymmetry and rotation tests with unequal pending planes, both phases and debt. No bound reduction from measured examples alone.

`weights.ts:39` is version 1 and DEFAULT_WEIGHTS is `default-v1`; `loadWeights` at 176 accepts a supplied arbitrary integer version and enforces only vector length. HardEngine substitutes DEFAULT_WEIGHTS only for implicit version-0 placeholders (`engine.ts:258–263`), while explicit vectors and setWeights are accepted. The new bootstrap needs a distinct nonzero version/label, a complete 62-slot vector, unit/scale annotations and a hash bound to source. Invalid or old-shaped vectors must fail before search; padding historical 58-value vectors with zero is not a Phasing compatibility policy. Since index 29 semantics change too, length alone is insufficient for future equal-length revisions. Add an explicit feature/rules schema identity to persisted tuned/corpus artifacts or enforce the chosen new version at the appropriate loader boundary.

The immutable contract must include material scale (the separate 18-parameter block), new feature units, integer rounding, risk/discount basis, and which old weights were zeroed with reasons. Preserve the existing fact that `w[Material]` is informational and Evaluator scores `Weights.material` directly. A demonstrated canonical BUY/refund/arrival ledger must account for cash, escrow, live material and future value exactly once. Use documented costs/gamma and hand reasoning; do not invent score floors, success rates or fitted coefficients here.

Dependency trap: `lab/hard-ai/audit/eval-groups.ts:92–94` defines invariant features as `FEATURE_COUNT - INV_BASE`. Appending four features would incorrectly call them invariants. Restrict this to the 20 actual invariants; add each new feature to exactly one coordinator-approved group (GROUP_OF currently throws for an ungrouped index); derive stage2 membership consistently with the evaluator. Update `tests/lab/eval-groups.test.ts` and interfaces/feature-count assertions. Audit utilities already allocate dynamically in many places, but dynamic length does not make grouping or version provenance correct.

### E. Book and corpus boundaries (source work now; data generation later)

- Keep `EMPTY_BOOK` for the bootstrap/correctness work. Do not load a historical binary to test format compatibility: synthetic bytes can establish rejection.
- Frozen plan requires `MUJUBK03`; current `book/format.ts:24` is `MUJUBK02`, with handicap/mapHash/weightsVersion in its 20-byte header. Update parser/writer/tests and reject BK02, preserving historical files. Add/validate sufficient feature/rules identity and metadata at both fixed-work and wall/cold-probe entry points before any book is used. Current `engine.ts:386–388` merely stores a Book, and `search/root.ts:389–392` probes any nonempty one; no weightsVersion compatibility check is visible in those paths.
- `book/probe.ts:46–69` rotates live units/reserves and swaps banks but leaves the copied pending planes unrotated/unswapped. Correct pendDef/pendCost/pendOrd mapping and rebuild derived pending masks/counts/hashes consistently before any new Phasing canonical-key/book use. Preserve canonical commitment order; do not invent an ascending-square replacement. Test synthetic unequal pending positions, side swap/rotation, involution, nonzero handicap policy and complete-turn end-key matching. This is a book-source dependency, not permission to read or regenerate a book now.
- `tune/rows.ts` uses `muju-texel-v1`, a 58-era feature convention, and an old denylist (`REFUSED_POOLS` at 116 lists e1-sealed/e2-val). A new M6 path should require the explicitly pinned **p1-dev allowlist before opening files**, preserve opening-family grouping, and reject p1-val/p1-sealed input rather than relying on old refusal names. Internal dev train/heldout splits are not the independent val split. Carry rules revision, feature schema, source/config/weights hash and allocation identity in row/manifests; reject mismatches on read.
- `tune/corpus.ts:217–224` only rejects version-0 weights. Any old nonzero baseline passes that check. Require the actual pinned Phasing bootstrap contract and complete-macro boundary/provenance, not merely nonzero version. Port the source without reading its historical runs or producing self-play now.
- `tune/texel.ts` uses FEATURE_COUNT dynamically and pins fire_1 material scale; retain that scale and verify row scoring reconstructs Evaluator.full after the new terms. Tuning outputs stay outside src. Re-pin `weights.generated.ts` only after the declared dev/val process succeeds, never replace old results merely to make an import shape pass.
- `ladder/identity.ts` already binds LADDER_RULES_VERSION and current source/WASM identity. Extend/recheck feature schema, weight version/hash and book magic without claiming a historical config hash should remain equal. Distinguish bootstrap identity from selected tuned identity.

## Test plan and quarantine boundary

First, small authored Phasing fixtures only: exact escrow debit/refund/arrival; safe vs disrupted vs alternatively anchored commitments; paid zero-bank arrival threats; current/imminent/following-Act distinctions; both phases and unpaid upkeep; rent-before-buy lifecycle; pending-vs-live value accounting; dynamic liquidity reserve; Inv7/14/18/19 controls; whole-vector symmetry, bound soundness and no root mutation; equal Kturn slot-map permutations remain covered by M4. Add a small legal complete-macro search decision showing that a useful paid commitment is considered without asserting an invented numeric floor. Pin hand-vector/hash and new synthetic goldens before any training.

Port `tests/ai/hard/{eval,economy,invariants}.test.ts` semantically (not only count58→62). `eval.test.ts` imports weights.generated and asserts the old count/loader error; separate historical generated-vector evidence from current bootstrap tests. `interfaces.test.ts` cross-checks config/evaluator shape. Run focused types/dependencies and these tests through the actual shared heavy queue with source/test hashes; no bypass.

The M6 quarantine still lists eval-correct, approach-tie, lab eval-audit and recall (`vitest.config.ts:96–101`). Their source reveals executable historical reads:

| File | Boundary |
|---|---|
| `tests/ai/hard/eval-correct.test.ts` | Imports Metal-v2.8 catalogue mock and historical position readers. Preserve exact old-arm evidence; author/port current semantic controls without copying observed old scores. |
| `tests/ai/hard/approach-tie.test.ts` | Reads fuzz-1000.jsonl and enumerates obsolete hypothetical forms. Current M4 approach uses real bodies/paid arrivals. Port tie identity using authored current positions, retaining non-vacuity and slot-safe results. |
| `tests/lab/eval-audit.test.ts` | Defaults a constructor to Standard; its output smoke reads economy.jsonl and dev exam cases. Use authored temporary Phasing input for instrumentation assertions; keep old corpus comparisons historical. |
| `tests/lab/recall.test.ts` | Runs recall/fixtures.jsonl plus old exact expectations. Recall is meaningful only on declared current-rule inputs and a pinned evaluator/generator; do not silently relabel old rows. |

Remove individual quarantine entries only after their meaningful current contracts pass; preserve historic pins under explicit historical scope when splitting. Do not blanket-enable all quarantined tests, default oracle corpora or book builders. Porting source/test shapes and passing authored checks establishes implementation correctness only. M5 scored suite acceptance/floors, a dev row with 0 divergence/illegal/fallback, fixed-work determinism/TT parity, val improvement, sealed acceptance and responsiveness still require separately authorized and recorded evidence.

## Source pins for this map

SHA-256, pinned after the read-only inspection (these eight runtime files were not changed by this lane):

```text
d09b2ec2aec09690dcd3e7b3c178a048b41ffffa40c83a1ecc696b82ac9837f0  muju/src/ai/hard/eval/features.ts
3cb129d2732ac4d05d33642edb1dd533ed7f164d22bbefde640874e1430bd914  muju/src/ai/hard/eval/evaluate.ts
1d70666c7eb2ab109852fa8b75cb6aa7d1be9b992857d3857da4641295f3cf97  muju/src/ai/hard/eval/weights.ts
4ae63feb1b1581b8da186e9ae1b17ff9b0b497e34a8ce26aa431d799d9a38834  muju/src/ai/hard/eval/invariants.ts
9ed1b1ad839ca790ab73ae37698128042453e8b3127e7a8681d853c43c4b2731  muju/src/ai/hard/tables/economy.ts
7775abd3d0acbbecadb5238b1a729ae66fab6e05e94744ca50cd1db48805a8e0  muju/src/ai/hard/config.ts
2875c06ede67dc4ff0c4084a2473f0fe473ae5828db35aaae9776c53cbdc3e59  muju/src/ai/hard/book/format.ts
13a2e0d8ebcfd73a02391c9e650aacba4e288fcf63e0f50f38c244528400694c  muju/src/ai/hard/book/probe.ts
5ce09ddd3789da4eebe77c0353af666e44cd58cf1b043b0d565d79c4ec664370  /Users/ashkie/.claude-max/plans/can-you-plan-out-bright-nova.md
```
