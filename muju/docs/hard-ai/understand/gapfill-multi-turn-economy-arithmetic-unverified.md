# Gap-fill — every multi-turn economic quantity in STRATEGIC_UNDERSTANDING §1.2–§1.7, re-derived by simulation

Written 2026-09-14 against worktree `/Users/ashkie/src/deevgames-muju-hardai`, branch `claude/muju-hard-ai`
(HEAD `44c41c4`, the uncommitted v2.8 snapshot). All paths relative to `muju/`.

**Method.** Nothing below is hand arithmetic. Every number was produced by driving
`applyAction` (`src/ai/simulate.ts:25`) from `createInitialGameState()` (`src/game/board.ts:203`)
under `node --import tsx`, reading the engine's own `lastIncome`, `lastUpkeep`,
`players[p].resources`, `resourcesGained`, `resourcesUpkeep` and `cells[y][x].resourceLayers`.
Search results marked *exhaustive* enumerate the full legal action set from
`generateAllActions` (`src/ai/moves.ts:73-76`) with transposition dedup on
(turn, phase, actionsRemaining, bank, unit multiset, live reserves).

Evidence labels, as in `STRATEGIC_UNDERSTANDING.md` (SU):

- **[sim]** — produced today by driving the shipped engine. Reproducible from the scripts described in §7.
- **[code]** — read directly out of source, path:line given.
- **[doc]** — asserted in a repo document, quoted as written.
- **[inference]** — my own reasoning on top of the above, flagged as such.

---

## 0. Executive summary — the corrected table

| SU claim | Status | Correct value **[sim]** |
|---|---|---|
| SU:112 stationary-trio income `6,6,6,3,1,1,1,1` | **WRONG** (sums to 25 against 24 crystals) | `6,6,5,3,1,1,1,1` = 24, identical for both seats |
| SU:112 same, as actually playable | **incomplete** | the inactivity draw ends a no-capture game after 10 plies, so only `6,6,5,3,1` = **21** is ever banked |
| SU:113 "Two extra Mujus on the remaining home 8s (C1, A3)" | **WRONG / unreachable as stated** | at game start the *only* spawn square is A1 (0,0). C1 and A3 need a turn-1 reposition first; there are **three** free home 8s, not two |
| SU:113 "48-crystal home cluster supports roughly 12/turn for about four turns" | **WRONG** | best engine-legal home-only series is `5, 8, 13, 15` (avg **10.25**/turn, 41 of 48 in four turns); a trio that never moves gets `6,6,5,3` and strands 24 of 48 forever |
| SU:113 "flat by turn 6–7" | **right for the wrong reason** | the optimal line is flat at turn 6 because the cluster is *empty* (48/48); the lazy line is flat at turn 5 with 24 crystals still in the ground |
| SU:115 "Turn-2 bank of 6 buys … two Hi/Radi (3+3)" | **WRONG without a turn-1 move** | one spawn square ⇒ at most **one** body on turn 2 unless a unit repositions on turn 1 |
| SU:187 "a starting unit can be T2 on turn 2 and T3 on turn 3 (bank 6 −4 +6 = 8, exactly the Aegirinn price, leaving 0)" | **conclusion right for Plant only; every number wrong** | Plant: 6 −4 = 2, **+8** (Sachita mines 5), −1 rent = **9**, −8 = **1 left**, and the unit is **Sachakuna**, not Aegirinn. Water and Fire stall at bank **7** and reach T3 on turn **4** |
| SU:105-108 16-cell spread "Hi 6.46 → … → Sachakuna 13.68" | **arithmetically correct but the wrong model** — it is Σ γ^t over **12** turns with **no rent** | at γ=0.9, H=6, rent charged the order **inverts at the top**: Muju 11.59 > Sachita 9.53 > Sjor/Inyan 8.43 > Mazask 8.27 > **Sachakuna 7.05** > Tanka 5.75 |
| SU:106 "on a 4-cell every miner is worth 3.1–3.6" | **WRONG for 8 of 18 units** | Radi/Umeme/Kimubunga/Göl are 0 or negative; with rent, *every* T2 and T3 unit on a 4 is ≤ +0.28 and most are negative (down to −6.63) |
| SU:186-187 promotion timing ("never on the purchase turn, once per unit per turn") | **verified** | `src/game/promotion.ts:44-58`, `src/game/board.ts:279` |
| SU:159-160 net-income-per-turn table (`3/4/6`, `2/2/2`, `2/1/1`, `0/0/0`, `1/0/−1`, `0/−1/−2`) | **verified exactly** | mining (`src/game/units.ts`) minus `UPKEEP_BY_TIER` (`src/game/upkeep.ts:5`) |
| SU:99-104 depletion schedules table | **verified exactly, all 18 cells** | see §4 take-vectors |
| SU:115 "A Black handicap of 1–2 does nothing; 3 buys a Hi or Radi on turn 1; 4 buys a Sjor/Göl or a promotion" | **verified, but the consequence is missing** | at handicap ≥ 4 Black can promote a **starting** unit on turn 1 → Black's earliest T2 is **turn 1**; White has no turn-1 place phase at any bank |

