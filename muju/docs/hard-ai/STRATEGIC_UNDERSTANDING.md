# Muju v2.8 — the integrated strategic model

Synthesis written 2026-09-14 against worktree `/Users/ashkie/src/deevgames-muju-hardai`
(branch `claude/muju-hard-ai`, HEAD `44c41c4` = snapshot of the uncommitted v2.8 tree).
All paths are relative to `muju/` unless absolute.

This document integrates six reader maps under `docs/hard-ai/understand/`:
`rules-engine.md` (RE), `current-ai.md` (CA), `lab-harness.md` (LH), `strategy-docs.md` (SD),
`game-records.md` (GR), `engine-techniques.md` (ET), plus the Muju rows of `napkin-snapshot.md`
(NK, lines 9–14 and 23–26). Where a number below is stated without a reader tag, I re-verified it
myself today in `src/game/units.ts`, `src/game/resourceMap.ts`, `src/game/upkeep.ts`,
`src/game/inactivity.ts`, `src/game/rules.ts`, `src/game/combat.ts`, `src/game/elements.ts`,
`src/game/spawning.ts`, `src/game/mining.ts`, `src/game/turn.ts`, `src/ai/evaluation.ts`,
`src/ai/types.ts`, `src/ai/engine-v2.ts`, `src/ai/planner/*.ts` and `src/hooks/useAI.ts`.

Evidence labels:

- **[code]** — verified in source (path:line).
- **[game]** — observed in a real recorded game (the one archived match, or a napkin loss).
- **[sim]** — a scripted-bot or census measurement; fixed policies or a static index, not expert play.
- **[doc]** — asserted in a repo document, not independently re-derived.
- **[inference]** — my own reasoning; flagged as such.

The evidence base is thin and mostly stale, and that shapes every conclusion:

| Source | n | Rules it was played/measured under | Transfers to v2.8? |
|---|---:|---|---|
| `tests/fixtures/codex-claude-2026-09-12.json` (Claude W beat Codex B, resignation t17) | 1 game | 4 actions, v2.6 catalogue, **496-crystal PRE_CENTRAL map** (home 10s, pockets 10s) | Tactics yes; opening economics no (GR §4.5, SD §0.1) |
| Napkin losses (NK:9,10,11,13) — Codex won all | 3–4 games, prose only | 4 actions, 480/496 maps | Lessons yes; no move data (GR §3) |
| `opening-census-2026-09-14`, `handicap-census-2026-09-14` | 635,203 / 6.39M joint first-round positions | **v2.8, 504 map** | Yes, but a hand-weighted static index, not outcomes (LH §4.2–4.3) |
| `four-actions-2026-09-12` (560 games), `alternate-map-2026-09-12` (2,736), `depth-economy` (5,760) | scripted | 480/496 maps, pre-v2.8 Plant mining | Direction only (LH §4) |
| June 2026 ladder (27,400 games) | scripted + 160 engine | six actions, old prices, old catalogue | No (LH §2) |

**Nothing has been measured as a win rate on the v2.8 map.** `docs/EXPANSION_ECONOMY-2026-09-13.md`
and J-020 say so explicitly (SD §6, LH §4.5) **[doc]**.

---

## 1. The economy: a finite resource race with exact numbers

### 1.1 The stock

`UNEQUAL_ROUTES_MAP` (`src/game/resourceMap.ts:6-17`) **[code]**, index `y*10+x`, A–J = x 0–9, 1–10 = y 0–9:

```
      A   B   C   D   E   F   G   H   I   J
 1 [  8   8   8   0   0   0   4   4   4   4 ]
 2 [  8   8   4   0   0   0   4  16  16   4 ]
 3 [  8   4   4   0   0   0   4  16  16   4 ]
 4 [  4   4   4   4   4   8   4   4   4   4 ]
 5 [  4   4   4   8   8   8   4   4   4   4 ]
 6 [  4   4   4   4   8   8   8   4   4   4 ]
 7 [  4   4   4   4   8   4   4   4   4   4 ]
 8 [  4  16  16   4   0   0   0   4   4   8 ]
 9 [  4  16  16   4   0   0   0   4   8   8 ]
10 [  4   4   4   4   0   0   0   8   8   8 ]
```

- Total **504**; histogram `{0:18, 4:54, 8:20, 16:8}`; exactly 180°-rotationally symmetric
  (`M[i] === M[99-i]`), 252 per half-board; **not** symmetric under transpose (RE §5.1, ET §1.1) **[code]**.
- Named groups (RE §5.1): White home cluster A1 B1 C1 A2 B2 A3 = **48**; Black home J10 I10 H10 J9 I9 J8 = 48;
  NE pocket H2 I2 H3 I3 = **64** (four 16s); SW pocket B8 C8 B9 C9 = **64**; central 8s F4 D5 E5 F5 E6 F6 G6 E7 = **64**;
  54 ordinary 4s = 216; 18 blank corridor squares D1–F3 and E8–G10 = 0 (walkable, spawnable, worthless).
- `MAX_RESOURCE_RESERVE = 16`; reserves never replenish; conservation `gained_W + gained_B + remaining === 504`
  is a harness invariant (`lab/harness/invariants.ts:55-59`) **[code]**.
- Geometry of the two pockets **[inference, verified arithmetic]**: in the NE pocket H2=(7,1) is Manhattan 8
  from A1 and 10 from J10, I3=(8,2) is 10 from A1 and 8 from J10, I2 and H3 are 9 from both; the SW pocket is the
  exact image (B8 is 8 from A1, C9 is 8 from J10, C8/B9 are 9 from both). So **both pockets are equally
  contested**: each corner has exactly one square at distance 8 in each pocket and the rest at 9–10. The centre
  8s are 7–11 from either corner (D5 is 7 from A1; G6 is 7 from J10).

### 1.2 The flow

Mining (`src/game/mining.ts:5-34`) **[code]**: at `endTurn`, every unit of the mover takes
`min(Mining, cell.reserve)` from the square it stands on, simultaneously, unconditionally (moved, attacked,
just-bought and just-promoted units all mine). There is no mine action. Income earned on turn *n* is first
spendable on turn *n+1* (upkeep → Place), because Place precedes Action precedes income (RE §8.2.2) **[code]**.

Mining rates by unit (`src/game/units.ts`) **[code]**: Hi/Hono/Kagari 1; Radi/Umeme/Kimubunga **0**; Sjor/Straumr 2,
Aegirinn 3; Göl 0, Gölge 1, Karanlık 2; **Muju 3, Sachita 5, Sachakuna 8**; Inyan 2, Mazask 3, Tanka 4.

Depletion schedules (RE §5.2, `tests/game/expansion-economy.test.ts:30-45`) **[code]**:

| Miner | On a 4 | On an 8 | On a 16 |
|---|---|---|---|
| Muju (3) | 3,1 — 2 turns | 3,3,2 — 3 turns | 3,3,3,3,3,1 — 6 turns |
| Sjor/Straumr (2) | 2,2 — 2 | 2×4 — 4 | 2×8 — 8 |
| Sachita (5) | 4 — 1 | 5,3 — 2 | 5,5,5,1 — 4 |
| Sachakuna (8) | 4 — 1 | 8 — 1 | 8,8 — 2 |
| Tanka (4) | 4 — 1 | 4,4 — 2 | 4×4 — 4 |
| Hi (1) | 4 turns | 8 | 16 |

Lifetime yield of a square to a miner is `min(reserve, …)` = the reserve itself; the rate only decides
*how many turns* the miner is tied up. Hence (ET §5.4, discounted at γ=0.9 **[inference]**): on a 4-cell every
miner is worth 3.1–3.6 (rate is irrelevant, the ore is gone in 1–2 turns); on a 16-cell the spread is
Hi 6.46 → Sjor 10.25 → Muju 11.59 → Tanka 12.38 → Sachita 12.85 → Sachakuna 13.68.
**Rich-square assignment is the whole economic game; there are only 8 sixteen-cells and 20 eight-cells.**

### 1.3 The start and the first three turns

`createInitialGameState` (`src/game/board.ts:203-261`) **[code]**: White Hi B1, Sjor B2, Muju A2; Black Hi I10,
Sjor I9, Muju J9. Both banks 0 (Black + `blackCrystalHandicap`, 0–20). Turn 1 begins in the Action phase.
All three starting squares hold 8, so a stationary trio banks exactly **6** (1+2+3) at the end of turn 1
(`tests/game/turn.test.ts:10`) **[code]**; moving them cannot raise it (every neighbour holds ≥ their Mining
except the 0-corridors) **[sim: the opening census reports bank 6 in every top opening]**.

Turn-2 bank of 6 buys exactly one of **[code arithmetic]**: one Muju (5) · one Sjor or Göl (4) · two Hi/Radi (3+3) ·
one T1→T2 promotion (4). Never a Muju plus anything. A Black handicap of 1–2 does nothing (cheapest unit is 3);
3 buys a Hi or Radi on turn 1; 4 buys a Sjor/Göl or a promotion (LH §4.3) **[sim, code]**.

Passive home extraction **[inference from the schedules]**: the three starting squares (24 crystals) yield
6,6,6,3,1,1,1,1 to a trio that never moves; the Muju's square is dry after turn 3, the Sjor's after turn 4.
Two extra Mujus on the remaining home 8s (C1, A3) add 3+3 for three turns. **The 48-crystal home cluster
supports roughly 12/turn for about four turns and is flat by turn 6–7 under any reasonable plant opening.**
In the archived game (10-crystal home squares, so more generous) both homes were mined flat by turn 10
(GR §2.2: White home 50→0, Black 49→0 by revision 21) **[game]**.

### 1.4 The income curve and the cliff

