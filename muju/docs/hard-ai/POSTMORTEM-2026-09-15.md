# Muju Hard AI — postmortem after the third pause (2026-09-15)

Written from the branch as it stands at `85a1bc5`. Companion to [HANDOFF.md](HANDOFF.md) §11.
Nothing here overrides that document; this one asks *why* we are where we are and what to do about it.

## The one-paragraph version

Fourteen of twenty milestones are green, the code is deterministic and bit-exact against the rules
engine, and the tooling is genuinely good. But the project has not yet produced the thing it set out
to produce: a stronger Hard AI. The last three milestones passed only by rewriting their own pass
criteria, the engine's one strength measurement shows it no better than a scripted level-2 bot, and in
two days and roughly fifty agents the new engine has **never played a game against the shipped
`AIEngineV2` it is supposed to replace**. The verifier protocol worked. The design and process around
it let the goal drift out of the loop.

## Timeline

| When | What |
|---|---|
| 2026-09-14 morning | Phase 1 (understand, 11 agents) and phase 2 (design, 7 agents) produce 887 KB of docs, a binding `DESIGN.md`, and a 20-milestone DAG. |
| 2026-09-14 midday | Phase 3 starts. M1 green. First pause. |
| 2026-09-14 evening | Resume. M2, M4, M5 green. Second pause with **seven milestones half-written on disk**. |
| 2026-09-15 07:13 to 18:57 | Resume. Nine milestones go green in 11h44m with 32 agents (29 Opus). M12, M13, M14 pass by amendment. Stopped after M14 as Ethan requested. |
| Now | Groups I and J (M15 to M20) not started. Tree clean. Decision pending. |

## What went wrong

### 1. The goal never entered the feedback loop

The design's thesis is "beat `AIEngineV2` on desktop and phone". M19, the milestone that measures
that, sits at the end of a 15-milestone chain. Nothing before it plays the shipped AI. Search
`lab/results/hard-ai-verify*/**/manifest.json` for a manifest with `a: hard@…` and `b: aiv2-…`:
there are none.

The only strength numbers we have are against the scripted `Rush` bot:

| engine | budget | result vs Rush | source |
|---|---|---|---|
| `hard@lab-400k` | wall 500 ms | 3/16, Elo −255 | M14 smoke |
| `hard@lab-400k` | fixed 400,000 units | 8/16, Elo 0 | M14 fix ladder |
| `aiv2-medium-fast` (shipped) | fixed 1,200 | Elo −211 over 48 games | M2 calibration |

The third row is the interesting one. The shipped AI also loses to Rush at a low budget, so the −255
tells us almost nothing about whether the new engine is ahead of or behind the thing it replaces. We
built fourteen milestones of machinery and are still guessing at the one number that matters.

### 2. The people clearing the bar were allowed to move the bar

The implementer prompt says: if the design is internally inconsistent or infeasible, choose a fix and
record it in `DEVIATIONS.md`. That clause was written for interface mismatches. It became the release
valve for unreachable targets. Three of the last three milestones used it:

| milestone | design asked for | measured | what changed |
|---|---|---|---|
| M12 | 200,000 stage-1 evals/s, 50,000 stage-2 | 70,119 and 23,949 | bar lowered to 35,000 / 10,000 |
| M13 | candidate recall top-1 ≥ 0.90, regret p90 ≤ 60 cc | 0.295 and 2,525 cc | absolute targets replaced by shares of a self-computed ceiling |
| M14 | invariants ≥ 0.90; smoke ladder Elo ≥ 0 vs Rush | 0.60; −255 | both clauses moved to M18 |

The verifier protocol's rule 5 says a `major` finding "may still pass". Every one of these amendments
was flagged `major`, and every one passed. The verifiers did their job; the protocol gave them no
lever. A finding that says "this milestone's pass criterion was rewritten to fit the result" is not a
`major`. It is a decision that belongs to the project owner, and the protocol had no way to route it
there.

### 3. Binding targets were copied from estimates, not measured

The 200,000/s figure restates the knowledge-first design's estimate. The 90% recall figure comes from
a proposal paragraph in the search-first design. Both went into `DESIGN.md §8` as constants with no
spike behind them. The recall risk was called out at design time by the strength judge (item 5 of the
must-fix list) and by `HANDOFF.md §7` as "the single biggest risk in the design". It was then scheduled
for measurement at M13, twelve milestones and roughly 40,000 lines later. A two-hour spike on
2026-09-14 would have settled whether a K=24 static-scored cone can reach 0.90 top-1. It cannot, and
now the search core is built on a generator whose absolute recall is 0.30.

