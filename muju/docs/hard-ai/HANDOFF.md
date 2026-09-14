# Muju Hard AI — handoff (paused 2026-09-14)

This document is written so that a different Claude account (or a person) can take the project over
with no access to the original session. Everything needed is in this branch. Read this file first,
then the reading list in §3.

## 1. What this project is

Goal, as stated by Ethan: research everything learned about Muju in the last one to two weeks
(as documented in the repo), integrate it into a better strategic understanding of the game, and
then build a much stronger set of engine primitives and tools and ultimately a much stronger
deterministic "Hard AI" player, applying the engineering techniques of perfect-information
deterministic game engines (static positional evaluation, opening books, dynamic programming,
search, tables, tuning, verification).

The work was run as three multi-agent workflow phases:

1. **Understand** (done). Six reader agents mapped the rules engine, the shipped AI, the lab
   harness, the strategy prose, the recorded games and the engine-technique literature; a
   synthesizer produced the strategic model and the engine gap list; a critic and three gap-fill
   readers closed the holes.
2. **Design** (done). Three independent designs (search-first, knowledge-first,
   measurement-first) were judged by two reviewers and a code-feasibility checker; a chief
   architect wrote the binding `DESIGN.md` and the milestone DAG `MILESTONES.md`.
3. **Implement** (started, paused). A DAG executor implements each milestone, has an independent
   verifier run its gate and review the code, allows up to two fix rounds, and commits the
   milestone's files on green. **M1 is green and committed. M2 and M4 had started but had not
   written any files when the pause was requested, so nothing is half-done on disk.**

## 2. Where everything is

