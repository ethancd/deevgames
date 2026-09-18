export const meta = {
  name: 'muju-hard-ai-understand',
  description: 'Map the Muju rules engine, current AI, lab harness, two weeks of strategy learning, game records and engine-technique literature; synthesize a strategic model and engine gap list',
  phases: [
    { title: 'Read', detail: 'six parallel readers, each writes a map doc' },
    { title: 'Synthesize', detail: 'integrated strategic understanding + engine gaps' },
    { title: 'Critique', detail: 'completeness critic, then targeted gap-fill readers' },
  ],
}

const WT = '/Users/ashkie/src/deevgames-muju-hardai'
const MJ = WT + '/muju'
const OUT = MJ + '/docs/hard-ai/understand'

const COMMON = `
You are working in the git worktree ${WT} (branch claude/muju-hard-ai). The game is under ${MJ}.
Hard constraints: work ONLY inside ${WT}; never touch /Users/ashkie/src/deevgames (the main checkout) or any /private/tmp worktree; do not run git commands that change state (no commit/checkout/stash/reset); do not start dev servers; do not modify existing source files. You MAY create new files under ${OUT}/ only.
Use Bash (cat, sed -n, grep, find, sqlite3, node) to read. Read whole files where they matter; you have a large budget and the goal is exhaustive, correct understanding.
Today is 2026-09-14. "Last 1-2 weeks" means 2026-09-01 onward; git log --date=short in the worktree shows dates (note: the HEAD commit is a snapshot of uncommitted work from 2026-09-13/14).
Your deliverable is a markdown document written to the path named below, AND a structured return. The document must be concrete: cite file paths with line numbers (path:line), quote exact numbers (costs, stats, budgets, thresholds), and separate "verified in code" from "claimed in docs" from "my inference".
`

const READ_SCHEMA = {
  type: 'object',
  properties: {
    docPath: { type: 'string' },
    summary: { type: 'string', description: '10-20 sentence summary of what the document establishes' },
    keyFacts: { type: 'array', items: { type: 'string' }, description: 'the 15-40 most important concrete facts, each self-contained with numbers and file refs' },
    openQuestions: { type: 'array', items: { type: 'string' } },
    filesRead: { type: 'array', items: { type: 'string' } },
  },
  required: ['docPath', 'summary', 'keyFacts', 'openQuestions', 'filesRead'],
}

