# Engineering judge — the three Hard AI designs

Written 2026-09-14 against worktree `/Users/ashkie/src/deevgames-muju-hardai` (branch `claude/muju-hard-ai`,
v2.8 snapshot). Paths relative to `muju/`. Lens: engineering soundness only — determinism, correctness against
the canonical engine, performance realism in TypeScript, worker/time management, parallel implementability by
independent agents, single-command testability of milestones, regression risk to Easy/Medium and the UI.

Designs judged:

- SF — `design/search-first.md`
- KF — `design/knowledge-first.md`
- MF — `design/measurement-first.md`

Everything below was checked against the code, not against the designs' own citations. Two claims were also
verified by running the canonical engine (`node --import tsx`, scratchpad script, nothing written to the repo);
those are marked **[ran]**.

---

## 1. Scores

| Design | Strength potential | Implementability | Verifiability | Total |
|---|---:|---:|---:|---:|
| measurement-first (MF) | 8 | 7 | 9 | **24** |
| search-first (SF) | 9 | 7 | 7 | **23** |
| knowledge-first (KF) | 7 | 8 | 8 | **23** |

Ranking for the synthesis: MF's verification spine and gate discipline, SF's engine internals, KF's knowledge
substrate and parallel table lanes. No design is implementable as written; §4 lists the blockers.

The three designs converge on the same core (packed struct-of-arrays state, four-lane `Uint32` bitboards,
`RECT[side][sq]` spawn masks, two-tier Zobrist with reserves and the draw clock in the key, make/unmake inside
a turn, canonical ordering plus a within-turn TT, iterative-deepening PVS over macro-turns with quiescence over
tactical turns, no null-move, a gated checkmate prover, a whole-turn worker path, replay through canonical
`applyAction` before dispatch, perft/fuzz/SPRT tooling, `AIEngineV2` untouched). That convergence is the good
news: the synthesis is mostly a choice of interface specifications and gate order, not of architecture.

---

## 2. Verdicts

### 2.1 search-first — strength 9 / implementability 7 / verifiability 7

SF has the highest ceiling and the best hot-path discipline of the three.

- Packed 32-bit actions (`PA`), a `TurnPool`, a per-ply `Scratch` pool, an `Int32Array` undo stack, and
  `Int32Array` open-addressed tables — nothing allocates per node. This is the only design that fully follows
  ET §9.1.
- `WorkMeter` with per-class costs and a quantised `WORK_LADDER` chosen from a device EWMA *before* the search
  starts is the right answer to "deterministic under fixed work AND 2–6 s on any device". Given
  `(PackedState, work, config, catalogSignature)` the move is byte-identical; the only clock reads are the rung
  choice and the `3 × targetMs` abort. This should be adopted verbatim.
- `Kpos` includes per-unit damage, which is required: `startTurn` charges upkeep before it heals
  (`src/game/turn.ts:30-33`, `:59-63`), so an `upkeepPending` macro node can carry damage. KF and MF exclude
  damage from `Kpos` and can collide two pending nodes with different damage vectors.
