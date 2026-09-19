# M4 search integration and completed baseline audit — 2026-09-19

The Phasing-only packed replica now feeds complete Act/Prepare macro search,
owned upkeep decisions, delayed purchases, home fortification and explicit
current/next-Act threat tables. The implementation contract and limits are in
`../../hard-ai/phasing/M4-STATUS.md`. This is an isolated implementation branch
above M2/support integration `0ecd0f9d`; central and measurement branches are
unchanged. M5/M6 and release acceptance remain pending.

## Verification ledger

All heavy commands used the shared queue. `verification.json` records exact
argv, source/test hashes, Git state, child exit code and source drift. The
wrapper was corrected to transfer its queue lease to the actual child PID;
the final types and regression runs use that version. No run was interrupted
or overwritten. Paths in driver copies are the original workspace paths and
must be deliberately remapped for reproduction in another checkout.

| Evidence | Result |
| --- | --- |
| diagnostic-types-1 / -2 | Failed: missing types/import cleanup, then the renamed place-index variable; preserved. |
| diagnostic-types-3 / -4 / -5 / -6 | Passed after the corresponding corrections. |
| diagnostic-deps-1 | Passed, 44 files, zero violations. |
| diagnostic-focused-1 | 258 passed / 9 failed / 0 skipped. Old Standard inputs, unsigned ordering signature, invalid fortification fixture, old BUY cost and quiescence test/accounting issues. |
| diagnostic-focused-2 | 331 passed / 1 failed / 0 skipped. Quiescence assertion used spent work, whereas the existing frozen criterion uses allocated RUNG. |
| diagnostic-focused-3 | 350 passed / 3 failed / 0 skipped. Real quiescence/RUNG 44799/120000 = 0.373325 and two stop-before-start truncation checks. Runtime causes corrected; unchanged 0.35 threshold. |
| diagnostic-focused-4 | 108 passed / 0 failed / 0 skipped; corrected affected files. |
| independent acceptance | 44 roots, 3380 candidates, 18029 canonical actions/state comparisons, 3380 full-byte unmakes, 44 real Hard outputs and four fault probes; zero failures/drift. Full JSON retained in deterministic gzip with original SHA256 in each corresponding acceptance-summary JSON. |
| final-types-{app,server,lab,ai-lab,hard-lab,seat} | All six passed with zero source drift. |
| final-deps | Passed, zero violations/drift. |
| active-regression-1 | 822 passed / 4 failed / 0 skipped. Three affected files (Vitest reports six failed nested suites). Geometry helper lacked strikeNext; invariant fixture spent its only attacker; deadline test assumed depth1 throughput within600ms. |
| active-regression-2 / final-hard-types-2 | Passed827/0/0 across67files; hard types passed; zero drift. |
| final-race-focused-1 / final-race-types-1 | Passed101/0/0 across7 affected files; Hard types passed. |
| independent acceptance2 | Final deadline-corrected runtime repeated44/3380/18029/3380/44/4 counts with zero failures/drift; report SHA256 e5b55e35788eb8c05633bcd3722545cb5c618e065d477539fb13023d6ac7d35d. |
| active-regression-3 | Final broad default selection: **829 passed /0 failed /0 skipped across67files**, zero source drift. |
| final-app-types-2 / final-deps-2 / final-race-types-{server,lab,ai-lab,seat} | Final runtime type/dependency checks passed with zero source drift. |

Final source review found a watchdog race between the pre-deepening and initial
iteration polls. Root now preserves up to eight independent initial candidate
records, lazily verifies a saved complete macro when no search answer survives,
and never borrows a regenerated upkeep table. A post-generation poll avoids
starting a new child after abort. Probe provenance selects the original generator
snapshot when that supplied the result. Both stop windows, buffer poisoning,
owned PAY choice, canonical handoff and key are tested. The report
`m4-deadline-race-peer-review.md` records the independent review and limits.

The independent acceptance input revision and all 44 roots are fixed; no failed
root was dropped. Five roots have explicit forced overflow, so passing replay
does not assert exhaustive generation or retention of every forced alternative.
The tiny TT/minimax tests enumerate their deliberately configured generator,
not the entire legal game. Historical trace stage attribution remains unverified.
The port restores passed M4 tests to normal Vitest selection; no new exclusion
was added. Historical P6/P8 experiments keep their old pins, while new active
Phasing tests verify their current contracts. M5/M6 quarantines remain visible.