const READERS = [
  {
    key: 'rules-engine',
    prompt: `${COMMON}
TOPIC: The canonical Muju rules engine and its API, as a foundation for a fast deterministic search engine.
Read ALL of ${MJ}/src/game/*.ts (every file, fully), ${MJ}/SPEC.md (fully), ${MJ}/lab/docs/SPEC_AUDIT.md, and the game tests under ${MJ}/tests/game/ as needed to confirm semantics.
Document, in ${OUT}/rules-engine.md:
1. The GameState shape (types.ts) field by field: what is mutable per turn, what is derived, entity id scheme, per-unit flags (moved/attacked/attackedThisTurn/lastKillFlag/damageTaken/placedThisTurn/promotedThisTurn), turn phase machine, action budget accounting, draw clock, upkeep state, handicap.
2. The full turn lifecycle in exact order (start-of-turn home occupation victory, elimination check, upkeep + keep-set choice, heal/reset flags, Place phase auto-skip rule, Action phase, end-of-turn passive mining, inactivity counter, ten-quiet-turn draw, turnNumber increments).
3. Every action type and its legality predicate: MOVE (BFS path cost = ceil(squares/speed), blocking), ATTACK (adjacency, element ±1, DEF floor, damage accumulation, elimination, Cleave chain rules by tier), BUY/PLACE (tier-1 only, cost table, spawn rectangle definition: home corner to any own unit as anchor, blocked if an enemy is inside; empty squares; blank squares walkable and spawn-eligible), PROMOTE (cost 4 to tier 2, 8 to tier 3, only units on board at start of Place, once per turn), END_PLACE_PHASE, END_TURN, and the online "move-and-attack" combined action if it exists in the engine.
4. The unit catalogue (units.ts) as a table: 18 units, element, tier, cost, ATK, DEF, SPD, Mining, upkeep; the element advantage cycle; the exact promotion ladder per element with names (e.g. Sjor→Straumr→Aegirinn, Hi→Hono→Kagari, Muju→Sachita→?, Inyan→Mazask→Tanka, Radi→?→?, Göl→?→Karanlık). Derive and include the full kill table: for each attacker unit vs each defender unit, does one attack kill (ATK±1 >= DEF)? And the two-attack combos.
5. The resource map (resourceMap.ts, board.ts): exact 10x10 crystal layout for new games (v2.8: 0/4/8/16, 504 total), home corners, blank squares, rich patches; the mining rule (min(Mining, reserve) at end of mover's turn).
6. The victory conditions (victory.ts, homeCheckmate.ts): elimination, home occupation at start of turn, "proven home checkmate" resolved before the reply turn, draw by ten quiet turns, resignation. Explain the exact homeCheckmate proof algorithm and its scope.
7. The public API a search engine should call: exact function names and signatures for cloning state, enumerating legal actions, applying actions immutably or mutably, computing spawn rectangles, BFS reach, upkeep application, victory check. Note performance characteristics (allocations, immutability, Map/Set use) and what a fast engine would need to reimplement in a compact representation.
8. Any spec-vs-code divergences you find, and any rule that is easy to get subtly wrong (e.g. purchases resolve before moves so a fresh unit blocks own paths; income cannot fund same-turn promotion; chip damage heals at owner's turn start).
Return the structured output.`,
  },
  {
    key: 'current-ai',
    prompt: `${COMMON}
TOPIC: The current Muju AI: architecture, what it actually computes, its budgets, and its weaknesses.
Read ALL of ${MJ}/src/ai/**/*.ts (every file, fully, including planner/, search/, tactics/, eval/, worker/, wasm/), ${MJ}/assembly/tactics.ts (the AssemblyScript kernel), ${MJ}/asconfig.json, the AI tests under ${MJ}/tests/ai/, and the docs ${MJ}/AI_ENGINE_README.md, ${MJ}/AI_ENGINE_PLAN.md, ${MJ}/AI_ENGINE_QUESTIONS.md, ${MJ}/docs/AI_IMPLEMENTATION_STATUS.md, ${MJ}/docs/AI_CORRECTNESS-2026-09-07.md, ${MJ}/docs/AI_IMPLEMENTATION_PLAN-2026-09-07.md, ${MJ}/docs/PLACEMENT_SIMPLIFICATION-2026-09-09.md. Also read how the UI invokes the AI (${MJ}/src/hooks/useGameState.ts, worker client) and how difficulty presets are defined.
Document, in ${OUT}/current-ai.md:
1. The decision pipeline end to end for one AI turn: inputs, tactical overrides (elimination wins, home rescue), root candidate generation (beam planner, templates, placement candidates), MCTS/UCT over what, the sharpener, the WASM tactical DFS (what it proves: proved/disproved/unknown; ABI 6; scope limits), how the final action list is chosen and executed action by action with replanning.
2. The evaluation function in full: every feature in evaluation.ts, how each is computed, DEFAULT_WEIGHTS values, perspective handling, income projection, tier tracking. Flag features that are proxies rather than ground truth.
3. Difficulty presets table (Easy/Medium/Hard): time ceilings, DFS visit caps, beam width, MCTS iterations; fixed-work vs wall-clock mode; worker protocol; JS fallback.
4. The simulate.ts transition: how it relates to the canonical src/game transition (shared legality? divergences?), cost per node, cloning strategy.
5. Concrete weaknesses, each with evidence: e.g. search horizon (does it ever look past the opponent's reply?), no transposition table, no iterative deepening, purchases outside the proof, evaluation blind spots (spawn-strike threats from fresh purchases, reach of speed-1 units, crystals left under miners, upkeep vs income trajectory, draw-clock awareness, anchor value), move-ordering, nondeterminism sources (seeded RNG? Date.now anywhere?). Cross-check against the napkin lessons in ${OUT}/napkin-snapshot.md (Muju rows) and the strategy docs in ${MJ}/docs/STRATEGY_GUIDE-2026-09-12.md.
6. How the lab evaluates AI strength today (${MJ}/lab/ai/run.ts, compare-production.ts, fixtures.ts) and what the last measured results were (${MJ}/lab/results/ai-wasm-2026-09-07/ summaries).
7. Which parts are worth keeping as-is, which to wrap, which to replace, in your judgment.
Return the structured output.`,
  },
  {
    key: 'lab-harness',
    prompt: `${COMMON}
TOPIC: The Muju lab: the simulation harness, bots, static solver, experiments and what the recent experiments (2026-09-07 to 2026-09-14) established.
Read ALL of ${MJ}/lab/harness/*.ts, ${MJ}/lab/ai/*.ts, ${MJ}/lab/solver/*.ts and README.md, ${MJ}/lab/docs/*.md, ${MJ}/lab/tools/*, ${MJ}/lab/maps/* (skim), and the experiment scripts under ${MJ}/lab/experiments/ with emphasis on: four-actions/, opening-census-2026-09-14/, handicap-census-2026-09-14/, alternate-map/, depth-economy/, e16-upkeep-*.ts, home-*.ts. Read the summaries/markdown/json in ${MJ}/lab/results/ for: four-actions-2026-09-12, opening-census-2026-09-14, handicap-census-2026-09-14, alternate-map-2026-09-12, depth-economy-2026-09-09, current-static, balance-followup-2026-09-08, draw-ten-2026-09-08, ai-wasm-2026-09-07 (do NOT cat the multi-hundred-MB games.jsonl or .bin files; use head/wc/jq -c on the first lines only). Also read the package.json scripts and the harness bots directory.
Document, in ${OUT}/lab-harness.md:
1. How to run a game between two bots headlessly: exact commands, the Bot interface (types.ts), the runner loop, invariants checked, RNG seeding, how results are written, timing per game. How to plug a NEW engine in as a bot. How compare-production.ts pits engines against each other and what "league" and "tactics" modes do.
2. Existing bots and their strength ordering, if measured.
3. The static value solver (lab/solver): what it models, its outputs for the current v2.8 catalogue (lab/results/current-static/current.md), and whether its unit values are usable as evaluation priors.
4. For each recent experiment: the question, the method, the headline numbers, and the strategic conclusion (e.g. what did the opening census find about the best first turns? what does the handicap census say about White/Black balance? what did four-actions change about kill combos and reach? what did expansion-economy/depth-economy establish about income trajectories and when stacks run out?). Be precise and quote numbers.
5. Gaps: what experiments a Hard-AI project would need that do not exist yet (e.g. engine-vs-engine ladder at fixed budgets, Elo estimation, position test suites, perft-style transition validation).
Return the structured output.`,
  },
  {
    key: 'strategy-docs',
    prompt: `${COMMON}
TOPIC: Everything that has been LEARNED about how to play Muju well in the last two weeks, as documented in prose.
Read fully: ${MJ}/docs/STRATEGY_GUIDE-2026-09-12.md, ${MJ}/docs/strategy-guide-codex-vs-claude.md, ${MJ}/docs/STRATEGY_HANDOFF-2026-09-08.md, ${MJ}/JUDGMENT_LOG.md, ${MJ}/docs/BALANCE-2026-09-11.md, ${MJ}/docs/EXPANSION_ECONOMY-2026-09-13.md, ${MJ}/docs/FOUR_ACTIONS_REPORT-2026-09-12.md, ${MJ}/docs/DOUBLE_COSTS-2026-09-10.md, ${MJ}/docs/ALTERNATE_MAP_REPORT-2026-09-12.md, ${MJ}/docs/MCP_TOOL_TAPS.md, ${MJ}/docs/ANALYSIS_TOOLS.md, ${MJ}/docs/HOME_VICTORY-2026-09-07.md, ${MJ}/docs/UPKEEP_DRAW-2026-09-08.md, ${MJ}/docs/DRAW_TEN-2026-09-08.md, ${MJ}/docs/TIER3_CAP-2026-09-08.md, ${MJ}/docs/CLEAVE_RELEASE-2026-09-07.md, ${MJ}/docs/DESIGN_REVIEW.md, ${MJ}/public/skills/muju-hono-tanka/SKILL.md, ${MJ}/public/skills/muju-time-awareness/ (all files), and the Muju rows of ${OUT}/napkin-snapshot.md (the Corrections table and "Patterns That Work" sections dated 2026-09-12/13). Also ${WT}/docs/game-design-dossier.md if it discusses Muju.
Document, in ${OUT}/strategy-docs.md:
1. A ranked list of strategic principles, each with: the claim, the source(s), the evidence quality (won game / lost game / simulation / assertion), and the concrete numbers behind it (unit costs/stats/reach at the CURRENT v2.8 catalogue; check ${MJ}/src/game/units.ts and resourceMap.ts to update any stale numbers the docs quote, and say when a doc's numbers are stale).
2. The recurring failure modes that lost games (corner turtling, zero spawn squares, ignoring speed-1 reach, buying on depleted stacks, far anchors that get blocked, one-AP-short kill combos, leaving soft units on two-action approach squares, over-investing in tier 3 with upkeep > income, walking a Kagari into Hi range...).
3. The winning recipes (Codex's: Hi to a central 8 turn 1, Mujus on 10s and both rich patches, Sjor→Straumr→Aegirinn as forward spawn anchor, fresh-Hi raid every turn, Tanka hit-and-run; Claude's 17-turn win: kill fires proactively, spawn-strike, bank early...). Translate each into machine-checkable terms: what board feature or lookahead would let an engine find it.
4. The opening knowledge: what first 3-5 turns are recommended for White and for Black, and why.
5. A list of evaluation features implied by the docs (e.g. crystals remaining under own miners, projected income for next N turns, upkeep-income margin, spawn rectangle area and anchor safety, enemy spawn-strike reach including purchasable units, two-action vs three-action approach classification for every soft unit, kill-combo availability with pre-adjacency, draw-clock pressure, home-neighbour control), each with a proposed definition.
Return the structured output.`,
  },
  {
    key: 'game-records',
    prompt: `${COMMON}
TOPIC: Actual game records and analysis primitives: mine the real Codex-vs-Claude (and other) games for what happened, and inventory the existing analysis tools.
Sources: ${MJ}/data/rooms.sqlite (a copy; open READ-ONLY with sqlite3 e.g. 'sqlite3 -readonly ${MJ}/data/rooms.sqlite .schema' and query the rooms/move-history tables; the server code in ${MJ}/server/rooms.ts, ${MJ}/server/notation.ts, ${MJ}/src/game/moveHistory.ts, ${MJ}/src/game/replay.ts explains the storage and notation), ${MJ}/docs/analysis-benchmark/ (all files), ${MJ}/server/analysis/ (all files), ${MJ}/src/game/analysis.ts, ${MJ}/tools/benchmark-analysis.ts, ${MJ}/server/observation.ts, ${MJ}/server/clockPressure.ts, ${MJ}/docs/ANALYSIS_TOOLS.md, ${MJ}/docs/MCP_TOOL_TAPS.md.
Document, in ${OUT}/game-records.md:
1. The schema of stored games and how to reconstruct a full GameState sequence from a record (write and run a small node script with tsx under ${OUT}/ if needed to replay; do not modify existing files).
2. For EVERY complete game found in the sqlite (and any game logs in docs/analysis-benchmark or lab results that are real agent-vs-agent games rather than bot sims): players, result, length, and a turn-by-turn narrative of the decisive moments — purchases, kills, anchors, income trajectory per side, upkeep, when stacks ran out, what the losing side did wrong in concrete board terms. Extract per-turn income and bank series if you can replay.
3. Cross-game patterns: which openings appeared, which units were bought most, average game length, what fraction ended by resignation/elimination/home/draw, typical income curve.
4. The existing analysis primitives (server/analysis, src/game/analysis.ts): what each computes (threats, spawn, reach, retreat witnesses, approach classification, briefing), their signatures, time limits, and which are reusable as engine primitives vs. presentation-only.
Return the structured output.`,
  },
  {
    key: 'engine-techniques',
    prompt: `${COMMON}
TOPIC: Engineering techniques for strong deterministic perfect-information game engines, mapped onto Muju's specific structure.
First read enough of ${MJ}/SPEC.md (sections 1-9) and ${MJ}/src/game/types.ts, units.ts, turn.ts, spawning.ts to know the game's structure: 10x10 board, two players, 18 unit types in 6 elements x 3 tiers, a turn = a Place phase (any number of tier-1 purchases on spawn-rectangle squares + promotions, paying crystals, zero actions) followed by 4 shared actions (moves cost ceil(dist/speed), attacks cost 1, Cleave chains), then deterministic passive mining income from finite crystal stacks (504 total), upkeep per tier at turn start, win by elimination or home-square occupation (with a proven-checkmate early resolution), draw after 10 quiet turns with no attack kills. Everything is deterministic and public.
Then research (use your own expertise first; use WebSearch/WebFetch via ToolSearch if you need to confirm specifics) and document, in ${OUT}/engine-techniques.md, a catalogue of techniques with, for each: what it is, the standard reference implementation details, the concrete adaptation to Muju (with its macro-turn structure: a "move" is a whole turn = purchases + up to 4 actions, so branching is enormous and must be handled by candidate generation / progressive widening / action-level search within a turn), expected benefit, cost, and a priority rating. Cover at least:
- State representation: bitboards on 100 squares (two 64-bit words or a BigInt/Uint32 x4), per-unit compact arrays, Zobrist hashing incl. crystals/bank/turn-phase/draw-clock, incremental updates, make/unmake vs copy.
- Move generation for macro-turns: enumerating action sequences within a turn with pruning (canonical ordering to kill transpositions within a turn, e.g. attacks before moves when independent), purchase-set enumeration (knapsack over affordable tier-1 units x legal squares, dominated-set pruning), promotion subsets, and how to bound it (candidate generation, static exchange style "kill combo" solver, threat-space search).
- Search: iterative deepening alpha-beta / PVS / negamax over macro-turns; aspiration windows; transposition tables with replacement schemes; move ordering (TT move, killer, history, MVV-LVA analogue for kills); quiescence over "tactical" turns (kills, home threats, spawn-strikes); null-move-like "pass turn" heuristics and their danger here (income makes passing not free); late-move reductions; singular extensions for forced kills; MCTS-vs-alphabeta suitability for this game; proof-number search / df-pn for home-checkmate and forced-kill proofs; threat-space search; endgame retrograde analysis feasibility for small material.
- Static evaluation: material with tuned values, mobility, king-safety analogue (home-square safety), piece-square tables per unit type derived from crystal map, economic evaluation as discounted future income given remaining stacks and miner placement (a small DP/greedy assignment), upkeep-vs-income runway, spawn rectangle area/anchor safety, threat maps incl. purchasable-unit reach, tempo (actions), draw-clock term, lazy evaluation; tuning via Texel/logistic regression on self-play outcomes, SPSA/CLOP, and automated weight tuning pipelines.
- Opening books: how to build one via self-play + minimax backup over a tree of first N turns, canonicalization under the 180° rotational symmetry, book format and lookup.
- Dynamic programming: BFS distance tables per unit/speed with blockers, all-pairs reach caches, income projection DP over remaining stacks, spawn-rectangle computation as prefix sums, "minimum actions to kill target X" tables.
- Testing/verification: perft-style enumeration counts against the canonical engine, differential fuzzing of a fast engine vs the canonical transition, EPD-style position test suites (tactics, home-mate, spawn-strike), regression Elo via SPRT, fixed-node determinism tests, time management in a Web Worker with fixed-work accounting.
- Engineering: TypeScript performance idioms (typed arrays, no allocation in hot loops, avoiding Map/Set), AssemblyScript/WASM tradeoffs (the repo already has an AssemblyScript kernel), worker cancellation, incremental deepening under a time budget with best-so-far results.
Give your recommended architecture for a "Hard AI" under a ~2-6 second per-turn browser budget, and a ranked implementation order with the expected strength gain of each step. Be specific and opinionated.
Return the structured output.`,
  },
]

