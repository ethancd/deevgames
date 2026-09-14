# Completeness critique of the Hard AI understanding corpus

Written 2026-09-14 against worktree `/Users/ashkie/src/deevgames-muju-hardai`
(branch `claude/muju-hard-ai`, HEAD `44c41c4`). Paths relative to `muju/` unless absolute.

Reviewed: `docs/hard-ai/STRATEGIC_UNDERSTANDING.md` (SU, 757 lines),
`docs/hard-ai/ENGINE_GAPS.md` (EG, 526 lines) and the six reader maps
(`current-ai.md` 946, `engine-techniques.md` 2207, `game-records.md` 870,
`lab-harness.md` 1161, `napkin-snapshot.md` 732, `rules-engine.md` 1073,
`strategy-docs.md` 946).

Labels: **[verified]** I ran it or read the cited `path:line` in this worktree today ·
**[doc]** asserted in a repo document · **[inference]** my judgement.

No source file was modified. Probe scripts lived in the session scratchpad.

---

## 0. What the corpus already covers well (so the gaps below are read correctly)

Source-coverage audit **[verified]**. I enumerated every markdown, test, experiment,
result directory and source tree under `muju/` and checked citation counts across the
eight hard-ai documents:

- `src/game/**` (22 files, ~2,819 lines) and `src/ai/**` (2,011 lines incl. the WASM
  blob) are cited line-by-line; there is no unread engine file.
- `server/analysis/*` (1,099 lines) — all eight files are described in `game-records.md`
  §5.1–5.6, including `exchange.ts` (42 lines) which is pure accounting.
- `data/rooms.sqlite` holds **zero** rows (`sqlite3 … "select count(*) from rooms"` → 0),
  so `tests/fixtures/codex-claude-2026-09-12.json` really is the only game record.
- The two 2026-09-14 censuses (`lab/results/opening-census-2026-09-14`,
  `lab/results/handicap-census-2026-09-14`, ~250 MB of artifacts) are read, their
  scoring index is quoted (`analyze.mjs:89-91`), and their limits are stated.
- **The 18×18 kill table (SU §3.2) is correct.** I re-derived all 324 cells
  mechanically from `src/game/units.ts` + the pair cycle at `src/game/elements.ts:25-29`
  + `resolveCombat`'s `attackPower >= max(0, DEF − damageTaken)` rule
  (`src/game/combat.ts:117-164`). Every cell, every `K`, every `—` matches SU §3.2,
  including the two bolded surprises (Kagari one-shots Tanka; Karanlık one-shots
  Aegirinn). **[verified]**
- Reach table (SU §2.2), map arithmetic (504 = 18·0 + 54·4 + 20·8 + 8·16; home cluster
  48; pockets 64; central 8s 64; 20 eight-squares), net-income-per-tier table (SU §1.5,
  all 18 entries), promotion costs (4 / 8 for every element) all re-check. **[verified]**

Docs never cited anywhere in the eight hard-ai documents: `AI_ENGINE_PLAN.md`,
`AI_ENGINE_QUESTIONS.md`, `ONLINE.md`, `docs/AI_IMPLEMENTATION_PLAN-2026-09-07.md`,
`docs/ELEGANCE_COMPARISON-2026-09-09.md`, `docs/BALANCE_REVIEW-2026-09-07.md`,
`docs/MAP_*`, `docs/MINING_SIMPLIFICATION`, `docs/TIMED_MCP_IMPLEMENTATION_PROMPT.md`,
`lab/experiments/alternate-map/FOLLOWUP.md`, and the eighteen
`lab/results/**/{comparison,matchups}.md` per-run tables. Most are genuinely superseded
(v1.x balance, tier 4, 308–520-crystal maps). Two are not — see Gap 5.

---

## 1. Gaps, highest severity first

### Gap 1 (HIGH) — Every multi-turn economic number in SU is hand-arithmetic, and at least two of them are wrong

SU's economic model is the spine of EG's top-priority evaluation work (G4 economy DP,
G5 upkeep runway, G11 bank-vs-bodies). Its single-turn numbers are exact. Its
**multi-turn** numbers are tagged `[code arithmetic]` or `[inference from the schedules]`
and were evidently never run through the engine. I ran two of them:

**1a. The stationary home-extraction series is wrong.** `STRATEGIC_UNDERSTANDING.md:112`:

> the three starting squares (24 crystals) yield `6,6,6,3,1,1,1,1` to a trio that never moves