The one real game (GR §4.4) **[game]**: combined harvest per turn t3→t17 =
`25 29 34 41 41 37 38 27 24 14 9 15 8 15 12`. It ramped to ~41 at turns 6–7 and then fell 38 → 9 between
turns 9 and 13 (a 76 % collapse in four turns). 398 of 496 crystals were mined by turn 17; **51 of the 64
central crystals were never touched** — both agents mined home flat, fought over the pockets, and ignored the
middle. After the cliff each side's income was decided entirely by how many Mujus it could *walk* one square onto
fresh 4-stacks within its 4 AP (White's turns 14–17: harvests 9, 2, 13, 12 from 3–4 one-square relocations).

`docs/ANALYSIS_TOOLS_PROMPT-2026-09-12.md:9` names this as motivating problem #1: "income fell from 16 to 0
in three turns with no warning" **[doc]**. NK:11 (game 2) records income collapsing to ~1 by turn 6 from
Mujus bought onto half-mined home cells **[game]**.

**Model consequence.** `projectedIncome` (`src/game/mining.ts:12-15`) is exact for *this* turn and blind to
everything after it. The quantities a strong player tracks are: reserve under each miner, turns until each
square empties, the nearest fresh square with reserve ≥ 2×Mining, and the AP cost of getting there.

### 1.5 Upkeep and runway

`UPKEEP_BY_TIER = {1:0, 2:1, 3:2}` (`src/game/upkeep.ts:5`; the 4:3 entry is legacy) **[code]**, charged at the
*owner's* turn start, before healing and Place (`src/game/turn.ts:30-33`). Shortfall forces a keep-set choice;
**tier-1 units can never be released** (`upkeep.ts:20,25`); a promotion's new rent starts next own turn.

Net income per turn on a full square = Mining − upkeep **[code arithmetic]**:

| | T1 | T2 | T3 |
|---|---:|---:|---:|
| Plant | +3 | +4 | **+6** |
| Metal | +2 | +2 | +2 |
| Water | +2 | +1 | +1 |
| Shadow | 0 | 0 | 0 |
| Fire | +1 | 0 | **−1** |
| Lightning | 0 | −1 | **−2** |

Only the Plant ladder is income-positive at every step (this is new with J-020, 2026-09-13; SD §0.4 flags the
pre-v2.8 guides as wrong here). Kagari, Umeme and Kimubunga cost money every turn they exist; a tier-3 held for
the rest of a long game costs ~20 crystals of discounted rent, more than its purchase price (ET §5.1) **[inference]**.

The archived game is the runway lesson in two numbers (GR §2.3) **[game]**: from turn 10 to 17 Black paid
`6 6 6 5 5 5 5 5 = 43` upkeep against harvests `5 9 5 8 6 6 2 0 = 41`; White paid `0 0 0 2 3 4 5 5 = 19` against
`22 15 9 1 9 2 13 12 = 83`. Lifetime: White 19 upkeep on 223 gross (8.5 %), Black 54 on 175 (31 %). White paid
**zero** upkeep until turn 13 (first promotion turn 12); Black promoted on turn 4 and paid from turn 5. Black
made 13 of 18 kills and resigned with 4 crystals, 2 income, 5 upkeep. NK:13 (game 3) is the same shape: income
11 → 0 by turn 12, units released to upkeep on turn 13 **[game]**.

Scripted corroboration (LH §4.7) **[sim]**: with upkeep off, peak tier-2+ count reaches 31–45 and 260/960 games
hit the safety cap; with shipped upkeep, peak tier-2+ max 7–8 and 0 caps. Upkeep is what bounds army size.

### 1.6 The bank

The archived game finished 57 vs 4 in bank (GR §2.1) **[game]** and the winner's essay says "bank early, spend late"
(SD P16) **[doc]**. Against that, the depth-economy screen found scripted bots end with 0.4–0.6 crystals
(LH §4.5) **[sim]**, and the current evaluator prices a 17-crystal unit at ~25.6 versus 17 banked crystals at
~8.5 (CA §2) **[measured]**.

**Ruling [inference].** Three separable claims, of different strength:
1. **A liquidity floor of 6–8 crystals is load-bearing** (SD P3, P16): it is the price of a spawn-strike reply
   (two Hi = 6) and of the punishing Sjor/Göl (4). Evidence: three of the four recorded losses were decided by a
   3-crystal purchase the loser could not answer or could not make.
2. **Crystals above what the spawn area can absorb are worth less than crystals below it**: with `s` empty
   spawn squares you can convert at most ~`5s` crystals into bodies this turn (ET §5.6 "bank-conversion").
3. **The ratio at which cash should convert to bodies is uncalibrated.** The eval's 3× premium is a guess in one
   direction; the guide's "bank" is a lesson from one game where the opponent over-promoted. Neither is a target.

### 1.7 Promotions as investments

Costs are uniform: **4** (T1→T2) and **8** (T2→T3) for every element (`src/game/promotion.ts:9-23`) **[code]**.
Timing is forced (`promotion.ts:44-52`): never on the purchase turn, once per unit per turn, so a bought T1 is
T2 no earlier than next own turn and T3 the turn after — a starting unit can be T2 on turn 2 and T3 on turn 3
(bank 6 −4 +6 = 8, exactly the Aegirinn price, leaving 0) **[code arithmetic]**. Codex reached Straumr on
turn 4 and Aegirinn on turn 5 while also buying Mujus (GR §2.2) **[game]**.

The v2.8 Plant line on a 16: Muju 3 → Sachita 5 → Sachakuna 8 collects 16 in three harvests for 5+4+8 = 17
crystals and 1 rent during the climb (then 2/turn on an empty square) versus a plain Muju collecting 16 over six
turns for 5 (SD P14, `docs/EXPANSION_ECONOMY` line 10) **[doc, code arithmetic]**. Sachita is DEF 3 (dies to one
Hi at 3), Sachakuna DEF 4 (dies to Hono 4 or Kagari 5). **Promoted plants are tempo bought with fragility;
nothing in the corpus tests the trade** **[inference]**.

---

## 2. The action economy

### 2.1 Four shared actions; purchases and promotions are free

`DEFAULT_ACTIONS_PER_TURN = 4` and `isActionsPerTurn` accepts only 4 (`src/game/rules.ts:9-13`) **[code]**.
Purchases and promotions cost zero actions and the unit acts immediately (`src/game/building.ts:11-14`,
`tests/game/cleave.test.ts:38-52`) **[code]**. So army *size* is free and army *use* is rationed: a ten-unit army
still gets four actions. This is the single most-cited principle in the strategy corpus (SD P1) and the
four-actions study measured its effect: mean game length 22.4 → 27.1 rounds, median first kill round 1 → 2,
Hi/Hono move-and-attack reach 11 → 7 squares (LH §4.1) **[sim]**.

### 2.2 Reach

Move cost = `ceil(BFS_distance / speed)`, all actions charged at once; BFS is 4-neighbour over *unoccupied*
squares — **both sides' units block** (`src/game/movement.ts:226-257`) **[code]**. There is no combined
move-and-attack action; `MOVE_AND_ATTACK` is a UI pair (RE §3.8).

| Speed | Units | Move-only reach (4 AP) | Move+attack kill radius (3 moves + 1 attack) |
|---:|---|---:|---:|
| 1 | Sjor, Straumr, Muju, Sachita, Sachakuna, Inyan, Mazask | 4 | **4** |
| 2 | Hi, Hono, Göl, Gölge, Aegirinn, Tanka | 8 | **7** |
| 3 | Kagari, Radi, Karanlık | 12 | **10** |
| 4 | Umeme | 16 | 13 |
| 5 | Kimubunga | 20 | 16 |

(SD §0.2, reproduced from `rules.ts:9` + `movement.ts:29-32`) **[code arithmetic]**. Blockers shorten real reach;
count legal paths, not distances. NK:11 lost a Hi at D3 to a speed-1 Straumr four squares away ("it's slow")
**[game]** — the speed-1 kill radius is 4, not 1.

### 2.3 Approach classification

For an attacker of speed `s` whose shortest legal path to the cheapest empty square adjacent to the target is `d`
(SD P6, derived from `rules.ts:9` + `movement.ts:29-32`) **[inference, matches the guide's numbers]**:

| `d` | Class | AP | s=1 | s=2 | s=3 |
|---|---|---|---|---|---|
| `d ≤ 2s` | **strike-and-retreat** — 2 moves + attack + 1 retreat move | 4 | ≤2 | ≤4 | ≤6 |
| `2s < d ≤ 3s` | **strike-and-strand** — 3 moves + attack, no retreat | 4 | 3 | 5–6 | 7–9 |
| `d > 3s` or no empty adjacent square | cannot strike this turn | — | ≥4 | ≥7 | ≥10 |

`server/analysis/tactics.ts:272-291 approachTable` computes exactly this three-way classification by executing
the move and measuring the post-attack movement range (GR §5.4) **[code]**. The winner's essay calls it "the
decisive habit of this game" and the opponent took every unpunishable stranded kill and declined the punishable
ones (SD P6) **[game, n=1]**.

### 2.4 Kill combinations need pre-adjacency

`resolveCombat` (`src/game/combat.ts:117-164`) **[code]**: `attackPower = max(0, ATK + elem ± handicap)`,
`defense = max(0, DEF − damageTaken)`, kill iff `attackPower ≥ defense`, else `damageTaken += attackPower`.
Chip damage heals at the **owner's** turn start (`src/game/board.ts:287`), so a combination must finish within
one attacking turn (RE §4.5) **[code]**. A non-lethal hit — including a 0-damage hit — permanently closes that
unit's Cleave chain for the turn (`combat.ts:13-17`, `cleave.test.ts:53-69`) **[code]**, so **one attacker
contributes at most one chip**; the kill-table numbers are "distinct attackers in one turn".

Action arithmetic **[code arithmetic]**: attacker `i` costs `ceil(max(0, d_i − 1)/s_i) + 1` actions
(`src/game/homeCheckmate.ts:40-41`). Two hitters each needing one move = 4 AP, fits; either needing two = 5,
fails. Three attackers on a **corner** need ≥ 5 actions (two neighbours; a third hitter needs an exit and an
entry), so **at most two attacks land on a corner occupier in a four-action reply** (`homeCheckmate.ts:28-31`).
NK:13: "I was one AP short of killing the enemy Aeg four turns running" **[game]**.

Cleave (`combat.ts:13-17`) **[code]**: max attacks = tier (1/2/3), each further attack only after a kill.
(Superseded 2026-09-23, `muju-phasing-4`: no tier cap — each kill unlocks another attack at any tier, bounded
only by the four shared actions.)
FOUR_ACTIONS probe (LH §4.1) **[sim, exact]**: one Kagari vs three adjacent Mujus kills all three in 3 actions;
spaced at C1/E1/G1 it kills only 2 in 4 actions. Codex's Hono at C9 killed B9 then C8 from one square (GR §2.3)
**[game]**. **Do not line soft miners up beside a square a tier-2+ unit can reach.**

### 2.5 Spawn-strike: threats from units that do not exist yet

A purchased unit acts immediately from any empty square in an unblocked rectangle. So the true threat frontier
is `∪ over (legal enemy spawn square × affordable tier-1) of strike area`, not the visible army (SD P3, ET §5.8)
**[code, inference]**. From a spawn square a fresh **Radi (SPD 3) strikes at BFS radius 10, a Hi (SPD 2) at 7,
a Göl at 7, a Sjor at 4** **[code arithmetic]**. Costs: Hi 3, Radi 3, Sjor/Göl 4, Muju/Inyan 5.

Recorded instances **[game]**: NK:10 — a freshly bought Radi from a forward rectangle killed a Hi on turn 2;
archived game Black turn 3 — `BUY fire_1@I6 · MOVE →I2 · ATK H2 · MOVE →I4`, a 3-crystal Hi walked 6 squares,
killed the 5-crystal pocket Muju and retreated, all in 4 AP; NK:13 — a fresh Hi 1–2 AP from the perimeter every
turn (−5 +3 = −2 crystals per exchange for the defender, plus the recapture actions).

### 2.6 Your own army blocks you; buys resolve first

Place precedes Action (`turn.ts:63`, `simulate.ts:54`); BFS treats all units as blockers (`movement.ts:246`).
A unit bought this turn is already in the way of this turn's moves (RE §8.2.1, NK:14) **[code, game]**. An idle
Muju is a blocker, a spawn anchor and a traffic jam (SD P13).

### 2.7 How big a turn is

**[measured, ET §1.4]**: White's turn 1 (3 units, 0 crystals, no Place phase) has **14,959** distinct action
sequences, **1,053** distinct mid-turn states and **797** distinct end positions (an 18.8× sequence/state ratio
on the quietest turn in the game). By turn 3 the sequence count exceeds 4,000,000 and distinct end positions
exceed 287,000 without exhausting. Legal actions per decision point over 691 random plies: mean 27, max 241
(place phase mean 44, max 241; action phase mean 22, max 92). A place-phase node with 40 crystals and a forward
anchor has 192 `BUY_UNIT` actions of 197 (CA W11) **[measured]**. Purchase multisets over the six T1 prices:
38 at 10 crystals, 402 at 20, 2,117 at 30, 7,713 at 40 (ET §3.3) **[measured]**.

Within a turn there is no opponent interleaving: a turn is atomic, so attacks-before-independent-moves is a
safe canonical ordering and income depends only on final squares (ET §3.0–3.1) **[code, inference]**.

---

## 3. Elements and the kill table as strategic constraints

### 3.1 The rule

`Fire & Lightning → Plant & Metal → Water & Shadow → Fire & Lightning` (`src/game/elements.ts:25-29`);
+1 ATK with advantage, −1 with disadvantage, 0 inside a pair; **DEF is never modified** (`elements.ts:103-114`)
**[code]**. A live unit always has `DEF_eff ≥ 1` (a survivor has `damageTaken < DEF`), so a 0-power attack
can never kill (RE §1.7b) **[code, inference]**.

### 3.2 The 18×18 kill table

Cell = number of distinct attackers needed in one turn (K = one-shot; — = ATK_eff 0, can never kill). Derived
mechanically from `units.ts` + `elements.ts` + `combat.ts` (RE §4.4); I spot-checked the threshold cases below.

| ATK ╲ DEF | Hi 1 | Hono 1 | Kagari 2 | Radi 1 | Umeme 1 | Kimub 1 | Sjor 2 | Straumr 3 | Aegir 4 | Göl 2 | Gölge 2 | Karan 2 | Muju 3 | Sachita 3 | Sachak 4 | Inyan 3 | Mazask 4 | Tanka 5 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Hi** (2) | K | K | K | K | K | K | 2 | 3 | 4 | 2 | 2 | 2 | K | K | 2 | K | 2 | 2 |
| **Hono** (3) | K | K | K | K | K | K | K | 2 | 2 | K | K | K | K | K | K | K | K | 2 |
| **Kagari** (4) | K | K | K | K | K | K | K | K | 2 | K | K | K | K | K | K | K | K | **K** |
| **Radi** (1) | K | K | 2 | K | K | K | — | — | — | — | — | — | 2 | 2 | 2 | 2 | 2 | 3 |
| **Umeme** (2) | K | K | K | K | K | K | 2 | 3 | 4 | 2 | 2 | 2 | K | K | 2 | K | 2 | 2 |
| **Kimubunga** (3) | K | K | K | K | K | K | K | 2 | 2 | K | K | K | K | K | K | K | K | 2 |
| **Sjor** (2) | K | K | K | K | K | K | K | 2 | 2 | K | K | K | 3 | 3 | 4 | 3 | 4 | 5 |
| **Straumr** (2) | K | K | K | K | K | K | K | 2 | 2 | K | K | K | 3 | 3 | 4 | 3 | 4 | 5 |
| **Aegirinn** (3) | K | K | K | K | K | K | K | K | 2 | K | K | K | 2 | 2 | 2 | 2 | 2 | 3 |
| **Göl** (2) | K | K | K | K | K | K | K | 2 | 2 | K | K | K | 3 | 3 | 4 | 3 | 4 | 5 |
| **Gölge** (3) | K | K | K | K | K | K | K | K | 2 | K | K | K | 2 | 2 | 2 | 2 | 2 | 3 |
| **Karanlık** (4) | K | K | K | K | K | K | K | K | **K** | K | K | K | K | K | 2 | K | 2 | 2 |
| **Muju** (0) | — | — | — | — | — | — | 2 | 3 | 4 | 2 | 2 | 2 | — | — | — | — | — | — |
| **Sachita** (1) | — | — | — | — | — | — | K | 2 | 2 | K | K | K | 3 | 3 | 4 | 3 | 4 | 5 |
| **Sachakuna** (2) | K | K | 2 | K | K | K | K | K | 2 | K | K | K | 2 | 2 | 2 | 2 | 2 | 3 |
| **Inyan** (1) | — | — | — | — | — | — | K | 2 | 2 | K | K | K | 3 | 3 | 4 | 3 | 4 | 5 |
| **Mazask** (2) | K | K | 2 | K | K | K | K | K | 2 | K | K | K | 2 | 2 | 2 | 2 | 2 | 3 |
| **Tanka** (2) | K | K | 2 | K | K | K | K | K | 2 | K | K | K | 2 | 2 | 2 | 2 | 2 | 3 |

### 3.3 What the walls are immune to

- **DEF 1 is free**: every attacker with ATK_eff ≥ 1 one-shots Hi, Hono, Radi, Umeme, Kimubunga. The whole
  fire/lightning ladder except Kagari (DEF 2) dies to anything.
- **Tanka (DEF 5)** is one-shot **only by Kagari** (4+1). Everything else needs a combination: two Hi (3+3 = 6
  crystals, 2 actions if pre-adjacent), Hi + Radi (3+2 = 5), Hono + Hono. Water/shadow/Sachita need 5 hits —
  impossible in a turn. `docs/BALANCE-2026-09-11.md` states this as a design invariant and the static solver
  agrees (LH §3.2: Tanka frontier at distance 1 = {Radi+Hi} 6 crystals/2 actions or Kagari 15/1) **[doc, sim]**.
- **Aegirinn (DEF 4)** is one-shot **only by Karanlık** (shadow is neutral to water: 4 ≥ 4); Kagari is
  disadvantaged into water (3) and needs two. Combinations: Aeg+Inyan (3+2), two Göl (2+2), Hono+Hono (2+2),
  Tanka+Aeg (3+3). NK:24 records the 4-damage arithmetic **[game]**.
- **Mazask / Sachakuna (DEF 4)**: one-shot by Hono (4), Kagari (5), Kimubunga (4); two Hi (3+3) suffice.
  Karanlık cannot (3).
- **Muju (DEF 3)** dies in one hit to **Hi (3)**, Hono, Kagari, Umeme (3), Kimubunga and **Karanlık (3)**; it is
  immune to every water and metal attack (max 2), to Göl/Gölge, and to plants. The 3-crystal Hi killing the
  5-crystal Muju is the game's most efficient trade and the engine of every raid in the corpus (SD P7).
- **Göl (DEF 2, SPD 2, cost 4)** is immune to Hi (1), Radi (0) and Muju (1); it kills every fire/lightning unit
  (3) and every water/shadow unit at DEF ≤ 2. It dies to any water, any metal, Sachita and Sachakuna.
- **Sjor (DEF 2, cost 4)** kills any fire or lightning unit (3 ≥ 1 or 2) — a 4-crystal fire-proof sentry — but
  only chips plant/metal.
- **Radi (ATK 1)** one-shots nothing above DEF 1; its value is SPD 3 (kill radius 10), rectangle blocking and
  home threats. It was never bought in the archived game (GR §4.2) but the handicap census makes "Buy Radi" Black's
  best 3-crystal reply in 214/797 White openings (LH §4.3) and `lightning_1` was the most common winning home
  invader in the v1.3 home-victory screen (106/399) (LH §4.8) **[sim]**. **Ruling: Radi is a positional unit,
  not a dead one** (see §8).
- **Muju (ATK 0)** can damage only water/shadow (1); two Mujus kill a Sjor or Göl; Sachita kills a Sjor or Göl
  alone (1+1 = 2 ≥ 2). That last fact is STRATEGY_GUIDE mistake #1 — the winner declined to promote Muju@H2 to
  Sachita on turn 3 to kill the adjacent Sjor, and GR §2.3 verified the line legal in the engine; that Sjor made
  four kills as Sjor→Straumr→Aegirinn **[game, code]**.

### 3.4 Strategic consequences

1. **Element advantage is not a matchup; the one-shot threshold is.** One point of DEF changes the entire set of
   units that can remove you (ET §5.1). Evaluate durability with the kill table, never with a linear DEF term.
2. **Water/shadow are the fire-proof pieces; plant/metal are the water-proof wall; fire/lightning are the
   plant-killers.** A player whose army has no fire/lightning cannot punish a Muju wall except with Karanlık;
   a player with no water/shadow/metal cannot stop a Hi raid except by trading Hi for Hi.
3. **The cheapest answer to each wall** (crystals): Muju ← Hi 3; Sjor ← Hi+Hi 6 or Muju+Muju (0 if you have them);
   Göl ← Sjor 4; Straumr ← Kagari 15, or Hono+Hono 14, or Göl+Göl 8; Aegirinn ← Karanlık 16 or Göl+Göl 8;
   Mazask ← Hono 7 or Hi+Hi 6; Tanka ← Kagari 15 or Hi+Hi / Hi+Radi 6 — **all combination answers require
   pre-adjacency (§2.4)**.
4. **Partial damage is worth zero** unless finished this turn (heals at the owner's turn start).

---

## 4. Space: rectangles, anchors, blocking, the home square

### 4.1 The spawn rectangle

`getSpawnRectangle(corner, anchor)` (`src/game/spawning.ts:8-29`) is the inclusive axis-aligned rectangle from
the player's start corner to any friendly unit. Area for a White anchor at `(a,b)` is `(a+1)(b+1)`.
**Any single enemy unit anywhere inside voids the whole rectangle** (`spawning.ts:34-46`). The legal spawn set is
the union over unblocked anchors minus occupied squares (`spawning.ts:98-118`). Every rectangle contains the home
corner, so an enemy on your corner voids **every** purchase (`homeCheckmate.ts:52-53`, `home-victory.test.ts:19`)
**[code]**. Blank 0-squares are spawnable (RE §3.3).

Numbers **[code, verified by enumeration in SD P4]**:
- A White Hi at **F5** gives a 30-square rectangle (27 empty) exposing D5, E5, F4 (three 8s); **one enemy unit on
  C3 cuts those 27 squares to 2** (A1 and B1 via the rear anchors). Blocking-set size 1.
- A White Hi at **H3** gives 24 squares (21 empty) and exposes H2 = 16.
- Two enemy units on **I10 and J9** block every Black anchor except one anchored on J10 itself; the mirror for
  White is **B1 and A2**.
- A corner packed with three own units has **zero** empty spawn squares (NK:9 lost four of ten turns' purchases
  this way) **[game]**; the opening census ranks the corner-sealing lines last at −8.53 with 0 spawn squares
  and the best lines at 21–27 squares (LH §4.2) **[sim]**.

### 4.2 Anchors

A forward unit is worth an enormous rectangle; a cheap enemy unit deletes it. The archived game's pivot
(GR §2.3) **[game]**: turn 8 a 4-crystal Göl walked D3→D9 (six squares, 3 AP); White's spawn squares jumped
12 → **30**; turn 9 White bought **four Mujus in one Place phase** on B8/C8/B9/C9 (then 10-stacks, now 16s) and
income went 14 → 25; bank hit 57 by turn 10. Black killed the Göl with a Tanka on turn 9 — after the Mujus were
down (47 crystals mined over the next two turns). NK:11 is the mirror failure: an Aegirinn walked 8 squares to
anchor a pocket and a 3-crystal Hi blocked the rectangle next turn — 16 crystals and 2 rent for zero purchases
**[game]**.

**Anchor value = (unique area opened, weighted by reserve) × survivability**, where survivability is 0 if any
enemy one-shot or ≤4-action combination — *including purchases* — reaches it, and a **blocking set of size 1
disqualifies it** (SD P15, ET §5.6) **[inference, corroborated by both recorded anchor outcomes]**.
`server/analysis/geometry.ts:25-50 blockingSet` computes the exact minimum set cover (routes not checked) **[code]**.

The durable anchors in the corpus are DEF-4/5 pieces: Codex parked an Aegirinn at G6/G8 (NK:13) and a Tanka as a
forward anchor beside White's miners (GR §5.8 revision 19) **[game]**. The census's best first turns march the
Hi out (DEF 1) — safe on turn 1 only because Black has 0 crystals and its Hi's kill radius (7) falls short
(SD §4.2) **[sim, code]**.

### 4.3 Spawn denial as a weapon

One of your units inside the opponent's rectangle blanks that anchor; on I10+J9 (or B1+A2) it blanks
everything but the corner-anchor; on the corner it blanks everything (§4.1). NK:24: Codex "walked a Tanka INTO
my cluster (B2) to block all spawn rectangles" **[game]**. `spawnDenialPressure` (weight −1.5 per body) in the
current evaluator badly under-prices a total shutdown (CA W7).

### 4.4 The home square and home checkmate

- **Occupation** (`src/game/turn.ts:23-27`): a unit on the enemy corner at the start of your own turn wins,
  checked before elimination, upkeep and healing. Any unit qualifies, including an ATK-0 Muju **[code]**.
- **Checkmate** (`src/game/homeCheckmate.ts:57-180`, `PROOF_NODES = 20000`): after every action, if the mover
  occupies the enemy corner and the opponent does not occupy the mover's, the engine proves whether the
  defender's *entire* reply turn (upkeep keep-sets × ≤1 promotion per unit × 4 actions, no purchases — the
  occupier blocks every rectangle) can remove the occupier. `mate` wins immediately; `unknown` (exhaustion)
  never wins **[code]**. The prover's admissible bound caps at 2 hits because the corner has two neighbours.
- **A plug on your own corner makes occupation impossible while it lives** (movement never ends on an occupied
  square, `movement.ts:251-253`), at the cost of one spawn square (ET §5.3) **[code, inference]**. Black's
  `BUY plant_1@J10` on turn 4 of the archived game "invalidated every one-turn assault I could compute"
  (SD P11) **[game, doc]**. A plug is compatible with §4.1 as long as the neighbours stay open.
- **Defence must be positioned before the threat appears**: the four-actions probe (LH §4.1) **[sim, exact]**
  has a Black Tanka on A1 with White Hi at E1 and Radi at A4 — clearing costs 5 actions, "disproved at 4"; the
  Hi one square closer at D1 restores a 4-action rescue.
- **The realistic assault** (SD P11, `docs/STRATEGY_GUIDE §8`) **[doc, untested]**: Tanka on one corner
  neighbour, Kagari on the other; Kagari kills the home plant (5 vs 3), Tanka steps in; requires the defender's
  fresh-fire reply to be impossible (0 crystals, or both neighbours already yours). Only an Aegirinn survives a
  Kagari on the corner, and a Karanlık in the reply kills even that.
- Historical scale (v1.3, six actions, LH §4.8) **[sim]**: the home objective converted 399 of 960 games, cut
  caps 438 → 280 and halved median length 52 → 27; 27 home wins by round 5, 26 of them by Lightning I; a
  water unit stationed at home cut that to 0/160.
- **Home checkmate beats the ten-quiet-turn draw** — verified today (see §8.1).

### 4.5 The centre

The eight central 8s (64 crystals) are 7–11 from either corner. In the archived game 51 of 64 were still on the
board at resignation **[game]**. The alternate-map screen (LH §4.4) **[sim]** found that doubling the centre's
value raised centre *income* (17.3 → 31.5/game) without raising centre *occupation* (56.2 → 56.7 unit-turns),
and that early centre anchors lost: D5 went 0/37/3 vs Rush on both maps, E5/F5 went 0 wins / 69 losses / 11 draws
in 80 games vs Rush. The opening census's top lines nonetheless end on E6/F5/D7 (LH §4.2) **[sim]** — because
that index prices one round of spawn area and income, not the anchor's survival.
**Ruling [inference]:** the centre is a mid-game asset for a *durable* anchor (DEF 4+) with a defended
rectangle, not an opening; a DEF-1 Hi on a central 8 is a spawn-area play that must retreat before Black has
6 crystals.

---

## 5. Tempo and the draw clock

### 5.1 The clock

`INACTIVITY_LIMIT = 10`, `INACTIVITY_WARNING = 7` (`src/game/inactivity.ts:3-4`) **[code]**. A ply is one
completed player turn; **only an attack kill resets it** (`simulate.ts:101`); movement, purchases, promotions,
chip damage, income and upkeep releases do not (`upkeep-draw.test.ts:101-109`). It resolves in `endTurn` after
income and before the next `startTurn`, so it beats the opponent's home-*occupation* win and their upkeep
(`turn.ts:96-101`) **[code]**. Ten quiet plies = five rounds = 20 action points per side.

Draw frequency **[sim]**: 20.4 % → 23.6 % of scripted games (six → four actions, LH §4.1); 59 % of the
alternate-map main screen (190/320); 55–62 % of depth-economy games; `Aware:Balanced vs Aware:Turtle` drew
40/40 on both maps. In the one real game the clock never exceeded 3 **[game]** — 18 attacks, 18 kills.

### 5.2 Who the clock serves

- The side ahead on material + bank must keep forcing kills; a 3-crystal Hi raid on an undefended plant resets
  the clock and usually costs the raider (acceptable). The clock is **not** a weapon against a solvent opponent:
  they can always buy a fire and kill a plant (SD P10) **[doc, inference]**.
- The side behind should welcome quiet plies. The current engine has no notion of either (CA W5).
- Passing is never free: income arrives regardless, upkeep is charged next turn regardless, and the clock
  advances. That breaks the null-move assumption in both directions (ET §4.6) **[code, inference]**.

### 5.3 Tempo structure of a turn

`endTurn` order (`turn.ts:92-104`): income → clock → draw check → turn passes → `startTurn`: home-occupation win →
elimination → upkeep (auto-pay or pause) → heal + flag reset → Place (auto-skipped if nothing affordable/placeable) →
Action **[code]**. Consequences: income cannot fund this turn's Place; a promotion's rent starts next own turn;
chip damage is gone by the time you can exploit it a second time; `END_PLACE_PHASE` is frequently illegal because
Place auto-advances after the last affordable purchase (`simulate.ts:118-120`; NK:12,14) **[code, game]**.

### 5.4 First-player advantage

Contested, and the instruments disagree (LH §5.13):
- June 2026 (six actions, old rules): white 48–53 % across 400-game mirrors **[sim]**.
- September, four actions: `Aware:Rush` mirror White **15/20, Black 0/20, 5 draws on both maps**
  (alternate-map) and White 18/20 (four-actions); `Aware:Balanced` mirror 8/11 and 11/8 **[sim]**.
- Handicap census on v2.8 (LH §4.3) **[sim, static index]**: White's best first turn is +3.66 at handicap 0,
  −0.90 ("Close") at 3, −3.80 at 4; Black's best 3-crystal buy is Hi (583/797) or Radi (214/797); at 4 it is
  Sjor for all 797 and never a promotion; a Straumr promoted on Black's first turn under handicap 4 cannot be
  captured by any White second turn (19,128-pair relaxed bound).
See §8.2 for the ruling.

---

## 6. Phases of a game

### 6.1 Opening (turns 1–3): a fixed position and a single real decision

Fixed facts (§1.3) **[code]**. The strategic content is: where the Hi goes on turn 1, what the 6 crystals buy on
turn 2, and whether the Sjor climbs.

**White turn 1.** Three sources rank the candidates differently:

| Anchor | Census minimax (v2.8, static, one round) | Route screen (scripted, 480/496 maps) | Game evidence |
|---|---:|---|---|
| **E6** (`Hi C2 C4 C6 E6`) | **+3.66** (rank 1, 27 spawn squares) | not tested | none |
| **F5** (`Hi C2 C4 D5 F5`) | +3.56 (rank 2, 27) | 18/40 vs Balanced, **0/40 vs Rush**; blocking set 1 (C3) | none |
| **H3** (`Hi C2 D3 F3 H3`) | +2.65 (rank 6, 21) | not tested | **[game]** played by the archived winner; exposes H2 = 16 |
| **D5** | ~ | **0 wins / 37 losses / 3 draws vs Rush**, 9/40 vs Balanced | none |
| Corner seal (`Hi A1; Muju A3; Sjor A2`) | **−8.53** (rank 796–797, 0 spawn squares) | — | NK:9 lost this way |

All eleven top census lines are pure "Hi sortie" — all four actions on the Hi, miners left home, bank 6, 21–27
spawn squares; "Hold" versus a Black Hi sortie averages −2.45 (LH §4.2) **[sim]**. What the sources agree on:
**march the Hi out, keep the rectangle open, do not move the miners.** What they do not settle: the square.
The census prices one round; the route screen used fixed policies on older maps; the game is n=1. See §8.3.

**White turn 2** (SD §4.2) **[game, code arithmetic]**: buy one Muju on the richest square the anchor exposed
(H2 = 16 if the Hi is at H3; payback two harvests). Then either kill what Black left in reach or pull the Hi
back outside every enemy strike-and-retreat radius. The archived Hi pushed on to H8, traded for Black's Hi, and
died to a speed-1 Sjor's strike-and-retreat (`d = 2 ≤ 2s`) — the retreat is untested but the loss is recorded.

**Black.** The exact mirror of H3 is C8 (C9 = 16), reachable by the I10 Hi in 8 squares **[code arithmetic]**.
But Black moves second and sees White's anchor: the census's most universal Black replies are slow Sjor walks
(`Sjor B3 B4 B5 C5` is within 1.0 of best in 525/797 White states, leaving no White capture) and the
lowest-regret replies are mirrored Hi sorties (LH §4.2) **[sim]**. The one real Black opening (GR §1.4, §2.2)
**[game]**: T1 Sjor I9→I6, Hi I10→H9 (two units developed); T2 `+Muju@I9`, Sjor strike-and-retreat killing
White's Hi at H8; T3 `+Muju@I10 +Hi@I6`, spawn-strike on the H2 Muju; T4 Straumr, `+Muju@J10` (home insurance),
`+Sjor@I6`; T5 Aegirinn. Tactically excellent and economically fatal (54 upkeep by turn 17).

**Turn 3.** ~10 crystals: a second Muju on the next-richest exposed square plus a 4-crystal Sjor (fire-proof
sentry) or Göl (if the opponent went water). Do not promote — with the one recorded exception, the free
Sachita kill (§3.3).

Opening features an engine must score: newly exposed `Σ reserve` inside the rectangle; `|spawn squares|` at end
of turn (≥ 3); anchor outside every enemy kill radius *including purchasable units*; blocking-set size ≥ 2;
lifetime yield of the purchase square ≥ 2 × Mining.

### 6.2 Midgame (turns 4–10): the economy race and the raid war

What won **[game]**:
- **Plants on 8s and 16s every turn, banking the rest.** White bought 14 Mujus (22 of 43 purchases in the game
  were Mujus; Muju + Hi = 72 %) and reached bank 20 / income 15 by turn 4 (GR §4.2, SD §4.2).
- **Kill fires proactively.** White killed five fire units with 4-crystal Sjor/Göl punishers on the turn the
  raider stopped (GR §2.4).
- **Open a pocket from a forward anchor and fill it in one Place phase** (the D9 pivot, §4.2). The Place phase is
  a knapsack over the whole bank, not a greedy single purchase.
- **Cheap disposable killers as tactical furniture**: Göls bought on 0-reserve approach squares F2/E2/D3 as
  ambush bait and blockers (SD P6) — with the admitted cost that all three died on two-action approach squares
  (mistake #3).
- **No promotion until the economy peaked and the enemy had mortgaged itself**: first promotion turn 12, with
  63 banked.

What also won, from the other side (NK:23–25, Codex's recipe, n≈3) **[game, prose]**: Hi to a central 8 turn 1;
2–3 Mujus per turn on home and both pockets (9 Mujus by t8, income 13); Sjor→Straumr→Aegirinn by t4 parked as a
**forward DEF-4 anchor** at G6/G8; a fresh-Hi raid on a perimeter miner every turn from t5; Inyan→Mazask→Tanka
t6–8 with Tanka hit-and-run (3 out, kill, back); Hi→Hono→Kagari t8–9 to the far pocket; Tanka+Aeg (3+3) to finish
an Aegirinn.

What lost **[game]** (SD §2 failure modes, each with the check that catches it):

| # | Failure | Where | Check |
|---|---|---|---|
| F1 | Zero spawn squares (corner sealed) | NK:9 | `|spawn(me)| ≥ 1` (ideally ≥ 3) at every turn end |
| F2 | Safety judged against visible units only (bought Radi killed a Hi) | NK:10 | threat set = existing ∪ (spawn square × affordable T1) |
| F3 | Speed-1 reach ignored (Straumr killed a Hi 4 away) | NK:11 | `ceil(d/s)+1 ≤ 4` for every enemy |
| F4/F12 | Miners bought onto depleted or 4-stacks | NK:11; guide mistake #4 | purchase-square reserve ≥ 2 × Mining |
| F5 | Far anchor with blocking set 1 (Aegirinn, blocked by a 3-crystal Hi) | NK:11 | min blocking set incl. purchasable units ≥ 2 |
| F6 | Kill combo one AP short four turns running | NK:13 | pre-adjacency DP `Σ(ceil(d_i/s_i)+1) ≤ 4` |
| F7 | Soft units on two-action approach squares (Göl at J1, D9 ×2) | guide mistake #3 | approach classification for every unit ≥ 4 crystals |
| F8 | Corner turtle with wall-Mujus (−2/raid, income 11→0) | NK:13 | ≥ 60 % of units within radius 2 of home, no anchor beyond 4, enemy has one |
| F9 | Tier 3 with upkeep > sustainable income (54 upkeep on 175) | archived Black | `upkeepDue` vs a forecast, not `projectedIncome` |
| F10 | Kagari (DEF 2) walked into Hi range | guide mistake #5 | cost ≥ 15 units never end inside a cheap unit's purchase-plus-reach set |
| F11 | Moving the only anchor left a pocket unspawnable | guide mistake #2 | articulation test on `|spawn|` per region |
| F13 | Free promotion kill declined (Sachita vs Sjor) | guide mistake #1 | promotions inside the Place-phase kill search |
| F14 | Soft miners in a Cleave-able line (Hono took B9 then C8) | archived t14 | chain-exposure count per enemy tier-2+ unit |
| F15 | Empty threat list read as safety | `MCP_TOOL_TAPS` | `unknown` is not `safe` |

### 6.3 Endgame (turn ~11 on): the cliff, the treadmill, the bank

By turn 10–13 home clusters are flat, combined income has fallen ~75 % (§1.4), and play becomes:
- **The relocation treadmill**: 3–4 one-square Muju moves per turn onto fresh 4-stacks within 4 AP — a joint
  shared-AP allocation, which `server/analysis/economy.ts economyForecast` (stay-in-place) cannot model
  (GR §6.7) **[game, code]**.
- **The bank decides**: White never fell below 40 after turn 9, Black never rose above 23. The player with cash
  buys raiders, punishers and blockers after the stacks are gone; the player without cannot (SD P16) **[game]**.
- **Tier-3 conversions only now**, and only durable ones on the last rich squares: Tanka on the I2 stack "mining
  4 a turn where nothing Black owned could hurt it" (only Kagari kills a Tanka) **[game]**. Kagari as a
  home-base punisher and closer, not a roaming striker (F10).
- **Upkeep insolvency ends games by resignation**: Black's stay-in-place ledger was 2 income vs 5 upkeep,
  insolvent in ~2 turns (GR §2.3). No recorded real game has ended by elimination, home occupation, checkmate,
  timeout or the draw (GR §4.3) **[game]**; the draw is the modal outcome only among scripted bots.
- **Home threats become live** when purchases stop: the cheapest invader is a 3-crystal Radi with kill radius
  10 / move reach 12; the cheapest insurance is a Muju on the corner.

### 6.4 The winning shapes as evaluable features

| Recipe component | Feature (definition) | Exists in `src/ai/evaluation.ts`? |
|---|---|---|
| Turn-1 anchor run | `Σ reserve` newly inside rectangle; anchor ∉ ∪ enemy kill radii (incl. purchases); blocking set ≥ 2 | No |
| Plants on 16s/8s, bank the rest | lifetime yield `min(reserve, …)` per purchase square; reject yield < cost | No (`placement.ts:34` uses one-turn take) |
| Kill fires proactively | for each enemy fire/lightning: own water/shadow (existing or purchasable) with `ceil(d/s)+1 ≤ 4` and lethal | No (adjacency only) |
| Punish-or-don't-stand | every enemy approach to each own unit is unreachable, or stranded and punishable next turn incl. purchases | No |
| Four-buy burst | Place phase = knapsack over the bank subject to spawn squares | No (top-2 squares per def) |
| Delay promotions | `bank − Σ_{k≤H}(upkeep − income_k) > 6–8` | No (upkeep absent) |
| Durable forward anchor | anchor area × survivability, blocking-set size | No (raw square count, 0.3) |
| Corner insurance / plug | own unit on corner; enemy control of both corner neighbours | No (±20 prior only) |
| Draw clock | `(10 − plies)/10 × sign(lead)` | No |

---

## 7. Strategic invariants a strong engine must never violate

Each is a hard check on the position *after* the engine's candidate turn (and, where marked, after the
opponent's best reply). Evidence in brackets.

1. **Never end a turn with zero legal spawn squares while you hold ≥ 3 crystals or the opponent can buy.**
   `getAllSpawnPositions(me).length ≥ 1`, prefer ≥ 3. [F1, census −8.53]
2. **Never seal your own corner's two neighbours with immobile units.** B1/A2 (I10/J9) empty or occupied by units
   that will move. [F1; §4.1]
3. **Never leave a unit worth ≥ 4 crystals on a strike-and-retreat square** for any enemy attacker, *including
   every (spawn square × affordable tier-1) pair and every affordable promotion*, unless the attacker is
   itself killable afterwards. [F2, F3, F7, F10]
4. **Never leave a unit on a strike-and-strand square unless your next-turn reply (existing units + purchases,
   ≤ 4 AP, pre-adjacency counted) kills the stranded attacker.** [SD P6, §2.3]
5. **Never buy a miner onto a square with reserve < 2 × Mining** (≥ 6 for a Muju) without a non-economic reason
   (anchor, blocker, plug). [F4, F12]
6. **Never commit an anchor whose minimum blocking set (counting units the enemy can buy into reach this turn)
   is 1**, unless the anchor itself survives every ≤4-action combination. [F5; §4.2]
7. **Never promote when `bank_after − Σ_{next H turns}(upkeepDue − forecastIncome) < 6`**, except for a specific
   kill or survival threshold this turn or next. [F9; archived Black]
8. **Never rely on a kill combination whose attackers are not pre-adjacent**: `Σ(ceil(max(0,d_i−1)/s_i)+1) ≤ 4`
   with real BFS distances, ≤ 4 lanes (2 on a corner). [F6; §2.4]
9. **Never plan chip damage across a turn boundary.** [§2.4]
10. **Never end your turn with an enemy able to reach your corner in ≤ 4 actions unless the prover shows a
    rescue** (existing units, ≤ 2 attacks, no purchases). Position rescuers before the threat. [§4.4 probe]
11. **Never leave your corner and both neighbours empty against an opponent with a Radi or a 3-crystal bank and
    an unblocked rectangle within 10 squares.** [§4.4, HOME_VICTORY]
12. **Never let a tier-2+ enemy reach a square adjacent to two or more of your soft units** (Cleave chain).
    [F14]
13. **Never turtle**: if ≥ 60 % of your units are within Chebyshev 2 of home and you own no anchor beyond radius
    4 while the enemy owns one, you are losing 2 crystals per raid. [F8]
14. **Never spend the last 6–8 liquid crystals** unless the purchase wins material now. [SD P3, P16]
15. **Never treat an `unknown` proof as safety**, and never treat a threat list scoped to existing single hits as
    complete. [F15]
16. **Never end a turn quietly when ahead and `inactivityPlies ≥ 7`** without a kill available next turn; never
    force a losing exchange when behind and the clock is near 10. [§5.2]
17. **Never buy where your own new unit blocks the path your action phase needs.** [NK:14]
18. **Never emit `END_PLACE_PHASE` unless a purchase or promotion is still affordable** (protocol invariant, but a
    wasted batch has lost real games). [NK:12,14]
19. **Never mine the centre or a pocket with an undefended DEF-1 unit when the enemy has ≥ 3 crystals and a
    rectangle within kill radius 7–10.** [§4.5]
20. **Always check whether a free promotion enables a kill this turn** (Muju→Sachita vs Sjor/Göl; Hi→Hono vs
    Mazask/Sachakuna DEF 4; Hono→Kagari vs Tanka). [F13]

---

## 8. Contradictions between sources, with rulings

**8.1 Home checkmate vs the ten-quiet-turn draw.** `SPEC.md:373-374` says nothing overrides the draw; RE §8.1a
inferred that `resolveHomeCheckmate` ignores `inactivityPlies` and is adjudicated before `endTurn`. **Verified
today** with a scratchpad script (`node --import tsx`): at `inactivityPlies = 9`, a Black Hi moving onto A1
against a lone White Muju yields `victory black home-checkmate` from `applyAction`, while the same move through
`transitionWithoutCheckmate` + `endTurn` yields `victory null inactivity` at plies 10. **Ruling: the code is
authoritative for the engine** — a *proven* checkmate resolves at the instant of the move and beats the draw;
an *unproven* occupation (rescue possible, or prover exhausted) is subject to the draw before the next
`startTurn`. This wants a J-log ruling; until then the engine models exactly this ordering.

**8.2 First-player advantage.** June (six actions): none. September (four actions): Rush mirrors White 15/20 and
18/20, Black 0/20; Balanced mirrors even; handicap census: 3 crystals brings the first round to "Close".
**Ruling:** under current rules the advantage is real in *racing* lines (symmetric rush, first strike wins) and
not demonstrated in balanced ones; the census measures one round with a hand-weighted index. For engine
measurement every match must be seat-mirrored with paired seeds; the ladder should run at handicap 0 *and* 3
and report both; the engine's opening knowledge must be keyed by handicap.

**8.3 Best White first turn.** Guide: H3 (n=1 win, exposes the 16). Census: E6/F5 (+3.66/+3.56, static one-round).
Route screen: F5/E5/D5 anchors lost 0/37–69 games vs Rush on older maps. **Ruling:** the shared content —
Hi sortie, miners home, 21–27 spawn squares, bank 6 — is settled; the square is not. F5-class anchors have a
blocking set of 1 and no win behind them; H3 has one win and the richest exposed square under v2.8; E6 is
untested. The engine should *search* turn 1 with a threat model that includes Black's turn-2 purchases, not
book it, until self-play on v2.8 exists.

**8.4 Bank vs spend.** Eval prices bodies at ~3× cash (CA); guide says bank (SD P16); scripted bots end with
~0.5 crystals (LH). **Ruling:** §1.6 — the liquidity floor (6–8) and the spawn-capacity ceiling are defensible;
the conversion ratio is uncalibrated and must be tuned, not asserted.

**8.5 "Radi is a dead unit"** (GR §4.2, from one game with zero lightning purchases) vs the handicap census
(Radi is Black's best 3-crystal reply in 27 % of openings) and HOME_VICTORY (Lightning I = 106/399 invaders).
**Ruling:** Radi is a positional unit — spawn-strike on DEF-1 targets (kill radius 10), rectangle blocking,
home threat — and the purchase generator must keep it; its absence from one game is not evidence.

**8.6 "Promoting a plant is never worth it for income"** (STRATEGY_GUIDE §1, ALTERNATE_MAP, both on the
Mining-4/5 catalogue) vs v2.8 Mining 3/5/8 (J-020). **Ruling:** the code wins — net 3/4/6 — but J-020 itself
says this is design intent, not a measured outcome, and promoted plants are DEF-3/4 raid magnets. Untested.

**8.7 Guide §3 element claims.** "Only fire/lightning tier 2+ kill plants", "water, metal and shadow cannot
scratch a Muju", "Göl is immune to plants" are all wrong against the catalogue the guide was written under:
Hi kills a Muju (3 ≥ 3), Karanlık kills a Muju (4−1 = 3), Sachita (2) and Sachakuna (3) kill a Göl (DEF 2).
**Ruling:** the table in §3.2 is authoritative (SD §0.4, RE §4.4).

**8.8 Archived-game bookkeeping.** Guide: "Codex lost four fire units" — replay says five; "6 upkeep" at the end —
fixture says 5; bank series "22 → 21 → 18 → 15 → 9 → 4" — actual is 21, 18, 15, 9, 4 with the 22 from turn 6
(GR §2.4, SD §0.4). **Ruling:** the fixture replay (byte-identical under v2.8) is authoritative.

**8.9 Evaluator mining term.** LH §3.3 (quoting the depth-economy REPORT) says the production evaluator uses the
*nominal* Mining stat; CA §2 says `miningPotential` → `projectedIncome` = `min(Mining, reserve)`. Verified today:
`src/ai/evaluation.ts:155-157` → `src/game/mining.ts:12-15` uses actual reserve. **Ruling:** the doc claim is stale;
the term is exact for one turn and blind beyond it.

**8.10 `getAllSpawnPositions` calls per evaluation.** CA says four; ET measured six (three sites × two players =
58 % of 71.9 µs). Verified: `evaluation.ts:148, 269, 283`, each in a per-player feature. **Ruling: six.**

**8.11 Tactical fixture count.** `docs/AI_IMPLEMENTATION_STATUS.md` (and ET, tagged [D]) say 15 positions / 30
cases; CA and LH read `lab/ai/fixtures.ts:32-33` as 14 × 2 = 28. **Ruling: 28**; the doc is stale by one.

**8.12 Map and price numbers in prose.** NK:26 "new rooms are on the 480 map"; dossier "0/4/8/10, 520";
`SPEC_AUDIT.md` "520, schema 5"; guide "60-crystal pockets at G2–I3/B8–D9", "buy on 8s and 10s"; DOUBLE_COSTS
prices; `lab/solver/model.ts:23 ACTIONS = 6`. **Ruling:** v2.8 is 504, 0/4/8/16, pockets are 2×2 blocks of 16 at
H2–I3 and B8–C9, prices 3/4/5 · 7/8/9 · 15/16/17, four actions, schema 6. Every six-action `killFrontier` number
in `lab/results/current-static` overstates assembleable damage.

**8.13 The centre.** Census top lines end on central squares; the route screen says centre anchors lose to rush;
the real game ignored the centre. **Ruling:** §4.5 — a durable mid-game asset, not an opening.

**8.14 MCTS.** `AI_ENGINE_README.md`/`AI_IMPLEMENTATION_STATUS.md` describe adversarial MCTS; CA measured 0
iterations in 138/140 decisions. **Ruling:** the shipped engine is tactical overrides → ≤20 bounded candidates →
one-ply static ranking. See `ENGINE_GAPS.md`.

**8.15 Corner plug vs corner sealing.** ET recommends a plug term; NK:9 lost by filling the corner. **Ruling:**
compatible — one own unit on the corner square removes one spawn square and blocks no rectangle (own units never
block); the loss came from three units filling B1/A2 as well. Invariant 1 governs.

**8.16 Loss attribution.** ET says "three of three logged losses involve home/anchor geometry"; the napkin holds
four Muju loss rows (9 spawn, 10 purchase-reach, 11 reach + depletion + anchor, 13 turtle). **Ruling:** four
losses; two are pure geometry, one is threat modelling, one is both plus economy.

---

## 9. What is not known

- Any win rate on the v2.8 map; whether H3/E6/F5 is best; whether the 3+5+8 plant line is strong or a raid magnet;
  what beats the forward-anchor fresh-Hi raid from the losing side; whether "never stand on a strike-and-retreat
  square" converts fragile pieces into deterrents or the opponent simply declined; how large the first-player
  edge is at strong play; how often strong play draws; whether humans play anything like the bots (nobody has
  played the game — `DESIGN_REVIEW §6`).

---

## Addendum 2026-09-14: sachita-f13-invariant20-misstated

Targeted gap-fill answering `understand/completeness-critique.md:112-160` (Gap 2). Full working, every number
reproduced from the shipped engine over `tests/fixtures/codex-claude-2026-09-12.json`:
`docs/hard-ai/understand/gapfill-sachita-f13-invariant20-misstated.md`, with read-only probe scripts
`understand/gapfill-sachita-probe{,2,3,4,5,6,7}.ts`. **[V] = verified by running the engine here.**

**Corrections to this document.**

1. **`:357-358` "the adjacent Sjor" is wrong. [V]** H2 = (7,1), H6 = (7,5), Manhattan 4. The Sachita walk
   `H2→H5` costs **3 AP** at SPD 1; attacking H6 from H4 is not legal.
2. **`:544-545` "the free Sachita kill" is wrong. [V]** `getPromotionCost` = 9 − 5 = **4 crystals**
   (`promotion.ts:9-23`, `units.ts:160,172`), bank 10 → 6, plus **1 crystal/turn upkeep forever**
   (`upkeep.ts:5,13`). Only the action cost is zero. The full line
   (`PROMOTE` 0 AP, `MOVE H2→H5` 3 AP, `ATTACK H6` 1 AP) consumes the **entire** turn, AP left 0.
3. **The corpus's counter-claim about a "16-stack" is also wrong. [V]** H2 held **7** at turn 3
   (base 10 on the archived `PRE_CENTRAL_MAP`, minus one Muju harvest of 3). 16 is the v2.8 value
   (`resourceMap.ts:6-17`); the fixture has G2 = 10 and I2 = 10, so it is not the v2.8 map.

**Adjudication of the line itself. [V]** Black's reply from its *full* legal reply set (9 crystals; spawn set
collapses to exactly **I10 and J10** once the H6 anchor dies): the only affordable one-shot on Sachita
(DEF 3) is **Hi 3c** (ATK 2 +1 vs plant = 3), reaching H6 in 3 AP + 1 AP attack = exactly 4.
`server/analysis/tactics.ts replyTo` returns **`proven_possible`**, witness
`+fire_1@I10 → H6, 3+1 AP/3 crystals, kill`. At the start of White turn 4, against the move White actually
played: value+bank **27 vs 32** (differential W−B −2 vs −3 — a wash), **income 6 vs 10 (losing)**, White
**3 units and nothing east of G2 (losing on position)**; Black's Hi on H6 restores the very anchor the kill
destroyed. **Verdict: material unclear, income losing, position losing. The losing player's essay
(`docs/strategy-guide-codex-vs-claude.md:54-62`) was right; `STRATEGY_GUIDE-2026-09-12.md:82` mistake #1 was
wrong about this line.**

**But the kill was correct — with the wrong instrument. [V]** `singleThreats` finds **7 lethal lines,
complete**; my exhaustive sweep finds **955 distinct kill plans (148 at 3 AP, 807 at 4 AP)** and the only
3-AP attacker is a **purchased Göl at G2** (`shadow_1`, 4c; shadow/water are the same pair, so 2 ≥ 2):
`BUY shadow_1@G2` → `MOVE H5` (2 AP) → `ATTACK H6` (1 AP) → `MOVE H3` (1 AP), **12 retreat squares**, after
which `replyTo` returns **`proven_impossible`** (`completeness: complete`, 15 nodes, no omitted classes) —
Black has **no capture anywhere**. At White turn 4 that line stands at value+bank **35 vs 30 (+5)**, income
9 vs 9, White spawn 19, **Black spawn 0**. The Sjor's real value was its 15-square spawn rectangle
(`getSpawnRectangle(J10,H6)`), not its `unitValue = 4` — cf. G18.

**Larger finding, verified. [V]** In this exact position White had a **forced win on turn 3**:
`BUY lightning_1@G1` (Radi, 3c, SPD 3) → G4 → G7 → G10 → **J10** (BFS distance exactly 12 = 4 × SPD 3);
`applyAction` returns `phase: 'victory', winner: 'white', victoryReason: 'home-checkmate'`, and
`analyzeHomeDefense` proves `mate` by damage bound in **0 nodes** (Black's spawn set is 0 because the corner
is inside every rectangle; Muju@J9 does max(0, 0−1) = 0 into lightning; Sjor@H6 needs 6 AP). F2 and G2 also
reach. The window was **exactly one turn**: Black's turn-3 `BUY plant_1@I10` sealed the only approach, and
its famous turn-4 `Muju@J10` "home insurance" arrived a turn late. *Caveat:* verified under today's engine —
`victoryRule` is `undefined` on the fixture and the home rules are active unless it is `'elimination'`
(`homeCheckmate.ts:173`, `turn.ts:23`); whether the live 2026-09-12 room adjudicated this way is unverified.

**F13, restated.** *"Kill search priced without the reply, and scoped to units already on the board."* The
archived instance is **not** a declined *promotion*-kill; it is a declined **purchase**-kill (the 4-crystal
Göl, proven unanswerable) and a missed 3-crystal home race. Drop "Free promotion kill declined" and drop
F13 from the `ENGINE_GAPS.md:62` (G1) evidence list — the reply here shows the kill is bad **for us**, not
bad for them. The `:114` (G3) and `:397` (G17) citations stand, with the Göl as the better worked instance.

**Invariant 20, restated.** *"Enumerate purchases and promotions on equal terms inside the kill search, and
price every kill three ways before taking it: (a) crystals spent — a tier-2 promotion is 4 crystals plus
1/turn forever, never free; (b) the attacker's value left standing after the opponent's full reply
**including their purchases**; (c) what the target was anchoring — killing the enemy's only forward anchor is
worth its spawn rectangle, not its price."* Two new sub-rules:
**20a.** Never end a turn with a unit worth ≥ 2× the target on a square one affordable enemy tier-1 purchase
can reach; `singleThreats` already reports `retreat N` per line — treat `retreat 0` as a hard penalty, not a
tiebreak. **20b.** Test the home race first every turn: for each affordable tier-1 unit and legal spawn
square, `getMoveCost(spawn, enemyCorner, speed, board) ≤ actionsRemaining`; an occupied corner blocks every
enemy rectangle, so the defence prover usually returns `mate` on the damage bound alone.

**New engine defect recorded. [V]** `searchTurn(objective:'killTarget', categories:['combined'])` returns the
first witness in move order, not a cost-minimal one: here it promotes Sjor@B2 → Straumr *and* Muju@H2 →
Sachita for **8 crystals, retreat 0**, where `singleThreats` does the same kill for **4 crystals, retreat 12**
(`tactics.ts:208-216` never penalises spending). Any engine reusing `searchTurn` as a tactical override buys
the expensive kill. Fits G3's `cost / actionsToKill` MVV-LVA note.

**Unchanged and confirmed:** `:356` "Sachita kills a Sjor or Göl alone (1 + 1 = 2 ≥ 2)" **[V]**;
`:544` "Do not promote" as turn-3 advice **[V]** — but strike its "one recorded exception", which is the
losing option; `:352-355` "Radi is a positional unit, not a dead one" **[V]**, now with a concrete win.

---

## Addendum 2026-09-14: scripted-results-may-be-cap-adjudication-artifacts

Full working: `docs/hard-ai/understand/gapfill-scripted-results-may-be-cap-adjudication-artifacts.md`.
Answers `understand/completeness-critique.md` Gap 3 ("every scripted W/L number quoted here may be a
cap-adjudicator artifact"). All counts below are recomputed from the committed JSONL, not from any
summary file.

**The hypothesis is false for the September studies and true for the June one this document uses as
their counterweight.**

- **1 adjudicated game in 9,056** across `four-actions-2026-09-12` (560; **0**),
  `alternate-map-2026-09-12` (2,736; **0**) and `depth-economy-2026-09-09` (5,760; **1**) —
  `adjudicationRate` 0.000 / 0.000 / 0.00017 **[measured]**. No game in any of the three ended in
  the cap-tie `winType:'draw'` branch either. The one cap (`scripted-C`, `C-17-2-1`, 121 rounds,
  110 kills) is in the `Plant1`/`Plant2` cell, which no document quotes, and both banks were 0, so
  the `+ resources` term did not touch it.
- **Every W/L/D line quoted from those three studies reproduces exactly and survives restriction to
  rule-defined terminals** (with `home-checkmate` counted as a fifth rule terminal, §below).
- **§4.5 / §8.13 (the centre) survive unqualified.** D5 vs Rush is **0/37/3 on both maps** exactly;
  E5/F5 vs Rush is **0/69/11 in 80 alternate-map games** exactly, and those 69 losses are 57
  `elimination`, 11 `upkeep-elimination`, 1 `home-checkmate` — **zero adjudications**. The centre
  ruling rests on play, not on a material-plus-cash tiebreak.
- **§5.1 (the draw clock) survives and hardens.** 20.36 % → 23.57 % (four-actions), 190/320 = 59.4 %
  (alternate map), 54.7 / 55.5 / 62.1 % (depth-economy sustain), Balanced-vs-Turtle 0/0/40 on all
  four maps: **every one of those draws is an `inactivity` draw**, none a cap tie. The draw problem
  is a property of the rules, not of the harness.
- **§5.4 / §8.2: the September half survives; the June half does not.** `Aware:Rush` mirror White
  **15/20, Black 0/20, 5 draws on both maps** is 15 `elimination` + 5 `inactivity`, 0 % adjudicated;
  the four-actions mirror White 18/20 is 18 `elimination` + 2 `inactivity`, 0 % adjudicated. But
  "June 2026: white 48–53 % across 400-game mirrors" is `lab/results/e3-first-player`, whose own
  `summary.csv` reports **`adjudicationRate` 0.940 for the `AntiRush` mirror and 0.963 for the
  `Balanced` mirror**, with mean end rounds **121.0** and **119.1** against a 120-round cap. 600 of
  its 1,400 games are the runner's `material + bank` score, not play. Only the `Rush` mirror
  (400 games, **0 %** adjudicated, White 48.25 %) and `Greedy` (9.2 %, 52.75 %) are real.
  **Revised ruling:** the §8.2 ruling stands, but the live contradiction is narrower than stated —
  six-action `Rush` found no White edge (clean, 400 games) while four-action `Aware:Rush` finds
  White 15/20 and 18/20 (clean). That is a rules-change question, and re-running E3 under current
  rules settles it. §5.4 and LH §5.13 should carry the 94–96 % adjudication share beside the June
  number.
- **Sensitivity to dropping `+ resources`: essentially nil where it has ever fired, decisive where
  it would fire next.** Across **all 16,997** adjudicated games in `lab/results/`, mean bank per
  side at a capped terminal is **0.393 crystals** (median 0, **max 3**); re-scoring on
  `onBoardMaterial` alone leaves **99.38 %** of verdicts identical, converts 99 to draws and
  reverses **7 (0.041 %)**. *But* in `alternate-map/main` the `Balanced`-vs-`Turtle` cell is
  material-tied at the sampled round in **158/160** games and the `Balanced` mirror in **77/80**,
  with Black holding a median **3–4 crystal** bank edge and both sides averaging ~10.5 banked. Had
  the cap decided those instead of the clock, the bank term alone would have given
  **Black 232 of 235** — turning the 0/0/40 draw lines into a Black sweep, with a systematic penalty
  on White for moving (and spending) first. That is G11's uncalibrated quantity acting as the whole
  decision. **Do not re-enable cap adjudication for a ladder without fixing the scorer.**
- **Why the split is so clean:** `inactivityRule`. Every corpus run with the ten-quiet-turn draw
  **on** is ≤0.03 % adjudicated (`four-actions` 0, `alternate-map` 0, `depth-economy` 0.03 %,
  `balance-followup` 0); every corpus run with it absent or `'off'` is 8.6–52.2 %
  (`map-d` 52.2, `e6` 47.3, `e3-first-player` 44.7, `e5` 38.1, `home-victory` 37.4, `tier3-cap` 26.4,
  `e7` 15.6, `e4` 8.6). `upkeep-draw-2026-09-08` isolates it in one experiment: the `off` arm is
  **260/960 = 27.1 %**, both `on` arms are **0/960** **[measured]**. With the clock on, a game can
  only reach round 120 by killing at least once every ten player turns, so stalls terminate as
  `inactivity` at round ~12–30 and the cap survives only as a safety net.
- **Two corpus defects found on the way [measured]:** (1) `home-checkmate` is a rule terminal
  (`src/game/types.ts:116`) missing from `WinType` (`lab/harness/types.ts:82-90`); it accounts for
  **212 alternate-map games** (19 on the current map's main screen), so the question's four-name
  restriction *removes legitimate wins* (main/current 93/31/196 → 76/29/196). It should be counted
  as a fifth rule terminal. (2) The June `muju-lab-game-v1` records score
  `material + bank + finalQueueValue` — a purchase-queue term the game no longer has. Adding it
  reproduces all 16,997 recorded verdicts exactly; without it 672 `e6` games look inverted. Nothing
  in `GameRecord` records which formula produced an `adjudication`, so adjudicated win rates are not
  comparable across eras.
- **The reporting failure was ours, not the lab's.** `four-actions/summary.json` carries
  `"caps": 0` per cell, `alternate-map/summary.json` carries `"caps": 0` plus a full `reasons` block
  per map, and `depth-economy/REPORT.md:45,80` carries explicit "Safety cap(s)" rows; each runner
  declares a cap-is-unresolved policy (`four-actions/run.ts:30`, `alternate-map/README.md:19`,
  `depth-economy/report.py:99`). `lab/docs/EXPERIMENTS.md:88-89` already warns that
  adjudication-dominated cells "measure the adjudication rule as much as the bots". None of that
  propagated into this document. Every future W/L citation here should name its adjudication share.

---

## Addendum 2026-09-14: multi-turn-economy-arithmetic-unverified

Targeted gap-fill re-deriving **every** multi-turn economic quantity in §1.2–§1.7 **by simulation**, not by
arithmetic: `applyAction` (`src/ai/simulate.ts:25`) driven from `createInitialGameState()`
(`src/game/board.ts:203`) under `node --import tsx`, reading the engine's own `lastIncome`, `lastUpkeep`,
`resourcesGained` and live `resourceLayers`. Full working, tables and witness lines:
`docs/hard-ai/understand/gapfill-multi-turn-economy-arithmetic-unverified.md`.
**[S] = re-derived by simulation here.**

**Corrections to this document.**

1. **`:112` the stationary-trio series is wrong. [S]** It is **`6,6,5,3,1,1,1,1`** (Σ 24), not
   `6,6,6,3,1,1,1,1` (Σ 25 against 24 crystals). Turn 3 is 5 because the Muju's square A2 holds only 2 by
   then (`reserveTake`, `mining.ts:5`). Both seats are identical. Worse, only **`6,6,5,3,1` = 21** is ever
   bankable: `progressThisTurn` is set only by a kill (`simulate.ts:101`) and `INACTIVITY_LIMIT = 10`
   (`inactivity.ts:3`), so a capture-free game is a **draw at the end of Black's turn 5**.
2. **`:113` "Two extra Mujus on the remaining home 8s (C1, A3)" is unreachable as written. [S]**
   `getAllSpawnPositions` returns exactly **one** square at game start — **A1 (0,0)** for White, J10 for
   Black (`spawning.ts:8-29,98-118`): the three anchors span only the 2×2 block x,y ∈ [0,1]. There are
   **three** free home 8s (A1, C1, A3), and C1/A3 require a turn-1 reposition (cheapest: Hi B1→C2→C3, 2 AP)
   before anything can be placed on them. For the same reason `:115`'s "two Hi/Radi (3+3)" is **not legal on
   turn 2** from the starting position.
3. **`:113` "roughly 12/turn for about four turns" is wrong. [S]** Exhaustive search (1,981,995 nodes) over
   every legal Muju purchase and promotion in the 3×3 corner, after the Hi→C3 unlock: the maximum
   home-cluster drain is **5, 8, 13, 15** (mean **10.25**/turn; **41 of 48** in four turns), and it costs
   five Mujus (25 crystals) plus a promotion. Turn 1 is hard-capped at 6 (bank 0, no purchase possible) and
   turn 2 at 9 (bank 6 ⇒ one Muju). §1.3's own construction (Mujus on C1 and A3) measures **6, 9, 11, 8**
   and strands 16 crystals. A trio that never moves gets **6, 6, 5, 3** and strands **24 of 48** — half the
   cluster — because three home 8s are never occupied.
4. **`:187` the T3-on-turn-3 arithmetic is wrong on every term; the conclusion holds only for Plant. [S]**
   The Water/Fire line reaches **bank 7** at the turn-3 start (`lastUpkeep.paid = 1`) and the engine offers
   only the two 4-crystal T1→T2 promotions — T3 is **rejected**, earliest **turn 4**. The line that does
   work is Plant: `6 −4 = 2`, **`+8`** (Sachita mines 5, A2 still held 5), **`−1` rent**, `= 9`, `−8`,
   leaving **1** — and the unit is **Sachakuna**, not Aegirinn.
5. **Earliest T2/T3 per element, exhaustive, upkeep charged at turn start before Place. [S]**
   Handicap 0 (both seats): Fire T2 2 / T3 4 · Water 2 / 4 · Plant **2 / 3** · Lightning 3 / 4 ·
   Shadow 3 / 4 · Metal 3 / 4. Black at handicap 3: Fire **2 / 3** · Water **2 / 3** · Plant 2 / 3 ·
   Lightning **2** / 4 · Shadow 3 / 4 · Metal 3 / 4. These are global optima, not just search optima:
   turn-1 income is 6 for any move sequence (7 for Black-with-handicap), and a T2 promotion on turn 2 leaves
   bank 2, below the cheapest body, so turn-2 income is capped at `1+2+3 = 6` for Fire/Water and
   `1+2+5 = 8` for Plant — only Plant clears the 7 needed for T3 on turn 3.
6. **`:115` "4 buys … a promotion" has an unstated consequence. [S]** Starting units are not
   `placedThisTurn`, so at **handicap ≥ 4 Black can promote on turn 1** — earliest T2 is **turn 1**, and at
   handicap 5 **Sachakuna lands on turn 2**. White can never do this: `createInitialGameState` opens the
   game in `phase: 'action'` (`board.ts:240`), so **White has no turn-1 Place phase at any bank**.
7. **`:105-108` the discounted-value table is the right arithmetic under the wrong model. [S]** Those six
   numbers reproduce exactly as `Σ_{t=1..12} 0.9^t · take_t` with **no upkeep** (ET §5.4,
   `understand/engine-techniques.md:1256`, horizon at `:2206`). Recomputed at **γ = 0.9, H = 6, rent charged
   from the unit's next own turn**, the 16-cell ranking **inverts at the top**:
   **Muju 11.59 > Sachita 9.53 > Sjor = Inyan 8.43 > Mazask 8.27 > Sachakuna 7.05 > Tanka 5.75 >
   Straumr 5.12 > Aegirinn 4.95 > Hi 4.22 > Karanlık 1.80 > Hono = Gölge 0.90 > Radi = Göl 0 >
   Kagari −2.42 > Umeme −3.32 > Kimubunga −6.63.** On an 8: Muju 6.59 > Sjor = Inyan 6.19 > Hi 4.22 >
   Sachita 3.61 > Mazask 3.27 > Straumr 2.87 > Sachakuna 0.57 > Tanka 0.21. **`:106`'s "on a 4-cell every
   miner is worth 3.1–3.6" is false for 8 of the 18 units**: Radi/Umeme/Kimubunga/Göl mine 0, and with rent
   every tier-2 and tier-3 on a 4 is ≤ **+0.28**, down to −6.63. Six turns of rent is 3.32 (T2) / 6.63 (T3)
   discounted — comparable to the entire extraction value of an 8-cell, which is why **the 3/5/8 climb is
   tempo, not income**: on a 16 it is worth 7.05 for 17 crystals against a plain Muju's 11.59 for 5.

**Verified as printed, no change needed [S]:** the whole depletion table `:99-104` (all 18 cells); the
mining-rate list `:96-97`; the net-income-per-turn table `:159-160` (`3/4/6 · 2/2/2 · 2/1/1 · 0/0/0 ·
1/0/−1 · 0/−1/−2`); `UPKEEP_BY_TIER = {1:0,2:1,3:2}` with the legacy `4:3` (`upkeep.ts:5`); uniform
promotion costs 4 and 8 across all six elements (`promotion.ts:9-23`); tier-1 units never released
(`upkeep.ts:20,25`); rent charged at the owner's turn start before healing and Place (`turn.ts:30-33`);
a promotion's new rent starting next own turn (`turn.ts:30-33` + `board.ts:279`); and the 3/5/8 climb
collecting 16 for 5+4+8 with 1 rent (`tests/game/expansion-economy.test.ts:7-29`).
