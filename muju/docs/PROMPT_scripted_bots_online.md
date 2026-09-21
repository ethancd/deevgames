# Prompt: let me play against the scripted bots online

Paste this into a fresh Claude Code session at the repo root.

---

I want to play Muju against the lab's scripted bots from the browser (and ideally from an online room),
not just against the AI engines. Build it end to end.

Context you need:
- The scripted bots live in `muju/lab/harness/bots/` (`index.ts` exports `botNames()` / `createBot(name)`):
  Random, Greedy, Rush, Expand, Balanced, Turtle, Tier1Spam, MiningDenial, AntiRush and six Mono-<element>
  bots. They implement the harness `Bot` interface (`muju/lab/harness/types.ts`): `nextAction(state, player)`
  returns one canonical action at a time. The lab harness is Phasing-only (`lab/harness/runner.ts`).
- Rush currently beats every AI in the repo under Phasing (see
  `muju/docs/hard-ai/phasing/repair-2026-09-20/HANDOFF.md`), so it is a genuinely interesting opponent.
- The browser AI path: `muju/src/hooks/useAI.ts`, `muju/src/ai/worker/{handler,protocol}.ts`,
  difficulty selection in `muju/src/components/ModeSelect.tsx`, Phasing AI guard
  `muju/src/ai/phasingPreview.ts` (`?phasingAi=1`). Every action is revalidated with `isLegalAction`.
- The online path: `muju/server/rooms.ts`, `server/mcp.ts`, the engine seat in `muju/tools/engine-seat/`
  and `muju/docs/ENGINE-SEAT-MATCH-2026-09-19.md` (an engine can already hold a seat in a restricted room).

What I want:
1. Local vs-bot play: an opponent picker in ModeSelect ("Scripted bot: Rush / Expand / Balanced / …")
   that runs the chosen bot in the AI worker under Phasing. Move the bots (or a browser-safe copy of the
   ones that have no Node-only imports) somewhere `src/` may import from without dragging the lab in;
   keep ONE implementation, not a fork. Short per-bot descriptions in the picker.
2. Online: let a room be created with a scripted bot in one seat, reusing the engine-seat mechanism
   rather than inventing a second one. MCP discovery text should mention it.
3. Tests: a worker test that each bot plays a full legal Phasing game vs Random; a component test for the
   picker; an e2e smoke for one bot.
4. Follow the release DAG in `muju/docs/CONTENT_DAG.md` (`python3 tools/muju-content-dag.py plan --kind ai`)
   and record dispositions. Browser site, Node/MCP host and Academy are separate release paths.

Constraints: bots must never emit an illegal action into a live game (fall back to ending the phase, as
`lab/harness/runner.ts` does); no change to canonical rules; easy/medium/hard must not load bot code they
do not use.
