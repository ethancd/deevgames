# Muju MCP tools: trigger-action plans for agent players

Audience: any Claude or Codex session about to play Muju Hono Tanka through the
MCP at `/mcp` (live: `https://deevgames-muju.onrender.com/mcp`). This is a
checklist of *when* to call each tool, written after two rapid games lost by an
agent that had every tool available and used almost none of them for judgment.
Rules and schemas live in `muju_rules` and `public/skills/muju-hono-tanka/SKILL.md`;
this file is only about habits.

A TAP is "if <trigger>, then <action>". Follow them mechanically. The engine's
bounded search is cheaper and more reliable than hand arithmetic, and the two
decisive blunders in the 2026-09-12 games (a Hi left in reach of a speed-1
Straumr; a Straumr promoted to "safe" defence 3 the turn before the enemy
promoted to a 3-attack Aegirinn) were both `proven_possible` kills that
`muju_analyze` would have reported in one call.

## The per-turn loop (three calls, not seven)

1. **Opponent's turn:** `muju_wait_for_change({afterRevision, briefing:true, player})`.
   Do not follow it with a separate `muju_observe`; the changed result already
   carries the room and briefing.
2. **Turn start:** decide a candidate batch, then `muju_stage` it immediately
   (timed rooms). Now the clock cannot beat you to a reasonable move.
3. **Verify:** one `muju_analyze` with the candidate as `hypotheticalActions`
   (through `END_PLACE_PHASE` — the *whole* turn, including mining/upkeep and
   preparation), topics `threats,spawn`, targets = your units
   worth more than a Hi, `deep:true`. Play only if nothing you care about is
   `proven_possible`. Otherwise fix and re-stage.
4. **Commit:** `muju_play` the batch ending in `END_PLACE_PHASE`, or let the stage fire.

Put step 3 behind a script gate so it costs no thinking time: the script runs
analyze, prints only `proven_possible` lines, and refuses to play if any hit a
named unit.

## Before joining

| Trigger | Action |
|---|---|
| About to join any room | `muju_rules`, then `muju_time_awareness` if the room is timed. White's clock starts the moment Black joins, so decide turn 1 before joining. |
| Reading `ruleset` out of a response | The two tools differ. `muju_rules` returns an **object**: `ruleset: {name:'phasing', revision, immutable, retired:['standard']}` — read `ruleset.name`. `muju_observe` still returns the bare **string** `ruleset: 'phasing'`. Code that treated `rules.ruleset` as a string was written before 2026-09-21 and must be updated. |
| Opponent has played you before | `muju_history` on the old room (public, no token). Look for their opening unit path and promotion timing. In both 2026-09-12 games Codex went Sjor → Straumr → Aegirinn by turn 4; the notes only recorded the later Tanka half. |
| Unsure about a schema or phase rule | Create an untimed scratch room, join it yourself with the invitation, and try the call. `END_PLACE_PHASE` is **always required** to hand over, including when nothing is affordable; buy schema is `{type:"BUY_UNIT", definitionId, position}` and commits a public pending summon. Resign the scratch room afterwards. |

## Observation tools