---

## 1. The engine's turn skeleton (verified, because every number below depends on it)

**[code]** One own turn, in order:

1. `startTurn` (`src/game/turn.ts:19-34`) — home-occupation check, elimination check, then
   `upkeepPending = true`, `actionsRemaining = 4`, `phase = 'place'`. `due = upkeepDue(...)`
   (`src/game/upkeep.ts:14-16`). If `due <= resources` it auto-pays via `completeUpkeep`
   (`turn.ts:33`, `turn.ts:53-57`), recording `lastUpkeep.paid`. **Rent is charged before Place,
   hence before any purchase or promotion that turn** (`turn.ts:30-33`).
2. `finishTurnStart` (`turn.ts:59-64`) → `resetUnitActions` (`board.ts:265-293`), which clears
   `placedThisTurn` and `promotedThisPlacement` (`board.ts:279-280`). This is why a unit bought on
   turn *n* first becomes promotable on turn *n+1*.
3. Place phase: `BUY_UNIT` (tier 1 only — `src/game/building.ts:7-9`) and `PROMOTE_UNIT`, in either
   order, **free of actions** (`src/ai/moves.ts:61-65`, `simulate.ts:118-120`).
4. Action phase: 4 AP of moves/attacks.
5. `endTurn` (`turn.ts:92-104`): `endOfTurnIncome` first (`turn.ts:95` → `mining.ts:18-34`), then the
   inactivity clock (`turn.ts:96-99`), then handoff; `turnNumber` increments only when the next mover
   is White (`turn.ts:102-103`), so White turn *n* and Black turn *n* share the number *n*.

Two structural facts that SU §1.3 does not state and that change the answers:

- **[code]** `createInitialGameState` opens the game in `phase: 'action'` (`board.ts:240`), so
  **White has no Place phase on turn 1 at any bank**. Black's turn 1 arrives through `startTurn`, so
  Black *does* get one whenever `canActInPlacePhase` is true (`turn.ts:141-145`). **[sim]** verified
  for handicaps 0–8: Black's turn-1 phase is `action` at handicap 0–2 and `place` from handicap 3.
- **[code]** `progressThisTurn` is set **only** by a kill (`simulate.ts:101`). Purchases, promotions,
  moves and income do not reset the inactivity clock, and `INACTIVITY_LIMIT = 10`
  (`src/game/inactivity.ts:3,7-10`). **A purely economic game is a draw at the end of Black's turn 5.**

---

## 2. (i) The stationary per-turn income series, both seats

**[sim]** Driving both sides with `END_PLACE_PHASE` / `END_ACTION_PHASE` only, from
`createInitialGameState()`:

| turn | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9+ | Σ |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| White harvest | 6 | 6 | **5** | 3 | 1 | 1 | 1 | 1 | 0 | **24** |
| Black harvest | 6 | 6 | **5** | 3 | 1 | 1 | 1 | 1 | 0 | **24** |

Per-unit takes from the engine's `lastIncome.takes` (White; Black is the exact 180° image):

| turn | Hi B1 (1,0) | Sjor B2 (1,1) | Muju A2 (0,1) | total |
|---|--:|--:|--:|--:|
| 1 | 1 | 2 | 3 | 6 |
| 2 | 1 | 2 | 3 | 6 |
| 3 | 1 | 2 | **2** ← A2 has only 2 left | **5** |
| 4 | 1 | 2 | 0 | 3 |
| 5–8 | 1 | 0 | 0 | 1 |

SU:112 prints `6,6,6,3,1,1,1,1`. The third term is **5**, not 6: the Muju's square A2 starts at 8, is
taken down 3 → 3 → and can only yield **2** on turn 3 (`reserveTake`, `mining.ts:5`). The published
series sums to 25 against the 24 crystals the three occupied home squares actually contain — an
internal contradiction with the same paragraph's "24 crystals". **[sim]** Both seats bank exactly
`resourcesGained = 24` and the three squares finish at 0.

