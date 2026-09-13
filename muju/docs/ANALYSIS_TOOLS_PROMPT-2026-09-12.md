Improve Muju Hono Tanka's MCP interface and agent harness so an LLM can obtain, in very few calls and few tokens, the economic, geometric and tactical facts an experienced player would recognize, without reconstructing them from raw observations.

This is an analysis and usability project, not a balance change. Keep the current rules unchanged. Analysis is read-only, revision-specific, and never mutates a room or advances its revision.

Inspect the existing engine, MCP tools, observation shape, legal-action enumeration, preview, home-checkmate prover, replay module, public skill and tests before designing anything. Reuse authoritative engine logic for every witness. Where the engine already has a bounded prover or path search, expose it rather than reimplementing it.

MOTIVATING PROBLEMS (from the Codex–Claude match)

- Large harvests obscured imminent deposit exhaustion; income fell from 16 to 0 in three turns with no warning.
- Agents counted captures without accounting for upkeep, replacement cost, deployment area, or actions spent.
- Every placement decision required hand-classifying enemy approach squares by action cost (strike-and-retreat vs stranded vs unreachable) and then checking whether the stranded square could be punished next turn, including by fresh purchases. This was recomputed dozens of times per game by both players and drove nearly every decision.
- Spawn rectangles were re-derived every turn and misjudged at critical moments, on both sides (a Tanka used as a forward anchor to drop fires beside enemy miners; an anchor plant moved one square too early).
- Elemental matchups were recomputed constantly and still got wrong in post-game analysis.
- Friendly blockers invalidated apparently simple movement sequences; units sat trapped behind their own plants for turns without either player noticing.
- Two-unit combinations were repeatedly "one action short" and the agent could not tell in advance.
- Expensive pieces faced combinations that were hard to calculate, and the inverse question ("what could survive on this square?") had no tool.
- The decisive strategic fact, turns until the opponent can no longer pay upkeep, was hand-computed every turn.
- Large armies contained many idle miners and poorly positioned combat units.

PRODUCT GOAL

An agent should be able to ask, and get a compact, evidence-backed answer to:
- What is my real economic situation, and what is the opponent's?
- How many turns until either side cannot pay upkeep, assuming nothing changes?
- Can this unit survive the opponent's next turn? Which purchases or promotions change that answer?
- If they take that kill, where does the attacker end up and what can I do to it?
- What would survive on this square? What is the minimum defense that survives?
- How many actions and crystals does this capture really cost, including approach and withdrawal?
- Where can I buy right now, what is blocking me, and what blocks the opponent?
- Which of my units can move at all, and which regions are sealed?
- What are my immediate opportunities and obligations?
- Where are my units wasting income or blocking useful routes?
- Is this proposed end state a proven home-checkmate, and if not, which reply rescues?

Answers contain a conclusion, the assumptions, and executable evidence. The LLM still chooses strategy; the tools remove arithmetic, bookkeeping and exhaustive rule checking.

INFORMATION HIERARCHY (design this first)

Organize everything into four layers so that a normal turn costs one call and an expensive turn costs two or three.

Layer 0, always present in observations returned by observe, play, wait_for_change, join and create:
- Economy headline for both players: treasury, forecast harvest, next upkeep, treasury after next checkpoint, turns-until-upkeep-shortfall under stay-in-place.
- Deployment headline: count of spawnable squares for each player, and whether any enemy unit is currently blocking one of my anchors.
- Draw clock, quiet turns.
- Urgent flags only: a friendly unit killable next turn by existing enemy units, an enemy unit killable this turn by my existing units, a home emergency, a unit with no legal move.
Keep this under roughly 400 tokens. It replaces nothing in the current observation; it is added alongside.

