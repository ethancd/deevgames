# Claude Development Notes

## Lessons Learned

### Context Compaction Pitfalls
When a conversation is compacted and resumed, be careful with items that appear as "clarifications" or "corrections" to a list. These often represent **features that need implementation**, not just documentation of intended behavior.

**Example:** If the user says "X should be allowed" after a list was created, this likely means:
- X is NOT currently implemented
- X NEEDS to be implemented
- Add X to the todo list as an actionable task

Don't just acknowledge the clarification - verify whether it requires code changes and add it to the task list if so.

### Game Design Changes Require Documentation Updates
When changing game design (e.g., element system, combat rules, victory conditions), always update ALL related materials to stay consistent:
- Design specs and game rules documentation
- In-game instructions/tutorials
- Code comments explaining the system
- Test descriptions and expectations
- Any README or player-facing docs

A design change is not complete until all documentation reflects the new design.

## Leyline Garden — Game Dev Session Protocol

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
