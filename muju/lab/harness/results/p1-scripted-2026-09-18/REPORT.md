# T1 Phasing measurement substrate — 2026-09-18

**840 scripted games: 0 illegal actions, 0 invariant failures, 0 anomalies,
0 adjudications.** The scoped deliverables are verified and uncommitted on
`codex/phasing-harness`. Full lab integration is still blocked by five tests
of Claude-owned Standard consumers; this is not a claim that the full suite is green.
No V2 sanity row, Hard strength row, engine tuning, or deployment occurred.

## Reference campaign

Run from `muju/`:

```sh
node --import tsx lab/harness/phasing-round-robin.ts
```

Seed 20260955; all 15 scripted bots (9 ladder/probes plus 6 mono-element bots),
105 unordered pairings, h0/h3, two seeds per stratum, both seat orientations on
the same seed: 840 games. `summary.csv` has 210 pairing/handicap rows, each with
four games. `manifest.json` records the options, pre-run band formula, source
hashes, base revision and load. `games.jsonl` retains every raw game;
`SHA256SUMS` pins the evidence. The runner refuses to overwrite a results folder.

| Metric | Result |
| --- | ---: |
| Inactivity draws | 416 / 840 (49.5238%) |
| Mean completed player turns | 29.98095 |
| Mean recorded round number | 15.45952 |
| Mean single decisions | 214.97857 |
| Maximum recorded round / decisions | 91 / 1078 |
| Purchases per game, both seats | 38.35952 |
| Elimination / upkeep-elimination wins | 239 / 98 |
| Home occupation / home checkmate wins | 48 / 39 |
| Illegal actions / invariants / cap adjudications | 0 / 0 / 0 |

A completed player turn is Act → mine/upkeep → Prepare → handoff. A game can
end during Act or Prepare, so `completedTurns` does not include an unfinished
terminal turn. `turns` retains the old round-number field for compatibility;
`plies` counts every decision including both phase ends and manual upkeep.

Per-pairing `aScore` awards half a point per draw; the retained `aWinRate` is
wins only. `inactivityDrawRate` is separate from other draws. Purchase counts
are **paid commitments**, including commitments later refunded, not successful
arrivals. `aPurchasesPerGame` / `bPurchasesPerGame` separate the seats.

## Frozen purchase/draw bands for Gate 1

`sanity-bands.json` is fixed before any V2 row. Each L2 bot/handicap stratum
contains 56 games against the other 14 scripted bots, with mirrored seats.
The formula was written into the runner and manifest before playing:

- Baseline purchases per seat per game: half the smallest L2/h mean through
  twice the largest L2/h mean: **[1.3839285714, 186.9285714286]**.
- Inactivity draws: **[0, 0.8658137861]**. Upper bound is the largest L2/h
  Wilson 95% upper endpoint plus 0.05, capped at 1. Lower draw rates are welcome.
- Apply separately to each V2-hard vs Rush/Expand/Balanced row and h0/h3 stratum,
  counting only V2-hard purchases. This supplies only the behavioral part of
  Gate 1; its strength, historical-margin and legality conditions still apply.

The wide purchase envelope is a measured limitation: Rush averaged 86.61/93.46
commitments per game at h0/h3, while Expand and Balanced averaged 2.77–3.20.
Repeated disrupted commitments can inflate the count because refunds are exact.
These bands detect a never-buying baseline, but cannot establish strong purchase
quality. No threshold was selected by looking at V2 results.

Game-design signals: Rush scored 3 wins / 1 draw vs Expand at h0, 4 wins at h3,
and 4 wins vs Balanced at each handicap. Balanced vs Expand drew all eight games.
These are small per-pair samples, not calibrated strength claims. The high overall
inactivity rate and aggressive/passive purchase asymmetry deserve owner attention.
The machine was busy (end load average 85.54/73.00/46.48); deterministic scripted
outcomes are the evidence, not the recorded wall-clock performance.

## Turn rules and accounting

The harness always initializes `ruleset: phasing` and rejects supplied Standard
states. There is no ruleset choice in `MatchOptions`. `BotView.pendingSummons`
contains both players' public commitments. `rulesVersion: muju-phasing-1` marks
new game records; replay snapshots include pending owner/type/square/cost.

Conservation checks retain finite-board mined totals and additionally require
bank + own pending cost ≤ all mined resources + the initial grant. A refund
moves escrow back into bank without counting as income. Prepare/upkeep retains
zero Act actions. BUY telemetry comes from the action, not the last board unit.
`resourcesSpent` excludes refundable pending escrow and includes the initial grant.

The 120-round cap is checked after Black completes Prepare, on the next White
Act root (including its arrival/refund resolution). Adjudication values actual
material + bank + pending paid cost. Tied capped games are marked adjudicated,
too. The emergency 50,000-decision cap may interrupt a turn and records `ply-cap`.
Its bound exceeds 120 × 2 × 207 decisions: four Act actions, 100 possible
promotions, 100 commitments, two phase ends and one upkeep choice per turn.
Thus ordinary Prepare/upkeep decisions do not consume a Standard-era ply cap.

