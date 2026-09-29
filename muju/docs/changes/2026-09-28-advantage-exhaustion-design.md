> Superseded implementation decisions: the owner selected local subscription CLI
> management, mandatory 0.5–18.5 komi, initial handicap 9.5, Astra 6 / Opus 5.5
> high, and human qualitative sufficiency judgments. See `../EXPLORER.md` and
> `2026-09-28-explorer-implementation.md` for the implemented protocol and checks.
> The text below preserves the initial design discussion.

# Two-player advantage exhaustion explorer — proposed design

Status: design and repository assessment, 2026-09-28. No mode implemented,
model calls made, matches played, or deployment performed by this document.
Inspected source: `6e4e18e3a34e9cc0acd6a63d93a469fb3228fafc`.

## Purpose

Let two LLM players repeatedly challenge a decisive result by replaying from
the losing side's latest credible alternative. Preserve a navigable game tree
and auditable evidence about whether Black's crystal handicap survives better
play. This explores known alternatives; a finite run cannot prove that all
winning possibilities have been exhausted or that a handicap is sufficient.

## Existing foundations and actual gaps

| Foundation | Inspected source | What is still needed |
| --- | --- | --- |
| Persistent authoritative rooms, revision checks, idempotent actions and SQLite transactions | `server/rooms.ts`, `server/schema.ts` | A persistent experiment lifecycle above individual rooms. |
| Compressed before/after positions, recorded root, public move history and position lookup | `server/rooms.ts` (`position`, `moveHistory`), `src/game/moveHistory.ts` | Explicit complete-turn checkpoints, including turns with no visible move event; a validated server-side fork operation. |
| Local private variations from an online position | `src/components/AnalysisScreen.tsx`, `src/game/analysis.ts` | Shared, durable branches, lineage, seat admissions and branch comparison. Current variations live only in component state. |
| MCP play, preview, legal actions, observation, wait and analysis | `server/mcp.ts`, `server/stdio.ts`, `server/observation.ts` | Experiment tools, independent estimate submission and reliable experiment notifications. |
| Configurable Black starting crystals | `src/game/rules.ts`, `server/schema.ts`, `SPEC.md` | Run configuration and comparison reports. Current creation choices are 0 or 0.5, 1.5, …, 19.5. |
| Room-wide assistance tiers | `server/matchPolicy.ts`, `server/matchScope.ts` | Freeze and report a common tier for both seats. The existing strict single-room listener cannot follow a multi-room experiment without an explicit scoped extension. |
| Generic Anthropic call client elsewhere in this repository | `platform/packages/llm/src/client.ts` | Muju has no integrated, autonomous two-LLM runner. This package is a possible adapter foundation, not a ready Muju player. |

The canonical room revision is currently `muju-phasing-4`. Pin the source
revision and setup policy too: the half-crystal setup change did not bump that
rules revision. This mode needs no change to piece stats or game rules.

## Proposed first-version protocol

Defaults below are recommendations, except the user's requested 5-game and
100-move limits. They remain visible configuration in the experiment manifest.

1. Create an untimed experiment with one handicap, two fixed player identities,
   identical assistance permissions, `maxGames: 5`, and `maxPlies: 100`.
   One game is the original attempt or a newly created continuation. One ply
   is one player's full Act → mining/upkeep → Prepare → handover turn.
   White and Black together consume two plies. Individual actions, movement
   hops and MCP calls are not the move-budget unit.
2. Save an initial checkpoint and a checkpoint after each full turn, including
   handover and automatic arrivals. Freeze further play until both seats have
   assessed that identical position. Each submits immutable probabilities
   `{whiteWin, draw, blackWin}` summing to 1, plus a short position-based
   explanation, bound to checkpoint ID and state hash. Ask about eventual
   rule outcomes against the configured opponent, not material advantage.
3. Keep each estimate private until both are submitted; then reveal the pair.
   Never let the second player see the first estimate before committing its
   own. Record missing estimates or agent failure as incomplete, not loss.
   Two independent submissions prevent direct copying but do not guarantee
   independently calibrated judgments, especially for identical models.
4. Stop an attempt at a canonical terminal result, or when both players assign
   at least 90% to the same side winning at two consecutive checkpoints.
   Confirmation length is configurable; setting it to one implements the
   user's immediate-consensus version. Any disagreement breaks the streak.
   A restored fork starts a fresh streak. A 90% consensus is an experiment
   adjudication, stored separately from a rules win; do not falsify the room's
   canonical winner or turn it into a resignation.
