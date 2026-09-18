# `hard:analyze` — classifying a loss at its first consequential decision

E1.1/E1.4 asks for one thing that E0 could not give: **why** a game was lost.
EPIC-PLAN §4 names the answers in advance — *candidate absent; strong candidate
discarded; strong candidate misjudged; reply missed; clock/fallback; or
genuinely unclear* — and adds the caveat the whole instrument lives under:

> A deeper selective search is an adviser, not an exact oracle.

`npm run hard:analyze` is that adviser, wired to a recorded game.

---

## What it measures

Given a `muju-lab-replay-v2` file it does four things.

**1. Canonical reconstruction.** The game is rebuilt from its own opening
through the shipped engine — `isLegalAction` before every action,
`applyAction` to take it — and every rebuilt position is compared against the
recorded snapshot: units, damage, board reserves, both banks, turn number,
phase, actions remaining. The final ply count and, for a rules-decided
outcome, the winner must match `meta`. Anything else throws `ReplayMismatch`
and the file is refused. Nothing downstream runs on a game that does not
reproduce.

Two details make this harder than it looks and both are handled in
`analyze/replay.ts`:

- The six starting units are stamped `${owner}_${definitionId}_${Date.now()}_${random}`
  by `src/game/board.ts createUnit`, so their ids differ between the recorded
  process and this one. They are remapped by the `(owner, starting definitionId)`
  pair their own id spells out — unique per side, because `STARTING_UNITS` is
  `['fire_1','water_1','plant_1']`. Units bought during play get
  `src/ai/simulate.ts nextUnitId`'s deterministic `unit-<side>-<turn>-<n>` and
  need no remap. An id that cannot be resolved is an error, never a guess.
- `lab/harness/runner.ts` records a step for an action the simulator REFUSED
  (a no-op that still costs a ply), and injects an unrecorded phase end after
  three consecutive no-ops. Both are reproduced, so a game containing them
  still rebuilds.

**2. A per-turn adviser table** for the `hard@` seat. At the state the hard bot
adapter searched from — the first ply of each of that seat's turns, keyed
`${turnNumber}:${currentPlayer}` exactly as `lab/hard-ai/bots/hard.ts` keys it —
the tool records:

| column | what it is |
| --- | --- |
| `played` | the actions the seat dispatched, and the `Kpos` of the position they left. That is the same key `RootResult.endKey` and `Turn.endLo/endHi` carry (`search/root.ts keyHex(turn.endHi, turn.endLo)`, written from `p.kposLo/kposHi` in `gen/actionsearch.ts`), so the two are directly comparable. |
| `cheap` | the production generator's K list at that root, and whether it contains the played turn and the adviser's best. |
| `adviser` | `HardEngine.searchTurn(state, {work})` in fixed-work mode: plan, `scoreCc`, `endKey`, `depth`, `source`. |
| `playedDeepCc` | the adviser's assessment **of the played turn**: search the position the played turn left, at the same work, and take the score from the seat's point of view. |
| `adviserBestDeepCc` | the identical treatment of the adviser's own best turn. |
| `swingCc` | `adviserBestDeepCc − playedDeepCc`. |
| `swingRootCc` | `adviser.scoreCc − playedDeepCc` — E1's literal formula, reported alongside. |
| `engine` | the production engine re-run from the same state at the ladder rung: its own root score and end key, and whether it reproduced the played turn. |
| `timing` | `meta.players[side].turnMs[i]` against `meta.decisionMs`, plus whether the turn dispatched nothing but phase ends. |

**Why two "deep" numbers and not one.** `RootResult` exposes no per-candidate
scores, so the only way to ask the adviser what it thinks of a turn it did not
choose is to search the position that turn produced. That answer is a root
score one ply LATER than `adviser.scoreCc`, so subtracting the two would be
partly a depth artefact. Applying the identical treatment to the adviser's own
best turn makes the swing like-for-like. `swingRootCc` is kept because E1 asked
for it; `swingCc` is what the threshold uses.

**The sign is read, not assumed.** After a turn that ended normally the
opponent is on move and the search's score is negated. A plan that did NOT end
the turn leaves the seat still on move — a `fallback` hands back a single
`phaseEndAction`, which ends a phase and not a turn, and `verify/replay.ts`
truncates a diverging line at its first bad action — and negating there would
report a win as a loss. `deepScore` takes the perspective from
`state.turn.currentPlayer`, and a row whose adviser plan did not end the turn
says so in its notes, because its swing is then not strictly like-for-like.

