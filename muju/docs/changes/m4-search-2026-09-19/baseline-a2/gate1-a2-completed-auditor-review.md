# Gate1 A2 completed-run auditor — bounded independent review

Reviewed 2026-09-19. Read-only source review plus inspection of already-produced, completed-pilot/isolated-fixture evidence. Read the checkout's `AGENTS.md` and `muju/docs/CONTENT_DAG.md`. No reviewer audit/test execution, source edits, new games, sealed inputs, or active full-run games/replays/summary reads.

## Source pins and scope

- Auditor reviewed after the coordinator's first correction: `work/audit-a2-completed-run.mts`, 203 lines, SHA256 `a0fb2a497828902d68699000eef53b754df5a52c62d366c503ac9ec2fc0939c2`. The coordinator is actively editing; this review applies to that version, not an assumed subsequent version.
- Prior negative-check artifact names auditor SHA256 `eddc027dd5c459ed95356af277b36d4453f0e60e5d306254d33c12681ae93885`. This is an artifact-reported earlier pin, not a hash captured by this reviewer before the edits.
- Fixed source checkout: `work/deevgames-gate1-legal-oracle`, commit `32f83b88541e8a63ecb9b9f62d468cf17219011e`; A2 identity `06e4f4dbcfda663e0abf27a3d5211ce96d67f1dfbbe5688e0c305157a2b56e28`; preregistration SHA256 `3140974aa223b820d084c83453a1cf88ea067cabc4b2b003d19f65fa1b08202d`.
- Supporting source SHA256: `muju/lab/ai/gate1.ts` `d0f6af8ffa633a22c6ca42064821c3bb93c0b0ae18de73c06a7a61bfba425fab`; `muju/lab/ai/gate1-report.ts` `0d21507eb6a6fce0f499c055a20c25dbfa604efc26b9461a7313a0247c733bb9`; `muju/lab/harness/runner.ts` `5cfc64f958f8590e02dec9c93dc11b164450f4ab4e11212b7d375699fe5ded6c`; `muju/lab/harness/types.ts` `687e2ed435f90e97be181d7d37d4ade6526f54e55d2e80685c1167f40bc34df4`; `muju/lab/ai/gate1-references.json` `9dd6c4518356ac0d65b995afc31d3611a3f681744e0e6b043ff32e7023cf2b8b`.

## Findings and disposition

1. **Corrected, with coordinator evidence:** the initial reviewed loop did not bind per-game options to frozen identity options and did not test terminal/cap precedence before every action. Changing `maxTurns` to 1 in both a game entry and its replay metadata could previously preserve summary/trace/frame comparisons even though the recorded game should have stopped earlier. Current lines 88–91 require exact JSON-persisted identity options plus the runner's seat handicap/AP4/upkeep/inactivity/replay overrides. Lines 102–105 reject actions after canonical terminal, board terminal, or cap. The coordinator's fresh pristine pilot passes; its isolated options mutation fails exactly one game. The options fault does not independently exercise each newly added terminal/cap branch, which was reviewed against runner lines 177–210. No reviewer execution was performed.

2. **P2, open in the pinned version:** lines 100–120 accept a null-action frame at any current ply and never require the initial frame. Deleting the initial frame or adding a duplicate null-action frame leaves every existing action, trace, outcome and per-frame comparison valid. This is an evidence-integrity omission, not a demonstrated wrong winner. The runner records precisely one initial `action: null`, `ply: 0`, `player: state.turn.currentPlayer` frame (runner line 174), then one non-null action frame per ply (line 359). Require that shape and `steps.length === record.plies + 1`; keep all current action/frame checks. This source-level counterexample was sent to the coordinator; no extra fixture was executed by this reviewer.

## Checks that fit the frozen contract

The completion guard precedes queue acquisition and outcome/identity reads. Fixed commit, clean run manifest, frozen identity/preregistration hashes, all identity source hashes, allocation, seeds, seats, ordered tasks, replay metadata, engine/config identity, legal actions, canonical frames, invariants, trace hashes, purchases, completed turns, arrival/refund telemetry, final outcome and adjudication are checked. Inputs and pinned sources are checked again before output. Allocation is constructed separately from the frozen reporter.

