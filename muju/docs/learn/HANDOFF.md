# Learn to Play: handoff (2026-10-03)

Start here for the next Learn to Play session.

## State

- **Shipped.** PR #52 merged as `5790adc2`: 174 puzzles in 22 arcs, the framework,
  the UI, and the start-summoning / occupy-until-your-next-turn wording across
  the game, MCP text and SPEC. The Render host (Node/MCP and `/muju/`, including
  `deevgames.ashkie.com/muju/`) auto-deployed and is verified live; see the
  Release section of [`../changes/2026-10-03-learn-to-play.md`](../changes/2026-10-03-learn-to-play.md).
- **Not published.** The Cloudflare Pages mirror at `deevgames.pages.dev/muju/`
  still serves the previous build. Publishing is the manual Wrangler step in
  the root README. The Pages hub links Muju to the live Render host, so players
  are unaffected.
- **Open: PR #53** (`claude/muju-puzzles`, docs only). It holds the release
  record, the stat-badge design study, this handoff, the walkthrough recorder,
  and every next-session item in [`../ROADMAP.md`](../ROADMAP.md). Merge it first.
- **A disposable room** named "release smoke 2026-10-03" (`d45aff35…`) was left
  on the production host after the release check.

## The next batch: owner decisions already made

All of these are in [`../ROADMAP.md`](../ROADMAP.md), under "Learn to Play
follow-ups" and its "Puzzle revisions queued for the next session",
"Decisions to make" and reviewer sections.

1. **Never start mid-turn.** Rework or cut teamwork-3, defend-4, plant-5,
   upkeep-1, -2, -5 and -7, and eliminate-5. Starting in Prepare is fine. Enforce
   it in `src/learn/verify.ts`.
2. **Grade at End turn, after the consequence.** In mine-3 and mine-6, mining
   plays out and the counter shows the shortfall before the failure card.
   Consider this for every one-turn puzzle, with the early check becoming a soft
   cue.
3. **move-7.** "Reach the flag", with the flag five squares from the row Muju.
4. **move-9.** Spotlight End turn the first time it must be pressed. Generalize
   to a per-puzzle `spotlight` field, and use the same glow at 0 actions.
   Auto-ending at 0 actions is not recommended; see "Decisions to make".
5. **Celebrations.** Celebrate only what the goal measured (no ring on a Mining-0
   Radi), a beat after the final mining or attack effect settles (a
   `whenSettled()` on the effects handle).
6. **Stat badges** on the selected piece: V1 corner chips plus V5 combat-aware
   chips. See [`../design/stat-badges/`](../design/stat-badges/README.md).
7. **Game-wide items:** center pieces in their squares at every board size;
   rename Cleave to "Bonus Attacks" everywhere players see it (Learn's
   `cleave-*` ids can be renamed until progress data matters; after release
   they are progress keys, so plan a migration in `progress.ts` or keep them).
8. **The advanced course** (about 200 more puzzles) and its framework needs:
   three-turn search, new goal kinds, a position harvester.

## How to work

From `muju/`:

| Task | Command |
|---|---|
| Prove an arc while editing | `node --import tsx tools/learn-check.ts <arc> --board` (`--puzzle <id>`, `--live` for live-budget counts) |
| Prove everything | `node --import tsx tools/learn-check.ts` (about 90 s) or `npx vitest run tests/learn` |
| Play a puzzle | `npx vite --port 3002`, then open `/muju/?learn=<id>` (`?learn=1` for the map; add `&probe=1` to expose `window.__mujuLearn`) |
| Solve every puzzle in Chrome | `MUJU_BASE_URL=http://127.0.0.1:3002/muju/ npx playwright test e2e/learn-catalog.spec.ts --workers 6` (about 2 min) |
| Record a walkthrough video | `node --import tsx tools/learn-walkthrough.mts phone` (or `desktop`). Convert with Remotion's bundled ffmpeg (no system ffmpeg): `DYLD_LIBRARY_PATH=<dir> <dir>/ffmpeg`, where `<dir>` is `academy/production/R01/node_modules/@remotion/compositor-darwin-arm64` in the main checkout |

- **Craft and format:** [`AUTHORING.md`](AUTHORING.md).
- **Course design and arc briefs:** [`CURRICULUM.md`](CURRICULUM.md).
- **Research behind it:** [`research/`](research/).

### Rules of the road

- Every puzzle change is proved by the solver.
- Run a cook scan (first turns that win the game but fail the puzzle, or win
  by the wrong route) before calling a puzzle done. The check tool does this by
  default.
- Keep new code out of `src/game` and `src/ai`. The lab hashes them, and the
  explorer's audited fingerprint covers `src/game`, `server/explorer`,
  `src/ai/simulate.ts` and `server/observation.ts`. Any edit there needs a new
  audit entry (see [`../changes/2026-10-03-explorer-wording-audit.md`](../changes/2026-10-03-explorer-wording-audit.md)).
- Player-facing wording uses "start summoning" versus "successfully summon",
  "occupy the enemy home until your next turn", and "Bonus Attacks", not
  "Cleave", in new text.

## Known flaky test

`e2e/onboarding.spec.ts` "tapping a gold dot…" fails intermittently on the Vite
dev server, at the same rate on the base commit. It passes on a built site.
