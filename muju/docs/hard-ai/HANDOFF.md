# Muju Hard AI — handoff (paused 2026-09-14; resumed and paused twice more, 2026-09-14 §10 and 2026-09-15 §11)

**Current state in one line:** M1–M14 are all green and committed; the whole critical path up to and
including the search core is done. Groups I (M15–M18) and J (M19, M20) have not been started. Read
**§11** first — it is the newest pause, it records three milestones whose pass criteria were amended
rather than met, and it is the one that tells you how to start group I.

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
3. **Implement** (in progress, paused three times). A DAG executor implements each milestone, has an
   independent verifier run its gate and review the code, allows up to two fix rounds, and commits
   the milestone's files on green. **M1–M14 are green and committed — the critical path through the
   search core is done. Groups I (M15–M18) and J (M19, M20) have not been started, and the tree is
   clean. See §11.**

## 2. Where everything is

| Thing | Location |
|---|---|
| Worktree | `/Users/ashkie/src/deevgames-muju-hardai` (git worktree of `/Users/ashkie/src/deevgames`) |
| Branch | `claude/muju-hard-ai` |
| Base | `codex/muju-online-deploy` at `1ac8026` plus commit `44c41c4`, a snapshot of the main checkout's uncommitted v2.8 work (SPEC v2.8, 504-crystal map, expansion economy, analysis tools, time controls). The main checkout is Codex's live tree and is still dirty; do not commit there. |
| Commits on this branch | `44c41c4` snapshot · `9b7b023` phase 1 docs · `f865174` phase 2 design · `e700f01` **M1** · `bd35df1` handoff · `07f43f1` **M4** · `faedd9d` **M2** · `7f51d33` **M5** · `96e3047` handoff · `3f8f098` **M8** · `cc10676` **M6** · `5545447` **M10** · `113ed09` **M7** · `257cbc8` **M11** · `6e45777` **M3** · `e0c51c7` **M9** · `c373392` **M12** · `f2906f6` **M13** · `83f53a8` **M14** · then this handoff update |
| Game code | `muju/` inside the worktree; run every `npm`/`npx` command from there |
| `node_modules` | symlinks to the main checkout's `muju/node_modules` and root `node_modules` (excluded from git via `.git/info/exclude`) |
| Project docs | `muju/docs/hard-ai/` (this file, `STRATEGIC_UNDERSTANDING.md`, `ENGINE_GAPS.md`, `DESIGN.md`, `MILESTONES.md`, `understand/`, `design/`, `workflows/`) |
| New engine code | `muju/src/ai/hard/` — `core/`, `tables/`, `tactics/`, `gen/`, `eval/`, `search/`, `book/`, `engine.ts` (M4–M14 all landed) |
| New tooling | `muju/lab/hard-ai/` — verify runner, perft, corpora, deps lint, ladder, oracles, suites, recall, bench, bots |
| New tests | `muju/tests/ai/hard/` |
| Gate artifacts | `muju/lab/results/hard-ai-verify/` and `hard-ai-verify-2026-09-15/` (M1–M14 present and green) |
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
   `DEVIATIONS.md` (created by implementers when they must deviate from DESIGN; now substantial — read
   the M12, M13 and M14 sections alongside §11.4 of this file).
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
| M2 | Ladder: sharded runner, pairing, SPRT, Elo, harness v3, determinism tool | B | **green, committed `faedd9d`** |
| M4 | Packed primitives: bits, tables, catalog, zobrist, action, config, interface tests | B | **green, committed `07f43f1`** |
| M3 | Whole-turn worker path for AIEngineV2 | C | **green, committed `6e45777`** (2 verify rounds; first red was a foreign flaky test, see §11.3) |
| M5 | Replica: state, movement, spawn, income, make/unmake, generators, fuzzer | C | **green, committed `7f51d33`** (1,000,000-action differential fuzz, 0 divergences) |
| M6 | Threat maps and approach table | E | **green, committed `cc10676`** |
| M7 | Kill-combination DP and Cleave chains | E | **green, committed `113ed09`** |
| M8 | Economy DP and PST | E | **green, committed `3f8f098`** |
| M9 | Spawn geometry and home tables | E | **green, committed `e0c51c7`** (3 verify rounds) |
| M10 | Home-prover replica and checkmate gating proof | E | **green, committed `5545447`** |
| M11 | Within-turn action search, turn TT, TurnPool | E | **green, committed `257cbc8`** |
| M12 | Evaluation v0, invariants, NodeTables builder | F | **green, committed `c373392`** — ⚠ gate throughput bar lowered, see §11.4 |
| M13 | Candidate generator, keep-sets, recall instrument | G | **green, committed `f2906f6`** (2 verify rounds) — ⚠ recall criterion rewritten, see §11.4 |
| M14 | Search core, root, engine, replay, lab bot | H | **green, committed `83f53a8`** (3 verify rounds) — ⚠ two clauses re-homed to M18, see §11.4 |
| M15–M18 | Exposure/UI, df-pn, search refinements, tuning + book | I | **not started** (unblocked: M14 and M3 are green). M18 has gained two clauses from M14 — §11.4 |
| M19 | Ship-gate measurement campaign | J | **not started**, blocked on M15 |
| M20 | Feature measurement campaign | J | **not started**, blocked on M16–M19 |

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

