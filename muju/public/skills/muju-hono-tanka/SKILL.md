---
name: muju-hono-tanka
description: Play or spectate Muju Hono Tanka through its multiplayer MCP. Use for hosting a room, joining a human or agent opponent, planning legal moves, and continuing a shared game.
---

# Muju Hono Tanka

Browser game: https://deevgames-muju.onrender.com/muju/

MCP endpoint: https://deevgames-muju.onrender.com/mcp

This skill: https://deevgames-muju.onrender.com/SKILL.md

Two humans, two agents, or a human and an agent can share one authoritative game
from different computers. White moves first. Follow the user's choice of opponent
and side; create a new room only when hosting a new game is intended.

## Connect

Add the MCP endpoint to your client's remote servers using **Streamable HTTP**.
There is no service-wide API key or OAuth login. Each occupied seat has its own
private token, returned when creating or joining a room.

If your client only launches stdio processes, use the bridge described in the
[host documentation](https://github.com/ethancd/deevgames/blob/codex/muju-online-deploy/muju/ONLINE.md#connect-an-llm).
Set `MUJU_SERVER_URL=https://deevgames-muju.onrender.com`; the bridge connects to the
same public rooms. For another Muju host, replace the origin in these URLs.

An agent with HTTP access can also speak MCP directly. POST JSON-RPC to `/mcp`
with `Content-Type: application/json` and
`Accept: application/json, text/event-stream`. Initialize first:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"muju-player","version":"1"}}}
```

Use the returned protocol version in the `MCP-Protocol-Version` request header.
Send `notifications/initialized`, then `tools/list` to discover current schemas.
This server is stateless and does not require an `Mcp-Session-Id`. A tool call is:

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"muju_rules","arguments":{}}}
```

Tool results include `structuredContent` and an equivalent JSON text result;
consume one copy. Check `isError` before using a result.

## Start or resume

1. Read `muju_rules` for the current rules and unit catalogue. Costs and balance
   can change; use the live catalogue. Rules are also the resource `muju://rules`.
2. Host with `muju_create_room({name, side, timeControl?, blackCrystalHandicap?})` (four shared actions per turn), or join with
   `muju_join_room({roomId, inviteCode, name})`. An invitation URL contains the
   `room` query parameter and the `invite` fragment. Use its host for your MCP
   connection. Invitations claim the remaining seat once.
3. Retain the returned `credentials` (`roomId`, `player`, `token`, `serverUrl`) privately for
   reconnects. Give the opponent only the separate `invitation`, never your seat
   token. When resuming, reuse your existing credentials rather than joining again.
   Anyone with the room ID can spectate through `muju_observe`; moving needs a token.
4. Start from the room observation returned by create/join/play, or call
   `muju_observe({roomId})` after reconnecting. Wait for `ready:true` before playing.

To transfer your seat to your phone or another browser, open **Play online →
Restore a seat** and paste the credentials JSON. The browser also exports it under
**Private reconnect details → Copy credentials**. Restoration verifies the token
and side without consuming an invitation, changing the game, or disconnecting
the original device. Coordinate use when two clients share a seat.

To let people watch two LLMs, share the `watchUrl` returned by create, join, or
`muju_observe`. They enter as read-only observers, including on browsers with a
saved seat. People can also open **Play online → Active games** and tap **Watch**
on any listed game without a link. Active rooms and player names are public; seat
credentials still control who can play. Bookmark `/muju/?online=1` for the lobby.
Any number of observers can follow along, inspect units, and replay
the last completed turn. No token or invitation is required. MCP observers use
`muju_observe` followed by `muju_wait_for_change` with just the room ID.

## Black crystal handicap

When requested, pass `blackCrystalHandicap` as a whole number from **1 to 20**
when creating a room. For example,
`muju_create_room({name:"Host", side:"white", blackCrystalHandicap:8})` gives
Black exactly 8 starting crystals, regardless of which side the host controls.
Omit the option or use `0` for a standard game. It is fixed at creation and cannot
be changed in an existing room. White still starts with 0 crystals and moves first.

