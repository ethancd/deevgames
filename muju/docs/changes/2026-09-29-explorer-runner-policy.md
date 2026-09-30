# Explorer continuation: 45% retries and bounded strategic learning

This is a local subscription-runner update for the existing Astra/high experiment
`40bcf969116d3a4ac5f5f47d606298b3` at Black +9.5. The first three attempts ended
by bilateral White consensus, not rules victories. The worker then exited on a
Codex CLI error at 2026-09-29 17:16 UTC, after 28 new turns and 122 counted calls.
The old adapter surfaced only stderr warnings; the underlying failure was not
recoverable from its retained log. The new adapter prioritizes JSON error events
and also includes bounded stderr diagnostics.

## Protocol amendment

Policy `runner-policy-0d5fa2d2504a6026` is recorded in the public review before
continuation and tagged in subsequent explanations. Its exact configuration is:

```json
{"version":1,"retryThreshold":0.45,"decisionTimeMs":300000,"blackTarget":0.6}
```

The remaining attempts must use the latest losing-side own-turn checkpoint with
its own estimate at least 45%. For game 4 this is Black turn 3, checkpoint
`7933b639d6034566bfaa5ad0c1f7151e`, at 66%; turns 4 and 5 were 40% and 33%.
The runner restricts branch previews and submissions to the selected checkpoint.
It pauses if none qualifies, without inventing an outcome.

One decision now has 300 seconds total across all model calls, previews and
corrections, still bounded by 12 calls. Assessments are separate decisions.
Timeout cancels the model process and pauses without submitting its late answer.
The prior worker allowed 300 seconds per model call, up to twelve calls per job.

Both agents receive their own existing memory and all prior public branches.
The amended prompt asks for cumulative lessons and a ledger of tried plans.
Each branch requires a public `Lesson:` and `Strategy:` plus nonempty private
memory. The server continues to reject equivalent continuations. Semantic
novelty and honest calibration cannot be guaranteed by format checks: the human
should inspect the plan, moves and pressure evidence. No model is trained here.
Black searches for a line worth at least 60%, while White tries to refute it;
the target is explicitly a hypothesis, never a forecast floor.

The original experiment config (including 33%), games 1–3, game/move/call limits,
model identities, game rules and source identity remain historical and unchanged.
The browser and export expose the amendment through the existing review field.
Resume commands must retain `--policy`; the local supervisor now does so.

## Affected DAG and verification

Plan: `python3 tools/muju-content-dag.py plan --files
muju/tools/explorer/runner.ts muju/tools/explorer/providers.ts
muju/docs/EXPLORER.md --format json`.

| Node | Disposition and evidence |
| --- | --- |
| advantage-explorer | Changed: runner deadline, policy selection/enforcement, explicit learning prompt, error reporting, docs. Real subscription continuation is recorded below. Server/controller and browser sources unchanged. |
| game-validation | Changed: targeted regressions for exact 45% selection, inclusive boundary, no eligible checkpoint, branch/preview enforcement, policy provenance, retained learning context, honest target wording, shared deadline rejecting late replies, stdout failure reporting and process cancellation. Existing controller tests retain independent forecasts, branch immutability, budgets and persistence checks. |
| static-package | Verified unchanged: no browser, public assets, package inputs or rule changes; the local worker is not a browser dependency. No static rebuild needed. |
| server-package | Verified unchanged: no server/controller/rules sources changed; the worker runs on the subscribed local computer. Existing HTTP query/submit/review/control protocol is exercised by tests and the live continuation. |
| static-deploy | Verified unchanged: the current watch page consumes the same experiment API and existing public review/branch fields. No new browser release required. |
| server-deploy | Verified unchanged: preserve live commit `8ed95e54756f2b63f44dc46390f35fa9e443757f` and source hash `3d14e85c953553f14ca0d81a0fddf86989b7fc8871a13310095206fe1bc7654a`; no migration or redeploy. |
| release-verification | Changed: this record, source hashes and live before/after snapshots document the runner amendment without reclassifying earlier evidence. |

Node 24 validation on 2026-09-29:

- `npm run explorer:types`: passed.
- `vitest run tests/server/explorer-runner.test.ts tests/server/explorer.test.ts`:
  **17 passed**.
- `git diff --check`: passed.
- `python3 tools/muju-content-dag.py check`: graph valid, required paths present;
  five archived Academy media inputs remain unavailable and are outside this
  runner-only closure. No Academy lesson/rule/media change.

## Runtime and provenance

Source base: `8ed95e54756f2b63f44dc46390f35fa9e443757f`, with local runner changes.
SHA-256 of the executed worker files:

- `tools/explorer/runner.ts`: `af2b0de2096464ce281221fffd0191d0f7272f86b4d61f953be1095937a02239`
- `tools/explorer/providers.ts`: `06462aa3b51f1993255a56242049cb542b7928750fb9e173813080d06a632cf3`
- `tools/explorer/policy.ts`: `72c386f0099290118648c1412cad21635a0a64f29a5fa9f8f16a015c9c4eae41`

The private connection is retained locally; no token appears in this record.
The ignored run directory `muju/data/explorer-runs/2026-09-29-astra-high-9p5/`
contains `before-policy-v1.json`, `policy-v1.json`,
`runner-policy-v1-source.json`, updated `RUN.md`, append-only logs, and public
`evidence.json`/`status.json` snapshots. The restarted supervisor retains the
process lock, Node 24 environment and idle-sleep inhibitor.

The public amendment was verified before sending resume. The server acknowledged
running with all original counts intact (3 games, 28 turns, 122 calls), and the
worker began Black's branch decision using Astra high. The unchanged overall
limits allow at most two additional games and 72 additional player-turns.

Live verification at 2026-09-29 18:09 UTC: game 4
`8b1404dd2935975c42e597273b1257b5` was successfully saved with parent game 3
and fork checkpoint `7933b639d6034566bfaa5ad0c1f7151e` (Black turn 3, 66%).
The run was active at 29 total new turns and 125 counted calls, with the next
assessment underway. Its recorded lesson explicitly identifies the disrupted
recruitment in game 2; its changed plan keeps the boundary on the H-file,
protects northern recruitment, prepares an independent anchor and promotes I10.
This is an observed cross-game lesson, not an assertion that the new strategy
will win. A deep comparison confirmed games 1–3, config and source identity
unchanged. The local canonical/controller hash also still matches the live hash.
The first saved fork export is retained as `after-policy-v1-first-fork.json`.

No further release work is required for this local runner update. The bounded
experiment continues asynchronously; its eventual game results remain pending.

Watch: <https://deevgames.ashkie.com/muju/explorer?experiment=40bcf969116d3a4ac5f5f47d606298b3>.