Layer 1, the turn briefing: a single call (or a `briefing: true` argument on observe / wait_for_change) that returns the standard start-of-turn analysis in one compact payload:
- Economy summary for both players with per-unit one-line detail for the requesting player.
- Matchup matrix restricted to units actually on the board.
- Spawn geometry for both players.
- Threat table for every friendly unit with a non-empty threat set, using the compact threat-line format below, existing units only by default, purchases and promotions included when the opponent can afford them.
- Opportunity scan: verified captures, chains, capture-and-withdraw, hanging enemy units, home options.
- Mobility warnings: trapped units, sealed regions, friendly blockers on useful routes.
- A `next` block listing the focused queries that would add information, with ready-to-send arguments.
Target under roughly 1,500 tokens for a crowded position. Everything in the briefing is a summary; details are fetched by reference.

Layer 2, focused queries: one tool with `topics` (or a small family of tools) taking a target unit, square, region or candidate sequence and returning full witnesses. These are the section-by-section requirements below.

Layer 3, deep search: bounded solvers (combined attacks with purchases, checkmate proof, best reply, exchange with searched reply). Always return search metadata and proof status.

Every result at every layer carries the same envelope:
- `revision`, `perspective`, `turn`, `phase`.
- `stateKind`: current | afterHypothetical | opponentNextTurn.
- `hypothetical`: the applied action sequence or its id, and the assumptions used (income credited, upkeep paid, healing applied, purchases permitted, promotions permitted).
- `search`: completeness, budget used, cutoff reason, omitted case classes.
- `next`: suggested follow-up queries with arguments.

TOKEN AND CALL ECONOMY

- Batch: one call accepts multiple topics and multiple targets. Never require a call per square or per unit.
- Compact notation, documented once in the skill: squares as A1–J10; square sets as comma lists; a unit as `id@square def/tier` using the instance ids the observation already returns; a threat line as `attacker → attackSquare, moveActions+1, dmg X vs def Y, result, retreat N`; a witness as the exact play-schema action array so it can be fed to preview or play unchanged.
- Deduplicate: collapse witnesses that differ only in equivalent routes or square ordering; keep alternatives that differ in crystals, actions, final square or attacker identity. Report the collapsed count.
- Diffs: support `sinceRevision` so a briefing after an opponent's move returns only what changed (new threats, cleared threats, economy deltas, spawn-zone changes) plus the urgent flags.
- Detail levels: `headline`, `standard`, `full`. Default `standard`. Witnesses beyond the top few are returned only at `full` or for named targets.
- Never return duplicated observations, the catalogue, or a full board in analysis results. Reference the observation the caller already has.
- Cache against immutable state identity (room, revision, hypothetical action hash) plus the full parameter set.
- Latency budget per call and a size budget per layer; measure and report them on crowded fixtures.

1. ECONOMY

For either player, with optional per-unit detail:
- Treasury now.
- Last actual harvest, labeled historical.
- Forecast harvest from current positions, capped by remaining deposits.
- Next upkeep liability; whether affordable; shortfall; which units would need an upkeep decision.
- Treasury at named checkpoints: after my end-turn harvest, after opponent's start-turn upkeep, etc. Never a single ambiguous "net income."
- Units on exhausted deposits; deposits that empty after the next harvest.
- Turns until upkeep becomes unaffordable under: stay in place, no purchases, promotions, captures or releases, army retained while affordable. Stop the forecast and flag it when an assumption becomes impossible. Do not silently keep an unaffordable army alive.
- Total remaining crystals on the board, by region, and the subset reachable by each player's miners within N actions.

Per requested unit: mining rate, remaining deposit, next contribution, remaining harvests including the final partial one, upkeep, whether economically idle, and the adjacent fresh deposit with its yield and the one-action cost to step onto it.

Optional relocation candidates for a miner: reachable fresh deposits, actual path and action cost, incremental harvest versus staying over a short horizon, occupancy constraints, and whether the destination was tactically checked. Label per-unit candidates as independent unless a joint legal sequence was verified.

2. UNITS AND MATCHUPS

- Matchup matrix for units on the board: for each attacker–defender pair, effective attack after elemental modifier, whether one hit kills, and damage needed to finish a damaged defender.
- Per-unit compact line: element, tier, attack, effective defense, remaining defense this turn, speed, attacks used, chain eligibility, upkeep, canAct, placed-this-turn, promotion eligibility and cost.
- Inverse survival for a square: the minimum defense that survives the opponent's next turn there, and which catalogue units (by element and tier) survive, under the same threat categories as section 5.

