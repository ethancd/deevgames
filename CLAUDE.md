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
