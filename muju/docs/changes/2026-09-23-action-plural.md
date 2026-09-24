# Action count pluralization (2026-09-23)

Change: the action-phase budget read "1 actions" (and its aria-label "1 actions
remaining") with one action left. It now reads "1 action" / "1 action remaining";
0, 2, 3 and 4 are unchanged ("0 actions", "2 actions" …). The same pattern in the
board's reach aria-label (`move costs 1 actions`) now reads `move costs 1 action`.
UI copy only: no rule, save, protocol or rules-revision change (`muju-phasing-4`).

Branch `claude/muju-action-plural` from `origin/master` 6f72a47b.

Affected closure: `python3 tools/muju-content-dag.py plan --kind ui --files
muju/src/components/ActionBar.tsx --files muju/src/components/Cell.tsx` →
browser-ui, academy-lessons, academy-audio, academy-video, game-validation,
static-package, server-package, academy-package, static-deploy, server-deploy,
academy-deploy, release-verification.

Sweep: `grep` of `muju/src` and `muju/server` for rendered action counts.
Fixed: `ActionBar.tsx` (text + aria-label, new `actionCount` helper), `Cell.tsx`
reach aria-label (move cost can be 1). Left as-is: `GameScreen.tsx`
`{actionsPerTurn} actions / turn` and `ModeSelect.tsx` saved-game label
(`ActionsPerTurn` is the literal type `4`); `InstructionsModal.tsx`
`Math.ceil(3/hi.speed)` (Hi has Speed 2, so always 2); `UnitInfo.tsx` already
says "1 action"; server/MCP text renders no action-count prose
(`compactReport.ts` uses `ap{n}/{4}`).

## Node dispositions

| Node | Disposition | Evidence |
|---|---|---|
| browser-ui | changed | `ActionBar.tsx`, `Cell.tsx`; new `tests/action-bar.test.tsx` (0/1/2 text and aria-label, Prepare label, reach label cost 1/2) |
| academy-lessons | verified unchanged | Academy episodes are pre-rendered videos with their own Remotion sources; they do not import `ActionBar`/`Cell`. No lesson text changes. |
| academy-audio | verified unchanged (planner marks media blocked; no media needed) | no narration change follows from a UI label |
| academy-video | verified unchanged (planner marks media blocked; no media needed) | no render change follows from a UI label |
| game-validation | changed | see Tests below |
| static-package | changed | `_site` rebuilt from merge commit 87e5dddc (the three `npm run build`s plus the same staging steps as `build-all.sh`); `tools/verify_site.py _site` pass; `node tools/smoke-site.cjs` PASS at 390px and 834px |
| server-package | changed | Docker image rebuilt by Render from the merge commit (bundles its own browser dist) |
| academy-package | verified unchanged | no Academy input changed |
| static-deploy | changed | local wrangler deploy, see Release |
| server-deploy | changed | Render auto-deploy of master, see Release |
| academy-deploy | verified unchanged | no Academy input changed; ashkie.com not republished |
| release-verification | changed | this record; both hosts serve the fix |

## Tests

Local (Node 24.11.1, `muju/`):

- `npm run server:types` — pass.
- `npm test` — first run 217/218 files, 8 failures, all in
  `tests/hooks/online-inspection.test.tsx`, which pinned the old reach label
  `/move costs 1 actions/`. Re-pinned to `/move costs 1 action$/`; that file and
  the new `tests/action-bar.test.tsx` then pass 16/16. Every other file passed
  (2984 tests, 17 skipped).
- `npm run build` (tsc + vite) — pass; `dist/assets/index-*.js` contains
  ``${l} ${l===1?"action":"actions"}`` and the reach label ternary.
- The Playwright specs pin only "4 actions", "3 actions", "2 actions" — unchanged.

CI: the `Deploy Games to Cloudflare Pages` workflow (build-all, server types,
`npm test`, online e2e, phone/tablet smoke) dispatched on the branch: run 35959697683 at 28c2695f, success in 15m37s
(every check step green; Deploy skipped, no CI credential as usual).

## Release

PR #33 (https://github.com/ethancd/deevgames/pull/33) merged as 87e5dddc; its
tree is identical to the CI-verified 28c2695f (master had not moved).

- Static (Pages): `npx wrangler pages deploy _site --project-name deevgames
  --branch master --commit-hash 87e5dddc…` → https://830d509a.deevgames.pages.dev.
  `https://deevgames.pages.dev/muju/` now serves `assets/index-BJCennRB.js`
  (was `index-CJHEE-gp.js`), whose action bar reads
  ``"aria-label":`${Tp(s)} remaining` `` / ``c==="action"?Tp(s):…`` with
  ``Tp=l=>`${l} ${l===1?"action":"actions"}` `` and the reach label
  ``move costs ${w} ${w===1?"action":"actions"}``.
- Node/MCP (Render): auto-deployed master. `https://deevgames-muju.onrender.com/muju/`
  and `https://deevgames.ashkie.com/muju/` (Render origin) serve
  `assets/index-BCAeitdg.js` (was `index-DrK90_bQ.js`) with the same code;
  `/api/muju/health` → `{"ok":true,"game":"Muju Hono Irumbu","protocol":1}`;
  `/SKILL.md` 200. MCP text carries no action-count prose, so no MCP check was needed.
- Academy: not affected, not republished.

Compatibility: none affected (copy only; saves, rooms and replays untouched).
