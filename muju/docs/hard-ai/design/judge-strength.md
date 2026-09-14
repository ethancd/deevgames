# Judge review — playing strength under the real budget

Written 2026-09-14 against worktree `/Users/ashkie/src/deevgames-muju-hardai` (HEAD `44c41c4`, v2.8 snapshot).
Designs judged: `design/search-first.md` (SF), `design/knowledge-first.md` (KF), `design/measurement-first.md` (MF).
Ground truth: `STRATEGIC_UNDERSTANDING.md` (SU, including its three addenda), `ENGINE_GAPS.md` (EG),
`understand/{engine-techniques,current-ai,rules-engine,lab-harness,strategy-docs,game-records}.md`, and the
code under `src/ai/**`, `src/game/{types,legality,spawning,movement,combat,homeCheckmate}.ts`,
`src/hooks/useAI.ts`, `assembly/tactics.ts`, `lab/harness/*.ts`, `lab/ai/*.ts`.

Lens: which design beats the shipped Hard preset and the recorded Codex strategies (forward-anchor fresh-Hi raids,
Aegirinn/Tanka walls, spawn-strikes) inside 2–6 s on desktop and gracefully on a phone, deterministically under
fixed work. Everything below is judged as written; where a design says one thing in prose and another in an
interface, the interface is what a fleet of coding agents will build, so the interface wins.

---

## 0. Scores

| key | strengthPotential | implementability | verifiability | total | one-line verdict |
|---|---:|---:|---:|---:|---|
| search-first | 8 | 8 | 6 | **22** | Strongest engine spec; misses the corpus's only verified forced win and has no gate that tests the project goal. |
| knowledge-first | 5 | 7 | 6 | **18** | Caps depth at 3, leaves budget unused, and ships hard generation filters, one of which (invariant 18) is inverted and forbids banking. |
| measurement-first | 7 | 7 | 9 | **23** | Same engine class as SF with weaker search detail; the only design whose gates actually measure "beats Hard at equal wall clock". |

Scale: strengthPotential = how strong the engine is if built exactly as specified; implementability = can a fleet
build it in parallel against the stated interfaces without re-designing; verifiability = do the gates mechanically
establish the claims the design makes, including the project goal.

**Reading the totals.** MF edges SF by one point only because verifiability is one of three equal-weight axes and
MF's ship gate is the only one that tests "beats the current Hard preset at the real budget". On the strength lens
alone SF wins. The synthesis should therefore be **SF's engine core with MF's instrument and gate spine**, plus the
KF grafts in §5. None of the three should be built as written.

---

## 1. What the three designs share (and why the differences are narrow)

All three derive from `engine-techniques.md` §2–§8 and converge on the same substrate:

- packed struct-of-arrays state, four-lane `Uint32` bitboards, `RECT[side][sq]` spawn masks, two-tier Zobrist
  (`Kpos` with reserves and clock; `Kturn` with turn flags), make/unmake inside a turn, snapshot at the boundary;
- a generalised `minActionsToKill` DP with true BFS distances, purchases at spawn-to-lane cost, promotions, Cleave
  continuation (`homeCheckmate.ts:27-49` generalised from 2 lanes to 4);
- `strike` and `strikeIfBought` maps (fresh Radi radius 10, Hi/Göl 7, Sjor 4 from every legal spawn square);
- `PST_mine` from live reserves, a 6-turn discounted economy DP with greedy relocation, upkeep runway with an
  insolvency cliff, spawn geometry with the zero-spawn cliff, anchor fragility, infiltration weighted by anchors
  voided, home safety with plug/countdown, a draw-clock term;
- canonical ordering (promotions by slot index, independent actions in slot order, attacks before independent moves)
  plus a within-turn TT keyed on `Kturn`;
- dominance-pruned purchase multisets, ≤ 8 mission promotions, forced injections (kills, home entries, mine-only,
  best retreat), K ≈ 24 candidate turns, recall instrument targeting ≥ 90 %;
- ID-PVS at the macro-turn level, negamax sign-flip only at the boundary, no classical null move, quiescence over
  tactical turns, integer centi-crystal scores, Texel on a self-play corpus, book keyed by handicap and rot180.

So the substrate is not where the designs differ. They differ in:

1. **how deep the search goes and how the budget is spent** (SF/MF: to exhaustion, 5–7 plies; KF: capped at 3);
2. **whether knowledge enters as tunable features or as hard generation filters** (SF: penalties; MF: two hard
   rejections inside the purchase generator; KF: four hard filters over whole turns plus 16 penalties);
3. **whether purchases enter the home-race / must-answer layer** (MF and KF: yes, SU addendum 20b; SF: no);
4. **whether the ship gate measures the project goal** (MF: equal wall clock vs the UI Hard preset, elo1 = 100,
   handicaps 0 and 3; SF: elo1 = 5 at "equal fixed work" across incommensurable engines; KF: vs `AIv2-hard-fast`,
   the 120 ms lab preset that loses every game to scripted Rush, LH §2).