phase('Read')
const reads = (await parallel(READERS.map(r => () =>
  agent(r.prompt, { label: `read:${r.key}`, phase: 'Read', schema: READ_SCHEMA, model: 'opus', effort: 'high' })
    .then(x => x ? { key: r.key, ...x } : null)
))).filter(Boolean)
log(`Read phase: ${reads.length}/${READERS.length} readers returned`)

phase('Synthesize')
const readSummaries = reads.map(r => `### ${r.key} (${r.docPath})\n${r.summary}\nKey facts:\n- ${r.keyFacts.join('\n- ')}\nOpen questions:\n- ${r.openQuestions.join('\n- ')}`).join('\n\n')

// Fable rationale: this is the integrative design-judgment step — reconciling six maps, contradictory strategy claims from won and lost games, and ranking what matters for a deterministic engine; opus/sonnet produce flatter, less discriminating syntheses here.
const SYNTH_SCHEMA = {
  type: 'object',
  properties: {
    strategicDocPath: { type: 'string' },
    gapsDocPath: { type: 'string' },
    summary: { type: 'string' },
    topPrinciples: { type: 'array', items: { type: 'string' } },
    topEngineGaps: { type: 'array', items: { type: 'string' } },
    contradictions: { type: 'array', items: { type: 'string' }, description: 'places where sources disagree, and your ruling with reasoning' },
  },
  required: ['strategicDocPath', 'gapsDocPath', 'summary', 'topPrinciples', 'topEngineGaps', 'contradictions'],
}
const synth = await agent(`${COMMON}
You are the synthesizer. Six readers have each written a map document under ${OUT}/ (rules-engine.md, current-ai.md, lab-harness.md, strategy-docs.md, game-records.md, engine-techniques.md). Read ALL six documents fully, plus ${OUT}/napkin-snapshot.md Muju rows. Their returned summaries follow for orientation:

${readSummaries}

Produce two documents:
A) ${MJ}/docs/hard-ai/STRATEGIC_UNDERSTANDING.md — the integrated strategic model of Muju v2.8 as currently understood. Structure: (1) the game's economy as a finite resource race with exact numbers (stacks, income curves, when they run out, upkeep runway); (2) the action economy (4 shared actions; what is and is not reachable; kill-combo pre-adjacency; spawn-strike reach from purchasable units; two-action vs three-action approach classification); (3) elements and the kill table as strategic constraints (what walls are immune to what); (4) space: spawn rectangles, anchors, blocking, the home square and home-checkmate; (5) tempo and the draw clock; (6) phases of a game (opening/midgame/endgame) with the concrete plans that won and the ones that lost, each translated into evaluable board features; (7) an explicit list of "strategic invariants a strong engine must never violate" (e.g. never end a turn with zero own spawn squares while the opponent can buy; never leave a soft unit on a two-action approach square that can't be punished); (8) contradictions between sources and your ruling.
B) ${MJ}/docs/hard-ai/ENGINE_GAPS.md — for the current AI, a prioritized list of gaps between what it computes and what the strategic model requires, each with: the gap, the evidence (which game/lesson it would have prevented), the engine technique that closes it (from engine-techniques.md), and an estimated strength impact (high/med/low) with your reasoning.
Be exhaustive and precise; use numbers; cite the reader docs and underlying files. Where readers disagree or a doc's numbers are stale vs. units.ts/resourceMap.ts, rule on it explicitly.
Return the structured output.`, { label: 'synthesize', phase: 'Synthesize', schema: SYNTH_SCHEMA, model: 'fable', effort: 'high' })