Simulated (`createInitialGameState` → repeatedly end the turn with no moves, via
`src/ai/simulate.ts applyAction`), White's per-turn income is **`6,6,5,3,1`** and the
game then ends `victory inactivity` at the ten-quiet-ply limit. **[verified]** The
printed series also sums to 25, one more than the 24 crystals actually under the trio.
The correct series is `6,6,5,3,1,1,1,1` (Muju 3,3,2 on an 8; Sjor 2,2,2,2; Hi 1×8).

**1b. The "fastest tier-3" claim is off by exactly one upkeep payment.**
`STRATEGIC_UNDERSTANDING.md:187`:

> a starting unit can be T2 on turn 2 and T3 on turn 3 (bank 6 −4 +6 = 8, exactly the
> Aegirinn price, leaving 0) **[code arithmetic]**

Simulated: initial → White t1 end (bank 6) → Black t1 → White t2 place, `PROMOTE_UNIT`
Sjor→Straumr (bank 2) → White t2 end (bank 8) → Black t2 → **White t3 start: bank 7**,
`lastUpkeep = {player:"white", paid:1, released:[], turnNumber:3}`, and
`generateAllActions` offers **2** promotions (the two 4-crystal T1→T2 ones), not the
8-crystal Aegirinn. **[verified]** The arithmetic omits the Straumr's tier-2 rent,
which `src/game/turn.ts:30-33` charges at the owner's turn start *before* Place —
a rule SU itself states correctly two sections earlier (§1.5, §1.7). The earliest
tier-3 for a starting unit is **turn 4**, not turn 3.

Why this matters beyond the two numbers: EG G4/G5 ask for a discounted income/rent DP
(`H = 6`, `γ = 0.9`) and EG §3 puts it in the first evaluation wave. The only worked
examples of that DP in the corpus — the depletion schedules' aggregate behaviour, the
"12/turn for about four turns" home-cluster figure at `:113-115`, the γ-discounted
per-miner values at `:69-71` (Hi 6.46 → Sachakuna 13.68), the "~20 crystals of
discounted rent" for a held tier-3 at `:157` — are all unverified hand-arithmetic of
exactly the kind that just failed twice.

**Research question.** Re-derive every multi-turn economic quantity in SU §1.2–§1.7 by
simulation instead of arithmetic, and publish a corrected table: (i) the stationary
income series for both seats; (ii) the earliest achievable T2/T3 turn per element at
handicap 0 and 3, counting upkeep at turn start; (iii) the γ=0.9, H=6 discounted value
of each of the 18 units placed on a 4, an 8 and a 16, computed against live reserves
with rent charged; (iv) the "48-crystal home cluster supports ~12/turn for four turns"
figure, with and without two extra Mujus on C1/A3.
**Sources:** `src/game/mining.ts:5-34`, `src/game/upkeep.ts:5,14-16`,
`src/game/turn.ts:19-34,92-104`, `src/game/promotion.ts:9-23,44-58`,
`src/ai/simulate.ts:25`, `src/ai/moves.ts:72`, `tests/game/expansion-economy.test.ts:30-45`,
`docs/EXPANSION_ECONOMY-2026-09-13.md`, and `STRATEGIC_UNDERSTANDING.md:99-198`.
Method: drive `applyAction` from `createInitialGameState()` under `node --import tsx`,
exactly as §8.1's home-checkmate check was done.

---

### Gap 2 (HIGH) — Strategic invariant 20 and failure mode F13 rest on a mis-stated, and actively contested, tactical claim

`STRATEGIC_UNDERSTANDING.md:358` (§3.3):

> That last fact is STRATEGY_GUIDE mistake #1 — the winner declined to promote Muju@H2
> to **Sachita on turn 3 to kill the adjacent Sjor**

and `:544` calls it "the free Sachita kill", `:587` lists it as failure **F13 "Free
promotion kill declined"**, and `:665-666` makes it **invariant 20** ("Always check
whether a free promotion enables a kill this turn"). EG cites F13 three more times as
evidence for G1, G3 and G17 (`ENGINE_GAPS.md:62,114,397`).

Two problems, both checkable:

