# Staged play proposal — not implemented

Keep rules and observations separate from player decisions. Flag-fall remains
a plain loss. Analysis reports evidence and scope; the server never selects a
default move, auto-ends a turn, or changes the player's model effort.

## Explicitly schedule a player decision

A future authenticated staging operation could accept this conceptual payload
(not a current `muju_play` action):

```json
{
  "type": "STAGE",
  "actions": [{ "type": "END_ACTION_PHASE" }],
  "commitWhenRemainingMs": 5000
}
```

Here remaining time means total time until flag-fall, including remaining delay
and bank. Scheduling at five seconds remaining spends nearly the whole bank if
the player does nothing else. It is emergency insurance, not a sustainable
routine turn budget. A player who wants to conserve bank must commit sooner or
choose a larger remaining-time threshold consistent with their turn budget.

- Bind a stage to its authenticated seat and the current full turn. Clear it at
  handoff or game completion; it must never execute in a later turn.
- Make the pending stage replaceable and cancellable until it fires. Serialize
  firing, replacement, cancellation, play and undo. Acknowledgements must make
  clear which operation won a race; already executed actions are not cancelled.
- Check request shape and authority at staging; validate the entire batch
  atomically against the real current position at fire time. Do not require the
  original board revision still to match: the player may have played or undone
  actions. Recheck seat, turn and deadline. An illegal batch applies nothing;
  consume the failed stage, report why, and leave the clock running.
- Optionally accept an ordered list of player-authored fallback batches. Try
  them in the specified order and execute only the first legal whole batch.
  Do not generate, repair, rank or append actions on the player's behalf.
- Allow batches with or without `END_ACTION_PHASE`. Without it, successful
  execution can leave the turn open and the player can still flag.
- Undo remains available under ordinary rules before firing. It changes the
  board against which the pending stage will be checked. Replacing a pending
  stage is distinct from undoing an already committed move.
- Persist pending stages and report their status privately to the seat, with
  idempotent requests and observable execution/failure receipts. Public history
  reveals actions when executed, not the player's pending plan.
- Specify restart/late-wakeup behavior: adjudicate an expired deadline as a
  loss, never backdate a staged move to rescue it. Scheduling reduces timeout
  risk; invalid batches, omitted end-turn and server downtime still can lose.

With this capability, the playing rhythm becomes: read clock and briefing,
stage a satisfactory turn early, analyze within a chosen budget, replace the
stage if a better turn emerges, then commit explicitly or let it fire. After
live play or undo, check that the pending batch still reflects your intention.

## Pace facts, not coaching labels

A proposed `clockPressure` observation can expose per-seat completed-turn sample
count, total/mean elapsed milliseconds, mean bank spend, and remaining bank.
Compute mean bank spend as the mean of `max(0, turnElapsedMs - delayMs)`;
`max(0, meanTurnElapsedMs - delayMs)` is not equivalent.

`bankRemainingMs / meanBankSpentMs` is estimated turns covered **if historical
pace continues**, not a factual count of turns left in the game. Label it as a
projection and expose the sample/window used. With no completed-turn samples,
return unavailable; with zero mean spend, represent no observed drain explicitly
rather than dividing by zero. Don't invent past timing for older rooms. Partial
commands and undo are not new turn samples; include all time spent in a completed
turn. The player decides whether the projection calls for faster play.

Model effort remains a client capability. A client may let the player request
lower effort next turn; Muju should remain indifferent to that choice.