phase('Critique')
const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    gaps: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, question: { type: 'string' }, sources: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['key', 'question', 'sources', 'severity'] } },
    verdict: { type: 'string' },
  },
  required: ['gaps', 'verdict'],
}
const critique = await agent(`${COMMON}
You are the completeness critic. Read ${MJ}/docs/hard-ai/STRATEGIC_UNDERSTANDING.md and ${MJ}/docs/hard-ai/ENGINE_GAPS.md and the six reader docs under ${OUT}/. Then hunt for what is MISSING or UNVERIFIED: a source in the repo not read (check git log --since=2026-09-01 --name-only in ${WT} for muju files, ls ${MJ}/docs, ${MJ}/lab/results, ${MJ}/lab/experiments, ${MJ}/tests, ${MJ}/server, ${MJ}/public/skills), a numeric claim not checked against code, a rule whose engine semantics are asserted but not traced to a function, a strategic claim from a lost game that the synthesis dropped, a game record not narrated, a technique in engine-techniques.md whose Muju adaptation is hand-wavy. For each gap produce a precise research question a single reader agent could answer in one pass, with the exact sources to read. Rate severity. Return at most 6 gaps, highest severity first, and a one-paragraph verdict on whether the understanding is sufficient to design a Hard AI.`, { label: 'critic', phase: 'Critique', schema: CRITIC_SCHEMA, model: 'opus', effort: 'high' })

