# Engine seat and LLM match protocol — 2026-09-19, preparation v2

Prepared infrastructure, **not a completed match or strength result**. No Phasing
Hard game is authorized by this document. The seat has an unconditional Standard
check; the Hard parity/search work and M7 gates must land before a separately
reviewed change admits Phasing. Do not remove that guard merely to run a match.
This correction closes v1's same-endpoint mirror-room and bare play/undo
bypasses, removes AI purchase pruning from the rules oracle, and pins runner
expectations. The original commit and evidence remain preserved.

Standard smoke tests test transport and verification only; they cannot establish
Phasing strength. This protocol does not change the frozen Phasing ladder gates
or consume its sealed corpus.

## Room-wide tool policy

Creation accepts the optional immutable public field:

```json
{"matchPolicy":{"version":1,"toolTier":"harnessed","protocolId":"llm-engine-v1"}}
```

It is stored with the room, survives SQLite restart, accompanies public and
private snapshots, and cannot be changed by joining, playing, previewing or
staging. Existing rooms without the field retain their current behavior. There
is no privileged seat exemption: these are room capabilities, not a model-name
or seat-token allowlist.

| Tier | Public rules, board/history, clocks, play | Legal actions, preview, undo, stage | Hosted analysis, automatic headlines and briefings | Self-written analysis code |
| --- | --- | --- | --- | --- |
| bare | yes | no | no | no |
| harnessed | yes | yes | no | no |
| centaur | yes | yes | yes | no |
| tool-builder | yes | yes | no | yes |

Tool-builder is a separate category, **not a tier above centaur**. It may use its
own code but does not receive the hosted engine or analysis implementation.
Raw room snapshots and history are public, including for the engine opponent.
Bare rooms reject every action batch containing `UNDO` at the RoomStore boundary
and advertise `canUndo: false`. A successful play therefore cannot be rolled back
into a forbidden preview. Bare formatted observations omit income forecasts, upkeep totals and summon
validity hints as well as all automatic analysis. Public unit/catalogue facts,
current damage/defense, the turn phase and rule descriptions remain available.
A real play command still returns authoritative legality errors; failed commands
are recorded in the transcript and are not secretly unlimited previews.

Enforcement lives in `RoomStore.act(preview or any UNDO)`, `RoomStore.stage`, the legal-actions
service and `AnalysisService` before any cache hit. Anonymous `muju_analyze` is
rejected. Observation, admission, play, preview, error snapshots and wait replies
all suppress automatic analysis outside centaur. Explicit `briefing:true` returns
`MATCH_TOOL_RESTRICTED`; omit it to obtain a normal observation. HTTP MCP and the
stdio proxy use those same checks. Direct HTTP preview/stage cannot bypass them.
Ordinary rooms and centaur match rooms retain their existing hosted assistance.

The Phasing legal-actions endpoint now enumerates all affordable catalogue
purchases on every currently legal spawn square, filters only through canonical
legality, and paginates that full set. It never calls the AI candidate generator
or its next-turn disruption/reach heuristic. Legal risky summons are included;
`total` counts them. Promotions and action outcomes are rules consequences.
Pending upkeep still explicitly shows one valid affordable keep-set and accepts
other affordable choices, as documented by `upkeepNote`; it does not claim to
enumerate the entire upkeep powerset.

## Single-room service boundary

**An ordinary approved Muju endpoint is itself a solver.** A room flag alone lets
a client create an unrestricted mirror, replay the public transcript and analyze
the same board without leaving that endpoint. Scored use must therefore run the
implemented single-room service, not merely hide tools from an LLM prompt.

The operator creates the room and admits both seats out of band, retains the
SQLite database, and issues each participant only its own private credential.
Start a separate listener with `MUJU_MATCH_ROOM_ID` and that `MUJU_DB_PATH` using
`node --import tsx server/index.ts`. Its `createApp` instance pins the configured
room ID and stored v1 match policy at startup; absent, unadmitted, archived,
terminal or ordinary rooms fail startup. No process-global policy is modified.
The ordinary server remains available as a separate default mode, and must be
unreachable from the match participant sandbox.

The single-room listener's complete HTTP allowlist is GET health, POST MCP,
GET the configured room/history/positions/changes, POST its actions, plus its
preview/stage/stage-cancel/private-stage reads when the tier permits rules-oracle
assistance. Every other route is denied, including create, join, restore, listing,
archives, invitation/watch lookup, static app routes and all other room IDs.
Seat-token authentication on mutations remains unchanged; observations of the
one room remain public. There is no participant-accessible operator endpoint.