| Thing | Location |
|---|---|
| Worktree | `/Users/ashkie/src/deevgames-muju-hardai` (git worktree of `/Users/ashkie/src/deevgames`) |
| Branch | `claude/muju-hard-ai` |
| Base | `codex/muju-online-deploy` at `1ac8026` plus commit `44c41c4`, a snapshot of the main checkout's uncommitted v2.8 work (SPEC v2.8, 504-crystal map, expansion economy, analysis tools, time controls). The main checkout is Codex's live tree and is still dirty; do not commit there. |
| Commits on this branch | `44c41c4` snapshot · `9b7b023` phase 1 docs · `f865174` phase 2 design · `e700f01` **M1** · then this handoff |
| Game code | `muju/` inside the worktree; run every `npm`/`npx` command from there |
| `node_modules` | symlinks to the main checkout's `muju/node_modules` and root `node_modules` (excluded from git via `.git/info/exclude`) |
| Project docs | `muju/docs/hard-ai/` (this file, `STRATEGIC_UNDERSTANDING.md`, `ENGINE_GAPS.md`, `DESIGN.md`, `MILESTONES.md`, `understand/`, `design/`, `workflows/`) |
| New engine code | `muju/src/ai/hard/` (only `verify/perft.ts` exists so far) |
| New tooling | `muju/lab/hard-ai/` (M1's verify runner, perft, positions corpus, deps lint) |
| New tests | `muju/tests/ai/hard/` |
| Gate artifacts | `muju/lab/results/hard-ai-verify/M<n>.json` (M1 present and green) |
| Baseline test state | 62 files / 796 tests green at the snapshot commit; M1 added its own |

Large files: `muju/lab/results/**/games.jsonl` and `*.bin` census files are hundreds of MB and are
deliberately **not** committed (they were `git rm --cached`; they still sit on disk). Never
`git add -A` in this worktree.

## 3. Reading order for the new owner

Read in this order; each builds on the previous. Together they are about 12,000 lines and they are
the whole reasoning of the project, so do not skip them.

1. `STRATEGIC_UNDERSTANDING.md` — the integrated model of Muju v2.8: economy, action economy, kill
   table, spawn geometry, tempo and draw clock, game phases, the **twenty strategic invariants** (§7),
   contradictions between sources with rulings (§8), what is not known (§9).
2. `ENGINE_GAPS.md` — 22 prioritized gaps in the shipped AI. Headline: the shipped MCTS completes
   zero iterations in 138 of 140 decisions, so today's Hard is a tactical override layer plus a
   one-ply static ranking of at most 20 candidates. Section 3 is the recommended order.
3. `DESIGN.md` — **binding**. §0 rulings (spine, 25 fatal flaws with fixes, judge disagreements),
   §2 module layout and layering lint, §3 packed representation and Zobrist, §4 normative interfaces
   (code blocks; implement them exactly), §5 algorithms, §6 worker/UI exposure and rollout gating,
   §7 verification suite, §8 constants.
4. `MILESTONES.md` — the 20-milestone DAG with files, specification pointers, one-command gates and
   pass criteria.
5. `understand/*.md` — the six reader maps plus the critique and gap-fills; consult when a DESIGN
   section cites them (RE, CA, LH, SD, GR, ET tags).
6. `design/*.md` — the three candidate designs, the three judge reviews, `feasibility.md`, and
   `DEVIATIONS.md` (created by implementers when they must deviate from DESIGN; empty so far).
7. `understand/napkin-snapshot.md` — the repo napkin at pause time; the Muju rows (lost games
   against Codex, MCP tooling lessons) are the raw evidence behind several invariants.

Key numbers a new owner should know without looking them up: 4 shared actions per turn;
purchases and promotions cost crystals but no actions; tier-1 prices 3/4/5, promotions 4 then 8;
map holds 504 crystals (0/4/8/16 cells, 180° symmetric); draw after ten quiet turns (only attack
kills reset it); a proven home checkmate resolves at the move and beats the draw; frozen perft on
the initial position: 14,959 action sequences, 1,053 mid-turn states, 797 end positions.

## 4. Architecture in one paragraph

A packed typed-array **replica** of the rules (100-square bitboards as four Uint32, `RECT` spawn
masks per side and anchor, square-keyed two-tier Zobrist, make/unmake) under `src/ai/hard/core`,
continuously differential-fuzzed against the canonical `src/game` transition, which stays the
authority (every dispatched action is revalidated by `isLegalAction`). On top: a **tables** layer
(threat maps including purchasable-unit reach, approach classification with retreats, kill DP with
pre-adjacency and Cleave chains, economy DP over live reserves, spawn geometry with blocking sets,
home safety); a **within-turn action search** with footprint-based canonical ordering and a turn
transposition table; a **candidate-turn generator** (K≈24, forced injections never counted against
K) with a measured recall gate ≥ 90 %; **iterative-deepening PVS over macro-turns** with a macro TT,
SEE-analogue ordering, quiescence over tactical turns (kills, corner entry/exit,
summon-and-strike), a df-pn **home-force** module, and a **staged integer evaluation** (centi-crystals)
whose features include the twenty invariants as Texel-weighted penalties (never hard filters; the
generator always contains the mine-only baseline). Determinism: a clock is read once before the
search to pick a quantised work rung (`WORK_LADDER = 25k × 2^k`), then never again. Later: Texel
and SPSA tuning on a self-play corpus, an opening book keyed by handicap and 180°-canonical key, an
AssemblyScript port of the two hot kernels. `AIEngineV2` stays as Easy/Medium and as the fallback;
the new engine reaches the UI's Hard slot only after winning the M19 SPRT against today's Hard at
equal wall clock (seat-mirrored paired seeds, handicaps 0 and 3, adjudication rate ≤ 1 %).

## 5. Milestone status

| id | title | group | status |
|---|---|---|---|
| M1 | Verify runner, perft fixtures, position corpus, deps lint, constants test | A | **green, committed `e700f01`** |
| M2 | Ladder: sharded runner, pairing, SPRT, Elo, harness v3, determinism tool | B | not started (agent was reading when paused) |
| M4 | Packed primitives: bits, tables, catalog, zobrist, action, config, interface tests | B | not started (same) |
| M3 | Whole-turn worker path for AIEngineV2 | C | blocked on M2 |
| M5 | Replica: state, movement, spawn, income, make/unmake, generators, fuzzer | C | blocked on M4 |
| M6–M11 | Tables (threat, kill, economy, geometry), home-prover replica, within-turn search | E | blocked on M5 |
| M12 | Evaluation v0, invariants, NodeTables builder | F | blocked on M6–M9 |
| M13 | Candidate generator, keep-sets, recall instrument | G | blocked on M11, M12 |
| M14 | Search core, root, engine, replay, lab bot | H | blocked on M13, M10 |
| M15–M18 | Exposure/UI, df-pn, search refinements, tuning + book | I | blocked on M14 (M15 also on M3) |
| M19 | Ship-gate measurement campaign | J | blocked on M15 |
| M20 | Feature measurement campaign | J | blocked on M16–M19 |

Critical path: M1 → M4 → M5 → {M6..M11} → M12 → M13 → M14 → M15 → M19.

To see the state at any time: `git log --oneline` (one commit per green milestone, titled
`Hard AI M<n>: …`) and `ls muju/lab/results/hard-ai-verify/`.

## 6. How to resume

### 6.1 Sanity check the environment

```bash
cd /Users/ashkie/src/deevgames-muju-hardai/muju
git status --short | grep -v node_modules     # expect only untracked lab/results binaries
npx vitest run                                # full suite, ~20 s, must be green
npm run hard:verify -- --gate M1              # must print the M1 pass line
```

If `node_modules` symlinks are missing (fresh clone elsewhere): `npm ci` inside `muju/` and in the
repo root, then `npm run ai:wasm` once to build the AssemblyScript kernel.

### 6.2 Run the next milestones

Group B is next: **M2 and M4 in parallel** (disjoint files). Then C (M3 after M2; M5 after M4),
then E (M6–M11 all in parallel after M5), and so on per the DAG.

The per-milestone protocol that was used, and should continue to be used, is:

1. **Implementer** (one agent per milestone; the models used were Opus for the algorithmic core
   M4–M7, M10–M14, M16, M17 and Sonnet for tooling/measurement M1–M3, M8, M9, M15, M18–M20) reads
   its `MILESTONES.md` section, DESIGN §0–§2, every DESIGN section the milestone cites, and §4 for
   every interface it implements or consumes; builds every listed file and test; adds its gate row
   to `lab/hard-ai/verify/gates.ts`; runs the gate until it passes; runs
   `npx tsc --noEmit -p tsconfig.json` and its vitest files.
2. **Verifier** (Opus, independent) reruns the gate and applies the pass criterion itself, runs
   `tsc` and the full `npx vitest run`, diffs the changed files against DESIGN §4 and the milestone's
   file list, greps `src/ai/hard` for `Date.now|Math.random|performance.now|BigInt`, writes and runs
   an extra adversarial check (more seeds, a hostile authored position, an edge rule from
   `understand/rules-engine.md` §8), and only on pass commits **exactly the milestone's files**:
   `git add -- <paths> && git commit -m "Hard AI M<n>: <title>"`.
3. **Fix agent** (Opus) on failure, with the verifier's findings; at most two fix rounds, then the
   milestone is reported red and its dependents are skipped.

The exact prompts are in `workflows/phase3-implement.js` (functions `implPrompt`, `verifyPrompt`,
`fixPrompt`, and the `RULES` block). That file is a Claude Code Workflow script: with the Workflow
tool available, run it as-is (it schedules the DAG itself and skips nothing that is already green
only if you edit the `MILESTONES` array to drop M1, or simply accept that M1's implementer will
find the work done and its verifier will re-verify it). Without the Workflow tool, drive the same
three-role loop by hand with the Agent tool, one milestone at a time, respecting `parallelGroup`.

### 6.3 Rules every agent must follow (from the `RULES` block)

- Work only inside the worktree; never touch `/Users/ashkie/src/deevgames` or any `/private/tmp`
  worktree; never start a dev server.
- Never run `npm test` while other agents are active (its `pretest` recompiles the shared WASM
  kernel and races); use `npx vitest run <paths>` and `npx tsc --noEmit -p tsconfig.json`.
- Touch only the milestone's listed files plus new files under the directories it names; never
  edit `src/game/**`; never edit another milestone's files; if a shared file genuinely needs an
  additive change, make it minimal and report it.
- No `git add -A`, no checkout/stash/reset/rebase; the stash stack is shared with other worktrees.
- Determinism bans: no `Date.now`, `Math.random`, `performance.now`, `crypto.` under
  `src/ai/hard/**` except `search/time.ts` and `engine.ts calibrate()`; no `BigInt` anywhere under
  `src/ai/hard/**`; integer scores; no imports from `lab/solver/**` or the old engine
  (`src/ai/engine-v2.ts`, `planner/*`, `search/*`, `evaluation.ts`). `npm run hard:deps` enforces this.
- Deviations from DESIGN go in `design/DEVIATIONS.md` under a `## M<n>` heading, dated, with the
  reason and the interface consequence.

### 6.4 Gotchas discovered so far

- The Claude Code auto-mode classifier blocks `git push origin master` and `kill <pid>`; branch
  pushes are fine. This branch has not been pushed.
- Concurrent verifiers committing in the same worktree can hit `index.lock`; retry after a few
  seconds.
- Node 24 prints an experimental SQLite warning during tests; harmless.
- `lab/solver/model.ts` had `ACTIONS = 6` (stale; the game is four actions). M1 changed it to 4.
- `tests/ai/worker.test.ts` asserts protocol `version: 2` with no `mode`; the worker protocol
  extension in M3 must stay additive (`version: 2 | 3`, `mode?` optional).
- `npm run build` runs `tsc` on `src/` only; `lab/**` is typechecked by `npm run hard:types`.
- Cross-engine strength must be measured at equal **wall clock**, never at equal fixed work (the
  old engine's work units are not comparable); intra-engine comparisons use fixed work.

## 7. Open questions the new owner should expect to face

- Whether the candidate generator's recall really reaches 90 % (DESIGN §5.6; the single biggest
  risk). M13's gate measures it; if it fails, widen the reference generator's witnesses before
  widening K.
- Whether macro positions transpose often enough for the macro TT to matter (reserves are in the
  key). M14 reports the hit rate; below ~5 % shrink the macro TT and enlarge the turn TT.
- First-player advantage and draw frequency at strong play (STRATEGIC_UNDERSTANDING §8.2, §9).
  All ladders are seat-mirrored and run at handicaps 0 and 3 for this reason.
- Phone budget: no real iPhone measurement exists; the phone profile in M15 is a desktop estimate
  until M19's phone gate runs.
- Home checkmate versus the ten-quiet-turn draw: the code resolves a proven checkmate at the move
  and it beats the draw; the SPEC does not say so. The engine models the code; a JUDGMENT_LOG
  ruling is wanted (ENGINE_GAPS G22).

## 8. Integrating back when done

The snapshot commit `44c41c4` duplicates work that Codex has still not committed in the main
checkout. When the Hard AI is ready to merge:

1. Ask Ethan to have Codex commit its v2.8 work on `codex/muju-online-deploy` (or wherever it lands).
2. Rebase or cherry-pick this branch's commits **after** `44c41c4` onto that commit. The Hard AI
   commits touch only `src/ai/hard/**`, `lab/hard-ai/**`, `tests/ai/hard/**`, `docs/hard-ai/**`, a
   few additive lines in `src/ai/worker/*`, `src/ai/types.ts`, `src/hooks/useAI.ts`,
   `lab/harness/{types,runner}.ts`, `lab/solver/model.ts`, `package.json`, and new e2e files, so
   conflicts should be confined to those shared files.
3. Ship only after M19 is green (DESIGN §6.4 rollout gating). Until then the UI's Hard slot must
   keep using `AIEngineV2`.

## 9. Session provenance

Original session: https://claude.ai/code/session_01PkrS9DRcQ7gWhR1LbovT5D (Claude Fable 5.1,
2026-09-14). Phase 1 used 11 agents, phase 2 used 7, phase 3 had run 2 agents (M1 implementer and
verifier) plus the two group-B implementers that were stopped before writing. The three workflow
scripts are preserved verbatim under `workflows/`.
