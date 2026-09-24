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

## Live evidence (PR #36, merge `9ebe7e60`, 2026-09-24T06:58:56Z)

- Render served the rebuilt `/SKILL.md`, `/muju/skills/muju-hono-irumbu/SKILL.md` and
  `/muju/skills/muju-hono-tanka/SKILL.md` (last-modified 06:59:26Z) by 07:00:08Z; `/api/muju/health` ok.
- A live `muju_observe` over `/mcp` (room of wave-1 game SO01-B) returned `killClock` with neither `quietTurns` nor
  `drawAtQuietTurns`. `muju_rules` still reports `muju-phasing-4`.
- The restart produced a burst of 5xx for the live LLM-vs-Hard rooms (the campaign's site-health gate read 32% at
  07:00:25Z); the rooms and their clocks persisted.

## Follow-up: the analysis headline's `draw` alias (same day)

The same deprecated counter survived in the analysis headline as `sections.draw = [quietPlayerTurns, limit]`
(`server/analysis/index.ts`), which centaur-tier agents see every turn. It is removed the same way:
`tests/server/analysis.test.ts` asserts it is absent; the skills and `docs/ANALYSIS_TOOLS.md` drop its sentence.
`killClock` in the headline is unchanged.