Black skips Place & Promote on turn 1 with **1 or 2** crystals, since the cheapest
purchase costs 3. With **3–20**, Black begins its first turn in Place & Promote;
normal costs, spawn rules and promotion restrictions apply. A 3-crystal grant
permits a cheap purchase; promoting an existing tier-1 unit costs 4. Both players
retain four actions. The grant is not mined income and is not awarded again.
Read `blackCrystalHandicap`, each player's current `resources`, and the actual
`turn.phase` in observations; use legal actions instead of assuming placement is
available. Saved games, undo and reconnects retain the grant and current balance.

## Play on the clock

Before joining a timed room, read `muju_time_awareness` or MCP resource
`muju://skills/muju-time-awareness` for practical thinking and bank management.
The same [time-awareness skill](/muju/skills/muju-time-awareness/SKILL.md) is served at
`/muju/skills/muju-time-awareness/SKILL.md`. It explains `muju_stage`,
`muju_cancel_stage`, `muju_staged` and historical clock pressure. Inspect discovery
when connecting to an older host before assuming these operations are supported.

Time control is optional and fixed at room creation. Use `timeControl:"blitz"`
(10s delay / 2min bank), `"rapid"` (30s / 10min), `"classical"` (60s / 30min), or
`{delaySeconds:30,bankSeconds:600}`. Omit or use null for untimed. Presets target
roughly 10 minutes, 45 minutes and 2 hours; actual duration depends on turn count
and time used. Custom limits: 0–600 seconds of delay, 1–14,400 seconds of bank.

Each player has a separate bank carried across their own turns. Each full turn
gets a fresh free delay, then that player's bank drains; unused delay is discarded.
Upkeep, placement and all actions share one delay. Partial plays, undo, previews,
reads and retries never reset it. Running out loses with `victoryReason:"timeout"`.

Read the rules and prepare **before joining**: White's clock starts when the second
player joins. It keeps running through thinking, waiting, disconnects, replay and
host downtime. Observations, legal actions and play results include `clock` with
`serverNowMs`, `runningPlayer`, `deadlineAtMs`, `delayRemainingMs` and separate
`bankRemainingMs.white` / `.black`. Timestamps are server Unix milliseconds.
`deadlineAtMs - serverNowMs` is time left at the snapshot; subtract local elapsed
time and leave a network margin. `muju_clock({roomId})` provides a small fresh read
without the board. Clock ticks do not change revision. Untimed clocks are null.

`clockPressure` reports completed-turn timing samples, mean bank spend after each
turn's delay, and the projection if historical pace continues. That projection
is not the number of turns left in the game. Active/terminal turns are excluded;
missing old history and zero/no samples are explicit.

Stage your own early candidate through `muju_stage`, using the turn number and
outer `version` from private `muju_staged` status. Choose a sustainable threshold,
improve/replace, commit early or let it fire, and check the receipt. Remaining time
means total delay plus bank: a five-second threshold can consume nearly the entire
bank. Larger thresholds fire earlier. The server tests your whole primary batch
and ordered fallbacks at firing against the current board, including intervening
play/undo. All-illegal stages apply nothing and leave the clock running. It never
repairs moves or appends end-turn. Plans and receipts are private; public waits do
not report private failures. Stages persist across disconnects and restart, but
expiry wins at the deadline and moves are never backdated. Model effort remains
a client concern.

Do not wait on your own running turn. End with `END_ACTION_PHASE` before the
deadline, even when no AP remain. Reduce previews when short on time; prefer a
legal atomic turn batch. Preview separates `liveClock`, `liveClockPressure` and
`liveStaging` for the real game,
while its `room` is hypothetical. Late play/preview returns `isError:true`,
`code:"TIME_EXPIRED"` and the actual final `room`; no requested actions run.
Timeouts finish unattended games and wake waits with a new revision and an event
whose `actions:[]` and `result:{winner,reason:"timeout"}` explain the change.
Report the winner and stop. Clocks stop on any game result; undo never refunds time.

## Take a turn

- An invader that cannot be removed by any legal next-turn reply wins immediately
  as `home-checkmate`. Upkeep choices, promotions, movement, blocker clearing and
  combined damage count; new purchases are blocked by home occupation. Three
  attacks against the same corner occupier require at least five actions, so only
  two attacks can land in a four-action reply. An inconclusive proof preserves the
  ordinary reply turn. Read the returned result: immediate checkmate cancels the
  remaining queued actions in a batch, including `END_ACTION_PHASE`.

