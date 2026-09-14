export const meta = {
  name: 'muju-hard-ai-design',
  description: 'Judge panel: three independent Hard-AI engine designs, scored by two judges and a feasibility checker, synthesized into a binding DESIGN.md and MILESTONES.md',
  phases: [
    { title: 'Design', detail: 'three independent designers from different angles' },
    { title: 'Judge', detail: 'two judges + code-feasibility check, all designs together' },
    { title: 'Synthesize', detail: 'binding design + parallelizable milestone plan' },
  ],
}

const WT = '/Users/ashkie/src/deevgames-muju-hardai'
const MJ = WT + '/muju'
const HA = MJ + '/docs/hard-ai'

const COMMON = `
Worktree: ${WT} (branch claude/muju-hard-ai); the game lives at ${MJ}. Work ONLY inside ${WT}; never touch /Users/ashkie/src/deevgames or /private/tmp worktrees; no state-changing git commands; no dev servers; do not modify existing source files. You may create files under ${HA}/design/ only.
Required reading (read fully, they are the ground truth for this project): ${HA}/STRATEGIC_UNDERSTANDING.md, ${HA}/ENGINE_GAPS.md, ${HA}/understand/engine-techniques.md, ${HA}/understand/current-ai.md, ${HA}/understand/rules-engine.md, ${HA}/understand/lab-harness.md. Skim ${HA}/understand/strategy-docs.md and game-records.md. Then read the actual code you are designing against: ${MJ}/src/ai/**, ${MJ}/src/game/types.ts, simulate.ts is at ${MJ}/src/ai/simulate.ts, ${MJ}/src/game/legality.ts, spawning.ts, movement.ts, combat.ts, homeCheckmate.ts, ${MJ}/src/hooks/useAI.ts, ${MJ}/lab/harness/*.ts, ${MJ}/lab/ai/*.ts, ${MJ}/assembly/tactics.ts, ${MJ}/package.json, ${MJ}/tsconfig.json, ${MJ}/vite.config.ts, ${MJ}/vitest.config.ts.
Project goal (from the user): a much stronger set of engine primitives and tools, and ultimately a much stronger DETERMINISTIC "Hard AI" player for Muju v2.8, applying perfect-information engine techniques (static positional evaluation, opening books, dynamic programming, search, tables, tuning, verification). It runs in a browser Web Worker under roughly a 2-6 s per-turn budget on desktop and must degrade gracefully on phones; it must be deterministic under fixed work; the canonical src/game engine remains the authority and every dispatched action is revalidated; the existing AIEngineV2 stays as Easy/Medium and as fallback. House stack: Vite + strict TypeScript, vitest, AssemblyScript kernel already present.
Non-negotiable engineering constraints for the design: implementation will be done by a fleet of parallel coding agents, so the design MUST define a module layout with crisp interfaces so that independent modules can be built and unit-tested in parallel and integrated in stages; every milestone must have an objective, mechanical acceptance gate (tests, perft numbers, differential fuzz counts, SPRT/ladder results at fixed work) that a verifier agent can run with a single command.
`

const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    docPath: { type: 'string' },
    title: { type: 'string' },
    thesis: { type: 'string', description: 'one paragraph: what this design bets on' },
    moduleLayout: { type: 'array', items: { type: 'string' }, description: 'one line per module: path, responsibility, public interface, dependencies' },
    milestones: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, dependsOn: { type: 'array', items: { type: 'string' } }, gate: { type: 'string' }, estimatedStrengthGain: { type: 'string' } }, required: ['id', 'title', 'dependsOn', 'gate'] } },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['docPath', 'title', 'thesis', 'moduleLayout', 'milestones', 'risks'],
}

const ANGLES = [
  { key: 'search-first', angle: `SEARCH-FIRST. You believe strength comes from verified lookahead: a fast replica engine (packed state, bitboards, Zobrist, make/unmake), within-turn action search with canonical ordering and a turn transposition table, a candidate-turn generator with measured recall, iterative-deepening PVS over macro-turns with TT/ordering/quiescence over tactical turns, a df-pn home-force module, and only a modest evaluation. Design the search stack in full detail: data structures, node budgets, how a "turn" is represented and canonicalized, how purchases are enumerated (knapsack with dominance pruning), how quiescence is bounded, how the time budget maps to fixed work deterministically, how progress/cancellation works in the worker. Be concrete down to TypeScript type signatures.` },
  { key: 'knowledge-first', angle: `KNOWLEDGE-FIRST. You believe strength comes from encoding the strategic model exactly: a rich, staged static evaluation (threat maps including purchasable-unit reach, approach classification per soft unit, kill-combo availability with pre-adjacency, spawn geometry with the zero-spawn cliff and anchor blocking sets, economy DP over remaining reserves with miner relocation, upkeep runway, home safety countdown, draw-clock term, integer fixed-point weights), the 20 strategic invariants from STRATEGIC_UNDERSTANDING §7 as hard filters or large penalties, an opening book keyed by handicap and 180°-canonical position, precomputed DP tables (BFS distance per speed with blockers, min-actions-to-kill, RECT masks, PST from live reserves), and a Texel/SPSA tuning pipeline on self-play. Search can be shallower (2-3 macro-plies with tactical quiescence). Design every feature with a precise definition, cost, and the table/DP that makes it cheap; design the tuning pipeline and the book builder end to end.` },
  { key: 'measurement-first', angle: `MEASUREMENT-AND-ENGINEERING-FIRST. You believe the project fails without verification and staging: perft fixtures, three-way differential fuzzing (canonical vs replica vs WASM), fixed-work determinism tests, EPD-style position suites (tactics, spawn-strike, home-mate, invariants), a seat-mirrored paired-seed ladder with SPRT and Elo, recall instrumentation for the candidate generator, a whole-turn worker protocol, graceful degradation on phones, and a staged rollout where the new engine is gated behind SPRT wins against the current Hard at equal wall-clock. Design the harness and tooling in full detail (commands, file formats, result directories under lab/results/hard-ai-*, how a verifier agent proves a milestone), the worker/UI integration, the AssemblyScript port strategy for hot kernels, and a search+eval core that is deliberately simple but correct, sized so the harness can prove each increment.` },
]

