---
name: muju-time-awareness
description: Manage thinking and move submission while playing Muju Hono Tanka with a turn delay and personal time bank. Use before joining a timed room and during timed play through the Muju MCP.
---

# Play Muju with time awareness

Aim to play well with the time available. Occasional time trouble or flag losses
are part of play; perfect deadline reliability is not required. The server
reports state, clocks and bounded analysis, enforces rules, and records your
choices. You choose moves and how much time to spend. Expiry is a plain loss;
the server does not choose a rescue move or automatically end your turn.

## Prepare and read the clock

Read `muju_rules` and prepare before joining: White's clock starts when the second
player joins. Inspect the available tool schemas: at turn start use
`muju_observe({roomId, player:YOUR_SIDE, briefing:true})` when those options are
supported, otherwise `muju_observe({roomId})`. Read the board, any briefing, and
clock together. Each whole turn shares
one free delay across upkeep, placement and actions; then your personal bank
drains. Unused delay is discarded. For rapid, a 50-second turn uses 20 seconds of
the 600-second bank; a 20-second turn uses none.

At a snapshot, remaining time is `deadlineAtMs - serverNowMs`. Subtract locally
elapsed time using a monotonic timer when available, and allow for response age
and submission latency. Check `muju_clock({roomId})` after substantial thinking
or analysis, especially before beginning another expensive investigation. A
timestamp in context does not update during reasoning. Preview's `liveClock`,
`liveClockPressure` and `liveStaging` belong to the real game; its board is
hypothetical. A null clock means untimed.

## Choose a budget, then improve a candidate

1. Read the clock, `clockPressure` and briefing. Find a satisfactory legal batch
   early, including required upkeep/placement and normally `END_ACTION_PHASE`.
2. Read `muju_staged({roomId,token})`, then schedule that candidate with
   `muju_stage({roomId,token,requestId,expectedTurnNumber,expectedStageVersion,
   commitWhenRemainingMs,actions,fallbacks:[]})`. Use the status's outer `version`
   as `expectedStageVersion`. Reading or previewing a candidate does not stage it.
3. Choose a sustainable thinking budget. Usually aim inside the remaining delay;
   spend extra on home threats, consequential exchanges or difficult upkeep.
   Set a threshold consistent with that budget. **Five seconds remaining can
   consume almost the entire bank.** Remaining time includes both delay and bank;
   larger thresholds fire earlier. From a fresh snapshot, a budget of `T` more ms
   corresponds roughly to threshold `deadlineAtMs - serverNowMs - T`, with a
   margin for response age and scheduling latency. On an initial rapid turn,
   `610000` fires at about 20 seconds; `5000` waits about 625 seconds.
4. Improve within that budget: one focused threat check may suffice. Use
   `muju_analyze` when available, respecting proof scope and cutoffs. Replace with
   `muju_stage`, a new request ID and the current staging version if a better batch
   emerges. You may author up to three ordered complete fallback batches. The
   server tries only your batches, without selecting or repairing moves.
5. Commit early through `muju_play` using the latest board revision, or let your
   stage fire. A live handoff clears it. `muju_cancel_stage` cancels only pending
   work using the current stage version and turn number. Ending the turn stops
   your clock; spending all AP does not. No tool automatically adds end-turn.
6. Check the result. Successful live play/undo returns private `staging` status;
   `muju_staged` reads pending work and receipts, optionally by `stageId`.
   If a response is lost, retry the identical body/request ID. A stage's
   acknowledgement may be followed by execution or failure already; read status.
   All-illegal stages apply nothing and consume the stage while your clock runs.
   A stale replacement/cancellation requires a fresh private status read.

Estimate sustainable spending from your remaining bank and your own estimate of
remaining turns, retaining a reserve. For example, 300 seconds of bank spread
over 20 own turns allows 15 extra seconds per turn before reserving a margin.
Those 20 turns are a planning assumption, not a server fact. Reassess after slow
turns. In time trouble, narrow alternatives and previews and play the best
available candidate; do not wait for certainty or poll the clock continuously.

`UNDO` reverses your latest committed command within your turn when `canUndo`
allows it. It does not refund time, and cannot undo a completed turn. After
playing or undoing, recheck your pending stage against the returned board. A
revision change alone does not cancel it; legality is checked when it fires.
Use previews for hypothetical exploration; repeated live play/undo costs time.

During the opponent's turn, inspect useful analysis and prepare conditional
plans, then use `muju_wait_for_change`. If its schema supports them, add
`briefing:true`, your `player`, and optionally `sinceRevision` for updated briefings.
Opponent moves/undos can
invalidate earlier work. Act only when `activePlayer` is your seat. Never wait
on your running turn. Report a terminal result and stop.

## Thinking effort belongs to the client

Muju does not control model effort. If your client permits changing it, consider
less effort for routine turns or time trouble and more for consequential turns
with sufficient bank. Otherwise manage the scope of deliberation and number of
tool rounds. Effort labels are not wall-clock deadlines; don't assume you can
change them from a Muju tool or guarantee a response time by prompting.

## Read pace and understand scheduling limits

`clockPressure.players[YOUR_SIDE]` reports completed-turn samples, elapsed-time
and bank-spend totals/means, remaining bank, and a projection if historical pace
continues. Each turn contributes `max(0, elapsedMs - delayMs)` before averaging.
Partial play/undo adds elapsed time, not samples. Active and terminal turns are
excluded. `sampling` declares coverage; older rooms do not invent past history.
No samples means unavailable; zero mean spend means no observed drain. A finite
projection is bank divided by historical mean spend, **not turns left in the game**.
Use it alongside your own estimate of remaining turns and reserve needs.

Scheduling persists in the room service, independent of your connection. Due
stages resolve before incoming replacements/play; expiry wins at the deadline,
including on restart. Nothing is backdated to rescue an expired clock. The sweep
runs every 250 ms but is not a real-time guarantee. Invalid batches, omitted
end-turn, validation time, server load and downtime can still cause flag losses.
Public waits do not signal private staging failures; use `muju_staged`.

Read the [full staging protocol](references/staged-play.md), also available as
MCP resource `muju://skills/muju-time-awareness/staged-play`, for exact version,
retry, threshold, privacy and sampling semantics. On older hosts, inspect tool
discovery and use explicit `muju_play` if staging is unavailable.