MCP discovery exposes only rules/time-awareness, observe, clock, history, play
and wait; harnessed/tool-builder also expose legal actions, preview and staging
operations; centaur also exposes analyze. Create and join are absent in every
scoped tier. A backend wrapper rejects all cross-room arguments even if a caller
knows another valid room ID and its token. Explicit briefing outside centaur is
rejected, and the ordinary automatic analysis fields remain suppressed.

`/api/muju/health` advertises the pinned `matchScope`. The stdio bridge discovers
and adopts that same scope before exposing tools; optional `MUJU_MATCH_ROOM_ID`
on the bridge additionally requires that exact restricted scope or refuses to
start. Direct HTTP requests cannot bypass the listener's allowlist, so the bridge
is not the sole control. Record the health scope and fresh negative probes for
create/join/listing/cross-room/analysis access in the frozen run manifest.

The actual OS/network sandbox still has to be provisioned and verified before a
study: allow only this restricted listener, deny all ordinary Muju ports/hosts,
repo checkout, engine artifacts, other solvers and general shell/network access
except tool-builder's separately reviewed code sandbox. Record the policy and
probe results. This change implements the service capability boundary; it does
not claim that a model sandbox, per-turn/token controller or scored run exists.
The operator must retain before/after room inventory and move-history audit
outside the participant surface, checking for unregistered/mirrored games and
recording denied-route probes. A client with access to another unrestricted
service or its own solver could still copy public state there.

## Fixed study, registered before any scored game

The first scored Phasing study is **16 seat-swapped pairs (32 games), harnessed
LLM versus desktop Hard, seed 20260991, handicap 0**. Other tiers are separate
future preregistrations; do not pool them. The LLM is limited to 60 seconds from
its turn-start receipt to complete-turn submission and 8,192 generated tokens
per turn, with a maximum 512,000 generated tokens per game. Context reset policy
is one fresh conversation per game with only the same rules packet and current
game transcript; no cross-game coaching. A runner must enforce and record these
limits; no such LLM harness is implemented by this preparation change.

Before the first scored game, append a manifest freezing:

- Exact model/provider/version and reasoning setting, system prompt, tool schemas,
  isolation policy, sampling settings, tokenizer/accounting method and the rules
  packet hashes. Unavailable provider token usage is explicitly missing data.
- Server, canonical game, engine, policy, runner, weights and source identities;
  all correctness/release prerequisites; machine/Node identity and a quiet,
  single-match scheduling reservation. No concurrent benchmark load.
- The ordered 16 scripted opening action sequences and SHA-256 manifest. Use the
  **first 16 eligible documented development opening records** from the existing
  scripted Phasing development corpus in file order, pre-filtering only for
  legal complete-turn boundaries, nonterminal state and no pending upkeep. Pin
  corpus hash and every excluded record/reason before any game; if fewer than 16
  qualify, stop and amend before play. Never read/use the sealed ladder corpus.
- Each opening is replayed through authoritative HTTP actions by a match
  controller before seats begin; do not inject board JSON into SQLite. Both
  games in a pair start from exactly the same opening state, same engine seed
  (20260991 + pair index), then exchange which participant controls each color.
  Freeze that opening replay/controller procedure and final state hash. Current
  production API does not support pause/reset clocks for setup: an isolated
  controller/service must arrange setup before the timed study starts.

The engine receives the fixed `deep` 60,000 ms target and watchdog per whole turn,
with actual wall time measured around construction, search and canonical replay.
No lower-budget repair or replacement engine is silently substituted. Engine
work rung, completed depth, nodes/work, stop reason, fallback and overrun are
logged. The room uses classical 60-second delay and 30-minute bank as a transport
backstop; that bank is **not** permission to exceed the per-turn study budget.
The independent match controller adjudicates study overages at 61,000 ms (one
second fixed transport margin), LLM token violations as losses, and terminates
at 160 completed player turns as a reported adjudicated draw. Before Phasing
play, implement and verify that controller; the seat alone does not enforce
opponent timing/token limits or the 160-turn match cap.

A correctness failure (illegal engine plan, replica/key divergence, unsupported
state or engine fallback) invalidates the entire study, is recorded immediately,
and stops scoring. An interrupted infrastructure game is reported and the study
remains incomplete: no convenient replacement games or optional stopping. A
lost submission response is retried with the exact durable request ID/body and
is not a second search. A stale revision stops the seat; resolve the cause and
report the run invalid/incomplete rather than re-searching the observed position
with a fresh 60 seconds. Engine-process restart is an infrastructure interruption
for scored play even when the journal safely recovers a pending submission.

