# Cleave without a tier cap — rules revision `muju-phasing-3` -> `muju-phasing-4` (2026-09-23)

Owner: Ethan. Decisions below are final.

## Rule (SPEC v3.4 §4.2)

Every unit begins its turn with one attack. Each of its own killing blows unlocks one further
attack, with no maximum; the per-tier cap (I: 1, II: 2, III: 3) is removed. Each attack still
costs one of the four shared actions, so a unit makes at most four attacks a turn. Unchanged: a
surviving target (including a zero-damage hit) closes the chain; another unit's kill does not
reopen it; a unit cannot attack the same target twice; moving between attacks is allowed.
Example: a Hi (Fire I, ATK 2 +1 vs Plant) beside four Muju (DEF 3) kills all four in one turn.

## Owner decisions

- **In-progress games upgrade in place.** Save schema 10 -> 11; a v10 save resumes under the new
  rule with its kill clock intact. An unfinished, unarchived `muju-phasing-3` room is restamped
  `muju-phasing-4` once at host start. Finished or archived rooms keep their stamp and are
  retired; any unarchived retired row is archived in its lifecycle columns (data bytes untouched)
  so the scheduler never retries it.
- **Hard AI: rules-correct only.** Replica, tables, prover, WASM and Zobrist follow the rule;
  weights untouched; strength measurement deferred (see
  `docs/hard-ai/PHASING-4-UNLIMITED-CLEAVE-2026-09-23.md`).
- **Academy:** course-page notice now (prepared, not deployed); R03 re-narration later.
- **Release:** merge to master and deploy the Render host. Pages remains blocked (credentials).

## Evidence

`2026-09-23-unlimited-cleave-plan.md` (DAG plan) and `2026-09-23-unlimited-cleave-evidence/`:
Gate 0 (perft canonical + replica, fuzz 20000 actions seed 7101, determinism — all exit 0), full
vitest (217 files pass), online e2e (84 pass), local Cleave + AI-worker e2e (11 pass), and the
suite re-authoring check (225 cases re-derive with only binding hashes changed).

## Deferred to a follow-up PR

Ladder `HISTORICAL_PHASING_REVISIONS` (teach `-2`/`-3`), minor test tidy-ups, the p4 scripted
reference, suite bundle re-authoring and Gate 1 re-adoption (the strength campaign).
