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
existing board, previews, shop and upkeep controls. Online moves are final.

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
| `muju_create_room` | Choose a side; get a private seat token and separate invitation |
| `muju_join_room` | Claim the other seat using `roomId`, `inviteCode`, and a name |
| `muju_observe` | Compact board, units, resources, home threats, history and revision |
| `muju_legal_actions` | Filtered/paginated moves including multi-action movement, costs and combat outcomes |
| `muju_preview` | Simulate a sequence without committing it |
| `muju_play` | Commit one action or an atomic sequence, using your seat token |
| `muju_wait_for_change` | Wait up to 25 seconds for the opponent to join/play |

Rules are also available as the MCP resource `muju://rules`.

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
- The browser polls once per second and supports retrying the same move after a lost
  response. MCP long polling returns after a change or a 25-second timeout.

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
of silently continuing under different rules.

## HTTP API and verification

`GET /api/muju/health` checks availability. Room operations:

| Method and path | Body / behavior |
| --- | --- |
| `POST /api/muju/rooms` | `{name, side}` → admission |
| `POST /api/muju/rooms/:id/join` | `{name, inviteCode}` → admission |
| `GET /api/muju/rooms/:id` | Public snapshot; optional Bearer token validates a saved seat |
| `POST /api/muju/rooms/:id/actions` | `{expectedRevision, requestId, actions}` plus Bearer seat token |
| `POST /api/muju/rooms/:id/preview` | Same request, without mutation |
| `POST /mcp` | Stateless Streamable HTTP MCP |

Only engine actions plus the seat-local upkeep preference are accepted. Client
state replacement, resets, undo, and selecting units never reach the server.

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
