# M6 economy implementation note — 2026-09-19

Source draft, not acceptance evidence. Worktree `work/deevgames-phasing-m6`, base `5d31740791b8c3aa17797a29f9a5eac87a85b844`; AGENTS and CONTENT_DAG read. Parent owns queued tests, types/dependency checks, DAG disposition and commits. No corpus, Hard search, opening, tuning, sealed or validation-data read/execution performed in this lane.

## Stable API

`EconResult` adds `livePVQ16` (cc × 65536 exact safe integer), `livePVcc` (fractional cc, no sidewise rounding), `pendingServicePVQ16` / `pendingServicePVcc` (`Float64Array(100)`, root side-relative square), `pendingArrival` (`Uint8Array(100)`, 0 absent/unreached, 1 arrived, 2 refunded), `firstBillReached`, `requiredReserve`, `rentShortfall`, `incomeClosures`, and per-build `forecastProverCalls` / `cappedProverCalls`.

`phasingEconomy(p, [white,black], diagnostics=false)` computes both sides together. Pending service excludes escrow/refund/arrival principal. Live value includes only root-live mining, actually paid rent and released root-live catalogue principal once. Contributions stay Q16 until the consumer forms a signed difference; feature23 then truncates whole crystals, pending feature58 truncates signed cc. No 32-bit shifts on totals. Existing legacy DP entry points remain explicit zero-weight diagnostics; production context no longer calls them.

First bill: current unpaid Prepare has ordinal0, income0; Act has future closure1 income before its bill; settled Prepare and waiting side advance through actual intervening turns/arrivals. `firstBillReached=false` means an earlier terminal stopped the policy; zero reserve then does not assert a bill was affordable. Required reserve is `max(0,due-incomeBeforeBill)`, shortfall subtracts actual spendable cash before that income, including refunds only if the boundary already happened.

## Lifecycle and accounting

Private packed copy uses the established Replica with full canonical-mode home adjudication. END_ACTION mines once; PAY_UPKEEP uses independently coded `defaultUpkeepAction(false)` cost-descending / square-ascending affordable policy; END_PLACE hands off, stops on actual terminal precedence, resolves simultaneous commitments and healing through Replica. Stop after both six income closures AND settling the sixth bill, or first terminal, never terminal-win utility. A 48-phase-action structural ceiling throws on exhaustion.

Every make owns an Undo; all records unwind in reverse in `finally`, including proof-cutoff faults, so private Replica string-ID storage does not grow across forecasts. Root packed input stays unchanged. Canonical unit-order metadata and commitment order are preserved by copy. Root-live identities follow original slot+canonical ordinal, so an arrival reusing a released slot is attributed to its original commitment instead of live PV. No policy movement or new purchase can invalidate the square-based commitment identity.

Diagnostics retain exact bill receipts (`cashBeforeIncome`, income partition, `cashBeforeRent`, due, actual paid rent, released IDs/principal, cashAfterRent), arrival/refund records, final banks, steps, terminal reason and proof work. These are independent of feature rounding.

## Proof work and veto

An actual Replica capped proof throws `PhasingEconomyProofCutoff` carrying counts; no partial zero forecast is declared valid. Both output-side diagnostics are filled in finally. `NodeTables.economyProverCalls` and `.economyCappedProverCalls` are monotone actual-execution counters: cached table hits add zero. Root/Copernicus own accounting consumers outside this lane. Evaluator, gen/generate completePrepare and PVS direct L2 callers must charge/count deltas under their established PROVER policy. Reusing cached per-build result counts would double-charge; simply reading the private search Replica would omit this work.

This forecast may run a full home proof at each reached settled Prepare. Its runtime expense and bounded allocation are not yet measured; no performance-ready claim is made. Optional ledger diagnostics add allocations. Full-cap UNKNOWN is an acceptance veto, not a terminal/nonterminal prediction.

## Independent reference and authored controls

`lab/hard-ai/oracles/phasing-economy.ts` has no packed/economy imports, no corpus loader and no CLI side effects. It executes canonical `applyAction` / `defaultUpkeepAction(false)` and attributes actual `lastIncome`, `lastUpkeep`, `lastSummoning` receipts to root identities. A separate canonical proof-evidence check at the exact pre-adjudication gate rejects UNKNOWN rather than allowing applyAction to hide it as ongoing. This duplicates reference proof execution deliberately; it is not production timing evidence.

`phasing-economy.test.ts` contains 18 named authored state cases with both orientations, exact receipt/Q16/bank/terminal parity and input immutability, plus directed timing, finite mining, chronological release validity, refund liquidity, legal promotion/BUY, no-refund-income, terminal-before-arrival, >32-bit principal sum and injected cutoff/undo recovery controls. These are authored rule states, not claims of complete initial-game reachability for every counterfactual diagram. Legal BUY/PROMOTE transitions are exercised where those identities are asserted. The fault injection tests error propagation; it is not evidence of a naturally observed 20k-node cutoff.

Suggested parent commands: queued `npm run hard:types`, `npm run hard:deps`, focused Vitest `tests/ai/hard/phasing-economy.test.ts` with other owners' new M6 files after full source freeze. No execution result claimed here.

## Pins at source handoff