---

## 2. search-first

### 2.1 What is strong

- The search is the most completely specified of the three: `pvs` pseudocode with aspiration, PVS null windows,
  LMR exemptions for `KILL|HOME_ENTRY|HOME_RESCUE|SPAWN_DENY|FORCED`, frontier futility with a `maxPlausibleGain`
  bound, home-threat extension, a df-pn gate at `depth ≥ 3`, mate scores by ply with the TT store/probe adjustment,
  and a `ProofCache` kept out of the main TT (ET §4.3's warning honoured).
- The **work-rung** reconciliation (`WORK_LADDER`, `chooseWork` quantised from an EWMA that updates only after a
  completed search) is the only real answer in the three designs to the brief's twin demands of "2–6 s wall clock"
  and "deterministic under fixed work": given `(PackedState, work, config)` the move is byte-identical on every
  machine, and jitter cannot change the rung. MF and KF are deterministic only in lab mode; their UI path polls the
  clock and is machine-dependent.
- The **SEE analogue** in move ordering (`computeKillTable(after, them, me, {includeBuys: true})`, demoting turns
  that hang more than they take) is the direct, cheap fix for the F2/F3/F7/F10 loss class and is absent from MF's
  ordering and only implicit in KF's static features.
- Forced injections include the **best spawn-denial turn** (void the most enemy anchors, corner weighted as all).
  Neither MF nor KF injects denial; both rely on DFS ordering to surface it. Denial was Codex's B2 Tanka (NK:24) and
  the mechanism behind "whoever owns a forward anchor owns the board"; injecting it guarantees recall.
- The C1/C2 canonicalisation carries the one caveat that matters — a lethal attack frees a square and can shorten
  the other action's BFS path, so `SAFE_INDEP` checks `distFromCache(cur.from)[prev.targetSq] ≤ speed × cost` —
  and the M4 gate proves set-equality of end positions against naive enumeration. KF and MF state the rule without
  the caveat.
- `Catalog` carries two power planes when a combat handicap is non-zero, with the knob identity in `signature`.
  This is the only design that gets `combat.ts:62-66` (per-player handicap) right inside a cached table.
- The `proverMode: 'full' | 'bound' | 'off'` gate is admissible (the damage bound can only under-claim mates), so
  quiescence and df-pn never claim a win the rules deny, and the search itself supplies the missing proof one ply
  later through the `startTurn` home-occupation terminal.
- 24 independently buildable units, a layering check (`hard:deps`), interface declaration tests, an addendum rule
  for interface changes. This is the most fleet-friendly spec.

### 2.2 Where it plays badly

**Fatal 1 — purchase-based home races are invisible to the must-answer layer and not guaranteed by the generator.**
SU addendum (`gapfill-sachita-f13-invariant20-misstated.md`) verified, by running the engine, that in the archived
game White had a forced win on turn 3: `BUY lightning_1@G1 → G4 → G7 → G10 → J10` (BFS 12 = 4 × SPD 3),
`applyAction` returns `victory white home-checkmate`, `analyzeHomeDefense` proves mate in 0 nodes because Black's
spawn set is empty. SF's `search/root.ts` must-answer layer is "elimination-in-1 | home-mate-in-1 | home rescue,
reusing the existing `TacticalSolver`" — and the existing solver never emits `BUY_UNIT` (`kernel.ts:75`,
`tactics/home.ts:26`, "purchases are never searched"). Its forced injection 2 is "every legal home-corner entry (a
move whose destination is the enemy corner)", computed inside `ActionSearch.run` for a given place-plan. So the race
is found only if the place-plan "buy Radi at G1" survives `planPurchases`: `candidateDefs` keeps Radi when "the
enemy corner is within BFS 12 of a legal spawn square" (good), but square assignment takes the top `S = 8` squares
by `squareScoreCc`, where G1 is a 0-reserve square inside `strikeTheirs` with no `strikeCc` credit (no kill) and no
`blockCc` credit — it is likely outside the top 8, and the race is gone. The corpus's only engine-verified forced
win is therefore not guaranteed. Fix: graft MF/KF's root check — for every affordable tier-1 × legal spawn square,
`moveCost(spawn, enemyCorner, spd) ≤ actionsRemaining` → inject the line and prove it with the damage bound — and
make "a purchase that can reach the enemy corner this turn" a forced place-plan.

