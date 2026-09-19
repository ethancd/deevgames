# T6 adversarial corrections — 2026-09-19

Prepared, uncommitted review snapshot above **5d3dc222** on
`codex/phasing-engine-seat`. The original commit and
`docs/changes/t6-engine-seat-2026-09-19/` evidence are unchanged. No release,
Phasing match, LLM match or AI-strength gate is claimed.

Claude's independent adversarial review found three material gaps in v1:
Phasing legal-action purchases inherited strategic pruning, bare play+undo
recreated preview, and the same ordinary service could solve a replayed mirror
room. It also requested pinned engine-seat expectations. This change addresses
those findings directly:

1. `server/observation.ts` enumerates affordable purchases × legal spawn squares
   and canonical-filtered promotions, with no AI candidate generator/heuristic.
   A mixed safe/risky rectangle regression proves exact purchase set equality,
   includes risky legal squares, and checks pagination `total`/duplicates.
2. `RoomStore.act` rejects every bare batch containing UNDO before execution;
   private/public snapshots and observations report `canUndo: false`. Direct HTTP
   batched/standalone attempts and scoped MCP attempts are covered. Ordinary and
   harnessed undo still restore the original position.
3. `createApp`'s optional `matchRoomId` / `MUJU_MATCH_ROOM_ID` instance pins one
   operator-admitted active room with explicit policy. A default-deny HTTP
   allowlist blocks creation, joining, restore, listing, archive/watch/invite
   lookup, static routes and every cross-room operation. The MCP tool allowlist
   and scoped backend bind all inputs to that same room; no global mutable policy.
   Stdio discovers and adopts `/health.matchScope`, with an optional expected
   room ID that fails if the endpoint is not restricted to it. Tests cover raw
   HTTP, HTTP MCP and stdio, including known other room IDs/credentials and a
   simultaneous unaffected ordinary service. Permitted same-room play works.
4. Engine-seat mode is explicit: ordinary `standard-smoke`, or `pinned` with
   issued credentials, exact policy/protocol ID, time control and handicap.
   Journal v2 persists these expectations and rejects omitted/changed values on
   resume. Server snapshots are checked at initialization, long-poll, pre-submit,
   uncertain retry, recovery and acknowledgement. Pinned mode cannot join or
   silently substitute an ordinary/untimed game. Missing clock/metadata, policy
   mismatch, changed revision or wrong room stops without a fresh search.
5. Current protocol/guides explicitly identify the ordinary endpoint as a solver,
   require the implemented single-room service for scored play, specify issued
   seat admission and negative capability probes, and retain the remaining
   sandbox/controller/setup/manifest prerequisites.

**Verification:** 137 passed, 0 failed, 0 failed suites, `success: true`, across
seven focused new/existing room, MCP, analysis and seat test files. The real shared
heavy-work queue was used with its normal two-slot cap. Initial run was 135 passed,
2 failures in the new UNDO test: the assertion incorrectly expected Fire's initial
square to be A1; implementation correctly restored B1. `tests-initial.json`
preserves this run. The test now compares the captured original position;
`tests-final.json` records the complete successful rerun. No failing suite was
excluded or hidden.

No-emit checks pass for server, hard-lab and engine-seat tsconfigs. DAG check
passes at 27 nodes/49 edges (the same five external Academy media groups remain
unavailable); `git diff --check` passes. Exact source hashes and commands are
recorded alongside this file. The two bounded Standard 25k-work engine checks
remain infrastructure tests, not a 60-second match or strength measurement.

The fixed engine `targetMs` and `deadlineMs` remain **60000**, with unchanged
fallback/correctness invalidation. No headroom reduction, silent fallback move,
Hard/AI core edit, worker/useAI/UI flag change, sealed access or publication.
The previous Gate1 work is independent and has no validity claim from this record.

## Integration and remaining work

The server currently owns its complete enumeration to remove the unsafe shared
AI dependency. The coordinator's separate T2d branch is correcting that shared
source for harness/Hard callers. After T2d is independently reviewed/integrated,
consider consolidating this server enumeration onto its now-complete generator;
retain the exact-set mixed-risk/pagination regression. Do not alter the measured
or historical baseline here.

This service boundary does not create an OS/network sandbox or LLM match
controller. Operator admission, isolated listener/database/network policy,
health-scope/negative-route probes, model/token timing enforcement, opening setup,
exact run manifest and audit are still prerequisites for a scored study. Pinned
runner snapshots do not substitute for those endpoint-isolation probes. The
unconditional Standard guard remains until the separately reviewed M7 readiness
change. No Phasing Hard game can be launched through this runner today.

T5/M8 overlap remains in server/current docs; retain both archive compatibility
and match-policy/service checks during any future authorized merge. Journal v1
migration is deliberately not automatic; preserve old journals as evidence.
