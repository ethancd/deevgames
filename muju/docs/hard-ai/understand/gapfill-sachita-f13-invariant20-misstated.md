# Gap-fill: the H2→Sachita line, failure mode F13, and strategic invariant 20

**Date:** 2026-09-14 · **Worktree:** `deevgames-muju-hardai` (branch `claude/muju-hard-ai`)
**Question answered:** `docs/hard-ai/understand/completeness-critique.md:112-160` — "Gap 2 (HIGH) —
Strategic invariant 20 and failure mode F13 rest on a mis-stated, and actively contested, tactical claim".

Evidence labels used throughout: **[V]** verified by running the engine in this worktree;
**[D]** claimed in a document (quoted, not endorsed); **[I]** my inference from verified facts.

---

## 0. Verdict, up front

1. **Every criticism in the research question is correct. [V]**
   The Sjor was not adjacent (Manhattan distance 4). The promotion is not free (4 crystals, +1 upkeep/turn
   forever). The line consumes the entire four-action turn. Black's recapture with a fresh 3-crystal Hi is
   real and the engine's own reply prover certifies it (`replyTo` → `proven_possible`).
2. **One criticism is itself wrong. [V]** H2 was **not** a 16-stack in this game. It held **7** crystals at
   the moment of decision (base 10 on the archived map, minus one Muju harvest of 3). The "16" is the
   *current* v2.8 map value and does not apply to a 2026-09-12 fixture.
3. **On the assigned metrics, against the move White actually played: the Sachita line is LOSING on income,
   LOSING on eastern territory, and a WASH on material-plus-bank. [V]** (§4, table in §4.3.)
4. **But the *kill itself* was winning — decisively — and the corpus picked the wrong instrument. [V]**
   A **4-crystal Göl bought at G2** kills the same Sjor in **3 AP**, leaves 1 AP to retreat to H3 with
   **12 retreat squares**, and after it Black has **no capture anywhere on the board**: `replyTo` returns
   `proven_impossible` with `completeness: "complete"`, 15 nodes, zero omitted case classes. The engine's own
   `singleThreats` ranks this line **first** of 7 lethal lines and the Sachita promotion **third**. (§5.)
5. **The largest strategic fact in this position is not the Sjor at all. [V]** White, to move on turn 3 with
   10 crystals and 4 AP, had a **forced immediate win**: `BUY lightning_1@G1` (Radi, 3 crystals) →
   G4 → G7 → G10 → **J10**. `applyAction` returns `phase: 'victory', winner: 'white',
   victoryReason: 'home-checkmate'` on the last move, and `analyzeHomeDefense` proves `mate` by damage bound
   in 0 nodes. The window was exactly one turn wide. (§7.)
6. **Restated F13 and invariant 20 are in §8.** The surviving content is "search purchases *and* promotions
   as kill-enablers, and price the kill against the reply and against the enemy's spawn geometry". The
   surviving *instance* is not "a declined promotion-kill"; it is "a declined **purchase**-kill, and a missed
   home race".

---

## 1. Method and reproduction

All numbers below come from driving the shipped engine over the archived fixture under
`node --import tsx`, the same method `game-records.md §2.3` and `STRATEGIC_UNDERSTANDING.md §8.1` used.
Five probe scripts were added next to `docs/hard-ai/understand/replay-codex-claude.ts`; each is read-only and
writes nothing:

| Script | What it prints |
| --- | --- |
| `docs/hard-ai/understand/gapfill-sachita-probe.ts` | resource grid at White turn 3, the actual rev6/rev7, the Sachita what-ifs, Black's spawn set and every affordable purchase-kill |
| `docs/hard-ai/understand/gapfill-sachita-probe2.ts` | exhaustive enumeration of **every** White turn-3 way to kill the Sjor (≤2 buys × all 13 spawn squares × ±promotion), plus Black's best reply per candidate |
| `docs/hard-ai/understand/gapfill-sachita-probe3.ts` | continuations to the start of White turn 4 with `damageUpperBound` readouts |
| `docs/hard-ai/understand/gapfill-sachita-probe4.ts` | `damageUpperBound` / `singleThreats` / `searchTurn` / `replyTo` verdicts from `server/analysis/tactics.ts` |
| `docs/hard-ai/understand/gapfill-sachita-probe5.ts`, `…probe6.ts`, `…probe7.ts` | the home-checkmate race: BFS table, the verified winning sequence, and how long the window stayed open |