| Tool | Trigger | Action |
|---|---|---|
| `muju_observe` | Turn start when you did not arrive via a wait result; after any surprise | Always pass `briefing:true` and `player`. Read `briefing.sections.spawn` for your count, `threats` for headline single-hit lines, `miners` for `leftN` per unit. |
| `muju_observe` | Own spawn count is 0 or 1 | Fix it this turn. Move a unit outward or leave an interior square empty. Two games were lost partly to a full spawn rectangle. |
| `muju_observe` | Any miner shows `left` ≤ 3 | Plan its replacement now. Home 10-cells run dry in about four turns; the opponent that moves Mujus onto fresh 10s wins the income race. |
| `muju_observe` | `quietTurns` is within three of `drawAtQuietTurns` (17 of 20) | The remaining kill-free hand-offs end the game in a draw. Ahead on material or territory: spend the turn on a kill, because only an attack that removes a unit resets the clock — income, movement, purchases, promotions and upkeep losses do not. Behind: keep it quiet. Read both numbers from the observation instead of counting turns yourself; the limit moved from ten plies to twenty on 2026-09-19. |
| `muju_observe` | Briefing threat list is empty | Do **not** read this as safety. It scans existing single hits only; promotions, purchases and combinations are omitted. Run `muju_analyze`. |
| `muju_wait_for_change` | Opponent's turn | Pass `briefing:true`, `player`, and the last revision. Act only when `room.activePlayer` is your seat. Stop on `phase:"victory"`. |
| `muju_wait_for_change` | Result shows the opponent bought or promoted | Re-derive threats before touching your stage; a promotion changes attack values (Straumr 2 → Aegirinn 3 was the kill in game 2). |
| `muju_legal_actions` | Turn start | Read `total` and skim purchase squares. Do not filter output so aggressively that promotions or enemy squares disappear; that cost an extra round trip in game 2. |
| `muju_legal_actions` | You believe a move is legal but want the cost | Filter by `unitId`; it lists `actionCost` per destination, so path arithmetic is unnecessary. |
| `muju_clock` | After any long think or before a second analysis | Cheap fresh read. Timestamps in your context do not tick. |
| `muju_history` | Something on the board surprised you | Refresh the last turn rather than guessing what died to what. |

## Analysis tools

| Trigger | Action |
|---|---|
| About to end a turn that leaves any unit costing 5 or more where an enemy could reach | `muju_analyze({topics:["threats"], targets:{unitIds:[...]}, hypotheticalActions:<whole turn>, deep:true})`. Read `kill`: `proven_possible` means move it; `unknown` means read `search.cutoffReason` and `omittedCaseClasses`; only `proven_impossible` with a complete scope is safety. |
| Choosing a square for a unit ("where can this Hi stand?") | `survival` topic with `targets.squares` for the candidates. This is exactly the turn-3 question in game 2, answered by hand and answered wrong. |
| Enemy unit sits near your cluster | `exchange` and `reply` topics on it: can you kill it this turn, and what does it cost. Damage stacks within one turn, so the answer is often a combination (Aegirinn 3 + Yan 2 kills an Aegirinn; you need 5 on a Tanka). |
| Considering a home attempt or the enemy has a unit adjacent to your home | `checkmate` topic before moving. The server resolves proven home-checkmate immediately, with no reply turn. |
| Planning a forward anchor | `spawn` topic with the anchor move as the hypothetical. Check `blockingSet`: if one cheap enemy unit can step into the rectangle, the anchor is not worth the trip. Game 2's Aegirinn walked 8 squares to anchor a rich patch and a 3-crystal Hi blocked it next turn. |
| Any enemy within 5 squares of a valuable unit | Remember speed-1 units still cover 3 squares plus an attack in 4 AP. `reach` topic lists this; do not trust a mental "it's slow". |
| Result says `truncated` or a cutoff reason | Split targets or topics across two calls instead of accepting the partial answer. |
| Untimed room or bank comfortably above 5 minutes | Use `muju_preview` on the final batch too: it shows the post-move board and the same exposure lines. |

## Play and staging tools

| Trigger | Action |
|---|---|
| Timed room, your turn just began | `muju_staged` for the version, then `muju_stage` your best current candidate with `commitWhenRemainingMs` around 120000. Threshold must not exceed delay + bank (630000 on rapid). Never stage only a pass unless you have no candidate at all. |
| A better batch emerges after analysis | Re-stage with a new `requestId` and the current version, or commit directly with `muju_play`. A live handoff clears the stage. |
| Candidate depends on the enemy not having moved | Add up to three `fallbacks`; the server tries them in order and never repairs a batch itself. |
| Playing after a buy that leaves you unable to afford anything | Send `END_PLACE_PHASE` anyway. Preparation never ends by itself: omit it and your own turn stays open against your clock until it expires. |
| Uncertain network outcome | Retry the identical body and `requestId`. Never invent a new ID for a retry. |
| A batch was rejected | Read the error index. The whole batch is atomic; nothing applied. Refresh the room and legal actions before retrying. |
| You realise a committed sub-step was wrong, same turn | `UNDO` alone via `muju_play` while `canUndo` is true. It does not refund time. |
| Bank under about 90 seconds | Stop analysing. Play the staged candidate or the simplest legal batch, ending with `END_PLACE_PHASE`. Spending all AP does not end the turn. |

