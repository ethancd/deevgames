# T6 preparation record — 2026-09-19

Change: add a guarded Standard HTTP Hard-engine seat plus immutable room-wide
experiment assistance policy. Ordinary rooms retain their existing behavior.
Prepared on `codex/phasing-engine-seat`, base `3423fe85`, uncommitted for coordinator
review. The attached source hashes describe this review snapshot, not a release.

- Server runtime — **changed**: optional immutable stored matchPolicy; preview
  and stage restrictions checked by the RoomStore, including direct HTTP. No
  schema migration/reset, credentials rotation change, legacy-room rewrite or
  active-room policy retrofit. Token holders still have the same seats.
- MCP/analysis — **changed**: room capability checked before cache access;
  anonymous analyze and explicit briefing blocked outside centaur; every
  observation path suppresses automatic analysis. Bare legal lists blocked and
  derived economy/summon hints omitted. HTTP MCP and stdio both verified.
- Agent guides — **changed**: public skill, ONLINE and analysis documentation
  explain restrictions and link the fixed match protocol. All four tiers are
  explicit; tool-builder does not imply hosted analysis access.
- Engine seat — **changed**: fixed 60-second target/watchdog, one engine per
  process/game, long-poll, external canonical verifyTurn and whole-turn atomic
  submission. Pending batch persisted before HTTP, retry preserves exact ID/body,
  stale revisions stop. Private file/lock handling; no tokens in event logs.
- Rules, Hard core, worker/useAI/UI flags, historical AI evidence, sealed opening
  corpus, Academy, current strength claims — **verified unchanged by this diff**.
  Two real Standard fixed-work 25k searches verify infrastructure only. They
  cannot validate 60-second responsiveness, full games or Phasing readiness.
- Static/server/Academy deployment and live checks — **blocked/out of preparation
  scope**. Nothing published. Browser/e2e and full release gates were not run.

Verification: **82 passed, 0 failed, 0 failed suites, success=true** across the two
new test files and existing server room/MCP/analysis suites, using the real
shared two-slot queue while Gate1 ran in another isolated checkout. Four type
checks pass (app, server, hard-lab, engine-seat); DAG remains 27 nodes/49 edges,
with the same five unavailable external Academy media groups. See `tests.json`
and `verification.json`. An earlier focused 14/14 pass preceded the compatibility
run; no test failure was hidden by a command-chain exit status.

Review corrections: restricted `briefing:true` waits now reject before waiting,
including unchanged revisions, verified via HTTP MCP and stdio; search rows now
include explicit `overrunMs` without changing the allowance.

Remaining: independent coordinator review; preserve the Standard-only runner
check until the separate M7 integration permits Phasing. The scored study also
requires a frozen exact model/opening/identity manifest, isolated LLM harness,
opening setup controller and independent per-turn/token adjudicator described
in `docs/ENGINE-SEAT-MATCH-2026-09-19.md`. None is falsely claimed as run here.
The CLI safely recovers transport retries but a process restart is an invalid
infrastructure interruption for a scored match. A crash may leave a private lock
or temporary journal requiring explicit operator recovery.

Integration: this branch does not merge T5. Expect overlap with the M8-only T5
canonical branch in server/schema.ts, server/rooms.ts, server/observation.ts,
server/mcp.ts, src/online/types.ts and the current public/online/analysis docs.
Retain both archive compatibility checks and immutable match policy checks when
that future merge is authorized. No edits were made to Claude's worktrees.
