export const meta = {
  name: 'muju-hard-ai-implement',
  description: 'Execute the 20-milestone Hard AI DAG: implement, independently verify each gate, fix up to twice, commit on green',
  phases: [
    { title: 'Group A' }, { title: 'Group B' }, { title: 'Group C' }, { title: 'Group E' }, { title: 'Group F' },
    { title: 'Group G' }, { title: 'Group H' }, { title: 'Group I' }, { title: 'Group J' },
  ],
}

const WT = '/Users/ashkie/src/deevgames-muju-hardai'
const MJ = WT + '/muju'
const HA = MJ + '/docs/hard-ai'

const MILESTONES = [
  { id: 'M1', group: 'A', deps: [], model: 'sonnet', title: 'Verify runner, perft fixtures, position corpus, deps lint, constants test' },
  { id: 'M2', group: 'B', deps: ['M1'], model: 'sonnet', title: 'Ladder: sharded runner, pairing, SPRT, Elo, harness v3, determinism tool' },
  { id: 'M4', group: 'B', deps: ['M1'], model: 'opus', title: 'Packed primitives: bits, tables, catalog, zobrist, action, config, interface tests' },
  { id: 'M3', group: 'C', deps: ['M2'], model: 'sonnet', title: 'Whole-turn worker path for AIEngineV2 (protocol 3 additive)' },
  { id: 'M5', group: 'C', deps: ['M4'], model: 'opus', title: 'Replica: state, movement, spawn, income, make/unmake, generators, fuzzer' },
  { id: 'M6', group: 'E', deps: ['M5'], model: 'opus', title: 'Threat maps and approach table' },
  { id: 'M7', group: 'E', deps: ['M5'], model: 'opus', title: 'Kill-combination DP and Cleave chains' },
  { id: 'M8', group: 'E', deps: ['M5'], model: 'sonnet', title: 'Economy DP and PST' },
  { id: 'M9', group: 'E', deps: ['M5'], model: 'sonnet', title: 'Spawn geometry and home tables' },
  { id: 'M10', group: 'E', deps: ['M5'], model: 'opus', title: 'Home-prover replica and checkmate gating proof' },
  { id: 'M11', group: 'E', deps: ['M5'], model: 'opus', title: 'Within-turn action search: canonical ordering, turn TT, TurnPool' },
  { id: 'M12', group: 'F', deps: ['M6', 'M7', 'M8', 'M9'], model: 'opus', title: 'Evaluation v0, invariants, NodeTables builder' },
  { id: 'M13', group: 'G', deps: ['M11', 'M12'], model: 'opus', title: 'Candidate generator, keep-sets, recall instrument' },
  { id: 'M14', group: 'H', deps: ['M13', 'M10'], model: 'opus', title: 'Search core: TT, ordering, quiescence, PVS, work meter, root, engine, replay, lab bot' },
  { id: 'M15', group: 'I', deps: ['M14', 'M3'], model: 'sonnet', title: 'Exposure: worker routing, UI hard switch, fallback, phone profile, e2e' },
  { id: 'M16', group: 'I', deps: ['M14'], model: 'opus', title: 'df-pn home-force module' },
  { id: 'M17', group: 'I', deps: ['M14'], model: 'opus', title: 'Search refinements: aspiration, LMR, futility, extensions' },
  { id: 'M18', group: 'I', deps: ['M14'], model: 'sonnet', title: 'Tuning and book pipeline: corpus, Texel, SPSA, book build/probe' },
  { id: 'M19', group: 'J', deps: ['M15'], model: 'sonnet', title: 'Ship-gate measurement campaign (desktop + phone)' },
  { id: 'M20', group: 'J', deps: ['M16', 'M17', 'M18', 'M19'], model: 'sonnet', title: 'Feature measurement campaign (df-pn, refinements, tuned weights, SPSA, book)' },
]

