# T2c: Gate 1 A1 and purchase-freeze repair — 2026-09-19 UTC

**Both scoped tasks are complete, uncommitted on `codex/gate1-baseline`, base
`c43c7280`. Gate 1 is NOT passed.** Only the authorized 16-game pilot ran; full
rows still await Claude's quiet-machine confirmation. No outcome-driven tuning,
additional pilot reruns, opening-corpus reads, commits or deployments occurred.

## Diagnosis and repair

The old `Rush-h0-p0-black` replay ended after 12 completed player turns with
zero hard purchases. Replaying every action isolated the cause:

| Black turn | Bank before Prepare decision | Legal buys | Safe buys / old generated buys | Old decision |
| --- | --- | --- | --- | --- |
| 1 | 6 | 162 | 6 | Promote plant_1 to plant_2, leaving 2 |
| 2 | 8 | 60 | 0 | Promote plant_2 to plant_3, leaving 0 |
| 3 | 0 | 0 | 0 | End Prepare |
| 4 | 0 | 0 | 0 | End Prepare |
| 5 | 4 | 96 | 0 | End Prepare; placementPlans returned [] |
| 6 | 7 | 174 | 0 | End Prepare; placementPlans returned [] |

Upkeep consumed 9 crystals over the old game and the two promotions consumed
12. Those expenditures explain the early empty bank, but not the later freeze:
next-Act enemy reach filtered **all** legal commitment squares on turns 2, 5 and 6.

`generatePlaceActions` now prefers legal safe buys and falls back to legal risky
buys when no safe buy exists. Legality is checked before that preference so a
safe square already reserved by a pending summon cannot hide the fallback.
No forced purchase, evaluation weight, seed, budget or cap was changed. The
existing risk valuation is retained: pending material is 0.5 of cost, equivalent
to refunded cash under the default 1.0 material / 0.5 bank weights, with no
projected pending income. Failed arrivals still refund the full cost canonically.

`diagnosis-before.json` was captured before the fix; `diagnosis-after.json`
replays the **same historical actions** with the repaired generator. The latter's
`chosen` fields remain the old replay actions, not newly searched choices.
The two empty-plan positions now have 16 and 28 buy plans. Regression tests
also search those exact positions with the old 857-unit Prepare allowance:
V2 chooses a legal BUY_UNIT in both. A separate regression covers reserving the
last safe square. Existing legality, safe-square preference, delayed arrival,
WASM parity and determinism checks remain green.

## New pilot

One mirrored pair per opponent/h cell, seed 20260956, unchanged hard 6,000 /
medium 3,000 requested work per own turn. W/D/L and score below are for hard.

| Opponent | h | W/D/L | Score | Hard buys/game | Inactivity | Mean completed player turns |
| --- | --- | --- | --- | --- | --- | --- |
| Rush | 0 | 0/0/2 | 0.00 | 6 | 0% | 23.5 |
| Rush | 3 | 0/0/2 | 0.00 | 7 | 0% | 39.5 |
| Expand | 0 | 0/2/0 | 0.50 | 35 | 100% | 21.5 |
| Expand | 3 | 1/1/0 | 0.75 | 34 | 50% | 28 |
| Balanced | 0 | 2/0/0 | 1.00 | 13.5 | 0% | 18.5 |
| Balanced | 3 | 1/1/0 | 0.75 | 23 | 50% | 15.5 |
| aiv2-medium | 0 | 2/0/0 | 1.00 | 4.5 | 0% | 15.5 |
| aiv2-medium | 3 | 0/0/2 | 0.00 | 6 | 0% | 23.5 |

All 16 hard seats bought at least four units; the previously zero-buy h0 Black
Rush game bought **5** (still a loss, now after 16 completed player turns).
The new must-buy condition has zero violations. Rush is **0/0/4** overall;
Expand **1/3/0**, Balanced **3/1/0**, medium **2/0/2**. These are diagnostics,
not evidence of improved strength. All one-pair Elo intervals contain zero.
Expand h0 has **100% inactivity draws**, exceeding the unchanged 86.5814% upper
band; the other five scripted cells satisfy the behavioral bands. Neither this
failure nor the Rush losses prompted tuning or a changed threshold.

