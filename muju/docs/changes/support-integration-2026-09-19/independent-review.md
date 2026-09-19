# Support integration independent review

Reviewed 2026-09-19T07:44:10.326806+00:00 against the staged, uncommitted merge in `/Users/ashkie/Documents/Codex/2026-09-18/wba/work/deevgames-support-integration`. **No actionable interaction regression found within the assigned scope.** Source review only; this is not a gate or release pass.

## Pin and preservation

- HEAD: `32f83b88541e8a63ecb9b9f62d468cf17219011e`.
- MERGE_HEAD: `5345b6bd36a1efc4b7202cd4698924a11e31a565`.
- Merge base: `3423fe8501221c7906abd3b7f6c75dfe68402b80`.
- Index manifest SHA256: `bb0d509e8532bc8b5a75473d4132f49203a576033649ac5683908d8618bd6d10`. Manifest construction: sorted UTF-8 lines `mode blobObjectId path\n` from stage-0 `git ls-files --stage -z` entries.
- Compared every index path and mode/object ID to `git ls-tree -rz` for both parents and the base: **6,686 base-unchanged paths, 27 HEAD-only edits, 61 MERGE_HEAD-only edits; zero paths edited by both parents, zero mismatches, zero nonzero index stages**. Every changed index blob is exactly the owning parent's blob; no source was lost or synthesized during this merge.
- Rechecked at report generation: same manifest, no unstaged tracked-file diff. `git diff --cached --check` exited 0.
- No canonical `src/game/**`, Hard replica/search, `useAI`, or worker source changed from the common base. No M8 canonical edits are introduced. The unchanged worker rejects Phasing before engine construction (`src/ai/worker/handler.ts:107`); T6 also rejects Phasing before seat initialization/search (`tools/engine-seat/contract.ts:25`).
- A2 references/runner/report/preregistration are byte-identical to HEAD. The committed A2 document still hashes to `3140974aa223b820d084c83453a1cf88ea067cabc4b2b003d19f65fa1b08202d`; its pin remains commit `04097f0e5a78b54432de9363a9fee648b5a863d6`. Pilot/full seeds stay 20260959/20260958, 64 pairs per cell, 1,024 full games; no experimental acceptance/reference inputs were rewritten by this merge.

## Interaction review

1. **Complete ordinary Prepare inventory and planner preference coexist.** `src/ai/moves.ts:50–79` retains affordable catalogue × spawn positions filtered through canonical legality, plus historical promotion/phase wrappers. `planner/placement.ts:17–19,26` and `planner/beam.ts:34` are the only locations applying the safe-buy preference; if no safe buy remains they retain the entire legal candidate list. No reservation or all-threatened purchase-freeze correction is lost.
2. **T6 server listing stays independent and complete for ordinary Prepare.** `server/observation.ts:70–100` performs room capability checking first, directly enumerates affordable purchases, all owned promotion candidates and phase end, then canonical-filtering before type/unit filtering and pagination. It does not import the planner or shared AI generator. Thus T2d cannot narrow the MCP oracle, and T6 does not feed a narrowed list back to scripted opponents. Standard uses the same canonical filtering. MCP retains its historical RESIGN/UNDO and multi-action movement differences and documented single upkeep selection.
3. **Pinned capabilities remain closed.** `server/http.ts:38–42` allowlists before routes/static and checks the configured room policy; `server/matchScope.ts` binds room identity, checks policy, disables create/join, and scopes every backend entry. `server/stdio.ts` discovers and validates the same service scope. `legalActions` remains rules-oracle gated, room preview/any UNDO batch remain capability-gated, and headline/briefing/analysis restrictions are enforced inside the service before cached results.
4. **Seat identity remains private and authoritative.** `RoomStore.get` authenticates the supplied token and `snapshot` attaches only its derived player; live/private play, preview, retry, restore and join retain that identity. Public `get`, the final public wait snapshot, and `observe` omit it. The HTTP authenticated room GET and `readRoom` preserve it. The runner authenticates before pending recovery/search, reauthenticates after public wait changes, before submission, and before uncertain-response retry; it never treats the public long-poll room as seat authentication. Pinned admission uses issued credentials and does not call join.