**The series is not fully playable.** **[sim]** With the shipped inactivity rule on (default:
`inactivityRule` is optional and only `'off'` disables it, `inactivity.ts:8`), plies reach 10 at the
end of Black's turn 5 and the game is declared `victoryReason: 'inactivity'` with both banks at 21.
The tail `1,1,1` only exists in a game where someone has been capturing. So:

- **stationary series, unbounded:** `6,6,5,3,1,1,1,1` (Σ 24) **[sim]**
- **stationary series, shipped rules:** `6,6,5,3,1` (Σ 21), then a draw **[sim]**

A Black crystal handicap changes nothing about the series (it is a bank gift, not a board change);
at handicap 3 Black simply ends the same five turns with 24 banked instead of 21 **[sim]**.

---

## 3. (ii) Earliest achievable T2 and T3 per element, handicap 0 and 3

Charging upkeep at the owner's turn start before Place, exactly as `turn.ts:30-33` does.

**[sim]** Exhaustive search over every legal purchase/promotion sequence to turn 5 (8,204 nodes at
handicap 0; 16,250 at handicap 3), with the opponent passing. Results:

### Handicap 0 (identical for White and Black; White is unaffected by any handicap)

| element | earliest T2 | earliest T3 |
|---|--:|--:|
| Fire (Hono / Kagari) | **2** | **4** |
| Water (Straumr / Aegirinn) | **2** | **4** |
| Plant (Sachita / Sachakuna) | **2** | **3** |
| Lightning (Umeme / Kimubunga) | **3** | **4** |
| Shadow (Gölge / Karanlık) | **3** | **4** |
| Metal (Mazask / Tanka) | **3** | **4** |

### Handicap 3 (Black only)

| element | earliest T2 | earliest T3 |
|---|--:|--:|
| Fire | **2** | **3** |
| Water | **2** | **3** |
| Plant | **2** | **3** |
| Lightning | **2** | 4 |
| Shadow | 3 | 4 |
| Metal | 3 | 4 |

### Witness lines (engine-verified, banks are the engine's own) **[sim]**

- **Plant T3 on turn 3, handicap 0** — the one line SU:187 half-saw:
  `t1 income 6` → `t2 promote Muju→Sachita (bank 6−4 = 2)` → `t2 income 8` (Hi 1 + Sjor 2 +
  **Sachita 5**, because A2 still held 5) → bank 10 → `t3 start: auto-rent 1 paid, bank 9` →
  `t3 promote Sachita→Sachakuna (−8), bank 1`.
- **Water T3, handicap 0, turn 4:** `t1 6` → `t2 buy Hi@A1 (bank 3)` → `t2 income 7` → `t3 promote
  Sjor→Straumr (bank 6)` → `t3 income 6` → `t4 promote Straumr→Aegirinn (bank 3)`.
- **Fire T3, handicap 0, turn 4:** same shape, ending `t4 promote Hono→Kagari (bank 3)`.
- **Metal T3, handicap 0, turn 4:** `t2 buy Inyan@A1 (bank 1)` → `t2 income 8` → `t3 promote
  Inyan→Mazask (bank 5)` → `t3 income 8` → `t4 promote Mazask→Tanka (bank 0)`.
- **Black handicap 3, Fire/Water T3 on turn 3:** `t1 buy Hi@J10 (bank 0)` → `t1 income 7` →
  `t2 promote (bank 3)` → `t2 income 7` → `t3 rent 1, bank 9` → `t3 promote to T3 (bank 1)`.
- **Black handicap 3, Lightning T2 on turn 2:** `t1 buy Radi@J10 (bank 0)` → `t1 income 6` →
  `t2 promote Radi→Umeme (bank 2)`. Its T3 still waits until turn 4: bank at t3 start is
  2 + 6 − 1 rent = **7 < 8**.

### Why these are global optima, not just search optima **[inference, from code + sim]**

The exhaustive search above disallows moves. Moves cannot improve any of these, and the argument is
short enough to be checked by eye:

1. **Turn-1 income is exactly 6 for both seats, under every move sequence.** Only the three starting
   units exist (bank 0 ⇒ no purchase; and White has no turn-1 Place phase at all, `board.ts:240`).
   `unitEndOfTurnTake = min(mining, reserve)` (`mining.ts:8-10`), and every square either side can
   reach with 4 AP holds ≥ 3 except the 0-corridors, so the sum is capped at Hi 1 + Sjor 2 + Muju 3 = 6.
   (At handicap ≥ 3 Black may add one body worth ≤ 1 mining — Hi mines 1, Radi 0 — hence ≤ 7.)