5. The losing player reviews decision checkpoints along this attempt's full
   ancestry. The default suggestion is its latest own turn-start position
   where its recorded win probability was at least 33% and it can propose an
   untried legal continuation. Use the estimate recorded at that time, not a
   retrospectively inflated number. The loser chooses the checkpoint and
   provides the alternative plan and brief reason. It may choose an earlier
   checkpoint or explicitly nominate a below-threshold candidate; record
   that override rather than silently claiming it met the 33% criterion.
6. Create a child room from the exact saved state before that decision. Keep
   colors, handicap and rules fixed; restore bank, board reserves, mined totals,
   kill clock, pending summons, piece status and turn/phase exactly. Do not
   re-award the handicap, repeat arrivals or mine again on restoration.
   Never rewind or overwrite the parent room. Do not copy parent credentials,
   idempotency receipts, undo stacks, pending stages or transport clocks.
7. Validate and commit a genuinely different first full turn for the losing
   side. Compare normalized action plans and resulting canonical state against
   previously explored outgoing continuations from this checkpoint; splitting
   a move into different request batches must not manufacture a new branch.
   The alternative can share early actions but must diverge by the end of the
   first turn. Illegal or duplicate proposals receive bounded correction
   attempts and consume inference budget. The opponent then responds freely.
8. Repeat with the loser of each new attempt. Preserve both agents' learning
   within the experiment and record the memory policy. Give both the same
   public branch results; do not share private reasoning or another seat's
   credentials. Ancestor checkpoints remain eligible. When an alternative is
   exhausted at one checkpoint, move earlier. "No credible alternative
   nominated" is a valid stopping reason, not a proof of impossibility.

Stop when either budget is reached. The original game counts toward five;
inherited history costs no new plies. Reserve/charge one ply atomically when
the next turn first mutates the game, count a terminal partial turn as one,
and never admit turn 101. Resuming an already charged partial turn does not
charge twice. Export completed and partial counts separately. A game-cap
prevents starting a sixth attempt; a move-cap can leave the fifth or an earlier
attempt unfinished. At the limit, record truncation and do not infer a winner.

Draws, disagreements, disconnects and lack of candidates have explicit
outcomes. Default: a rules draw ends this experiment without selecting a
loser; a separate fresh-root run can follow. A disconnected agent pauses the
experiment for resumption. Bounded per-request retries and a per-run inference
or cost ceiling supplement the game budget for a hosted runner: 100 plies alone
does not bound model spend. Ordinary game clocks should be off in the first
version so assessment latency does not create timeout wins.

## Implementation units

1. **Experiment store and controller.** Add a transactional SQLite store for
   immutable config, authenticated seats, games/parents, checkpoint snapshots,
   probability submissions, adjudications, selected alternatives, durable
   receipts and shared budget counters. State machine: waiting for players →
   assessing → playing → assessing → adjudicated/terminal → choosing a fork →
   next attempt, with paused/completed states. Persist before notifying clients;
   interrupted requests and server restarts must not duplicate moves or forks.
2. **Room integration.** Refactor room initialization enough to accept a trusted
   server checkpoint with explicit rules validation. Add experiment metadata
   and lifecycle guards to all mutation paths, including HTTP, MCP and staging,
   so a direct play call cannot bypass assessment, budget or frozen-parent rules.
   First version disables undo/staging in experiment rooms. Existing ordinary
   rooms retain their behavior. Use one transaction boundary for room writes,
   checkpoints, budget charges and experiment transitions.
3. **Transport and agents.** Proposed MCP tools: `muju_create_experiment`,
   `muju_join_experiment`, `muju_experiment_status`, `muju_submit_assessment`,
   `muju_choose_branch`, and `muju_wait_for_experiment`. Existing play and
   analysis tools still operate on the active room. HTTP and the stdio bridge
   expose the same controller. Authenticate the assessing/choosing seat; use
   expected experiment version and request ID for safe retries. A seat obtains
   only its own child-room credential. Update the public Muju skill with the
   new loop, budget semantics and reconnect behavior.
4. **Online interface.** Add "Advantage exhaustion explorer" setup, player
   connection status, current board, two estimate curves, attempts/plies left,
   a branch tree with fork reasons and stop labels, parent/child comparison,
   pause/resume, and JSON/CSV export. A browser reload resumes by experiment ID.
   Reuse the board and history UI; no browser tab must be kept open to preserve
   experiment state. External agents still need their own running clients.
