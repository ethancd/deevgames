# Frozen A2 completed-run audit

Prepared 2026-09-19 around 03:36 America/Chicago. This is a checker for the existing experiment, not a new experiment or a change to its criteria.

Script: `work/audit-a2-completed-run.mts`

Frozen script SHA256: `7e85b8d608a31c30963fee7c2ecbd695d6f009ed5be920453d43eadbd75ae4b6`.

Run only after `work/gate1-a2-full-2026-09-19-0158/manifest.json` reports complete with 1,024 games. From `work/deevgames-gate1-legal-oracle/muju`:

```sh
node --import tsx /Users/ashkie/Documents/Codex/2026-09-18/wba/work/audit-a2-completed-run.mts /Users/ashkie/Documents/Codex/2026-09-18/wba/work/gate1-a2-full-2026-09-19-0158 /Users/ashkie/Documents/Codex/2026-09-18/wba/work/gate1-a2-full-coordinator-audit.json
```

Use the normal shared heavy queue, with authorized sandbox escalation for its lock directory if necessary. No bypass. Keep the fixed measurement checkout and this script unchanged during execution. Output creation is exclusive; choose another name if preserving an earlier audit.

The script refuses incomplete runs before reading game records, identity, summaries or replays and before queue acquisition. It verifies the fixed commit, A2 identity and preregistration, all 131 source hashes, frozen behavioral bands, exact mirrored allocation, per-game configurations and options. It independently replays every action through the canonical engine, checking legality, actor, terminal/cap precedence, invariants, ordered frames, trace hashes, outcomes, turns, purchases and arrival/refund telemetry. Each replay must have exactly one initial frame followed by exactly one frame per action.

Summary reproduction uses the frozen reporter and is labeled accordingly; it is not an independently reimplemented statistics calculation. Source, auditor and evidence stability are checked before completion. Adjudication follows the existing material+bank+pending-cost formula and the frozen per-cell limit; the checker does not substitute a zero-adjudication rule.

Only a completed output with BOTH `correctnessAuditPassed: true` and `gate1: "passed"` supports a Gate 1 pass claim. A correctly recorded strength/band failure is a legitimate experimental result and does not authorize tuning, discarded games, pooling or a rerun. The output's `gate1` preserves the runner's verdict even if a separate correctness audit fails. This audit does not measure latency, unlock a worker, accept Hard or authorize deployment.

## Validation evidence

- Final source: `gate1-a2-audit-preflight-reviewed.json`, all 16 completed pilot games, 2,704 actions and 2,720 frames checked, zero issues; pilot remains ineligible.
- Final source: `gate1-a2-audit-frame-fault-result.json`, three separate isolated replay corruptions (missing initial frame, duplicated initial frame, null later action) produce exactly three failures; other 13 games pass.
- Prior source `a0fb2a49…`: `gate1-a2-audit-options-fault-result.json`, maxTurns changed to 1 in both a game record and its replay metadata is rejected as frozen-options mismatch. Final source retains this check unchanged.
- Prior source `eddc027…`: corrupted action trace rejected; synthetic running fixture rejected before access to an intentionally unreadable outcome file. See `gate1-a2-audit-negative-checks.json`. These checks remain unchanged in final source.
- Independent read-only review and closure: `gate1-a2-completed-auditor-review.md`. Reviewer did not rerun experiments; execution evidence above is from the coordinator.

The positive pilot has no adjudications, so it does not exercise the adjudicated final-outcome branch. That branch was reviewed against the frozen runner; any full-run adjudications will be independently recalculated when the full audit executes. Earlier failed preflights and all negative fixtures are preserved. No active full-run outcomes were inspected while developing this checker.
