# Engine seat and LLM match protocol — 2026-09-19, preparation v1

Prepared infrastructure, **not a completed match or strength result**. No Phasing
Hard game is authorized by this document. The seat has an unconditional Standard
check; the Hard parity/search work and M7 gates must land before a separately
reviewed change admits Phasing. Do not remove that guard merely to run a match.
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

| Tier | Public rules, board/history, clocks, play | Legal actions, preview, stage | Hosted analysis, automatic headlines and briefings | Self-written analysis code |
| --- | --- | --- | --- | --- |
| bare | yes | no | no | no |
| harnessed | yes | yes | no | no |
| centaur | yes | yes | yes | no |
| tool-builder | yes | yes | no | yes |

Tool-builder is a separate category, **not a tier above centaur**. It may use its
own code but does not receive the hosted engine or analysis implementation.
Raw room snapshots and history are public, including for the engine opponent.
Bare formatted observations omit income forecasts, upkeep totals and summon
validity hints as well as all automatic analysis. Public unit/catalogue facts,
current damage/defense, the turn phase and rule descriptions remain available.
A real play command still returns authoritative legality errors; failed commands
are recorded in the transcript and are not secretly unlimited previews.

Enforcement lives in `RoomStore.act(preview)`, `RoomStore.stage`, the legal-actions
service and `AnalysisService` before any cache hit. Anonymous `muju_analyze` is
rejected. Observation, admission, play, preview, error snapshots and wait replies
all suppress automatic analysis outside centaur. Explicit `briefing:true` returns
`MATCH_TOOL_RESTRICTED`; omit it to obtain a normal observation. HTTP MCP and the
stdio proxy use those same checks. Direct HTTP preview/stage cannot bypass them.
Ordinary rooms and centaur match rooms retain their existing hosted assistance.

This service cannot prevent a client from copying public state to an external
solver. Run the LLM in an isolated authenticated match environment with only the
approved Muju endpoint and permitted tools; no repo checkout, engine artifacts,
ordinary-room solver endpoint, shell or network except tool-builder's separately
reviewed sandbox. Record that sandbox and tool allowlist before starting. Never
claim that a room flag alone enforces model-side code/network isolation.

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

The JSON file contains `serverUrl`, `roomId`, `name`, `inviteCode`, integer `seed`,
and absolute `stateFile`. Keep config and state outside git in a private directory
(`chmod 700` directory, `chmod 600` config). The runner joins the invited seat only
when the state file does not exist. It writes the newly issued credential before
search; subsequent starts reuse it, never rejoin and revoke it. Do not point an
existing state file at another server/room/seed.

The state file and atomic temporary file are mode 0600; the sibling `.jsonl` log
contains source hashes, room ID, moves and search measurements, never credentials
or invitation codes. A sibling `.lock` directory prevents concurrent runners on
one journal. A crash may leave `.lock`/`.tmp`; inspect the process and pending
request before manually recovering them. An empty reserved state file after an
uncertain join is an explicit recovery condition, not permission to auto-join.

The runner acquires the real shared heavy-work slot **before joining**, uses
public revision long-polling between turns and one HardEngine per process/game,
sets the seed once, and calls `verifyTurn` again against the returned end key. It
requires the complete player turn (or terminal result) to fit in one atomic HTTP
batch, saves that exact batch before sending, and retries only uncertain network
outcomes. Stale revisions, insufficient room-clock allowance and any verification
failure stop with the journal preserved. No automatic resignation, move repair,
phase-ending fallback or live game is launched by the tests in this change.

No production deployment, real LLM match, Phasing engine match, opening import
controller or strength claim is included in this preparation.