**3. The first consequential decision** is the first of the seat's turns with
`swingCc >= --swing-cc`. The largest-swing turn is reported separately, because
"first" and "worst" are different questions and a report that conflates them
invites the wrong patch.

**4. A classification** at both of those turns, with the rule printed next to
the label in every artifact.

---

## The classification rules

Applied in this order; the first that fires wins.

| class | rule |
| --- | --- |
| `clock-fallback` | the seat's own turn wall time exceeded its allowance (tolerance `max(10 ms, 1 %)`, matching the ladder's), **or** the turn dispatched nothing but phase ends, **or** the adviser itself returned a `fallback` (`pack-error` / `engine-error` / `divergence`). |
| `candidate-absent` | the adviser's best end key is **not** in the production generator's K list at that root. No search budget could have reached it: the turn was never a candidate. |
| `reply-outside-beam` | the adviser disagreed with the played turn, and its own answer **to** the played turn — the refutation — is not in the candidate list the **same generator configuration that produced it** builds at the reply node. |
| `strong-candidate-misjudged` | the adviser's best turn **is** in the K list and the engine played something else anyway. |
| `unclear` | nothing separates, or no turn reached the threshold ("no consequential decision found at this threshold"). |

`reply-outside-beam` is checked **before** `strong-candidate-misjudged` even
though EPIC-PLAN lists its ancestor after. They describe the same situation and
the misjudged rule would swallow every case; this one names a specific,
checkable cause.

**Why it is not called "reply missed".** EPIC-PLAN's vocabulary has a class
called *reply missed*, and this tool cannot support that claim. Establishing
that the SEARCH looked at the reply node and failed to find the answer needs a
root that reports what it searched; `RootResult` reports nothing of the kind.
What the tool can establish, exactly and cheaply, is that the **generator** does
not offer the refutation at that node — so the class is named for that and the
rule text disclaims the rest.

The first version of this rule also required that the production engine had
scored the played turn well above the adviser's assessment of it ("the engine
believed it good"). That conjunct compared a 400,000-unit root score with a
1,600,000-unit score one ply deeper, so it mostly measured the horizon: on the
first worked example it held on four of the eight non-terminal turns, including
turn 8, where the adviser had chosen the **identical** turn and the swing was 0.
A test that fires when there is nothing to explain is not evidence, so it was
removed rather than caveated. In its place the rule requires only that the
adviser actually disagreed with the played turn.

**And the list must match the generator that produced the refutation.** The
refutation is the best turn of a *root* search at the reply position, so
`search/pvs.ts generateAt` built it at ply 0 from `cfg.gen` (K=24). The first
version tested that key against a list built from `cfg.genInterior` (K=16),
which makes ranks 17-24 "absent" by construction and says nothing about the
generator. The classification now uses the matched list (`reply.inRootGenList`);
the K=16 membership is still recorded as `reply.inInteriorGenList`, as evidence
about the engine's own interior beam, never as the rule.

---

## What it cannot measure

**An adviser is not an oracle.** Every number here is the shipped evaluation
looking further with the shipped generator. A turn the generator cannot
produce is invisible to the adviser too, so `candidate-absent` is a claim about
the K list, not about the game. A swing is evidence that a deeper search of the
same engine disagrees with a shallower one — not that the played turn was
objectively bad.

**"Discarded" and "misjudged" are one class.** `RootResult` is
`{actions, scoreCc, depth, work, stats, source, endKey}` and `HardSearchStats`
is aggregate counters (`nodes`, `qnodes`, `turnNodes`, `evals`, `ttHits`,
`ttProbes`, `depth`, `seldepth`, `byClass`, `proverCalls`, `dfpnCalls`,
`catalogRebuilds`, `replicaDivergences`, `work`, `quiesceWork`, `elapsedMs`,
`stopReason`). Neither carries a per-candidate score nor a record of which
candidates the root actually searched. So "in the list but never searched"
(discarded) and "searched and mis-scored" (misjudged) cannot be told apart
from outside the engine. They are reported as one label,
`strong-candidate-misjudged`, whose rule text says so. Splitting them needs a
root that reports its candidate list with scores and a searched flag — a change
to `src/ai/hard/search/root.ts`, which this tool deliberately does not make.