3. DEPLOYMENT GEOMETRY

- Spawnable squares for a player now, and per anchor.
- Which enemy units block which of my anchors; which of my units block which enemy anchors.
- Smallest set of squares I could occupy to block every enemy anchor (with the current board), and whether any single square does it.
- Spawn zone after a hypothetical move or capture, since the unit about to move is usually the anchor.
- Home-occupation purchase restrictions applied.

4. REACH AND MOBILITY

- Action-cost distance map for a unit: every reachable square with its action cost, respecting friendly and enemy blockers and the shared budget.
- Approach-square table for a target unit: for each free square adjacent to the target and each enemy unit, movement cost to reach it, whether the attack is possible this turn, and the attacker's remaining actions afterwards. Classify as strike-and-retreat, stranded, or unreachable.
- Sealed regions and exits: which units cannot move; which squares are only reachable through a single entrance; which friendly units are the blockers.
- Region and unit filters; compact square lists.
- Squares reachable for home occupation.

5. THREATS

Focused on one friendly unit, one square, or a hypothetical defender on a square. Batchable.

Categories, kept separate:
- Existing units, no new spending.
- Promotion-enabled.
- Purchase-enabled, including immediate action by fresh units.
- Combined legal sequences mixing any of the above under one four-action budget, one treasury, occupancy and attack-eligibility rules.

Each threat reports: attacker or proposed purchase; element and tier; effective attack against this defender; route and attack square; movement and attack action costs; crystal cost; upkeep assumptions at turn start; defender damage and outcome; attacker final square; actions remaining after the attack; and a witness sequence when verified.

Post-attack exposure, for every verified lethal threat: my best verified reply against the attacker on its final square, including fresh purchases adjacent to it, with cost and proof status. This converts a threat list into a trade evaluation and is the primary output an agent uses to decide whether a square is safe in practice.

Hypothetical defenders need owner, definition or tier, effective defense and any state that affects combat. Define placement and relocation semantics; never overwrite an occupied square or duplicate a unit. An empty square with no defender returns attack profiles by element and value, not a capture result.

Distinguish: maximum single hit; a verified lethal sequence; minimum actions or crystals for a verified kill; a non-lethal damage sequence. Do not add independent attacks together and call it a combination.

6. OPPORTUNITIES AND EXCHANGES

Tactical scan for the active player: immediate wins and home emergencies; verified captures; chains enabled by killing blows; captures needing promotion or purchase; combined attacks within budget; capture followed by verified withdrawal; hanging friendly units under the explicit opponent-turn model; friendly blockers making a useful route impossible or dearer; units with no practical exit; ways to combine a capture and a harvest in one turn.

Exchange evaluation for a candidate sequence: units captured with catalogue values; crystals spent; actions spent; upkeep change; harvest and deposit change; deployment-area change; final positions; whether an opponent reply was searched and what it found. Do not label a trade winning because captured value exceeds spend.

Best reply, when requested: one ply, fixed objectives (kill a target, maximize captured value, occupy home, block purchases), labeled best-found unless proven, with search metadata. Do not present it as minimax.

7. HOME OCCUPATION AND CHECKMATE

- Expose the engine's home-checkmate prover on the current state and on a hypothetical end state.
- When the proof fails, return the rescuing reply and which category it belongs to (existing unit, promotion, purchase, blocker clearing, upkeep choice).
- Minimal blocking set: which squares adjacent to the enemy home, or which entrances to the corner region, must be mine for no reply to reach the occupier, given the current board.
- Occupier survival: for a proposed occupier on the home square, the maximum damage any legal reply can deal, respecting the corner-attack action rule, and which units survive it.

8. TURN TIMING AND HYPOTHETICALS

Every result states source revision, perspective, turn and phase, whether it describes the current turn or the opponent's next turn, and the treasury, upkeep, healing and action-reset assumptions used, and whether purchases and promotions were permitted.

