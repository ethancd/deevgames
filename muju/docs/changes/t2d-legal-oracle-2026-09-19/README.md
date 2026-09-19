# T2d — restore the shared Prepare oracle and adopt Gate 1 A2

Prepared on `codex/gate1-legal-oracle`, based on A2 documentation commit
`04097f0e5a78b54432de9363a9fee648b5a863d6`. The coordinator owns final review,
commit, the new 16-game pilot, and the replacement full row. This implementation
agent did not commit or launch an evaluation row.

The shared `src/ai/moves.ts` again returns every affordable rules-legal ordinary
Prepare purchase. Its phase/all wrappers expose the complete ordinary Prepare
purchase/promotion/phase-end inventory to the scripted harness and server.
The unchanged safe-or-all-risky V2 purchase policy moved to
`planner/placement.ts#preferSafePurchases`; both placement and beam use it.
Pending reservations are filtered by canonical legality before the risk policy,
so the all-threatened purchase-freeze repair remains intact. Rules, weights,
search budgets, tactical kernel and worker guards did not change.

The runner pins A2 commit/path/SHA256, labels new records and copied protocol A2,
and uses pilot seed 20260959 and full seed 20260958. The report's acceptance
logic is unchanged. Historical A1 allocation cannot be accepted as A2 evidence.
All historical artifacts remain unchanged, including the voided 130-game prefix,
T1 frozen bands, original pilots, and their failures. A2 preregistration bytes
remain exactly as committed. No sealed corpus was read.

## Scope and T1 compatibility

At T1 commit `fc376c94`, shared purchases were affordable catalogue definitions
crossed with spawn positions; the harness filtered that list with canonical
`isLegalAction`. Restoring that inventory, with the legality filter earlier,
returns the same ordered legal purchase set to the harness. Promotions and
phase ends are unchanged. `t1-compatibility.json` records source hashes and
checks the frozen T1 algorithm on both rulesets/seats, five banks and pending
reservations: all 20 ordered purchase lists agree.

As clarified in the dated [A2 implementation note](../../../lab/docs/GATE1-A2-2026-09-19.md),
exhaustive here means ordinary Prepare candidates. It does not expand the older
contracts: AI/harness direct MOVE generation covers one speed-length action,
RESIGN is omitted, and upkeep generation is bounded above 12 rent-bearing units.
MCP separately includes RESIGN and multi-action moves and documents its single
upkeep selection. This repair does not certify those older limits as exhaustive.

## Verification

`verification.json` records exact commands, queue identity, timestamps and exits.
The focused tests, types and plan ran through the shared heavy queue, no bypass:

- **88/88 tests passed, zero failed suites**, across nine files. Independent
  catalogue × 100-square enumeration covers both rulesets/seats, five resource
  levels and pending reservations. All three shared entry points and the harness
  match canonical ordinary Prepare legality without duplicates.
- Mixed-safety fixture: 132 rules-legal purchases, six safe under the heuristic.
  Shared generators retain all 132; V2 placement and beam prefer the safe subset.
  Reserving all safe squares restores all remaining risky legal candidates.
  The original zero-buy Rush replay regressions still buy legally.
- Real HTTP MCP transport traverses every ordinary Prepare action and filtered
  purchase page for both rulesets, checking totals, uniqueness, next offsets and
  exhausted pages. The unchanged server consumes the shared generator directly.
- App, lab, AI-lab and server TypeScript configurations passed.
- Full `--plan` passed: A2, 64 pairs/cell, 1024 games, seed 20260958 and unchanged
  work 6000/3000. It plays no games.
- The existing Gate1 deterministic repeat-game regression passed; its test file
  took 114.5 seconds. This is correctness verification, not a pilot/full row or
  a new strength claim. The coordinator owns evaluation launches.
- DAG check: 27 nodes and 49 edges valid. Five declared local-only Academy media
  groups are unavailable, unrelated to this source-only correction.

## DAG dispositions

| Node | Disposition and evidence |
| --- | --- |
| ai-search | Changed shared inventory and V2-only candidate policy; focused generator/planner/Phasing tests and types pass. |
| hard-ai | Verified unchanged source; shared oracle restored. Independent M2 work and Gate0 remain pending, not certified here. |
| ai-strength | Changed A2 allocation/identity and tests. Acceptance, bands and historical evidence unchanged; new pilot/full pending. |
| mcp-tools | Verified unchanged source via real MCP pages containing the complete ordinary Prepare set through its existing shared import. |
| agent-guides | Verified unchanged: no tool schema, rules, action timing or guidance contract changed. Ordinary Prepare listing behavior restored. |
| balance-analysis | Verified unchanged: no weights, rule values or current balance results changed; old evidence does not establish new strength. |
| game-validation | Changed regressions: 88 passes and four type configurations. Full release/browser/Hard gates not claimed. |
| static-package | Blocked for release pending Gate1 and staged migration gates; no release package built here. |
| server-package | Prepared source only; packaging belongs to coordinated release after remaining gates. |
| static-deploy | Blocked: publishing paused/no credentials; no deployment in this task. |
| server-deploy | Prepared, not deployed; no master/push/database operation performed. |
| release-verification | Blocked pending gates and deployment; no live freshness claim. |

Stored games, rooms and replays are unchanged. The restoration changes which legal
options consumers see, not which commands the rules accept. Historical evidence
is preserved. No Hard correctness, responsiveness, sealed strength, worker unlock
or release readiness claim is made.