Audit failure and experimental gate failure are distinct: lines 171–179 require exact persisted reporter reproduction and no reporter correctness/schedule errors, but do not require positive strength/behavioral criteria or `gate1 === 'passed'`. This retains the frozen per-cell adjudication fraction `<= 0.01`. Round-cap adjudication is independently reconstructed with terminal-before-cap precedence and material + bank + pending cost; a ply-cap anomaly remains the runner's existing correctness veto. No criterion is loosened, and no zero-adjudication rule is introduced.

The summary reproduction is intentionally the frozen reporter again, not an independently reimplemented statistics calculation. Canonical replay is independently rerun from recorded actions; it does not prove those actions were produced by the named engines or certify responsiveness/Hard release gates.

## Evidence inspected

Coordinator executions, not reviewer executions:

| Artifact under `work/` | Observed result | Artifact SHA256 |
| --- | --- | --- |
| `gate1-a2-audit-preflight-final.json` | Current auditor pin; 16/16 games, 2704 actions, 2720 frames; zero issues; summary reproduced; pilot remains ineligible | `4441897320347f068becde19dcd0cc2e2f64eb01036ee6a9097ff81199d3cdba` |
| `gate1-a2-audit-options-fault-result.json` | Same current auditor pin; 15/16 fully audited; exactly one `Frozen match options` issue (`maxTurns: 1` versus 120) | `ba979fe46e9758f2e193878ea83071bf37d938f291b735a256517194b9db5942` |
| `gate1-a2-audit-fault-result.json` | Earlier auditor pin; trace mutation rejected with exactly one trace-hash issue | `09ed42f6a01a1f39e1f327da25fd90f3af123c9824dbb11a1371c743aee1794d` |
| `gate1-a2-audit-negative-checks.json` | Earlier auditor pin; synthetic running manifest refused, exit 1, output absent | `2460dd722d96eec6986c30d9a23afc038678973df53b54646ca8dc2b90fdee0f` |

Operational limit: line 188 hashes the auditor file at result-writing time only. Freeze this script before launching a queued full audit, or capture/check its own start/end hash, so later file edits cannot label a running older implementation with newer bytes. This review does not claim hostile-filesystem protection or certify outcomes from an unfinished full row.

## Closure addendum — 2026-09-19

Reviewed the coordinator's subsequent source edits and two supplied evidence artifacts only; no reviewer execution or full-run outcome access. Auditor SHA256 is now `7e85b8d608a31c30963fee7c2ecbd695d6f009ed5be920453d43eadbd75ae4b6` (211 lines).

- **Frame finding closed.** Lines 101–108 require `steps.length === record.plies + 1`, an initial null action/current-player/ply-zero frame, and a non-null object action for every subsequent frame. Existing ply, legality and canonical frame comparisons remain in place.
- **Self-hash provenance observation closed for the identified edit-during-queue/execution case.** Line 30 captures the script hash before queue acquisition; line 188 checks it again before completion; line 196 records the captured hash. This does not claim adversarial filesystem/loader protection.
- Coordinator's `work/gate1-a2-audit-preflight-reviewed.json`, SHA256 `28b2ec5b733ed96242210c311ecf3d3f9531bfa7a14265ea279fb88a5aaf0ca8`, binds this exact script: 16/16 games, 2704 actions, 2720 frames, zero issues, summary reproduced, pilot still ineligible.
- Coordinator's `work/gate1-a2-audit-frame-fault-result.json`, SHA256 `47c18c0e73b25170387b7389f03a3646b6f8c8355916dfec7dbe187d88558abb`, binds the same script: 13/16 fully audited and exactly three issues. Missing initial and duplicated initial frames fail frame-count checks in `Rush-h0-p0-white` and `Rush-h0-p0-black`; the null-action mutation fails `Missing replay action` in `Rush-h3-p0-white`.

No open actionable finding remains within this bounded auditor review. Earlier source pins and findings above are retained as history; this addendum supersedes their open dispositions. Gate1/full-run/Hard acceptance remains outside this review.