The fixture's `initialState` **is** the position in question: `tests/fixtures/codex-claude-2026-09-12.json`
carries `recordingStart = {revision: 5, turnNumber: 3, player: 'white'}` and an `initialState` with
`turn = {currentPlayer:'white', phase:'place', actionsRemaining:4, turnNumber:3}`. Revisions 2–5 are the
reconstruction commands; **revision 6 is the move under discussion**. **[V]**

---

## 2. The position at White turn 3 (all verified)

```
turn 3 white, place phase, 4 AP
bank      W 10   B 9          resourcesGained  W 15   B 14
income    W 8    B 8          upkeepDue        W 0    B 0
armyValue W 14   B 14         board crystals   467
W: Muju@A2  Muju@H2  Sjor@B2
B: Sjor@H6  Muju@I9  Muju@J9
```
**[V]** (`gapfill-sachita-probe.ts` §1.) Square/coordinate convention: `A1 = (0,0)`, `J10 = (9,9)`;
White's home corner is A1, Black's is J10.

Reserves on the squares that matter, read from `initialState.board.cells` **[V]**:

| Square | Reserve at turn 3 | Note |
| --- | --- | --- |
| **H2** (7,1) | **7** | White's Muju sits here. Base 10 on the archived map, minus one Muju harvest of 3. |
| G2 (6,1) | 10 | where White actually bought a Muju |
| I2 (8,1) | 10 | — |
| **H5** (7,4) | **4** | the square the Sachita must walk to |
| H6 (7,5) | 2 | Black's Sjor |
| A1 / B1 | 10 / 10 | White home cluster |
| I10 / J10 | 10 / 10 | Black home cluster |

**The "16-stack" is a map-version error. [V]** `src/game/resourceMap.ts:6-17` (v2.8, `MAX_RESOURCE_RESERVE = 16`)
puts 16 on H2 and I2 and only 4 on G2. The fixture has G2 = 10 and I2 = 10, i.e. the archived
`PRE_CENTRAL_MAP` where expansions were 10, exactly as `game-records.md:625-638` warns
("the current map is 504 with home squares at 8 (not 10) and expansion squares at 16 (not 10)").
So `completeness-critique.md:129` ("walking the miner off the H2 16-stack") over-states the cost by more than
half; the true cost of vacating H2 is **7 crystals of reserve, yielding 3/turn to a Muju**.

---

## 3. Fact-check of the four contested claims

| Claim | Where | Verdict |
| --- | --- | --- |
| "kill the **adjacent** Sjor" | `STRATEGIC_UNDERSTANDING.md:357-358`, `docs/STRATEGY_GUIDE-2026-09-12.md:82` | **False. [V]** H2 = (7,1), H6 = (7,5); Manhattan distance 4. `MOVE H2→H5` costs **3 AP** (`getMoveCost`, Sachita SPD 1); attacking from H4 is not legal (`isLegalAction` → false). |
| "the **free** Sachita kill" | `STRATEGIC_UNDERSTANDING.md:544-545` | **False. [V]** `getPromotionCost` (`src/game/promotion.ts:9-23`) = `plant_2.cost − plant_1.cost` = 9 − 5 = **4 crystals** (`src/game/units.ts:160,172`); bank 10 → 6. Tier 2 pays **1 crystal/turn upkeep** forever (`src/game/upkeep.ts:5,13`). Only the *action cost of promoting* is zero. |
| line costs the whole turn | `game-records.md:356-360` | **True. [V]** `PROMOTE` 0 AP → `END_PLACE_PHASE` → `MOVE H2→H5` 3 AP → `ATTACK H6` 1 AP. AP left **0**, bank **6**. |
| a fresh 3-crystal Hi one-shots the Sachita | `docs/strategy-guide-codex-vs-claude.md:60`, `completeness-critique.md:137-139` | **True. [V]** `fire_1` ATK 2 (`units.ts:8-17`), +1 vs plant (`elements.ts` `PAIR_ADVANTAGE['fire-lightning'] = 'plant-metal'`), = **3 ≥ Sachita DEF 3**. `replyTo` witness: `+fire_1@I10 → H6, 3+1 AP/3 crystals, dmg 3 vs def 3, kill, retreat 0`, proof `proven_possible`. |
| "walking the miner off the H2 **16**-stack" | `completeness-critique.md:129` | **False for this fixture. [V]** See §2. It is a 7-stack here; 16 is the current-map value. |