- Read the room's `actionsPerTurn` (always 4) and `turn.actionsRemaining`; use that
  budget for planning and enemy reach. Both seats use four actions.
  Ten consecutive completed player turns without an enemy attack kill draw;
  income, movement, buying, promotion and upkeep losses do not reset that clock.
- Read `nextStep`, `turn.currentPlayer`, `turn.phase`, `upkeepPending`, resources,
  unit IDs and `revision`. Plan only for the seat you control.
- Query `muju_legal_actions({roomId, unitId?, type?, offset?, limit?})` for legal
  choices and movement/combat outcomes. Narrow by unit or action type and follow
  `nextOffset` if needed. Instance IDs differ from catalogue IDs like `fire_1`.
- Preview useful sequences with `muju_preview`, then commit with `muju_play`.
  Both take `roomId`, `token`, `expectedRevision`, `requestId`, and `actions`.
  Each play uses the latest observed revision and a new request ID of 8–100
  characters. Batches of up to 32 actions are atomic and cannot cross into the
  opponent's turn. Preview results are hypothetical, with no reservation.
- MCP positions accept `A1`–`J10` or zero-indexed `{x,y}`. A1 is top left for
  both players; the board does not rotate. `END_ACTION_PHASE` hands over the turn.
- Affordable upkeep is automatic by default. If upkeep is pending, submit
  `PAY_UPKEEP` with all tier 1 unit IDs plus an affordable subset of higher tiers.
  Legal actions show one affordable set, not every possible set.
- A stale revision means observe again and replan. If a play response is lost,
  retry the **identical request ID and body** to avoid applying it twice. A changed
  plan needs a new ID. `UNDO` restores your previous command within this turn
  when `canUndo` is true; `RESIGN` concedes your seat.

Example play arguments, replacing the placeholders with current values:

```json
{
  "roomId": "ROOM_ID",
  "token": "PRIVATE_SEAT_TOKEN",
  "expectedRevision": 1,
  "requestId": "white-opening-001",
  "actions": [
    { "type": "MOVE", "unitId": "UNIT_ID", "to": "C1" },
    { "type": "END_ACTION_PHASE" }
  ]
}
```

## Read a turn in one call

Use `muju_observe({roomId, player:YOUR_SIDE, briefing:true})` at turn start.
Every observation (including create, join, play and changed waits) includes an
`analysis` headline. The optional `briefing` adds miner depletion, actual-board
matchups, both deployment zones, verified threat/opportunity summaries and
mobility warnings. Usually this is enough to choose a plan. Instance IDs in
`next` arguments are ready to use; do not substitute catalogue IDs.

Read the headline's economy as named checkpoints:

- `treasury`: current bank; `harvest`: the next take from current deposits.
- `harvestTrend`: up to three future own harvests under the stated forecast.
- `upkeep`: retained army's recurring liability. `next` names the first projected
  checkpoint and resulting bank, such as `harvest:16` or `upkeep:7`.
- `shortfallIn`: completed own harvests before the first unpaid upkeep; zero
  means an immediate decision. Null means no shortfall was reached **before
  `forecastStop`**, not an indefinitely sustainable army. The projection stops
  at the first player's insolvency, game termination (including the draw clock),
  or horizon. It never keeps an unaffordable army alive.
- Deployment pairs are `[spawnableSquareCount, anyAnchorBlockedByEnemy]`.
  Draw pairs are `[quietPlayerTurns, limit]`.
- Urgent `captureNow`/`threatNow` flags use the current turn; `captureNextTurn`/
  `threatNextTurn` assume the current player ends now with the engine.

Briefing notation: squares are comma lists; miners show
`id@square takeN/leftN/harvestsN/upkeepN`. Matchup rows and columns both follow
`definitions`; compare `attack[row][column]` with the defender's remaining
defense in the observation. A `blackAttackOverride`, if present, replaces that
matrix for Black. Threat lines use `attacker → attackSquare, moveAP+attackAP,
crystalCost, damage vs defense, outcome, retreat N`; `N` counts legal retreat
destinations, **not safe destinations**. `+fire_1@F5` identifies a proposed
purchase. Full lines also contain its deterministic instance ID.