Report all 32 outcomes (or the exact incomplete prefix), pair score, W/D/L,
seat-specific scores, paired uncertainty, time/token distributions, invalid
commands, adjudications and every fallback. Preserve room IDs, revision/state
hashes, action transcripts, model transcripts and provider usage records. Keep
seat credentials and invitation codes in private files; redact before publishing
transcripts. A single small study is evidence for this exact opponent/tier/rules
combination; no general claim about LLMs or game balance follows.

## Standard infrastructure runner

Run from `muju/` with Node supporting `node:sqlite` and existing dependencies:

```sh
node --import tsx tools/engine-seat/main.ts /private/path/seat-config.json
```

The private JSON contains `serverUrl`, `roomId`, integer `seed`, absolute
`stateFile`, and an explicit mode. `mode: "phasing-smoke"` requires an ordinary
Phasing room without a match policy. It accepts either `name`/`inviteCode` or
already issued `credentials`, never both admission methods. Only this smoke mode
can call join. It is not a substitute for a pinned match.

`mode: "pinned"` requires issued `credentials` (`roomId`, `player`, `token`) and
all three expectations: `expectedMatchPolicy` with exact version/toolTier/
protocolId, `expectedTimeControl` with exact delaySeconds/bankSeconds, and
`expectedHandicap`. It authenticates a read and never joins or rotates a token.

PHASING-ONLY, AND DEFAULT CLOSED. The Hard replica packs Phasing states only
(`core/state.ts` throws `PackError` on a Standard room), so the seat refuses any
room whose ruleset is not `phasing` — the reverse of the Standard-only guard it
carried while the search still represented Standard. Being able to run is not
permission to run: the seat ALSO refuses every room unless the configuration
declares `phasingHardReadiness: "M7-passed"` verbatim. The claim is about a
release gate the Hard engine has not passed (M6 is a bootstrap checkpoint that
misses two pre-registered floors), nothing in the tree verifies it, and the only
place it is set today is a test-only configuration. A preregistered Phasing
study still cannot run: this makes the seat runnable, not released.

The runner compares every received snapshot to its expected room, policy,
time control and handicap, checks a valid running clock in pinned mode, and
re-reads before submission/uncertain retry. Wrong/absent expectations stop before
search or submission; a changed revision stops without a second search. The
room-contract-verified log records the values read from the server, including
the ruleset. The search is sized for 55 s (`ENGINE_TARGET_MS`) while the
watchdog still fires at the fixed 60 s allowance, so a rung over-estimate
finishes rather than being thrown away; a turn that is not searched is logged as
`time`, `work-exhausted`, `divergence`, `pack-error`, `engine-error` or
`unsearched` rather than all of them as `unsearched`. The two read-only legs
(authenticated read, long-poll wait) retry a transport failure up to three times
with bounded backoff; a server answer (`OnlineError`) and any contract or
authentication mismatch are never retried. This does not
replace the separate health-scope and endpoint-isolation verification above.

Journal v3 persists the mode, exact expected contract (the readiness claim
included), seed, credential and admission method. Resume rejects omission or
changes rather than silently turning a pinned match into smoke, or a closed
seat into an open one. Legacy v1 and v2 journals are explicitly rejected — a v2
journal is a STANDARD seat's journal and a cross-ruleset resume is exactly the
confusion the rules revision exists to prevent, so such a run is restarted;
inspect and retain them rather than rewriting old evidence. Keep config/state
outside git in a private directory (`chmod 700` directory, `chmod 600` config).
Existing credentials are reused, never rejoined. Do not point an existing journal
at another server/room/seed or alter its expected contract.

The state file and atomic temporary file are mode 0600; the sibling `.jsonl` log
contains source hashes, room ID, moves and search measurements, never credentials
or invitation codes. A sibling `.lock` directory prevents concurrent runners on
one journal. A crash may leave `.lock`/`.tmp`; inspect the process and pending
request before manually recovering them. An empty reserved state file after an
uncertain join is an explicit recovery condition, not permission to auto-join.

The runner acquires the real shared heavy-work slot **before initialization or joining**, uses
public revision long-polling between turns and one HardEngine per process/game,
sets the seed once, and calls `verifyTurn` again against the returned end key. It
requires the complete player turn (or terminal result) to fit in one atomic HTTP
batch, saves that exact batch before sending, and retries only uncertain network
outcomes. Stale revisions, insufficient room-clock allowance and any verification
failure stop with the journal preserved. No automatic resignation, move repair,
phase-ending fallback or live game is launched by the tests in this change.

No production deployment, real LLM match, Phasing engine match, opening import
controller or strength claim is included in this preparation.
