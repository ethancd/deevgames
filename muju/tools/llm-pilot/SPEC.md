# LLM-vs-Hard pilot — build spec (shared contract for all builders)

Source plan: `outputs/muju-llm-opponent-campaign-2026-09-23/{claude-pilot-prompt.md,plan.md,allocation.json,hosting-and-costs.md,reflection-template.md}`.
Worktree: `/Users/ashkie/src/deevgames-llm-pilot` (branch `claude/muju-llm-pilot`). Never edit `/Users/ashkie/src/deevgames`.
Live server: `https://deevgames-muju.onrender.com` (authoritative state). No deploys, no new Render services.
Run TS with `node --import tsx` from `muju/`. Keep code small; this is a pilot, not a tournament platform.

## Campaign data dir (outside git, shared by all components)
`CAMPAIGN_DIR = /Users/ashkie/src/deevgames/outputs/muju-llm-opponent-campaign-2026-09-23/pilot`
```
pilot/
  schedule.json            # 8 pairs x 2 legs (written by dispatcher, from the pilot table)
  progress.md              # compact human progress (dispatcher rewrites)
  STOP                     # if present, dispatcher admits no new games (active ones finish)
  memory/
    experiences.jsonl      # append-only, one reflection record per game (publisher only)
    playbook.md            # compact versioned playbook (publisher only), header "version: N"
    snapshots/v<N>/        # frozen copy of playbook + recent experiences, taken per pair
  games/<gameId>/          # gameId = P01-W / P01-B etc. (W/B = LLM's seat)
    manifest.json          # model, effort, tier, handicap, llmSeat, engine identity/budget, snapshotVersion, roomId, watchUrl, result, timestamps
    secrets/               # 0700: seat tokens, engine config/state (NEVER copied to shared artifacts)
    engine/                # engine-seat journal + jsonl log (tokens redacted copy)
    player/                # player workspace (cwd for the LLM), transcript, usage.json
    actions.jsonl          # every accepted action batch: revision, requestId, actions, resulting state hash
    reflection.md          # the player's reflection (template)
    status.json            # {state: pending|preparing|live|finished|failed|interrupted, detail, updatedAt}
```

## Component A — engine seat (muju/tools/engine-seat)
1. Replace the game-long `withHeavySlot` in main.ts with per-search acquisition inside the turn loop (runner.ts): acquire slot → re-read room, verify revision/seat/contract/remaining clock → start 55s target / 60s deadline budget → search + verification → submit (idempotent requestId) → release. Release while waiting for the opponent/network. Log `queueDelayMs` separately per turn. One engine instance + durable journal per game preserved. Never bypass the queue or change MUJU_HEAVY_SLOTS default (2).
   - Check: the room clock must still cover ENGINE_ALLOWANCE_MS + margin *after* queue delay; if not, the existing refusal path applies.
2. Research contract (contract.ts/config.ts): add an explicit, version-pinned alternative to `phasingHardReadiness: "M7-passed"`, e.g. `{ kind: "research", campaign: "muju-llm-pilot-2026-09-23", rulesId: <deployed rulesId>, engineSourceSha256: <sourceIdentity sha>, readinessEvidence: <verified-seat check summary> }`. It must NOT claim M7 passed. Old journals keep parsing under their original schema. Keep all legality/state/auth/clock/policy/handicap/resume checks. Focused tests in muju/tests or alongside.
3. CLI stays: `node --import tsx tools/engine-seat/main.ts <config.json>`; document config fields the dispatcher must write.

### A: config

Fields the dispatcher must write into each engine seat's `config.json` (parsed by `seatConfigSchema` in
`tools/engine-seat/config.ts`; `node --import tsx tools/engine-seat/main.ts <config.json>`):