Totals: **2,686 legal actions; 0 illegal actions, invariant violations, anomalies,
caps or adapter errors**. Four inactivity draws (25%); 23.1875 mean completed
player turns. 622 purchase commitments across both seats, 258 by hard; hard
had 198 arrivals and 37 refunds, with 23 commitments unresolved at termination.
Purchases count paid commitments, including those that later refund.

## A1 acceptance and provenance

See [runner protocol](../../../docs/GATE1-A1-2026-09-19.md). Strength gates apply
to Expand, Balanced and medium separately at h0/h3. Rush strength is report-only,
but its behavioral bands, must-buy and correctness conditions still gate. Missing
historical margins no longer block full execution or acceptance. Synthetic full
rows exercise both pass and failure paths; a pilot remains `pilot-ineligible`.

The adopted document is copied verbatim from commit `0a6f8db5` into
`preregistration-A1.md`, with commit/path/SHA256 in the identity. The Claude-owned
working copy of the preregistration is unchanged. Historical source audits and
the superseded proposal remain preserved; they are not runtime prerequisites.

Identity SHA256: `bf4db2308ee2258763ff0d92acb92f2e8f0b0703b23f59479834103b8a3f5fad`.
`manifest.json` records 193.065 s duration, shared two-slot queue, start load
13.954 / 10.931 / 9.997 and finish 8.912 / 9.962 / 9.776. Tests/build checks shared
the queue during the pilot; fixed work governs decisions and timings are diagnostic.
Do not pool this dirty-source identity with timer/M2 integration or later code.

## Verification

- **267 tests / 22 files:** all non-Hard AI tests plus Gate 1, Phasing harness and
  Phasing evidence tests. Includes identical repeated full-game fixed-work traces.
- **59 tests / 4 files:** MCP, analysis, Phasing analysis and server Phasing consumers.
  These share the purchase generator; no server source edit was needed.
- Four TypeScript configurations: app, lab/ai, lab and server. All passed.
- Browser Vite production build passed (`build.txt`) using the unchanged ABI 7
  binary; its hash is in `verification.json`. Worker guards are unchanged.
- DAG valid (27 nodes / 49 edges), 14 DAG tests pass; the five pre-existing
  unavailable local-only Academy media groups are unrelated to this task.
- `audit.mjs` independently reapplied all **2,686** actions; verified legality,
  invariants, board/pending/cell/bank/turn snapshots, terminal results, purchase
  counts and completed-turn counts; recomputed summary and trace/identity hashes;
  verified **129** source/input hashes plus the adopted A1 document.
- **231 engine-seat turns** audited, at most 6,000 hard / 2,973 medium requested
  work. One hard allowance-completion phase end, zero wall deadlines. This is the
  pre-existing deterministic exhaustion policy, not an engine-error fallback.
- Full `--plan` inspected: adopted A1, 64 pairs/cell, 1,024 games, seed 20260957.
  **No full row ran.** Full legacy lab/Hard suites remain Claude's integration track.

Reproduce from `muju/`:

```sh
node --import tsx lab/ai/diagnose-purchases.ts lab/ai/results/t2b-gate1-pilot-2026-09-19/replays/Rush-h0-p0-black.json black
node --import tsx lab/ai/results/t2c-gate1-pilot-2026-09-19/audit.mjs
node --import tsx lab/ai/gate1.ts --mode full --plan
```

Affected DAG nodes and release limits are recorded in
[`docs/changes/2026-09-19-gate1-a1-t2c.md`](../../../../docs/changes/2026-09-19-gate1-a1-t2c.md).
Prepared only; no release or live verification is claimed.
