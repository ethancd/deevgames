# Remove the draw-named kill-clock aliases from observations (2026-09-24)

**What was wrong.** Room observations still carried `quietTurns` and `drawAtQuietTurns`. They were deprecated
aliases of `killClock.plies` and `killClock.limit`, kept "for one release" when `muju-phasing-3` replaced the
twenty-ply draw clock with the ten-ply kill clock (2026-09-22). Agents read `drawAtQuietTurns: 10` literally. In
the LLM-vs-Hard campaign (wave 1), Sonnet 5 Low wrote "I assumed 10 quiet turns meant a draw" (game SN02-B). It
passed four turns while behind 46 to 164 on mined totals and lost on the kill clock.

**The change.** `server/observation.ts` no longer emits `quietTurns` or `drawAtQuietTurns`. `killClock` (`plies`,
`limit`, `warningAt`, `minedTotals`, `leader`) is unchanged. The public skills (`muju-hono-irumbu`,
`muju-hono-tanka`) and `ONLINE.md` drop the alias sentence. The skills now say a kill-clock ending is a win for
the mined-total leader, not a draw. `tests/server/kill-clock-statements.test.ts` asserts that the aliases are
absent.

**Not changed.** Rules (`muju-phasing-4`), engine, browser UI, Academy. Nothing in `src/`, `academy/`, `tools/`,
`docs/MCP_TOOL_TAPS.md` or `docs/ANALYSIS_TOOLS.md` reads either field (`git grep`).

## Release record

```text
Change: observations drop quietTurns/drawAtQuietTurns (deprecated draw-named aliases); killClock unchanged
Rules revision / source commit: muju-phasing-4 unchanged / this commit on claude/muju-nix-quiet-turns
Affected closure: python3 tools/muju-content-dag.py plan --files muju/server/observation.ts
  muju/public/skills/muju-hono-irumbu/SKILL.md muju/public/skills/muju-hono-tanka/SKILL.md muju/ONLINE.md
Node dispositions:
  server-runtime: changed (ONLINE.md observation text); no protocol/transition/persistence change
  mcp-tools: changed (observation payload loses two fields)
  agent-guides: changed (both public skills, ONLINE.md); MCP_TOOL_TAPS/ANALYSIS_TOOLS verified unchanged (no reference)
  academy-lessons/audio/video/package/deploy: verified unchanged (git grep: no academy reference to either field)
  game-validation: tsc -p server/tsconfig.json clean; vitest tests/server 22 files / 207 tests passed
  static-package/static-deploy: blocked by policy (Pages publishing paused, 2026-09-18); Render serves /muju/
  server-package/server-deploy: merged to master -> Render auto-deploy (srv-dahbp4ht0dsc73fdqn10)
  release-verification: see "Live evidence" below
Compatibility: clients reading the aliases must read killClock instead; stored rooms and saves unaffected
Remaining work: none beyond live verification
```

## Live evidence

(Filled in after the Render deploy.)