## Coverage inspected and limits

Read the root AGENTS and content DAG, relevant staged source and parent diffs, the independent catalogue × all-100-square Prepare fixtures/tests, real MCP pagination regression, and T6 policy/scope/seat-binding and lifecycle regressions. Existing source tests cover the mixed safe/risky server listing, Standard/Phasing exact totals/pages, real mislabelled-token rejection before engine construction, and identity omission from public reads/waits/observations.

No tests, types, Hard searches, opening/sealed evaluation, or external writes were run in this review; the coordinator owns merged verification. No source/index/commit changes were made. Historical T2d evidence's description of an unchanged server importing the shared generator describes that original parent verification; the merged server intentionally uses T6's independent enumeration. Historical evidence remains unchanged and does not itself certify this merged tree. “Complete” here means the ordinary Prepare purchase/promotion/phase-end universe, not a new claim about old movement, RESIGN or bounded upkeep generator scope.

## Source SHA256 pins

Paths below are relative to the integration checkout.

| Path | SHA256 |
| --- | --- |
| `muju/src/ai/moves.ts` | `40666d9a8d11b1b29b9eda10bc3988656e12c6f9520865659c6efc4895f9c583` |
| `muju/src/ai/planner/placement.ts` | `36ea4cf60f35c9486dde775ff6f271c84c7bd7f53c4ec2363bbea1f7edfacebe` |
| `muju/src/ai/planner/beam.ts` | `43c6c82b8b01a0807d73e045aa01af52fd2e8b62e6b8f95d1cc813d199acdff3` |
| `muju/server/observation.ts` | `a9efe15c7a2dd82480388d1deb2e264715a83d1c7d8e7a0b595c3ab518929b66` |
| `muju/server/matchPolicy.ts` | `c50b534874d3604a9da0283eaa4fd7b94c4c4b735ce99b9280783c415e9da0bb` |
| `muju/server/matchScope.ts` | `d56b01fa9f2e52af230c6a20c8b9e1aa3f1058b5697db28f0101cd59669a7c52` |
| `muju/server/rooms.ts` | `b0c003a3b99b491f00a45c63f9d5fe240aefa627f921f35cf301d0153092522d` |
| `muju/server/http.ts` | `6161b417943817efaf815046d62b8ac59ac7a5c4a6889236a6557af06c399fee` |
| `muju/server/mcp.ts` | `584e0b2bdb45fd93067ee03ff8d66ef943c0bc88b5699ba654e899ff19f2e48c` |
| `muju/server/stdio.ts` | `036a2324359b32d115809b6b610da8dac5d0541a3a6fcf2e9d0fe391b48a6831` |
| `muju/src/online/types.ts` | `40e31f7f82cc6ac5afc413a0645ef3feb0923b93011e08b931a717b7681bc16f` |
| `muju/tools/engine-seat/config.ts` | `78a0821283a09613e4f68a4f1eb2869c5c6e99d5b67dbdcd5e2b6b908397e398` |
| `muju/tools/engine-seat/contract.ts` | `e7f43a26a8de6dc3f4e4148932005e7f45ba30da4f3bc85e75c242d2b3ea140e` |
| `muju/tools/engine-seat/runner.ts` | `2e046b103563803547269ecbd2a853470ba68b97d108027e3cdf9c524d8b2240` |
| `muju/src/ai/worker/handler.ts` | `9ccd4d812873674c908e4ed6f791bb6f6eebfdc0a78f52f40f13ddc0edfe2886` |
| `muju/lab/ai/gate1-references.json` | `9dd6c4518356ac0d65b995afc31d3611a3f681744e0e6b043ff32e7023cf2b8b` |
| `muju/lab/ai/gate1.ts` | `d0f6af8ffa633a22c6ca42064821c3bb93c0b0ae18de73c06a7a61bfba425fab` |
| `muju/lab/ai/gate1-report.ts` | `0d21507eb6a6fce0f499c055a20c25dbfa604efc26b9461a7313a0247c733bb9` |
| `muju/docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md` | `3140974aa223b820d084c83453a1cf88ea067cabc4b2b003d19f65fa1b08202d` |
