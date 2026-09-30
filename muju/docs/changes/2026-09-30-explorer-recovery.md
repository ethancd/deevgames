# Recover exhaustion searches with no qualifying retry checkpoint

The +18.5 experiment `4a4288eb268ec8b4888425cd81f6ec86` ran for 44 minutes
(2026-09-29 22:44:55–23:29:15 UTC), completed 11 new player-turns and 50
successful model calls, then adjudicated Black ahead by bilateral consensus.
White's own estimate never exceeded 20%; the final estimates favored Black
94% and 93%, with scored mining 130.5 versus 102. Both agents described economic
domination before White's tactical errors. This is one explored line and a
consensus result, not a proved win or an independent win-rate estimate.

The version-2 worker then paused because it had no own checkpoint at 45%.
The user chose an opening retry for this case on 2026-09-30.

## Runner recovery

Version 3 keeps latest-own-checkpoint selection at 45% when one qualifies. With
`noEligibleCheckpoint: "opening"`, an empty qualifying set selects the loser's
earliest own turn and explicitly labels an opening fallback in the prompt and
recorded branch. The model must choose a changed strategy and a different legal
complete turn; the server rejects equivalent continuations. An optional `finish`
setting completes normally with `no-qualifying-retry-checkpoint`, preserving the
prior game outcome and using no additional model call. Version-2 semantics and
old policy fingerprints are preserved.

The chosen run amendment is `runner-policy-10530f474d8b56b1`:

```json
{"version":3,"retryThreshold":0.45,"paceAfterMs":300000,"blackTarget":0.6,"noEligibleCheckpoint":"opening"}
```

The same private connection, memories and budgets are retained. Before recovery:
1 of 5 games, 11 of 100 new turns, 50 of 1,000 calls. The first fallback is White's
initial checkpoint `fce41047159b41fa2479ebf6e4d574a0`, originally assessed at 20%.
Earlier forecast values and the original game's actions/result are not rewritten.

## Audited server compatibility

Restart exposed a second issue: release `5c8fff1f` (ordinary game forks with fresh
clocks) had changed `server/observation.ts`, invalidating all earlier explorer
source hashes. The engine, canonical simulator and explorer controller/schema
were unchanged between `8ed95e54` and `5c8fff1f`. The observation diff only adds
optional ordinary-room `forkedFrom` metadata and updates timed-room creation/fork
guidance. Explorer rooms have no forkedFrom or wall-clock controls. This is an
audited non-gameplay transition, though the changed agent-facing guidance is
still identified as a different source revision.

`server/explorer/compatibility.ts` now lists exactly two original full hashes:

- `3d14e85c953553f14ca0d81a0fddf86989b7fc8871a13310095206fe1bc7654a` (`8ed95e54`)
- `c89676ed18ce8a4495c9a8473ec9a19b02ed294f9cac396caef0eabf18b51e51` (`5c8fff1f`)

Both are allowed only on implementation digest
`ece5ff5a04c5b9ea9792a08e96dd54251b5eccdc504c1f1699c9d0b72590a47d`.
That digest covers every previously hashed file plus the compatibility guard,
excluding only the data-only compatibility manifest to avoid self-reference.
The ordinary full source hash includes that manifest and is
`fb0e89a76acfce15b6ac0ac64d00cdadc07be32a37d3b07f4c67022d5e64d783`.
Any later implementation edit disables these old-source allowances until it
receives a separate audit. Unknown hashes and changed rules revisions still fail.

Authenticated compatible continuation appends `compatibleRuntimes` with its
source identity, timestamp and starting turn/call counts. Original identity,
private seat memories, sealed forecasts, games and budgets remain intact.
No engine move, score, adjudication or branch rule changed. No database migration
is required; the existing JSON payload gains optional provenance metadata.

## Affected DAG and validation

Plan inputs: `server/explorer/{provenance,compatibility,store}.ts`,
`src/explorer/types.ts`, `tools/explorer/{policy,runner,providers}.ts`,
`tests/server/explorer-{provenance,runner}.test.ts`, `docs/EXPLORER.md`.
All are relative to `muju/`; no unmapped inputs.

| Node | Disposition and evidence |
| --- | --- |
| advantage-explorer | Changed: explicit empty-threshold handling, retained soft pacing/timeout recovery and learning policy, exact audited compatibility and append-only runtime provenance. |
| game-validation | Changed: complete below-threshold game→retry over HTTP, illegal checkpoint and duplicate-opening rejection, preserved parent/economy/shared budget, finish option, both seats, legacy policy fingerprint, approved/unknown source and rule checks, sealed-memory retention. All server regressions pass. |
| static-package | Verified unchanged behavior: only a type declaration changed in browser sources; no runtime UI/assets/rules changes. Muju browser/WASM build passes. Local and Docker builds have differing generated bundle names, as in prior release evidence; source scope does not require a Pages update. |
| server-package | Changed: current Node 24 Docker build includes the compatibility module and uses the existing persistent database configuration. |
| static-deploy | Verified unchanged: watch/review/export interfaces are the existing ones, with the same route. No Pages release required for this server/runner fix. |
| server-deploy | Deployment pending verification below; existing Render service auto-deploys master. The 1 GB disk at `/app/data` was verified and is unchanged. |
| release-verification | Changed: this audit plus saved before/after public exports and source manifests. |

Validation with Node 24:

- `npm run explorer:types` and `npm run server:types`: passed.
- `vitest run tests/server`: **258 passed across 28 files**.
- `npm run build`: passed (WASM, TypeScript and Vite).
- `git diff --check`: passed.
- DAG check: required paths valid; archived Academy media remain outside this
  closure. No Academy rule, text, audio, video or release changes.

Historical reports and +9.5 experiments are preserved. Ignored run evidence is
under `data/explorer-runs/2026-09-29-astra-high-18p5/`, including
`before-policy-v3.json`, `policy-v3.json`, `runner-source-v3.json` and append-only
logs. No private control token or provider credential is published.

## Live recovery

Pending deployment and a verified saved opening retry. The earlier resume attempt
was correctly rejected by the old source guard before any game state changed.