---

## 4. The Sachita line, played out to the start of White turn 4

### 4.1 White's turn

Two honest versions (White has 10 crystals; buying costs 0 AP, so a promotion does not preclude a purchase):

* **L1 "bare"** — `PROMOTE unit-white-2-0` (bank 10→6), `END_PLACE_PHASE`, `MOVE H2→H5` (3 AP),
  `ATTACK H6` (1 AP). Sjor removed, 0 AP, 6 crystals left unspent. **[V]**
* **L2 "spend the change"** — the same plus `BUY plant_1@G2` (bank 6→1). Note `END_PLACE_PHASE` becomes
  *illegal* after the second spend because the place phase auto-advances when nothing is affordable
  (`src/ai/simulate.ts:118-120 finishPlacement` / `src/game/turn.ts:141-146 canActInPlacePhase`). **[V]**

State at the start of Black's turn 3 **[V]**:

| | L1 bare | L2 + Muju@G2 | L0 actual (rev 6) |
| --- | --- | --- | --- |
| White army value | 18 | 23 | 23 |
| White bank | 15 | 13 | 14 |
| White projected income | **3** | **6** | **13** |
| White spawn squares | 37 | 36 | 11 |
| Black army value | 10 | 10 | 14 |
| Black bank | 9 | 9 | 9 |
| **Black spawn squares** | **2** (I10, J10) | **2** (I10, J10) | **12** |

Two verified details that the corpus never states:

* **The Sachita's harvest is wasted.** Sachita MINE 5 (`units.ts:172-181`) but H5 holds only **4**;
  `reserveTake` caps the take at the reserve (`mining.ts:5-9`). It harvests 4 once, leaves H5 at **0**, and
  White's projected income for the next turn collapses to **3** in L1. **[V]**
* **Killing the H6 Sjor collapses Black's spawn set from 12 squares to 2.** The Sjor was Black's only
  forward anchor; `getSpawnRectangle(J10, H6)` is the 15-square block x7–9 × y5–9 (`spawning.ts:8-29`).
  Without it Black's anchors are only the Mujus at I9/J9, whose rectangles are 4 and 2 squares, leaving
  **I10 and J10** as the sole legal spawn squares. **[V]**

### 4.2 Black's full reply, enumerated

Black has 9 crystals, 4 AP, and exactly two spawn squares. `getAffordablePurchases(9)` returns all six tier-1
units: Hi 3c, Radi 3c, Sjor 4c, Göl 4c, Muju 5c, Inyan 5c (`building.ts:8-10`). Against **Sachita@H5 (DEF 3)**,
attack powers are **[V]**:

| Purchase | Power vs plant DEF 3 | Fastest kill |
| --- | --- | --- |
| **Hi** (3c, SPD 2) | 2 + 1 = **3 ≥ 3** | **4 AP** — spawn I10 or J10, one `MOVE` to H6 (distance 5, ⌈5/2⌉ = 3 AP), `ATTACK` 1 AP |
| Radi (3c) | 1 + 1 = 2 | cannot one-shot |
| Sjor (4c) | 2 − 1 = 1 | cannot one-shot |
| Göl (4c) | 2 − 1 = 1 | cannot one-shot |
| Muju (5c) | 0 | cannot one-shot |
| Inyan (5c) | 1 + 0 = **1** (metal/plant are the same pair, neutral) | cannot one-shot |
| existing Muju@I9 / Muju@J9 | 0 | never |

