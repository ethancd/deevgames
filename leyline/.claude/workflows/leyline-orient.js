export const meta = {
  name: 'leyline-orient',
  description: 'Bootstrap a Leyline Garden game dev session — three specialists map their domains in parallel',
  whenToUse: 'Run at the start of a game dev session to populate the shared context file',
  phases: [
    { title: 'Map', detail: 'Three specialists orient on their file domains in parallel' },
    { title: 'Synthesize', detail: 'Merge findings into the shared context file' },
  ],
}

const ROOT = '/Users/ashkie/src/deevgames/leyline'
const CTX = `${ROOT}/.claude/game-dev-context.md`

const ORIENT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'One-paragraph domain overview' },
    depthValues: { type: 'string', description: 'All depth values found, one per line: depth — what' },
    keyPatterns: { type: 'string', description: 'Important patterns, constants, blend modes' },
    gotchas: { type: 'string', description: 'Things that would trip up someone making changes' },
    fileMap: { type: 'string', description: 'Each file: path — what it does — approximate line count' },
  },
  required: ['summary', 'depthValues', 'keyPatterns', 'gotchas', 'fileMap'],
}

phase('Map')
log('Orienting three specialists on the Leyline Garden codebase...')

const [rendering, sim, ui] = await parallel([
  () => agent(`You are the Rendering specialist for Leyline Garden, a Phaser 3 isometric game at ${ROOT}.

Read these files thoroughly and report a structured analysis:
- src/phaser/scenes/BaseGameScene.ts (LARGE — focus on: depth values set anywhere, lighting/overlay setup, glow creation methods, rain system, debug rendering, createPlayer, all setDepth calls)
- src/phaser/Lighting.ts
- src/phaser/IsoUtils.ts (grid/screen conversion math)
- src/phaser/MotePool.ts
- src/phaser/scenes/BootScene.ts (skim — texture generation)
- src/phaser/scenes/SurfaceScene.ts
- src/phaser/scenes/UndergroundScene.ts

For depthValues: find EVERY setDepth() call and constant. This is critical — depth ordering bugs are the #1 issue.
For keyPatterns: document blend modes (MULTIPLY vs ADD), the iso math (HALF_W=32, HALF_H=16), glow shapes used.
For gotchas: note any fragile assumptions, things that broke before (diamond polygons, separate glow circles, progress filters).`, {
    label: 'orient:rendering',
    schema: ORIENT_SCHEMA,
  }),

  () => agent(`You are the Sim/Engine specialist for Leyline Garden, a game at ${ROOT}.

Read these files thoroughly and report a structured analysis:
- src/sim/LeylineEngine.ts (mote emission, movement, delivery, relay through holes, occupancy checks)
- src/sim/WeatherSystem.ts (clock, rain, plant feeding via emit ticks, idle simulation)
- src/sim/World.ts (game state, plant placement, seed costs, dig, leyline management)
- src/sim/PlantConfig.ts (growth stages, requirements, transmute recipes)
- src/sim/types.ts (all interfaces, enums, constants — SeedType, ResourceType, etc.)
- src/sim/Pathfinding.ts
- src/sim/SaveManager.ts

For depthValues: report N/A (sim has no rendering).
For keyPatterns: document emit interval, feed timing, mote delivery chain, hole relay logic, the hasPlantNear guard.
For gotchas: note the canAcceptResource fix, excludeMote pattern, seed cost resource types.`, {
    label: 'orient:sim',
    schema: ORIENT_SCHEMA,
  }),

  () => agent(`You are the UI specialist for Leyline Garden, a game at ${ROOT}.

Read these files thoroughly and report a structured analysis:
- src/bridge.ts (pub/sub event bus — all listener topics, debug actions)
- src/ui.ts (toolbar, tooltips, weather HUD, emit clock, debug panel, exported functions)
- index.html (DOM structure, CSS, debug panel styles)

For depthValues: report any z-index values in CSS.
For keyPatterns: document the listener/notify pattern, how debug panel works, how tool changes flow.
For gotchas: note the pointer-events setup, safe-area handling, the 1024px debug panel breakpoint.`, {
    label: 'orient:ui',
    schema: ORIENT_SCHEMA,
  }),
])

phase('Synthesize')
log('Merging specialist findings into shared context...')

const synthesis = await agent(`You are updating the shared game dev context file for Leyline Garden.

Read the EXISTING context at ${CTX}.

Here are fresh orientation reports from three specialists:

=== RENDERING ===
${JSON.stringify(rendering, null, 2)}

=== SIM ===
${JSON.stringify(sim, null, 2)}

=== UI ===
${JSON.stringify(ui, null, 2)}

Update the context file at ${CTX}. Preserve the existing structure and "Established Patterns" section (those are hard-won lessons). Update or add:
- Depth Hierarchy table (use the rendering specialist's findings — be exhaustive)
- File Ownership Map (use each specialist's fileMap)
- Current State (refresh based on all three reports)
- Known Issues (keep existing, add any new gotchas found)

Write the updated file. Keep it concise but complete — this is the single source of truth that all future agents will read.`, {
  label: 'synthesize',
})

return { rendering, sim, ui, synthesis }
