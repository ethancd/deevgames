# Gap-fill: are the cited scripted results cap-adjudication artifacts?

**Date:** 2026-09-14. **Question source:** `docs/hard-ai/understand/completeness-critique.md:162-199`
(Gap 3 — "Every scripted-bot win/loss number quoted as strategic evidence may be an artifact of
the harness's cap adjudicator, and nobody reports the adjudication share").

**Scope:** `lab/results/four-actions-2026-09-12` (560 games), `lab/results/alternate-map-2026-09-12`
(2,736 games), `lab/results/depth-economy-2026-09-09` (5,760 games) — 9,056 games — plus, for
contrast, every other game corpus in `lab/results/` (a further ~72,000 records).

Evidence tags: **[verified in code]** = read in the source tree; **[measured]** = recomputed here
from the committed JSONL by re-running the adjudication arithmetic; **[claimed in docs]** = what a
committed document asserts; **[inference]** = my reasoning on top of those.

---

## 0. Bottom line

The hypothesis is **false for all three cited studies and true for the corpus that SU §5.4/§8.2 uses
as their counterweight.**

- **1 of 9,056 games** in the three cited studies ended in `winType:'adjudication'` — 0.011 %
  **[measured]**. Zero in `four-actions`, zero in `alternate-map`, one in `depth-economy`
  (`scripted-C`, run id `C-17-2-1`), and that one game sits in a cell (`Plant1` vs `Plant2`) that no
  hard-ai document quotes. No game in any of the three studies ended in `winType:'draw'` (the
  cap-tie branch) either.
- **Every single W/L/D line that `STRATEGIC_UNDERSTANDING.md` and `understand/lab-harness.md` quote
  from these three studies reproduces exactly from the raw JSONL, and every one of them survives the
  restriction to rule-defined terminals unchanged** — with one small, documented exception that has
  nothing to do with adjudication (`home-checkmate`, §4 below).
- **SU §4.5, §5.1, §5.4, §8.2 and §8.13 all survive** on their September evidence.
- **SU §5.4 / §8.2's June counterweight does not.** `lab/results/e3-first-player` — the "white
  48–53 % across 400-game mirrors" result — is **43.6 % adjudicated** (44.7 % counting cap ties), and its two passive
  cells are **94.0 %** (`AntiRush` mirror) and **96.2 %** (`Balanced` mirror) adjudicated, with mean
  end round 121.0 and 119.1 against a 120-round cap **[measured, and printed verbatim in that
  study's own `summary.csv`]**. Only its `Rush` mirror (400 games, 0 % adjudicated, White 48.25 %) is
  a real game result. The instrument that SU cites *against* a first-player advantage is the one the
  adjudicator ate.
- **Dropping the `+ resources` term changes almost nothing anywhere it has ever fired.** Across all
  16,997 adjudicated games in the whole `lab/results/` tree, the mean bank held by a player at a
  capped terminal is **0.393 crystals** (median 0, p99 2, **max 3**). Re-scoring on
  `onBoardMaterial` alone leaves **16,891 verdicts identical (99.38 %)**, turns **99** into draws
  and produces **7 genuine reversals (0.041 %)** **[measured]**.
- **But the term would be decisive if the cap ever bit in a quiet cell.** In
  `alternate-map/main`, the `Aware:Balanced` vs `Aware:Turtle` cell is material-tied at the last
  sampled round in **158 of 160 games**, and Black holds a median **3-crystal** bank edge; the
  `Aware:Balanced` mirror is tied in **77 of 80** with a median 4-crystal Black edge. Had those
  games hit the cap instead of the inactivity clock, the uncalibrated 1:1 bank term alone would have
  awarded **155/158 and 77/77 to Black** — a 0/0/40 draw line converted into a near-clean Black
  sweep by exactly the quantity `ENGINE_GAPS` G11 calls uncalibrated **[measured, counterfactual]**.

**The mechanism** (and the reason the answer splits so cleanly by date) is
`inactivityRule` **[verified in code + measured]**: every corpus that ran with the ten-quiet-turn
draw **on** has ~0 % adjudication; every corpus that ran with it absent or `'off'` has 9–47 %.
`upkeep-draw-2026-09-08` contains the controlled comparison inside one experiment: the
`inactivity:'off'` arm is 260/960 = **27.1 %** adjudicated, the two `'on'` arms are **0/960** each.

---

## 1. What the runner actually does — verified in code

`lab/harness/runner.ts:169-182`, quoted exactly:

```ts
    // Caps → adjudication
    if (state.turn.turnNumber > options.maxTurns || ply >= options.maxPlies) {
      if (ply >= options.maxPlies) anomalies.push(`ply-cap ${options.maxPlies} hit`);
      const scoreW = onBoardMaterial(state, 'white') + state.players.white.resources;
      const scoreB = onBoardMaterial(state, 'black') + state.players.black.resources;
      if (scoreW === scoreB) {
        winner = null;
        winType = 'draw';
      } else {
        winner = scoreW > scoreB ? 'white' : 'black';
        winType = 'adjudication';
      }
      break;
    }
```

- `onBoardMaterial` is `lab/harness/runner.ts:37-41`: `Σ getUnitDefinition(u.definitionId).cost`
  over the player's surviving units. It is **purchase price**, not any tuned value — the same
  M1 metric `strategy-docs.md:915` records as "J-004: material + stockpile + queue"
  **[verified in code]**.
- So the scored quantity is `purchase-price material + banked crystals`, at 1:1. It ignores upkeep
  liability (`src/game/upkeep.ts`), income rate, remaining reserves, spawn geometry, tempo and
  position. The critique's characterisation is exactly right **[verified in code]**.
- Two branches, not one: a **tie** gives `winType:'draw'` with `winner:null`, a non-tie gives
  `winType:'adjudication'`. Both must be counted when auditing; I counted both **[verified in code]**.
- The cap check runs **third** in the loop's terminal block, after the engine-declared victory check
  (`:150-156`) and `checkVictory` (`:157-167`). An inactivity draw sets `phase:'victory'` inside
  `endTurn` (`src/game/turn.ts:92-101` → `src/game/inactivity.ts:7-11`), so it is consumed by the
  *first* branch and the cap branch is never reached in a game that stalls out
  **[verified in code]**. `INACTIVITY_LIMIT = 10`, `INACTIVITY_WARNING = 7`
  (`src/game/inactivity.ts:3-4`).
- `lab/harness/types.ts:82-90` defines `WinType` with `'adjudication'` documented as
  "turn/ply cap hit; material+stockpile decides" and `'draw'` as "adjudication tie or mutual
  elimination". It omits `'home-checkmate'` and `'timeout'`, which `src/game/types.ts:116` defines
  and `runner.ts:154` assigns verbatim — the staleness `lab-harness.md:1051-1057` (§5.12 item 8)
  already flags **[verified in code]**.
- `lab/harness/summary.ts:63,88,112` accumulates `adjudications` and emits
  `adjudicationRate = adjudications / recs.length`; `summary.ts:179` prints it as `adjud NN%` and
  `summary.ts:138,162` writes it to CSV. It counts **only** `'adjudication'`, not the `'draw'` tie
  branch — a small under-count by construction **[verified in code]**.
- The critique's claim that **no hard-ai document quotes `adjudicationRate` for any cited result**
  is correct: `grep -rn adjud docs/hard-ai/` returns only home-*checkmate* adjudication prose plus
  the critique itself and one incidental "4 adjudicated caps" in `current-ai.md:817`
  **[verified]**.

### `adjudicationRate` for the three cited studies, as `summary.ts` would compute it

| study | games | `adjudication` | `draw` (cap tie) | `adjudicationRate` |
|---|---:|---:|---:|---:|
| `four-actions-2026-09-12` (paired-4 + paired-6) | 560 | **0** | 0 | **0.000** |
| `alternate-map-2026-09-12` (main+routes+routes-deep+ai) | 2,736 | **0** | 0 | **0.000** |
| `depth-economy-2026-09-09` (scripted + sustain, 3 economies) | 5,760 | **1** | 0 | **0.00017** |
| **combined** | **9,056** | **1** | 0 | **0.00011** |

The single non-zero pairing row would be `Plant1 | Plant2` in `scripted-C`: 40 games,
39 `inactivity` + 1 `adjudication` → `adjudicationRate = 0.025` **[measured]**.

---

## 2. `winType` breakdown, per study, from the raw JSONL

All counts recomputed by reading every record and tallying `record.winType`; totals match each
study's own committed `summary.json` where one exists.

### 2.1 `four-actions-2026-09-12` — 560 main games (+32 excluded pilot)

| winType | 6 actions (`paired-6.jsonl.gz`) | 4 actions (`paired-4.jsonl.gz`) |
|---|---:|---:|
| `elimination` | 94 (33.57 %) | 82 (29.29 %) |
| `upkeep-elimination` | 92 (32.86 %) | 98 (35.00 %) |
| `inactivity` | 57 (20.36 %) | 66 (23.57 %) |
| `home-occupation` | 37 (13.21 %) | 34 (12.14 %) |
| `home-checkmate` | 0 | 0 |
| **`adjudication`** | **0** | **0** |
| **`draw`** | **0** | **0** |
| `invariant-violation` | 0 | 0 |
| n | 280 | 280 |

Headroom: the longest 6-action game ran **69 rounds / 880 plies**, the longest 4-action game
**78 rounds / 865 plies**, against `maxTurns:120` / `maxPlies:8000`. Zero `anomalies` strings, so
no ply-cap warning was ever pushed **[measured]**. Pilot files (`pilot-4`, `pilot-6`, 16 each,
excluded from the study) are also 0 adjudication.

This matches the committed `four-actions-2026-09-12/summary.json`, which already reports
`"caps": 0, "invalid": 0` at the overall level **and per matchup cell** **[data]**, and the study's
declared policy, `lab/experiments/four-actions/run.ts:30`:
`capPolicy: 'Caps are recorded as unresolved, regardless of harness adjudication.'`
`lab/experiments/four-actions/README.md:9` says the same in prose **[claimed in docs, confirmed]**.

### 2.2 `alternate-map-2026-09-12` — 2,736 games (+33 excluded pilot)

| winType | main (1,280) | routes (960) | routes-deep (480) | ai (16) | total 2,736 |
|---|---:|---:|---:|---:|---:|
| `inactivity` | 760 | 368 | 185 | 4 | 1,317 |
| `elimination` | 309 | 351 | 190 | 7 | 857 |
| `upkeep-elimination` | 133 | 98 | 37 | 1 | 269 |
| `home-checkmate` | 59 | 98 | 52 | 3 | 212 |
| `home-occupation` | 19 | 45 | 16 | 1 | 81 |
| **`adjudication`** | **0** | **0** | **0** | **0** | **0** |
| **`draw`** | 0 | 0 | 0 | 0 | 0 |

Main screen by map (320 games each) — reproduces `summary.json`'s `reasons` blocks byte-for-byte:

| map | elim | upkeep-elim | home-occ | home-checkmate | inactivity | adjudication |
|---|---:|---:|---:|---:|---:|---:|
| current | 66 | 35 | 4 | **19** | 196 | **0** |
| alternate | 87 | 31 | 4 | 8 | 190 | **0** |
| homeExpansionOnly | 78 | 34 | 4 | 16 | 188 | **0** |
| centerOnly | 78 | 33 | 7 | 16 | 186 | **0** |

Longest game: **85 rounds / 922 plies**. The AI sub-screen ran `maxTurns:80`; its longest game was
44 rounds. `summary.json` already carries `"caps": 0` for all four maps, and
`lab/experiments/alternate-map/README.md:19` states "Caps are unresolved, not adjudicated
victories" **[claimed in docs, confirmed]**.

Note the 212 `home-checkmate` games: a real rule terminal (`src/game/types.ts:116`) that
`WinType` does not list. §4 below handles it.

### 2.3 `depth-economy-2026-09-09` — 5,760 main-screen games

(`final-verification.json` records `"mainScreenGames": 5760` — 3 economies × 2 screens × 960.)

| winType | scripted-A | scripted-B | scripted-C | sustain-A | sustain-B | sustain-C |
|---|---:|---:|---:|---:|---:|---:|
| `inactivity` | 539 | 546 | 610 | 525 | 533 | 596 |
| `elimination` | 252 | 250 | 213 | 250 | 232 | 186 |
| `home-occupation` | 162 | 157 | 129 | 172 | 184 | 150 |
| `upkeep-elimination` | 7 | 7 | 7 | 13 | 11 | 28 |
| **`adjudication`** | 0 | 0 | **1** | 0 | 0 | 0 |
| n | 960 | 960 | 960 | 960 | 960 | 960 |

Also in the directory but outside the 5,760: 288 counterfactual continuations (0 adjudication),
26 production-AI games (0), 2,880 `reserve-v1-diagnostic` games (2 adjudications), 96 origin
records with no `winType`. Directory total 8,954 records, 3 adjudications **[measured]**.

**The one adjudicated game, in full** (`scripted-C`, `C-17-2-1`) **[measured]**:

```
id C-17-2-1  economy C  cell 17  a=Plant1 b=Plant2  aSeat=black  swapped=true  seed 3309946811
cap=true  turns=121 (> maxTurns 120)  plies=1700 (< maxPlies 8000)  winner=black  winType=adjudication
white  Plant2: finalMaterial 61  finalResources 0  unitsKilled 54  unitsLost 56  upkeepPaid 3
black  Plant1: finalMaterial 69  finalResources 0  unitsKilled 56  unitsLost 54  upkeepPaid 0
last materialCurve sample (turn 120): white 64 / black 69, whiteRes 0 / blackRes 0
```

It is a **turn-cap**, not a ply-cap (no `ply-cap` anomaly). Both banks are **0**, so the `+
resources` term contributes literally nothing: `61+0` vs `69+0`. Dropping the term leaves the same
verdict, Black by 8 **[measured]**. It reached 121 rounds precisely *because* it was not quiet —
110 kills kept resetting the ten-turn clock.

The study reported it: `report.py:99` ("The initial screen's sole cap belongs to C and is kept
separate") and `REPORT.md:45,80` carry explicit "Safety cap 0/0/0" and "Safety caps 0/0/1" rows
**[claimed in docs, confirmed]**.

---

## 3. Re-tally of every quoted W/L/D line

Convention, **[verified in code]** from `lab/experiments/four-actions/run.ts:47` and
`lab/experiments/alternate-map/run.ts:36`: `swapped:false` seats bot `a` as White; mirrors skip the
swap and run 20 games. "a/b/d" below is a-wins / b-wins / draws recomputed from `winner` and
`swapped`. The "restricted" column re-tallies over the four terminals the question names.

### 3.1 `lab-harness.md` §4.1 — the four-actions table (`lab-harness.md:606-637`)

| quoted line | doc | recomputed | restricted to rule terminals | status |
|---|---|---|---|---|
| overall 6a: games / mean round / median round / median first kill | 280 / 22.36 / 21 / 1 | 280 / 22.3607 / 21 / 1 | same | ✅ |
| overall 4a | 280 / 27.09 / 22 / 2 | 280 / 27.0857 / 22 / 2 | same | ✅ |
| inactivity draws | 57 (20.36 %) → 66 (23.57 %) | 57 / 66 | same | ✅ |
| eliminations | 94 → 82 | 94 / 82 | same | ✅ |
| upkeep-eliminations | 92 → 98 | 92 / 98 | same | ✅ |
| home occupations | 37 → 34 | 37 / 34 | same | ✅ |
| white wins | 113 → 133 | 113 (of 280; Black 110, D 57) / 133 (Black 81, D 66) | same | ✅ |
| caps / invalid | 0 / 0 | 0 / 0 | — | ✅ |
| `Aware:Rush` vs `Aware:Expand` | 40/0 → 40/0 | 40/0/0 → 40/0/0 | same | ✅ |
| `Aware:Rush` vs `Aware:AntiRush` | 4/0, 90 % inact → 9/0, 77.5 % | 4/0/36 (90.0 %) → 9/0/31 (77.5 %) | same | ✅ |
| `Aware:Balanced` vs `Aware:Turtle` | 21/14, 12.5 % → 16/11, 32.5 % | 21/14/5 (12.5 %) → 16/11/13 (32.5 %) | same | ✅ |
| `Invade:MiningDenial` vs `Guard:AntiRush` | 30/0 → 26/0 | 30/0/10 → 26/0/14 | same | ✅ |
| `Siege:3` vs `Guard:AntiRush` | 24/14 → 12/23 | 24/14/2 → 12/23/5 | same | ✅ |
| `Siege:3` vs `Aware:Rush` | 8/32 → 14/26 | 8/32/0 → 14/26/0 | same | ✅ |
| `Aware:Rush` mirror (20 g) | white 7 → white 18 | 7/10/3 (W 7) → 18/0/2 (W 18, **B 0**) | same | ✅ |
| `Aware:Balanced` mirror (20 g) | 11/8 → 8/11 | 11/8/1 → 8/11/1 | same | ✅ |
| paired end-round change | mean +4.725, median +4; 175 / 92 / 13 | identical (from `summary.json`) | — | ✅ |

**Every 4-action and 6-action cell is 100 % rule-terminal. Nothing changes.**

### 3.2 `lab-harness.md` §4.4 and SU §4.5 — the alternate-map lines

| quoted line | doc | recomputed | restricted | status |
|---|---|---|---|---|
| main W/L/D, current | 93/31/196 | 93/31/196 (W 80 / B 44) | 76/29/196 over 301 (19 `home-checkmate` dropped) | ✅ (see §4) |
| main W/L/D, alternate | 95/35/190 | 95/35/190 (W 83 / B 47) | 87/35/190 over 312 | ✅ |
| main W/L/D, homeExpansionOnly | 95/37/188 | 95/37/188 (W 81 / B 51) | 80/36/188 over 304 | ✅ |
| main W/L/D, centerOnly | 106/28/186 | 106/28/186 (W 87 / B 47) | 92/26/186 over 304 | ✅ |
| median rounds | 12 / 13 / 12.5 / 11 | 12.0 / 13.0 / 12.5 / 11.0 | — | ✅ |
| centre income per game | 17.28 → 31.47 (also 17.58, 28.49) | 17.275 / 31.466 / 17.582 / 28.494 | — | ✅ |
| centre unit-turns | 56.20 → 56.74 (59.23, 53.93) | 56.203 / 56.744 / 59.225 / 53.925 | — | ✅ |
| centre kills | 3.81 / 4.15 / 3.84 / 4.11 | 3.809 / 4.147 / 3.838 / 4.109 | — | ✅ |
| total income | 275.2 / 277.2 / 283.0 / 251.9 | 275.228 / 277.212 / 282.981 / 251.903 | — | ✅ |
| **H3: D5 anchor vs Rush "0 wins / 37 losses / 3 draws on both maps"** | 0/37/3 | current **0/37/3**, alternate **0/37/3** | **0/37/3** both (0 `home-checkmate`) | ✅ **exact** |
| H3: D5 vs Balanced 9/40 (current), 8/40 (alternate) | 9 / 8 | 9/0/31 and 8/0/32 | identical | ✅ |
| H3: B4 shelf vs Balanced 23 and 25 | 23 / 25 | 23/0/17 and 25/0/15 | 22/0/17 and 24/0/15 (1 checkmate each) | ✅ |
| **H3: E5/F5 "0 wins, 69 losses, 11 draws in 80 alternate-map games vs Rush"** | 0/69/11 | CenterDeep 0/34/6 + CenterFork 0/35/5 = **0/69/11 in 80** | **0/68/11** in 79 | ✅ **exact**; the "losses" are 0 % adjudication |
| H4: Rush vs Expand 39/40 → 40/40 | 39 / 40 | 39/0/1 and 40/0/0 | identical | ✅ |
| H4: Rush vs AntiRush 12/0/28 → 13/0/27 | as quoted | 12/0/28 and 13/0/27 | identical | ✅ |
| H4: Balanced vs Turtle 0/0/40 on both maps | 0/0/40 | 0/0/40 on **all four** maps | identical | ✅ |
| H5: `Siege:3` vs Rush 13/40 → 8/40 | 13 / 8 | 13/27/0 and 8/32/0 | 13 / 8 unchanged | ✅ |
| **Rush mirror White 15/20, Black 0/20, 5 draws "on both maps"** | 15/0/5 | current **15/0/5**, alternate **15/0/5** | identical — winTypes are **15 `elimination` + 5 `inactivity`**, zero adjudication | ✅ **exact** |

(For completeness, the two unquoted maps' Rush mirrors: `homeExpansionOnly` White 13/20 Black 0/20,
`centerOnly` White 16/20 Black 0/20 — Black is 0/80 across all four maps **[measured]**.)

The E5/F5 sentence is the one the critique singled out ("If, say, most of the 69 'losses' were cap
adjudications…"). They are not: all 69 are `elimination` (57), `upkeep-elimination` (11) or `home-checkmate` (1),
and all 11 draws are `inactivity` **[measured]**.

### 3.3 `lab-harness.md` §4.5 — the depth-economy lines

| quoted line | doc | recomputed | status |
|---|---|---|---|
| A/B/C outcomes "250/172/13/525", "232/184/11/533", "186/150/28/596" | as quoted | **exact** on the *sustain* screen | ✅ |
| mean / median rounds 26.5/27.0, 26.2/26.0, 24.3/23.0 | as quoted | 26.5/27.0, 26.2/26.0, 24.3/23.0 | ✅ |
| mean final cash per player 0.6 / 0.6 / 0.4 | as quoted | 0.572 / 0.588 / 0.410 | ✅ |
| natural finishes fall 435 → 364 | 435 / 364 | 250+172+13 = **435**; 186+150+28 = **364** | ✅ |
| inactivity draws rise 54.7 % → 62.1 % | as quoted | 525/960 = 54.69 %, 596/960 = **62.08 %** | ✅ |
| B raised Plant3's wins vs Rush 18/40 → 27/40 | 18 / 27 | sustain-A **18**/21/1, sustain-B **27**/11/2 | ✅ |
| "did not reproduce against invasion (24/40 both)" | 24 / 24 | vs `Invade:LightningRush`: A **24**/12/4, B **24**/13/3 | ✅ |
| Medium AI 2/8, 2/8, 4/8 | as quoted | `REPORT.md:146-150` table; `real-ai.jsonl.gz` = 26 games, 0 adjudication | ✅ |
| initial-screen "Safety caps 0/0/1" | as quoted | scripted-A 0, scripted-B 0, scripted-C **1** | ✅ |

The single adjudicated game affects **no quoted line**: it is in the initial screen (the table
`lab-harness.md` quotes is the *sustain* screen) and in the `Plant1`/`Plant2` cell.

### 3.4 SU §5.1 — the draw-frequency line (`STRATEGIC_UNDERSTANDING.md:474-476`)

| claim | recomputed | status |
|---|---|---|
| "20.4 % → 23.6 % of scripted games (six → four actions)" | 57/280 = **20.357 %**, 66/280 = **23.571 %** — all `inactivity`, 0 adjudication | ✅ |
| "59 % of the alternate-map main screen (190/320)" | alternate map: 190 `inactivity` / 320 = **59.4 %**; current map is 196/320 = 61.3 % | ✅ |
| "55–62 % of depth-economy games" | sustain A/B/C = **54.69 / 55.52 / 62.08 %**; initial screen 56.15 / 56.88 / 63.54 % | ✅ (the band describes the sustain screen; the initial screen's C is 63.5 %) |
| "`Aware:Balanced vs Aware:Turtle` drew 40/40 on both maps" | 0/0/40 on all four maps, all 160 games `inactivity` | ✅ |

**Every draw in all three studies is a rule draw** (`inactivity`), never a cap tie. The `'draw'`
winType never appears.

---

## 4. The one wrinkle: `home-checkmate` is a rule terminal the question's list omits

The question restricts to `elimination`, `upkeep-elimination`, `home-occupation`, `inactivity`.
That list is `WinType` minus the stale entries, and it drops **212 `alternate-map` games** that
ended `home-checkmate` — a *proven* forced home win adjudicated by the 20,000-node prover
(`src/game/homeCheckmate.ts`, `src/game/types.ts:116`), decided by the rules of the game, nothing to
do with the cap **[verified in code]**. `lab/harness/types.ts:82-90` simply never learned about it
(`lab-harness.md:1051-1057`, §5.12 item 8).

Restricting literally therefore *removes legitimate wins* rather than filtering artifacts. The
effect on the quoted lines is small and always on the win column, never on draws:

- main/current 93/31/196 → 76/29/196 (dropping 9 White + 10 Black proven checkmates);
- Shelf-vs-Balanced 23/25 → 22/24; E5+F5 vs Rush 0/69/11 → 0/68/11.

**Recommendation [inference]:** treat `home-checkmate` as a fifth rule terminal and add it to
`WinType`. The audit-relevant partition is
`{rule terminals} = {elimination, upkeep-elimination, home-occupation, home-checkmate, inactivity}`
vs `{artifacts} = {adjudication, draw-by-cap-tie, invariant-violation}`. Under that partition the
three studies are **9,055/9,056 = 99.99 % rule terminals**.

---

## 5. Sensitivity to dropping the `+ resources` term

### 5.1 In the cited studies: no effect at all

There is one game to test, `C-17-2-1`, and both banks are 0. `61 + 0` vs `69 + 0` → Black;
`61` vs `69` → Black. **Zero sensitivity** **[measured]**.

### 5.2 Across every adjudicated game ever recorded in `lab/results/`: 0.62 %

I re-derived each recorded verdict from `players.{white,black}.{finalMaterial, finalResources}`
(plus `finalQueueValue` for the June `muju-lab-game-v1` schema — see §5.4) and then re-scored on
material alone.

| corpus | adjudicated | rule recompute mismatches | same verdict | → draw | **reversal** |
|---|---:|---:|---:|---:|---:|
| `e6-degenerate-probes` | 4,134 | 0 | 4,126 | 6 | **2** |
| `e7-graph-comparison` | 3,108 | 0 | 3,102 | 6 | 0 |
| `map-d-playtests-2026-09-07` | 2,995 | 0 | 2,987 | 7 | **1** |
| `e5-archetype-matrix` | 1,920 | 0 | 1,878 | 38 | **4** |
| `e3-first-player` | 1,220 | 0 | 1,204 | 16 | 0 |
| `e4-mono-matrix` | 1,220 | 0 | 1,200 | 20 | 0 |
| `tier3-cap-2026-09-08` | 759 | 0 | 759 | 0 | 0 |
| `home-victory-2026-09-07` | 712 | 0 | 706 | 6 | 0 |
| `e3-sensitivity` | 402 | 0 | 402 | 0 | 0 |
| `upkeep-draw-2026-09-08` | 260 | 0 | 260 | 0 | 0 |
| `e2-ladder-gates` | 196 | 0 | 196 | 0 | 0 |
| `home-guard-2026-09-07` | 68 | 0 | 68 | 0 | 0 |
| `depth-economy-2026-09-09` | 3 | 0 | 3 | 0 | 0 |
| **total** | **16,997** | **0** | **16,891 (99.38 %)** | **99 (0.58 %)** | **7 (0.041 %)** |

**Why it is inert: banks at a capped terminal are essentially zero.** Over all 33,994 player-sides
of those games: **mean 0.393, median 0, p90 1, p99 2, max 3 crystals** **[measured]**. A game that
runs 120 rounds is a game where both sides have converted every crystal into bodies — the depth-economy
study's own finding ("mean final cash per player is 0.4–0.6 out of 96–197 earned",
`lab-harness.md:962-965`) taken to its limit. The 1:1 pricing is therefore *undetectable* on the
historical corpus: it has never had a meaningful number to price.

### 5.3 The counterfactual where it would matter — and it is a big one

The term is inert only because caps bite in *violent* games. Restrict instead to the quiet cells —
exactly the ones a Hard-AI ladder would run into, and the ones that would hit the cap if the
inactivity clock were off or longer — and the term becomes the entire verdict.

`alternate-map/main`, material at the last white-turn-start sample (which is exactly where the cap
check fires, `runner.ts:170` vs `:185`) **[measured]**:

| cell | games | material **exactly tied** | bank edge | if the cap had decided |
|---|---:|---:|---|---|
| `Aware:Balanced` vs `Aware:Turtle` | 160 | **158** | Black, median **3** (max 7) | **White 0 / Black 155 / draw 3** |
| `Aware:Balanced` mirror | 80 | **77** | Black, median **4** (max 5) | **White 0 / Black 77 / draw 0** |
| `Invade:MiningDenial` vs `Guard:AntiRush` | 160 | 1 | — | — |
| `Aware:InvestT1` vs `Aware:InvestT3` | 160 | 2 | — | — |
| all five aggressive cells | 720 | 0 | — | — |

The actual result of all 240 of those games is `inactivity` (238) or `upkeep-elimination` (2) — i.e.
the 0/0/40 draw lines SU §5.1 quotes. Their mean bank at that sample is **10.7** and **10.2**
crystals per side, twenty-five times the 0.39 seen at real caps. So:

> **[inference, well-supported]** In precisely the positions where the cap adjudicator would be
> asked to break a tie, the `+ resources` term is not a tiebreaker — it is *the whole decision*, and
> it produces a systematic **first-mover penalty**: White, moving first, is always one half-round
> further through its bank, so Black wins the tiebreak in 232 of 235 tied games. If `home-victory`,
> `e3` or `map-d` had been quiet-cell studies rather than violent ones, "White 48–53 %" could have
> been generated by nothing but this artefact.

This is the empirical case for `ENGINE_GAPS` G11 and for LH §5.12 item 12 (nothing scores draw
avoidance), and it is a concrete reason **not** to re-enable cap adjudication for a Hard-AI ladder.

### 5.4 A by-product: the June adjudication rule scored a term the game no longer has

My first recomputation mismatched 672/4,134 `e6-degenerate-probes` verdicts, with the recorded
winner holding *less* material (e.g. White material 6 vs Black 2, winner Black). The June
`muju-lab-game-v1` records carry a `finalQueueValue` field that `muju-lab-game-v2` does not (Black
had 42 there). Adding it makes **all 16,997 verdicts reproduce exactly, zero mismatches**
**[measured]** — confirming `strategy-docs.md:915`'s "J-004: material + stockpile + queue".

**[inference]** The scored quantity has silently changed with the rules (the purchase queue is
gone), and nothing in the harness records which formula produced a given `adjudication`. Any
cross-era comparison of adjudicated win rates is comparing two different metrics.

---

## 6. Verdict on each cited ruling

### SU §4.5 — the centre (`STRATEGIC_UNDERSTANDING.md:449-461`) — **SURVIVES, unqualified**

- "D5 went 0/37/3 vs Rush on both maps" — **exact**, 80/80 rule terminals, 0 adjudication.
- "E5/F5 went 0 wins / 69 losses / 11 draws in 80 games" — **exact**, 79/80 under the strict
  four-name restriction (one proven home checkmate), 0 adjudication.
- "centre income 17.3 → 31.5 without raising occupation 56.2 → 56.7" — exact to three decimals.
- The ruling ("the centre is a mid-game asset for a durable anchor, not an opening") rests on 240
  games in which the losing side was actually eliminated, home-occupied or checkmated. **Not a
  material-plus-cash tiebreak.**

### SU §5.1 — the draw clock (`:465-476`) — **SURVIVES, and is strengthened**

Every draw rate quoted (20.4 %, 23.6 %, 59 %, 55–62 %, 40/40) is an `inactivity` draw under
`INACTIVITY_LIMIT = 10`. **Zero** cap ties. The draw problem is a genuine rules-level property of
the game, not a harness artifact — which makes LH §5.12 item 12 ("a Hard AI that cannot force
progress will draw the majority of its games") *more* serious, not less.

### SU §5.4 and §8.2 — first-player advantage (`:494-506`, `:679-684`) — **the September half survives; the June half does not**

| evidence | adjudication share | status |
|---|---|---|
| "September, four actions: `Aware:Rush` mirror White 15/20, Black 0/20, 5 draws on both maps" | **0 %** (15 eliminations + 5 inactivity draws per map) | ✅ **stands** |
| "and White 18/20 (four-actions)" | **0 %** (18 eliminations + 2 inactivity draws) | ✅ **stands** |
| "`Aware:Balanced` mirror 8/11 and 11/8" | **0 %** | ✅ stands |
| Handicap census (`handicap-census-2026-09-14`) | static index, no games, no cap | ✅ unaffected |
| **"June 2026 (six actions, old rules): white 48–53 % across 400-game mirrors"** | **43.6 % overall; 94.0 % and 96.2 % in two of four cells** | ❌ **largely artifact** |

`lab/results/e3-first-player/summary.csv`, verbatim:

| mirror | games | aWinRate | **adjudicationRate** | meanTurns |
|---|---:|---:|---:|---:|
| `AntiRush` | 200 | 0.4850 | **0.940** | **121.0** |
| `Balanced` | 400 | 0.5150 | **0.963** | **119.1** |
| `Greedy` | 400 | 0.5275 | 0.092 | 34.4 |
| `Rush` | 400 | 0.4825 | **0.000** | 16.2 |

(In a mirror both bots share a name, so `summary.ts:70` always assigns seat `white` to `botA`:
`aWinRate` *is* the White rate, and `aWinsAsWhite == aWins`, `gamesAasBlack == 0` **[verified in
code]**. `games.jsonl` holds each game twice — 2,800 rows for 1,400 games, two distinct `runId`s
— so rates, not counts, are the usable figures **[measured]**.)

So the "48–53 % band" is: one real result (**Rush, 48.25 %, 0 % adjudicated**), one mostly-real
(Greedy, 52.75 %, 9.2 %), and two cells (600 of 1,400 games) whose White rate is 94–96 % the
runner's material-plus-bank score at round 121. Their mean end round is *above* the 120-round cap.

**Revised ruling [inference]:** SU §8.2's ruling — "the advantage is real in racing lines and not
demonstrated in balanced ones" — still stands, but its support changes shape. The September racing
evidence is clean. The "not demonstrated in balanced ones" half is now supported by *one* clean
cell (June `Rush`, which is itself a racing line and found no edge under six actions) and by two
cells that measure the adjudicator. The genuine open question is narrower and sharper: **did the
six-action → four-action change create the White edge, or did the June instrument simply fail to
see it?** June `Rush` (six actions, 400 games, 0 % adjudicated, White 48.25 %) versus September
`Aware:Rush` (four actions, 20 games per map, White 15/20 and 18/20, 0 % adjudicated) is a real,
un-artifacted contradiction that the rules change is the natural explanation for — and it is exactly
what a re-run of E3 under current rules would settle. This strengthens, not weakens,
`lab-harness.md:1047-1050` (gap 4: "the whole measured ladder predates the current rules").

`lab-harness.md:1128-1133` (§5.13) should also carry the adjudication share: as written it presents
the June number as an equal-weight instrument.

### SU §8.13 — the centre ruling — **SURVIVES**, for the same reason as §4.5.

### Also touched: SU §1.5 (upkeep bounds army size)

The critique lists §1.5 too. Its `lab` evidence is the depth-economy upkeep-elimination counts
(13/11/28 of 960) and `upkeep-draw-2026-09-08`. The depth-economy counts are 0 % adjudicated
**[measured]**. `upkeep-draw-2026-09-08`'s `inactivity:'off'`/`upkeep:'off'` control arm is 27.1 %
adjudicated, but the two `'on'` arms it is compared against are 0 % — so the comparison is between
a clean arm and a dirty one **[measured, not previously reported]**.

---

## 7. Where the concern IS live: the pre-inactivity corpora

The critique's worry is well-founded — it is just aimed one generation too late. Full census of
`lab/results/`, by `inactivityRule` as recorded in each game's `options`:

| corpus | games | `inactivityRule` | `adjudication` | `draw` | **share** |
|---|---:|---|---:|---:|---:|
| `map-d-playtests-2026-09-07` | 5,766 | absent | 2,995 | 17 | **52.2 %** |
| `e6-degenerate-probes` | 8,800 | absent | 4,134 | 32 | **47.3 %** |
| `e3-first-player` | 2,800 | absent | 1,220 | 32 | **44.7 %** |
| `e5-archetype-matrix` | 5,200 | absent | 1,920 | 59 | **38.1 %** |
| `home-victory-2026-09-07` | 1,920 | absent | 712 | 6 | **37.4 %** |
| `tier3-cap-2026-09-08` | 2,880 | absent | 759 | 2 | **26.4 %** |
| `e3-sensitivity` | 1,600 | absent | 402 | 6 | **25.5 %** |
| `home-guard-2026-09-07` | 320 | absent | 68 | 1 | **21.6 %** |
| `e7-graph-comparison` | 20,000 | absent | 3,108 | 18 | **15.6 %** |
| `e2-ladder-gates` | 2,000 | absent | 196 | 4 | **10.0 %** |
| `e4-mono-matrix` | 14,400 | absent | 1,220 | 12 | **8.6 %** |
| `upkeep-draw-2026-09-08` | 2,880 | mixed | 260 | 0 | **9.0 %** overall — **27.1 %** in the `off` arm, **0.0 %** in both `on` arms |
| `ai-wasm-2026-09-07` final screen | 16 | absent, `maxTurns 20` | 4 | 0 | **25.0 %** |
| `balance-followup-2026-09-08` | 960 | **on** | 0 | 0 | **0.0 %** |
| `depth-economy-2026-09-09` | 8,954 | **on** | 3 | 0 | **0.03 %** |
| `four-actions-2026-09-12` | 592 | **on** | 0 | 0 | **0.0 %** |
| `alternate-map-2026-09-12` | 2,769 | **on** | 0 | 0 | **0.0 %** |

**[measured]** The split is perfect: `inactivityRule:'on'` ⇒ ≤0.03 %; absent or `'off'` ⇒ 8.6–52.2 %.
`upkeep-draw-2026-09-08` isolates it inside a single experiment with everything else held fixed.

**[verified in code + inference]** The mechanism: with the clock on, a game can only reach round 120
by producing an attack kill at least once every ten player turns (`src/ai/simulate.ts:101` resets
`inactivityPlies` only on a kill (via `progressThisTurn`); `src/game/turn.ts:96-101` resolves the draw inside `endTurn`,
before the next `startTurn`). Stalls now terminate as `inactivity` at round ~12–30 instead of
grinding to the cap. The cap survives only as a genuine safety net — and the single time it fired
in 9,056 games, it fired on a 110-kill slugfest, not a stall.

**Consequences for documents that cite the older corpora [inference]:**

- `lab-harness.md` §4.8 quotes `home-victory-2026-09-07` ("the home objective converted 399 of 960
  games, cut caps 438 → 280") — that study is **37.4 %** adjudicated and its own numbers already
  report caps as a separate column; the "399 conversions" figure is a natural-win count and is safe,
  but any W/L rate from it is not.
- `current-ai.md:817` quotes `ai-wasm-2026-09-07/final-screen` as
  `{games: 16, naturalGames: 12, caps: 4, candidateWins: 12}` — 25 % adjudicated, at `maxTurns 20`.
  It already labels the caps. Dropping the `+ resources` term changes none of those four (banks 0–1;
  material margins 12, 2, 7, 4) **[measured]**.
- `lab/docs/EXPERIMENTS.md:88-89` already warns that "cells dominated by adjudication (e.g. Turtle
  mirrors) measure the adjudication rule as much as the bots". That warning did not propagate into
  `STRATEGIC_UNDERSTANDING.md` §5.4/§8.2 **[verified]**.

---

## 8. What the critique got right, wrong, and what should change

**Right [verified]:**
- The rule is exactly as described (`runner.ts:169-182`), it prices banked crystals 1:1 with
  purchase-price material, and it ignores upkeep, income, reserves and position.
- `summary.ts` computes `adjudicationRate` and **no hard-ai document quotes it**.
- `lab-harness.md:112-113` describes the rule and never applies the caveat to §4.1/§4.4/§4.5.
- The caveat *is* needed — for SU §5.4/§8.2's June evidence, which the critique did not flag.

**Wrong [measured]:**
- "Every scripted-bot win/loss number quoted as strategic evidence **may be** an artifact" — for the
  three studies named, none of them is. 1 adjudication in 9,056 games.
- "If, say, most of the 69 'losses' for E5/F5 anchors were cap adjudications" — none of them were.
- The three source studies each *did* report their cap counts (`four-actions/summary.json` `caps: 0`
  per cell; `alternate-map/summary.json` `caps: 0` per map plus a full `reasons` block;
  `depth-economy/REPORT.md:45,80` "Safety cap(s)" rows), and each declared an explicit
  cap-is-unresolved policy in its runner and README. **The reporting failure is entirely at the
  hard-ai synthesis layer, not in the lab.**

**Actions [inference]:**
1. Add `'home-checkmate'` (and `'timeout'`) to `lab/harness/types.ts:82-90`; add a
   `ruleTerminalRate` alongside `adjudicationRate` in `summary.ts`; count the `'draw'` cap-tie
   branch into the adjudication share, since `summary.ts:88` currently misses it.
2. Quote the adjudication share beside every W/L number a hard-ai document cites. For the three
   September studies that is a one-word footnote ("0 %"); for `e3-first-player` it is the story.
3. Annotate `STRATEGIC_UNDERSTANDING.md` §5.4/§8.2 and `lab-harness.md` §5.13: the June mirrors are
   94–96 % adjudicated in two of four cells.
4. Do **not** re-enable cap adjudication for a Hard-AI ladder without fixing the scoring function
   first (§5.3 shows it would hand quiet cells to Black ~99 % of the time on a 3–4 crystal bank
   edge). Better: leave the ten-turn clock on, report `inactivity` as a draw, and score the ladder
   with draws at ½ — which is what the three September studies already do de facto.
5. Record the adjudication formula version in `GameRecord.options` (§5.4: the June formula included
   a `finalQueueValue` term the game no longer has).

---

## 9. Method and reproduction

Every number tagged **[measured]** comes from reading the committed JSONL directly — no re-running
of games, no modification of any source file.

```
lab/results/four-actions-2026-09-12/{paired-4,paired-6,pilot-4,pilot-6}.jsonl.gz   (592 records)
lab/results/alternate-map-2026-09-12/{main,routes,routes-deep,ai,pilot,ai-pilot}.jsonl (2,769)
lab/results/depth-economy-2026-09-09/{scripted,sustain,counterfactual,
    sustain-counterfactual,origins,sustain-origins}-{A,B,C}.jsonl.gz, real-ai.jsonl.gz,
    reserve-v1-diagnostic/sustain-{A,B,C}.jsonl.gz                                   (8,954)
lab/results/{e2-*,e3-*,e4-*,e5-*,e6-*,e7-*,home-*,map-d-*,tier3-*,upkeep-draw-*,
    balance-followup-*,illegal-probe}/**/*.jsonl                                     (~72,000)
lab/results/ai-wasm-2026-09-07/final-screen/games.json                               (16)
```

Per-game tallies used `record.winType`, `record.winner`, `record.turns`, `record.plies`,
`record.options`, `record.anomalies`, `record.materialCurve` and
`record.players.{white,black}.{bot,finalMaterial,finalResources,finalQueueValue}`.
a/b orientation from `swapped` (`four-actions/run.ts:47`, `alternate-map/run.ts:36`) and `aSeat`
(depth-economy). Adjudication re-scoring: `finalMaterial + finalResources (+ finalQueueValue for
v1)`, which reproduces **all 16,997** recorded verdicts with zero mismatches.

Files read (code): `lab/harness/runner.ts` (whole), `lab/harness/types.ts` (whole),
`lab/harness/summary.ts` (whole), `lab/experiments/four-actions/run.ts`,
`lab/experiments/alternate-map/{run.ts,routes.ts}`, `src/game/inactivity.ts`,
`src/game/turn.ts:88-106`, `src/game/types.ts:105-120`.
Files read (docs): `docs/hard-ai/STRATEGIC_UNDERSTANDING.md` §4.5/§5.1/§5.4/§8.2/§8.13,
`docs/hard-ai/understand/lab-harness.md` §1.3/§4.1/§4.4/§4.5/§5.12-5.13,
`docs/hard-ai/understand/completeness-critique.md` Gap 3,
`docs/hard-ai/ENGINE_GAPS.md` G11,
`lab/results/depth-economy-2026-09-09/REPORT.md`,
`lab/experiments/{four-actions,alternate-map,depth-economy}` READMEs/PLANs,
`lab/docs/EXPERIMENTS.md`, `docs/BALANCE_REVIEW-2026-09-07.md`.
