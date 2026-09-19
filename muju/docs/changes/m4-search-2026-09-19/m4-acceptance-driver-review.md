# Read-only review of M4 acceptance driver

2026-09-19. No driver/source edits, tests, engine searches or corpus/outcome reads. Read only `work/verify-m4-independent.mts`, `work/m4-acceptance-plan.md` and their called APIs in the actively edited M4 checkout. Findings apply to driver SHA256 `3a29539123d49123975e08e11eb075405a41c61b69798c811517d8d80ae9b2ae`; plan SHA256 `0f7718e1bd94f2a06819e811cb97df4d724b0d14cf9d3f2bc8dc066d2547ce49`. The root input JSON was not opened during this review.

## Findings

1. **P1 — the all-candidates row is not wired like the production generator.** Driver lines 147–152 instantiate a bare `TurnGenerator`, never calling `installRescueWitness`. Production `HardEngine` installs that callback for root, interior and quiescence generators (`engine.ts`, constructor). `gen/generate.ts:injectRescue` returns immediately when the callback is null. The independent row can therefore pass without inspecting the forced HOME_RESCUE candidates that production emits. The later one-result Hard search only verifies its selected result, so an invalid unselected rescue candidate remains invisible. Use the production callback/configuration for this row (or obtain the generator from a fresh `HardEngine` context). Also align or explicitly justify the driver's pool capacity 8192 against production `POOL_CAPACITY=1536`: pool exhaustion is an actual branch in generation, and the larger pool can hide a production capacity/truncation path. Keep the declared 50,000 work budget unchanged.

2. **P2 — shared queue enforcement rejects only BYPASS.** Driver lines 18–19 call `heavyBypassed()` but allow `MUJU_HEAVY_DIR` to select a private queue and `MUJU_HEAVY_SLOTS` to change the cap. The default source `heavy.ts` explicitly honors both. A standalone invocation can thus violate the required real shared two-slot queue while this driver reports normal acceptance. Reject both overrides (or assert the resolved canonical directory and slot count), as the coordinator's generic wrapper already does. This is preventive enforcement, not an allegation that an override is currently set.

3. **P2 — semantic projection is narrower than the claimed per-action state agreement.** Driver lines 41–57 omit `reviewUpkeep`, `blackCrystalHandicap`, `victoryRule`, `inactivityRule`, `actionsPerTurn`, `ruleset`, and `board.initialResourceLayers`, all represented by/recoverable from the packed state. End-key checks cover several of these only at the final state; initial reserves are not part of that key. The full-unmake assertion checks restoration but does not detect a temporary rule/configuration divergence that is restored later. Add these fields to `project` so the per-action comparison matches its claim. Omitting UI annotations and ID spelling is intentional and reasonable; the attack-count normalization agrees with the packed representation's restrictions.

## Checked without a new finding

- Every declared root must generate at least one candidate; per-root exceptions and candidate failures are accumulated and veto success. There is no silent catch-and-pass path or denominator shrink.
- The replay loop independently rejects opponent actions, action after terminal, illegal/no-op actions, incorrect final boundary and end key. It compares ordered units and pending commitments after each packed transition.
- `decodeTurn` uses its own replica, so its scratch reset does not destroy the live replay replica's pending-arrival undo stack.
- Faults mutate previously validated candidate structure, preserve the meaningful end key where required, and the final fault-coverage assertion prevents missing-upkeep coverage from passing vacuously.
- Source hashes are collected before semantic imports and checked after; added/deleted source files are detected. The fixed input checksum, 44-root requirement and write-exclusive output protect the declared set and prior evidence.
- Constructor and method signatures inspected (`createInitialGameState(...,'phasing')`, `Replica.pack/unpack`, `WorkMeter`, `TurnGenerator.generate`, `verifyTurn`, `HardEngine.searchTurn`) match current source. This is static review, not execution success.

Source owners are still changing their files. Recheck the production generator wiring after their stable handoff. No M4 acceptance or strength claim is made by this review.

## Correction re-review

Rechecked driver SHA256 `72713e88a2ce3b172e75a91e714df72d60a995f60993560883929903a10a0710` read-only. All three original findings are closed in source: the all-candidates row obtains the production replica/scorer/generator/pool/rescue wiring from a fresh HardEngine context; both queue overrides are rejected; semantic projection includes the omitted rule/configuration fields and initial reserves. No execution claim.

One separate wrapper issue was sent to root: `run-m4-check.mts` holds `withHeavySlot` under the wrapper PID, spawns a heavy leaf, but does not call `reassignSlot`. A killed wrapper can free/reclaim that slot while its child remains alive. Use the existing acquire/reassign/release contract, with the slot naming the child PID until actual child exit. This does not affect the standalone driver, whose process itself holds the queue slot and does the work.
