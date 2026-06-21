export const meta = {
  name: 'leyline-cross',
  description: 'Implement a cross-domain change that spans sim, rendering, and/or UI',
  whenToUse: 'When a change requires coordinated edits across sim + rendering + UI (e.g. debug features, new game mechanics with visual + UI components)',
  phases: [
    { title: 'Plan', detail: 'Break the task into domain-specific subtasks' },
    { title: 'Implement', detail: 'Specialists make changes in sequence (sim first, then rendering, then UI)' },
    { title: 'Verify', detail: 'Type-check, test, and integration check' },
  ],
}

// args: { task: string, domains: string[] (e.g. ['sim', 'rendering', 'ui']), hints?: string }

const ROOT = '/Users/ashkie/src/deevgames/leyline'
const CTX = `${ROOT}/.claude/game-dev-context.md`

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    subtasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          domain: { type: 'string' },
          task: { type: 'string' },
          dependsOn: { type: 'string', description: 'Which prior subtask this depends on, or "none"' },
        },
        required: ['domain', 'task', 'dependsOn'],
      },
    },
  },
  required: ['subtasks'],
}

phase('Plan')
log('Planning cross-domain change...')

const plan = await agent(`You are planning a cross-domain change for Leyline Garden at ${ROOT}.

Read the shared context at ${CTX} to understand the codebase structure and file ownership.

The change requested: ${args.task}
Domains involved: ${args.domains.join(', ')}
${args.hints ? `Hints: ${args.hints}` : ''}

Break this into ordered subtasks, one per domain. Sim changes should come first (they define data/interfaces), then rendering (consumes sim data), then UI (wires up controls).

Each subtask should be a self-contained instruction that a specialist can execute without seeing the other subtasks. Include specific function names, type signatures, or file locations where helpful.`, {
  label: 'planner',
  schema: PLAN_SCHEMA,
})

if (!plan || !plan.subtasks || plan.subtasks.length === 0) {
  return { error: 'Planning failed — no subtasks generated' }
}

phase('Implement')

const DOMAIN_BRIEFS = {
  rendering: `You are the Rendering specialist for Leyline Garden (Phaser 3 isometric game at ${ROOT}).
Your files are in src/phaser/. Read ${CTX} first for depth hierarchy and established patterns.
RULES: use ellipses not diamonds for iso glows, move sprites above overlay (9050+) to make them glow, ADD blend for glows, never add separate glow circles.`,

  sim: `You are the Sim/Engine specialist for Leyline Garden at ${ROOT}.
Your files are in src/sim/. Read ${CTX} first for established patterns.
RULES: feed timing on emit ticks not timers, sunflower=sun/lily=water/rest=life_essence, never filter motes by progress, hasPlantNear only counts canAcceptResource plants.`,

  ui: `You are the UI specialist for Leyline Garden at ${ROOT}.
Your files: src/bridge.ts, src/ui.ts, index.html. Read ${CTX} first.
RULES: follow pub/sub pattern, debug panel >= 1024px only, dark glassmorphic theme.`,
}

const results = []
for (const subtask of plan.subtasks) {
  const brief = DOMAIN_BRIEFS[subtask.domain] || `You are working on Leyline Garden at ${ROOT}. Read ${CTX} first.`

  log(`${subtask.domain}: ${subtask.task}`)

  const r = await agent(`${brief}

TASK: ${subtask.task}

After changes, run \`npx tsc --noEmit\` and \`npx vitest run\` in ${ROOT}. Both must pass.
Report what you changed and any new depth values or patterns.`, {
    label: `${subtask.domain}:impl`,
  })
  results.push({ domain: subtask.domain, task: subtask.task, result: r })
}

phase('Verify')

const verify = await agent(`Run final verification for Leyline Garden at ${ROOT}:

1. npx tsc --noEmit — must be clean
2. npx vitest run — all tests must pass
3. git diff --stat — list all modified files

Report pass/fail and the full file list. Do NOT make changes.`, { label: 'verify' })

return { plan: plan.subtasks, results, verify }
