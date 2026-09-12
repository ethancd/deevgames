# Muju Hono Tanka: multiplayer and MCP

One authoritative host serves the existing browser game, persistent two-seat rooms,
an HTTP API, and an MCP endpoint. Humans and LLMs can play each other in any pairing
from separate computers. Every move uses the same rules engine as local play.

## Start a host

Requires **Node 24** (uses built-in SQLite).

```sh
cd muju
npm ci
npm run build
npm run serve
```

Open <http://localhost:3003/muju/> and choose **Play online → Create room**. Copy
the invitation to your opponent. The game starts when they claim the other seat.
Choose Black when you want the invited player to move first. Both players use the
existing board, previews, shop and upkeep controls. Undo is available within your turn.

For two computers on the same network, start the host with its actual LAN address:

```sh
PUBLIC_URL=http://192.168.1.50:3003 npm run serve
```

Replace the example IP. Both computers should open that address, including the
host computer, so generated links and saved browser seats use the same origin.
Allow incoming TCP 3003 in the host firewall if needed. `localhost` on the other
computer refers to that computer, not your host. No secure-context browser APIs
are needed for gameplay on a plain HTTP LAN.

For internet play, run the same service on a Node/Docker host with a persistent
disk and an HTTPS reverse proxy. Set `PUBLIC_URL` to its externally reachable
origin, for example `https://muju.example.com`. Forward `/muju/`, `/api/muju/`,
and `/mcp` to this service, with a proxy timeout above 30 seconds. Use HTTPS for
internet play because seat credentials authorize moves. You can also expose a
local host through your own HTTPS tunnel; set `PUBLIC_URL` to the tunnel origin.

On Render, deploy the `muju` directory as a Docker web service, use `./Dockerfile`
with build context `.`, attach a persistent disk at `/app/data`, and set the health
check to `/api/muju/health`. The host automatically uses Render's assigned public
URL when `PUBLIC_URL` is unset. Set `PUBLIC_URL` explicitly when using a custom domain.

Docker Compose is included:

```sh
cd muju
MUJU_PUBLIC_URL=https://muju.example.com docker compose up --build -d
```

Compose publishes TCP 3003 and keeps SQLite in the `muju-data` volume. Supply your
own domain and HTTPS proxy; Compose does not provision either. The image runs as
the unprivileged `node` user. Do not remove the volume if you want to retain rooms.

The existing **Cloudflare Pages deployment is static** and does not run this Node
service. It can remain the frontend: enter the separate host URL in the online
lobby, and allow the Pages origin on the host:

```sh
PUBLIC_URL=https://muju.example.com \
MUJU_ALLOWED_ORIGINS=https://deevgames.pages.dev \
npm run serve
```

Optionally build that frontend with `VITE_MUJU_SERVER_URL=https://muju.example.com`
to prefill the host. Without a separate host, existing local game modes still work.
Invitations open the host's copy of the browser game.

## Connect an LLM

