# T2b Gate 1 runner pilot — 2026-09-19 UTC

**Runner and pilot verified; Gate 1 is NOT passed.** Only the requested small
pilot ran. Full rows and amendment adoption remain pending. Work is uncommitted
on `codex/gate1-baseline`, base `a092e2fc` (T1 + T2); production engines, rules,
worker guards and the frozen preregistration are unchanged.

Protocol: [dated proposal](../../../docs/GATE1-AMENDMENT-PROPOSAL-2026-09-19.md).
One seat-mirrored pair for each opponent/h0/h3 cell, 16 games, seed 20260956,
hard 6,000 / medium 3,000 requested fixed-work units per full own turn. All
games begin at the canonical initial Phasing position. No opening corpus was
read. No seed, budget, policy, or cap was changed after inspecting outcomes.

## Observed pilot results

W/D/L and score are from aiv2-hard's perspective. Each row has only **one pair**;
none has a 95% Elo interval excluding zero. These are diagnostics, not strength
estimates suitable for a release claim.

| Opponent | h | W/D/L | Score | Hard buys/game | Inactivity | Mean completed player turns |
| --- | --- | --- | --- | --- | --- | --- |
| Rush | 0 | 0/0/2 | 0.00 | 3.0 | 0% | 21.5 |
| Rush | 3 | 1/0/1 | 0.50 | 4.5 | 0% | 28.5 |
| Expand | 0 | 1/1/0 | 0.75 | 14.0 | 50% | 14.5 |
| Expand | 3 | 2/0/0 | 1.00 | 29.0 | 0% | 18.5 |
| Balanced | 0 | 2/0/0 | 1.00 | 14.5 | 0% | 18.5 |
| Balanced | 3 | 1/1/0 | 0.75 | 25.5 | 50% | 16.5 |
| aiv2-medium | 0 | 2/0/0 | 1.00 | 8.5 | 0% | 25.5 |
| aiv2-medium | 3 | 1/0/1 | 0.50 | 6.5 | 0% | 25.0 |

Totals: **2,307 legal actions; 0 illegal actions, 0 invariant violations,
0 anomalies, 0 caps, 0 adapter errors**. Two inactivity draws (12.5%); mean
21.0625 completed player turns/game. 403 purchase commitments across both
seats, including 211 by hard; hard had 179 arrivals and 15 refunds, with the
remaining commitments unresolved at termination. Purchases include repeated
refundable commitments and are not arrivals.

All six L2/h cells lie inside T1's unchanged frozen purchase/draw bands.
That does not establish good purchase behavior: hard bought **zero** units
in its h0 Black loss to Rush. Hard's 1/0/3 total versus Rush is a reason to
investigate the baseline/work proposal before treating it as a strong control.
No tuning or additional pilot reruns were performed in this assignment.

## Evidence and verification

- `manifest.json`: schedule, dirty-tree/base revision, machine, actual run
  times, shared queue and load. Duration 133.898 seconds; start load averages
  17.46 / 30.95 / 23.22, finish 4.07 / 20.69 / 20.22. Timings are diagnostic.
- `identity.json`: 128 source/input hashes, actual resolved V2 presets,
  config hashes and default weights; required WASM ABI 7. Identity SHA256
  `d3710cb6e3a8e56f6e0f9d1b7c37d74d45772962512fc4d42d556b8f2dfcd369`.
- `games.jsonl`, `replays/`: all 16 raw records, per-decision requested work,
  timing, arrivals/refunds, action hashes and full step snapshots.
- `summary.json`: eight cells, pair-aware Elo intervals, observed bands,
  proposed historical checks, explicit `pilot-ineligible` gate status.
- `replay-audit.json`: independently reapplied all **2,307** saved actions,
  checking legality, invariants, every units/pending/resource-layer snapshot,
  terminal winner, trace hashes, summary recomputation and all 128 source
  hashes. Audited **227 engine-seat turns**; maximum requested work was
  **5,996 hard / 2,973 medium**, within 6,000/3,000. Zero wall deadlines and
  zero allowance-completion actions occurred in the pilot.