`server/analysis/tactics.ts:41-69 damageUpperBound` agrees: against the Sachita it returns exactly **3**
(= DEF 3) for categories `existing+promotion+purchase+combined`. `replyTo` (`tactics.ts:256-270`) returns
**`proven_possible`** with witness `+fire_1@I10 → H6, 3+1 AP/3 crystals, dmg 3 vs def 3, kill, retreat 0`.
**[V]**

One wrinkle the corpus would have missed and that a generator must not: **buy order matters**. If Black buys
the Muju at I10 first, the Hi bought at J10 is boxed in — J10's only neighbours are I10 and J9, both occupied,
and `isLegalAction` rejects every move. The working reply is `BUY fire_1@I10` then `BUY plant_1@J10`. **[V]**

### 4.3 Start of White turn 4 — the comparison that answers the question

`L0` = what White actually played (rev 6) and Black actually answered (rev 7: `BUY plant_1@I10`,
`BUY fire_1@I6`, Hi → I2, kill Muju@H2, retreat I4).
`L2` = the best Sachita line, with Black's best reply (`BUY fire_1@I10`, `BUY plant_1@J10`, Hi → H6, kill H5).
`L3` = the Göl line of §5, with Black's best (purely economic) reply. **[V] all rows**

| at start of White turn 4 | L0 actual | L2 Sachita | L3 Göl |
| --- | --- | --- | --- |
| White army value | 18 | **14** | **23** |
| White bank | 14 | 13 | 12 |
| White value + bank | 32 | 27 | **35** |
| White projected income | **10** | **6** | 9 |
| White units | 4 | 3 | 5 |
| White spawn squares | 11 | 11 | 19 |
| Black army value | 22 | 18 | 19 |
| Black bank | 13 | 11 | 11 |
| Black value + bank | 35 | 29 | **30** |
| Black projected income | 8 | 8 | 9 |
| Black spawn squares | 14 | 11 | **0** |
| (value+bank) differential W−B | −3 | −2 | **+5** |
| White roster | Muju@A1 Muju@G2 Sjor@B2 Sjor@H1 | Muju@A2 Muju@G2 Sjor@B2 | Göl@H3 Muju@A1 Muju@A2 Muju@H2 Sjor@B2 |
| Black roster | Hi@I4 Muju@I10 Muju@I9 Muju@J9 Sjor@H6 | Hi@H6 Muju@I9 Muju@J10 Muju@J9 | Muju@I10 Muju@I9 Muju@J9 Sjor@J10 |

**Answer to the assigned question, in the assigned terms [V + I]:**

* **Material: unclear / a wash.** Value + bank differential is −2 for the Sachita line against −3 for the game
  move. Both lose the H-column miner; the Sachita line loses 4 more crystals of promotion but Black spends 3
  more than it would have. Nothing here justifies calling the declined kill "the losing move of the game".
* **Income: losing, by 4 crystals/turn.** 6 vs 10. Two causes, both verified: the Sachita exhausts the
  4-reserve H5 in one harvest and then mines nothing, and White retains no miner east of G2.
* **Position: losing.** After L2, White has **three** units and no presence east of G2; Black's Hi sits on H6
  and has *restored* the forward anchor the kill destroyed (Black spawn 11 squares again). After L0, White
  still holds Sjor@H1 and Muju@G2 as eastern anchors. The one positional asset the kill bought — Black
  reduced to 2 spawn squares — is handed straight back by the recapture.

