# Muju changes

For work on Muju Hono Tanka, read [the content and release DAG](muju/docs/CONTENT_DAG.md)
before editing. It covers rules, the site, MCP helpers, deterministic AI, saved
games, balance evidence, Academy, and the three separate deployment targets.

When asked to change a piece, rule, or other Muju content and “update everything,”
use `python3 tools/muju-content-dag.py plan --kind piece-stats` (or the appropriate
kind from the guide), implement the affected closure, and follow its verification
and release instructions. Review every affected node; record changed, verified
unchanged, or blocked with evidence. A plan is not evidence of completion.

Preserve unrelated local edits. Preserve historical experiments, Academy archives,
and previous release evidence. Change current sources and regenerate current
outputs; do not mass-replace old results. Keep the DAG current when adding or
moving a Muju surface. This mapping does not itself authorize publishing; follow
the user's task scope, and complete authorized deployment work without asking again.
