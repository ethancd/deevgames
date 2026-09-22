Implement the Muju MCP time-control wishlist: player-authored staged commits and historical clock-pressure statistics. Build working server, HTTP and stdio MCP support, tests, and updated agent documentation.

Start by reading the actual checkout and these references:
- muju/public/skills/muju-time-awareness/SKILL.md
- muju/public/skills/muju-time-awareness/references/staged-play.md
- muju/server/{rooms,schema,http,mcp,stdio,observation}.ts
- muju/src/online/timeControl.ts and tests/server/clocks.test.ts

Fetch current remote state and preserve unrelated local edits. Inspect which analysis/briefing capabilities actually exist in the target branch; don't assume every local feature is deployed. Make routine implementation choices and complete the work without stopping at a design proposal.

Design principle: the server reports facts and enforces rules; the player chooses moves and time expenditure. Flag-fall remains a plain loss. No server-selected rescue move, automatic end-turn, move repair, or model-effort control. Scheduled execution is allowed only because the player explicitly selected the actions and trigger.

1. Player-authored staging

Expose authenticated stage/replace, cancel, and status operations through HTTP and both MCP transports. Reuse the existing action schema and seat authorization. A conceptual request is {actions:[...], commitWhenRemainingMs:5000}; an ordered list of complete player-authored fallback batches should also be supported. Choose and document the exact API.

Maintain at most one pending stage per seat/current full turn. Return an identifiable stage/version, acknowledged trigger, and status. Let the player replace or cancel it until execution. Bind it to the seat and full turn, never to a later turn. Protect against stale replacements/cancellations and make identical network retries idempotent.

Remaining time means total time until flag-fall, including remaining delay and bank. Five seconds remaining is emergency insurance and can consume nearly the whole bank. Document how to choose a threshold for a smaller turn budget. Define behavior for invalid thresholds and requests whose trigger is already due. Expiry wins at the exact deadline.

Validate request shape, seat, and turn when staging. At execution, validate each whole candidate atomically against the current real board and ordinary engine rules. A changed board revision alone must not prevent execution: intervening plays and undo are allowed. Try candidates in the player's order; execute only the first legal whole batch. If none is legal, consume the stage, record failure, apply nothing, and let the clock continue. Never regenerate, repair, reorder, or append actions.

END_ACTION_PHASE is optional. Without it, execution can leave the clock running. Preserve ordinary immediate-victory and undo behavior. Pending replacement is distinct from undoing an already committed move; every successful live play/undo should return or make accessible the seat's current staging status.

2. Scheduling, persistence, and visibility

Scheduling belongs to the persistent room service, not a request, MCP connection, or an LLM process. Persist pending stages and execution/failure receipts across restart. Serialize firing, replacement, cancellation, play, undo, and expiry, preventing double execution and cross-turn leakage. Resolve races with deterministic ordering and explicit outcomes.

On restart or late wakeup, never backdate a move to rescue an expired clock. If time remains and a trigger is due, apply the documented execution rules. Clear obsolete stages at turn handoff or any game result. Apply executed moves through the canonical engine/history/replay path.

Pending actions, fallback order, and thresholds are private to the authenticated seat. Public observers/opponents see moves only when executed. Do not leak plans through observations, errors, logs, public resources, or wait responses. Provide private pending/outcome reads without making ordinary private staging updates spuriously change the public board revision. Actual executed actions and flag-fall should notify observers normally.

3. Historical pace statistics

Add compact clockPressure data to clock-bearing observations and muju_clock, and to briefing/wait responses where supported. Expose per-seat completed-turn sample count, elapsed-time totals/mean, bank-spend totals/mean, remaining bank, and the declared sampling window. Keep clock data fresh without requiring a board revision change; preserve preview/live-clock separation.

Compute per-turn bank spend as max(0, turnElapsedMs - delayMs), then average those values. Do not subtract the delay from average elapsed time: these differ. Undo and partial actions count toward elapsed time, not additional turn samples. Exclude unfinished turns from completed-turn averages and document treatment of terminal turns.

Estimate turns covered as remainingBankMs / meanBankSpentMs, explicitly labeled as a projection if historical pace continues, not the number of turns left in the game. No samples means unavailable; zero mean spend means no observed drain, represented without Infinity/NaN. Preserve old-room compatibility and never fabricate missing timing history. The server reports measurements and projections; the player decides whether to hurry.

4. Verification and documentation

Use deterministic clock tests for trigger/deadline boundaries, replacement/cancellation races, ordered fallbacks, atomic illegality, live play/undo between stage and fire, omitted end-turn, terminal/cross-turn cleanup, retries, restart before/after deadline, authentication, and private-plan isolation. Test pace arithmetic, zero/no samples, old rooms, partial commands, and undo. Verify HTTP and stdio interoperability plus unchanged ordinary play and timeout behavior.

Update MCP discovery descriptions, rules metadata, the time-awareness skill, design reference, and ONLINE.md to describe the implemented protocol. Teach: read clock and briefing when available; stage a satisfactory candidate early; choose a sustainable thinking budget; improve/replace it; commit earlier or let it fire; check outcomes. Keep effort settings a client concern and explain why staging reduces flag risk without guaranteeing against it.

Run relevant tests, server typechecking, and the production build. Report the implemented API, exact race/restart semantics, checks performed, and remaining limitations. Keep the change focused on these time-control features.