**So the losing player's essay (`docs/strategy-guide-codex-vs-claude.md:54-62`) is right and the winner's own
guide (`docs/STRATEGY_GUIDE-2026-09-12.md:82`, mistake #1) is wrong about *this* line.** **[V]**

---

## 5. The kill was right; the instrument was wrong

`server/analysis/tactics.ts:103 singleThreats` on the Sjor@H6 from the turn-3 position, categories
`existing + promotion + purchase`, `lethalOnly`, returns **7 lethal lines, `complete = true`** **[V]**:

```
purchase   +shadow_1@G2 → H5, 2+1 AP/4 crystals, dmg 2 vs def 2, kill, retreat 12   <-- best
purchase   +shadow_1@G2 → G6, 2+1 AP/4 crystals, dmg 2 vs def 2, kill, retreat 12
promotion  unit-white-2-0 → H5, 3+1 AP/4 crystals, dmg 2 vs def 2, kill, retreat 0  <-- the corpus's line
purchase   +shadow_1@H1 → H5, 3+1 AP/4 crystals, kill, retreat 0
purchase   +shadow_1@H1 → G6, 3+1 AP/4 crystals, kill, retreat 0
purchase   +shadow_1@H1 → I6, 3+1 AP/4 crystals, kill, retreat 0
purchase   +shadow_1@G2 → H7, 3+1 AP/4 crystals, kill, retreat 0
```

My own independent exhaustive sweep (`gapfill-sachita-probe2.ts`: every ≤2-purchase combination over all 13
legal White spawn squares, with and without each legal promotion) finds **955 distinct kill plans**, of which
**148 cost 3 AP and 807 cost 4 AP**; the only 3-AP attacker in the whole set is **Göl@G2**, and the only two
attacker *types* that can kill a Sjor at all are **Göl and Sachita**. **[V]** The arithmetic behind that:
Sjor is water DEF 2; `shadow_1` Göl is ATK 2 and shadow/water are in the same pair, hence neutral, hence
2 ≥ 2 (`elements.ts` `ELEMENT_TO_PAIR`); Hi and Radi are *disadvantaged* into water (2−1 = 1, 1−1 = 0);
Muju does 0+1 = 1; Sjor and Inyan kill but at SPD 1 they cannot arrive in 4 AP from a y ≤ 1 spawn square.

### The line

```
BUY shadow_1@G2            4 crystals   0 AP   (bank 10 → 6)
BUY plant_1@A1             5 crystals   0 AP   (bank 6 → 1)   [optional, the miner White wanted anyway]
MOVE Göl G2 → H5                        2 AP   (distance 4, SPD 2)
ATTACK H6                               1 AP   (2 ≥ 2, Sjor removed)
MOVE Göl H5 → H3                        1 AP   (retreat)
```

`replyTo` on that line returns **`proven_impossible`**, `search: {completeness:"complete", nodes:15,
cutoffReason:null, omittedCaseClasses:[]}` — i.e. the analysis server *proves* Black has no capture next turn
with existing units, promotions or purchases. My independent sweep agrees: "NO Black kill is available
anywhere on the board within 4 AP". **[V]**

Why it holds **[V]**: Black's spawn set is I10 and J10 only (the anchor died). The Göl at H3 is 8 squares from
I10; the only units that can one-shot a shadow DEF 2 are Sjor/Göl/Inyan (neutral ATK 2) and Inyan/metal
(1 + 1); the fastest of those is a Göl at SPD 2, needing ⌈7/2⌉ + 1 = 5 AP. White's Muju@H2 (plant DEF 3) is
likewise out of a fresh Hi's reach: I10 → I2 is 8 squares, ⌈8/2⌉ + 1 = 5 AP. In the actual game that same Hi
raid cost only 3 AP **because it was bought at I6**, inside the rectangle the surviving Sjor anchored.

### The real lesson of turn 3

**[I]** The Sjor at H6 was not worth 4 crystals; it was worth 4 crystals **plus a 15-square purchase
rectangle reaching to y = 5**. Removing it is what turns Black's turn-3 raid from a 3-AP spawn-strike into an
impossibility. The corpus's failure table has **F11** for moving *your own* anchor
(`STRATEGIC_UNDERSTANDING.md:585`); it has no entry for failing to kill *theirs*. That is the pattern this
position actually teaches, and it is invisible to any evaluator that prices a Sjor at `unitValue = 4`
(`ENGINE_GAPS.md:407-410`, G18).

---

## 6. What the shipped analysis stack already sees, and what it does not

**[V]** at the turn-3 position, `damageUpperBound(state, Sjor@H6, …)` (`tactics.ts:41-69`) returns:

| categories | bound | Sjor DEF |
| --- | --- | --- |
| `existing` | 1 | 2 |
| `promotion` | 2 | 2 |
| `purchase` | **6** | 2 |
| `combined` | **6** | 2 |

So the *bound* already knows a purchase kills. `singleThreats` already finds and ranks all 7 lines,
cheapest-crystals-then-AP, with retreat counts. **The gap is not in `server/analysis/`; it is that
`src/ai` never calls any of it** — `ENGINE_GAPS.md:110-125` (G3) and `:390-400` (G17) say exactly this, and
this position is a clean confirmation.

**[V] One new defect, worth recording.** `searchTurn(…, objective:'killTarget', categories:['combined'])`
returns the **first** witness its move ordering reaches, not a cost-minimal one. Here its witness is:

```
PROMOTE white_water_1_…chhc5   (Sjor@B2 → Straumr, 4 crystals, irrelevant to the kill)
PROMOTE unit-white-2-0          (Muju@H2 → Sachita, 4 crystals)
MOVE H3, MOVE H4, MOVE H5, ATTACK H6
→ "3+1 AP/8 crystals, dmg 2 vs def 2, kill, retreat 0"
```

**8 crystals and 0 retreat squares for a kill that `singleThreats` does for 4 crystals with 12 retreat
squares.** `tactics.ts:208-216` orders `PROMOTE_UNIT` at 0 and `END_PLACE_PHASE` at −10 but never penalises
spending, and the search stops at the first `score ≥ 1000`. **[I]** Any engine that reuses `searchTurn` as its
tactical override will buy the expensive kill. This belongs under ENGINE_GAPS G3's "MVV-LVA analogue
(`cost / actionsToKill`)" note as a concrete, reproducible instance.

---

## 7. The finding that dwarfs the question: White had a forced win on turn 3

Running `searchTurn` with `objective: 'blockPurchases'` (score = "opponent has zero spawn squares",
`tactics.ts:186-189`) returns `proven_possible` — and the witness ends the game. Reduced to its minimum and
verified action by action through `applyAction` **[V]**:

```
BUY lightning_1@G1        Radi, 3 crystals, SPD 3   (bank 10 → 7)
END_PLACE_PHASE
MOVE G1 → G4              1 AP
MOVE G4 → G7              1 AP
MOVE G7 → G10             1 AP
MOVE G10 → J10            1 AP   → phase=victory  winner=white  victoryReason=home-checkmate
```

G1 → J10 is a BFS distance of exactly **12**, and 4 actions × SPD 3 = 12. **[V]** `F2` and `G2` also work
(distances 12 and 11). `analyzeHomeDefenseEvidence` (`src/game/homeCheckmate.ts:63-171`) returns
`{result:'mate', nodes:0, method:'damage_bound'}`: **[V]**

* Black's spawn set becomes **zero** — the Radi sits on J10, which is inside *every* Black spawn rectangle by
  construction (`spawning.ts:8-29,34-45`), so no purchase is possible; `getAllSpawnPositions('black')` returns
  `[]`. **[V]**
* The only Black unit adjacent to J10 is Muju@J9: plant ATK 0, and lightning beats plant, so
  `calculateAttackPower` = max(0, 0 − 1) = **0** < DEF 1. Promoting it to Sachita gives ATK 1 − 1 = 0.
  Sachakuna (ATK 2 − 1 = 1) would kill, but reaching tier 3 needs 12 crystals and two promotions of the same
  unit in one placement, which `canPromote` forbids (`promotion.ts:44-58`, `promotedThisPlacement`). **[V]**
* Sjor@H6 is 6 squares from the only free neighbour I10 at SPD 1 — 6 AP against a budget of 4. **[V]**

**The window was exactly one turn wide. [V]** (`gapfill-sachita-probe7.ts`.)

```
turn 3 white : BUY Radi@G1 / @F2 / @G2 reaches J10 in 4 AP
turn 4 white : no unit and no purchase reaches it in 4 AP   (Black's rev-7 Muju@I10 seals the approach)
turn 5+      : J10 plugged by a black Muju
```

Black's `BUY plant_1@I10` on turn 3 — bought for economy, not defence — closed the corridor, since J10's only
neighbours are I10 and J9. Black's celebrated turn-4 `Muju@J10` "home insurance"
(`STRATEGY_GUIDE-2026-09-12.md:78`, `game-records.md:365-372`) arrived a turn after the danger had already
passed.

**Caveats I will not paper over. [I]**
* This is verified **under the current engine**. `victoryRule` is `undefined` on the fixture state, and the
  home rules are active unless it equals `'elimination'` (`homeCheckmate.ts:173`, `turn.ts:23`). Whether the
  live 2026-09-12 room adjudicated home occupation this way is **not** verified here; `game-records.md:589-593`
  notes that no archived game ever exercised the home-occupation or home-checkmate paths.
* It does not retroactively change the archived game's result (White won by resignation anyway). It changes
  what the corpus should say the turn-3 *decision* was.
* `STRATEGIC_UNDERSTANDING.md:352-355` already rules "Radi is a positional unit, not a dead one", and §4.4
  records "27 home wins by round 5, 26 of them by Lightning I" under the old six-action rules. Nobody checked
  the one recorded human-ish game for the same pattern. **[I]** The generator's real turn-3 blind spot is a
  **4-action, 3-crystal home race**, not a promotion.

---

## 8. Restating F13 and invariant 20

### 8.1 What does not survive

* The word **"free"**. A promotion costs 4 crystals (tier 2) or 8 (tier 3) and adds 1 or 2 crystals/turn of
  upkeep permanently. Only its *action* cost is zero.
* The word **"adjacent"**.
* The framing **"a declined promotion-kill is a recorded mistake"**. In this, the corpus's only recorded
  instance, taking the promotion-kill is **worse** than the move that was actually played, by 4 income/turn
  and the entire eastern position.
* The pairing of F13 with `ENGINE_GAPS.md:62` (G1, one-reply-deep search) as an example of *"a kill that
  needed the reply to be seen as bad-for-them"*. It is the opposite: the reply shows the kill is bad **for
  us**, which is what G1 actually fixes. The citation at `:114` (G3) and `:397` (G17) survive — but their
  worked instance should be the **purchased Göl**, which G3's "include affordable purchases (start adjacent
  at cost 1, as `server/analysis/tactics.ts:41-69 damageUpperBound` already does)" describes exactly.