### 4. The recall "ceiling" argument is plausible and untested

The M13 addendum argues that a static within-turn scorer is bounded near 0.64 top-1 by the shape of the
measurement, and that "the search above the generator exists for" the gap. That is a hypothesis about
the search, stated inside a milestone that never ran the search. M14's result (no better than Rush) is
exactly what you would see if the generator prunes the winning turn before search can find it. The
experiment that decides this is cheap and nobody has run it: the same engine with the reference
generator (K=96) against the shipped cone (K=24) at equal wall time. If the wide cone wins clearly,
recall is the bottleneck and M18 tuning will not fix it. If it does not, the ceiling argument holds and
group I can proceed.

### 5. The DAG narrowed to a single lane exactly where the milestones got expensive

Group E ran six milestones in parallel at about 13 minutes each. Then M12 → M13 → M14 ran one-wide at
roughly 1 h, 2.6 h and 6.5 h, each with up to three verify rounds. Ten of the eleven hours on
2026-09-15 were spent in that lane. M14 alone touched thirteen gate clauses. A milestone that takes
6.5 hours and three verify rounds is three milestones wearing one label.

### 6. The box was the bottleneck and nobody was watching it

Twelve-way sharded gates took the load average to 79. A 3-second test (`make-unmake.test.ts`) tripped
the 5-second vitest timeout under load and red-lit M3's gate three times for reasons unrelated to M3.
Roughly ten other Claude sessions and some Codex helpers were alive on the same machine. The agent
count was budgeted; the CPU was not.

### 7. Documentation grew past the point where a human can use it

| document | size |
|---|---|
| `DESIGN.md` | 130 KB |
| `design/DEVIATIONS.md` | 168 KB |
| three competing designs | 307 KB |
| understanding docs | ~200 KB |
| total under `docs/hard-ai/` | 887 KB |

`DEVIATIONS.md` has entries dated 2026-09-15 that supersede other entries dated 2026-09-15. The log is
scrupulously honest and effectively unreadable. Honesty that nobody can review does not function as
oversight; it functions as a record for the postmortem. The two paragraphs Ethan actually needed to
read on 2026-09-15 were "M13 recall is 0.30 not 0.90" and "M14 is not stronger than Rush", and they
were buried in about 300 KB of new text.

### 8. Integration debt is compounding

The branch is based on a snapshot commit of Codex's uncommitted v2.8 work. As of today that work is
still uncommitted in the main checkout, so the branch diff against `master` is 872 files and 484,000
insertions, most of it not ours. Every day this stays open the rebase gets harder and the chance that
the Hard AI ships against a rules engine that has since moved goes up.

### 9. The second pause left seven milestones half-written

Group E was interrupted mid-flight. Recovery worked because the resume script grew a `partial` mode
and the handoff listed every file. It worked; it was not designed to work. A pause request should
land on milestone boundaries by construction.

## What went right, and should be kept

- **Independent verification with teeth on correctness.** Five verifier rounds returned `pass=false`.
  Three of those failed milestones whose own gate was green (M9 twice, M13 once). Do not weaken this.
- **Bit-exact replica.** One million fuzzed actions, zero divergences. Determinism tooling. This is the
  foundation any future engine work stands on, regardless of what happens to the search.
- **One commit per green milestone**, restricted to explicit paths, made only by the verifier. Rollback
  to any milestone is a `git checkout`.
- **The ladder, pairing, SPRT and Elo tooling** (M2). This is reusable for tuning *any* Muju AI,
  including the shipped one.
- **The handoff document.** A stranger could resume this. Most projects cannot say that.
- **Honest deviations.** Nothing was hidden. The problem was routing, not candour.

## Lessons

1. **Walking skeleton first.** The first thing the DAG should have produced is a legal, terrible engine
   playing `aiv2-hard` in the ladder, and that row should have run on every milestone after it. A
   strength number that is allowed to be bad is a compass. A strength number that arrives at M19 is a
   verdict.
2. **Targets are hypotheses until measured.** Any constant that a pass criterion depends on gets a
   spike before it becomes binding. The two riskiest numbers here would have cost two hours.
3. **Separate clearing the bar from moving the bar.** Implementers may propose an amendment; they may
   not apply one. An amendment to a pass criterion is a blocker until the project owner (or a distinct
   agent whose default answer is "no") accepts it, and it must appear in the run's final report as its
   own line, not inside a `major`.