**Root scores at different budgets are not comparable.** `engine cc` (400,000
units, at the root) and `played cc` (1,600,000 units, one ply deeper) differ by
both budget and horizon, and on a real game they disagree by thousands of cc on
quiet turns where nothing is happening. The table reports both because the gap
is interesting, but **no classification rule may be founded on it** — that is
the mistake the first `reply-missed` rule made.

**The production re-run is a representative rung, not the turn's own rung.**
`ladderWorkRung` is `chooseWork(profile, time.baseMs)` on the 200 units/ms
constant a fresh `HardEngine` starts from: **400,000 units** for
`hard@lab`/`hard@desktop`. In wall mode the engine re-measures itself after
every search and moves the profile toward the box's real throughput, and
`targetMs`'s home-threat and kill-now multipliers push the target back up in
sharp positions — the pilot's own `players.black.turnMs` shows both (4,584 ms
on turn 1, ~1,700 ms after). So `engine cc` answers "what would an engine of
this size believe here", not "what did that turn's search believe".

**Per-turn timing is coarse.** `turnMs` is per turn and real, so an overrun is
attributable. `hardTiming`'s `overruns`, `budgetExhausted` and `reSearches` are
per GAME, so a fallback on a specific turn can be suspected but not proved from
the replay alone.

**The adviser's budget is the instrument's resolution.** Run with
`--adviser-work 5000` on the pilot's short game and the adviser's own turn 2
plan skips the promotion that guards the corner and hands White a mate in 1
(`adviserBestDeepCc` −999,000). That is not a bug in the tool, it is a bad
adviser: at that budget the "deeper look" is shallower than the seat's own
search. The default 1,600,000 is four times the seat's rung for exactly this
reason, and any run at a reduced budget should be read as a smoke test, not
as evidence.

**One game is one game.** Every artifact this tool writes is a description of a
single recorded game. A class histogram over four pilot games is not a finding
about the engine.

---

## Thresholds and budgets

| knob | default | why |
| --- | --- | --- |
| `--swing-cc` | **300 cc** (`DEFAULT_SWING_CC`) | three crystals, the cost of the cheapest tier-1 body. A **starting threshold, not a finding**: nothing in E0 or the pilot established where a Muju decision stops being noise. It is a flag so a classification's sensitivity to it can be shown rather than assumed. |
| `--adviser-work` | **1,600,000 units** = `4 × ladderWorkRung`, snapped to the nearest `WORK_LADDER` rung (it lands exactly on `WORK_LADDER[6]`) | four times the budget the seat searched with, which is two full doublings of the ladder's factor-of-two rungs. Measured on this box (Apple M2 Max) the engine runs at ~90–100 units/ms in fixed-work mode, so one adviser search is ~16 s and a turn costs three of them. |
| `--production-work` | `ladderWorkRung` = **400,000 units** | see above. |
| overrun tolerance | `max(10 ms, 1 %)` | the same tolerance `lab/hard-ai/ladder/run.ts` proposes, so the analyser and the ladder never disagree about whether a turn overran. |

Both engines run in **fixed-work mode**, which reads no clock at all
(`src/ai/hard/engine.ts`), so the same replay analysed on another box produces
the same table.

The tool holds one of `lab/hard-ai/ladder/heavy.ts`'s two global heavy slots for
the whole analysis and waits for one if both are busy
(`--heavy-timeout-min`, default 30). `--no-heavy` is for tests, which stub the
adviser and do no real work.

---

## Commands