const fills = (critique?.gaps || []).filter(g => g.severity !== 'low').slice(0, 3)
log(`Critic: ${critique?.gaps?.length || 0} gaps, filling ${fills.length}`)
const fillResults = (await parallel(fills.map(g => () =>
  agent(`${COMMON}
Targeted gap-fill. Question: ${g.question}
Sources to read: ${g.sources}
Answer it exhaustively and write the answer to ${OUT}/gapfill-${g.key}.md, then APPEND a short dated addendum section (## Addendum 2026-09-14: ${g.key}) with the essential findings to the relevant document among ${MJ}/docs/hard-ai/STRATEGIC_UNDERSTANDING.md or ${MJ}/docs/hard-ai/ENGINE_GAPS.md (append only; do not rewrite existing text).
Return the structured output.`, { label: `gapfill:${g.key}`, phase: 'Critique', schema: READ_SCHEMA, model: 'opus', effort: 'high' })
    .then(x => x ? { key: g.key, ...x } : null)
))).filter(Boolean)

return {
  readers: reads.map(r => ({ key: r.key, docPath: r.docPath, summary: r.summary, keyFacts: r.keyFacts, openQuestions: r.openQuestions })),
  synthesis: synth,
  critique,
  gapfills: fillResults.map(f => ({ key: f.key, docPath: f.docPath, summary: f.summary, keyFacts: f.keyFacts })),
}