2. **T2 needs 4 crystals and a unit that was not placed this turn** (`promotion.ts:44-58`). The
   earliest Place phase is turn 2 for White and turn 1 for Black-with-handicap. Hence T2 ≥ turn 2, and
   ≥ turn 3 for any element you have to buy first (the buy itself is turn 2 at the earliest for White).
3. **T3 needs 8 crystals and a T2 unit that was not promoted this turn.** Hence T3 ≥ turn 3.
4. **T3 on turn 3 at handicap 0 requires turn-2 income ≥ 7.** Bank at t2 start is 6 (fixed by 1);
   the T2 promotion costs 4, leaving 2 — below the 3-crystal cheapest body — so no purchase can
   accompany it, and the player has exactly the three starting units with one promoted. Σ mining is
   then `1 + 2 + 3 = 6` for Fire (Hono mines 1) and for Water (Straumr mines 2), and `1 + 2 + 5 = 8`
   for Plant (Sachita mines 5). Only Plant clears the bar, on any board, after any moves.
   Bank at t3 Place = 2 + 8 − 1 rent = 9 ≥ 8 ✔.
5. Lightning/Shadow/Metal at handicap 0 cannot be bought before turn 2 ⇒ T2 ≥ 3 ⇒ T3 ≥ 4, and 4 is
   attained. At handicap 3 Shadow (4) and Metal (5) are still unaffordable on turn 1 ⇒ same floor.

### Bonus — the handicap threshold nobody wrote down **[sim]**

Because starting units are not `placedThisTurn`, **Black can promote on turn 1 as soon as the handicap
reaches 4**. Verified place-phase option lists at Black's turn 1:

| handicap | Black turn-1 phase | options |
|--:|---|---|
| 0–2 | `action` | — (no place phase) |
| 3 | `place` | BUY fire_1, BUY lightning_1 |
| 4 | `place` | + BUY water_1/shadow_1, **PROMOTE fire_1 / water_1 / plant_1** |
| 5 | `place` | + BUY plant_1/metal_1, PROMOTE … |

Consequent promotion floors **[sim, exhaustive]**: handicap 4 → Fire/Water/Plant T2 on **turn 1**,
all T3s on turn 3 (Metal T3 turn 4); handicap 5 → **Sachakuna on turn 2** (`t1 promote Muju (bank 1)`
→ `t1 income 8` → `t2 rent 1, bank 8` → `t2 promote (bank 0)`), Metal T3 turn 3.
White can never do this at any bank.

---

## 4. (iii) γ = 0.9, H = 6 discounted value of all 18 units on a 4, an 8 and a 16, rent charged

### 4.1 First: what SU §1.2 actually quotes

SU:105-108 says "discounted at γ=0.9 … on a 4-cell every miner is worth 3.1–3.6 … on a 16-cell the
spread is Hi 6.46 → Sjor 10.25 → Muju 11.59 → Tanka 12.38 → Sachita 12.85 → Sachakuna 13.68".

**[sim]** I reproduced those six numbers exactly. The convention is
`Σ_{t=1..12} 0.9^t · take_t`, i.e. **horizon 12, discount index starting at t = 1, and no upkeep at
all** — the formula printed at `docs/hard-ai/understand/engine-techniques.md:1256` with the horizon
from `engine-techniques.md:2206`. SU quotes it as "γ=0.9" without the horizon or the no-rent
assumption, which is what makes the derived ranking misleading.

### 4.2 The requested model

**[sim]** Convention, chosen to match the engine's own timing:

- the unit is put on the square during a Place phase (bought, or promoted onto it);
- `take_t` = the engine's `lastIncome` for that unit at the end of its *t*-th own turn, `t = 1..6`;
- rent is `UPKEEP_BY_TIER[tier]` charged at the **start** of own turns 2…6 (turn 1's rent was already
  settled before the unit existed / before it was promoted — `turn.ts:30-33`), verified against
  `lastUpkeep.paid` in every run;
- `V = Σ_{t=1..6} 0.9^t · (take_t − rent_t)`, same index base as ET §5.4 so the columns are comparable.

`V_hold` is the same with rent charged on all six turns (the value of a unit *already* standing
there, not of putting it there). Take-vectors are the engine's, not a schedule I wrote down.

### 4.3 The corrected table