### 8.2 F13, restated

> **F13 — Kill search priced without the reply, and scoped to units already on the board.**
> On turn 3 of the archived game White had, in the same position and with the same 10 crystals: a
> 4-crystal **purchase** kill on Black's forward anchor with 1 AP of retreat and a proven-empty reply
> (`+shadow_1@G2 → H5`, `replyTo` = `proven_impossible`, complete); a 4-crystal **promotion** kill that
> consumes all 4 AP, strands a 9-crystal miner on an exhausted square and loses it to a 3-crystal Hi
> (`replyTo` = `proven_possible`); and a 3-crystal **home race** that wins outright
> (`BUY lightning_1@G1 → G4 → G7 → G10 → J10`, `victoryReason: 'home-checkmate'`). The engine took none of
> them: `src/ai` searches no purchases, no promotions and no reply.
> **Detector:** for every enemy unit each turn, a `minActionsToKill(target) → {actions, attackerSet, crystals,
> retreatSquares}` over existing units **plus affordable purchases at every legal spawn square** plus
> affordable promotions; rank by `crystals / actionsToKill`; then run the opponent's one-turn reply
> (purchases included) against the attacker's final square before accepting the line.
> **Evidence:** GR §2.3; `docs/hard-ai/understand/gapfill-sachita-f13-invariant20-misstated.md` §4–§7.