Scripted purchase scores are discounted by 0.9 for next-own-turn arrival.
Unreachable supporting rectangles are preferred; next-turn enemy reach includes
currently valid enemy pending arrivals. Cheap moves can invalidate enemy summons,
using canonical arrival support so alternative anchors remain valid. These are
simple board-based heuristics, not proofs against blocker-clearing attacks.
Rush/Expand/Balanced/Turtle and the other purchase/position preferences remain.

## Openings

See [ALLOCATION-P1.md](../../../hard-ai/ladder/openings/ALLOCATION-P1.md) for
the 48 dev / 32 val / 64 sealed allocation, all hashes,
scripted seed 20260954, stop rule and h0/h3 proof. The sealed bytes exist only in
`/Users/ashkie/src/deevgames-wizards/sealed/p1-sealed.jsonl`; Claude must not read
them. All 144 rows were validated together during generation before splitting.
Normal tests inspect dev/val only and generate unrelated test seeds.

Historical Standard JSONL bytes and allocation history are preserved. Their hash,
legality, disjointness and baseline-composition checks remain; historical byte
regeneration belongs to `standard-final`, since current bots/generator are Phasing.

## Verification and remaining integration

- `npx tsc -p lab/tsconfig.json --noEmit`: passed.
- `npx tsc -p lab/hard-ai/tsconfig.json --noEmit`: passed, including opening tools/tests.
- Seven scoped harness/opening/evidence test files: **79 passed, 0 failed**.
- Full `tests/lab`, with `MUJU_HEAVY_DIR=/private/tmp/muju-t1-test-heavy-queue`:
  **600 passed, 5 failed, 0 skipped (605 total)**. Exact failures are retained in
  `verification.json`; no failing test was skipped or weakened to hide the port boundary.
- `git diff --check`: passed.

The first plain full-suite run was 586/597 passed, 11 failed. Eight ladder tests
could not open `~/.local/state/muju-heavy/slot-0.json` in the sandbox. Rerunning
with the queue's supported temporary-directory override isolated five real
consumer failures (six of those eight ladder tests then passed):

1. `analyze.test.ts` (2): `lab/hard-ai/analyze/replay.ts` reconstructs new Phasing
   replays with Standard initial/phase semantics. Port rules identity, handoff
   segmentation, pending snapshots and arriving-unit ID mapping.
2. `ladder-runner.test.ts` (2): nonempty openings replay through Standard
   `ladder/openings.ts` and are correctly rejected by the Phasing-only harness.
   Port loader/worker dispatch to `openings/phasing.ts` and P1 fixtures; keep old
   Standard evidence explicitly historical. `canonicalGameDigest` must include
   pending snapshots and rules identity too.
3. `profile.test.ts` (1): `bench/profile.ts#buildE1DevPositions` passes a Standard
   E1 state to the harness. It needs a P1 development corpus builder.

A separate direct ladder diagnostic with an E0 opening reproduced two explicit
`Phasing harness refuses a non-Phasing initialState` failures, one per orientation.
The empty-opening ladder path passes once the queue is writable. These files are
outside Codex's T1 ownership and were left unchanged, with requests in Claude's inbox.
Claude acknowledged the P1 helper boundary at 2026-09-18T21:40.

## DAG dispositions for the scoped change

The read-only file plan selected a broad downstream closure because the harness
is mapped to `transitions`. Review was narrowed by the actual diff: measurement
and scripts changed; production rules and assets did not.

| Nodes | Disposition and evidence |
| --- | --- |
| transitions | **Changed** lab harness only; canonical `src/game/**` / `src/ai/simulate.ts` unchanged. Phasing regression tests and 840 invariant-checked games. |
| ai-strength | **Changed** scripted substrate, P1 allocation and frozen bands; **blocked** shared ladder/replay/profile integration as listed above. No strength claim. |
| game-validation | **Changed** scoped tests; **blocked** five downstream failures pending Claude's consumer ports. |
| balance-analysis | **Changed** new descriptive Phasing reference row; existing static and historical evidence unchanged. |
| rules-docs, browser-ui, persistence, wasm-tactics, ai-search, hard-ai, server-runtime, mcp-tools, agent-guides | **Verified unchanged**: no production semantics, source or interface implementation edited; canonical rules remain muju-phasing-1. The Hard engine and shared files remain with Claude. |
| academy-data, academy-lessons, academy-audio, academy-video, academy-package | **Verified unchanged for T1**: no player-facing rules/lesson changes; no archive/media access or regeneration required. |
| static-package, server-package, static-deploy, server-deploy, academy-deploy, release-verification | **Verified unchanged for T1**: lab-only deliverables; no production packaging, publishing or live claim in scope. Prepared and not deployed. |

All source changes remain uncommitted. No hooks were modified or bypassed.