1. **The Sjor was not adjacent.** `game-records.md:356-359` records the verified line as
   `PROMOTE plant_1 → Sachita` (0 AP, bank 10→6), `MOVE Sachita H2 → H5` (**3 AP**,
   speed 1, path H3/H4/H5 clear), `ATTACK H6` (1 AP) — the **whole four-action turn**,
   plus 4 crystals, plus walking the miner off the H2 16-stack. `plant_2` Sachita is
   ATK 1 / DEF 3 / SPD 1 (`src/game/units.ts:172-181`) **[verified]**. Nothing about it
   is "free"; the word "adjacent" is inherited from the winner's own guide and was not
   corrected, although SU §8.7–8.9 correct several other guide errors.
2. **The losing player argued the opposite verdict and the synthesis dropped it.**
   `docs/strategy-guide-codex-vs-claude.md`, ¶"Evaluate exchanges beyond purchase
   prices": *"Promoting the Muju on H2 would have allowed it to reach H5 and kill my
   Sjor on H6. Initially, that looked like an obvious missed capture. But a newly
   purchased Hi could potentially recapture Sachita. Trading a promoted miner for a
   basic water unit was much less appealing once the reply was included."* A fresh Hi
   is 3 crystals and ATK 2 +1 vs plant = 3 ≥ Sachita's DEF 3 — a one-shot recapture
   (confirmed by the §3.2 kill table). So the "mistake" is a 9-crystal promoted miner,
   a whole turn, and a vacated 16-stack, traded for a 4-crystal Sjor, into a
   3-crystal recapture.

This is the corpus's one recorded instance of the exact class of decision EG G1/G3/G17
are meant to fix, and it is currently filed on the side that the only expert commentary
on it rejects. An engine tuned to satisfy invariant 20 as written will take this trade.

