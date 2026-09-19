# Independent macro ↔ Prepare integration review

2026-09-19. Read-only source review by the Prepare owner after types4/focused2. No engine/search/test execution, corpus access, or runtime edits. The five earlier owned files stayed frozen. Root later authorized a separate new `tests/ai/hard/forced-phasing.test.ts`; its two regression tests are written but not yet executed. Runtime fixes remain the macro owner's responsibility.

## Material findings

1. **P1 — Forced candidates can disappear after the generator's capacity check.** `src/ai/hard/gen/generate.ts` uses `out.length` as capacity (reviewed line 424). `engine.ts` creates one `genOut` at max(root, interior), but smaller per-ply `turns` arrays (lines 299–315). `search/pvs.ts generateAt` passes the larger scratch array then silently copies `min(raw,dst.length)` (reviewed lines 505, 520–522). Desktop root capacity is 24+128=152; interior is 16+128=144. A list of 145–152 forced turns can therefore be accepted without generator overflow and then lose a forced fortification without setting `truncated`. This defeats the explicit overflow/TT-publication contract. Give each generation the actual destination capacity, or explicitly report downstream forced omissions before any numeric TT publication. The new regression attempts exactly one more forced record than interior capacity via a synthetic generation seam and requires real `generateAt` to report overflow/truncation. A subsequent root call must receive its full capacity again.

2. **P1 — Forced Act entries skip their forced Prepare suffixes.** `injectHomeEntries` uses `injectLine`; `injectLine` directly pads END_ACTION, optional PAY_UPKEEP, then END_PLACE without calling the Prepare planner. `expand` alone enumerates/promotes FORTIFY (reviewed lines 467–472), and Act roots reach it only for ActionSearch-retained endpoints. Thus the bare HOME_ENTRY survives beam pruning, while its entry→FORTIFY mate continuation can disappear if the ordinary endpoint beam rejects the entry. The new authored regression uses White Metal II J9, Black Fire II I10 plus remote Muju A10, one remaining White Act action, zero reserves and bank20. Canonical MOVE J10 then END_ACTION must produce a rescuable occupation; Metal III promotion must produce home mate. A deliberately hostile score and one-slot ordinary beam retain only END_ACTION. The full generator must still retain the canonical MOVE/END_ACTION/PROMOTE continuation flagged HOME_ENTRY|HOME_FORTIFY|PROMOTION|FORCED. This is a candidate-coverage test, not a strength expectation or tuned evaluator test. Each returned real macro is canonically verified.

Both findings were sent to root and the macro owner before any corrective runtime edits. Root authorized closure before acceptance. No new failing-run evidence is claimed: these are static control-flow findings with newly authored, unexecuted regressions.

## Reviewed behavior without a new defect

- Prepare-only and explicit upkeep roots complete the current mover's remainder. Upkeep choices are based on the post-Act state, owned masks are copied into retained records, and no opponent action is appended.
- The planner's MAX_SLOTS buffer preserves per-slot FORTIFY candidates; at each expanded Prepare state, bare promotions run before ordinary combo pruning. Complete records are adjudicated through Replica, not by the mission label.
- `offerForced` evicts ordinary records at full output capacity; when the entire output is forced it reports `forcedOverflow`, and `generateAt` treats that flag as truncation. The downstream capacity discrepancy in finding 1 is separate from this correctly implemented local replacement rule.
- Complete macro legality, same-mover actions and first-handoff/terminal contracts are checked in `makeTurn` and `verifyTurn`. The two findings concern missing candidates and honest truncation, not an observed illegal macro.

## Source provenance and limits

Source owners were actively correcting the separate quiescence-cap failure during this read-only pass; this is not a frozen runtime acceptance row. `generate.ts` changed during the review (new meter polling appeared). The following final inspected pins precede the two newly requested fixes; re-review corrected source after the owner pauses.

| File under `muju/` | SHA256 |
| --- | --- |
| `src/ai/hard/gen/generate.ts` | `4d8ffb88d2413006e94cfd75b940e170c76f89d530406f661dd926a0d411abbd` |
| `src/ai/hard/gen/promote.ts` | `cd7a2a41ad8df9c36c90b12cbbb97abf3588d50a91f3489b295e5f10c6b9fb9c` |
| `src/ai/hard/gen/purchase.ts` | `0539d2e0816dba24ad082730a4be38626eddbf48069516ef52956db09eb5cbdd` |
| `src/ai/hard/gen/actionsearch.ts` | `3cd5a24235993cbbc207421f986e123fb4f18bb61d5b1f1c184eab4710d3025f` |
| `src/ai/hard/search/pvs.ts` | `90ba6e01849697713cad239bdc1430a22af109978e88a387b27d1b99fd62d21b` |
| `src/ai/hard/engine.ts` | `f7626a123b529bb8101a3fa016a6293e5994e1fe3f9ea4f56ae1170c1c9b45c6` |
| `src/ai/hard/config.ts` | `7775abd3d0acbbecadb5238b1a729ae66fab6e05e94744ca50cd1db48805a8e0` |
| `tests/ai/hard/phasing-macro.test.ts` | `2998ec0a8446e2b148846d9c6c9fa2a855415e200781f0a3bae26241ecb33011` |

Methods: read AGENTS/CONTENT_DAG and continuation map; bounded `sed`/`rg` source reads; SHA256 hashing; parsed focused2 JSON for exact totals. No tests were run by this reviewer. Root controls the real shared queue and all subsequent execution. No release, guard, strength, tuning, corpus, historical-evidence or broader acceptance claim.

## Static correction re-review

Macro owner paused corrected runtime at `generate.ts` SHA256 `eeab314180c609077a1f6bb26950fb2c91ff8de7958155b580171618e30e6446` and `search/pvs.ts` SHA256 `8bba1e5763deb771fdf270b93799c10c9ed27be5989b6f0ffea815f3f404e1ba`. The first fix sets `genOut.length` to the actual per-ply destination before each generation, including restoring the larger root size on later calls. The second completes each forced Act prefix into Prepare via a forced-only path, retaining its bare completion and eligible FORTIFY suffixes across the configured upkeep choices; it restores root tables/flags/current mask after each injected prefix. No new material defect was found in this static re-review. Both findings still require the coordinated regression run before runtime closure.

New independent regression file is paused at SHA256 `7033120f1af383ecedc918959f680db7d417908eec933e9c31aba797f4a245ba`. Pins are also saved in `work/m4-forced-regressions-ready-hashes.json`. No execution by this reviewer.

## Coordinated runtime result

Root's `work/m4-diagnostic-focused-3` executed both independent regressions successfully with source drift `[]`. The overall run remains failed (350 passed / 3 failed / 0 pending; JSON failed-suite metric4), due to separate P6 truncation-flag and R5 work-share assertions. Both findings above have therefore passed their targeted runtime regression, but that is not complete M4 acceptance. No changes to the independent test were needed after first execution.
