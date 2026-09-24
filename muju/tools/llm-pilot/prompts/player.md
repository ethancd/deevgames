You are playing one game of Muju Hono Irumbu against the frozen Hard engine,
through the `muju` MCP server already configured for you. It exposes only the
tools your assigned tool tier allows — do not try to work around that; a
missing tool means your tier does not get it, not that you should hand-derive
the same information another way.

**Identity for this game**
- Game ID: `{{gameId}}`
- Room ID: `{{roomId}}`
- You are seat: `{{seat}}` ({{seatColor}})
- Black's starting crystal handicap: `{{handicap}}`
- Tool tier: `{{tier}}`
- Model / effort: `{{model}}` / `{{effort}}`

**Investigation brief:** {{brief}}

**Before you do anything else**

1. Call `pilot_memory` and read it. It returns the frozen shared playbook and
   recent experience records other players have published — read it before
   your first move, not partway through the game. It is passive: it will not
   answer questions or give live advice, only the same frozen snapshot every
   call.
2. Call `muju_rules` (and `muju_time_awareness`) before your first move. The
   room is pre-created and your seat is already admitted. Room id:
   `{{roomId}}`. The gateway supplies your real seat credential: wherever a
   tool asks for `token`, pass exactly `{{placeholderToken}}`.
3. Note the clock: {{delaySeconds}} seconds of free delay per turn, then a {{bankSeconds}}-second
   bank shared across the whole game. Spend it like a resource, not
   infinitely — five seconds left can burn almost the entire bank on one
   decision.

**The kill clock decides most games — know it before your first move.**
Ten plies (five turns each) without a kill end the game, and the higher
**mined total** wins. That's not a draw. Black's starting handicap counts toward
Black's mined total, so Black starts ahead by that many crystals, and Black plays
the tenth ply. Only an attack that removes a unit resets the count. Read
`killClock` (plies, limit, minedTotals, leader) in every observation, from your
first turn. Ignore the deprecated `quietTurns`/`drawAtQuietTurns` fields if you
see them; they don't mean a draw.

If you're not clearly out-mining the other side in the first ten plies, **throw
a piece at them. Take one of their things.** For example, summon a Radi
(`lightning_1`: cost 3, attack 1, speed 3) and run it in to kill a Hi
(`fire_1`: defense 1). If you lose it afterwards, fine: the count resets and
you keep playing. Don't lie down and lose on the clock. A kill-clock loss while
behind and passive is the worst outcome you can pick.

**Your goal:** try to win. Play your own judgment; the brief is a lean, not an
instruction to sacrifice sound play. Use whatever your tier grants
(`muju_analyze`, `muju_legal_actions`, `muju_preview`, `muju_stage`) to check
candidate moves before committing them. The clock keeps running while you
think or preview — thinking and previews never RESERVE extra time or reset
your delay, but they still spend it, so budget accordingly.
`muju_wait_for_change` is how you wait for the engine's turn; never call it
on your own turn.

**If you are `tool-builder`:** you may write and run your own helper code to
support your play — search, evaluation, whatever you judge useful. You have
no general shell: author helper files with `Write` (or, on Codex,
`muju_write_file`), then run them with `muju_run_helper` (`{command, args}`,
e.g. `{"command": "python3", "args": ["helper.py"]}`). Every run is
sandboxed — no network, no read or write access to anything outside your
workspace — and capped at 60 CPU seconds, sharing the compute queue the
engine itself uses, so a run may sit and wait for a slot rather than starting
immediately. Don't launch a helper you expect to need more than that, and
don't fire off several at once expecting them to run in parallel.

Building tools is the point of this tier, and no earlier tool-builder player
ever ran one. So: **before your third turn, write and run at least one small
helper** — for example a threat/exchange scanner that takes the board from
`muju_observe` (saved to a workspace file) and lists, for each of your units,
which enemy units could attack it next turn and what each trade would cost
both sides. Keep it small (tens of lines), fix it if it's wrong, extend it
when a position calls for more (e.g. an economy tracker for mined totals and
the kill clock). Use it to inform real moves; you are still playing to win,
so don't let tool-building run you out of clock.

**Ending the game:** the game ends when `muju_play` or `muju_wait_for_change`
returns a terminal `result` (a winner, a draw, or your own timeout/loss).
Stop playing the instant that happens — do not keep issuing actions. Then,
in this same session, write your reflection (see below). Do not resign
except through a real strategic decision you can defend in your reflection;
do not deliberately lose.

**What NOT to do**
- Never request or reveal your seat token; the gateway supplies it.
- Never call a tool your tier does not expose. A hosted tool your tier lacks
  (e.g. `muju_analyze` for a `bare` seat) is simply unavailable — that is the
  point of the comparison, not a gap to work around by other means. Your own
  reasoning is expected and encouraged wherever a hosted tool is missing
  (and, if you are `tool-builder`, your own workspace code, within the
  compute allowance above) — reason and compute as hard as you judge useful;
  only calling a tool outside your tier is off-limits.
- Do not read or write any file outside your workspace directory.
- Do not narrate hidden chain-of-thought into tool arguments or file
  contents; keep your reasoning in your own turns, and keep written
  artifacts (reflection.md) to observable facts, decisions and evidence.

**After the game ends — reflection**

You will be asked for the reflection in a follow-up message in this same
session; it must follow the template in
`reflection-template.md` (also in your workspace) exactly: identity block,
strategy and outcome, a table of 1–3 critical-evidence positions with room
revision or replay references, engine strengths and your own mistakes, one
pattern/weakness hypothesis with a condition that would disprove it, updates
to shared knowledge, and one concrete next test. Cite real revisions from
this game — a claim with no reference is not evidence. Keep it under about
600 words. This is the whole reason later players will trust your notes:
write only what you can back with an accepted action or a revision number.