| unit | tier | mining | rent/turn | takes on 4 | **V(4)** | takes on 8 | **V(8)** | takes on 16 | **V(16)** | ET h12 no-rent (4 / 8 / 16) |
|---|--:|--:|--:|---|--:|---|--:|---|--:|---|
| Hi `fire_1` | 1 | 1 | 0 | 1 1 1 1 0 0 | **3.095** | 1×6 | **4.217** | 1×6 | **4.217** | 3.10 / 5.13 / 6.46 |
| Hono `fire_2` | 2 | 1 | 1 | 1 1 1 1 0 0 | −0.222 | 1×6 | 0.900 | 1×6 | 0.900 | 3.10 / 5.13 / 6.46 |
| Kagari `fire_3` | 3 | 1 | 2 | 1 1 1 1 0 0 | −3.539 | 1×6 | −2.417 | 1×6 | −2.417 | 3.10 / 5.13 / 6.46 |
| Radi `lightning_1` | 1 | 0 | 0 | 0×6 | 0.000 | 0×6 | 0.000 | 0×6 | 0.000 | 0 / 0 / 0 |
| Umeme `lightning_2` | 2 | 0 | 1 | 0×6 | −3.317 | 0×6 | −3.317 | 0×6 | −3.317 | 0 / 0 / 0 |
| Kimubunga `lightning_3` | 3 | 0 | 2 | 0×6 | −6.634 | 0×6 | −6.634 | 0×6 | −6.634 | 0 / 0 / 0 |
| Sjor `water_1` | 1 | 2 | 0 | 2 2 0 0 0 0 | **3.420** | 2 2 2 2 0 0 | **6.190** | 2×6 | **8.434** | 3.42 / 6.19 / 10.25 |
| Straumr `water_2` | 2 | 2 | 1 | 2 2 0 0 0 0 | 0.103 | 2 2 2 2 0 0 | 2.873 | 2×6 | 5.117 | 3.42 / 6.19 / 10.25 |
| Aegirinn `water_3` | 3 | 3 | 2 | 3 1 0 0 0 0 | −3.124 | 3 3 2 0 0 0 | −0.046 | 3 3 3 3 3 1 | 4.954 | 3.51 / 6.59 / 11.59 |
| Göl `shadow_1` | 1 | 0 | 0 | 0×6 | 0.000 | 0×6 | 0.000 | 0×6 | 0.000 | 0 / 0 / 0 |
| Gölge `shadow_2` | 2 | 1 | 1 | 1 1 1 1 0 0 | −0.222 | 1×6 | 0.900 | 1×6 | 0.900 | 3.10 / 5.13 / 6.46 |
| Karanlık `shadow_3` | 3 | 2 | 2 | 2 2 0 0 0 0 | −3.214 | 2 2 2 2 0 0 | −0.444 | 2×6 | 1.800 | 3.42 / 6.19 / 10.25 |
| **Muju `plant_1`** | 1 | 3 | 0 | 3 1 0 0 0 0 | **3.510** | 3 3 2 0 0 0 | **6.588** | 3 3 3 3 3 1 | **11.588** | 3.51 / 6.59 / 11.59 |
| Sachita `plant_2` | 2 | 5 | 1 | 4 0 0 0 0 0 | 0.283 | 5 3 0 0 0 0 | 3.613 | 5 5 5 1 0 0 | **9.534** | 3.60 / 6.93 / 12.85 |
| Sachakuna `plant_3` | 3 | 8 | 2 | 4 0 0 0 0 0 | −3.034 | 8 0 0 0 0 0 | 0.566 | 8 8 0 0 0 0 | **7.046** | 3.60 / 7.20 / **13.68** |
| Inyan `metal_1` | 1 | 2 | 0 | 2 2 0 0 0 0 | **3.420** | 2 2 2 2 0 0 | **6.190** | 2×6 | **8.434** | 3.42 / 6.19 / 10.25 |
| Mazask `metal_2` | 2 | 3 | 1 | 3 1 0 0 0 0 | 0.193 | 3 3 2 0 0 0 | 3.271 | 3 3 3 3 3 1 | 8.271 | 3.51 / 6.59 / 11.59 |
| Tanka `metal_3` | 3 | 4 | 2 | 4 0 0 0 0 0 | −3.034 | 4 4 0 0 0 0 | 0.206 | 4 4 4 4 0 0 | 5.746 | 3.60 / 6.84 / 12.38 |

Rankings at H = 6 with rent (the number that should replace SU:107-108):