5. **Evidence export.** Include rules/source/setup identity, original board,
   handicap, model/version/settings, prompt and tool policy, memory policy,
   timestamps, available inference usage, checkpoint hashes, action sequences,
   forecast pairs, lineage, retry reasons, exact stop reason and outcome type.
   Keep secrets out of public logs and exports. External clients must report
   their identity and usage; mark those as self-reported or unavailable.
6. **Optional hosted runner.** If one-click unattended operation is wanted,
   add provider adapters, two isolated conversation contexts, a durable worker,
   tool-call loop, structured response validation, timeout/retry policy, rate
   handling, cancellation and token/cost accounting. Provider credentials stay
   on the worker/server. Configure actual models and spend limits before live
   use. The MCP-first experiment protocol can be built without API keys.

The first version should use external MCP players unless the owner selects
hosted execution. It accepts a single handicap per experiment; a later batch
launcher can run a registered schedule of independent roots and color swaps.

## How this supports handicap evidence

The primary exploratory question is: **does White's advantage survive Black
being allowed to revisit its own mistakes?** Also record whether White can
recover after a Black success. A simple branch win count discards that useful
structure and overweights whichever line received the most retries.

Report, per handicap, first-attempt results, terminal versus consensus results,
whether the initially losing side found a reversal, number and depth of retries,
latest successful recovery checkpoint, remaining unresolved candidates and
budget truncations. Five continuations from one root are one related search
tree, not five independent observations of a handicap's win rate.

For a stronger eventual conclusion, run multiple independent experiments with
the same model/effort/tool budgets on both sides, plus color-swapped pairs when
using different models. Reset memory between independent experiments and
freeze lessons before a separate validation set. Stratify results by protocol,
handicap and rules/source identity. Use experiments or matched pairs as the
sampling unit, not child branches. A finite sample supports a statement about
the tested opponents and budgets; it does not establish perfect-play balance.

Before interpreting "sufficient," select the target: approximately even score
under this protocol, or Black reliably retaining a viable line after retries.
The explorer can collect useful evidence before a numerical success criterion
is chosen, but it must not announce an optimum handicap without that criterion.
Estimate calibration can later be measured on attempts actually played to a
rules result; automatically censored 90% adjudications cannot validate their own
forecast accuracy. Allow terminal-only runs or a preselected continuation
sample to audit the consensus cutoff.

## Acceptance and release work

- Server regressions: exact restoration with fractional grants, pending summons,
  mining/upkeep and kill clock; no re-credit; immutable parent; stale/duplicate
  requests; genuine divergence; alternating losers; branch exhaustion.
- Controller regressions: both estimates bind the same state, hidden until both
  commit, draws and ties, threshold equality/confirmation reset, ancestry
  candidates, strict global limits, terminal partial turns, restart at every
  state transition, failed or disconnected agents, ordinary-room compatibility.
- Transport/browser checks: HTTP and stdio tool parity, seat isolation, no
  budget bypass through ordinary play, two agent simulators complete a small
  branching run, observer reload/reconnect, mobile controls and valid export.
- A real-model pilot is separate from protocol tests and requires actual
  connected agents or configured provider credentials. Record observed cost
  and completion behavior before planning a large study.
- The assessed DAG closure command is
  `python3 tools/muju-content-dag.py plan --kind online --kind mcp --kind ui`.
  Add the new controller/report paths to the inventory during implementation;
  include persistence and balance consumers explicitly where needed. Run the
  planner on final changed paths and record each affected node's disposition.
- Release gates from `ONLINE.md`: build, server types, tests and online e2e.
  Pages frontend and Render host/tool publication are separate releases. Verify
  experiment continuation across a host restart and existing room preservation.
  Review Academy R10's online-flow claims; record unchanged evidence or actual
  affected claims before deciding whether its media/release is involved.
  No release or Academy completeness is claimed by this design.

## Input needed from the owner

The architectural choice is external MCP players versus hosted model calls.
For real games, identify both players/models and their effort/context budgets.
Hosted execution also needs configured provider access and a maximum spend per
experiment; external execution needs two running agent clients. No credentials
need to be pasted into chat.

Choose the first handicap or comparison range and what "sufficient" should
mean for the final study. Suggested protocol defaults are 5 games/100 new plies,
90% bilateral agreement at two checkpoints, 33% retry suggestions, untimed play,
equal tool access, and retained learning within one experiment. These details
can be implemented as configurable settings without delaying the foundation.