**Research question.** Adjudicate the H2-Sachita line: replay the archived fixture to
White turn 3, enumerate the full Black reply (existing units **and** every affordable
purchase from Black's legal spawn set) against Sachita on H5, and report whether the
kill is winning, losing or unclear on material, income and position. Then restate F13
and invariant 20 in whichever form survives — "search promotion-enabled kills" is
defensible; "a declined promotion-kill is a recorded mistake" may not be.
**Sources:** `tests/fixtures/codex-claude-2026-09-12.json` (revisions 4–6),
`docs/hard-ai/understand/game-records.md:340-370`, `docs/STRATEGY_GUIDE-2026-09-12.md`
(mistake #1), `docs/strategy-guide-codex-vs-claude.md` ¶"Evaluate exchanges beyond
purchase prices", `src/game/units.ts:160-193`, `src/game/spawning.ts:98-118`,
`server/analysis/tactics.ts:41-69,272-291`, and
`docs/hard-ai/understand/replay-codex-claude.ts` as the replay harness.

---

### Gap 3 (HIGH) — Every scripted-bot win/loss number quoted as strategic evidence may be an artifact of the harness's cap adjudicator, and nobody reports the adjudication share

SU draws three strategic rulings straight from scripted W/L tallies: §4.5 (centre
anchors: "D5 went 0/37/3 vs Rush", "E5/F5 went 0 wins / 69 losses / 11 draws in 80
games"), §5.4 / §8.2 (first-player advantage: "`Aware:Rush` mirror White **15/20,
Black 0/20**"), §5.1 (draw rates 20–62 %), and §1.5 (upkeep bounds army size).

But `lab/harness/runner.ts:169-182` **[verified]** ends any game that passes
`maxTurns` (80 or 120 in the cited screens) or `maxPlies` by scoring

```
scoreW = onBoardMaterial(state,'white') + state.players.white.resources
```

and awarding `winType:'adjudication'` to the larger. That function prices a **banked
crystal 1:1 with a crystal of purchase price**, ignores upkeep liability, income,
reserves, spawn geometry and position — i.e. it hard-codes precisely the quantity
EG G11 says is uncalibrated, and it systematically rewards the archived *losing*
policy shape (hoard bodies) as much as the winning one (hoard cash). `summary.ts:26,88,112`
computes an `adjudicationRate` per row, so the number exists; **no hard-ai document
quotes it for any cited result.** LH §1 describes the rule (`lab-harness.md:112-113`)
but never applies the caveat to §4.1/§4.4/§4.5's conclusions.

If, say, most of the 69 "losses" for E5/F5 anchors were cap adjudications rather than
eliminations or home wins, SU §4.5's ruling ("the centre is a mid-game asset, not an
opening") and §8.13 rest on a material-plus-cash tiebreak, not on play.

**Research question.** For each result set the synthesis cites — `four-actions-2026-09-12`
(560 games), `alternate-map-2026-09-12` (2,736), `depth-economy-2026-09-09` (5,760) —
report the breakdown of `winType` and re-tally every quoted W/L/D line restricted to
games that ended in a rule-defined terminal (`elimination`, `upkeep-elimination`,
`home-occupation`, `inactivity`). State which of SU §4.5, §5.1, §5.4 and §8.2 survive.
Also check the sensitivity of `adjudication` outcomes to dropping the `+ resources` term.
**Sources:** `lab/harness/runner.ts:160-185`, `lab/harness/types.ts:82-90`,
`lab/harness/summary.ts:26,63,88,112`, the `summary*.json` / `games*.jsonl` under
`lab/results/{four-actions-2026-09-12,alternate-map-2026-09-12,depth-economy-2026-09-09}`,
cross-read with `docs/hard-ai/understand/lab-harness.md` §4.1, §4.4, §4.5, §5.12–5.13.

---

### Gap 4 (MEDIUM-HIGH) — The twenty "strategic invariants" have never been tested for joint satisfiability; several may be vacuous or unsatisfiable on the v2.8 map

SU §7 (`:624-668`) offers 20 hard checks "on the position *after* the engine's candidate
turn", and EG's evaluation plan (G2/G6/G9) treats them as terms and filters. But the
strongest ones are quantified over *purchasable* attackers:

- Invariant 3: no unit worth ≥ 4 crystals on a strike-and-retreat square "for any enemy
  attacker, *including every (spawn square × affordable tier-1) pair and every affordable
  promotion*".
- Invariant 5: never buy a miner onto reserve < 2 × Mining (≥ 6 for a Muju).
- Invariant 19: never mine the centre or a pocket with an undefended DEF-1 unit when the
  enemy has ≥ 3 crystals and a rectangle within kill radius 7–10.

Nobody has computed the resulting *safe set*. A purchased Hi (3 crystals, SPD 2, ATK 2,
+1 into plant/metal) one-shots every plant and metal unit at DEF 3 and reaches
strike-and-retreat depth `d ≤ 4` from any legal enemy spawn square; a Radi (3, SPD 3)
reaches `d ≤ 6`. Against an opponent with a forward anchor, the union of those sets
plausibly covers both pockets and the entire centre — in which case invariants 3, 5 and
19 jointly forbid mining anything except the home cluster, which invariants 1, 2 and 13
forbid turtling on. The corpus contains the hint (SU §4.5's ruling, `napkin-snapshot`
game 3's "−2 crystals per raid, every turn") but never closes the loop.

This is not pedantry: EG's roadmap turns these into hard penalties and generator filters
(G2 hanging-unit term, G6 anchor fragility, G7's "hard penalty for `|spawn(next)| = 0`").
A hard filter with an empty feasible set makes the search return garbage; a soft term
with the wrong sign makes the engine refuse to expand.

**Research question.** For three concrete positions — the initial position, the archived
game at revision 13 (turn ~8), and the census's rank-1 opening `Hi C2 C4 C6 E6` after
Black's best reply — compute for each side the set of board squares that satisfy
invariant 3 (no enemy strike-and-retreat, counting purchases and promotions), the set
satisfying invariant 19, and their intersection with squares of reserve ≥ 6. Report
cardinalities. State which invariants are (a) always satisfiable, (b) satisfiable only
by staying home, (c) empty — and rewrite the empty ones as costs rather than filters.
**Sources:** `STRATEGIC_UNDERSTANDING.md:624-668` and §2.3/§2.5,
`server/analysis/tactics.ts:41-69 damageUpperBound`, `:272-291 approachTable`,
`singleThreats` (existing | promotion | purchase categories),
`server/analysis/geometry.ts:25-50 blockingSet`, `src/game/spawning.ts:8-46,98-118`,
`src/game/movement.ts:226-257`, `lab/results/opening-census-2026-09-14/analysis.json`
(the capture-liability masks, already cross-checked against `singleThreats`).

---

### Gap 5 (MEDIUM) — `AI_ENGINE_PLAN.md` and `AI_ENGINE_QUESTIONS.md` were never read; the Hard AI has no stated product requirements, and one stale "answered" question contradicts the rules

Neither document is cited once in any of the eight hard-ai files **[verified by grep]**,
yet together they are 32 KB of the only *designer-facing* material about the AI:

- `AI_ENGINE_QUESTIONS.md:16-46` marks **"Q1: Resource Stockpile Visibility — ANSWERED:
  HIDDEN"** and Q2/Q3 build a belief-tracking contract on it. `JUDGMENT_LOG.md` J-018
  (2026-09-09) reverses this — *"Banks and income are public; delete
  observation/belief/particle/re-determinization machinery"* — and `engine-v2.ts:82`
  now reads `const observed = state;` **[verified]**. The perfect-information premise
  under every technique in EG (negamax, TT, df-pn) is therefore correct, but it rests on
  a J-log line that no hard-ai document quotes, against a still-checked-in "ANSWERED"
  page that says the opposite. That is exactly the false-confidence failure EG G21 is about.
- Q4–Q12 are **unanswered** and are requirements, not trivia: Q8 "should the AI play fair
  or play to win", Q9 "what should resignation look like" (note `shouldResign` is dead
  code unless `victoryRule === 'elimination'` — `src/ai/evaluation.ts:399`, and the one
  real game ended *by resignation*), Q11 "decision time targets per difficulty", Q12
  "should the AI explain its thinking". EG specifies an engine with no acceptance
  criterion, no stated per-difficulty behaviour contract, and no answer to what Easy and
  Medium become once Hard actually searches.
- `AI_ENGINE_PLAN.md` documents the Phase 1–6 architecture (belief particles,
  RIS-ISMCTS, progressive widening, tactical sharpener) whose fossils are the dead
  surfaces EG G21 lists. Reading it says *which* parts were deliberate and which are
  abandoned scaffolding — cheaper than re-deriving intent from the code.

**Research question.** Read both documents end to end plus `JUDGMENT_LOG.md` J-001–J-020,
and produce: (i) a table of every designer question with its current status (answered by
a J-entry / answered by code / still open), flagging every stale "ANSWERED" that the
rules have since reversed; (ii) the explicit Hard-AI requirement list this implies —
information model, time budget per difficulty, resignation policy, explainability,
determinism — as the acceptance criteria EG §3's roadmap is currently missing.
**Sources:** `AI_ENGINE_QUESTIONS.md` (all), `AI_ENGINE_PLAN.md` (all, esp. §§3.1–3.5,
4.1–4.3, 5.1–5.2, 6.1), `JUDGMENT_LOG.md:23-330`, `AI_ENGINE_README.md`,
`src/ai/types.ts:4-40,73-88`, `src/hooks/useAI.ts:41-64`,
`src/ai/evaluation.ts:395-415`, `docs/hard-ai/understand/current-ai.md` §§4–6.

---

### Gap 6 (MEDIUM) — The online/timed play surface, where every recorded human-level game was actually played, is absent from both synthesis documents

All four napkin losses and the single archived win were played agent-vs-agent through the
online room / MCP surface under a real clock. Neither SU nor EG models it:

- `victoryReason: 'timeout'` is a real terminal produced by `server/rooms.ts:121-140`
  (`this.expire(...)` → `phase:'victory', victoryReason:'timeout'`) **[verified]**;
  `rules-engine.md:52` notes it exists but SU §5–§6 never treat it and EG's terminal
  detection (G22, G13) never mentions it. A Hard AI that plays online can lose on time.
- `src/online/timeControl.ts` (delay + bank) and `server/clockPressure.ts`
  (`projectClockPressure`, per-seat mean bank drain, "turns covered" projection) define a
  *whole-game* time budget. EG G12 / ET §9.4 budget only the local per-turn preset
  (`TURN_BUDGET_MS`, Hard 2,000 ms, `clamp(base × modifiers, 2000, 6000)`). There is no
  model of spending a bank across a 25-round game, which is a different and harder
  problem, and the one the corpus's real games were played under.
- `public/skills/muju-time-awareness/**` and `docs/TIMED_MCP_IMPLEMENTATION_PROMPT.md`
  (staged commits, `commitWhenRemainingMs`, flag-fall as a plain loss, "never regenerate,
  repair, reorder or append actions") define the protocol an engine must satisfy to play
  there. `strategy-docs.md` lists the skill in its corpus table but no document extracts
  a requirement from it.
- `docs/ANALYSIS_TOOLS.md` + `docs/MCP_TOOL_TAPS.md` define the analysis contract whose
  `omittedSections` / `unknown` failure modes produced SU's F15; the analysis API is the
  strongest existing implementation of several EG techniques (approach classification,
  purchase-inclusive threats) and is currently only mined for primitives, not for its
  budget/timeout semantics.

Severity depends on scope: if Hard is browser-local only, this is minor housekeeping.
If Hard is also the engine behind an online seat — which the MCP skill, the room server
and every recorded game imply — then a missing whole-game clock model is a first-class
design hole.

**Research question.** Decide and document the Hard AI's deployment envelope, then
specify the time model for it: is the target `useAI` in the browser worker only, or also
an online seat under `src/online/timeControl.ts`? If the latter, define (i) how a
per-turn budget is drawn from delay + bank given `projectClockPressure`'s pace estimate,
(ii) what the engine does at flag-fall risk (staged fallback batches?), (iii) how
`timeout` enters terminal detection and the evaluation.
**Sources:** `src/online/timeControl.ts` (56 lines), `src/online/staging.ts`,
`server/clockPressure.ts`, `server/rooms.ts:96-145,340-360,395-410,460-550`,
`public/skills/muju-time-awareness/SKILL.md` and `references/staged-play.md`,
`public/skills/muju-hono-tanka/SKILL.md`, `docs/TIMED_MCP_IMPLEMENTATION_PROMPT.md`,
`docs/ANALYSIS_TOOLS.md`, `tests/server/clocks.test.ts`, `tests/server/staging.test.ts`,
`src/hooks/useAI.ts:41-64`, `docs/hard-ai/understand/engine-techniques.md` §9.4.

---

## 2. Smaller items, recorded but not promoted to gaps

- **SU §2.7 overstates ET.** SU says "attacks-before-independent-moves is a **safe**
  canonical ordering" `[code, inference]`; `engine-techniques.md:455-470` is more careful
  (`[I]`, with an explicit "must be validated by asserting that canonical enumeration and
  naive enumeration produce identical *sets* of end positions"). The 797/1,053/14,959
  perft triple makes that test cheap and it has not been run. Fold into EG G20's perft work.
- **`lab/solver/model.ts:23 ACTIONS = 6`** is flagged three times (SU §8.12, EG G3, G20)
  but `lab/results/current-static/current.md` is still quoted for the Tanka frontier in
  SU §3.3. Either re-run the solver at 4 or drop the citation.
- **Handicap census families are single-purchase only** (`census.ts:17-26`: 8 families,
  one buy or one promotion each) and handicaps stop at 4. SU §5.4/§8.2's "3 crystals
  brings the first round to Close" therefore prices no two-unit Black reply. LH states
  the method; SU does not carry the caveat.
- **`lab/experiments/alternate-map/FOLLOWUP.md`** (uncited) explains *why* D5 failed —
  "D5 is the only central 8 inside its own rectangle … E5 opens D5; F5 opens D5, E5 and
  F4" — which is a sharper version of SU §4.5's ruling and worth a sentence there.
- **`checkVictory` is total**: zero units loses regardless of bank
  (`src/game/victory.ts:33-53`, comment at `:4-8` — "Without pieces, a player has no
  anchor for spawning, regardless of their bank"). Neither SU §7 nor EG lists
  "never reduce yourself to one killable unit" as an invariant.
- I verified two of SU's rulings that could have been wrong and were not: own units never
  block spawn rectangles (`spawning.ts:34-46` tests `unit.owner !== player` only, so §8.15
  holds), and `BUY_UNIT` / `PROMOTE_UNIT` are Place-phase-only
  (`src/game/legality.ts:28,33`), so the "promotions inside the Place-phase kill search"
  framing is right.

---

## 3. Verdict

The corpus is unusually complete on *structure* and unusually thin on *validation*. Every
engine file, every rules file, every analysis primitive, both 2026-09-14 censuses and the
single archived game are read and line-cited; the kill table, the reach table, the map
arithmetic and the net-income table all re-derive exactly; the shipped engine's central
finding (MCTS runs 0 iterations in 138/140 decisions) is measured, and EG's 22 gaps are
correctly prioritised behind the two enablers (measurement, then speed). That is enough
to *start* building — a designer can begin G20, G12 and G13 today with no further
research. It is **not** enough to finish the evaluation: the economic model that G4/G5
depend on is hand-arithmetic that fails when simulated (Gap 1), one of the twenty hard
invariants is derived from a mis-read and contested game position (Gap 2), the scripted
evidence behind three strategic rulings may be a cap-adjudicator artifact (Gap 3), and
the invariant set has never been checked for a non-empty feasible region (Gap 4). Those
four are all answerable by single reader passes against code and data already in this
worktree, and none of them threatens the roadmap's ordering — they change what the
evaluation should contain, not what should be built first.