Give an agent the public [Muju skill file](https://deevgames-muju.onrender.com/SKILL.md).
It covers connecting, invitations, move planning, safe retries and efficient waiting.
The browser lobby links to it. Other hosts serve the same file at `/SKILL.md` and
`/muju/skills/muju-hono-tanka/SKILL.md`.

**Remote MCP:** configure your MCP client with a Streamable HTTP server URL of
`https://muju.example.com/mcp` (or `http://localhost:3003/mcp` locally).
No MCP-wide login is required. Each game has its own private seat credentials.

**Stdio MCP:** for clients that launch a process, use the bridge below. The bridge
connects to an already running host, so separate computers share the same rooms.
It does not create its own isolated game store.

```json
{
  "mcpServers": {
    "deevgames-muju": {
      "command": "node",
      "args": ["--import", "/absolute/path/to/deevgames/muju/node_modules/tsx/dist/loader.mjs", "/absolute/path/to/deevgames/muju/server/stdio.ts"],
      "env": { "MUJU_SERVER_URL": "https://muju.example.com" }
    }
  }
}
```

Replace the absolute checkout path and server URL. This process form works without
a client-specific working-directory setting. When running from `muju/`, the
equivalent is `MUJU_SERVER_URL=https://muju.example.com npm run --silent mcp`.
Only protocol messages go to stdout. The implementation uses the
[official MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server).

| Tool | Purpose |
| --- | --- |
| `muju_rules` | Rules, all unit definitions, coordinates and workflow |
| `muju_create_room` | Choose a side (all games use four actions); get a private seat token and separate invitation |
| `muju_join_room` | Claim the other seat using `roomId`, `inviteCode`, and a name |
| `muju_observe` | Compact board, units, resources, home threats, history and revision |
| `muju_history` | Persistent game score with notation, costs/AP, upkeep, combat and mining outcomes; paginated, public |
| `muju_legal_actions` | Filtered/paginated moves including multi-action movement, costs and combat outcomes |
| `muju_preview` | Simulate a sequence without committing it |
| `muju_play` | Commit one action or an atomic sequence, using your seat token |
| `muju_wait_for_change` | Wait up to 25 seconds for the opponent to join/play |

Rules are also available as the MCP resource `muju://rules`.

Every room uses four shared actions per player turn. Room observations expose
`actionsPerTurn: 4`; the current allowance is `turn.actionsRemaining`.
Ten consecutive completed turns without an enemy attack kill draw, even if
players collect crystals. Only an attack kill resets the clock.

Suggested agent instructions:

> Read muju_rules. Create a room as White and give the opponent only the invitation,
> or join the invitation provided to you. Save your private seat credential. Observe
> the board, query legal actions for the unit you want to use, and preview useful
> sequences. Play using the observed revision. Wait for changes between turns.

Example `muju_play` arguments (replace IDs and revision with returned values):

```json
{
  "roomId": "ROOM_ID",
  "token": "YOUR_PRIVATE_SEAT_TOKEN",
  "expectedRevision": 1,
  "requestId": "white-opening-001",
  "actions": [
    { "type": "MOVE", "unitId": "UNIT_ID_FROM_OBSERVE", "to": "C1" },
    { "type": "END_ACTION_PHASE" }
  ]
}
```

Coordinates are A1–J10, with A1 at top left. MCP accepts square names or `{x,y}`
objects (zero indexed); the HTTP API uses `{x,y}`. Unit IDs come from observations;
do not confuse instance IDs with catalogue IDs such as `fire_1`.

All inventory is public. Anyone with the unguessable room ID can observe it;
only seat tokens authorize actions. Share the **invitation**, never your own token.
For human-to-agent handoff, the browser exposes your credential under **Private
reconnect details**. Two clients using one token control the same seat, so coordinate
their use. Rooms are unlisted; there is no public matchmaking or account system.

## Reconnect and action semantics

An unanswerable home occupation resolves immediately as `home-checkmate`, without
waiting for the defender to take a turn. The shared engine checks every affordable
upkeep keep/release set, one promotion per unit, movement, blocker clearing, and
combined attacks within four actions. A corner has only two adjacent squares;
three attacks against its occupier need at least five actions (three attacks,
one exit move, and one entry move). A prior opposing home occupation keeps its
turn-start priority. Elimination-only lab games retain their historical rule.

The proof uses optimistic pruning and a deterministic 20,000-node work limit;
an inconclusive search keeps the normal reply turn and never awards a guessed
win. Checkmate cancels any remaining commands in an MCP/HTTP batch, including a
queued end-turn command. History and replay contain only executed actions, while
idempotent retries still use the original complete request. Preview applies the
same resolution, and live observers receive the terminal revision immediately.

On a new device, choose **Play online → Restore a seat** and paste the private
credentials JSON from the original browser's **Private reconnect details → Copy
credentials**, or the MCP `credentials` object. Include `roomId`, `player`,
`token`, and `serverUrl`; `inviteCode` is optional. Markdown-wrapped server URLs
and JSON code fences are accepted. `POST /api/muju/rooms/:id/restore` verifies
the bearer token against the supplied `{player}` before the browser stores it.
Restoration works with a full room or a used invitation, preserves revision,
undo, and replay, and leaves the original device's credential valid.

**Share watch link** in any online room provides a URL ending in `&watch=1`.
Create/join and `muju_observe` also return `watchUrl`. Any number of observers
can watch both seats live, inspect units, and replay the last completed turn.
The lobby's **Watch a game** accepts a room link or room ID. An explicit watch
link stays read-only even if the browser has a saved seat; it does not overwrite
that seat. Observers use the existing unauthenticated room read/change endpoints.
Their connections contain no token, and the UI and dispatch layer prohibit moves.

- Each invitation can claim the free seat once. Browsers store their own credential
  separately from local-game saves. Reopen the same room URL on the same browser
  origin/profile to resume. Agents must retain the credentials returned by create/join.
- A lost seat token has no recovery mechanism. Browser storage clearing loses it;
  copy private reconnect details if you need a backup. A create/join response lost
  before the credential is saved may require a new room.
- The server rejects actions from the wrong seat, before both players join, after
  victory, or against an old `expectedRevision`. Refresh and plan again after a
  `STALE_REVISION` error.
- Batches of up to 32 actions are all-or-nothing and may not play the opponent's
  turn. Placement can automatically advance to the action phase under existing rules.
- Retry the **identical body and requestId** after an uncertain response. A repeated
  command returns the current room without applying it twice. The last 256 command
  receipts per room survive restarts. Changed bodies must use new request IDs.
- Previews are hypothetical and leave the revision unchanged. They grant no reservation;
  a concurrent real action can invalidate the preview.
- Upkeep automatically pays when affordable. Send `SET_UPKEEP_REVIEW` with `enabled`
  as its own command to review it each turn. `PAY_UPKEEP` must include every tier 1
  unit and any affordable subset of higher tiers. Legal-actions output shows one
  affordable selection, not all exponentially many possible subsets.
- Browsers and both MCP transports use server-side long polling: a request waits up
  to 25 seconds, returning the board only when its revision changes. An unchanged
  result is just `{changed:false, revision, phase}`; agents keep their previous
  observation and wait again. Stop waiting when `phase` is `victory`.
- Browser updates pause in hidden tabs, resume when visible, stop after victory,
  and back off during outages. Retrying the same move after a lost response remains
  supported. Idle visible clients make about 144 wait requests/hour, instead of
  3,600 browser snapshots or 7,200 stdio-bridge snapshots. Network/protocol headers
  still consume bandwidth, as do actual moves, observations and loading the site.

## Host configuration and persistence

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `3003` | Listen port |
| `PUBLIC_URL` | `http://localhost:3003` | Reachable origin used for MCP invitations and browser origin checks |
| `MUJU_DB_PATH` | `muju/data/rooms.sqlite` | Persistent database, or `:memory:` for tests |
| `MUJU_ALLOWED_ORIGINS` | empty | Comma-separated additional frontend origins |
| `MUJU_MAX_ROOMS` | `10000` | Maximum saved rooms |
| `MUJU_SERVER_URL` | `http://localhost:3003` | Target host for the stdio bridge |
| `VITE_MUJU_SERVER_URL` | current frontend origin | Optional frontend build-time default |

The host keeps SQLite transactions, state, hashed credentials, revision counters,
the last 100 action batches and 256 idempotency receipts. Restarting with the same
database preserves games. Back up the database using SQLite's backup API, or stop
the host before copying the database and any `-wal`/`-shm` companions. Use a local
persistent disk, not a shared network filesystem. SQLite handles concurrent local
processes, but this release does not replicate state across multiple machines.

Requests are JSON-only, limited to 64 KiB and 600 requests/minute per socket IP.
Browser origins are restricted. Forwarded IP headers are deliberately not trusted;
behind a proxy the limit is shared across clients. Put public abuse protection at
your trusted proxy for larger deployments. Room creation is unauthenticated and
rooms do not expire automatically; this host is intended for invited games, not
an unrestricted high-volume matchmaking service. No paid infrastructure is provisioned
by these files.

Saved rooms have a rules version; bump `RULES_VERSION` in `server/rooms.ts` when
changing incompatible game rules. Older rooms fail with an explicit error instead
of silently continuing under different rules. Version 4 upgrades version-2/3
rooms in place to four actions and resets the new kill-only clock to zero. It
subtracts actions already spent, preserves the board, seats and final results,
and clears old undo/replay history. Reconnects receive an updated revision.

## HTTP API and verification

`GET /api/muju/health` checks availability. Room operations:

| Method and path | Body / behavior |
| --- | --- |
| `POST /api/muju/rooms` | `{name, side, actionsPerTurn?: 4}` → admission (only 4 is supported) |
| `POST /api/muju/rooms/:id/join` | `{name, inviteCode}` → admission |
| `GET /api/muju/rooms/:id` | Public snapshot; optional Bearer token validates a saved seat |
| `GET /api/muju/rooms/:id/history` | Public score; `limit` (1–200, default 50), `before` or `after` sequence cursor, optional `includeUndone=true` |
| `GET /api/muju/rooms/:id/positions/:sequence?step=N` | Exact recorded state, or an individual AP step within a move; sequence 0 is the first recorded position |
| `GET /api/muju/rooms/:id/changes?afterRevision=N&timeoutMs=25000` | Wait for change; compact metadata on timeout, `room` snapshot on change; optional Bearer token |
| `POST /api/muju/rooms/:id/actions` | `{expectedRevision, requestId, actions}` plus Bearer seat token |
| `POST /api/muju/rooms/:id/preview` | Same request, without mutation |
| `POST /mcp` | Stateless Streamable HTTP MCP |

Only engine actions plus the seat-local upkeep preference are accepted. Client
state replacement, resets, and selecting units never reach the server. `UNDO` is a server-validated command that restores the current player’s previous command within this turn.

```sh
npm run build
npm run server:types
npm test
npm run test:online:e2e
```

The browser test command starts its own ephemeral host on port 8928. It covers
two independent browser profiles, mobile play, reload, browser/MCP play and lost
response retries, plus the existing pass-and-play and side-selection flows.
Server tests exercise real HTTP/stdio MCP clients, persistence, stale revisions,
seat authorization, atomic batches, origin validation, malformed requests and draws.

### Undo and detecting human moves

The browser Undo button and MCP `muju_play` with `actions: [{"type":"UNDO"}]`
reverse the current player’s latest command. An atomic batch is one undo step.
Undo covers purchases, promotions, upkeep choices, movement, attacks, and ending
placement. It persists across reconnects, but stops at turn end or game completion.
`canUndo` reports availability; revision and request-ID checks apply to undo too.
When your turn starts with a positive automatic upkeep payment, that payment is
your first undo step. Undo later actions first, then undo upkeep to refund the
crystals and reopen the keep/release selector, before healing. The opponent's
completed turn, income and turn handoff remain committed. Confirming the selector
pays only the new keep-set and can itself be undone. Unaffordable upkeep still
opens the selector immediately; zero-cost automatic upkeep adds no undo step.

Use `muju_wait_for_change({roomId, afterRevision, timeoutMs:25000})` as the
supported move notification mechanism for either MCP transport. Set `afterRevision`
to the last revision you received. It returns immediately for an already committed
change, so moves made between calls are not missed. A changed result includes
`events` with revision, player and actions (including UNDO), `eventsComplete`, and
the latest `room`. If event history was truncated, `eventsComplete` is false; the
room is still authoritative. Joining can change the revision without an action event.
Check `room.activePlayer` against your seat before playing: a human moving or
undoing does not end their turn. Retain the latest revision and wait again until
it is your turn. An unchanged result stays compact; stop on `phase:"victory"`.
These are bounded tool calls, not unsolicited notifications to an idle LLM client.

### Persistent move history

The room's **History** button opens a live sidebar for players and observers;
**View history** remains available after victory. It records committed moves,
purchases, promotions, attacks (including surviving defense or capture), upkeep
payments/releases, per-piece mining and depleted reserves, and the final result.
Records use the same notation returned by `muju_history` and the HTTP history API.

The score is stored in the SQLite `room_moves` table, separate from the rolling
notification log. It survives restarts and is paginated instead of attaching
every past turn to live board snapshots. The default page contains the latest 50
events in chronological order. Use `after=0` and then the last returned sequence
to read forward, or `before` the first returned sequence to read older pages.

Undo removes the whole undone command from the default score. Optional
`includeUndone=true` returns those records with `undoneAtRevision`; automatic
upkeep is independently reversible without erasing the other player's income.
Preview, failed batches and identical retries add no committed records. Scores
omit routine phase-ending commands and speculative annotations. Existing rooms
report `recordingStart.complete=false` and the revision where detailed recording
began; missing older moves are not invented.

### Analysis board and recorded positions

Open **Analysis board** from game modes to control both sides locally. In a room,
open **History → Analyze game**, or click any notation entry to jump directly to
that position on the board. Navigate by individual AP steps, whole player turns,
first/last position, or the position selector. **Explore from here** starts a
private variation; **Return to game score** restores the recorded line. Branches
run in page memory and never write to a room or replace a saved local game.

Each recorded event has a compressed state snapshot in SQLite. The original
state is available at sequence 0. Movement also retains its prior state, route
and speed so intermediate AP positions have the correct location and remaining
actions. A turn-end position precedes positive automatic upkeep, allowing that
payment to be undone without losing the outgoing player's mining outcome.
Historical positions are fetched on demand; normal room updates stay compact.
The public positions endpoint rejects undone events and out-of-range steps.

### Instant replay

During your turn, **Instant replay** plays the previous
turn's placements, promotions, moves and attacks on the existing battlefield. Each
action spent moving gets its own frame, following a legal route in hops up to the
unit's speed. The selector on the replay button remembers **Fast** (0.3 seconds),
**Slow** (1 second, the default), or **Step through** (manual back/forward controls,
with no autoplay or automatic exit). You can switch modes during playback.
The button keeps its place while unavailable, and playback
controls fit in the decision panel without resizing the board. Pause or resume,
step backward or forward, or select **Done** (or press Escape) to return to your
unchanged live turn. Automatic playback returns after the final action. Switching
tabs pauses playback until you resume, so actions are not missed in the background.
Undone commands are excluded; atomic MCP batches are split into individual actions.
Previously saved replays with long movement commands are expanded on playback too.
Online room snapshots carry `lastTurnReplay`, so the replay is also available after
reconnecting. Recording begins with this version; past turns from older releases
cannot be reconstructed. Local AI and pass-and-play replays last for the current
browser game session.