### 8.3 Invariant 20, restated

Replace `STRATEGIC_UNDERSTANDING.md:665-666`:

> 20. **Enumerate purchases and promotions on equal terms inside the kill search, and price every kill three
>     ways before taking it.** A promotion costs 0 AP but 4 (tier 2) or 8 (tier 3) crystals plus 1–2/turn of
>     permanent upkeep; a tier-1 purchase costs 0 AP and 3–5 crystals and starts on any legal spawn square.
>     The three prices are (a) crystals spent, (b) the attacker's value left standing on its final square
>     after the opponent's full reply *including their purchases*, and (c) what the target was anchoring —
>     killing the enemy's only forward anchor is worth its spawn rectangle, not its `unitValue`.
>     **[F13, G3, G17, G18]**

And add the two rules this position actually demands:

> 20a. **Never end a turn with a unit worth ≥ 2× the target on a square a single affordable enemy tier-1
>      purchase can reach.** Sachita (9) parked on H5 with 0 AP dies to a 3-crystal Hi from Black's home
>      corner in exactly 4 AP. Prefer the kill line that leaves retreat squares: `singleThreats` already
>      reports `retreat N` per line (`server/analysis/tactics.ts:234-246`); treat `retreat 0` as a hard
>      penalty, not a tiebreak. **[F13, F7, F10]**
>
> 20b. **Before anything else on a turn, test the home race.** For each affordable tier-1 unit and each legal
>      spawn square, `getMoveCost(spawn, enemyCorner, speed, board) ≤ actionsRemaining` — a 3-crystal Radi
>      covers 12 squares in 4 actions and an occupied corner blocks *every* enemy spawn rectangle, so the
>      defence prover usually returns `mate` by damage bound alone. The archived game's turn 3 was a one-turn
>      forced win nobody saw. **[new; §7]**