Analyzing the opponent's next turn from a mid-turn position uses an explicit assumption such as "current player ends its turn now." Construct the state with the engine: end-turn income, start-turn upkeep, healing, terminal results, then analyze. Do not credit the opponent with income it would only receive after the hypothetical attacking turn.

Accept `hypotheticalActions` in the play schema, applied with preview semantics, before any analysis. This is the path for "is this destination safe after my full turn" and "does this end state checkmate."

9. CORRECTNESS AND SEARCH LIMITS

Witnesses come from engine transitions and must replay through preview with identical results. Cover: orthogonal paths and blockers; multi-action moves; shared budget across units; immediate action by purchases; purchase control and home restrictions; promotion eligibility and cost differences; upkeep payments and releases; healing and attack resets; elemental modifiers and remaining defense; extra attacks unlocked by kills; blocker removal changing routes; captures changing deployment; immediate victory canceling the rest of a sequence.

Result states: proven_possible, proven_impossible, unknown. A witness proves possibility; a failed bounded search does not prove safety. "Minimum," "cheapest" and "maximum" claims state whether optimality was proven, else "best found" with bounds. Return completeness, budget used, cutoff reason and omitted case classes on every search result.

Prefer reliable focused queries over ambitious global ones.

10. MCP API SHAPE

Choose after inspecting the current implementation. A reasonable shape:
- Enrich existing observe / play / wait results with Layer 0, and add `briefing` and `sinceRevision` arguments to observe and wait_for_change for Layer 1.
- `muju_analyze` with `topics: [...]` from {economy, units, matchups, spawn, reach, mobility, threats, opportunities, exchange, checkmate}, shared arguments `roomId`, `expectedRevision`, `player`, `targets` (unit ids, squares, hypothetical defenders, regions), `hypotheticalActions`, `detail`, `limit`, `searchBudget`, `sinceRevision`, `token` when a seat's private view matters. Separate tools per topic are acceptable if a batch call still exists.
- Every response ends with `next`: concrete follow-up calls with arguments filled in.

11. HARNESS AND DOCUMENTATION

Update the public skill and tool descriptions to teach this workflow:
- Turn start: read the observation and its briefing. Usually enough.
- Before exposing a valuable unit: threats on that unit after `hypotheticalActions` for the whole proposed turn, purchases and promotions included, and read the post-attack exposure.
- Before a complex exchange: verify the sequence, read the exchange evaluation and searched reply.
- Before a home attempt: checkmate proof on the hypothetical end state.
- After committing: use the authoritative returned state; wait for a revision change; request the diff briefing rather than re-analyzing an unchanged board.
Explain when the briefing suffices and when a deeper query is worth its cost. Analysis is advisory and revision-specific; commit through the validated play path only.

12. VALIDATION AND DELIVERY

Tests around difficult semantics: a large harvest followed by collapse; partial deposits and upkeep timing; a defender safe from current units but not from a fresh purchase; a promotion changing an outcome; two independently possible attacks that cannot combine; a blocker-clearing sequence enabling an attack; a chain legal only after the first kill; a hypothetical move changing coverage; search exhaustion returning unknown; witnesses replaying through preview; analysis leaving room state unchanged; spawn geometry after a move; sealed-region detection; post-attack exposure producing a verified reply; checkmate prover rescue categorization; starvation clock stopping when an assumption breaks.

Fixtures: record the full Codex–Claude room history through the replay module and select revisions by hand. Suggested: 13 (bait geometry with punishable and unpunishable stranded squares), 19 (Tanka as forward spawn anchor beside enemy miners), 23 (Hono killing an anchor that had just been placed), 29 (Hono chain kill), 31–33 (upkeep starvation and idle army). Prefer self-contained fixtures over the public server.

Measure response size and latency per layer on crowded positions.

Deliver: engine-backed analysis tools; updated skill and MCP descriptions; tests and benchmarks; example compact responses for each layer; a concise account of what is exact, what is bounded, and what remains unsupported.

Success criterion: a normal turn needs one call, an exposed or complex turn needs two or three, and every answer states its own limits.