## 10. Second pause (2026-09-14, later the same day)

The DAG was resumed with `workflows/phase3-resume.js` (the phase-3 script plus `args.done` to skip
green milestones and `args.partial` to tell an implementer that interrupted files exist). Ethan asked
for a safe pause while group E was running. **M4, M2 and M5 are green and committed** (in that order).
Everything below is on disk, uncommitted and unverified; nothing was committed that did not pass a gate.

### 10.1 Uncommitted files by milestone

| Milestone | State | Files (relative to `muju/`) |
|---|---|---|
| M3 | complete draft, gate red at the playwright/ladder step | `src/ai/worker/{protocol,handler,client}.ts`, `src/ai/types.ts`, `src/hooks/useAI.ts`, `lab/hard-ai/ladder/engines.ts`, `tests/ai/turn-execution.test.ts` (modified); `tests/ai/worker-turn.test.ts`, `e2e/hard-ai.spec.ts`, `playwright.hard.config.ts` (new); partial ladder shards under `lab/results/hard-ai-verify/M3.json/` (a directory, misnamed — the `--out` path was treated as a directory) |
| M6 | partial | `src/ai/hard/tables/threat.ts`, `src/ai/hard/tables/approach.ts`, `src/ai/hard/tables/context.ts`, `tests/ai/hard/threat.test.ts` (19 of its tests fail) |
| M7 | partial | `src/ai/hard/tables/kill.ts`, `tests/ai/hard/kill.test.ts` |
| M8 | partial | `src/ai/hard/tables/economy.ts`, `lab/hard-ai/oracles/economy.ts`, `tests/ai/hard/economy.test.ts` |
| M9 | partial | `src/ai/hard/tables/geometry.ts` |
| M10 | partial | `src/ai/hard/tactics/prover.ts` (two `tsc` errors: unused `PA` import, `Scratch` used as a value) |
| M11 | partial | `src/ai/hard/gen/actionsearch.ts`, `src/ai/hard/gen/turn.ts` |
| shared | | `lab/hard-ai/verify/gates.ts`, `lab/hard-ai/verify/run.ts` (gate rows/reporters added by the in-flight milestones), `docs/hard-ai/design/DEVIATIONS.md` (entries appended by in-flight milestones after the committed M5 section) |

`context.ts` is a shared file by design (interface at M6, body at M12).

### 10.2 State of the tree at the pause

- `npx tsc --noEmit -p tsconfig.json`: 2 errors, both in `src/ai/hard/tactics/prover.ts` (M10).
- `npx vitest run`: 20 failures, 19 in `tests/ai/hard/threat.test.ts` (M6) and one elsewhere; every
  committed milestone's tests were green at its commit.
- The committed state (`7f51d33`) is expected to be fully green; verify by checking out that commit in
  a scratch worktree rather than stashing here.

### 10.3 How to resume from here

```bash
cd /Users/ashkie/src/deevgames-muju-hardai/muju
git status --short | grep -v states-h     # expect exactly the §10.1 files
```

Then run `workflows/phase3-resume.js` with the Workflow tool and
`args: { done: ["M1","M2","M4","M5"], partial: ["M3","M6","M7","M8","M9","M10","M11"] }`. Each
`partial` implementer is told its predecessor's files exist on disk and to continue from them; the
verifier protocol is unchanged. If you would rather start those milestones clean, delete the §10.1
files first (never `git stash`; the stash stack is shared with other worktrees).

## 11. Third pause (2026-09-15) — groups C, E, F, G, H complete; stopped before group I

Ethan asked for the DAG to be resumed 8 hours after the second pause, and to be **stopped once group H
(M14) finished** so that he could take group I and group J himself. That is exactly what happened: the
M14 verifier committed `83f53a8` at 18:57 CDT and the workflow was stopped seconds later, before any
group I agent had spawned. **Nothing is half-done on disk this time** (contrast §10).

### 11.1 What ran

`workflows/phase3-resume.js`, verbatim, with
`args: { done: ["M1","M2","M4","M5"], partial: ["M3","M6","M7","M8","M9","M10","M11"] }`.
07:13 → 18:57 CDT, 11h44m, **32 agents** (29 Opus, 3 Sonnet — the Sonnet three are the M3, M8 and M9
implementers; every verifier and fix agent is Opus per the script). Nine milestones went from
uncommitted-partial or not-started to green and committed.