- **on a 16:** Muju 11.588 > Sachita 9.534 > Sjor = Inyan 8.434 > Mazask 8.271 > **Sachakuna 7.046**
  > Tanka 5.746 > Straumr 5.117 > Aegirinn 4.954 > Hi 4.217 > Karanlık 1.800 > Hono = Gölge 0.900
  > Radi = Göl 0 > Kagari −2.417 > Umeme −3.317 > Kimubunga −6.634.
- **on an 8:** Muju 6.588 > Sjor = Inyan 6.190 > Hi 4.217 > Sachita 3.613 > Mazask 3.271 >
  Straumr 2.873 > Hono = Gölge 0.900 > Sachakuna 0.566 > Tanka 0.206 > Radi = Göl 0 >
  Aegirinn −0.046 > Karanlık −0.444 > Kagari −2.417 > Umeme −3.317 > Kimubunga −6.634.
- **on a 4:** Muju 3.510 > Sjor = Inyan 3.420 > Hi 3.095 > Sachita 0.283 > Mazask 0.193 >
  Straumr 0.103 > Radi = Göl 0 > Hono = Gölge −0.222 > Sachakuna = Tanka −3.034 > Aegirinn −3.124 >
  Karanlık −3.214 > Umeme −3.317 > Kagari −3.539 > Kimubunga −6.634.

### 4.4 What this changes **[inference]**

