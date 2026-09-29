# Bottom crystal last

Follow-up to the [perimeter-light release](2026-09-29-crystal-lights.md).
The final four lights now disappear **top → left → right → bottom**, leaving
only the bottom midpoint when one crystal remains. Each four-light round of
extra edge lights uses the same order. Corners disappear top-left, bottom-left,
top-right, bottom-right, so that group also finishes along the bottom edge.
The extra eight still disappear before the corners, and the corners before the
midpoints: 16→8 and 8→4 remain identical to fresh eight- and four-crystal squares.

Prepared from `origin/master` at `147a8a62343b7025097ba4bf3f2694ec80637c6a`
in the isolated release worktree. This changes only display ordering and its
current explanation; soft dots, glow and background brightness are unchanged.
Rules remain `muju-phasing-4`. Saves, rooms, replays, mining amounts and AI
behavior retain their existing schemas and semantics. Existing saved positions
receive the corrected lights when rendered. The original dirty checkout and
previous release evidence are preserved.

Plan: `python3 tools/muju-content-dag.py plan --kind ui --format json`.

| Node | Disposition and evidence |
| --- | --- |
| browser-ui | Changed: shared light ordering, visual key and SPEC. Board, painter, analysis and replay renderers all use the same remaining-count mapping. |
| academy-lessons | Verified unchanged: reviewed R04/R10 and the shared supplement; none teach a perimeter-dot mining order. Mining quantities and examples are unchanged. |
| academy-audio | Verified unchanged: no narration or caption changes; archived takes preserved. Missing local media is not needed for this display-only correction. |
| academy-video | Verified unchanged: versioned recorded boards preserved; no changed lesson claim or remaster. |
| game-validation | Changed: regressions specify the bottom final light, parallel edge rounds, bottom final corner, stable survivor positions and 16→8→4 convergence; phone browser test asserts the actual single-light transform. |
| static-package | Changed: rebuild and smoke-test the full three-game artifact. |
| server-package | Changed: browser assets rebuilt with the Docker context; server code and storage configuration unchanged. |
| academy-package | Verified unchanged: no Academy content changes to package. |
| static-deploy | Changed target: existing Pages project `deevgames`, branch `master`; deployment audit is recorded in the release PR. |
| server-deploy | Changed target: existing Render service `srv-dahbp4ht0dsc73fdqn10`, GitHub `master`; deployment audit is recorded in the release PR. |
| academy-deploy | Verified unchanged: the previous release's pinned-course notice and lesson audit remain applicable; this correction introduces no Academy claim. |
| release-verification | Changed: this record plus the release PR's source revision, validation results, deployment identities and live asset/behavior verification. |

## Validation

- `npm run server:types`: passed.
- `bash build-all.sh`: passed for all three games and artifact verification.
- Full online browser gate: **106 passed**, including AI worker, save/reload,
  real mining convergence, phone layouts and the actual bottom final dot.
- Site smoke checks passed at 390px and 834px.
- Phone screenshot covering every reserve count 0–16 inspected.
- Render-context browser build passed. The two packaging contexts are verified
  independently because Tailwind scans a smaller input set inside Docker.
- DAG structural check passed; unavailable Academy media is unaffected.
- Full unit-suite outcome is recorded in the PR before merge.

Evidence: `/private/tmp/muju-bottom-unit.log`, `muju-bottom-browser.log`,
`muju-bottom-build.log`, `muju-bottom-smoke.log`, and
`muju-bottom-render-build.log`. Browser tests used an identical temporary source
copy outside the hidden `.codex` path, as documented in the original release.

## Release route

Render configuration rechecked: GitHub `ethancd/deevgames`, branch `master`,
root `muju`, Dockerfile `./Dockerfile`, context `.`, auto-deploy **On Commit**,
health path `/api/muju/health`, existing 1 GB disk at `/app/data`. No settings
changed. Existing Cloudflare OAuth access includes `pages:write`.
The PR records the final merge commit, deployed assets, health, MCP rules and
public archived-room metadata continuity after publication.
