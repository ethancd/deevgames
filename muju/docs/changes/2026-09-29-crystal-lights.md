# Crystal perimeter lights — production release

User-approved appearance: soft white dots, 100% glow, 60% reserve background
brightness. The game and map painter no longer have a Reserves toggle. The
visual key and SPEC describe the always-visible lights and colors.

The lights depend only on the **remaining** count. Depletion removes the eight
extra edge lights, then the four corners, then the four midpoints in
top–left–bottom–right order. Thus 16→8 and 16/8→4 converge to the same pattern as
fresh eight- and four-crystal squares; surviving lights never move. Every light
is inset from the shared borders. Legacy saves need no starting-map metadata.

## Compatibility and provenance

Prepared from `origin/master` at `6e4e18e3a34e9cc0acd6a63d93a469fb3228fafc`
in an isolated worktree. The prototype and unrelated edits in the original
checkout are preserved. No game rules, piece stats, room schema, save schema,
AI behavior, or replay data change; the rules revision remains `muju-phasing-4`.
The shared Board renderer also supplies analysis, online observation and replays.

## Affected closure

Plan: `python3 tools/muju-content-dag.py plan --kind ui --format json`.
All existing component paths are already covered by the DAG.

| Node | Disposition and evidence |
| --- | --- |
| browser-ui | Changed: shared soft-dot renderer, dimmed existing reserve palette, always-on game/painter display, removed toggle and brick CSS, updated visual key and SPEC. |
| academy-lessons | Verified unchanged: R04/R10 lesson text and the shared supplement do not teach the removed brick toggle. The published course explicitly identifies its pinned older recordings. This cosmetic production UI change does not change its mining examples, stats or rules. |
| academy-audio | Verified unchanged: no narration or caption claim changes; preserve the archived takes. Local media is absent from the release worktree and is not needed for this UI-only release. |
| academy-video | Verified unchanged: preserve versioned recorded boards; no remaster requested or needed for a production appearance preference. |
| game-validation | Changed: tests cover all 0–16 counts, stable depletion, 16→8 and 8→4 through real mining, refresh, accessibility, phone layout and painter editing. Visual/mobile tests now run in the existing online CI gate. |
| static-package | Changed: rebuild all three games and stage the checked `_site` artifact. |
| server-package | Changed: existing Docker build packages the new browser assets. Server code and persistence configuration are unchanged. |
| academy-package | Verified unchanged: no new Academy media or text to package. |
| static-deploy | Changed release target: publish the checked artifact to existing Pages project `deevgames`, production branch `master`. Runtime deployment identity is recorded in the release PR. |
| server-deploy | Changed release target: existing Render service deploys the merged `master` commit. Runtime deployment identity is recorded in the release PR. |
| academy-deploy | Verified unchanged: live course page checked; it labels the historical recordings, and brighter expansions still correctly indicate larger reserves. No Academy publication for this cosmetic change. |
| release-verification | Changed: this source/validation record plus the release PR's final CI, merge and deployment audit. |

## Validation

- `npm run server:types`: passed.
- `npm test`: 240 files passed; 3,391 tests passed, 17 existing skips.
- `bash build-all.sh`: passed for Muju, FORGE and Oracle; links and artifact
  sizes verified.
- `tools/smoke-site.cjs`: passed at 390px and 834px, including game saves,
  refresh, all three games and both FORGE art sets.
- DAG structural check and all 14 planner tests passed.
- Screenshots inspected for the phone board, all 0–16 reserves, crowded armies
  and the painter. Lights, pieces and colors remain visible together.
- `npm run test:online:e2e`: all 106 tests passed (3.2 minutes).
- Additional WebKit run: 19 passed, including phone layouts, all light visual
  checks, mining/refresh and painter; five desktop/tablet assertions report
  one pixel of vertical overflow. The release PR records the master comparison
  and final CI result.

Browser tests run from an identical temporary copy outside the hidden `.codex`
worktree directory: Express rejects absolute `sendFile` paths containing hidden
segments. This is a local serving-path limitation; the Render `/app` path is
unaffected. The refresh regression seeds local storage only when absent so a
reload exercises the actual saved post-mining position.

## Deployment route verification

On September 29 UTC, Render showed service `srv-dahbp4ht0dsc73fdqn10`, GitHub
`ethancd/deevgames`, branch `master`, root `muju`, Dockerfile `./Dockerfile`,
auto-deploy **On Commit**, health path `/api/muju/health`, and the existing 1 GB
disk at `/app/data`. No settings were changed. Cloudflare's existing OAuth
session has `pages:write` for the current project. The PR's deployment audit
records the exact merge SHA, live asset comparisons and public URLs after release.