```bash
cd muju

# One replay, defaults (adviser at 1.6M units, 300 cc threshold).
npm run hard:analyze -- --replay lab/results/hard-ai-e0/pilot2-h0/replays/g3-s1_0_1-B-white.json

# Pick the seat, the engine, the budgets and where the artifacts go.
npm run hard:analyze -- \
  --replay <file> \
  --side black \
  --engine hard@desktop \
  --adviser-work 3200000 \
  --production-work 400000 \
  --swing-cc 500 \
  --out lab/results/hard-ai-e1/analyze/<name>

# A whole run directory. Defaults to the hard@ seat's LOSSES; --all takes every
# game. Writes <dir>/analysis/<pairId>-<orientation>.{json,md} and
# <dir>/analysis/summary.{json,md}. The run's manifest, metrics and games.jsonl
# are never touched.
npm run hard:analyze -- --run lab/results/hard-ai-e0/pilot2-h0
npm run hard:analyze -- --run lab/results/hard-ai-e0/pilot2-h0 --all

# Re-decide saved analyses under the current rules WITHOUT re-running a single
# search. Needs no heavy slot; refuses to write into its own input directory.
npm run hard:analyze -- --reclassify <runDir>/analysis --out <runDir>/analysis-v2

# Verification
npx tsc -p lab/hard-ai/tsconfig.json --noEmit && npx tsc --noEmit
npx vitest run tests/lab/analyze.test.ts
```

`--max-turns <n>` stops after the first `n` turns of the seat; it exists for
smoke runs and tests, and a truncated table says so by having fewer rows than
the game has turns.

---

## Worked example — ONE game

### First, a correction about which pilot game is the loss

The pilot run `lab/results/hard-ai-e0/pilot2-h0` has four games. Reading
`games.jsonl`'s `winner` against `players.<side>.bot`:

| replay | white | black | winner | turns | for the `hard@lab` seat |
| --- | --- | --- | --- | ---: | --- |
| `g2-s0_0_0-A-white` | `hard@lab` | `aiv2-hard` | white, home-checkmate | 23 | **win** |
| `g2-s0_0_0-B-white` | `aiv2-hard` | `hard@lab` | black, home-checkmate | 13 | **win** |
| `g3-s1_0_1-A-white` | `hard@lab` | `aiv2-hard` | black, home-checkmate | 58 | **loss** |
| `g3-s1_0_1-B-white` | `aiv2-hard` | `hard@lab` | black, home-checkmate | 9 | **win** |

So `g3-s1_0_1-B-white.json` — the 9-turn game — is a hard **win** with hard as
Black, and the run's single `hard@lab` **loss** is `g3-s1_0_1-A-white.json`,
58 turns with hard as White. `--run --losses-only` picks the latter on its own;
the filename orientation says nothing about who won.

### The run

```bash
npm run hard:analyze -- \
  --replay lab/results/hard-ai-e0/pilot2-h0/replays/g3-s1_0_1-B-white.json \
  --out lab/results/hard-ai-e1/analyze/g3-s1_0_1-B-white
```

Defaults throughout: adviser `hard@lab` at 1,600,000 units, production re-run at
400,000, swing threshold 300 cc. It held one heavy slot, waited about two hours
behind the E1.1 diagnostic ladder campaign that had both slots, then took
**332 s** of one core. Artifacts:
`lab/results/hard-ai-e1/analyze/g3-s1_0_1-B-white.{json,md}`.

The reconstruction replayed all **93 plies** through the canonical engine and
matched `meta`. Generator K=24 at the root, 16 at a reply node.

