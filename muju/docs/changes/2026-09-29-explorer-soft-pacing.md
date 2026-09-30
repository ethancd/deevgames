# Explorer soft pacing and fresh +18.5 experiment

The +9.5 worker paused during game 4 after the version-1 policy's 300-second
decision deadline (29 new turns, 128 counted calls). The user replaced that hard
decision deadline with a pacing reminder and requested a fresh +18.5 search.
The +9.5 experiment and its version-1 evidence are preserved unchanged.

## Behavior

- Each decision now has a five-minute soft pacing target. Before each model
  call, the prompt reports elapsed time and call count. Once the target passes,
  it asks the model to submit the best considered legal turn or honest assessment
  promptly and avoid starting new strategic searches. This runs at call
  boundaries; it does not inject a message into an in-flight CLI call.
- Each model invocation retains a 300-second hard cap, now shared by CLI setup
  and inference. A timeout terminates that child process and retries within the
  same decision's 12-call budget. Elapsed decision time never aborts or pauses.
- Exhausting all 12 attempts still pauses without fabricating a legal move or
  outcome. Authentication/provider errors and an operator stop are not retried
  as timeouts. Failed calls remain counted; unavailable token usage is not invented.
- Strict latest-own-checkpoint retries at 45%, explicit cross-game lessons and
  changed plans, independent forecasts, subscription authentication and pinned
  Astra/high settings remain intact.
- Version 2 uses `paceAfterMs`. Version-1 policy files are rejected with a
  migration explanation; their historical meaning is never silently rewritten.

## Fresh experiment

Experiment `4a4288eb268ec8b4888425cd81f6ec86` uses Black +18.5, both
`gpt-6-astra` / high / Codex subscription, 5 games, 100 newly executed turns,
1,000 total calls, 45% retry threshold and two consecutive bilateral 90%
forecasts for consensus adjudication. No states or private memory from +9.5
were imported. Both sides begin fresh, then retain their own lessons between
branches of this new experiment.

```json
{"version":2,"retryThreshold":0.45,"paceAfterMs":300000,"blackTarget":0.6}
```

Black's 60% target remains a search hypothesis, not a floor on forecasts. White
tries to win. Related branches are not independent win-rate samples.

The ignored `muju/data/explorer-runs/2026-09-29-astra-high-18p5/` directory
contains the private mode-0600 connection, config, policy, source hashes,
supervisor, append-only logs and atomic public evidence/status snapshots. The
supervisor holds a local process lock, retains evidence every 30 seconds and
inhibits idle sleep while the worker runs. Model credentials stay local.

Watch: <https://deevgames.ashkie.com/muju/explorer?experiment=4a4288eb268ec8b4888425cd81f6ec86>.

## DAG dispositions and validation

Plan: `python3 tools/muju-content-dag.py plan --files
muju/tools/explorer/runner.ts muju/tools/explorer/providers.ts
muju/tools/explorer/policy.ts muju/tests/server/explorer-runner.test.ts
muju/docs/EXPLORER.md --format json`. No unmapped inputs.

| Node | Disposition and evidence |
| --- | --- |
| advantage-explorer | Changed: soft pacing, typed per-call timeout recovery, shared invocation timeout including setup, version-2 policy and docs; fresh real Astra subscription run launched. |
| game-validation | Changed: regressions prove a decision can exceed 300 seconds and commit normally, reminders appear and reset on the next decision, timeouts recover within the same budget, 12 failures stop retrying, authentication/operator abort do not retry, and CLI setup consumes the invocation budget. Existing threshold/learning/controller tests retained. |
| static-package | Verified unchanged: no browser, assets, rules or package inputs changed; local worker is not a browser dependency. |
| server-package | Verified unchanged: server/controller/rules unchanged; the same HTTP protocol is exercised by regression tests and the fresh live experiment. |
| static-deploy | Verified unchanged: existing watch UI displays the new experiment, settings, review and public explanations. No browser release needed. |
| server-deploy | Verified unchanged: live source remains `8ed95e54756f2b63f44dc46390f35fa9e443757f`; local canonical/controller hash remains `3d14e85c953553f14ca0d81a0fddf86989b7fc8871a13310095206fe1bc7654a`. No redeploy or data migration needed. |
| release-verification | Changed: this record and fresh run snapshots/source manifest document the executed worker and new protocol. |

Node 24: `npm run explorer:types` passed; `vitest run
tests/server/explorer-runner.test.ts tests/server/explorer.test.ts` passed
**22 tests**; `git diff --check` passed. DAG check passed for all required
repository paths. Five archived Academy media inputs remain unavailable and
outside this runner-only closure. No Academy content changed.

Executed source base: `8ed95e54756f2b63f44dc46390f35fa9e443757f` plus local
runner changes, with SHA-256:

- `tools/explorer/runner.ts`: `fbdaae9ab093adf365dd3ae2668502807ec5db3b67c13c5e5527ac72926a4796`
- `tools/explorer/providers.ts`: `ec169ce2a0239672325c55566c803e85ba52df9932b7d2a1e75418fcdc2dab7d`
- `tools/explorer/policy.ts`: `b922afb2fd7d0a5133518563ff2c2090cb806f6b5781dd1489b2de23e3629668`

The new experiment was created successfully. The live export confirms +18.5
both in config and the initial game state, 45% retry threshold, identical
Astra/high player settings, unchanged canonical/controller identity and policy
`runner-policy-f19e6cf8f9639a13` recorded before any model calls. Both initial
assessments completed and the worker began White's opening turn. Launch evidence
is preserved in `launch-evidence.json`; ongoing snapshots continue separately.
Executed source hashes were checked against the saved manifest. The ongoing
bounded experiment is not yet a completed strength result.