## The turn shape: summons, arrivals and the two end commands

Muju has one rule set, and its turn is Act → `END_ACTION_PHASE` (mine, then pay
upkeep) → Prepare → `END_PLACE_PHASE`. A purchase is a **public pending summon**
that arrives a full turn later. The 2026-09-12 habits above were written for a
turn that no longer exists; these are the additions.

| Trigger | Action |
|---|---|
| You are about to send a turn batch | Count four parts: actions, `END_ACTION_PHASE`, any `PAY_UPKEEP` and preparation, `END_PLACE_PHASE`. A batch that stops at `END_ACTION_PHASE` has not handed over and your clock is still running. |
| You committed a `BUY_UNIT` | Nothing appears this turn and nothing can act. The square, type and cost are public the moment you commit: the opponent sees the summon and gets one whole turn to answer it. |
| The opponent has a pending summon | Check the **arrival rectangle**, not just the square. Standing a unit on the square, or putting any unit of yours inside every rectangle that supports it, makes the summon vanish. It refunds their full original cost, so you gain the tempo, not the crystals. |
| You are choosing a `BUY_UNIT` square | Two tests apply. At **commit** time the square must already be empty, inside one of your current unblocked spawn rectangles, and free of another own commitment, or the action is illegal — and the batch is atomic, so it takes your whole turn with it. Read the squares from `briefing.sections.spawn` or `muju_legal_actions`; never copy a square from an example. (At the opening, White's `B1` holds White's own Hi.) |
| Your summon's square may be contested | Once committed, only the arrival-turn board decides whether it survives. A temporary intrusion that leaves before your turn start is harmless; a piece still sitting there at your turn start kills the summon and refunds it. Re-check with `spawn` on the arrival-turn hypothetical, not on today's board. |
| A summon of yours was disrupted | The refund is automatic and exact, and it is available during the arrival turn, including that turn's upkeep and preparation. There is no relocation and no replacement purchase. |
| A piece of yours arrived this turn | It can act immediately in Act, **and** it may promote at that same turn's Prepare. This is the fastest legal climb; plan the promotion crystals before you spend in Act. |
| You want this turn's income to fund a promotion | It does. Mining settles at `END_ACTION_PHASE`, before Prepare, so read `resources` *after* sending `END_ACTION_PHASE` and decide preparation then. |
| Planning a home invasion | The invader must survive its own end-of-action upkeep before immediate home-checkmate is adjudicated. Preview `END_ACTION_PHASE` and any required `PAY_UPKEEP` first, or `checkmate` reports `unknown`. |
| Counting the draw clock | Summoning, arrival and refunds are **not** progress. Only an attack that removes a unit resets the clock, and the clock advances at `END_PLACE_PHASE`. |

## Habits that cost the 2026-09-12 games

- Treating analyze as a luxury under clock pressure. Each call is under a second
  of server time; the cost is a thinking cycle, so script it.
- Trusting the briefing's threat headline as a complete threat model.
- Hand-computing reach and getting speed-1 units wrong.
- Buying miners onto half-depleted cells and not watching `left`.
- A single far anchor with no defender, blocked by a 3-crystal unit.
- Filtering tool output so hard that the board itself was hidden.
- Ninety seconds per turn on a 30-second delay. Pre-compute candidates during
  the opponent's turn; the wait result already includes the briefing.
