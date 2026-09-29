# Center move markers on the crystal axes

The filled and hollow movement dots retained an 8% right margin from the old
reserve-strip layout, putting their centers 4% left of the square center.
A live desktop measurement reproduced a 2.64px leftward error. Center them
explicitly at 50%/50%, sharing the crystal SVG's center. Destination previews
use the same positioning, and empty-square attack-frontier dots move from 46%
to 50%. The separate badge position on occupied squares remains intentional.

Prepared from `origin/master` at `c7017cab50ad915a934d8b813c81d9feae12bf17`
in the isolated release checkout. Only shared CSS and this record change.
Rules stay `muju-phasing-4`; movement legality, mining, crystal ordering,
saves, replays, rooms and AI are unchanged. Original local edits and historical
release evidence are preserved.

Plan: `python3 tools/muju-content-dag.py plan --kind ui --format json`.

| Node | Disposition and evidence |
| --- | --- |
| browser-ui | Changed: shared marker centering in `src/index.css`; applies to the game and shared board consumers. |
| academy-lessons | Verified unchanged: Academy sources and supplement contain none of the changed marker selectors; no lesson claim depends on the former offset. |
| academy-audio | Verified unchanged: no speech or captions affected; archived media preserved. |
| academy-video | Verified unchanged: no lesson example or rule change; recorded boards preserved. |
| game-validation | Verified with existing browser suite and direct rendered geometry measurements; no new test duplicates the CSS. Full gate results recorded in the PR before merge. |
| static-package | Changed: complete three-game build and staged-site smoke checks passed. |
| server-package | Changed: browser assets rebuilt with the Render Docker context; server code unchanged. |
| academy-package | Verified unchanged: no content or media to repackage. |
| static-deploy | Changed target: existing Pages project `deevgames`, branch `master`; exact release recorded in the PR. |
| server-deploy | Changed target: existing Render service `srv-dahbp4ht0dsc73fdqn10`; exact release recorded in the PR. |
| academy-deploy | Verified unchanged: the pinned historical course and its notice remain appropriate for this CSS-only correction. |
| release-verification | Changed: this record and the PR's final merge, provider release and live verification audit. |

Validation: server typecheck, three-game build, all 106 online/browser checks,
390px/834px site smoke checks, Render-context build and DAG structural check
passed. Direct DOM measurements of 20 near/far markers found zero center or
crystal-axis offset at 390×844 and 834×1112; maximum 0.00390625px browser rounding
at 1280×900. Twelve enemy reach/frontier markers also measured zero offset on
phone. The corrected phone screenshot was inspected. Full unit-suite results
are recorded in the PR before merge.

Logs are `/private/tmp/muju-align-{unit,browser,build,smoke,render-build}.log`.
The browser suite uses an identical temporary copy outside `.codex` for the
existing Express hidden-path restriction. Academy media absence is unrelated
and does not block this CSS correction.

Render configuration rechecked: root `muju`, Dockerfile `./Dockerfile`, context
`.`, auto-deploy On Commit, health `/api/muju/health`, existing 1 GB `/app/data`
disk. No provider settings changed. Existing Cloudflare access has `pages:write`.