### The table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 9,8→9,9 MOVE 8,8→9,8 MOVE 8,9→7,9 END_ACTION | `5b834a72` | yes | MOVE 8,9→9,9 MOVE 9,9→7,9 MOVE 9,8→9,9 END_ACTION | `1bcb15b8` | yes | -2,136 | -2,236 | -100 | -1,849 | 4584 ⚠ |
| 2 | PROMOTE 9,8 MOVE 9,8→9,7 END_ACTION | `f644f893` | yes | PROMOTE 9,8 MOVE 9,9→8,9 END_ACTION | `413dd1fd` | yes | -3,948 | -3,882 | 66 | -3,521 | 1662 |
| 3 | MOVE 9,7→9,8 ATK 9,8→9,9 MOVE 9,8→8,8 ATK 8,8→7,8 END_ACTION | `c17cb827` | yes | (identical) | `c17cb827` | yes | -4,360 | -4,360 | 0 | -8,449 | 1858 |
| 4 | BUY fire_1@8,9 BUY water_1@9,8 MOVE 8,8→7,8 ATK 7,8→7,9 MOVE 7,8→7,7 MOVE 7,7→7,6 END_ACTION | `b0c33ee2` | yes | (identical) | `b0c33ee2` | yes | 760 | 760 | 0 | -285 | 1207 |
| 5 | BUY water_1@9,9 MOVE 9,9→8,9 ATK 8,9→7,9 END_ACTION | `4bb64528` | yes | (identical) | `4bb64528` | yes | 214 | 214 | 0 | 502 | 1107 |
| **6** | BUY water_1@9,9 MOVE 7,6→6,5 MOVE 9,8→9,7 MOVE 8,9→7,9 END_ACTION | `5cc37f6a` | yes | BUY fire_1@7,8 ATK 7,8→6,8 MOVE 7,6→4,6 END_ACTION | `a163d189` | yes | -1,092 | 475 | **1,567** | 905 | 2012 |
| 7 | BUY lightning_1@8,9 END_PLACE MOVE 8,9→4,1 END_ACTION | `3db03da2` | yes | BUY fire_1@9,8 BUY water_1@8,9 MOVE 6,5→5,4 MOVE 9,8→7,8 ATK 7,8→6,8 END_ACTION | `0e5980d0` | yes | -36 | 781 | 817 | 1,012 | 2726 |
| 8 | PROMOTE 6,5 MOVE 6,5→0,3 END_ACTION | `3acf4b2b` | yes | (identical) | `3acf4b2b` | yes | -964 | -964 | 0 | 1,839 | 1430 |
| 9 | END_PLACE MOVE 0,3→1,0 ATK 1,0→2,0 MOVE 1,0→0,0 | `9ac3eff3` | yes | (identical) | `9ac3eff3` | yes | 999,000 | 999,000 | 0 | 999,000 | 9 |

### The classification

Both the **first consequential decision** and the **largest swing** land on
turn 6, classified `strong-candidate-misjudged`:

> the adviser's best end key `a163d1893b3a75cf` IS among the 30 candidates at
> this root; the engine played `5cc37f6aacf6f863` instead, worth −1,092 cc to
> the adviser against 475 cc

On turn 6 the engine bought a body and shuffled three units; the adviser would
have bought a fire body on 7,8, taken on 6,8 and run the 7,6 unit to 4,6. Both
turns were on the engine's own shortlist. It had the adviser's turn available
and did not play it — and, per the rule text, "discarded" and "misjudged" are
not separable from outside the engine. Turn 7 is the same shape at 817 cc.

**This classification is a correction.** The first version of this doc reported
turn 6 as `reply-missed`, on a rule that (a) leaned on a 400,000-unit root score
being higher than a 1,600,000-unit score one ply deeper, and (b) tested the
refutation — produced by a *root* search with K=24 — against a list built from
`cfg.genInterior` with K=16. Under the matched test the refutation is in the
generator's list at the reply node on **every** non-terminal turn of this game,
so `reply-outside-beam` never fires here and the old label was an artifact of
the mismatch. The corrected artifacts are in
`lab/results/hard-ai-e1/analyze-v2/`, produced by `--reclassify` from the saved
searches; no search was re-run.

The reply-node membership, both ways:

| turn | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| refutation in `cfg.gen` (K=24), the matched test | yes | yes | yes | yes | yes | yes | yes | yes | — |
| refutation in `cfg.genInterior` (K=16), evidence only | no | yes | yes | no | yes | no | no | no | — |

The bottom row is worth looking at and worth not over-reading. The engine's own
interior beam would not have offered the refutation on five of eight turns —
but the refutation came from a K=24 root search, so some of that absence is the
same by-construction effect at a smaller scale. It is recorded because it is
suggestive about the interior beam width; it decides nothing.

Four things in this table are worth reading carefully.

- **The adviser agrees with the seat on five of nine turns** (3, 4, 5, 8, 9:
  identical end key, swing exactly 0). Four times the budget changes nothing on
  most turns, which is what "the adviser is an adviser" looks like in practice.
- **The played turn is in the generator's K list on all nine turns, and so is
  the adviser's best.** `candidate-absent` never fires here. On this one game
  the generator's cone at the root is not the binding constraint; something
  downstream of it is.
- **Turn 1 overran** (4,584 ms against a 3,000 ms allowance — the run's
  `hardTiming.overruns` is 1 and this is the turn), but its swing is −100 cc,
  so it is never the consequential decision. An overrun that costs nothing is
  worth counting and not worth patching.
