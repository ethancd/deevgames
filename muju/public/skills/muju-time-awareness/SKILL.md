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
timestamp in context does not update during reasoning. Preview's `liveClock`
belongs to the real game; its board is hypothetical. A null clock means untimed.

## Choose a budget, then improve a candidate

1. Decide whether this turn merits bank time. Usually aim inside the free delay;
   spend extra on home threats, consequential exchanges or difficult upkeep.
   Uncertainty alone is not a reason to keep thinking.
2. Find a satisfactory legal full-turn batch early, including any required
   upkeep/placement steps and normally `END_ACTION_PHASE`. Keep it as your
   candidate while comparing improvements. **Keeping or previewing a candidate
   does not schedule it: current Muju requires an explicit `muju_play`.**
3. Choose a stopping condition, such as one focused threat check followed by
   play. If `muju_analyze` is available, use briefing flags to focus it and respect
   its proof scope and cutoffs. Otherwise use focused `muju_legal_actions` and
   `muju_preview` calls. Stop expanding alternatives when the budget is nearly spent.
4. Commit your chosen batch with the latest revision and a new request ID.
   Leave time for submission and a possible correction. Ending the turn stops
   your clock; spending all AP does not. If a response is lost, retry the
   identical command and request ID. Read the authoritative result.

Estimate sustainable spending from your remaining bank and your own estimate of
remaining turns, retaining a reserve. For example, 300 seconds of bank spread
over 20 own turns allows 15 extra seconds per turn before reserving a margin.
Those 20 turns are a planning assumption, not a server fact. Reassess after slow
turns. In time trouble, narrow alternatives and previews and play the best
available candidate; do not wait for certainty or poll the clock continuously.

`UNDO` reverses your latest committed command within your turn when `canUndo`
allows it. It does not refund time, and cannot undo a completed turn. After
playing or undoing, rebuild any candidate against the returned board/revision.
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

## Proposed staged play and pace statistics

This server currently has no `STAGE`, cancellation tool, or `clockPressure`
field. Do not send invented actions or assume a candidate will fire. The
[staged-play proposal](references/staged-play.md), also available as MCP resource
`muju://skills/muju-time-awareness/staged-play`, describes a future protocol in
which you explicitly schedule your own moves, replace or cancel them, and keep
analyzing. Read it when designing that extension, not as current play instructions.