- `verification.json`: four successful TypeScript configurations, **78 tests
  across four files**, DAG validation and its 14 tests. Includes the real
  repeated full-game trace test plus missing/duplicate/mixed-identity,
  illegal/empty/crashed-engine, phase-budget and per-cell reporting checks.

Commands from `muju/`, with a fresh output directory for new evidence:

```sh
node --import tsx lab/ai/gate1.ts --mode pilot --out lab/ai/results/<new-name>
node --import tsx lab/ai/gate1.ts --mode full --plan
node --import tsx lab/ai/results/t2b-gate1-pilot-2026-09-19/audit.mjs
```

The runner and audit use the **shared** heavy queue, with no bypass or private
queue. The full dry plan contains 64 pairs/cell, 1,024 games, seed 20260957.
It was inspected, **not executed**. The runner refuses existing output paths,
checks source stability, retains partial failures and never reports an adopted
gate pass from this unadopted proposal. The audit's first comparison encountered
JSON's `-0` to `0` normalization in an Elo value; the audit now compares JSON
number semantics. No engine, row or result changed.

## Historical margin decision still needed

The source audit proposes the old Rush +458.451214 Elo margin and its 60%
floor +275.070729 only with an explicit qualification: that 28/0/2 fast-mode
row had **18 illegal actions**. A later legal wall:500 row lost 1/0/15; an e8
two-game sweep has no useful finite raw margin. No matching hard-vs-Expand or
hard-vs-Balanced reference was found. Their thresholds remain **null**, not
zero or borrowed from Rush. Claude was notified before the pilot. An adopted
reference/amendment or separately authorized historical calibration is needed
before Gate 1 can pass. Historical Standard evidence remains unchanged.

## DAG dispositions for T2b

Plan: `python3 tools/muju-content-dag.py plan --files muju/lab/ai/gate1.ts`.
New sources remain inside existing `ai-search`/`ai-strength` path mappings.

| Node | Disposition and evidence |
| --- | --- |
| ai-search | **Changed:** lab runner/adapter only; deterministic full-game test, 16-game pilot, type checks and replay audit pass. Production AI unchanged. |
| hard-ai | **Verified unchanged:** no replica, Hard adapter, weights, book or Hard docs edits; no Hard engine instantiated. Gate 0 remains Claude's track. |
| ai-strength | **Changed, acceptance blocked:** runner/proposal/reference audit and pilot delivered; full row, amendment adoption and missing historical margins remain open. No gate passed. |
| mcp-tools | **Verified unchanged:** no service or analysis code changes; this lab-only runner is not shipped. |
| agent-guides | **Verified unchanged:** no published tool/skill claim changes. |
| balance-analysis | **Verified unchanged:** no rules, catalogue, solver or current-static edits; historical artifacts preserved. |
| game-validation | **Changed:** focused lab tests; 78 pass, four type configurations pass; 2,307 replayed actions pass. Full legacy lab suite not rerun: its five known Claude-owned consumer failures were handed off in T1. |
| static-package | **Verified unchanged:** no browser/package input change; no build required for lab-only evidence. |
| server-package | **Verified unchanged:** no runtime/container input change. |
| static-deploy | **Blocked for broader release:** existing credentials pause; outside T2b scope, no deployment attempted. |
| server-deploy | **Verified unchanged:** no deployment requested or attempted; no published behavior changed. |
| release-verification | **Changed:** this prepared-only record and the owned ai-search addendum. No release or live verification claimed. |

Prerequisites `transitions` and `wasm-tactics` are unchanged from the merged
T1/T2 base and exercised by the strict harness/WASM pilot. Saved games, rooms,
rule semantics and Academy content are unchanged. DAG check reports the same
five unavailable local-only Academy media groups; they are not T2b inputs and
were not accessed. No other track's worktree was written.
