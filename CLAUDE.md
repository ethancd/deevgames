# Claude Development Notes

## Changing Muju end to end

Follow [the Muju content and release DAG](muju/docs/CONTENT_DAG.md) for changes to
pieces, rules, AI, MCP, site content or Academy. Start with
`python3 tools/muju-content-dag.py plan --kind piece-stats` (or another documented
kind), then review every affected node through verification and applicable
deployment. Record changed, verified unchanged, or blocked with evidence.
The browser site, Node/MCP host and Academy have separate release paths.

## Playing Muju through MCP

Before playing, consult [Muju MCP tool TAPs](muju/docs/MCP_TOOL_TAPS.md): shared
trigger–action plans for Codex and Claude covering all tools, focused analysis,
staging, clocks and recovery. Check live discovery and rules for current behavior.

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