### 11.2 Outcome

| Milestone | Commit | Verify rounds | Note |
|---|---|---|---|
| M3 | `6e45777` | 2 | first red was a foreign flaky test, not M3 |
| M6 | `cc10676` | 1 | |
| M7 | `113ed09` | 1 | |
| M8 | `3f8f098` | 1 | |
| M9 | `e0c51c7` | 3 | two verifiers failed it on blockers despite a green gate |
| M10 | `5545447` | 1 | |
| M11 | `257cbc8` | 1 | |
| M12 | `c373392` | 1 | ⚠ §11.4 |
| M13 | `f2906f6` | 2 | ⚠ §11.4 |
| M14 | `83f53a8` | 3 | ⚠ §11.4 |

The independent-verifier protocol did real work: **five** verifier rounds returned `pass=false` and
forced a fix round, and three of those failures were on milestones whose own gate was green (M9 twice,
M13 once). Do not weaken this step.

### 11.3 Wall-clock shape (for planning group I/J)

Group E's six milestones ran in parallel and averaged ~13 min each. From M12 the DAG is one-wide and
the milestones actually execute the engine, so they cost far more: M12 ~1 h, M13 ~2.6 h, M14 ~6.5 h.
Group I (M15–M18) fans out four-wide again and should be faster in wall clock; M19 and M20 are
game-playing measurement campaigns and will be compute-bound, not agent-bound.

Contention is real. The M14 bench shards 12-way and saturates this 12-core box (load average peaked at
**79**); a flaky M5 test (`tests/ai/hard/make-unmake.test.ts`, 3.16 s solo, 5 s vitest default timeout)
red-lit M3's gate three times purely from load. Prefer running group I milestones with fewer
concurrent heavy gates, and consider raising that test's timeout before you start.

### 11.4 ⚠ Three milestones passed by amending their own pass criterion

This is the most important thing on this page. All three amendments are documented in
`MILESTONES.md` and `design/DEVIATIONS.md` with dates and reasoning — nothing was hidden — and each
was flagged by its verifier as a `major` finding. But **M19 is the ship gate, and it sits downstream
of all three.** Decide what you want to do about these before building on top.

**M12 — throughput bar lowered.** The gate row lowers DESIGN's `stage1PerSec >= 200000` /
`stage2PerSec >= 50000` to `35000` / `10000`. Measured: 70,119/s and 23,949/s — i.e. **2.9× and 2.1×
short of the design figure**, but comfortably over the lowered bar. Separately, `symmetryMismatch === 0`
(`full(p) === -full(mirror180(p))`) fails literally on **409 of 1,194** corpus positions and was
redefined. Nothing is wrong with the evaluation's correctness — the adversarial probe over 1,917
positions found no defects — but the speed budget in DESIGN §8 is not being met.

**M13 — recall criterion rewritten. This is the one to look at first.** HANDOFF §7 already called the
90 % candidate-generator recall "the single biggest risk in the design". Measured absolute recall:

| metric | measured | DESIGN/ET §3.5 asked for |
|---|---|---|
| `top1` | **0.295** | ≥ 0.90 |
| `top3` | **0.500** | ≥ 0.97 |
| `regret_p90` | **2,525 cc** | ≤ 60 |
| `replyTop1` | **0.366** | ≥ 0.85 |

The first verifier failed M13 as a **blocker** on exactly this, and wrote that the DEVIATIONS
justification ("dominated by sample size, not generator quality") was contradicted by the instrument's
own diagnostics. The implementer then replaced the absolute thresholds with *shares of a ceiling the
same instrument computes*, via DESIGN §9's addendum route. The second verifier checked the
unreachability argument independently, accepted it (the ceiling can only fall as the pool widens, so
the argument errs conservatively), added two anti-gaming clauses — and still recorded as a major that
"the shipped ABSOLUTE recall is far below the design's intent and **directly caps M14**". The
ceiling's denominator is a private instrument constant (`DEPTH2_CANDIDATES = 96`) that no gate clause
pins.

**M14 — three clauses genuinely fixed, two re-homed to M18.** Round 1 failed five of thirteen clauses.
Three were then fixed for real, and the numbers are good:

| clause | round 1 | shipped | needs |
|---|---|---|---|
| `bench.proverCallsPer1000Macro` | 24.27 | **0.175** | ≤ 5 |
| `suite.tactics` | 0.823 | **0.918** (73/79) | ≥ 0.85 |
| `suite.spawnStrike` | 0 | **0.95** (19/20) | ≥ 0.80 |
| `suite.homeMate` | 46 | **56/56** | 56 |

The other two moved to M18 by dated amendment:

- `suite.invariants >= 0.90` became `suite.invariantPairs === 20`. Argument: invariants 15 and 18 carry
  weight 0 by DESIGN §5.13, so their violating/correct members evaluate *identically* and the ceiling
  is exactly 18/20 = 0.90; six more pairs (3, 4, 6, 12, 19, 20) favour the violating member by
  2,016–3,662 cc against penalties of 100–800 cc. Shipped: `invariantsEval` **0.60**,
  `invariantsSearched` **0.25**. This reads as a fair call — it is a statement about M12's weight
  vector and the authored fixtures, not about M14's search — and M18 gained a concrete replacement
  clause rather than just losing it.
- The smoke ladder's **strength** number moved to M18. Measured: `hard@lab-400k` scores **3/16 against
  the scripted `Rush` bot at `wall:500` (Elo −255, LOS 1.2e-7)** and **8/16 at `fixed:400000`
  (Elo 0)**. The explanation is `chooseWork` quantising: at 66.6 units/ms this box turns a 500 ms
  budget into `WORK_LADDER[0]` = 25,000 units, about a dozen macro nodes at depth 2. Plumbing clauses
  (`illegalActions`, `replicaDivergences`, `games`) all pass and stay in M14.

**Net:** the engine is correct, deterministic and fast enough to search, but **as of M14 it is not yet
stronger than a scripted L2 bot**, and the two measurements that would have said otherwise now live in
M18. That is a defensible place to be — M18 owns the tuned weights — but it means **M18 is now
load-bearing for the entire strength story**, and it is in the group you are about to run.

### 11.5 New/changed gate rows you inherit

`MILESTONES.md` was edited by the M13 and M14 commits. **M18's row gained two acceptance clauses and
two commands** re-homed from M14:

- `npm run hard:suite -- --suites invariants --engine hard@lab --work 400000 --out lab/results/hard-ai-verify/M18-invariants.json` → `invariantPairs === 20 && invariantsEval >= 0.90`
- `npm run hard:ladder -- --a hard@lab-400k --b Rush --work wall:500 --handicaps 0 --pairs 8 --seed 9 --shards 12 --out lab/results/hard-ai-verify/M18-rush` → `elo >= 0`

M17's row was updated for the renamed artifact key (`suite.invariants` → `suite.invariantsEval`).
M18 is a Sonnet milestone in the script's model table; given what it now carries, consider Opus.

### 11.6 Tree state at this pause

Clean. `git status --short | grep -v states-h` shows **only** untracked gate-result artifacts from
earlier milestones — no source, no partial work:

```
 M lab/results/hard-ai-verify-2026-09-15/M4.json
 M lab/results/hard-ai-verify/M1.json
?? lab/results/hard-ai-verify-2026-09-15/M1.json
?? lab/results/hard-ai-verify/M2-calib/
?? lab/results/hard-ai-verify/M2-self/
?? lab/results/hard-ai-verify/M3.json/          <- the misnamed directory from §10, still harmless
```

At `83f53a8`: `npx tsc --noEmit -p tsconfig.json` clean, `npm run hard:types` clean, `npm run hard:deps`
clean (0 layering / 0 nondeterminism / 0 BigInt), full `npx vitest run` green. No stray node processes.

### 11.7 How to resume group I and J

Group I is fully unblocked (M14 and M3 are both green). Four milestones run in parallel:
**M15** (exposure/UI, deps M14+M3), **M16** (df-pn), **M17** (search refinements), **M18** (tuning and
book) — then **M19** (ship gate, deps M15), then **M20** (deps M16–M19).

To drive it with the same protocol, run `workflows/phase3-resume.js` with:

```
args: { done: ["M1","M2","M3","M4","M5","M6","M7","M8","M9","M10","M11","M12","M13","M14"], partial: [] }
```

Before you do, settle the §11.4 question. The options, briefly: (a) accept the amendments and let M18's
tuning try to earn the strength number back; (b) re-open M13 as its own milestone to fix generator
recall at the root before more is built on it; (c) let group I run and treat M19 as the honest
referee — it is the gate that was always supposed to decide this, and the rollout gating in DESIGN §6.4
already forbids shipping the new engine into the UI's Hard slot until M19 is green.

### 11.8 Gotchas added this run

- The auto-mode classifier **blocks launching a Workflow by `scriptPath`** pointing outside the session
  working directory (both the worktree copy and a scratchpad copy were refused). Passing the identical
  script inline via `script` works. The script under `workflows/` is still the source of truth.
- A verifier killed immediately after its commit does **not** journal its structured return. The commit
  is the authoritative record; `git show` the commit and read the gate artifact rather than hunting for
  the agent's prose. (That is why §11.4's M14 numbers are quoted from
  `lab/results/hard-ai-verify-2026-09-15/M14.json`, not from an agent report.)
- 12-way sharded gates saturate this box. Close stale Claude Code sessions before the M19/M20
  campaigns — there were ~10 alive during this run, plus Codex helpers.