- `muju/src/ai/hard/tables/economy.ts`: `0e1ee10f0349357e97d353bbd42be2142c94b9d72a97c77f4f6c3e88943e2ae6`
- `muju/src/ai/hard/tables/phasing-economy.ts`: `bbb80b5604073bbc92ae320553e78c772542e9bc2dd143b5a1fa35a200700c49`
- `muju/src/ai/hard/tables/context.ts`: `7dcf993157d0136e9c8821f7079ef19044abb9be3748a206f3671b2387dac6c3`
- `muju/lab/hard-ai/oracles/economy.ts`: `ded32f41da17e04fc4f0cf352bc3f9c8fcdd946914391bebdad2fe54e920b660`
- `muju/lab/hard-ai/oracles/phasing-economy.ts`: `5dde2359072edddbac037664d97189afbeeb5ce6c99d5421e6d2c7834540c2de`
- `muju/tests/ai/hard/phasing-economy.test.ts`: `4e36b2717d4007ee8549c4314344bd75fdc38c968db3580726896e077c167617`

## First diagnostic closure and source correction

Parent executed the preserved first combined M6 row:202passed/20failed, source drift0. Parent reports all46 authored economy checks and the new tuning guard checks passed. `work/m6-first-types-1/command.log` reported explicit local event union annotations missing in the two forecast implementations, which also caused sort-callback implicit-any errors; these are now annotated as EconomyBill|null and CanonicalEconomyBill|null. The synthetic allowlist identity object now preserves its literal featureSchema type with `as const`. No calculation or acceptance threshold changed. No rerun performed in this lane.

Parent extended the lease to `tests/lab/texel.test.ts`. It now uses only synthetic metadata for refusal tests, spies on readFileSync to assert zero dataset IO, and has no pool-file enumerator. The planted statistical model uses free zero-bootstrap `F.PstMine` instead of pinned BankLiquid; all original numerical recovery/loss/integer tolerances remain. Start weights include cash/escrow pins, the free count is75/80, and an actual-fit assertion checks pins2/3/58 stayed exact. Row fixtures carry current schema/version. No test skipped or excluded; actual pool bytes were never read. Valid synthetic fitting is part of the authored test, not an executed corpus/tuning operation in this lane.

Source corrected and paused for root's next combined types/focused execution. `git diff --check` clean. Current pins:

- `muju/src/ai/hard/tables/phasing-economy.ts`: `18ef67e3e71251ae49ab21695bbc115412d03cdcb9c87438bfb6a0ef8609ddef`
- `muju/lab/hard-ai/oracles/phasing-economy.ts`: `e7b7d3a9e523df8d96894e68f3eeb56f2b2ff69404510bcb7de6f087e597054c`
- `muju/tests/lab/phasing-tune-guards.test.ts`: `22a483d96222e67009ecb73cd69553cf368596a661cd87fc91ef5b8841eb8709`
- `muju/tests/lab/texel.test.ts`: `f61d47477b9b3488c93ff48445ad0b04978277eca33577c69c4fd73ebab03eb2`

## Chronological pending windows (subsequent source correction)

Root accepted independent pending/evaluator review's released-alternative-anchor finding. Added pendingEnemyAct/pendingOwnAct full reusable copies to EconResult, sourced from the same actual forecast with no additional transitions/proofs. Detailed semantics, source-level scenario, source pins and unresolved consumer acceptance are in `work/m6-pending-evaluator-source-review.md`. Canonical oracle snapshots and all parity controls extended; additional reuse/currentAP/noPrepare-window test. No runtime executed for this correction in this lane.

## Snapshot cache identity correction (source ready, not executed)

Root found that public Kturn and the existing slotSquares guard do not bind the canonical identity/order metadata carried by the new snapshots. An equal-key/equal-slot root with changed ord or originIds could reuse an old movement window and invalidate the consumer's root-live classification; pending order/IDs and both next-sequence counters also affect later arrived identities. `context.ts` now keeps a private, reusable exact guard for all six inputs, retaining the original slotSquares comparison and public hash semantics. Sparse ID lengths and values are copied rather than retaining caller buffers. No per-build full state copy was added to the guard.

The guard is invalidated before rebuilding L1 and stamped only after L1 completes successfully. L2 is published as level2 only after its full successful build. A forecast proof veto leaves level1 available and requires a fresh L2 attempt; its actually executed proof work remains in the monotone counters. This is cache-local identity protection, not a broader proof about all unhashed diagnostic metadata in copied PackedState windows.

Seven new authored controls bring this file to54 tests: each of live order, live IDs, next birth counter, pending order, pending IDs and next commitment counter is varied independently while rehashed public keys and slot squares stay equal. The regression checks refreshed current-enemy snapshot identities, actual incoming own arrival IDs/order, owned storage reuse, and an exact repeat doing zero forecast calls. The seventh starts with a successful old-identity L2 build, changes identity, injects one actual Replica make/capped-proof event, checks level1 plus work accounting, and verifies a successful L2 retry followed by a cache hit. These tests have not been executed by this agent; root owns the next frozen diagnostic.

`git diff --check` passed. Source paused after these pins:

- `muju/src/ai/hard/tables/context.ts`: `e95ea7b0404b02ca0239a28d97ff3e28c55fd685059acf2999d6ad461189b4ec`
- `muju/tests/ai/hard/phasing-economy.test.ts`: `1b0caa29cc015c4fb9a3082b13e13aceee881ff5e64fd441b3d7f69f3b41719f`