**Fatal 2 — no gate tests the project goal.** M8's gate is `hard:sprt --base ai-v2-hard --cand hard-m8 --work 32000
--elo0 0 --elo1 5`. `AIEngineV2`'s work unit is one beam candidate (`engine-v2.ts:58`, `beam.ts:34`); SF's is a
class-weighted unit (`WORK_COST = 4/2/1/8/6/2/1/4`). "Equal fixed work" across the two is not a comparison of
anything, and `elo1 = 5` is a regression bound, not a strength claim. M10's 40-game ladder asserts only
`illegalActions === 0`. Nowhere is "Hard-new beats the UI Hard preset at equal wall clock, seat-mirrored, at
handicap 0 and 3" a pass criterion. A verifier can run every SF gate green and the engine can still be weaker than
today's Hard at 3 s on a phone. Fix: graft MF's M9 ship gate verbatim.

**Serious — `isTacticalTurn` clause 3 will explode quiescence.** "It voids at least one enemy anchor, or restores
one of ours that was voided" is true of a large fraction of mid-game moves once both sides have forward anchors (any
step into or out of a rectangle). SF's R5 detector (`stats.byClass[QUIESCE] ≤ 0.35 × work.limit`) and fallback
("kills + home events only, `maxPly` 2") are correct, but the design should ship with the tightened definition and
widen only on SPRT, because the loose one turns the depth-5–7 claim into depth 3–4 on every contested position.

**Serious — the Göl is pruned as a purchase.** `candidateDefs` drops `shadow_1` when "every candidate square has
reserve ≥ 2 and no target needs Göl's extra speed to be reached this turn". The archived winner bought three Göls on
0-reserve approach squares (F2, E2, D3) as furniture, blockers and next-turn punishers, and killed five fire units
with Sjor/Göl punishers "on the turn the raider stopped" (GR §2.3, SD P6). A raider that strikes-and-retreats two
squares ends 5–7 from my nearest live square: inside a Göl's next-turn radius (7), outside a Sjor's (4). The rule is
written for this-turn kills and blind to next-turn deterrence. MF's variant ("keep Göl ... or when the square is one
of the 18 zero-ore corridor cells") is closer; the right rule keeps Göl whenever an enemy fire/lightning unit is
within 7 of any candidate square and outside 4.

**Moderate — no explicit approach classification or strand-punish term.** SF relies on depth ≥ 2 to see "they raid,
I recapture". On the desktop rung that is fine. On rung 0–1 (a phone at depth 3) the leaf after my retreat move sees
the raid only through `hanging` (my unit inside `strikeTheirs ∪ strikeBoughtTheirs` with `minActionsAgainstMe ≤ 4`)
which does not distinguish a punishable strand from an unpunishable strike-and-retreat. KF's `approachTable` with
`retreats` (SU 20a) is a cheap stage-1 term and should be grafted.

**Concrete position where SF as written plays badly (fatal 1 restated).** Archived fixture, White turn 3 (`rev 7`):
bank 10, Muju@H2, Sjor@B2 (H1 empty), Hi dead; Black Sjor@H6, Muju@J9, Muju@I10 just bought, bank 9. SF's root
layer offers no purchase race; its generator ranks `plant_1@G2` / `water_1@H1` plans (live squares, `mineCc`) above
`lightning_1@G1`; the search plays the economic turn and Black seals the approach next turn with `BUY plant_1@J10`
(the archived "home insurance", a turn late but in time against this engine).

### 2.3 Verdict

The strongest engine specification of the three and the one a fleet can build fastest. It would beat the shipped
Hard preset — the shipped engine is a one-ply static rank (CA §0), and SF's depth-5–7 verified minimax with
purchase-aware threat maps, kill tables and rent-discounted material addresses every entry in EG's loss-to-gap map.
It would also beat the recorded Codex recipes: the fresh-Hi raid is priced by `hanging` with `strikeBoughtTheirs`
and refuted by the SEE demotion; the Aegirinn/Tanka wall is handled by the kill table (Karanlık/Kagari or
pre-adjacent pairs) and by rent PV; the anchor is attacked by the injected spawn-denial turn. But as written it can
miss a one-turn purchase-based home win that the corpus has already verified, and it never mechanically proves it
beats Hard. Both are graftable in a day; neither is optional.

---

## 3. knowledge-first

### 3.1 What is strong

- The **tables layer** is the richest static knowledge of the three and most of it is correct Muju arithmetic:
  `approachTable` with the `retreats` count (SU 20a: `retreat 0` is a hard penalty, not a tiebreak),
  `StrandPunish` (an enemy stranded and killable by us next turn is a positive), `blockingSetSize` with a
  reachability filter (only squares the enemy can occupy this turn, purchases included — a real refinement of
  `server/analysis/geometry.ts:25-50`), `spawnMaskWithout/With` what-if primitives for the articulation test (F11),
  `cornerNeighboursHeld` (sealing) separated from `plug` (insurance), `EconDelta = DP − pstSum` to stop stage 1 and
  stage 2 double-counting, `homeRaceAvailable` (SU 20b).
- The **invariant module** as 20 mechanised checks with one authored negative fixture each is the best regression
  net for the four recorded losses in any design, provided they are *penalty features*, which 16 of them are.
- The four table modules (M4–M7) are genuinely independent after M3, each with a differential gate against an
  independent reference (`approachTable`, brute force, literal `endTurn` simulation, `blockingSet`).
- The book design (canonical key = `min(Kpos, Kpos∘rot180)` with a negation flag, header with `handicap`/`mapHash`/
  `weightsVersion`, end-key matching against the live generator so drift falls through to search) is the cleanest
  of the three.

### 3.2 Where it plays badly

**Fatal 1 — invariant 18 is inverted and shipped as a hard filter.** SU §7 invariant 18 reads "Never emit
`END_PLACE_PHASE` unless a purchase or promotion is still affordable" (a protocol rule: the phase auto-advances,
`simulate.ts:118-120`). KF §4.10 row 18 reads "never emit `END_PLACE_PHASE` **with an affordable purchase left** |
`canActInPlacePhase` | **filter**", enum `WastedEndPlace`, in `HARD_FILTER_MASK`. Implemented as written, every
candidate turn that ends the Place phase while ≥ 3 crystals remain is filtered out whenever a purchase exists, so the
engine must spend down to < 3 every turn. That deletes SU P16 ("bank early, spend late"), the 6–8 liquidity floor
(SU §1.6.1), the archived White's 57-crystal bank, and KF's own injected "mine-only baseline" (§4 step 3), which is
exactly an `END_PLACE, END_ACTION` turn. The retry-with-filters-off path does not save it because the candidate
list is non-empty (buying turns survive). Against Codex's fresh-Hi raids the engine would have no crystals for the
punishing Sjor/Göl the turn it is needed (NK:13's loss condition).

**Fatal 2 — the `SpawnZero` hard filter removes correct "kill and stay" turns.** Position: White Muju@A1 (plug),
Hi@B1, Sjor@A2, bank 8; Black Radi@C1 (just spawn-struck adjacent to the Hi), Black Straumr@E3 (SPD 1). White's
spawn set is the union of rectangles A1..A1, A1..B1, A1..A2 minus occupied = ∅ whatever White does short of moving
a unit out. Correct turn: `ATTACK C1` (Hi 2 vs lightning DEF 1, kill) and stay: post-turn `area = 0`, `bank = 8 ≥ 3`
→ **filtered**. Every surviving candidate moves the Hi out (B1→D1 or C1→D1 after the kill) to reopen squares —
and D1 is at BFS 3 from E3, so the Straumr strikes E1/D2 in 2 moves and kills the Hi with its third and fourth
actions (F3, NK:11, the exact recorded loss). KF's filter forces the losing shape. A penalty (`−800`) would lose to
the +300 material and the Hi's survival; a filter cannot be outweighed.

**Fatal 3 — depth is capped at 3 and the budget is deliberately unused.** §2's own timing table: root generation
12 ms, d = 2 29 ms, d = 3 250 ms, quiescence 300 ms, "slack for d = 4 when stable ~2.4 s". Iterative deepening
that stops at 3 and extends "only when the root is stable" inverts the normal rule (instability is when you need
depth) and throws away ~80 % of a 3 s desktop budget. Combined with the K schedule `[24, 12, 6, 4]`, the
opponent's reply at ply 2 is limited to 12 candidates ranked by the *mover's* within-turn stage-1 score, and at
ply 3 to 6. That is forward pruning of the refutation set in a game where one kill swings 3–17 crystals. A
depth-3 search cannot plan the two-turn pre-positioning that NK:13 needed ("one AP short of killing the enemy Aeg
four turns running": two SPD-1 attackers at distance 5–6 need two own turns of approach and a third to strike =
depth 5) and cannot see a 3-turn forced home invasion at all, because KF has **no forced-home (df-pn) module** —
`tables/home.ts` has `homeSafety` and `homeRaceAvailable` only. SF and MF both schedule df-pn (M11, M14).

**Serious — the ship gate compares against the wrong opponent.** M10 (b): `hard:sprt --a Hard --b AIv2-hard-fast
--work 200000 --elo0 0 --elo1 25`. `AIv2-hard-fast` is the lab throughput preset (`mctsTimeLimit 120`,
`mctsIterations 60`, `bots/engine.ts:39-43`) that lost 0/2/2 and 0/4/0 to scripted `Aware:Rush` (LH §2). Beating it
by 25 Elo at a lab work setting says nothing about the UI Hard preset at 3 s. The "Dmax ≥ 3 on ≥ 90 % of turns"
clause is trivially true given the depth cap.

**Serious — the staged-evaluation gate cannot pass with the stated margins.** M8 (a) asserts the staged
evaluation "never disagrees with the full evaluation on the side of the window" with `STAGE1_MARGIN = 300`, while
stage 2 contains `Hanging −70 × value(u)` (an Aegirinn: −1,120 cc), `RunwayCliff −600`, `SpawnZero −800` (stage 1),
`HomeInvaded −4000` (stage 0). §4.9's claim that "stage 2 can move the score by at most ~3 crystals" is false by
the design's own weights. Either the gate fails or the margins grow until stage 2 always runs. (SF and MF carry
the same assertion with 300/250 cc; see §4 shared.)

**Moderate — the draw term is too weak to steer.** `drawTerm = max(0, plies − 4) × sign(v1)` × `DrawPressure −40`
is −200 cc at plies 9 against the leader. From plies 5–6, depth 3 does not reach the terminal and the gradient is
−40…−80 cc; a leader up 10 crystals will not spend a 3-crystal Hi to force a kill. SF's `−sign × 800 × plies²/100`
(648 cc at 9) and MF's `(10 − clock) × sign(lead)` with a Texel weight are both steeper.

**Concrete position (fatal 1 restated).** White turn 2 after a Hi sortie to E6, bank 6, spawn area 27. KF's
generator offers `plant_1@…` plans and the mine-only baseline; filter 18 removes the baseline and every plan that
keeps ≥ 3. The engine buys a Muju (bank 1) or two Hi (bank 0) every single turn from here on — the depth-economy
study's "mean final cash 0.4–0.6 crystals" scripted-bot behaviour (LH §4.5), which SU §1.6 rules is exactly what a
strong player avoids.

### 3.3 Verdict

The thesis ("a depth-3 search over an evaluation that knows twelve things beats a depth-6 search over one that
knows none") is a strawman: SF's and MF's evaluations know the same twelve things. What KF actually trades is
2–4 plies of verified lookahead for approach classes, strand-punish, invariant penalties and four hard filters. In a
game with a 3–17-crystal kill swing per turn and a home-occupation win condition, that trade loses, and two of the
four filters are wrong as written. KF would beat the shipped Hard preset (anything with `strikeIfBought` and a kill
table does) but it would not reliably beat the Codex recipes: it cannot bank for the punisher, cannot see a
3-turn invasion, and forces the F3-shaped exit in the position above. Its tables layer and invariant suite are the
best part and must be grafted.

---

## 4. measurement-first

### 4.1 What is strong

- The **gate spine** is what the brief asked for: `npm run hard:verify -- --gate M<n>` executes a command, reads a
  JSON artifact, applies a predicate, writes `lab/results/hard-ai-verify-<date>/M<n>.json`, exits 1 on failure.
  Every gate names its artifact and criterion. This is the only design a verifier agent can run without judgement.
- The **ship gate M9** is the only one in the three that tests the project goal: `Hard-new` vs `AIv2-hard` (the UI
  preset) at `wall:3000`, handicaps 0 **and** 3, seat-mirrored paired seeds, pentanomial SPRT with the LLR formula
  written out, `elo1 = 100`, `adjudicationRate ≤ 0.01`, `illegalActions === 0`, plus all five suites ≥ baseline.
  M10 adds the phone profile vs `AIv2-medium` at `wall:1500` and a p95 latency bound.
- **Adjudication discipline** learned from SU addendum 2 (June mirrors 94–96 % adjudicated; the `material+bank`
  scorer would hand Black 232/235 tied games): every ladder row reports its adjudication share, any cell > 1 % is
  void, `GameRecord v3` records `adjudicationFormula`, `home-checkmate` becomes a rule terminal.
- **Suites score by end-position `Kpos`, never by action sequence** (14,959 sequences for 797 end positions). The
  `spawn-strike` suite is authored from the logged games (NK:10 bought Radi, the archived turn-3 `BUY fire_1@I6`
  raid, NK:13's per-turn fresh-Hi raid, the D9 pivot). The `invariants` suite uses `avoid` lists.
- **Determinism** is checked three ways (three in-process runs, a fresh `node` process, and the WASM-absent JS
  fallback path) plus a static grep forbidding `Date.now|performance.now|Math.random|crypto.randomUUID` under
  `src/ai/hard/`.
- **R13** — a vitest assertion that every constant the engine reads agrees with `src/game/` (`ACTIONS === 4`, total
  ore 504, `MAX_RESOURCE_RESERVE === 16`, `UPKEEP_BY_TIER`, `INACTIVITY_LIMIT === 10`, prices 3/3/4/4/5/5). The
  `lab/solver/model.ts:23 ACTIONS = 6` leak is the kind of bug this catches.
- The **home-prover replica** in packed form (M6b) with the gate-preservation proof ("the gated prover produces the
  identical game result as ungated on 100,000 fuzz actions") and the clock-vs-checkmate fixture (SU §8.1 / EG G22).
- The must-answer layer includes the **home race with purchases** (SU 20b) and searches the upkeep keep-set as a real
  root branch (EG G5) rather than a static rank.
- `elementCoverage` (do I own, or can I buy, a unit that one-shots their most common DEF-3/4 body) is a cheap and
  correct term given SU §3.4.2 ("a player whose army has no fire/lightning cannot punish a Muju wall except with
  Karanlık").
- M3 measures the whole-turn `useAI` path on the *old* engine first (SPRT "not worse", wall-clock not longer),
  which validates the ladder on a change with a known sign (EG G12: +30…60) before any new engine exists.

### 4.2 Where it plays badly

**Fatal 1 — the purchase generator's hard rejection refuses the only punisher.** `generatePlacePlans` rejects a
plan outright when `spawnAfter === 0 while bank − cost ≥ 3`, where `spawnAfter` is "|legal spawn squares| after
this plan" — i.e. at the end of the Place phase, before any action-phase move vacates a square. Position: White
Muju@A2, Sjor@B1, Muju@B2, Hi@C2 (home anchor), Hi@F5 (forward anchor) whose rectangle is voided by a Black Göl@C3;
White's only legal spawn square is C1; bank 7. The correct turn is `BUY water_1@C1` (bank 3), `END_PLACE`,
`MOVE Hi C2→D2` (1 AP), `MOVE Sjor C1→C2` (1 AP), `ATTACK C3` (Sjor 2 vs shadow, neutral, 2 ≥ DEF 2: kill, 1 AP) —
the blocker dies, the 30-square F5 rectangle returns, C1 is empty again. MF's generator rejects the only plan that
contains the purchase (`spawnAfter = 0`, `bank − cost = 3 ≥ 3`). No other line kills the Göl this turn: the Hi does
1 damage into shadow, and two Mujus cannot both become adjacent within 4 AP. The engine keeps 7 crystals and a
voided anchor — NK:11's recorded loss ("a 3-crystal Hi blocked the rectangle; 16 crystals and 2 rent for zero
purchases"). SF applies the same condition as a *penalty* on the place-plan's ordering score and the plan survives
(with bank 7 and one square there are ≤ 7 place-plans, all inside `maxPlacePlans = 16`). KF's post-turn check
passes because C1 is vacated. The condition must be evaluated on the post-turn position and must be a penalty.

**Serious — the evaluation the ship gate is measured with is unspecified.** M8 delivers "Evaluation v0 (integer,
12 of 28 features, staged)" and M9 (the ship gate) depends on M8, not M11. Which 12 is never stated. A fleet will
pick; the gate will pass or fail on an eval nobody designed. Either name the twelve or move M9 after M11.

**Serious — quiescence with "no income but the boundary is applied" is internally inconsistent.** `search/quiesce.ts`
says "the boundary is applied but the economy features are frozen at the entry values". After the boundary the
state has new banks and reserves (income happened, `mining.ts:18-34`), the material and hanging features read the
real state, and the economy features read a stale snapshot. A tactical turn that walks a miner off a 16-stack to
make a kill shows no income loss inside quiescence; the engine will over-value strike-and-strand raids by its own
miners. SF's stand-pat argument (income is real, quiescence can never claim more than the static eval unless a
forcing line delivers it) is the sound treatment.

**Moderate — no spawn-denial forced injection and no SEE demotion in ordering.** The DFS ordering key gives
`move into the enemy rectangle (denial): 20000 × anchorsVoided`, so denial moves rank high inside a place-plan, but
a denial turn is not guaranteed into the K = 24 set, and ordering does not demote turns that hang material to a
purchase-backed reply. Both are SF one-liners.

**Moderate — implementability friction.** The `Mask` API passes `(m, off)` word offsets everywhere
(`get(m, off, sq)`, `dilate(dst, d, src, s)`); the per-slot `attacked: Uint32Array[MAX_SLOTS*4]` is retained even
though RE §1.7a proves it derivable; M4 bundles packed state, bitboards, Zobrist, make/unmake, tables, fuzz and
bench into one milestone where SF splits it into M2/M3 with five independently testable files. A fleet will spend
longer on M4 than the plan implies.

**Moderate — production is not deterministic.** `profile := fixedWork ? 'lab' : calibrate()`; the UI path polls
`budget.exhausted()` (wall clock). The brief's "deterministic under fixed work" is satisfied in lab mode only. SF's
work rungs make production deterministic per rung at no strength cost; graft them.

### 4.3 Verdict

MF's engine is SF's engine with less search detail, one wrong hard rejection in the purchase generator, an
unspecified v0 evaluation at the ship gate, and an inconsistent quiescence. Its instruments are the best of the
three by a wide margin and the only ones that would tell the project whether it reached its goal. It would beat
the shipped Hard preset and the Codex recipes for the same reasons SF would, minus the position in fatal 1. On
strength alone it trails SF by the width of those defects; on the whole brief it edges SF because SF cannot prove
its own strength claim.

---

## 5. Shared blind spots (must be fixed in the synthesis regardless of base)

1. **Lazy-evaluation margins vs stage-2 magnitudes.** SF (`STAGE1_MARGIN_CC = 300`, stage 2 = economy DP + runway
   with `insolvencyCc` cliff + kill-table durability), KF (300, see §3.2), MF (`LAZY_MARGIN = 250`, stage 3 =
   threats incl. `hanging` up to the value of an Aegirinn). All three assert in a gate that the staged result never
   lands on the wrong side of the window. With cliff terms of 600–1,200 cc that assertion is false. Fix: compute a
   per-position upper bound for the remaining stages from cheap quantities (Σ value of units inside enemy strike
   maps, `[bank + nextIncome < upkeepDue]`, `[area == 0]`) and use it as the margin; keep the gate.
2. **Göl dominance** (§2.2). Keep `shadow_1` whenever an enemy fire/lightning unit lies within 7 and beyond 4 of a
   candidate square, or the square is 0-reserve, or a blocking mission exists.
3. **Purchase-based home race** in the must-answer layer (§2.2 fatal 1). MF/KF have it; SF must add it.
4. **Zero-spawn as a penalty on the post-turn position, never a rejection inside the Place phase** (§3.2 fatal 2,
   §4.2 fatal 1).
5. **The opponent's node uses the same K.** All three cap the opponent's reply set at K (SF 24, MF 24, KF 12/6/4).
   A refutation the generator ranks low is invisible at every depth. The recall instrument must be run on
   *opponent-reply* positions sampled after the engine's own move, not only on root positions, and the reference
   generator must include every `strikeIfBought` witness and every spawn-denial move.
6. **Engine-vs-engine ladder cost.** At 3 s per turn, ~25 turns, two seats, a paired game pair is ~5 minutes; an
   SPRT at `elo1 = 100` needs ~100–300 pairs. The module-global knobs (`elements.ts:45`, `combat.ts:62`,
   `upkeep.ts:8`) force sequential games per process. Every design should shard seeds across processes from M1;
   only MF's ladder section hints at it ("device string recorded"), none plans it.

---

## 6. Best ideas to graft into the synthesis

Base recommendation: **SF's `src/ai/hard/` engine (core, gen, search, eval, verify) + MF's `lab/hard-ai/` spine
and gate table + KF's tables layer additions.** Specifically:

From measurement-first (mandatory):
- the `hard:verify --gate M<n>` runner with a `{id, dependsOn, command, artifact, criterion}` table and per-gate JSON
  artifacts; every gate exits non-zero on failure;
- ship gate M9 verbatim: `Hard-new` vs the UI `AIv2-hard` at `wall:3000`, handicaps 0 and 3, seat-mirrored paired
  seeds, pentanomial SPRT (`elo0 0, elo1 100, α = β = 0.05`), `adjudicationRate ≤ 0.01`, `illegalActions === 0`,
  suites ≥ baseline; and M10's phone gate (`Hard-mobile` vs `AIv2-medium` at `wall:1500`, p95 ≤ 3,000 ms,
  depth-1 ≤ 150 ms);
- adjudication discipline (report the share on every row; void cells > 1 %) and `GameRecord v3` with
  `adjudicationFormula`, `fixedWork`, `engineConfigHash`, `handicap`; `home-checkmate` as a fifth rule terminal;
- suites scored by end-position `Kpos` with `best`/`avoid` lists; the five suites (tactics, spawn-strike, home-mate
  ×2 framings, economy, invariants) authored from the logged games;
- three-way determinism (in-process ×3, fresh process, WASM-absent) plus the static grep;
- the constant-agreement test (R13);
- the packed home-prover replica (`homeVerdict`) with the gate-preservation fuzz (M6b) and the clock-vs-checkmate
  fixture;
- the must-answer home race with purchases and the upkeep keep-set as a searched root branch;
- `elementCoverage` and the three-way bank split (`bankLiquid`/`bankExcess`/`bankConvertible`) so Texel prices the
  bank-vs-bodies ratio (EG G11) instead of a hand-set constant;
- M3 (whole-turn path measured first on the old engine) as the harness's known-sign calibration run.

From knowledge-first (mandatory unless noted):
- `approachTable` with the `retreats` count and the `StrandPunish` feature (SU 20a) as stage-1 terms;
- `blockingSetSize` with the reachability filter (enemy can occupy the square this turn, purchases included), and the
  `spawnMaskWithout/With` what-if primitives for the F11 articulation test;
- `EconDelta = economyDP.stream − pstSum` to prevent stage-1/stage-2 double counting;
- `cornerNeighboursHeld` separated from `plug`;
- the twenty invariants as **penalty features with Texel weights** and the twenty-fixture invariant suite —
  never as `HARD_FILTER_MASK`; delete row 18 as written and restate it as the protocol rule (emit `END_PLACE` only
  when legal);
- the retry-with-filters-off discipline, kept only for the one legitimate hard rule (legality);
- the book format/probe design (canonical rot180 key with negation flag; end-key matching against the live
  generator; header keyed by `handicap`, `mapHash`, `weightsVersion`) — optional, either SF's or KF's works.

From search-first (if MF is chosen as the base instead):
- `WORK_LADDER` / `chooseWork` quantised rungs with an EWMA updated only after a completed search; `targetMs`
  modifiers; wall-clock abort that can only truncate a depth, never alter one;
- the SEE analogue in ordering (opponent kill table with buys on the post-turn position);
- the spawn-denial forced injection; the `turnSignature` killers/counter-moves; `ProofCache` outside the TT;
- `proverMode: 'full' | 'bound' | 'off'` with the admissibility argument;
- C1/C2 canonicalisation with the lethal-attack BFS caveat and the set-equality gate;
- `Catalog` with two power planes under a non-zero combat handicap and `signature` in every cached-table key;
- `hard:deps` layering and the interface declaration tests; the dated-addendum rule for interface changes;
- df-pn scheduled at M11 (after quiescence), not M14.

---

## 7. Fatal flaws (with the position or code fact that demonstrates each)

1. **KF — invariant 18 inverted into a hard filter.** KF §4.10 row 18 / `Inv.WastedEndPlace` in `HARD_FILTER_MASK`
   filters any turn that ends the Place phase while a purchase is affordable; SU §7 #18 says the opposite (emit
   `END_PLACE_PHASE` only when legal, `simulate.ts:118-120`). Effect: the engine can never hold ≥ 3 crystals; its
   own injected mine-only baseline is filtered. Demonstrated on White turn 2 after a Hi sortie (bank 6).
2. **KF — `SpawnZero` hard filter forces the losing exit.** White Muju@A1, Hi@B1, Sjor@A2, bank 8; Black Radi@C1,
   Straumr@E3. `ATTACK C1` and stay ends with `area = 0, bank ≥ 3` → filtered; every surviving turn moves the Hi to
   D1/E1 where the SPD-1 Straumr strikes in 2 moves + attack (F3, NK:11).
3. **KF — depth capped at 3, budget deliberately unused, opponent replies pruned to 12/6/4, no df-pn.** KF §2 timing
   table (~600 ms used of 3 s; "d = 4 only when stable"); `tables/home.ts` has no `forcedHomeWin`. NK:13's
   two-turn pre-positioning and any 3-turn invasion are outside its horizon.
4. **MF — purchase-plan hard rejection at end of Place refuses the only punisher.** White Muju@A2, Sjor@B1, Muju@B2,
   Hi@C2, Hi@F5; Black Göl@C3 voids the F5 rectangle; only spawn square C1; bank 7. `BUY water_1@C1 → Hi C2→D2 →
   Sjor C1→C2 → ATTACK C3` is the only kill; MF rejects the plan (`spawnAfter === 0`, `bank − cost = 3 ≥ 3`).
5. **SF — purchase-based home race not in the must-answer layer and not guaranteed by the generator.** SU addendum:
   archived game White turn 3, `BUY lightning_1@G1 → J10` is a verified `home-checkmate` in 4 actions; SF's root
   layer reuses the existing solver (`kernel.ts:75` never emits `BUY_UNIT`), and `planPurchases` keeps only the top
   `S = 8` squares by a score that gives the 0-reserve, in-strike G1 nothing.
6. **SF — no gate measures the project goal.** M8: `--base ai-v2-hard --cand hard-m8 --work 32000 --elo1 5` compares
   beam candidates (`engine-v2.ts:58`) against class-weighted work units; M10 checks only `illegalActions === 0`.
   No milestone asserts "beats the UI Hard preset at equal wall clock".
7. **All three — staged-evaluation gates are unsatisfiable at the stated margins** (300/300/250 cc against cliff and
   hanging terms of 600–4,000 cc). Either the gate fails or lazy evaluation is silently disabled.

---

## 8. What the synthesis should look like in one paragraph

Take SF's module layout, interfaces, algorithms and milestone granularity as the engine; replace SF's M1 and every
gate command with MF's `hard:verify` spine, ladder, SPRT, suite and determinism specifications, and adopt MF's M9/M10
as the ship gates; add MF's must-answer home race with purchases and packed prover replica; add KF's
`approachTable`/`StrandPunish`, reachability-filtered `blockingSetSize`, `EconDelta`, `cornerNeighboursHeld` and the
twenty invariants as Texel penalty features with their negative-fixture suite; convert every hard filter and
purchase-plan rejection in all three designs into a post-turn penalty; tighten `isTacticalTurn` to kills, home
events and summon-and-strike; fix the Göl dominance rule; run the recall instrument on opponent-reply positions;
compute lazy-eval margins from per-position bounds; shard ladder games across processes from day one. Estimated
strength of that synthesis against the shipped Hard preset at 3 s: the ET step 1–9 range (+450…700 local Elo,
≈ 90–95 % score) is plausible, and MF's M9 is the instrument that turns the estimate into a number.