- **`engine cc` and `played cc` disagree by a lot on quiet turns too** — turn 3
  is −8,449 against −4,360, turn 8 is +1,839 against −964. Those are different
  budgets at different horizons; the gap is reported and no rule is founded on
  it.

**This is ONE game, and a game this seat WON.** It is a demonstration that the
instrument runs end to end and produces a specific, checkable claim about a
specific turn. It is not evidence about the engine, about `reply-outside-beam`
being the dominant failure class, or about anything else. The pilot's one actual
loss is the 58-turn `g3-s1_0_1-A-white`, which `--run` picks on its own:

```bash
npm run hard:analyze -- --run lab/results/hard-ai-e0/pilot2-h0
```

writing `analysis/g3-s1_0_1-A-white.{json,md}` and the class histogram in
`analysis/summary.{json,md}`. At 58 turns that is roughly an hour of one core.

---

## `--reclassify`: changing the rules without paying for the searches again

The adviser is the whole cost of an analysis — three whole-turn searches per
turn, about 50 s of one core — and every number it produced is already in the
saved per-game JSON. A rule change needs *generation*, which costs milliseconds.
So `--reclassify` reads a saved artifact, rebuilds the game from its replay
(canonical reconstruction, no search), regenerates the candidate lists at each
reply node with the matched configuration, re-runs the classification, and
copies every search-derived number through untouched. It writes
`<out>/<game>.{json,md}` plus a `summary.{json,md}` carrying the class
histograms **before and after**, and it refuses to write into its own input.

**What the v1 artifacts lacked, exactly.** `reply.inCheapReplyList` and
`reply.cheapReplyCount` were built from `cfg.genInterior` while the refutation
they were tested against came from a root search — a mismatch no arithmetic can
repair. The v2 per-turn record adds `reply.inRootGenList` / `rootGenCount` (the
matched test, the only one the classification uses) and keeps
`reply.inInteriorGenList` / `interiorGenCount` as evidence. Both are regenerated
from the replay, so a v1 artifact reclassifies completely; nothing else was
missing, and no adviser search has to be repeated.

**What it cannot repair.** A game that failed *reconstruction* has no artifact
to reclassify. Those need a real re-analysis with adviser searches, so the
summary's `reconstruction` block rebuilds every replay in the run (cheap) and
lists them under `missingArtifact` rather than pretending the histogram covers
them.

---

## Files

| path | what |
| --- | --- |
| `lab/hard-ai/analyze/replay.ts` | replay loading, the id remap, canonical reconstruction, per-turn segmentation |
| `lab/hard-ai/analyze/engine.ts` | the adviser/production engines, the work rungs, and the generator's K list at a node |
| `lab/hard-ai/analyze/analyze.ts` | the per-turn table, the swing, the classification rules |
| `lab/hard-ai/analyze/report.ts` | the markdown and the `--run` summary |
| `lab/hard-ai/analyze/reclassify.ts` | `--reclassify`: re-decide saved analyses with no searches, and the reconstruction check |
| `lab/hard-ai/analyze/run.ts` | the CLI, the heavy slot, the artifacts |
| `tests/lab/analyze.test.ts` | reconstruction of all four pilot replays, every classification branch against a stubbed adviser, the `--run` histogram, and one real-adviser smoke |

## E2 addendum: the root-exposure split (2026-09-16, lane 2)

Everything above describes the analyser as E1 left it and is unchanged. This
section records what E2 lane 1's root instrument added and what the analyser
now does with it.

### The classes changed

`strong-candidate-misjudged` used to cover two engine faults at once, and said
so in its own rule text: `RootResult` carried no per-candidate score and no
record of what the root searched, so "in the list but never searched" and
"searched and not preferred" arrived as one label. E2 lane 1's `expose` flag
supplies both, so the class splits:

- **`strong-candidate-discarded`** — the adviser's best turn is in the root's
  candidate list and `searched` is false. No budget reached it. An ordering or
  beam-width fault.
- **`strong-candidate-misjudged`** — it is in the list, `searched` is true, and
  its score is at or below the played candidate's. The search saw it and chose
  another. An evaluation or depth fault.