- `serverUrl`, `roomId`: the live room (`https://deevgames-muju.onrender.com`, the created room's id).
- `seed`: a `uint32` for the engine's RNG. Pick fresh per game; record it in `manifest.json`.
- `stateFile`: `<gameDir>/secrets/engine-seat.json` (0700 dir; the journal + its `.jsonl` log land beside it).
- `mode: "pinned"` for every pilot room (never `"phasing-smoke"`), with:
  - `credentials`: `{ roomId, player, token }` — the engine's own seat token from the room's admission
    response (issued admission; the dispatcher must not have the seat join, only read with these
    credentials — see runner.ts's "reserve before join" comment).
  - `expectedMatchPolicy`: `{ version: 1, toolTier: <the pair's tier>, protocolId: <the pilot's protocol id> }`,
    matching what the room was created with.
  - `expectedTimeControl`: `{ delaySeconds: 600, bankSeconds: 3600 }` (the plan's clocks), matching the room.
  - `expectedHandicap`: the pair's Black-crystal handicap (0 for handicap-free pairs).
- Readiness (exactly one, never both — `seatConfigSchema` rejects both together):
  - `researchReadiness` for every pilot seat: `{ kind: "research", campaign: "muju-llm-pilot-2026-09-23",
    rulesId: <the deployed ruleset revision the rooms were created under>, engineSourceSha256: <this
    checkout's source hash>, readinessEvidence: <a short summary of the verified-seat check that grounded
    it> }`. `main.ts` refuses to start if `engineSourceSha256` does not match the running checkout's own
    computed hash (`sourceIdentity()`), so this cannot be hand-typed wrong. This NEVER claims `"M7-passed"`.
  - `phasingHardReadiness: "M7-passed"` is test-only in this tree; the dispatcher must never write it.

The heavy-work queue (`MUJU_HEAVY_SLOTS`, default 2) is acquired PER SEARCH inside `runner.ts`'s turn loop,
not for the whole game — the dispatcher does not need to reserve or hold a slot itself, and must never set
`MUJU_HEAVY_BYPASS=1` (main.ts refuses to start if it is).

## Component B — room-scoped player gateway (muju/tools/llm-pilot/gateway.ts)
A local stdio MCP server for ONE room + ONE seat, spawned by the player CLI as its MCP server:
`node --import tsx tools/llm-pilot/gateway.ts --game-dir <dir>` reads `secrets/seat.json` {serverUrl, roomId, seatToken, tier}.
- Builds a MatchScope from the live room (roomId + immutable matchPolicy) and wraps the HTTP backend with `scopeBackend`; exposes only `matchToolAllowed` tools for the tier (reuse server/mcp.ts `createMcpServer(backend, url, scope)`; stdio.ts is the template). bare: no legal lists/preview/stage/analysis. harnessed: + rules-oracle. centaur: + hosted analysis. tool-builder: rules-oracle, no analysis.
- Injects the seat token itself so the LLM never sees it (if tool schemas require a token arg, the gateway supplies/overrides it). create/join forbidden.
- Every accepted `muju_play` is appended to `actions.jsonl` with revision + requestId; requestIds are generated deterministically/idempotently so a retried play cannot double-submit. Rejected actions are returned verbatim to the model (no repair).
- Adds a passive read-only tool `pilot_memory` that returns the game's frozen snapshot files (playbook + experiences). No live advice.
- Throttle: at most ~2 req/s per gateway; back off on 429/5xx and log them to `<gameDir>/http.jsonl` with latency.

### B: interface

`tools/llm-pilot/gateway.ts` exports the pieces below (used directly by its own `main()`, and importable
by the dispatcher/players adapters or tests without spawning a process):

- `seatConfigSchema` / `SeatConfig`: the shape of `secrets/seat.json` — `{ serverUrl, roomId, seatToken, tier
  }`, `tier` one of `bare | harnessed | centaur | tool-builder`. The dispatcher writes this file (mode 0700
  dir); the gateway never prints it.
- `createGatewayServer(config, { gameDir, scope?, minIntervalMs? }) => Promise<McpServer>`: assembles the
  whole gateway (throttled/logged HTTP backend → token injection + idempotent play + `actions.jsonl` → live
  `MatchScope` resolution via `resolveMatchScope` unless `scope` is passed in → `server/mcp.ts`'s
  `createMcpServer` → `pilot_memory` attached). `main()` calls this with just `{ gameDir }` and connects it to
  `StdioServerTransport`; that's the whole CLI (`node --import tsx tools/llm-pilot/gateway.ts --game-dir
  <dir>`).
- `resolveMatchScope(config, backend, { pollIntervalMs?, timeoutMs? })`: polls the live room (default 1s /
  120s) until it is admitted (`ready`), `phase === 'playing'` and carries a v1 `matchPolicy`, then pins the
  `MatchScope` from it via `server/matchScope.ts#matchScopeFor` — tolerates the dispatcher preparing the
  player before the engine seat joins. Throws if the room's live tier ever disagrees with `config.tier`.
- `withGatewayGuarantees(inner, config, logActions)`: wraps a `RoomBackend`. Every call uses
  `config.seatToken`, ignoring whatever token the tool call carries (the model can send any placeholder that
  satisfies the tool schema's length check — it is never read). `act()` on a non-preview commit replaces
  `requestId` with `deterministicPlayRequestId(roomId, expectedRevision, actions)` — a sha256 hex digest — so
  a retried play with the same logical actions always gets the same id even if the model's own retry text
  differs or is forgotten; accepted plays are appended to `actions.jsonl` as `{at, revision, requestId,
  actions, stateHash}` (`stateHash` = sha256 of the resulting `room.state`, for tamper-evident replay).
- `deterministicPlayRequestId(roomId, expectedRevision, actions)`: the pure hash function above, exported so
  the dispatcher/tests can reproduce or verify a logged requestId independently.
- `readPilotMemory(gameDir)` / `attachPilotMemoryTool(server, gameDir)`: the `pilot_memory` tool's
  implementation. Resolution order: read `<gameDir>/manifest.json`'s `snapshotVersion` if present, else the
  highest `v<N>` under `<pilotDir>/memory/snapshots/`; `pilotDir` is `$MUJU_PILOT_DIR` if set, else two
  directories up from `gameDir` (matching `CAMPAIGN_DIR/games/<gameId>`). Returns `{ available: false }`
  rather than fabricating anything when no snapshot exists yet. `manifest.json`'s `snapshotVersion` field
  (Component D) is what pins a game to its pair's frozen snapshot — write it before the player's first turn.
- `createHttpClient(serverUrl, logHttp, minIntervalMs = 500)` / `createHttpBackend(request)`: the throttled
  (~2 req/s, one in-flight pacing gate shared across all calls from this gateway), retrying (429/5xx: up to 4
  attempts, capped exponential backoff + jitter) HTTP `RoomBackend`, logging `{at, method, path, attempt,
  status, latencyMs}` (or `error` on a transport failure) to `<gameDir>/http.jsonl` on every attempt. Wire
  contract matches `server/stdio.ts`'s local backend exactly. `create`/`join` throw — never called in
  practice since `matchToolAllowed` never registers those tools once a scope is present, but kept explicit.

Tests: `tests/tools/llm-pilot/gateway.test.ts` builds an in-process `RoomStore`-backed stubbed `RoomBackend`
(no HTTP, no live site) per tier, drives it through `createMcpServer` + an in-memory MCP client, and asserts:
tool lists match the tier table above exactly; `muju_create_room`/`muju_join_room` are never registered and
are refused when called anyway; every downstream `get`/`act` call uses the configured seat token regardless
of what the client sent; two `muju_play` calls with the same actions but different model-chosen `requestId`s
collapse to one deterministic id, journaled once each with a matching `requestId`; `pilot_memory` returns the
manifest-pinned snapshot's playbook/experiences, or `{ available: false }` when none exists.

## Component C — player adapters (muju/tools/llm-pilot/players.ts + prompts/)
`runPlayer({gameDir, model, effort, tier, seat, snapshotDir, brief})` → spawns ONE fresh CLI session that plays the whole game to completion, then a reflection turn in the same session (same effort).
- Claude: `claude -p --model claude-sonnet-5 --effort <e> --output-format stream-json --verbose --mcp-config <json> --strict-mcp-config --permission-mode ... --allowedTools mcp__muju__* (+ Write/Bash inside player/ for tool-builder only)`. Env: delete ANTHROPIC_API_KEY, ANTHROPIC_PERSONAL_API_KEY, any *_API_KEY. NEVER `--bare`. Before first game assert `claude auth status` → authMethod "claude.ai". cwd = player workspace outside the repo (under a temp root, NOT under ~/src); deny Read/Grep/Glob outside the workspace via --disallowedTools / settings.
- Codex/GPT: binary `/Applications/ChatGPT.app/Contents/Resources/codex` (not on PATH). `codex exec -m gpt-6-luna -c model_reasoning_effort="<e>" -c forced_login_method="chatgpt" --json --skip-git-repo-check -C <workspace> --sandbox (read-only | workspace-write for tool-builder)` with MCP server configured via `-c mcp_servers.muju.command=...`. Env: strip OPENAI_API_KEY and all *_API_KEY. Before dispatch: `codex login status` must say "Logged in using ChatGPT" and ~/.codex/auth.json auth_mode == "chatgpt" (never print tokens). Verify gpt-6-luna availability with a tiny probe; refuse (don't substitute) if unavailable. Record rate-limit / usage info from the JSON event stream if exposed.
- Long games: if a single CLI session can't hold the whole game, the adapter may run sequential sessions per turn-chunk with a compact carry-over note written BY the model; record this. Prefer one session.
- Prompt (prompts/player.md): rules via muju_rules, try to WIN, read the snapshot via pilot_memory first, tier's tool limits, investigation brief, clock info (600s free delay + 3600s bank), use muju_wait_for_change while the engine thinks, stop when game ends, then write reflection.md per reflection-template.md with revision references. No hidden-CoT requests.
- Record usage.json: input/output/reasoning tokens, calls, elapsed, retries, returned model id, billing route ("claude.ai subscription" / "ChatGPT subscription").
- Isolation (soft + audited): workspace outside ~/src; log every tool call (file paths) from the stream; flag any read under /Users/ashkie/src.

### C: interface (as integrated)

`players.ts#runPlayer(args: RunPlayerArgs): Promise<PlayerResult>`; `PlayerResult = { outcome, turns, citedRevisions,
reflectionText, detail? }`. Args add `handicap?` (smoke override), `isGameOver?` (defaults to reading the room with
`secrets/seat.json`), `maxContinuations?` (6), `onSpawn?(pid)` (dispatcher pid tracking).

- **Durable phases.** Each CLI phase (`play`, `continue`, `reflect`) is spawned DETACHED with stdout/stderr going
  straight to `player/transcript.<phase>[-n].jsonl(.stderr)`; `player/state.json` records workspace, session id and
  every phase (pid, start/end, exit, tokens, served model, apiKeySource, rate limits). Claude play phases pin
  `--session-id` up front. Called again for the same game, `runPlayer` waits for a live phase by pid or resumes the
  same session (`claude --resume`, `codex exec resume`) with a "the game is not over, re-observe and continue" prompt.
  A phase that stops while the room is still `playing` is continued the same way (≤ `maxContinuations`). The
  reflection runs only once the authoritative room is terminal; its text is the workspace `reflection.md` if the CLI
  could write it (codex read-only sandbox cannot), else the final message.
- **Flags (verified live, claude 2.1.280 / codex 0.155).** Claude: `-p … --strict-mcp-config --restricted --tools
  Read,Write[,Bash] --allowedTools mcp__muju,Read,Write[,Bash] --permission-mode dontAsk --permission-prompts none`.
  Not `--bare` (skips subscription auth) and not `--safe-mode` (it also drops `--mcp-config` servers). Codex:
  `--ignore-user-config --ignore-rules` (the operator's config.toml carries node_repl/computer-use MCP servers and
  plugins), `forced_login_method="chatgpt"`, `sandbox_mode`, `mcp_servers.muju.default_tools_approval_mode="approve"`.
  The gateway is launched with an absolute tsx loader URL (`gatewayCommand`) because the player's cwd is outside
  the repo. The prompt gives the room id and a 41-char placeholder token; the gateway substitutes the real one.
- **Served model / billing.** Claude: `result.modelUsage` keys and `init.apiKeySource` (must be `none`). Codex:
  `--json` names neither model nor quota, so `auth.ts#readCodexRollout(threadId)` reads the session rollout
  (`~/.codex/sessions/**/rollout-*-<id>.jsonl`): `turn_context.model` and `token_count.rate_limits` (weekly
  `used_percent`, `credits.balance`). A mismatch or non-`none` apiKeySource makes the outcome `failed`.
- `auth.ts#runAuthPreflight` (claude.ai auth, `codex login status` — printed on STDERR — plus `auth.json`
  `auth_mode: chatgpt` and no stored `OPENAI_API_KEY`, one probe per model) runs via `dispatch.ts --preflight`
  and automatically before admission when `preflight.json` is older than 12h.

## Component D — dispatcher + publisher (muju/tools/llm-pilot/dispatch.ts, publish.ts)
- Schedule from the pilot table (P01..P08, each two legs LLM-as-W and LLM-as-B). Concurrency: 2 active per model (4 total); refill a model's freed slot from its queue, preferring a started pair's remaining leg. Initially launch both legs of P01 and P02.
- Per game: create room on live server with matchPolicy v1 {toolTier}, handicap = Black crystals, clocks 600s delay / 3600s bank (verify the live create schema supports these; if not, use the closest supported and record). Prepare the player (workspace, snapshot, MCP config) BEFORE admitting both seats (second join starts clocks). Engine seat joins its seat via engine-seat config; player seat token goes to secrets/seat.json. Record watchUrl.
- Snapshot: freeze `memory/snapshots/v<N>` when a pair's first leg starts; the second leg reuses it.
- After a game: result from authoritative room + full history cross-check → manifest.json; hand reflection to publisher.
- Publisher (single writer, file lock): append to experiences.jsonl, verify cited revisions exist, update playbook.md (bump version) — playbook curation may use a Claude call (`claude -p --model claude-sonnet-5`, subscription) that only organizes cited evidence; never GPT API.
- Resume: `dispatch.ts --resume` re-attaches to live games from status.json + engine journals; never re-joins a seat (would revoke credential); uncertain states → `interrupted`, reported, not replaced.
- Stop: `touch pilot/STOP` (graceful) ; `dispatch.ts --kill` (SIGTERM children, journals preserved).
- GPT quota: if codex reports low remaining usage, stop admitting GPT games (queue until reset).
- Monitor site latency / 429 / 5xx from http.jsonl; if degraded, reduce admission.
- progress.md: table of 16 games: id, model, tier, handicap, seat, state, watch link, result, turns, elapsed.
- Safety ceiling: 200 completed player turns → labeled truncation.

## Player display names (owner request)
The LLM seat's in-game player name = model + reasoning level, title case: "Sonnet 5 Low", "Sonnet 5 High", "Luna 6 Medium", later "Opus 5.5 High", "Fable 5.1 Max", "Sol 6 Medium", "Astra 6 Max". The engine seat keeps its existing Hard name. Derive from a single table in dispatch.ts; check the server's name length/charset limit.

## Launch gate: uncapped Cleave (muju-phasing-4) must be in production first (owner request)
The Cleave change (branch claude/muju-unlimited-cleave, worktree ~/src/deevgames-cleave, another session) changes rules to
`muju-phasing-4` and the Hard engine. No pilot game (the 16) may start until (1) it is merged to origin/master, (2) this branch is
rebased onto it so the engine seat runs the phasing-4 engine, and (3) production reports phasing-4 (verify via a live signal, e.g.
muju_rules over /mcp or a fresh room's rulesVersion). The dispatcher must refuse to admit pilot games if production's rules id
differs from the engine seat's pinned rules id. Smoke tests before then are fine.

Implemented in `dispatch.ts`: `productionRulesId()` POSTs a single `tools/call muju_rules` JSON-RPC request to
`${SERVER_URL}/mcp` (StreamableHTTP, `enableJsonResponse: true`, so one JSON response — no session, no SSE
framing) and reads `result.structuredContent.ruleset.revision`; no room is created, no side effect on the live
site. `assertProductionRulesGate()` throws unless that revision equals this checkout's own imported
`PHASING_RULES_VERSION` (`server/rooms.ts`) — i.e. the gate is closed by construction until this worktree is
rebased onto the Cleave rules AND production has actually deployed them, not just one or the other. `tick()`
calls this (cached 60s, so the 5s admit loop doesn't hammer `/mcp`) before every admission pass; while closed it
admits nothing and writes `pilot/launch-gate.txt` with the reason. `--status` prints `Launch gate: OPEN|CLOSED —
<detail>` above the progress table. `--dry-run` never calls it (no network calls at all, by its own contract).

## D: operator commands (as integrated)

All from `muju/`. `MUJU_PILOT_CAMPAIGN_DIR` overrides the campaign dir; `MUJU_SERVER_URL` the server.

| Purpose | Command |
|---|---|
| Plan, no network | `node --import tsx tools/llm-pilot/dispatch.ts --dry-run` |
| Auth/model preflight | `node --import tsx tools/llm-pilot/dispatch.ts --preflight` → `pilot/preflight.json` |
| Start / continue | `nohup node --import tsx tools/llm-pilot/dispatch.ts >> <pilot>/dispatch.log 2>&1 &` |
| Status + spectator links | `node --import tsx tools/llm-pilot/dispatch.ts --status` (also `pilot/progress.md`) |
| Graceful stop | `touch <pilot>/STOP` (active games finish; dispatcher exits when none are in flight) |
| Hard stop | `node --import tsx tools/llm-pilot/dispatch.ts --kill` (dispatcher, then player and engine process groups) |
| Resume | `nohup node --import tsx tools/llm-pilot/dispatch.ts --resume >> <pilot>/dispatch.log 2>&1 &` |

- Plain run and `--resume` both re-attach first: for every `live` game, a running engine seat is left alone (else
  respawned from its journal — pinned mode never joins; stale `.lock` removed only when no engine pid is alive) and
  the player is waited on or its session resumed. A game stopped during preparation (no `prep.json`/seat) becomes
  `interrupted` and names its room in `prep.partial.json`; nothing is ever re-joined or replaced. A second
  dispatcher on the same campaign dir refuses to start.
- Snapshots: `snapshotVersionFor` freezes `memory/snapshots/v<N>` (N = max+1) when a pair's first leg starts and
  records it in the leg's `snapshot.json`/`prep.json`; the second leg reuses it, across restarts.
- After a game: manifest gets result/winner/reason and a `crossCheck` (final revision, history entries, logged LLM
  batches, engine submissions, duplicate requestIds, max queue delay and search time); a redacted engine log is
  copied to `engine/engine-seat.jsonl`. Terminal results stand even if the reflection fails (then unpublished). The
  publisher keeps citations within `0..finalRevision` (engine-move revisions are real, replayable states) and records
  the rest as `droppedCitations`; then `curatePlaybook` (claude-sonnet-5, subscription env, no tools) bumps
  `playbook.md` to `version: N+1` and archives the previous one under `memory/playbook.history/`.
- Admission gates each tick: STOP; launch gate; site health (429/5xx rate, p95 latency over the last 10 minutes of
  every game's `http.jsonl`); Luna quota (`gptQuotaDecision`: hold at ≥70% weekly used, any `rate_limit_reached_type`,
  or any drop in Codex `credits.balance` vs. preflight — the account HAS paid credits, so this is the tripwire).
- `pilot/heavy-slots.jsonl` samples the machine-wide heavy slots every 2s while the dispatcher runs.
- Smoke (never part of the 16): `MUJU_PILOT_CAMPAIGN_DIR=<pilot>/smoke … dispatch.ts --smoke --only P02-W --handicap 1
  --smoke-turns N` — refuses any other dir, bypasses the launch gate, labels manifest/experience `SMOKE`, and briefs
  the player to resign on its turn N+1.
- `tools/llm-pilot/policy-check.ts <outDir> [tier…] [--cli-probe]`: throwaway room per tier, real gateway over stdio
  from a cwd outside the repo, tool list + token-hiding checks, optional one-shot claude/codex probes, then RESIGN.

### Known gaps
- Isolation is soft + audited: codex keeps its shell (`functions.exec`, read-only sandbox) and sub-agent tools; any
  stream line naming `/Users/ashkie/src` is logged to `player/audit.log`. Claude still receives the operator's
  CLAUDE.md memory (no working flag removes it without also removing the gateway).
- A player killed mid-`muju_play` can have a move accepted by the server that never reached `actions.jsonl`; the
  manifest's `crossCheck` (history entries vs. logged batches + engine submissions) surfaces it.
- The launch gate still requires production and this branch to be on the Cleave rules before any of the 16 start.