## Gate 1 A2: correct execution, failed acceptance

This is a separate fixed V2 baseline experiment, not the Hard M4 candidate.
Source `32f83b88541e8a63ecb9b9f62d468cf17219011e`, seed20260958, full1024 games,
64 mirrored pairs per cell, fixed work6000/3000, identity
`06e4f4dbcfda663e0abf27a3d5211ce96d67f1dfbbe5688e0c305157a2b56e28`.
No outcome records were read until the manifest was complete with1024 games.

The frozen completion auditor verified all131 source hashes, the exact allocation,
options and bands, then independently replayed every action and ordered frame.
**1024/1024 games, 167863 actions, 168887 frames, zero issues, zero adjudications**.
Every hard seat purchased. Reporter summary reproduction is explicitly the frozen
reporter, not independent statistics code. Audit SHA256:
`4703df20f24dd41e8fec3eb7853fbaca8b2c270930eafcd81b729b202194e5c9`.

| Opponent | Handicap | Wins / draws / losses | Gated result |
| --- | ---: | ---: | --- |
| Rush | 0 | 7 / 1 / 120 | Behavior passed; strength report-only, weak |
| Rush | 3 | 15 / 2 / 111 | Behavior passed; strength report-only, weak |
| Expand | 0 | 0 / 128 / 0 | Failed strength and inactivity band |
| Expand | 3 | 103 / 25 / 0 | Passed |
| Balanced | 0 | 121 / 7 / 0 | Passed |
| Balanced | 3 | 113 / 15 / 0 | Passed |
| V2 medium | 0 | 128 / 0 / 0 | Passed |
| V2 medium | 3 | 0 / 0 / 128 | Failed strength |

Gate1 is **FAILED**, not void. The failed cells are not discarded or pooled with
the pilot or the previously void A1. No outcome-driven retuning, replacement row,
criterion/seed change, guard opening or release is part of this result. Baseline
summary, identity, manifest, preregistration and full audit are in `baseline-a2/`.
Full game and replay files remain at the audit's recorded workspace input path;
the audit binds them with their individual hashes. They are not copied into git.

## Content DAG dispositions

The exact AI closure is in `m4-dag-plan.json`; a plan is not completion evidence.

| Node | Disposition and evidence |
| --- | --- |
| wasm-tactics | Verified unchanged: no WASM/ABI edits; ABI7 preserved and all six type configurations passed. |
| ai-search | Verified unchanged outside Hard: worker, UI guards, baseline search and presets unchanged; isolated A2 evidence is reported separately. |
| hard-ai | Changed: complete macro grammar, owned masks, table horizons, Prepare plans and search/accounting corrections; bound canonical acceptance and active tests. |
| ai-strength | Blocked for release: M5/M6/M7 remain incomplete, Gate1 failed, sealed Hard/latency gates unrun. M4 legality is not strength. |
| mcp-tools | Verified unchanged from support integration; no protocol, analysis or match-policy edits. Existing T6 ruleset dependency failures remain documented in M2. |
| agent-guides | Verified unchanged: no published agent-facing contract changed by this internal search implementation. |
| balance-analysis | Verified unchanged: catalogue, canonical rules and static balance model unchanged; no new strategic claim. |
| game-validation | Changed: restored active M4 coverage, independent complete replay and undo checks; six types pass. Full browser/release checks remain blocked. |
| static-package | Blocked on remaining acceptance gates; no release bundle claimed. |
| server-package | Blocked on remaining acceptance gates; no image or persistence deployment claimed. |
| static-deploy | Blocked: Pages publishing paused; no publication performed. |
| server-deploy | Blocked: release gates incomplete; production database and host unchanged. |
| release-verification | Changed by this durable evidence record; live release verification remains blocked. |

The prepared Academy notice and separate M8 canonical-removal branch retain
their prior status. No paid speech, sealed/validation opening read, self-play,
tuning, push, master merge or deployment occurred for M4.