1. **SU's headline inverts.** The 16-cell ordering SU quotes puts Sachakuna at the top; under a
   six-turn horizon with rent, **a plain Muju is the best 16-cell miner in the game** and Sachakuna is
   fifth. Sachakuna empties a 16 in two turns and then pays 2/turn to stand on an empty square. The
   ET numbers are not wrong about *lifetime* extraction; they simply never charge rent and run twelve
   turns, which is longer than the average recorded game's economically live phase
   (GR §4.4's harvest series collapses between turns 9 and 13 — **[doc]**).
2. **"On a 4-cell every miner is worth 3.1–3.6" is false for eight of the eighteen units.** Radi,
   Umeme, Kimubunga and Göl mine nothing (`units.ts`: `mining: 0`), so their extraction value is
   exactly 0 or negative. And with rent, *every* tier-2 and tier-3 unit on a 4 is at best +0.283.
3. **Rent is the dominant term at this horizon, not the mining rate.** Over six turns rent costs
   `2 · Σ_{t=2..6} 0.9^t = 6.634` for a tier-3 and `3.317` for a tier-2 — comparable to the whole
   extraction value of an 8-cell. This is the quantitative form of SU:167's "a tier-3 held for the
   rest of a long game costs ~20 crystals of discounted rent"; at γ = 0.9 the infinite-horizon figure
   is `2 · 0.9/0.1 = 18`, and the six-turn figure is 6.63 **[sim, inference]**.
4. **The 3/5/8 climb (SU:190-193, `docs/EXPANSION_ECONOMY-2026-09-13.md:10`) is a tempo purchase, not
   an income purchase.** On a 16, Muju → Sachita → Sachakuna costs 5 + 4 + 8 = 17 crystals and is
   worth 7.046 discounted over six turns; the plain Muju costs 5 and is worth 11.588. It buys the
   crystals **earlier** (8 + 8 in two turns versus 3 a turn for six), which is exactly what matters if
   you need the bank for a spawn-strike reply (SU §1.6) — but it is strictly worse as an income
   engine at this horizon. **[sim]**

---

## 5. (iv) The 48-crystal home cluster

**[code]** White's cluster is A1 B1 C1 A2 B2 A3 = (0,0) (1,0) (2,0) (0,1) (1,1) (0,2), six 8s = 48
(`src/game/resourceMap.ts:7-9`). Starting units occupy B1, B2, A2 (`board.ts:184-191`), so **three**
home 8s are free: **A1, C1 and A3** — SU:113 names only two.

### 5.1 The spawn constraint SU §1.3 omits

**[sim]** `getAllSpawnPositions('white', initialBoard)` returns exactly **one** square: **A1 (0,0)**.
Each anchor's rectangle runs from the start corner to the anchor (`spawning.ts:8-29`), and with
anchors at (1,0), (1,1), (0,1) the union is the 2×2 block x∈[0,1], y∈[0,1], of which three cells are
occupied. Black is the exact image: only J10 (9,9).

Consequences **[sim]**:

- A trio that never moves has **one** spawn square for the whole game (verified turn by turn through
  turn 8), so it can field at most **four** units ever.
- SU:115's "Turn-2 bank of 6 buys … **two Hi/Radi (3+3)**" is not legal on turn 2 from the starting
  position — there is nowhere to put the second one.
- SU:113's "two extra Mujus on the remaining home 8s (C1, A3)" requires spending turn-1 actions to
  extend the rectangle first. The cheapest unlock found: **Hi B1 → C2 → C3** (2 AP, speed 2, and Hi
  loses nothing because it mines 1 on any square), which makes the anchor (2,2) and opens the whole
  3×3 corner: A1, C1, C2, A3, B3 (and B1 behind it). **[sim]**

### 5.2 Measured lines

**[sim]** All four lines driven through `applyAction`; "home" is the drain of the six 48-crystal
squares only, "elsewhere" is the 4-cells in the ring.

| line | t1 | t2 | t3 | t4 | t5 | t6 | Σ gained | home left of 48 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| **L0** trio never moves, never buys | 6 | 6 | 5 | 3 | 1 | 1 | 24 (by t8) | **24** |
| **L1** SU's construction: Mujus on C1 and A3 as early as legal | 6 | 9 | 11 | 8 | 2 | 0 | 36 | 16 |
| **L2** maximal home plant (5 Mujus bought into the 3×3) | 6 | 9 | 14 | 14 | 10 | 3 | 56 | **0** |
| **L2 home-only component** | 5 | 8 | 13 | 13 | 7 | 2 | 48 | 0 |

L1 in full: `t1` Hi B1→C2→C3 (harvest 6); `t2` buy Muju@C1 for 5, bank 10 (harvest 9); `t3` buy
Muju@A3 for 5, bank 16 (harvest 11); then 8, 2, 0, 0, 0. Peak **11**, never 12; 16 of the 48 are
never mined because A1 and B1 are never occupied.

L2 in full: `t1` Hi→C3 (6); `t2` buy Muju@C1 (9); `t3` buy Muju@A1 + Muju@B1, bank 0 (14); `t4` buy
Muju@A3 (14); `t5` buy Muju@C2 (10); `t6` (3) — cluster empty. Total spend 25 crystals on five Mujus,
financed entirely out of the cluster; zero upkeep (all tier 1).

### 5.3 The true ceiling

**[sim]** Exhaustive search (1,981,995 nodes) over every legal Muju purchase and every legal
promotion, conditioned on the Hi→C3 opening and confined to the 3×3 corner, with the opponent passing:

| by end of turn | 1 | 2 | 3 | 4 |
|---|--:|--:|--:|--:|
| max cumulative harvest (all squares) | 6 | 15 | 29 | 48 |
| max per-turn harvest | 6 | 9 | 14 | **19** |
| max cumulative **home-cluster** drain (of 48) | 5 | 13 | 26 | **41** |
| max per-turn **home-cluster** drain | 5 | 8 | 13 | **15** |

Optimal witness: `Hi→C3 | t1=6 | t2 buy Muju@A1 | t2=9 | t3 buy Muju@B1 + Muju@C1 | t3=14 |
t4 buy Muju@C2 + Muju@A3 + promote | t4=19`.

**Verdict on "roughly 12/turn for about four turns":**

- It is **not a level**, it is a steep ramp: the best possible first four home-cluster turns are
  **5, 8, 13, 15**, mean 10.25. Turns 1 and 2 are hard-capped at 6 and 9 total harvest by the bank
  (0 then 6) and by the single spawn square — no strategy escapes them.
- 12 × 4 = 48 would mean draining the **entire** cluster in four turns. The true four-turn maximum is
  **41 of 48** (85 %), and it costs **five Muju purchases plus a promotion** and a turn-1 reposition.
- With the two extra Mujus SU actually specifies (L1), the series is **6, 9, 11, 8** and 16 crystals
  are stranded — the peak is 11, one turn only.
- Without them (L0) the series is **6, 6, 5, 3** and **half the cluster (24 of 48) is never mined at
  all**, because three home 8s are never occupied.
- "Flat by turn 6–7" is right about the *timing* and wrong about the *cause* in both directions: the
  optimal line is flat at turn 6 because the cluster is empty; the lazy line is flat at turn 5 with
  24 crystals still in the ground. And under the shipped inactivity rule none of turn 6 exists in a
  capture-free game anyway.
- **[inference]** The correct one-line replacement: *"The 48-crystal home cluster is a four-to-six
  turn bank that must be unlocked. Turn-1 harvest is 6 and turn-2 harvest is at most 9 no matter what;
  reaching 13–15/turn by turn 3–4 requires a turn-1 reposition to extend the spawn rectangle and about
  25 crystals of Mujus. A side that does neither leaves 24 of its 48 crystals in the ground."*

---

## 6. Corrections to specific SU lines

| line | published text | correction **[sim]** |
|---|---|---|
| SU:105-108 | "discounted at γ=0.9 … 3.1–3.6 … Hi 6.46 → … Sachakuna 13.68" | the convention is Σ_{t=1..12} γ^t with **no rent** (ET §5.4, `engine-techniques.md:1256`, horizon at `:2206`); state the horizon and the no-rent assumption, and add the H=6 rent-charged column, where Muju (11.59) beats Sachakuna (7.05) on a 16 |
| SU:106 | "on a 4-cell **every miner** is worth 3.1–3.6" | true only of the four mining-positive tier-1s; Radi and Göl are 0, and every T2/T3 on a 4 is ≤ 0.283 with rent |
| SU:112 | "yield **6,6,6,3,1,1,1,1** to a trio that never moves" | **6,6,5,3,1,1,1,1**; and only `6,6,5,3,1` is bankable before the inactivity draw |
| SU:113 | "Two extra Mujus on the remaining home 8s (C1, A3)" | there are **three** free home 8s (A1, C1, A3); only A1 is spawnable at the start; C1/A3 need a turn-1 anchor move |
| SU:113 | "add 3+3 for three turns" | correct per-Muju (3,3,2 on a fresh 8) but only from the turn each is actually placed — turn 2 and turn 3 at the earliest, so the combined bonus lands as +3, +6, +5, +2 |
| SU:113 | "supports roughly **12/turn for about four turns**" | best legal home-only series **5, 8, 13, 15** (mean 10.25, 41/48); SU's own construction gives **6, 9, 11, 8** |
| SU:115 | "two Hi/Radi (3+3)" | illegal on turn 2 from the start position (one spawn square) |
| SU:115 | "4 buys a Sjor/Göl or a promotion" | correct, and it means Black's earliest T2 is **turn 1** at handicap ≥ 4 (and Sachakuna on **turn 2** at handicap 5); White has no turn-1 Place phase at any bank |
| SU:186-188 | "a starting unit can be T2 on turn 2 and T3 on turn 3 (bank 6 −4 +6 = 8, exactly the Aegirinn price, leaving 0)" | only Plant: 6 −4 = 2, **+8**, −**1 rent** = 9, −8 = **1 left**, unit is **Sachakuna**. Water/Fire: bank **7** at turn-3 start, T3 **rejected**, earliest T3 **turn 4** |
| SU:190-193 | Plant climb "collects 16 in three harvests for 5+4+8 = 17 crystals and 1 rent during the climb" | verified exactly by `tests/game/expansion-economy.test.ts:7-29` (takes 3, 5, 8; `resourcesUpkeep: 1`) — but the discounted comparison favours the plain Muju 11.588 vs 7.046 at H=6 |

Verified-as-printed (no change needed) **[sim]**: the whole depletion table SU:99-104; the mining-rate
list SU:96-97; the net-income table SU:159-160; `UPKEEP_BY_TIER = {1:0,2:1,3:2}` with the legacy
`4:3` entry (`upkeep.ts:5`); uniform promotion costs 4 and 8 for all six elements
(`promotion.ts:9-23`, checked against all 18 definitions); tier-1 units can never be released
(`upkeep.ts:20,25`); "a promotion's new rent starts next own turn" (`turn.ts:30-33` + `board.ts:279`).

---

## 7. Reproduction

Scripts live in the session scratchpad (`…/scratchpad/mj/`), not in the repo, and import the engine by
absolute path; run from `muju/` with `node --import tsx <script>`:

- `s1.ts` — §2, stationary trio, both seats, handicaps 0 and 3, inactivity on and off.
- `s3.ts` — §4, all 18 definitions × reserves {4, 8, 16}, take- and rent-vectors from the engine,
  H=6 rent-charged value plus the ET h12 no-rent reproduction.
- `s4a.ts` — §5.1, initial spawn sets.
- `s4e.ts` — §5.3, exhaustive conditioned home-cluster search.
- `s5.ts` — §5.2, scripted lines L0–L2.
- `s6.ts` — §6, the SU:187 line, with the engine's own place-phase option list at turn 3.
- `s7.ts` — §3, exhaustive earliest-promotion search with witness paths.
- `s8.ts` — §3 bonus, turn-1 place-phase options by handicap.

Nothing in the repo was modified other than this file and the dated addendum appended to
`docs/hard-ai/STRATEGIC_UNDERSTANDING.md`.