- The df-pn home-force module, the SEE-analogue ordering (opponent's `KillTable` on the post-turn position),
  the TT storing `bestEndLo` and re-matching generator output, and `proverMode: 'full' | 'bound' | 'off'` are
  all sound and well specified.
- Layering is enforced mechanically (`hard:deps`) and interfaces are pinned as declaration tests — the
  strongest anti-drift measure for a parallel fleet.

Where it fails engineering review:

- **The canonical-ordering pseudocode (§4.5 `SAFE_INDEP`) is unsound** — it prunes reachable states on the
  initial position. Detail and proof in §4, flaw F1 **[ran]**.
- **It drops `canActThisTurn` from `PackedState` and never rejects it in `pack`**, yet gates M5 on the 28
  home fixtures, one of which (`lab/ai/fixtures.ts:29`, "ineligible defender") sets `canActThisTurn = false`.
  The replica would report a rescue the prover disproves. Flaw F2.
- **Stage-1 evaluation "~300 ns" is unspecified at the places it is actually called.** `Evaluator.stage1(p,
  root, ctx: NodeContext)` needs strike maps and kill tables for `p`, but `NodeContext` is built once per macro
  node (§4.9 `buildNodeContext`). Quiescence leaves and the within-turn scorer evaluate *post-boundary* states
  whose strike maps differ from the parent's. Either the context is stale (wrong after any kill, move or buy)
  or it is rebuilt per leaf (~10–30 µs, which kills the 400k/s gate). A coding agent cannot resolve this from the
  document. Flaw F6.
- **M8's SPRT is "against `AIv2-hard` at equal fixed work".** `AIv2`'s `fixedWork` counts beam candidates
  (`src/ai/planner/beam.ts:34`), SF's `WorkMeter` counts weighted node classes; there is no common unit. Cross-
  engine comparisons must be wall-clock (MF gets this right). Flaw F3.
- Rent is double-counted: stage-0 material charges the present value of rent *and* `pstMine` uses the rent-
  charged table from the SU addendum. Texel would partially compensate; better to not build it in. Flaw F9.
- R9 claims df-pn results are "re-proved by the canonical prover before being trusted at the root". The
  canonical prover (`src/game/homeCheckmate.ts:57`) proves only a single reply turn; a 2–3-turn forced win
  cannot be re-proved by it. The 0-false-positive suite is the real safeguard; the document should say so.
- Smaller interface gaps: `PAY_UPKEEP` cannot be encoded in a `PA` (the keep-set index scheme is implied, not
  stated); `KillEntry.valueCc` comes from `eval/features.ts`, which the §3.1 dependency graph forbids `gen/` from
  importing; `SpawnInfo.fragility` is a method on a plain data interface; `ActionSearch.run` takes a `prefix`
  but says the state "must already be in the action phase" — who applies the prefix is unstated.

### 2.2 knowledge-first — strength 7 / implementability 8 / verifiability 8

KF has the best-specified knowledge substrate and the best parallel split.

- `NodeTables` (two build levels) is frozen at M3 and then M4/M5/M6/M7 are four independent modules with no
  shared files, each differential-tested against an *independent* reference (`server/analysis/tactics.ts
  approachTable`, brute force, literal simulation through canonical `endTurn`, `server/analysis/geometry.ts
  blockingSet`). This is the cleanest fleet plan of the three.
- `economyDP` is specified to the line in fixed-point (`GAMMA_Q16`), with `EconDelta = stream − pstSum` so
  stage 1 and stage 2 never double-count, and rent as its own feature. The only design that gets the
  accounting right.
- `minActionsToKill` pseudocode is complete: lanes, corner cap, per-definition purchase entries at the cheapest
  spawn, promotions, one hit per attacker, `POWER = 0` excluded.
- The 34-feature enum, per-invariant fixtures that must set "exactly its own bit", `hard:gate:m<n>` scripts
  printing one JSON line and exiting non-zero, and the `homeRaceAvailable` must-answer (SU addendum 20b, the
  forced turn-3 win both players missed) are all directly implementable.
- Scores are integers; determinism rules (ascending square/slot iteration, no `Map`/`Set`, budget polled every
  512 nodes) are stated.

Where it fails:

- **The thesis caps strength and its own gates never test the thesis.** `Dmax = 3` desktop / 2 phone, K
  schedule `[24,12,6,4]`. The claim "depth-3 over this eval beats depth-6 over a bare eval at the same 3 s"
  is never measured: M10 compares only against `AIv2-hard-fast`, and there is no depth-6 arm anywhere in the
  plan. ET §4.0's budget arithmetic says 5–7 plies are affordable; KF spends the budget on slack.
- **Hard filters delete legal, sometimes best, turns.** Filter 17 ("a buy raised a later MOVE's cost") removes
  exactly Black's archived turn-4 `+Muju@J10` plug (SU §4.4) whenever a later move routes past it; filter 8
  ("the plan claims a kill the DP prices above the budget") is vacuous for turns that were simulated legally
  and harmful when the DP's lane model is conservative. Penalties, not filters. Flaw F7.
- **`resolveCheckmateGate(s: PackedState, origin: GameState)` has no implementable body.** It "calls back
  into `src/game/homeCheckmate.ts`", which takes a `GameState`; the only unpack in the design
  (`state/adapter.ts unpackState`) is declared "tests + fuzzer only". A hot-path unpack (or a packed prover
  replica, which MF specifies as `tactics/home.ts homeVerdict` with its own 28-fixture + 20,000-position gate)
  is missing. Flaw F8.
- `HardAction` is a five-field object; `legalMoves(..., out: HardAction[], at)`, `ActionLine.actions`,
  `TurnCandidate.actions`, `KillPlan.attackers: Int8Array` (allocated per call) — the within-turn DFS at
  144 lines × 10 place-plans × 313 nodes creates ~450k action objects per search unless the implementer invents
  a pool the design does not mention.
- `PackedState` lacks `victoryRule` and `inactivityRule` (both change the transition:
  `src/game/turn.ts:23`, `src/game/inactivity.ts:8`, `src/game/homeCheckmate.ts:173`) and `reviewUpkeep`
  (`turn.ts:32`). The M3 fuzz gate can only pass if the fuzzer never sets them. Flaw F5.
- M10 gate (b) runs `AIv2-hard-fast` at `--work 200000`: CA §0 measured 100,000 work = 7.6 s *per decision*
  for `AIv2`; at ~7 decisions per turn that is minutes per turn. Same cross-engine fixed-work confusion as SF.
  Flaw F3.
- "Level 2 (~6 µs)" is optimistic by 3–10×: kill table for every enemy, approach table for every own unit ×
  every attacker class, Cleave chains over every reachable square of every tier-2+ enemy, the economy DP
  (2–5 µs alone), and an exact min-set-cover blocking set. Harmless at depth 3, but the timing table in §2 is
  what a phone profile is derived from.
- The book gate (M13) accepts H0 and ships the book disabled — good discipline — but the book keying by
  `weightsVersion` means every Texel retune invalidates the book, which the plan does not budget for.

### 2.3 measurement-first — strength 8 / implementability 7 / verifiability 9

MF is the design a verifier agent can actually run.

- `lab/hard-ai/verify/gates.ts` — a table of `{id, dependsOn, command, artifact, criterion}` — plus `npm run
  hard:verify -- --gate M<n>` that executes, reads a JSON artifact, applies a predicate, writes
  `lab/results/hard-ai-verify-<date>/M<n>.json` and exits 1 on failure. This is the single-command contract the
  brief demands, and MF is the only design that also records git SHA, WASM SHA, node version and device in
  every artifact.
- The ladder is correct where the other two are not: seat-mirrored paired seeds, pentanomial SPRT with the
  variance written out, `adjudicationRate ≤ 0.01` as a hard gate (SU addendum 2: the material+bank cap scorer
  would hand Black 232 of 235 tied games), `home-checkmate` counted as a rule terminal, `GameRecord v3` carrying
  `fixedWork`, `engineConfigHash`, `adjudicationFormula`. Cross-engine comparisons are wall-clock
  (`wall:3000`), intra-engine at fixed work — the only design that keeps those apart.
- The three-surface fuzzer (transition, legal-action *set*, target-removal prover) with self-contained
  divergence reproducers, the cross-process determinism check, and the `grep` lint for `Date.now |
  performance.now | Math.random | crypto.randomUUID` under `src/ai/hard/` are the right instruments.
- **M3 ships the whole-turn path for `AIEngineV2` before the replica exists** and SPRTs it at wall clock.
  That is a real +30–60 (EG G12) win, obtainable in days, that also proves the ladder works on a change of
  known sign. Neither SF nor KF has an early, cheap, positive-sign calibration of the instrument.
- It keeps `F_CAN_ACT` "until a fuzz run proves it is never false for an alive unit in a reachable state",
  keeps the `attacked` mask in the WASM kernel's layout, and pins the SU §8.1 checkmate-vs-draw ordering as a
  fixture. Conservative in exactly the places SF is cavalier.

Where it fails:

- **M2's gate is uncomputable.** "A-vs-A self-match of `AIv2-hard-fast` over 400 pairs at `fixedWork
  200000`": 800 games; CA §0 measured 100k work ≈ 7.6 s per decision, so 200k ≈ 15 s × ~7 decisions/turn ×
  ~25 turns × 2 seats ≈ 1.5 h per game ≈ 50 CPU-days. Flaw F4.
- `evaluate ≥ 1,000,000/s` (M8) with `extract(p, t: ThreatMaps, w)` — `ThreatMaps` needs a BFS per unit per
  side; even amortised per node, 1 M/s is not credible for a 12-feature eval that reads strike masks, hanging
  values and `minKill`. KF's 200k/s stage-1 / 60k/s stage-2 is the honest number.
- `Identity.version: 3` only, with `mode` required, while claiming "`'action'` is byte-compatible with
  protocol 2 behaviour". `tests/ai/worker.test.ts:16` builds `version: 2` requests and the handler rejects
  `version !== AI_PROTOCOL` (`handler.ts:12`); the gate "npm test green" is only true after silently editing
  that test. SF/KF's `version: 2 | 3` is the additive form.
- `terminalScore = ±(WIN − ply)` spaces mate scores by 1 cc; with LMR, aspiration windows and integer
  feature sums of thousands of cc, a 1 cc quantum is fragile. SF/KF use 1,000 cc per ply.
- Rent double-counted (feature 1 material "− present value of rent" and `PST_MINE` "with rent charged from the
  unit's next own turn"). Flaw F9.
- Same `PackedState` gaps as KF: no `victoryRule`, `inactivityRule`, `reviewUpkeep`. Flaw F5.
- The generator (`gen/turnsearch.ts`) and economy features 6/8 are described in less detail than SF/KF; the
  ordering key table and dominance rules are borrowed from ET §3.3 without the square-assignment enumeration
  (SF: top-8 squares, `P(8,4)` exact; KF: Hungarian).

---

## 3. Cross-cutting checks (the same questions asked of all three)

| Question | SF | KF | MF |
|---|---|---|---|
| No `Date.now`/`Math.random`/float in the search path | yes; lint rule in `hard:deps` | yes; stated | yes; grep lint + cross-process check |
| Integer centi-crystal scores, mate by ply | yes, 1,000 cc/ply | yes, 1,000 cc/ply | 1 cc/ply (fragile) |
| Reserves and draw clock in `Kpos` | yes | yes | yes |
| Damage in `Kpos` (needed while `upkeepPending`) | **yes** | no | no |
| `victoryRule` / `inactivityRule` in packed state | yes (`victoryHome`, `drawRuleOn`) | **no** | **no** |
| `reviewUpkeep` in packed state (`turn.ts:32`) | **no** | **no** | **no** |
| `canActThisTurn` kept until proven unreachable | **dropped** | kept (`flags` bit0) | kept (`F_CAN_ACT`) |
| Zero-allocation hot path | yes (`PA`, pools) | **no** (`HardAction` objects) | mostly (`PackedAction` ints) |
| Checkmate prover gating | canonical short-circuit + `bound` mode in quiescence | `resolveCheckmateGate` needs an unspecified unpack | `needsCheckmateProof` + packed replica `homeVerdict` with gate M6b |
| Canonical ordering spec sound | **no** (F1) | yes if "corridor" is implemented | yes if "corridor" is implemented |
| Fixed-work determinism vs 2–6 s budget | rung chosen before search (best) | wall-clock ID, fixed-work for lab | wall-clock ID, fixed-work for lab |
| Cross-engine SPRT axis | fixed work (**invalid**) | fixed work at 200k (**invalid, infeasible**) | wall clock (correct) |
| Single-command gate | one `&&` chain per milestone | `hard:gate:m<n>` + JSON line | `hard:verify --gate` + artifact + predicate table |
| Early positive-sign instrument calibration | none | none | **M3** (whole-turn `AIEngineV2`) |
| Multi-process ladder sharding (lab knobs are process-global, `runner.ts:93-105`) | **absent** | **absent** | **absent** |
| Easy/Medium and UI untouched | yes (protocol 2/3 additive) | yes | version literal bump breaks protocol-2 requests |
| Interfaces pinned against agent drift | declaration tests + `hard:deps` | frozen `NodeTables`/`HardEngine` at M2/M3 | `tsc` + gates only |

---

## 4. Fatal flaws, each with the code or position that demonstrates it

**F1 — SF's `SAFE_INDEP` prunes reachable states (initial position). [ran]**
`key(a) = (rank << 20) | (slot << 10) | square`; prune `cur` iff `SAFE_INDEP(prev, cur) && key(prev) > key(cur)`,
where `SAFE_INDEP` tests only `{from, to}` disjointness (plus a lethal-attack clause). It ignores that a MOVE
*vacates* a corridor square. Slots at the start are Hi = 0, Sjor = 1, Muju = 2 (`board.ts:214-220` adds
`STARTING_UNITS` in order). Line: `MOVE Sjor B2→C2` (1 AP) then `MOVE Hi B1→B3` in **one** action through the
vacated B2 (dist 2, SPD 2), then `B3→B5`, `B5→B7`: 4 AP, end position {Hi B7, Sjor C2, Muju A2}. Verified legal
through canonical `applyAction`. Under SF's rule the pair (Sjor move, Hi move) has disjoint square sets and
`key(Sjor) > key(Hi)`, so the order is pruned; the "canonical" order Hi-first costs the Hi 2 AP to reach B3
around the Sjor (verified: `actionsRemaining` 2 after one move), so the same end position needs 5 AP and is
unreachable. `perftTurns(initial, 1)` under SF's enumeration is therefore < 797 and its own M4 gate fails. The
mid-game form is the corpus's own motif (SU §2.6, NK:14 "your own army blocks your routes"): own Muju at F5
steps to E5, own Hi at F6 runs through F5 to F4 for 1 AP (verified); Hi-first costs 2. Fix: independence must
include every square within the mover's hop distance (or the BFS corridor), not only `{from, to}`.

**F2 — SF drops `canActThisTurn` yet gates on fixtures that set it.** `PackedState.uflags` has no can-act bit,
`pack` rejects only unknown defIds / > 128 units / bad reserves. `lab/ai/fixtures.ts:29` ("ineligible
defender", `expected = 'disproved'`) sets `canActThisTurn = false` on a `fire_3` adjacent to the occupier; the
WASM kernel honours it (`assembly/tactics.ts:109`, flag bit 0); SF's kill table would report `minActions = 1`.
M5's "28/28 agreement with the prover" cannot pass. Either keep the bit (MF) or make `pack` throw on it and
drop the fixture from the gate.

**F3 — SF M8 and KF M10 compare engines at "equal fixed work".** `AIv2` charges one work unit per beam
candidate (`beam.ts:34`, `runtime.ts:23`); the new engines charge weighted node classes. There is no exchange
rate. CA §0: `AIv2` at 100,000 work = 7.6 s per *decision*; KF's `--work 200000` makes the control arm take
minutes per turn. Cross-engine gates must be wall-clock (MF §4.6 `wall:3000`); fixed work is for self-play
regression only.

**F4 — MF M2 gate needs ~50 CPU-days.** 400 mirrored pairs of `AIv2-hard-fast` at `fixedWork 200000`. Using CA
§0 (7.6 s at 100k, 0 MCTS iterations, so the time is the beam draining the budget), 200k ≈ 15 s per decision,
≈ 7 decisions per turn, ≈ 25 turns per game, two seats ≈ 1.5 h per game. Reduce to `fixedWork 4000–8000`
(CA: 356 ms at 4k) and 100 pairs; the purpose (A-vs-A sanity, `|elo| < 10`) does not need the large budget.

**F5 — Every design's packed state omits `reviewUpkeep`; KF and MF also omit `victoryRule` and
`inactivityRule`.** `startTurn` returns a pending upkeep when `state.reviewUpkeep?.[player]` is set
(`src/game/turn.ts:32`); the UI sets it through `SET_UPKEEP_REVIEW` (`src/hooks/useGameState.ts:63`). A
human opponent with review on makes the replica's `END_ACTION` diverge from canonical on every turn boundary:
`verifyTurn`/`unpackToActions` then truncates every Hard turn to its prefix before the boundary (harmless but
degrades), and the "10^6 fuzz actions, zero divergences" gate is only true because the fuzzer never sets the
flag. `victoryRule === 'elimination'` disables the home win (`turn.ts:23`, `homeCheckmate.ts:173`) and
`inactivityRule === 'off'` disables the draw (`inactivity.ts:8`); the harness sets both per game
(`runner.ts:114-115`). All three must be packed (SF has two of three).

**F6 — SF's stage-1 evaluator needs a `NodeContext` for the leaf position that nothing builds.** See §2.1. The
400,000 evals/s M7 gate and the "~300 ns" claim depend on strike maps and kill tables being available for a
position that differs from the macro node's. KF resolves it by building level-1 tables *inside* `evaluate` at
stage 1 (and pricing it at ~1 µs); MF passes `ThreatMaps` explicitly. The synthesis must say which.

**F7 — KF's hard filters 8 and 17 remove legal turns.** Filter 17 fires on any purchase that raises a later
move's cost; the archived Black turn-4 `+Muju@J10` plug (SU §4.4, "invalidated every one-turn assault") followed
by any move that would have routed through J10 is filtered. Filter 8 is vacuous: a turn produced by simulation
cannot claim a kill the rules do not allow; when the DP's lane model is conservative (a corner target with a
blocker that is cleared mid-turn) the filter deletes real kills. KF's own retry-with-filters-off rule only
helps when *every* candidate is filtered.

**F8 — KF's `resolveCheckmateGate(s: PackedState, origin: GameState)` cannot be implemented from the
document.** It must call `analyzeHomeDefense(state: GameState, …)` (`homeCheckmate.ts:57`), but no hot-path
`PackedState → GameState` conversion exists (`unpackState` is "tests + fuzzer only") and the `origin` argument
does not describe the current node. Either specify a packed prover replica (MF `tactics/home.ts homeVerdict`,
gate M6b: equal to `analyzeHomeDefense` on the 28 fixtures and 20,000 fuzz positions) or specify the unpack and
budget its cost (`transitionWithoutCheckmate` is 0.58 µs per action; the prover is ≤ 20,000 of them).

**F9 — SF and MF double-count rent.** SF stage 0: "each living tier-2/3 unit is additionally charged the present
value of its rent" plus `pstMine` from the SU addendum table that already subtracts six turns of rent. MF:
feature 1 `material = Σ cost − PV(rent)` plus `PST_MINE` "with rent charged from the unit's next own turn". A
Sachakuna on a 16 is charged ≈ 8.4 crystals of rent twice. KF separates `Rent` from `PstMine` and subtracts
`pstSum` from the economy DP; adopt that accounting.

**F10 — KF/MF exclude damage from `Kpos`.** Two `upkeepPending` macro nodes with identical pieces and
different damage vectors share a key; a TT hit can import a rescue verdict that depends on the healed/unhealed
distinction (`turn.ts:30-33` charges upkeep before `finishTurnStart` heals). Rare; include damage (SF).

**F11 — No design shards the ladder across processes.** `setUpkeepVariant`, `setElementGraph`,
`setCombatHandicap` are module globals (`runner.ts:93-105`), so parallel games must be separate processes. An
SPRT at `elo1 = 5`, `α = β = 0.05` needs thousands of pairs; at 32k work (SF's estimate ≈ 1.3 s per turn) that is
≈ 50 s per game and ≈ 4–5 single-process CPU-days per gate. MF's `elo1 = 100` for the first cross-engine gate
is the right early setting; every design needs a `--shards N` runner before any `elo1 = 5` gate is credible.

**F12 — SF R9 over-claims df-pn safety.** "Re-proved by the canonical prover before being trusted at the root"
is only possible for the terminal mate-in-1; a ≤ 3-turn forced win has no canonical oracle. The authored
0-false-positive suite is the whole safeguard and must be sized accordingly (MF: 200 authored positions, 50 of
them exhaustively checked).

---

## 5. Best ideas from non-winning designs that the synthesis must keep

From search-first (engine internals):

- `WorkMeter` with `WORK_COST` per node class and the quantised `WORK_LADDER` chosen from a device EWMA before
  the search; `searchTurn(state, { work })` bypasses the clock entirely for CI/SPRT.
- Packed 32-bit actions, `TurnPool`, per-ply `Scratch`, `Int32Array` undo stack; `Kpos` with damage; `Kturn`
  without `attackedThisTurn` (RE §1.7a) but with the fuzzer as the guard.
- `proverMode: 'full' | 'bound' | 'off'` on the replica, with `'bound'` (the admissible `damage_bound` step of
  `homeCheckmate.ts:27-49`) inside quiescence and df-pn.
- Multi-source BFS per distinct speed for `strikeIfBought` (≤ 3 BFS per side per node instead of
  |spawn| × |defs|).
- TT entries store `bestEndLo` and the generator's candidates are re-ordered by matching end keys; the same
  trick makes the opening book robust to generator drift.
- SEE analogue: run the opponent's `KillTable` (with purchases) on the post-turn position and demote turns
  that hang more than they take.
- `TurnFlag` bits + `turnSignature` for killers/counter-moves; `histBuy[defId][sq]` butterfly table.
- df-pn home-force module keyed by `Kpos` (reserves + clock contain GHI), `(pn, dn)` in an `Int32Array`, node
  budget charged to the meter, `unknown` never a win.
- `hard:deps` layering lint, the nondeterminism grep, and interfaces reproduced as declaration tests.
- The candidate-square assignment: top-8 squares by score, all `P(8,4)` injective assignments, keep 3.

From knowledge-first (knowledge substrate and parallel lanes):

- `NodeTables` with two build levels, frozen at M3, so four table modules (threat/approach, kill DP, economy DP,
  spawn geometry + home) are built by four agents against an interface, each with an independent reference
  oracle (`server/analysis/tactics.ts approachTable`, brute force, literal `endTurn` simulation,
  `server/analysis/geometry.ts blockingSet`).
- `economyDP` in fixed point with `EconDelta = stream − pstSum`; `Rent` as its own feature; `PST_MINE` table
  18 × 17 without rent; `turnsToInsolvency`, `relocationDebt`, `waste`.
- `minActionsToKill` pseudocode (lanes, corner cap, purchases as one entry per definition at the cheapest
  spawn square, promotions, one hit per attacker, `POWER = 0` excluded).
- `approachTable` with `retreats` count and the SU addendum 20a rule (`retreats == 0` is a hard penalty).
- Invariants as *tunable penalties* with a fixture per invariant that must set exactly its own bit; the
  retry-with-filters-off rule so a filter can never empty the list; only invariants 1 and 18 as hard filters.
- `homeRaceAvailable` (SU addendum 20b) in the must-answer layer — it finds the archived turn-3 forced win.
- `genKeepSets` capped at 64 ranked keep-sets (rescuers, anchors, attackers first).
- `drawTerm = max(0, plies − 4) × sign(v1)` ramp; `Corridor`/`TierClimb` weights initialised to 0 and left to
  Texel.
- `hard:gate:m<n>` composite scripts printing one JSON line and exiting non-zero.
- The calibrate profile table (desktop / midrange / phone → K, widths, depth, quiescence, budget clamp) with a
  depth-1 latency gate.

From measurement-first (verification spine):

- `lab/hard-ai/verify/gates.ts` + `npm run hard:verify -- --gate M<n>` + per-gate JSON artifacts with git/WASM/
  node/device stamps.
- Three-surface differential fuzzer (transition, legal-action set as a sorted multiset, target-removal prover)
  writing self-contained divergence reproducers; `unmake(make(a))` identity on the 24-field digest and both keys;
  from-scratch Zobrist every 64th node.
- Cross-process fixed-work determinism check, including the WASM-absent JS fallback path.
- Pentanomial SPRT with the LLR formula written out, seat-mirrored paired seeds, `adjudicationRate ≤ 0.01` as
  a gate, `home-checkmate` as a rule terminal, `GameRecord v3` (`fixedWork`, `engineConfigHash`, `adjudicated`,
  `handicap`, `adjudicationFormula`), Elo with LOS.
- Wall-clock for cross-engine ladders, fixed work for intra-engine; `elo1 = 100` for the first cross-engine gate.
- M3: the whole-turn worker path for `AIEngineV2` first, SPRT'd against the per-action path at equal wall
  clock — a known-positive change that calibrates the instrument before the replica exists.
- Suites keyed by end-position `Kpos` (never action sequences), with `best`/`avoid` lists and a `rationale`
  citing the SU section; the invariants suite as 20 negative cases.
- Keep `F_CAN_ACT` until a fuzz run proves it unreachable; keep the `attacked` mask in the WASM kernel's
  4-word layout so both kernels share a format.
- The "TT-on vs TT-off returns the same score at fixed depth" gate (exact alpha-beta property).
- The constants-agreement test (`ACTIONS === 4`, total ore 504, `MAX_RESOURCE_RESERVE === 16`,
  `UPKEEP_BY_TIER`, `INACTIVITY_LIMIT`, T1 prices) so a stale constant cannot model the wrong game.
- The mobile profile gate: depth 1 in ≤ 150 ms on the phone profile in every corpus position; p95 turn latency
  recorded with the device string.
- `AIResult.turnActions?` as an additive field so protocol 2 clients keep working.

---

## 6. Recommendations for the synthesis (engineering only)

1. Take MF's verification spine (gates table, artifacts, fuzzer, ladder, SPRT, determinism, suites) verbatim,
   fix its M2 budget (fixed work 4–8k, 100 pairs) and its protocol-version literal (`2 | 3`, `mode?` optional).
2. Take SF's core representation, `WorkMeter`/`WORK_LADDER`, PVS/quiescence/df-pn/ordering, and its
   layering lint; replace its canonical-ordering rule with a corridor-aware independence test and gate it by
   set equality on the initial position *and* on the F5/E5 "step aside, then run" fixture; keep `canActThisTurn`
   (or throw in `pack`); include `reviewUpkeep`, `victoryRule`, `inactivityRule` in `PackedState`.
3. Take KF's `NodeTables` two-level contract and its four table modules (with their oracles) as the M4–M7
   parallel lanes; use KF's economy/rent accounting; build level-1 tables inside stage-1 evaluation and price
   it honestly (200k/s stage 1, 60k/s stage 2); make all invariants penalties except 1 and 18.
4. Use MF's M3 (whole-turn `AIEngineV2`) as the first strength gate; use wall-clock `elo1 = 100` for every
   cross-engine gate and fixed-work `elo1 = 5` only between versions of the new engine, after a `--shards N`
   process-level ladder runner exists.
5. Pin the SU §8.1 checkmate-vs-draw ordering as a fixture (MF M6b) and gate the prover replica against
   `analyzeHomeDefense` on the 28 fixtures plus fuzz positions with an occupier; run the full prover only at
   the root's chosen line and at occupied-corner boundaries, `bound` mode elsewhere.
6. Every interface in the synthesis must state who builds each derived table for a *leaf* position (the F6
   gap), how `PAY_UPKEEP` keep-sets are encoded in a packed action, and which lab knobs are part of the
   catalogue signature.