### 8.4 What survives unchanged

* `STRATEGIC_UNDERSTANDING.md:356` — "Sachita kills a Sjor or Göl alone (1 + 1 = 2 ≥ 2)". **[V]** True.
* The general instruction to include promotions in the Place-phase kill search. **[V]** Still right; it was
  simply never the binding constraint in the one example used to justify it.
* `ENGINE_GAPS.md:114-125` (G3) and `:390-400` (G17). **[V]** Confirmed by this position, with a better
  worked instance.
* `STRATEGIC_UNDERSTANDING.md:544-545` "Do not promote" as turn-3 advice. **[V]** Confirmed — and the
  "one recorded exception" should be struck, since the exception is the losing option.

---

## 9. Residual uncertainty

* **Two-ply horizon.** §4.3 compares positions two plies after the decision. It does not prove the Sachita
  line loses the *game*; it proves it loses 4 income/turn and the eastern board against the alternative
  actually played. The Göl line's superiority is stronger: it is proven at one ply (`proven_impossible`) and
  wins on every column of the table.
* **Black's reply choice.** I gave Black its best reply in every line (the engine's `replyTo` witness). I did
  not search Black's *whole* turn for non-capturing plans that might be better than recapturing a 9-crystal
  Sachita with a 3-crystal Hi. **[I]** No such plan is plausible.
* **Home-checkmate under live 2026-09-12 rules.** See the caveat in §7.
* **Map version.** Everything here is on the archived `PRE_CENTRAL_MAP` (H2 = 10 base, expansions 10). On the
  shipped v2.8 map H2 is 16 and Sachita mines 5, so the *income* case for promoting a Muju on H2 is much
  stronger (`game-records.md:634-638`) — but the *tactical* case (3 AP walk, 0 retreat, 3-crystal recapture)
  is unchanged, because none of it depends on reserves.