const RULES = `
WORKTREE AND SAFETY RULES (binding):
- Work only inside ${WT} (branch claude/muju-hard-ai). The game is at ${MJ}; run all npm/npx commands from ${MJ}. Never touch /Users/ashkie/src/deevgames or any /private/tmp worktree. Never start a dev server. Never run 'npm test' (its pretest recompiles the shared WASM kernel and races with other agents) — use 'npx vitest run <paths>' and 'npx tsc --noEmit -p tsconfig.json' instead; the lab tooling runs with 'node --import tsx <file>' or the 'hard:*' npm scripts.
- Other agents are building other milestones in this same worktree concurrently. Touch ONLY the files your milestone lists (create/modify) plus new files under the directories it names. Never edit src/game/** (the canonical engine is the authority), never edit files owned by another milestone, never reformat or "clean up" unrelated code. If a shared file genuinely needs a change outside your list, make the minimal additive change and report it in your return.
- Git: no checkout/stash/reset/rebase/branch operations, no 'git add -A'. Commits are made only by the verifier at the end of a green gate, restricted to explicit paths.
- Determinism: no Date.now(), Math.random(), performance.now() in engine logic (a clock may be read once before a search to pick a work rung, per DESIGN); integer scores; typed arrays; no BigInt (DESIGN bans it); no imports from lab/solver.
- Ground truth: ${HA}/DESIGN.md (binding interfaces in §4, algorithms in §5, constants in §8, verification in §7) and ${HA}/MILESTONES.md (your milestone's files, spec and gate). Read your milestone section fully, then DESIGN §0-§2 and every DESIGN section your milestone cites, plus §4 for every interface you implement or consume. Implement the interfaces EXACTLY as written; if the design is internally inconsistent or infeasible, choose the fix that preserves the other modules' contracts, and document it in ${HA}/design/DEVIATIONS.md (append a dated entry under a '## <milestone id>' heading) and in your return.
- Background reading when needed: ${HA}/STRATEGIC_UNDERSTANDING.md, ${HA}/ENGINE_GAPS.md, ${HA}/understand/*.md (rules-engine.md, current-ai.md, engine-techniques.md, lab-harness.md).
`

const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['gate-green', 'gate-red', 'blocked'] },
    filesCreated: { type: 'array', items: { type: 'string' } },
    filesModified: { type: 'array', items: { type: 'string' } },
    gateCommand: { type: 'string' },
    gateOutputTail: { type: 'string' },
    deviations: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['status', 'filesCreated', 'filesModified', 'gateCommand', 'gateOutputTail', 'deviations', 'notes'],
}
const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    gateOutputTail: { type: 'string' },
    typecheckOk: { type: 'boolean' },
    fullSuiteOk: { type: 'boolean' },
    findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, file: { type: 'string' }, description: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'file', 'description', 'fix'] } },
    committed: { type: 'string', description: 'commit hash if committed, else empty' },
    summary: { type: 'string' },
  },
  required: ['pass', 'gateOutputTail', 'typecheckOk', 'fullSuiteOk', 'findings', 'committed', 'summary'],
}

function implPrompt(m, prior) {
  return `${RULES}
YOUR MILESTONE: ${m.id} — ${m.title}. Its dependencies (${m.deps.join(', ') || 'none'}) have green gates and are committed; consume their modules through the DESIGN §4 interfaces (read their actual source under ${MJ}/src/ai/hard/ and ${MJ}/lab/hard-ai/ to match reality).
${prior ? `PRIOR ATTEMPT CONTEXT: an earlier implementer left the milestone in this state:\n${prior}\nStart from the code as it is now; do not rewrite from scratch unless it is unsalvageable.` : ''}
Do the work completely: implement every file and behaviour in the milestone's specification, write the tests it names, add the gate row to lab/hard-ai/verify/gates.ts if the milestone says so, then run the milestone's gate command (from MILESTONES.md; from ${MJ}) and iterate until it prints a pass. Then run 'npx tsc --noEmit -p tsconfig.json' and the vitest files you touched. Quality bar: production code in the house style (strict TS, no any, no allocation in hot loops for engine modules, exhaustive switch handling), with focused unit tests that pin down semantics (not just smoke). For engine modules, cross-check semantics against the canonical src/game functions cited in DESIGN and in docs/hard-ai/understand/rules-engine.md — the replica must agree with the canonical engine bit for bit; when in doubt, write a differential test.
Return the structured output. status 'gate-green' only if the gate command's own pass line printed; 'blocked' only if a dependency's interface is missing in a way you cannot work around.`
}

function verifyPrompt(m, impl) {
  return `${RULES}
YOU ARE THE INDEPENDENT VERIFIER for milestone ${m.id} — ${m.title}. The implementer reported: ${JSON.stringify({ status: impl?.status, filesCreated: impl?.filesCreated, filesModified: impl?.filesModified, deviations: impl?.deviations, notes: impl?.notes }).slice(0, 4000)}
Do not trust the report. Steps:
1. Run the milestone's gate command exactly as written in MILESTONES.md (from ${MJ}) and read the artifact it writes; apply the pass criterion yourself.
2. Run 'npx tsc --noEmit -p tsconfig.json' (from ${MJ}) and the full 'npx vitest run' (from ${MJ}); both must be clean (pre-existing failures unrelated to this milestone: name them and treat as non-blocking, but verify they fail on the base commit too via 'git stash' is FORBIDDEN — instead check 'git log' and reason from the diff).
3. Review every created/modified file ('git status --porcelain' and 'git diff' in ${WT}) against DESIGN §4 interfaces and the milestone spec: signatures exactly as specified, determinism bans respected (grep for Date.now|Math.random|performance.now|BigInt in src/ai/hard), no edits to src/game/**, no edits outside the milestone's file list (files that belong to other in-flight milestones may also appear uncommitted in git status — ignore those, they are not this milestone's), tests actually assert semantics, hot paths allocation-free where DESIGN requires.
4. Try to break it: for replica/table/search modules, write and run an extra differential or property check under ${MJ}/lab/hard-ai/verify/scratch-${m.id}.ts (more seeds, a hostile position from lab/hard-ai/positions/authored.jsonl, an edge rule from docs/hard-ai/understand/rules-engine.md §8) and report what you found; delete the scratch file afterwards.
5. Verdict: pass only if the gate is green, typecheck and full suite are clean, and there are no blocker findings. Major findings that do not fail the gate may still pass but must be listed with a concrete fix.
6. If pass: commit ONLY this milestone's files: 'cd ${WT} && git add -- <each created/modified path, plus docs/hard-ai/design/DEVIATIONS.md if the implementer touched it> && git -c user.name=Claude -c user.email=noreply@anthropic.com commit -m "Hard AI ${m.id}: ${m.title}" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"'. If git reports index.lock, wait 5 seconds and retry up to 10 times. Report the hash.
Return the structured output.`
}

