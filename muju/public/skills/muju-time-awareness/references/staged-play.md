# Staged play and clock pressure

This protocol schedules only actions explicitly authored by the player. Flag-fall
is a plain loss. The server never chooses rescue moves, repairs a batch, adds
end-turn, or controls model reasoning effort. Inspect tool discovery when using
another host: both the host and any stdio bridge must support these operations.

## Stage, replace, cancel and inspect

Use `muju_staged({roomId, token})` to read your seat's `version` (initially 0),
`pending`, `latestReceipt`, current turn, clock and clock pressure. Only your seat
can see its plans. Then call `muju_stage`:

```json
{
  "roomId": "YOUR_ROOM_ID",
  "token": "YOUR_PRIVATE_SEAT_TOKEN",
  "requestId": "white-turn-1-candidate-1",
  "expectedTurnNumber": 1,
  "expectedStageVersion": 0,
  "commitWhenRemainingMs": 610000,
  "actions": [{ "type": "END_ACTION_PHASE" }],
  "fallbacks": []
}
```

This example ends a rapid turn about 20 seconds after it starts, when its initial
allowance is 630,000 ms. Choose your own legal actions; end-turn is legal only in
the action phase. Each batch contains 1–32 ordinary play actions. `fallbacks` may
contain up to three additional complete batches in your preferred order. MCP
accepts A1–J10 or `{x,y}` positions; returned pending actions use `{x,y}` and can
be passed back unchanged. There is no `STAGE` game action.

Only the active seat in a ready, timed, unfinished game may stage. The request
binds to that seat and `expectedTurnNumber`, without an `expectedRevision`.
Intervening live play and undo are allowed. There is one pending stage per seat;
replace it with another `muju_stage` using a new request ID and the current outer
`version` as `expectedStageVersion`.

To cancel, send this to `muju_cancel_stage`:

```json
{
  "roomId": "YOUR_ROOM_ID",
  "token": "YOUR_PRIVATE_SEAT_TOKEN",
  "requestId": "white-turn-1-cancel-1",
  "expectedTurnNumber": 1,
  "expectedStageVersion": 1
}
```

Cancelling pending work does not undo a committed move. Stage, replacement,
cancellation, firing, failure and cleanup each advance the seat's outer version;
it never resets at handoff. A pending stage's own `id` and `version` identify that
particular plan. `STAGE_VERSION_CONFLICT` means the state changed; read
`muju_staged` before deciding what to do next.

Successful mutations return an immutable `acknowledgement` with `requestId`,
`operation`, `stageId` and `acceptedVersion`, alongside fresh private status. The
stage may already have fired. Retry the identical request ID and normalized body
after a lost response: this returns the same acknowledgement and current status,
without rescheduling or executing twice. Reusing an accepted ID for another
staging operation returns `REQUEST_ID_REUSED`. IDs are scoped to seat and room;
the staging ledger is separate from ordinary play request IDs.

`muju_staged({roomId, token, stageId})` returns that pending stage or its durable
receipt as `requestedStage`. The status also includes the current pending stage
and latest receipt, which may be newer. Receipts have `status`, `resolvedAtMs`
and `revision`. Statuses are `executed`, `failed`, `replaced`, `cancelled`,
`turn_ended`, `game_ended`, or `expired`. An executed receipt includes the
zero-based `candidateIndex` (primary = 0) and actual `appliedActions`. Failed
candidates have private indexed error codes/messages. An execution receipt
remains a historical fact if you subsequently undo the command.

## Trigger and race semantics

Remaining time means **total time until flag-fall, including delay and bank**.
`triggerAtMs = clock.deadlineAtMs - commitWhenRemainingMs`. The threshold must be
a positive integer no greater than this turn's starting delay plus bank. Zero,
negative, fractional, non-finite and oversized values are rejected. A valid
threshold already reached fires in the staging request itself if time remains.

Five seconds remaining is emergency insurance: it can consume almost your entire
bank. To spend at most `T` more milliseconds from a fresh snapshot, choose roughly
`deadlineAtMs - serverNowMs - T` as the threshold, allowing for snapshot age and
scheduling latency. A larger threshold fires earlier. Commit earlier to conserve
time if you finish thinking sooner.

SQLite write transactions serialize scheduling, play, undo, replacement,
cancellation and expiry across processes sharing the same database. Under the
lock the server first adjudicates an expired clock, then resolves a due stage,
then handles the incoming operation. Before the trigger, the first accepted
replacement/cancellation wins its version comparison. At/after the trigger,
the due stage wins. A resulting stale request error does not roll back firing
or expiry. Identical successful retries remain readable even after game end.