- **`fixed-work-divergence`** — the root scored the adviser's best turn
  strictly above the played candidate AND the re-run did not reproduce the
  played turn. The engine prefers the better turn at this much fixed work; the
  seat, under a wall clock at a coarser rung, did not. A statement about the
  WORK the seat had, not about its judgement. It is not evidence that the seat
  could have found the turn inside its allowance — `E2-LANE2-EXPOSED-LOSSES.md`
  §"Work sweep" is what tests that.
- **`exposure-inconsistent`** — the exposure and the rest of the analysis
  disagree, so no split is asserted. Three ways: the adviser's best turn is in
  the generator's list but absent from the root's published candidate list; the
  root scored it strictly above the played candidate WHILE reproducing the
  played turn, which contradicts itself; it ties the played candidate while the
  played candidate is not the chosen one; or the root published a
  `generator-list`, where every candidate is unsearched by construction.

A row with no exposure keeps the pre-E2 behaviour and says so in its evidence.

### Where the exposure comes from, and what it costs

Nothing new is searched. `analyseTurn` already re-ran the production engine at
fixed `productionWork` (400,000 units) on every turn to produce `engine cc`;
that call now passes `expose: true`. The instrument only observes — lane 1's
tests pin identical move, score, depth, work, nodes and end key with it on — so
`engine.scoreCc` is the number it always was.

The result is stored on `TurnRow.exposure`: the source, the full candidate
list, the root trace, and the two candidates the classification compares (the
adviser's best and the played turn, matched by end key).

### The fail-low bound, and why equality is not a tie

`RootCandidate.scoreCc` is the score `rootIteration` assigned, which for a
candidate that does not beat the incumbent is a BOUND, not a value. Measured on
the 14 E1.1 losses: at every first consequential turn the whole published list —
18 to 30 candidates — carries one identical score, the chosen candidate's.

So the comparison the split can make is ordinal, not cardinal. "Searched and
scored below or equal to the played candidate" means the root saw the turn and
did not prefer it, and nothing about the margin. Only a score strictly ABOVE
the played candidate is informative in the other direction, and that is
reported as `exposure-inconsistent` rather than believed.

### Retrofitting artifacts written before E2

`--reclassify <dir> --rerun-root` re-runs the production engine with the
instrument on at the FLAGGED turns only — the first-consequential turn and the
largest-swing turn, the two whose class can move — and reclassifies. The
adviser searches, which are the expensive part, are read from the artifact and
never redone. At most two searches per game at the ladder rung. It takes a
heavy slot, unlike plain `--reclassify`, and writes a `-v3` directory by
default.

### The work sweep

`hard:analyze:work-sweep <analysisDir> --out <dir>` re-runs the production
engine at 100k, 200k, 283k, 400k, 566k and 800k units on each artifact's first
consequential turn (`--include-largest` adds the largest-swing turn when it is
a different one) and reports the FLIP WORK: the lowest rung whose choice is the
adviser's own best turn or one the adviser scores within 300 cc of its best.
283k and 566k are the ×√2 midpoints of `WORK_LADDER`'s ×2 quantisation, so a
flip can be placed between two rungs the ladder actually has.

It reuses the artifact's own deep scores for the played turn and the adviser's
best, so only a rung that picks some THIRD turn costs an adviser search, cached
by end key.

### What the split cannot tell you

The seat played under `wall:3000` at rungs 200,000-400,000 units. The re-run is
fixed 400,000 units. `searched` is what the fixed-work re-run searched, which
approximates what the seat searched and is not the same thing. A turn that was
deadline-cut in the game was not deadline-cut in the re-run.

### Files

| File | What E2 added |
| --- | --- |
| `lab/hard-ai/analyze/analyze.ts` | `TurnExposure`, `buildExposure`, `splitByExposure`, the two new classes, `expose: true` on the production re-run |
| `lab/hard-ai/analyze/reclassify.ts` | `rerunRootExposure`, `flaggedTurns`, `reclassifyDirectoryWithRoot` |
| `lab/hard-ai/analyze/loss-report.ts` | the incremental report, with the split and `candidateSource` columns |
| `lab/hard-ai/analyze/work-sweep.ts` | `hard:analyze:work-sweep`: the same turn re-run at six work rungs, and the work at which the engine's choice flips to the adviser's |
| `tests/lab/analyze-exposure-split.test.ts` | every split outcome, `buildExposure`, and the retrofit path with a stubbed engine |