## Focus expensive thinking

`muju_analyze` is public and read-only. Send `roomId`, `expectedRevision`, your
`player` perspective, and multiple `topics` in one call. Topics are `economy`,
`units`, `matchups`, `spawn`, `reach`, `mobility`, `threats`, `opportunities`,
`exchange`, `checkmate`, `survival`, and `reply`. Batch `targets.unitIds`,
`targets.squares`, or rectangular `targets.regions` (`from`, `to`).

- Before exposing a valuable unit, query `threats` on its instance ID with
  `hypotheticalActions` containing the **whole proposed turn**, normally through
  `END_ACTION_PHASE`. Include purchases and promotions (the default), set
  `deep:true` for combinations, and read each lethal line's `exposure` reply.
  `exposure.replies` checks each participating attacker, assuming the attacking
  side ends on those final squares without withdrawing. Lack of a recapture
  witness does not make an attacker safe.
- Before a complex trade, batch `exchange` and `reply` with that sequence and a
  friendly target ID. `reply` searches the **opponent of your perspective**.
  Objectives are `killTarget` (each named target, or all friendly units when omitted), `capturedValue`, `occupyHome`,
  or `blockPurchases`. It is one ply and generally best-found, not minimax.
- Before a home attempt, query `checkmate` with the proposed sequence. It exposes
  the same bounded prover used by the engine, including rescue categories.
  A rescue witness starts **before defender upkeep**. If upkeep was automatic,
  undo that payment in its own command before previewing the reply. Otherwise
  enable upkeep review before handoff. Do not pay upkeep twice. Rare long replies
  use `witnessCommands`, each at most 32 actions, instead of one witness.
- `survival` on empty squares compares independent catalogue defenders and gives
  bounds on minimum surviving defense. Exact minima appear only when the bounds
  coincide. `targets.defenders` accepts `square`, `owner`, `definitionId`, optional
  `unitId` to relocate/retype that instance, and `damageTaken` below base defense.
  It never overwrites another piece. These insertions cost nothing and are
  **conditional structural cases**, not executable purchases. Use legal
  `hypotheticalActions` when testing a plan you intend to play.
- Economy `detail:"full"` includes independent miner relocation routes and
  short-horizon incremental harvest. These destinations are not tactically
  checked. Mobility's blocker-removal hints are also independent what-ifs.

Every analysis identifies source revision, perspective, turn/phase, `stateKind`,
hypothetical assumptions, `search`, and `next`. An enemy-turn model explicitly
ends the current player's turn with the engine, credits that outgoing harvest,
then applies incoming upkeep, healing and AP reset. It never credits the incoming
player's future harvest. Unaffordable/reviewed outgoing upkeep uses the engine's
default keep-set; supply your own `PAY_UPKEEP` in the proposed sequence to override
it. Generic searches retain automatic upkeep; only the home prover covers
voluntary alternatives to an automatic payment.

`hypotheticalActions` use the play schema and must remain within one player's
turn; invalid batches fail atomically. `UNDO` and upkeep preferences require the
room preview tool. `stateKind:"opponentNextTurn"` explicitly ends the resulting
state's active turn; don't add it when your hypothetical sequence already hands
off to the attacker you want to inspect.

Treat `proven_possible` as an engine witness, `proven_impossible` as a proof only
within its declared scope and timing model, and `unknown` as unresolved. A failed
bounded search never proves safety. Costs are `best_found` unless optimality is
proved. Full/named-target witnesses are exact action arrays usable by preview or
play **from their stated model state**. They do not cross a turn boundary;
`setupActions` describe the separate turn transition that precedes a reply.

Default focused work is 2,000 nodes and a cooperative 150 ms deadline shared
across topics, targets and replies. `searchBudget` allows up to 20,000 nodes and
750 ms. `limit` defaults to three alternatives per target; `detail` is `headline`,
`standard`, or `full`. Read subsearch cutoffs and output omissions; focus fewer
targets rather than repeatedly requesting the whole board. No analysis pauses or
reserves your clock. Commit only through `muju_play`, then use its authoritative
returned state.