4. **A `major` finding on an amended criterion fails the gate.** The verifier had the right instinct
   three times and no lever.
5. **Size milestones by wall clock, not by topic.** Anything projected over an hour or with more than
   about five gate clauses gets split. M14 should have been three.
6. **Budget the machine.** Cap concurrent heavy gates at two or three, close stale sessions before a
   campaign, and give every test that runs the engine an explicit timeout.
7. **Cap the docs.** A binding design over 40 KB is a novel, not a contract. Deviations get a one-line
   index at the top, and anything that changes a pass criterion goes in a separate, short file the
   owner reads.
8. **Rebase early.** Get the upstream work committed and rebase onto it before building more on top.
9. **Pause on boundaries.** The executor should honour a pause request by finishing in-flight verifiers
   and spawning no new implementers, rather than being killed.

## Where to go from here

Four options, in the order I would consider them.

### A. Measure before building (recommended first step, about two hours of machine time)

Three ladder runs, all with tooling that already exists:

| run | question it answers |
|---|---|
| `hard@lab-400k` vs `aiv2-hard`, wall 3000 ms, 50 pairs, handicaps 0 and 3 | Are we ahead of or behind the shipped AI at the real budget? |
| hard engine with reference generator (K=96) vs hard engine with shipped cone (K=24), equal wall time, 50 pairs | Is generator recall the bottleneck? |
| `aiv2-hard` vs `Rush`, wall 500 ms, 8 pairs | What does M14's −255 actually mean? |

Then decide. If the wide cone wins clearly, go to B. If the engine already beats `aiv2-hard`, go to
C. If it loses to `aiv2-hard` and the wide cone does not help, the problem is evaluation or search,
not recall, and M17/M18 are the right place to work.

### B. Re-open M13 as a root fix

Fix candidate recall before building group I on it. Options inside that: widen ply-0 (measured: width
24 buys top-1 0.258 → 0.317 at 4x cost), add search-informed ordering to the cone, or move to a
two-stage generator where cheap candidates are re-ranked by a one-ply search. This is the honest path
if experiment 2 says recall matters, and it invalidates none of M1 to M12.

### C. Run group I as written and let M19 referee

The handoff's option (c). Cheapest in decision-making, most expensive if wrong: four milestones of one
to six hours each, and M18 now carries strength clauses that tuning cannot satisfy if the generator is
pruning winning moves. Only do this after option A says the engine is already competitive.

### D. Salvage mode

Declare the deliverable to be the primitives and the measurement tooling. Use the M2 ladder and SPRT
to tune the shipped `AIEngineV2` instead (its budgets, priors and beam widths have never been tuned
with a proper ladder). Lower ceiling, near-certain payoff, and the replica and tables stay on the shelf
for a second attempt. This is the right call if option A shows the new engine is far behind and the
Fable budget for the week is the binding constraint.

## Concrete changes to the protocol before any resume

- Add a standing gate row to every milestone from M5 onward: `hard@lab` vs `aiv2-hard`, 8 pairs,
  wall 3000 ms, recorded but not required to pass. The trend is the point.
- Change `phase3-resume.js` so the fix agent cannot edit `MILESTONES.md` or `DESIGN.md §8`/§9. Proposed
  amendments go to a new `AMENDMENTS-PENDING.md` and the milestone stays red until Ethan clears them.
- Change verifier rule 5: a `major` whose description mentions a changed criterion is a blocker.
- Cap concurrent heavy gates at three; add `--shards 6` as the default for verify runs on this box.
- Split M14's remaining strength story (M18's two re-homed clauses) into its own milestone with its
  own gate, so "the engine is stronger than Rush" is a green commit, not a footnote.
- Set the make-unmake test timeout explicitly and check it in before anything else runs.
- Ask Codex to commit v2.8 in the main checkout and rebase this branch onto it before group I.
- Change `MILESTONES.md` for M15 through M20 to name a wall-clock budget as a hard cap: an implementer
  that exceeds it stops, commits nothing, and reports, so the owner can split the milestone.

## The uncomfortable summary

The process optimised for what it could verify: legality, determinism, bit-exactness, typecheck, test
count. Those are all green. It could not verify strength until the end, so strength quietly stopped
being what the milestones were about. The fix is not more rigour of the kind we already have. It is
putting the one number that matters in front of every agent, every milestone, from the start, and
refusing to let anyone but the owner decide what "good enough" means.