phase('Design')
const designs = (await parallel(ANGLES.map(a => () =>
  agent(`${COMMON}
YOUR ANGLE: ${a.angle}
Write your complete design to ${HA}/design/${a.key}.md. It must contain: (1) thesis; (2) architecture diagram and data flow for one AI turn; (3) module layout under ${MJ}/src/ai/hard/ (and ${MJ}/lab/hard-ai/ for tooling) with per-module responsibility, exported TypeScript interfaces (write the actual type/function signatures), and dependency edges; (4) the algorithms in enough detail that a coding agent can implement each module without asking questions (pseudocode where needed, exact constants with rationale); (5) a milestone plan as a DAG (ids M1..Mn, dependsOn, deliverable files, the exact acceptance gate command and pass criterion, estimated strength gain); (6) how the engine is exposed: lab bot adapter, worker protocol, UI difficulty "hard" switch, fallback; (7) risks and how to detect them early. Ground every claim in the docs or code with path:line references. Do not hedge; make decisions.
Return the structured output.`, { label: `design:${a.key}`, phase: 'Design', schema: DESIGN_SCHEMA, model: 'opus', effort: 'high' })
    .then(x => x ? { key: a.key, ...x } : null)
))).filter(Boolean)
log(`Designs: ${designs.map(d => d.key).join(', ')}`)

phase('Judge')
const designList = designs.map(d => `- ${d.key}: ${d.docPath} — ${d.title}`).join('\n')
const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    docPath: { type: 'string' },
    scores: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, strengthPotential: { type: 'number' }, implementability: { type: 'number' }, verifiability: { type: 'number' }, total: { type: 'number' }, verdict: { type: 'string' } }, required: ['key', 'strengthPotential', 'implementability', 'verifiability', 'total', 'verdict'] } },
    bestIdeasToGraft: { type: 'array', items: { type: 'string' }, description: 'specific ideas from non-winning designs that the synthesis must keep' },
    fatalFlaws: { type: 'array', items: { type: 'string' } },
  },
  required: ['docPath', 'scores', 'bestIdeasToGraft', 'fatalFlaws'],
}
// Fable rationale: judging three competing engine architectures for a novel macro-turn game requires taste about search-vs-knowledge tradeoffs and spotting subtle flaws (horizon effects, determinism leaks, recall traps); opus/sonnet judges tend to score on completeness rather than correctness.
const judgeLenses = [
  { key: 'strength', lens: 'PLAYING STRENGTH under the real budget: which design will actually beat the current Hard preset and the recorded Codex strategies (forward-anchor fresh-Hi raids, Aegirinn/Tanka walls, spawn-strikes)? Scrutinize horizon effects, candidate-generator recall, purchase modelling, evaluation blind spots, tactical completeness. Try to construct concrete Muju positions where each design plays badly.' },
  { key: 'engineering', lens: 'ENGINEERING SOUNDNESS: determinism (no Date.now/Math.random/float drift), correctness vs the canonical engine, performance realism in TypeScript (allocation, typed arrays, GC), worker/time management, parallel implementability by independent agents with crisp interfaces, testability of each milestone with a single command, risk of regressions to Easy/Medium and to the UI. Try to find interface gaps that would block a coding agent.' },
]
const feasibilityPrompt = `${COMMON}
Designs to check:\n${designList}\nYou are the CODE-FEASIBILITY checker. For every design, verify each milestone's claims against the actual code: does the API it says it will call exist with that signature (grep it)? Are the perft/recall/timing numbers it cites reproducible (run the measurement scripts referenced in ${HA}/understand/engine-techniques.md Appendix B if present, or write a small tsx script under ${HA}/design/feasibility/ to measure)? Would the proposed file layout collide with existing modules, tsconfig includes, vitest config, the AssemblyScript build, or the Vite worker bundling? Can the lab harness actually host the new engine as a bot with the described adapter (read lab/harness/types.ts and runner.ts)? Write findings to ${HA}/design/feasibility.md and return the structured output, scoring implementability from evidence.`
const judged = (await parallel([
  ...judgeLenses.map(j => () => agent(`${COMMON}
Designs to judge:\n${designList}\nRead all three designs fully. Judge through this lens: ${j.lens}
Score each design 1-10 on strengthPotential, implementability, verifiability (total = sum), with a verdict paragraph each; list the best ideas from non-winning designs that must be grafted into the final; list fatal flaws with the concrete Muju position or code fact that demonstrates each. Write your full review to ${HA}/design/judge-${j.key}.md. Return the structured output.`, { label: `judge:${j.key}`, phase: 'Judge', schema: JUDGE_SCHEMA, model: 'fable', effort: 'high' }).then(x => x ? { key: j.key, ...x } : null)),
  () => agent(feasibilityPrompt, { label: 'judge:feasibility', phase: 'Judge', schema: JUDGE_SCHEMA, model: 'opus', effort: 'high' }).then(x => x ? { key: 'feasibility', ...x } : null),
])).filter(Boolean)
log(`Judges returned: ${judged.map(j => j.key).join(', ')}`)

