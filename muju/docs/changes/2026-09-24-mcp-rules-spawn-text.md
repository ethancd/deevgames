# Agent rules: define the spawn rectangle, mining and upkeep elimination (2026-09-24)

**Why.** LLM players in the Hard campaign (pilot P01, P02; wave 1 SN02-W, SN03-W) never worked out where they
could buy, and bare-tier players guessed at rules for whole games. `muju_rules` and the public skill said
"supporting rectangle" and "unblocked spawn rectangles" but never defined either. Players also lost to
rules they could not read: fully promoted armies going bankrupt (P02-B, P04-B), and squares that never refill.

**What changed** (text only; no rule changed):
- `muju_rules` (`server/observation.ts`): new `spawning` entry (rectangle from your home corner to any own
  unit, blocked by any enemy inside it, with a worked example), new `mining` entry (per-square take, no refill,
  mined total), and upkeep costs plus the `upkeep-elimination` path added to `upkeep`. `summons` points to `spawning`.
- Public skill (`muju-hono-irumbu` and its kept `muju-hono-tanka` copy): "Where you can buy" and "Mining and
  upkeep" paragraphs in "The turn".
- `docs/MCP_TOOL_TAPS.md`: the rectangle definition on the `BUY_UNIT` row.
- `tests/server/rules-text.test.ts` pins the text and checks the worked example against `getPurchasePositions`.

**Content DAG.** `mcp-tools` and `agent-guides`: verified by tests; live `/SKILL.md` and `muju_rules` checked after
deploy. `server-deploy`: Render auto-deploy from master. `static-deploy`: blocked (Pages paused since 2026-09-18).
No game, AI, rules revision or Academy content changed.
