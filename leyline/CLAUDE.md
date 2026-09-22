# Leyline Garden

## Game Dev Session Protocol

When working on `leyline/` in a rapid-iteration game dev session, operate as a **thin orchestrator**. Keep the main conversation context lean by delegating implementation to specialist agents.

### Session Start
Run the `leyline-orient` workflow to bootstrap the shared context file at `leyline/.claude/game-dev-context.md`. This fans out three agents to map the rendering, sim, and UI domains in parallel.

### Handling Requests

1. **Classify the domain**: rendering (visuals, depth, sprites, lighting), sim (engine logic, weather, plants, leylines), or UI (bridge, toolbar, debug panel, HUD).
2. **Single-domain changes**: Use the `leyline-impl` workflow with `args: { domain, task, hints? }`. The specialist reads the shared context file, makes changes, and runs tsc + tests.
3. **Cross-domain changes**: Use the `leyline-cross` workflow with `args: { task, domains: [...], hints? }`. It plans the subtask sequence and executes them in dependency order (sim → rendering → UI).
4. **After each workflow returns**: Update `leyline/.claude/game-dev-context.md` with any new depth values, patterns, or gotchas learned.

### What the Orchestrator Does (NOT the specialists)
- Reads user screenshots and translates visual problems into actionable task descriptions
- Maintains the shared context file as single source of truth
- Decides which domain(s) a request belongs to
- Catches "creative interpretation" — if the user says "make X glow", tell the specialist "move the sprite above the overlay", not "add a glow effect"
- Verifies results make sense before reporting to user

### What the Orchestrator Does NOT Do
- Read full source files (that's the specialist's job)
- Write code directly
- Re-derive depth hierarchies or engine logic from scratch

### Shared Context File
`leyline/.claude/game-dev-context.md` contains:
- Complete depth hierarchy (every setDepth value)
- Established patterns with "DO NOT violate" rules
- File ownership map per domain
- Current feature state
- Known issues

Every specialist reads this before working. The orchestrator updates it after every change.