function fixPrompt(m, verify) {
  return `${RULES}
YOU ARE THE FIX AGENT for milestone ${m.id} — ${m.title}. The independent verifier failed it. Verifier summary: ${verify?.summary}\nGate output tail:\n${(verify?.gateOutputTail || '').slice(0, 3000)}\nFindings:\n${JSON.stringify(verify?.findings || [], null, 1).slice(0, 8000)}\nTypecheck ok: ${verify?.typecheckOk}; full suite ok: ${verify?.fullSuiteOk}.
Fix every blocker and major finding at the root cause (not by weakening tests or the gate criterion), rerun the gate command, tsc and the affected vitest files until green. Return the structured output.`
}

const DONE = new Set((args && args.done) || ['M1'])
log(`Resuming Hard AI DAG; already green: ${[...DONE].join(', ')}`)
const results = {}
const promises = {}
for (const m of MILESTONES) {
  promises[m.id] = (async () => {
    const phaseName = `Group ${m.group}`
    if (DONE.has(m.id)) { results[m.id] = { id: m.id, title: m.title, status: 'pass', attempts: 0, committed: 'prior', summary: 'already green before this run', findings: [], deviations: [], history: [] }; return results[m.id] }
    const deps = await Promise.all(m.deps.map(d => promises[d]))
    if (deps.some(d => !d || d.status !== 'pass')) {
      results[m.id] = { id: m.id, status: 'skipped-dep', failedDeps: m.deps.filter((d, i) => !deps[i] || deps[i].status !== 'pass') }
      log(`${m.id} skipped: dependency not green (${results[m.id].failedDeps.join(', ')})`)
      return results[m.id]
    }
    log(`${m.id} start: ${m.title}`)
    const PARTIAL = new Set((args && args.partial) || [])
    const priorNote = PARTIAL.has(m.id) ? `An earlier implementer was interrupted mid-milestone. Its files exist UNCOMMITTED on disk in the worktree (see docs/hard-ai/HANDOFF.md §10 for the list). They are unverified and may not typecheck; read them, keep what is sound, finish the rest.` : null
    let impl = await agent(implPrompt(m, priorNote), { label: `impl:${m.id}`, phase: phaseName, schema: IMPL_SCHEMA, model: m.model, effort: 'high' })
    if (impl && impl.status === 'blocked') {
      log(`${m.id} blocked: ${impl.notes.slice(0, 200)}`)
    }
    let verify = null
    let attempts = 0
    const history = []
    while (attempts < 3) {
      attempts++
      verify = await agent(verifyPrompt(m, impl), { label: `verify:${m.id}#${attempts}`, phase: phaseName, schema: VERIFY_SCHEMA, model: 'opus', effort: 'high' })
      history.push({ attempt: attempts, implStatus: impl?.status, pass: verify?.pass, summary: verify?.summary, findings: verify?.findings?.length })
      if (verify && verify.pass) break
      if (attempts >= 3) break
      log(`${m.id} verify #${attempts} failed (${verify?.findings?.length ?? '?'} findings) — fixing`)
      impl = await agent(fixPrompt(m, verify), { label: `fix:${m.id}#${attempts}`, phase: phaseName, schema: IMPL_SCHEMA, model: 'opus', effort: 'high' })
    }
    const pass = !!(verify && verify.pass)
    results[m.id] = { id: m.id, title: m.title, status: pass ? 'pass' : 'fail', attempts, committed: verify?.committed || '', summary: verify?.summary || '', findings: verify?.findings || [], deviations: impl?.deviations || [], history }
    log(`${m.id} ${pass ? 'GREEN' : 'RED'} after ${attempts} verify round(s)${verify?.committed ? ' @' + verify.committed.slice(0, 8) : ''}`)
    return results[m.id]
  })()
}
await Promise.all(Object.values(promises))
return MILESTONES.map(m => results[m.id])