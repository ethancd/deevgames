# T6 issued-seat binding correction — 2026-09-19

Prepared and uncommitted in `codex/phasing-engine-seat`, on top of the T6
adversarial corrections above `5d3dc222d204aefce4d71f5d01b24f12b87d510a`.
This is an additive correction to that handoff; its 137-test report and original
source hashes remain unchanged.

## Problem and behavior

A valid Black bearer token paired with `credentials.player: "white"` previously
passed issued-seat initialization because an authenticated room GET proved only
that the token belonged to some seat. The runner could then search for White for
60 seconds before its authoritative submission failed.

`RoomSnapshot.authenticatedPlayer` now identifies the token-authenticated seat on
private snapshots. Public snapshots, formatted observations and public long-poll
replies omit the field, including waits initiated with a private credential.
The server derives exposed identity from authentication, never from a request's
player label. No stored room schema migration or reset is involved.

Issued initialization compares this identity with the declared player before
reserving or writing the journal. Join initialization checks its private
admission result. The runner checks authenticated identity on initial/resume
reads, before submission and uncertain retry, and on private acknowledgements.
After a changed public long-poll result it refreshes through an authenticated
read before searching. A mismatch preserves pending submissions and stops.

The scoped service's endpoint allowlist is unchanged. Validation uses GET;
it does not enable or call restore, join or another mutation for issued seats.
The Standard-only guard, fixed 60-second target/watchdog, engine implementation,
rules and experimental thresholds remain unchanged.

## Verification

- **145 tests passed, 0 failed, 0 failed suites**, including real HTTP on an
  admitted single-room scoped service. Tests cover Black's token mislabeled
  White, correct binding, hand-edited journals with and without a pending batch,
  rejection before reserve/search/play, public privacy, query-field spoofing,
  and authenticated refresh after a public wait.
- Four no-emit type checks passed: app, server, Hard lab and engine-seat runner.
- **14 additional lifecycle tests passed** in a separate focused run after a
  final source scan found one analogous private-restore/public-read comparison
  in the archive/restart test. That assertion now compares matching private
  reads. Runtime source was unchanged after the 145-test run.
- Tests and type checks used the real default two-slot shared queue without a
  bypass. Exact commands, timestamps and outputs are in `verification.json`,
  `tests.json` and the adjacent logs.
- `git diff --check` passed. The content DAG remains valid: 27 nodes, 49 edges;
  the five pre-existing external Academy media groups remain unavailable.
- `source-sha256.json` pins the ten correction source/test files.
  `preserved-evidence-sha256.json` confirms the original T6 and adversarial
  evidence was unchanged across verification.

The initial attempt is preserved under `initial/`: 141 tests passed and four
existing assertions failed because they compared private replies from different
seats, or public replies against private replies, as identical objects. Those
assertions now account for the authenticated seat while still comparing all
other fields. All new binding tests passed on that attempt. An extra app type
check initially targeted nonexistent `tsconfig.app.json`; it was corrected to
the checkout's actual `tsconfig.json` and passed.

## Affected surfaces and limits

The online snapshot and engine-seat admission/runner surfaces changed. Ordinary
room, restart, undo, MCP, analysis, scoped policy and public-observation behavior
were verified by the bounded compatibility suite. Saves/rules/Hard search and
Academy content are unchanged. No full release suite, production build, real
60-second match, Phasing Hard/LLM study, sealed evaluation or deployment was run.
This correction establishes transport identity binding, not match strength or
release readiness.
