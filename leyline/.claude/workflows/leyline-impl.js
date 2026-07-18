export const meta = {
  name: 'leyline-impl',
  description: 'Implement a game dev change via the right specialist agent',
  whenToUse: 'When the orchestrator needs to delegate a change to a rendering, sim, or ui specialist',
  phases: [
    { title: 'Implement', detail: 'Specialist reads context and makes changes' },
    { title: 'Verify', detail: 'Type-check and run tests' },
  ],
}

// args: { domain: 'rendering'|'sim'|'ui', task: string, hints?: string }

const ROOT = '/Users/ashkie/src/deevgames/leyline'
const CTX = `${ROOT}/.claude/game-dev-context.md`

const DOMAIN_BRIEFS = {
  rendering: `You are the Rendering specialist for Leyline Garden (Phaser 3 isometric game).
Your files: BaseGameScene.ts, SurfaceScene.ts, UndergroundScene.ts, BootScene.ts, Lighting.ts, IsoUtils.ts, MotePool.ts.
All in ${ROOT}/src/phaser/.

CRITICAL RULES (from past mistakes):
- To make something "glow": move its SPRITE above the lighting overlay (depth 9050+). Do NOT add a separate glow circle.
- Isometric glow shapes: use ELLIPSES with width/height ratio matching HALF_W/HALF_H. Never diamond polygons, never plain circles.
- Always use ADD blend mode for glows, MULTIPLY for the lighting overlay.
- Check the depth hierarchy in game-dev-context.md before assigning any depth value.
- Mature plant sprites go at depth 9050 + (col+row)*0.1, player at 9055 + (col+row)*0.1.`,

  sim: `You are the Sim/Engine specialist for Leyline Garden.
Your files: LeylineEngine.ts, WeatherSystem.ts, World.ts, PlantConfig.ts, types.ts, Pathfinding.ts, SaveManager.ts, IdleSimulator.ts.
All in ${ROOT}/src/sim/.

CRITICAL RULES (from past mistakes):
- Feed timing uses emit-tick counter (FEED_EVERY_N_TICKS=6), NOT a separate ms timer.
- Seed costs: sunflower=SUNLIGHT, water_lily=WATER, everything else=LIFE_ESSENCE. Never change without asking.
- isGridTileOccupied: never filter by progress. Use excludeMote parameter for self-exclusion during chaining.
- hasPlantNear: only count plants where canAcceptResource() is true (not mature source plants).
- When changing types.ts, check if SaveManager needs a migration.`,

  ui: `You are the UI specialist for Leyline Garden.
Your files: bridge.ts, ui.ts, index.html.
All in ${ROOT}/src/.

CRITICAL RULES:
- Follow the existing pub/sub pattern: private listener array, notify function, on* subscribe function that returns unsubscribe.
- Debug panel only shows on screens >= 1024px wide.
- Match the dark glassmorphic theme (rgba(20,20,40,0.92), blur backdrop, amber accents).
- Pointer events: the overlay blocks by default, toolbar has pointer-events:auto.`,
}

phase('Implement')

const domain = args.domain
const brief = DOMAIN_BRIEFS[domain]
if (!brief) {
  log(`Unknown domain: ${domain}. Use 'rendering', 'sim', or 'ui'.`)
  return { error: `Unknown domain: ${domain}` }
}

const prompt = `${brief}

FIRST: Read the shared context file at ${CTX} — it has the current depth hierarchy, established patterns, and known issues. Internalize it before making any changes.

TASK: ${args.task}

${args.hints ? `HINTS FROM ORCHESTRATOR: ${args.hints}` : ''}

After making changes:
1. Run \`npx tsc --noEmit\` in ${ROOT} — must be clean
2. Run \`npx vitest run\` in ${ROOT} — all tests must pass
3. If you changed any depth values, list them explicitly so the context file can be updated

Report what you changed (files + line ranges), what the user should verify visually, and any depth/pattern changes that need to go into game-dev-context.md.`

const result = await agent(prompt, { label: `${domain}:impl` })

phase('Verify')

const verify = await agent(`Run verification for the changes just made to Leyline Garden at ${ROOT}:

1. Run: npx tsc --noEmit
2. Run: npx vitest run
3. Run: git diff --stat to see what files were touched

Report: pass/fail for each step, list of modified files, any warnings.
Do NOT make any code changes — only verify.`, { label: 'verify' })

return { domain, task: args.task, result, verify }
