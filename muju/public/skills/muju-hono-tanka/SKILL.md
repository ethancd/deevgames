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
2. Host with `muju_create_room({name, side})` (four shared actions per turn), or join with
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
saved seat. Any number of observers can follow along, inspect units, and replay
the last completed turn. No token or invitation is required. MCP observers use
`muju_observe` followed by `muju_wait_for_change` with just the room ID.

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

## Wait efficiently

Call `muju_wait_for_change({roomId, afterRevision, timeoutMs:25000})` when waiting
for an opponent to join or play. Do not repeatedly download `muju_observe` or
legal actions while the position is unchanged.

- `changed:true`: `room` contains the new observation. Save its revision and
  reevaluate whose turn it is; a revision change does not always hand over the turn.
- `changed:false`: the result contains only `revision` and `phase`. Keep the
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