phase('Synthesize')
const judgeText = judged.map(j => `### Judge ${j.key} (${j.docPath})\nScores: ${JSON.stringify(j.scores)}\nGraft: ${j.bestIdeasToGraft.join(' | ')}\nFatal: ${j.fatalFlaws.join(' | ')}`).join('\n\n')
const SYNTH_SCHEMA = {
  type: 'object',
  properties: {
    designPath: { type: 'string' },
    milestonesPath: { type: 'string' },
    summary: { type: 'string' },
    milestones: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, dependsOn: { type: 'array', items: { type: 'string' } }, files: { type: 'array', items: { type: 'string' } }, gate: { type: 'string' }, parallelGroup: { type: 'string' } }, required: ['id', 'title', 'dependsOn', 'files', 'gate', 'parallelGroup'] } },
  },
  required: ['designPath', 'milestonesPath', 'summary', 'milestones'],
}
// Fable rationale: the synthesis must reconcile three architectures and three reviews into one binding, internally consistent design with exact interfaces that a fleet of coding agents will implement without further judgment calls; this is the highest-leverage design decision in the project.
const synth = await agent(`${COMMON}
You are the chief architect. Three designs exist:\n${designList}\nThree reviews exist (read them fully): ${judged.map(j => j.docPath).join(', ')}. Judge summaries:\n${judgeText}\n
Write the BINDING design to ${HA}/DESIGN.md and the milestone plan to ${HA}/MILESTONES.md. Rules:
- Take the strongest overall design as the spine, graft every "best idea" the judges flagged, and eliminate every fatal flaw with an explicit fix. Where judges disagree, rule and say why.
- DESIGN.md must specify: the module layout under ${MJ}/src/ai/hard/ and ${MJ}/lab/hard-ai/ with exact file paths; every exported TypeScript interface/type/function signature per module (write them as code blocks — this is the contract coding agents implement against); the packed-state representation with exact field layout; the Zobrist scheme; the within-turn action generator and canonicalization; the purchase/promotion enumerator; the candidate-turn generator and its recall instrument; the search (ID-PVS, TT entry format and replacement, ordering, quiescence definition, extensions/reductions, fixed-work budget accounting, deterministic time management); the evaluation (each feature: definition, table/DP that computes it, cost, initial integer weight and rationale; staged/lazy evaluation; the strategic invariants as filters/penalties); the home-force module; the opening book format, builder and lookup; DP tables; the tuning pipeline (Texel + SPSA) with data formats; the verification suite (perft fixtures with the frozen numbers, differential fuzzer, determinism test, EPD suites, SPRT ladder with seat mirroring and paired seeds, recall instrument); worker protocol and UI integration and phone degradation; the fallback and rollout gating; the constants table.
- MILESTONES.md must be a DAG of milestones, each with: id, title, dependsOn, the exact files to create/modify, a precise specification (what a coding agent must build, referencing DESIGN.md sections), the acceptance gate as ONE shell command run from ${MJ} plus the pass criterion, and a parallelGroup label so that milestones in the same group can be built concurrently by different agents without touching the same files. Aim for 12-20 milestones. Foundation milestones (harness/perft/fuzzer, packed state) come first; the whole-turn worker path early because it is a pure win; search, evaluation, tactics and book modules built in parallel against the frozen interfaces; integration and SPRT gates at the end. Every milestone's gate must be runnable in under 15 minutes on a 12-core laptop; longer ladders go in a separate "measurement" milestone.
- Every design decision must cite its source doc/section or code path:line. Make decisions; do not present options.
Return the structured output with the milestone DAG.`, { label: 'synthesize-design', phase: 'Synthesize', schema: SYNTH_SCHEMA, model: 'fable', effort: 'high' })

return { designs: designs.map(d => ({ key: d.key, docPath: d.docPath, title: d.title, thesis: d.thesis })), judges: judged.map(j => ({ key: j.key, docPath: j.docPath, scores: j.scores, fatalFlaws: j.fatalFlaws })), synthesis: synth }