At firing, the server checks each whole batch against the real current board
using ordinary legality, replay and undo rules. It executes the first legal batch
in your order; failed candidates leave no partial state or replay frames. If all
are illegal, the stage is consumed with `failed`, nothing is applied, the public
revision stays unchanged, and your clock continues. No candidate is generated,
reordered, repaired or extended.

`END_ACTION_PHASE` is optional. Spending all AP or executing a partial batch does
not stop the clock. `UNDO` and upkeep preferences retain their ordinary send-alone
restrictions. A full batch cannot enter the opponent's turn. An immediate home
checkmate cancels its queued tail exactly as in live play; receipts and public
history contain only the executed prefix. A staged partial command is one normal
undo step. Live partial play/undo leaves a stage pending; inspect and replace it
if it no longer reflects your intention. Live handoff or any result clears it.

## Persistence and privacy

An indexed room-service sweep checks due work every 250 ms, and room operations
also settle it. No MCP connection or player process needs to remain connected.
This is not a real-time scheduling guarantee: validation, load and downtime may
delay firing. A stage must pass validation before the real deadline. Expiry wins
at the exact deadline, including if validation itself reaches it.

On restart or late wakeup, the server uses the actual time. If expired, it records
the normal loss and an `expired` receipt; it never backdates moves. If the trigger
is due and time remains, it validates and fires now, charging elapsed time through
validation. Future stages keep their absolute trigger. Receipts and retry
acknowledgements persist for the room's lifetime, independently of the bounded
public command history. Scheduling does not reserve time or guarantee against flagging.

Pending actions, fallback order, thresholds, stage IDs and failure receipts are
private. Public observations, lobby summaries, history, resources and waits do
not include them. Staging changes and failures do not change public board
revisions or wake public waits. Executed moves and timeout results publish through
normal history, replay and change notifications. Authenticated timed play/undo,
restore and HTTP room reads include only that seat's `staging` status. MCP preview
separates real `liveClock`, `liveClockPressure` and `liveStaging` from its
hypothetical room. Use `muju_staged` for private outcomes; public waits cannot
signal an all-illegal failure.

HTTP equivalents (Bearer seat token required):

| Operation | Endpoint |
| --- | --- |
| Stage/replace | `POST /api/muju/rooms/:id/stage` |
| Cancel | `POST /api/muju/rooms/:id/stage/cancel` |
| Inspect | `GET /api/muju/rooms/:id/stage?stageId=OPTIONAL_ID` |

HTTP bodies use the same fields without `roomId`/`token`, and the existing HTTP
play schema's `{x,y}` coordinates. The host's 64 KiB JSON body limit still applies.
The stdio bridge forwards these operations to the same persistent HTTP host.

## Clock pressure: facts and a conditional projection

`clockPressure` accompanies timed observations, legal actions, play results,
briefings, changed/unchanged waits, and `muju_clock`. It is null for untimed rooms.
Pace is projected freshly with the clock, outside the analysis revision cache.

`sampling` declares the window (`all_tracked_completed_turns`), tracking start
timestamp/revision, whether coverage is complete from game start, and exclusion
of terminal turns. Each `players.white` / `players.black` entry contains:

- `completedTurns`, `totalElapsedMs`, `meanElapsedMs`.
- `totalBankSpentMs`, `meanBankSpentMs`, `remainingBankMs`.
- `firstTurnStartedAtMs`, `lastTurnCompletedAtMs` (null before any samples).
- `projection.status` and nullable `projection.turnsCovered`.

Each completed turn contributes `max(0, turnElapsedMs - delayMs)` to bank spend;
those values are then averaged. With a 2-second delay, turns of 1 and 4 seconds
spend 0 and 2 seconds, giving a mean spend of 1 second. Subtracting delay from
their 2.5-second mean duration would incorrectly give 0.5 seconds.

Only handoffs that leave the game playing contribute samples. All time across
upkeep, placement, partial commands, undo, previews and retries belongs to that
one full turn. Active turns and turns ending in any game result—including a
terminal end-turn, resignation or timeout—are excluded. Ordinary live turns use
the accepted command time; staged turns include their validation time. Opponents
do not pay for outgoing engine processing.

`remainingBankMs / meanBankSpentMs` is a projection **if historical pace
continues**, never the number of turns left in the game. No samples gives
`status:"no_samples", turnsCovered:null`; zero mean spend gives
`status:"no_observed_drain", turnsCovered:null`. Otherwise status is `estimated`.
There is no Infinity/NaN and no server judgment that a player must hurry.

For older rooms without timing aggregates, `completeFromGameStart:false` marks
limited coverage. Earlier turns and the turn already running when tracking
begins are skipped; samples start with the next newly started full turn. Current
bank balances remain authoritative. Existing timing history survives restart.
The window is cumulative, not a rolling trend or a prediction of game length.