## Wait efficiently

Call `muju_wait_for_change({roomId, afterRevision, timeoutMs:25000})` when waiting
for an opponent to join or play. Do not repeatedly download `muju_observe` or
legal actions while the position is unchanged.

Add `briefing:true`, `player:YOUR_SIDE`, and `sinceRevision:YOUR_LAST_BRIEFING_REVISION`
to receive changed analysis sections with the next observation. Replace returned
arrays instead of appending them. A compatible cached baseline is required;
`diff.mode:"full"` explicitly means the baseline was unavailable. Removed witnesses
are not proof of safety. Unchanged waits stay tiny and contain no repeated briefing.

- `changed:true`: `room` contains the new observation. Save its revision and
  reevaluate whose turn it is; a revision change does not always hand over the turn.
- `changed:false`: the result contains `revision`, `phase` and a fresh `clock` for timed games. Keep the
  previous board and wait again if play is still active and the user wants to continue.
- Stop when the observation's `status` or the wait result's `phase` is `victory`.
  Report the winner or draw. Also stop if the user ends the session.
- On connection failures, back off before retrying. Respect HTTP `Retry-After`
  when rate limited. Do not continuously retry invalid credentials or invitations.

The host runs the rules engine and stores rooms. It does not run or pay for your
LLM inference; model usage belongs to the agent's own client or account.

## Undo and move notifications

Send `actions:[{"type":"UNDO"}]` alone to `muju_play`, with your token, the
latest revision and a new request ID. `canUndo` means the current player can
reverse their latest command, including placement, promotion and starting actions.
An atomic batch is one undo step. Turn end and game completion clear undo history.
The incoming player's positive automatic upkeep payment creates a new first undo
step. Undo later commands first, then undo upkeep to refund it and reopen
`PAY_UPKEEP` before healing. Choose a new affordable keep-set containing every tier
1 unit. This does not reverse the opponent's completed turn or income.

`muju_wait_for_change` is the supported way to detect human moves. Use the latest
revision as `afterRevision`; moves between calls return immediately. Changed
results include `events` (revision, player, actions, including UNDO),
`eventsComplete` (false if history was truncated), and the authoritative `room`.
Joining may have no action event. Play only when `room.activePlayer` equals your
seat; moves and undos within a human turn do not transfer control. Update the
revision after each result and keep waiting as needed. The client must keep
issuing bounded waits; the server cannot wake an idle LLM session by itself.

## Read the full game score

Call `muju_history({roomId, limit:50})` for the latest recorded events, oldest
first. No seat token is needed. The same score is available under **History** in
the room, including to observers and after the game ends. Records persist across
server restarts and are separate from the rolling 100-command notification log.

- Use `after:0` to start at the beginning, then `after` the last returned
  `sequence` while `hasLater` is true. To go backward, use `before` the first
  returned sequence while `hasEarlier` is true. Do not combine both cursors.
- Each entry identifies its player, turn, revision, timestamp, notation, and
  structured outcome. Purchases/promotions include cost and resulting bank;
  moves include route and AP; attacks include damage/defense and capture;
  upkeep includes automatic/chosen payment, kept units and releases; mining
  includes every piece's take, reserve change and resulting bank.
- Notation: `🔥1 B1→C1`, `🔥1 C1×C2`, `+🌱1@B3`, `↑🔥2@C1`.
  Attacks do not move the attacker. `#` means the server adjudicated home
  checkmate. There are no coaching judgments or invented moves.
- Undone commands are omitted by default. `includeUndone:true` exposes them
  with `undoneAtRevision`. After an UNDO notification, refresh the score for
  the affected turn; do not just append entries after your previous cursor.
- `recordingStart.complete:false` means this room predates detailed history.
  Earlier missing moves cannot be reconstructed. Preserve that qualification
  when writing a game review. Routine phase-ending commands are omitted.

Human review: **History → Analyze game** opens the recorded positions on the
board. Clicking a notation entry jumps to that event. Review can step within a
multi-AP move or across full player turns. **Explore from here** lets the human
control both sides in a private variation; it never submits actions to the room.
The game modes page also has a standalone **Analysis board**.
