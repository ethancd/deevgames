# M5 default quarantine assessment

Read-only source inspection; no test, engine, corpus loader or historical data
execution. Scope is the M5 checkout's Vitest configuration and test source
interfaces. No configuration or old fixture was changed.

All seven new `tests/lab/suites-phasing*.test.ts` files match the default include
and none matches an exclusion. The previously split analyze-phasing and
profile-phasing tests are also active. Thus the new M5 authored suite and
adapter tests are not hidden behind the historical quarantine switch.

Six historical lab files remain explicitly excluded: suites, exam, reference,
analyze, profile and turn-allowance. These exclusions must remain visible in
the migration ledger; the new suite implementation does not establish that
every legacy reference/bench harness is ported. Existing P6/P8 historical
experiments and the four M6 evaluation files are separate residuals.

The old suite file imports the historical catalogue and old runner, including
eager pair-gap evaluation at collection. Exam/analyze source names historical
analysis/replay inputs. Reference source calls loadAuditPositions and uses old
position/search pins. Profile source invokes historical replay builders. This
assessment did not open any referenced input or execute those loaders.
Turn-allowance primarily uses scripted engines over canonical actions, but its
old timing/phase assumptions still require an explicit Phasing port before
restoration; passing a new suite adapter cannot substitute for that review.

The configuration comment saying all M5 suites/harnesses still need ports will
be stale when this new versioned M5 suite is accepted. A future documentation
update should distinguish the new active suites from the named retained legacy
harnesses, without deleting exclusions or claiming a full migration pass.
No source-correctness finding or request to restore a quarantined file follows
from this bounded assessment.
