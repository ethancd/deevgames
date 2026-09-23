# What has been learned about playing Muju well (prose corpus, 2026-09-01 → 2026-09-14)

Survey written 2026-09-14 for the Hard AI effort. It reads every prose strategy
document in the repo, re-derives the numbers from the **live v2.8 catalogue**
(`muju/src/game/units.ts`, `muju/src/game/resourceMap.ts`), and separates three
kinds of claim throughout:

- **[CODE]** — verified by reading `muju/src/game/*` or by replaying the archived match.
- **[GAME]** — observed in a real recorded game (won or lost), with the fixture citation.
- **[SIM]** — a scripted-bot / lab measurement (fixed policies, not expert play).
- **[DOC]** — asserted in prose with no measurement behind it.
- **[INFER]** — my own derivation, flagged as such.

Nothing below is a solved-game claim. The strongest single piece of evidence in
the whole corpus is **one** 17-turn game, and its own authors say so.

---

## 0. The evidence base, and how stale each source is

### 0.1 The corpus

| Source | Date | Kind of evidence | Ruleset it was written under |
|---|---|---|---|
| `docs/STRATEGY_GUIDE-2026-09-12.md` | 09-12 | One won game (Claude, White) | v2.6, 4 actions, **496-crystal map** |
| `docs/strategy-guide-codex-vs-claude.md` | 09-12 | Same game, loser's essay (Codex, Black) | same |
| `muju/JUDGMENT_LOG.md` J-019, J-020 | 09-12, 09-13 | Designer rulings | current |
| `docs/EXPANSION_ECONOMY-2026-09-13.md` | 09-13 | Release note for v2.8 | **current** |
| `docs/FOUR_ACTIONS_REPORT-2026-09-12.md` | 09-12 | 560 scripted games | v2.5→v2.6 transition, 496 map |
| `docs/ALTERNATE_MAP_REPORT-2026-09-12.md` | 09-12 | 2,736 scripted games | 496 vs 480 maps |
| `docs/BALANCE-2026-09-11.md` | 09-11 | Release note (v2.3/v2.4) | six actions, superseded |
| `docs/DOUBLE_COSTS-2026-09-10.md` | 09-10 | Release note (v2.2) | **prices superseded next day** |
| `docs/MCP_TOOL_TAPS.md` | 09-13 | Two lost agent games → habits | v2.6, 480 map |
| `docs/ANALYSIS_TOOLS.md` | 09-13 | Analysis-API contract | current |
| `public/skills/muju-hono-tanka/SKILL.md` | 09-13 | Player-facing protocol skill | **current (names 504/8/16/3-5-8)** |
| `public/skills/muju-time-awareness/**` | 09-12 | Clock management | current |
| `docs/hard-ai/understand/napkin-snapshot.md` | 09-12/13 | Three lost games, postmortem rows | 480 map |
| `docs/HOME_VICTORY-2026-09-07.md` | 09-07 | 2,240 scripted runs | v1.3, 340 crystals, tier 4 |
| `docs/UPKEEP_DRAW-2026-09-08.md` | 09-08 | 9,280 scripted games | v1.6, six actions, 20-turn draw |
| `docs/DRAW_TEN-2026-09-08.md` | 09-08 | Historical screen | v1.9 |
| `docs/TIER3_CAP-2026-09-08.md` | 09-08 | 12,480 games | v1.5 |
| `docs/CLEAVE_RELEASE-2026-09-07.md` | 09-07 | Correctness only | v1.4 |
| `docs/DESIGN_REVIEW.md` | 09-08 | Design critique | v1.4 (24 units, tier 4, 308 crystals) |
| `docs/STRATEGY_HANDOFF-2026-09-08.md` | 09-08 | Video-curriculum handoff | v1.7 |
| `../docs/game-design-dossier.md` §2.3 | 09-10 | Portfolio summary | v2.2, six actions, 520 crystals |

**The archived match.** `tests/fixtures/codex-claude-2026-09-12.json` is the
actual server record of the game both strategy essays describe. Verified by
replay of the JSON:

- `finalState.phase = "victory"`, `winner = "white"`, `victoryReason = "resignation"`, `turn.turnNumber = 17`.
- Final banks **White 57 / Black 4** — exactly the guide's headline number.
- Gross income **White 223 / Black 175**; upkeep paid **White 19 / Black 54**.
- `initialState.board.initialResourceLayers` sums to **496** — the game was
  played on the v2.4 map, *not* today's 504-crystal v2.8 map.
- Detailed recording starts at revision 5 (White turn 3, `recordingStart.complete = false`),
  but the `commands` array preserves turns 1–2, so the opening is recoverable.

### 0.2 Current rules, verified in code (the yardstick for everything below)

| Fact | Value | Code |
|---|---|---|
| Actions per turn | **4**, shared across the whole army; `isActionsPerTurn` accepts only 4 | `src/game/rules.ts:9-13` |
| Board | 10×10, A1 = (0,0) = White home, J10 = (9,9) = Black home | `src/game/board.ts:16,175-182`; `src/components/MapPainter.tsx:119,125` |
| Movement | **orthogonal only**, up to `speed` squares per action, cannot pass through or end on an occupied square | `src/game/movement.ts:20-32` |
| Adjacency (attacks) | Manhattan distance 1 — **no diagonals** | `src/game/board.ts:299-324` |
| Combat | `max(0, ATK + elem) >= DEF - damageTaken` ⇒ kill; otherwise damage accrues | `src/game/combat.ts:80-128` |
| Element modifier | ±1, floor 0; Fire/Lightning → Plant/Metal → Water/Shadow → Fire/Lightning; same pair = neutral | `src/game/elements.ts:25-29,76-114` |
| Healing | all damage resets at the **owner's** turn start; a 5-action combo cannot span two turns | `src/game/board.ts:277,287` |
| Cleave | 1 attack, +1 more per *killing* blow, capped at the unit's tier (cap removed 2026-09-23, `muju-phasing-4`); each attack costs 1 action | `src/game/combat.ts:12-17` |
| Haste | purchased and promoted units act **immediately** (`canActThisTurn: true`) | `src/game/building.ts:11-14` |
| Promotion | pay the cost difference; **not** on the purchase turn; once per unit per turn; tier 3 terminal | `src/game/promotion.ts:44-58`; `src/game/units.ts:262-283` |
| Income | end of **your** turn, every owned unit takes `min(Mining, reserve)` from its own square | `src/game/mining.ts:5-34` |
| Upkeep | tier 1/2/3 = **0 / 1 / 2** per own turn; tier-1 units can never be released | `src/game/upkeep.ts:5,20,25` |
| Draw | 10 consecutive completed quiet player turns; **only an attack kill resets it** | `src/game/inactivity.ts:3-11`; `src/game/turn.ts:96-99`; J-019 |
| Home win | a unit on the enemy corner at the **start of your own turn** wins | `src/game/turn.ts:23-27` |
| Home checkmate | if no legal defender reply removes the occupier, the win is immediate | `src/game/homeCheckmate.ts:171-180` |
| Spawn rectangle | corner→anchor inclusive rectangle; **any** enemy inside voids that anchor entirely | `src/game/spawning.ts:8-59` |
| Home blocks everything | every rectangle contains the home corner, so an enemy on your corner voids **all** anchors | `src/game/spawning.ts:8-29`; `src/game/homeCheckmate.ts:53-55` |
| Turn order | (your turn ends) income → quiet-clock/draw → opponent's home-win check → elimination → upkeep → heal/reset → Place → 4 actions | `src/game/turn.ts:19-34,92-104` |

**v2.8 catalogue** (`src/game/units.ts:5-233`), with upkeep and derived net income added:

| Unit | El | T | ATK | DEF | SPD | MINE | Cost | Upkeep | Net/turn on a full square | Move-only reach (4AP) | Move+attack kill radius |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Hi | fire | 1 | 2 | 1 | 2 | 1 | 3 | 0 | +1 | 8 | 7 |
| Hono | fire | 2 | 3 | 1 | 2 | 1 | 7 | 1 | 0 | 8 | 7 |
| Kagari | fire | 3 | 4 | 2 | 3 | 1 | 15 | 2 | −1 | 12 | 10 |
| Radi | lightning | 1 | 1 | 1 | 3 | 0 | 3 | 0 | 0 | 12 | 10 |
| Umeme | lightning | 2 | 2 | 1 | 4 | 0 | 7 | 1 | −1 | 16 | 13 |
| Kimubunga | lightning | 3 | 3 | 1 | 5 | 0 | 15 | 2 | −2 | 20 | 16 |
| Sjor | water | 1 | 2 | 2 | 1 | 2 | 4 | 0 | +2 | 4 | 4 |
| Straumr | water | 2 | 2 | 3 | 1 | 2 | 8 | 1 | +1 | 4 | 4 |
| Aegirinn | water | 3 | 3 | 4 | 2 | 3 | 16 | 2 | +1 | 8 | 7 |
| Göl | shadow | 1 | 2 | 2 | 2 | 0 | 4 | 0 | 0 | 8 | 7 |
| Gölge | shadow | 2 | 3 | 2 | 2 | 1 | 8 | 1 | 0 | 8 | 7 |
| Karanlık | shadow | 3 | 4 | 2 | 3 | 2 | 16 | 2 | 0 | 12 | 10 |
| **Muju** | plant | 1 | 0 | 3 | 1 | **3** | 5 | 0 | **+3** | 4 | — (ATK 0) |
| **Sachita** | plant | 2 | 1 | 3 | 1 | **5** | 9 | 1 | **+4** | 4 | 4 |
| **Sachakuna** | plant | 3 | 2 | 4 | 1 | **8** | 17 | 2 | **+6** | 4 | 4 |
| Inyan | metal | 1 | 1 | 3 | 1 | 2 | 5 | 0 | +2 | 4 | 4 |
| Mazask | metal | 2 | 2 | 4 | 1 | 3 | 9 | 1 | +2 | 4 | 4 |
| Tanka | metal | 3 | 2 | 5 | 2 | 4 | 17 | 2 | +2 | 8 | 7 |

Promotion costs are universal: **T1→T2 = 4, T2→T3 = 8** (cost differences in the
table above). Starting trio is Hi / Sjor / Muju for both seats (`units.ts:288`).

"Move-only reach" = `4 × speed` squares along an open orthogonal path.
"Move+attack kill radius" = `3 × speed + 1`: three move actions then one attack
on an adjacent enemy. Both assume an unobstructed path; blockers make real reach
shorter, which is why several docs insist you count **legal paths, not distances**.

### 0.3 The v2.8 map, verified (`src/game/resourceMap.ts:6-17`, 504 crystals)

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

Composition: 18 empty, 54 ordinary (4), 20 shelf/home/centre (8), 8 rich (16) = **504**.

- **White home cluster** A1,B1,C1,A2,B2,A3 = 6 × 8 = **48**. Black's mirror J10,I10,H10,J9,I9,J8 = 48.
- **Rich expansions**: NE **H2,I2,H3,I3** = 4 × 16 = **64**; SW **B8,C8,B9,C9** = 4 × 16 = **64**.
- **Central 8s**: F4, D5, E5, F5, E6, F6, G6, E7 = 8 × 8 = **64**.
- **Empty approaches**: D1–F3 and E8–G10, 9 squares each, traversable and spawnable, worth nothing.
- Crystals within Chebyshev radius 3 of A1 = **76**; radius 4 = **108**.

### 0.4 Stale numbers in the prose (checked against code — use this table before quoting any doc)

| Doc claim | Where | Status |
|---|---|---|
| "roughly 110 crystals within three squares of home" | STRATEGY_GUIDE §1 | **Stale.** On the 496 map, Chebyshev ≤3 of A1 = 84, ≤4 = 116. On v2.8: 76 and 108. |
| "two contested 60-crystal pockets … (G2–I3 and B8–D9)" | STRATEGY_GUIDE §1 | **Stale shape and value.** Today's pockets are 2×2 blocks of 16s: **H2–I3 = 64** and **B8–C9 = 64**. G2/G3/D8/D9 are ordinary 4s. |
| "buy new plants only on 8s and 10s" | STRATEGY_GUIDE §1 | **Stale.** There are no 10s. Read as "16s and 8s". A 4-stack still returns less than a Muju's 5-crystal price. |
| "Promoting to Sachita adds 1 mining for 1 upkeep and 4 crystals: never worth it for income alone" | STRATEGY_GUIDE §1 | **Wrong under v2.8 (J-020).** Sachita is **Mining 5**: +2 mining for 1 upkeep, net **+1/turn**, payback 4 turns. Sachakuna is Mining 8: net **+6/turn** vs Muju's +3. |
| "Mining 3/4/5 minus upkeep 0/1/2 gives the same ongoing net 3 … the richer center alone is not an economic case for rushing Sachakuna" | ALTERNATE_MAP §1 | **Stale.** Net is now **3 / 4 / 6**. The Plant ladder is income-positive at every step (EXPANSION_ECONOMY line 10 states exactly this). |
| "a fresh 4 pays a Muju 3 then 1; an 8 pays 3,3,2; a 10 pays 3,3,3,1" | ALTERNATE_MAP §1 | 4 and 8 still correct; **a 16 pays 3,3,3,3,3,1 over six turns**, or **3 + 5 + 8 in three turns** if promoted on each of the next two own turns. |
| "Total crystals … Alternate 480" | ALTERNATE_MAP table | Superseded by v2.8's 504. |
| "six shared actions" | BALANCE-2026-09-11 line 21; STRATEGY_HANDOFF line 24; dossier §2.3 | **Wrong.** Four, since J-019 (2026-09-12). |
| Price table T1 fire 2 / water 4 / plant 6; T3 12/20/24 | DOUBLE_COSTS-2026-09-10 | **Superseded the next day** by v2.3: T1 **3/4/5**, T2 **7/8/9**, T3 **15/16/17**, steps 4/8. |
| "Tanka Speed 2, ATK2 DEF6 MINE4 cost12 build3" | STRATEGY_HANDOFF line 21 | **Stale.** Tanka is ATK 2 / **DEF 5** / SPD 2 / MINE 4 / **cost 17**; build times no longer exist. |
| "Twenty complete quiet player turns draw" | STRATEGY_HANDOFF line 27 | **Stale.** Ten, since J-016/J-019. |
| "0/4/8/10 reserves, 520 total" | dossier §2.3 | **Stale.** 0/4/8/16, 504 total. |
| "New rooms are on the 480 map" | napkin, 2026-09-12 | **Stale.** New rooms are 504 (SKILL.md line 53-54 states the current map). |
| "Home 10-cells run dry in about four turns" | MCP_TOOL_TAPS line 48 | **Stale.** Home cells hold 8: a Muju drains one in **3 turns** (3,3,2). A 16 takes 6. |
| "Only fire and lightning **tier 2+** kill plants" | STRATEGY_GUIDE §3 | **Wrong at the same catalogue it was written against.** Hi (fire 1) does 2+1 = **3** vs Muju DEF 3 → kill. The guide contradicts itself in §4 and §10, which both assume a Hi kills a plant. Verified `combat.ts:80-91` + `units.ts:7-18,159-170`. |
| "Water, metal and shadow cannot scratch a Muju" | STRATEGY_GUIDE §3 | **Partly wrong.** Water (max 2) and metal (max 2) cannot. **Karanlık (shadow 3) does 4−1 = 3 = Muju DEF 3 → kill.** |
| "Göl … immune to Hi, Radi and plants" | STRATEGY_GUIDE §3 | **Partly wrong.** Immune to Hi (1), Radi (0) and **Muju** (1). **Sachita does 2 and Sachakuna 3** vs Göl DEF 2 → both kill it. |
| "Codex ended with an Aegirinn, a Tanka, a Mazask and a Hono: 6 upkeep" | STRATEGY_GUIDE §6 | Final board (fixture) has Black holding Aegirinn + Tanka + Mazask + Hi + 2 Sjor + 10 Muju = **5 upkeep**, not 6 and no Hono. |
| "Its bank went 22 → 21 → 18 → 15 → 9 → 4" | STRATEGY_GUIDE §6 | Verified post-income banks for Black turns 13–17 are **21 → 18 → 15 → 9 → 4** exactly. The leading "22" was turn 6, not turn 12 (turn 12 was 18). |
| "Codex went Sjor → Straumr → Aegirinn by turn 4" | MCP_TOOL_TAPS line 39 | In the archived game it is **Straumr turn 4, Aegirinn turn 5** (fixture promotion entries). |
| DESIGN_REVIEW throughout (24 units, tier 4, hidden queue, build times, six actions, 308 crystals) | DESIGN_REVIEW.md | **Entirely superseded as rules.** Its *design lessons* (§5) remain the best generalizations in the corpus. |
| HOME_VICTORY / UPKEEP_DRAW / TIER3_CAP / CLEAVE_RELEASE / DRAW_TEN measurements | all | Carry their own "superseded" banners. Treat every win-rate number in them as archival. |

---

## 1. Ranked strategic principles

Ranked by (strength of evidence) × (how many decisions it changes). Each entry
states the claim, the source, the evidence quality, and the current numbers.

---

### P1. Actions, not crystals, are the binding constraint

**Claim.** Four shared actions per turn, regardless of army size. Decide what the
four must accomplish before deciding what to buy; a plan that needs five actions
is not a plan.

**Sources.** STRATEGY_GUIDE §2; codex-vs-claude ¶"Treat actions as your scarcest
resource"; FOUR_ACTIONS_REPORT; napkin 2026-09-13 ("I was one AP short of killing
the enemy Aeg four turns running").

**Evidence.** [CODE] `rules.ts:9-13`. [SIM] FOUR_ACTIONS_REPORT, 560 scripted
games (280 six-action, 280 four-action, 8 matchup cells × 20 seeds, current
catalogue, 496 map): median first-kill round 1 → 2, mean game length 22.4 → 27.1
rounds, inactivity draws 20.4% → 23.6%, rush-vs-expansion still 40/40 but median
length 6 → 13. [GAME] the "one action short" failure recurs in three separate
lost games.

**Numbers.**
- Move-and-attack radius fell from 11 to 7 squares for Hi/Hono, and from 6 to 4 for Sjor (FOUR_ACTIONS_REPORT line 18) — reproduced exactly by `3×speed+1` in §0.2.
- Purchases and promotions cost **zero** actions (`building.ts`, `promotion.ts`), so army *size* is free and army *use* is not.
- The quiet-draw window now allows each side only 20 action-points instead of 30 before a draw (FOUR_ACTIONS_REPORT line 24).

**Consequence for an engine.** The legal-move generator must be an action-budget
DP, not a per-unit move list. Every candidate turn is a sequence of ≤ 4 charged
steps drawn from the whole army; `findAttackApproach` (`movement.ts:68-79`)
already computes `ceil(pathLength / speed)` for a single attacker, and that is
the primitive to build on.

---

### P2. Income is a stock, not a flow — count the crystals **under** your miners

**Claim.** `projectedIncome` describes this turn only. The real quantity is
remaining reserve per occupied square, and where each miner goes when its square
empties.

**Sources.** codex-vs-claude ¶"Read projected income as a snapshot" and ¶"Build
an economy that can renew itself"; STRATEGY_GUIDE §1; MCP_TOOL_TAPS line 48;
napkin 2026-09-12 game 2.

**Evidence.** [CODE] `mining.ts:5-15` — `projectedIncome` is literally
`Σ min(Mining, reserve)` on the current board; it has no lookahead.
`getReachableResources` (`mining.ts:41-43`) returns *the whole board's* total for
any miner, which is a genuinely misleading primitive. [GAME] archived match,
income by turn (replayed from the fixture's mining entries):

| Turn | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| White (won) | 13 | 15 | 19 | 19 | 20 | 14 | **25** | 22 | 15 | 9 | **1** | 9 | 2 | 13 | 12 |
| Black (lost) | 12 | 14 | 15 | 22 | 21 | **23** | 13 | **5** | 9 | 5 | 8 | 6 | 6 | 2 | — |

Black's peak harvest of 23 on turn 8 was immediately followed by 13 and then 5:
this is the exact phenomenon Codex describes ("My 23-crystal harvest looked
encouraging, but it concealed a rapidly approaching shortage"). White's crash to
1 on turn 13 was survivable because it had 62 banked.

**Numbers at v2.8.** A Muju (Mining 3) drains a 4 in 2 turns (3,1), an 8 in 3
turns (3,3,2), a 16 in 6 turns (3×5, then 1). A Sjor (Mining 2) takes 2/4/8
turns on the same squares. Total board stock is 504 and never replenishes.

**Corollary (STRATEGY_GUIDE §1).** "A plant on an empty stack is a 5-crystal
wall, not a miner." [CODE] true: `unitEndOfTurnTake` returns 0 on reserve 0 and
tier-1 upkeep is 0, so the wall is free but earns nothing.

**Corollary (STRATEGY_GUIDE §1, still true).** "4-stacks are worth stepping onto
but never worth buying onto." A Muju costs 5 and a 4-stack yields 4. [GAME] the
winner nonetheless bought four plants onto 4-stacks (C1 t5, B3 t6, C2 t7, C7 t10)
and lists it as mistake #4.

---

### P3. Fresh purchases act immediately, so a square is never safe against the *visible* army alone

**Claim.** Safety must be evaluated against `enemy spawn squares × affordable
tier-1 units × their reach`, not against the units already on the board.

**Sources.** STRATEGY_GUIDE §4 ("spawn-strike"); codex-vs-claude ¶"Include fresh
purchases in threat calculations"; napkin 2026-09-12 ("a freshly BOUGHT Radi
(speed 3) from a forward-anchored rectangle killed my Hi turn 2");
MCP_TOOL_TAPS line 49 ("Briefing threat list is empty → do **not** read this as safety").

**Evidence.** [CODE] `building.ts:11-14` sets `canActThisTurn: true` on purchase;
`promotion.ts` likewise for promotions; only `placedThisTurn` blocks
same-turn promotion. [GAME] archived match, Black turn 3: `BUY fire_1@I6 | MOVE
→I2 | ATK H2 | MOVE →I4` — a 3-crystal Hi bought at the back of the rectangle,
walked 6 squares, killed White's 5-crystal pocket Muju, and retreated, all in
4 AP. [GAME] two agent games lost partly to this.

**Numbers.** A fresh Hi costs **3** and does **3** to plant/metal (2 ATK +1). A
fresh Göl costs **4** and does **3** to fire/lightning. Two fresh Hi = **6
crystals, 2 actions, 6 damage** — enough to kill a Tanka (DEF 5). Hi + Radi = 6
crystals and 3+2 = 5 damage, also enough (BALANCE-2026-09-11 lines 16-17,
verified against the catalogue). **Keep 6–8 crystals liquid at all times**
(STRATEGY_GUIDE §4).

---

### P4. Spawn rectangles are the territory game; anchor survival beats anchor mining

**Claim.** Your buyable area is the union of rectangles from your home corner to
each of your units, minus every rectangle containing an enemy. A single forward
unit is worth an enormous area; a single cheap enemy unit deletes it.

**Sources.** STRATEGY_GUIDE §4; codex-vs-claude ¶"the shadow scout at D9 was
especially instructive"; napkin 2026-09-13 ("Whoever owns a forward anchor owns
the board"); MCP_TOOL_TAPS line 65; ALTERNATE_MAP §H3.

**Evidence.** [CODE] `spawning.ts:8-59`: the rectangle is `[min..max]` in both
axes from the start corner, and `hasEnemyInRectangle` voids the whole anchor
(binary, not partial). [GAME] archived match turn 9: with a Göl at D9 as anchor,
White bought **four Mujus in one Place phase** onto the four 10-stacks of the
B8–D9 pocket; income jumped 14 → 25 the same turn. [GAME] napkin game 2: "sent my
only Aegirinn 8 squares away to anchor the rich patch and Codex blocked the
rectangle with a 3-crystal Hi."

**Numbers (verified by enumeration on the v2.8 start position).** White anchor at
F5 = rectangle A1–F5 = 30 squares, 27 of them empty after the Hi arrives, and it
exposes **D5, E5 and F4** (three 8s). **One enemy unit on C3 collapses that
27 to 2** (only A1 and B1 remain, via the B2/A2 rear anchors). This exactly
reproduces ALTERNATE_MAP line 87 and is the sharpest illustration in the corpus
of how cheap anchor denial is.

**Numbers (home).** Every rectangle contains the home corner, so an enemy
standing on your corner voids **all** purchases (`homeCheckmate.ts:53-55`).
Short of that: two enemy units on **I10 and J9** block every Black anchor except
one anchored on J10 itself (whose rectangle is the single occupied square) —
verified by enumerating rectangles. Mirror for White: **B1 and A2**.

**Numbers (self-block).** Your own three starting units at the corner leave zero
empty spawn squares: napkin 2026-09-12 lost four of ten turns' purchasing to a
J10/I10/J9 formation. [CODE] `getSpawnZone` filters out occupied squares
(`spawning.ts:79`), so a full corner is literally unbuyable.

---

### P5. Upkeep is a clock that kills heavy armies

**Claim.** Tier 3 costs 2/turn and tier 2 costs 1/turn out of a finite,
depleting economy. An army whose upkeep exceeds its sustainable income loses
without being fought.

**Sources.** STRATEGY_GUIDE §6; codex-vs-claude ¶"Buy promotions for a specific
job"; UPKEEP_DRAW-2026-09-08 (historical); ALTERNATE_MAP adaptation #6.

**Evidence.** [CODE] `upkeep.ts:5` `{1:0,2:1,3:2}`; charged at your own turn
start before healing (`turn.ts:30-33`); shortfall forces a keep-set choice and
tier-1 units can never be released (`upkeep.ts:20,25`; J-015). [GAME] the
decisive number of the archived match:

> White paid **19** crystals of upkeep across the game on 223 gross income (8.5%).
> Black paid **54** on 175 gross income (31%).
> White paid **zero** upkeep until turn 13 — its first promotion was turn 12.
> Black's first promotion was turn 4 and it paid upkeep from turn 5 onward.

Black's per-turn upkeep by turn (fixture): t5 1, t6–8 2, t9 4, t10–12 6,
t13–17 5. White's: 0 through turn 12, then 2, 3, 4, 5, 5. Black's post-income
bank over its last five turns: **21 → 18 → 15 → 9 → 4**, then resignation.

[SIM] UPKEEP_DRAW (v1.6, six actions, historical): introducing rent moved
tier-1's share of home victories from **50.5% to 72.4%**, and Metal III (Tanka)
home wins from **67 to 1** while Metal II (Mazask) rose 47 → 71. Players reaching
tier 3 fell 817 → 474. Do not port the win rates; the direction (rent punishes
tall armies) is the transferable finding.

**Numbers now.** With v2.8 Plant mining, the only promotions that pay for
themselves as economy are Plant: Sachita net **+4/turn** (vs Muju +3) and
Sachakuna net **+6/turn**, *provided the square still holds enough reserve*.
Every other tier-3 is net ≤ +2 (Tanka, Aegirinn) or negative (Kagari −1,
Kimubunga −2). Kagari, Umeme and Kimubunga **cost you money every turn they exist**.

**Corollary (codex-vs-claude).** Before promoting, complete: "This upgrade lets
me do ___ on this turn or the next." An upgrade that merely looks impressive buys
permanent upkeep.

---

### P6. Classify every enemy approach by action cost, and stand only where you can punish

**Claim.** For every soft unit you own, compute for every enemy attacker whether
the strike is *strike-and-retreat*, *strike-and-strand*, or *impossible*. Never
leave a soft unit on a strike-and-retreat square. Standing on a strike-and-strand
square is fine **iff** you can kill the stranded attacker next turn.

**Sources.** STRATEGY_GUIDE §5 (the guide calls this "the decisive habit of this
game"); MCP_TOOL_TAPS line 66; napkin 2026-09-12.

**Evidence.** [GAME] one won game; the guide reports the opponent taking exactly
the stranded kills that could not be punished and declining the ones that could.
[GAME] two lost games where the classification was done by hand and got speed-1
units wrong. [CODE] `movement.ts:68-79` `findAttackApproach` already returns the
shortest legal path to an empty square adjacent to the target, given a budget.

**Exact rule** [INFER, derived from `rules.ts:9` + `movement.ts:29-32`]. Let `s`
be the attacker's speed, `A = 4`, and `d` the length of the shortest legal
orthogonal path (through empty squares) from the attacker to the cheapest empty
square adjacent to the target. Approach cost is `ceil(d/s)`.

- `d ≤ 2s` → **strike-and-retreat** (2 approach + 1 attack + 1 retreat = 4 AP). Treat the kill as certain.
- `2s < d ≤ 3s` → **strike-and-strand** (3 approach + 1 attack = 4 AP, no retreat).
- `d > 3s`, or every adjacent square occupied → **cannot strike this turn**.

For speed 2 this is exactly the guide's "≤ 4 / 5–6 / ≥ 7 path squares"; for
speed 1 it is "≤ 2 / 3 / ≥ 4", which is why a Straumr killed a Hi three squares
away in a lost game (napkin 2026-09-12: "Straumr spd1 = 4 squares/turn").

**Corollary (STRATEGY_GUIDE §5).** Bait works only when the punishment does not
depend on a rectangle the enemy will be standing inside. The guide's F2 ambush
failed to trigger; the E2 trap worked because the punishing spawn came from a
separate row-1 anchor. [GAME] the fixture confirms Göls were bought at **F2 and
E2 on turn 5** and at **D3 on turn 8** — all on 0-reserve approach squares, i.e.
purely as tactical furniture.

---

### P7. Element advantage is not a matchup; the one-shot threshold is

**Claim.** Work out, exactly, who can kill whom in one hit and who needs a
combination. ±1 on attack changes almost every answer.

**Sources.** STRATEGY_GUIDE §3; codex-vs-claude ¶"Use elemental advantage
together with exact stats"; BALANCE-2026-09-11 lines 14-17.

**Evidence.** [CODE] derived from `units.ts` + `elements.ts` + `combat.ts`. The
full one-shot matrix (attacker kills defender outright, no damage carried over):

- **Kagari (fire 3, ATK 4)** one-shots **every unit in the catalogue except
  Aegirinn**: 5 vs plant/metal (so Tanka DEF 5 and Sachakuna DEF 4 both die),
  4 vs fire/lightning, 3 vs water/shadow — and Aegirinn's DEF 4 survives that 3.
- **Karanlık (shadow 3, ATK 4)** is neutral against everything except plant/metal,
  where it is disadvantaged (3). It one-shots every fire, lightning, water and
  shadow unit — **it is the only unit in the game that one-shots an Aegirinn**
  (4 vs DEF 4) — and it kills a Muju (3 vs 3), but it **cannot** kill Sachakuna
  (3 vs 4), Mazask (3 vs 4) or Tanka (3 vs 5).
- **Tanka (metal 3, DEF 5)**: only **Kagari** kills it in one hit (5 ≥ 5) — this
  is a deliberate design invariant (BALANCE-2026-09-11 line 16). Everything else
  needs a combination: 2 × Hi = 6, Hono + Hi = 7, Hi + Radi = 5.
- **Aegirinn (water 3, DEF 4)**: only **Karanlık**. Combinations: Aegirinn 3 +
  Inyan 2 = 5, or two Göl = 4 (napkin 2026-09-12 game 2 records exactly this
  arithmetic).
- **Muju (plant 1, DEF 3)** dies in one hit to **Hi (3)**, Hono (4), Kagari (5),
  Umeme (3), Kimubunga (4) and **Karanlık (3)**. It survives every water and
  metal attack in the catalogue (max 2), every other shadow attack, and every
  plant attack.
  A 3-crystal Hi killing a 5-crystal Muju is the game's most efficient trade and
  is the engine of every raid in the corpus.
- **Göl (shadow 1, DEF 2, SPD 2, cost 4)** is immune to Hi (1), Radi (0) and Muju
  (1); kills Hi, Hono, Kagari, Radi, Umeme, Kimubunga (3 each) and Sjor/Göl/
  Gölge/Karanlık (2 each). It dies to any water (2/2/3), any metal (2/3/3),
  Sachita (2) and Sachakuna (3).
- **Sjor (water 1, DEF 2, cost 4)** kills any fire or lightning unit (3 vs DEF 1
  or 2) — a 4-crystal fire-proof sentry — but only does 1 to plant/metal.
- **Sachita (plant 2, ATK 1)** kills a Sjor or a Göl (1+1 = 2 vs DEF 2). This is
  STRATEGY_GUIDE mistake #1: the winner did not promote a Muju on turn 3 to kill
  an adjacent Sjor, and that Sjor became the Aegirinn that dominated the midgame.
- **Radi (lightning 1, ATK 1)** kills nothing above DEF 1 except by chip damage:
  2 vs plant/metal, 0 vs water/shadow. Since v2.3 it cannot one-shot a Muju.
  Its value is speed 3 (reach 12 / kill radius 10), rectangle blocking and home
  threats — "Lightning's value is the disruption it causes, not its own
  collection" (ALTERNATE_MAP adaptation #5).

**Damage does not persist.** `board.ts:277` resets `damageTaken` at the owner's
turn start, so a 5-action combination cannot be finished next turn
(FOUR_ACTIONS_REPORT line 20). Partial damage is worth **zero** unless you finish
this turn.

---

### P8. Kill combinations need the attackers already adjacent

**Claim.** A two-unit kill fits in four actions only if each hitter needs at most
one move. Otherwise it fails by exactly one action.

**Sources.** STRATEGY_GUIDE §2; napkin 2026-09-13 ("Kill combos need attackers
PRE-ADJACENT … I was one AP short of killing the enemy Aeg four turns running").

**Evidence.** [CODE] each attack costs one action (`combat.ts` + the turn
budget); `homeCheckmate.ts:40-41` computes exactly `ceil(max(0, manhattan−1)/speed) + 1`
per attacker and runs a 2-hit DP over the shared budget. [GAME] a lost game where
the same combination missed four turns in a row.

**Arithmetic.** With `A = 4`: two attackers each needing `m` moves cost
`2(m+1)`. `m = 1` each → 4 AP, fits. `m = 2` for either → 5 AP, fails. Three
attackers on a **corner** need at least 5 actions because the corner has only two
neighbours and a third hitter needs both an exit and an entry move
(`homeCheckmate.ts:28-31`; SKILL.md lines 160-162). So **only two attacks can land
on a corner occupier in a four-action reply.**

**Cleave is the exception that buys throughput.** A tier-N unit gets N attacks,
but only a *killing* blow unlocks the next (`combat.ts:12-17`). Codex's clearest
example: a Hono at C9 killed the Muju on B9 and used the unlocked attack to kill
the Muju on C8 without moving — two captures from one square, two actions
(codex-vs-claude ¶"Exploit killing chains"). [SIM] FOUR_ACTIONS_REPORT line 20:
three *spaced* Mujus require six actions to kill (only two possible at four);
three *adjacent* Mujus fall in three actions under either budget. **So do not
cluster soft miners in a line a tier-3 can walk beside.**

---

### P9. Corner turtling loses; fight for a forward anchor instead

**Claim.** A sealed corner of wall-Mujus cannot rotate inside four actions, gives
up all spawn squares, and feeds a fresh-Hi raid every turn.

**Sources.** napkin 2026-09-13 game 3 (lost as Black with a +3 handicap, classical
time control) — the single most explicit failure postmortem in the corpus.

**Evidence.** [GAME] "Codex parked its Aegirinn at G6→G8 as a forward spawn anchor
and bought a fresh 3-crystal Hi 1–2 AP from my perimeter every turn (Hi 2+1 vs
plant = 3 kills a Muju). I recaptured every raider but lost a 5-crystal miner per
turn; income 11→0 by turn 12, released units to upkeep on turn 13." The trade is
**−5 (Muju) +3 (raider) = −2 crystals per exchange, every turn**, plus the actions
spent recapturing. [SIM] ALTERNATE_MAP H4: `Aware:Balanced vs Aware:Turtle` drew
**40/40 on both maps**, usually at the earliest quiet-turn limit — turtling does
not even lose cleanly against scripted play; against an opponent with a forward
anchor it bleeds.

**Geometric note** [CODE, verified]. Only the corner square itself (J10 for Black,
A1 for White) can have zero open neighbours, so every other wall unit is
approachable by a speed-2+ raider who then retreats out of reach. And a corner
stuffed with three units has zero spawn squares.

---

### P10. Only kills reset the clock; a pure economy race draws

**Claim.** Ten consecutive completed quiet player turns (five rounds) is a draw.
Mining, movement, buying, promotion and upkeep losses do **not** reset it.

**Sources.** J-019; STRATEGY_GUIDE §7; codex-vs-claude final paragraph;
ALTERNATE_MAP adaptation #7; SKILL.md lines 167-168.

**Evidence.** [CODE] `inactivity.ts:3` `INACTIVITY_LIMIT = 10`, warning at 7;
`turn.ts:96-99` increments unless `progressThisTurn`; J-019 defines progress as
"an enemy kill by attack" only. [SIM] ALTERNATE_MAP H4: **196/320 and 190/320 of
all games were draws** in the scripted mix. FOUR_ACTIONS_REPORT: 23.6% draws at
four actions. Drawing is the modal outcome for passive policies.

**Practical rule (STRATEGY_GUIDE §7).** Always keep a way to force a kill — a
3-crystal Hi raid on an undefended enemy plant resets the clock and usually costs
the raider its life, which is acceptable. The clock is **not** a weapon against
an opponent who has crystals: they can always buy a fire and kill a plant.

[GAME] In the archived match the clock was never a factor: 18 attacks, **18
kills** (every recorded attack was lethal — no chip damage was ever traded), and
never more than one quiet turn in a row.

---

### P11. Home occupation and home checkmate

**Claim.** A unit standing on the enemy corner at the start of your own turn
wins. A unit that cannot be removed by *any* legal reply wins immediately.

**Sources.** STRATEGY_GUIDE §8; SKILL.md lines 157-163; HOME_VICTORY-2026-09-07
(historical); J-011/J-016.

**Evidence.** [CODE] `turn.ts:23-27` (occupation at own turn start);
`homeCheckmate.ts:57-180` (full prover: upkeep keep-sets, promotions, blocker
clearing, combined damage, 20,000-node cap; inconclusive ⇒ ordinary reply turn).
[SIM] HOME_VICTORY: 399 home wins in 960 paired runs; median game length 52 → 27
rounds; 27 home wins by round five, **26 of them by Lightning I**; a policy that
stations a Water unit at home in advance reduced that to **0 of 160**. All under
v1.3/six actions — directionally transferable, numerically not.

**Current numbers.**
- The corner has **two** neighbours. Three attacks on the occupier need ≥ 5 actions, so at most **two attacks land** in a four-action reply (`homeCheckmate.ts:28-31`).
- A plant on your own home square is cheap insurance: [GAME] Black bought a Muju on **J10 on turn 4** of the archived match (fixture: `BUY plant_1@J10`, turn 4) and the guide says it invalidated every one-turn assault White could compute.
- The realistic assault (STRATEGY_GUIDE §8, [DOC]): **Tanka on one neighbour, Kagari on the other**. Tanka blocks the rectangles and survives any single attacker; Kagari kills the home plant (5 vs 3) and Tanka steps in. Requires the defender's fresh-fire reply to be impossible: zero crystals, or both neighbour squares already yours.
- Count promotions in the proof: a Hono promoted to Kagari in the reply does 3 to water and 5 to metal/plant. **Only an Aegirinn (DEF 4) survives that on the corner** — and a Karanlık in the reply kills even that.
- [SIM] FOUR_ACTIONS_REPORT line 22: in an exact fixture (enemy Tanka on A1, friendly Hi at E1, Radi at A4, no crystals) clearing costs five actions and is **unwinnable at four**; moving the Hi one square closer, to D1, restores the defense. Positioning for corner defense must happen *before* the threat appears.

---

### P12. Judge exchanges by position, not by capture count

**Claim.** Captures award no crystals. A raid that removes a unit but secures
neither ground, nor income denial, nor deployment access, nor a home threat, has
bought nothing.

**Sources.** codex-vs-claude ¶"Evaluate exchanges beyond purchase prices" and
¶"Turn pressure into lasting gains".

**Evidence.** [GAME] the archived match is the proof: **Black made 13 of the 18
recorded kills and lost.** Black out-killed White 13–5 from turn 3 onward and
still resigned 4 crystals to 57.

**Worked example from the corpus.** Promoting the Muju on H2 to Sachita would
have let it reach H5 and kill the Sjor on H6 — but a newly purchased Hi could
recapture the Sachita. Trading a 9-crystal promoted miner for a 4-crystal Sjor
is a bad deal once the reply is included. Evaluate three positions: before, after,
and after the opponent's best reply.

**Good trade recorded:** an expendable Göl (4) trading itself for a Hono (7)
(napkin 2026-09-12 game 2) — "the one good trade" of that game.

---

### P13. Your own army blocks your own routes

**Claim.** Friendly units are impassable. An idle Muju is a blocker, a spawn
anchor and a traffic jam.

**Sources.** codex-vs-claude ¶"Keep your own army from obstructing itself";
MCP_TOOL_TAPS line 53; napkin 2026-09-13 ("A just-bought unit blocks your own MOVE
paths — buys resolve first").

**Evidence.** [CODE] `movement.ts:29-32` and `reachable()` route through empty
squares only; `findAttackApproach` skips occupied destination squares
(`movement.ts:74`). [GAME] several sequences failed in preview because a blocker
made the route longer than the Manhattan distance. Place phase precedes the
action phase (`turn.ts:59-68`), so a unit you buy this turn is already in the way.

---

### P14. Promote for a job — with one v2.8 exception

**Claim.** Promotions should make a specific capture possible, survive a specific
hit, or make a sequence fit in four actions. The exception, new as of J-020, is
that the **Plant ladder is now genuinely income-positive**.

**Sources.** codex-vs-claude ¶"Buy promotions for a specific job";
ALTERNATE_MAP adaptation #6; EXPANSION_ECONOMY line 10; J-020.

**Evidence.** [CODE] `units.ts:171-194` Sachita Mining 5, Sachakuna Mining 8.
[DOC] EXPANSION_ECONOMY: "At full collection, ongoing income less upkeep is
3/4/6. A newly placed Plant promoted on the next two own turns collects 3 + 5 + 8
from a 16-square." That sequence exactly empties a 16. **These are design
intentions, explicitly "not measured balance outcomes"** (EXPANSION_ECONOMY
line 10; J-020 "not a playtested claim about win rates or turtling").

**Numbers.** Promotion timing is forced: a purchased tier-1 can reach tier 2 no
earlier than your next own turn and tier 3 the turn after (J-018;
`promotion.ts:44-52`), exposing the climb to two full opponent turns. The climb
costs 4 then 8 crystals. On a 16-square the 3+5+8 line collects 16 in three turns
for 12 crystals of promotion plus 3 crystals of upkeep — versus a plain Muju
collecting 16 over six turns for nothing. [INFER] the promoted line is faster and
buys tempo, but it creates a DEF-3/DEF-4 target that any fire unit can threaten;
Sachita DEF 3 dies to a single Hi (3) and Sachakuna DEF 4 dies to Hono (4) or
Kagari (5). **Promoted plants are raid magnets.** No game or simulation in the
corpus tests this.

---

### P15. Buy the anchor you can defend, not the anchor that reaches furthest

**Claim.** A forward anchor's value is the territory it opens *for as long as it
lives*. Losing it is acceptable once it has paid; buying it where one cheap unit
can block or kill it is not.

**Sources.** codex-vs-claude ¶"Claude repeatedly used expansion to access fresh
deposits… the scout's value included the territory it opened"; MCP_TOOL_TAPS line
65; napkin 2026-09-12; ALTERNATE_MAP adaptation #3.

**Evidence.** [GAME] Codex eventually captured the D9 scout, and says the miners
it enabled kept paying. [GAME] the mirror failure: an Aegirinn walked 8 squares to
anchor a rich patch and a 3-crystal Hi blocked the rectangle next turn — 16
crystals and 2 upkeep spent to enable zero purchases.

**Checkable test** [INFER, matching MCP_TOOL_TAPS' `blockingSet` advice]: before
committing an anchor, compute the minimum number of enemy units — including units
they can *buy* this coming turn — that must enter your rectangle to void it. If
that number is 1 and the blocking square is within their purchase-plus-reach set,
the anchor is not worth the trip.

---

### P16. The game is played from a bank, and the bigger bank dictates the endgame

**Claim.** Bank early, spend late. When the stacks run out, the player with cash
can still buy raiders, punishers and blockers; the player without cannot.

**Sources.** STRATEGY_GUIDE §1, §6; codex-vs-claude closing paragraph.

**Evidence.** [GAME] White finished with **57** to Black's **4**, having paid 19
upkeep to Black's 54, and had 62 banked at the moment its income collapsed to 1
on turn 13. [GAME] Black's endgame was "sustaining my army and generating threats
had become increasingly difficult" — the stated reason for resignation.

**Consequence.** Reserve 6–8 crystals for spawn-strike at all times (P3), and
treat a bank below the next upkeep bill as a losing position: `shouldResign`
(`evaluation.ts:411`) already refuses to resign while `resources > upkeepDue`,
which is the same threshold read from the other side.

---

## 2. Recurring failure modes that actually lost games

Each is anchored to the game that lost to it. These are the concrete negative
patterns an engine should be able to detect and avoid.

| # | Failure mode | Where it lost a game | The check that would catch it |
|---|---|---|---|
| F1 | **Zero spawn squares.** Compact corner formation (J10/I10/J9) left no empty square inside any rectangle; four of ten turns with no possible purchase. | napkin 2026-09-12, lost | `getAllSpawnPositions(me).length` must be ≥ 1 at the *end* of every turn, and ideally ≥ 3. |
| F2 | **Judging safety against visible units only.** A freshly bought speed-3 Radi from a forward rectangle killed a Hi on turn 2. | napkin 2026-09-12, lost | Threat set = existing units ∪ {(spawn square, affordable T1) pairs}; see P3. |
| F3 | **Ignoring speed-1 reach.** "It's slow" reasoning; a speed-1 Straumr killed a Hi three squares away (3 moves + attack = 4 AP). | napkin 2026-09-12 game 2, lost | Compute `ceil(d/s)+1 ≤ 4` for **every** enemy unit, never a mental heuristic. |
| F4 | **Buying miners onto depleted stacks.** Mujus bought onto half-mined home 10-cells; income collapsed to ~1 by turn 6 while the opponent moved Mujus onto fresh 10s. | napkin 2026-09-12 game 2, lost | For each candidate purchase square, require `reserve ≥ 2 × Mining` (i.e. ≥ 2 full harvests) or an explicit non-economic justification. |
| F5 | **Far anchor with no defender.** An Aegirinn walked 8 squares to anchor a rich patch; a 3-crystal Hi blocked the rectangle the next turn. | napkin 2026-09-12 game 2, lost | Minimum enemy blocking set for the new rectangle; reject if it is 1 and reachable/purchasable. |
| F6 | **One-AP-short kill combos.** The same combination missed four turns running because both hitters needed two moves. | napkin 2026-09-13 game 3, lost | Pre-adjacency DP: `Σ (ceil(d_i/s_i) + 1) ≤ 4` over the chosen hitters; see P8. |
| F7 | **Soft units on two-action approach squares.** "Leaving a Göl on a two-action approach square (J1, D9) twice. Both died for nothing." | STRATEGY_GUIDE §9 mistake 3 (won game, admitted cost) | P6 classification for every owned unit with cost ≥ 4. |
| F8 | **Corner turtling.** Mujus as walls, Hi/Aegirinn inside; −2 crystals net per raid, income 11→0 by turn 12, upkeep releases turn 13. | napkin 2026-09-13 game 3, lost | Detect: ≥ 60% of own units inside Chebyshev radius 2 of home **and** no anchor beyond radius 4 **and** enemy has one. |
| F9 | **Over-investing in tier 3 with upkeep > sustainable income.** Black: 54 crystals to upkeep on 175 gross; upkeep 6 on income 4, then 5 on 2, then 5 on 1. | archived match, lost | `upkeepDue(me)` vs a *forecast* of income over the next N turns, not `projectedIncome` this turn. |
| F10 | **Walking a Kagari into Hi range.** Kagari DEF 2 dies to a 3-crystal Hi (2 ≥ 2). "A Kagari is a home-base punisher and a late-game closer, not a roaming striker." | STRATEGY_GUIDE §9 mistake 5 (won game) | Any unit with cost ≥ 15 must never end a turn inside the purchase-plus-reach set of a lethal cheap unit. |
| F11 | **Moving the only anchor.** "Moving my only anchor plant off C7 left the entire pocket unspawnable when I needed a two-fire strike the next turn." | STRATEGY_GUIDE §9 mistake 2 (won game) | Articulation test: does this move reduce `|spawn squares|` in any region I intend to buy into next turn? |
| F12 | **Buying plants on 4-stacks early.** Each returned less than its 5-crystal price. | STRATEGY_GUIDE §9 mistake 4 | Same as F4 (`reserve ≥ 2 × Mining` ⇒ ≥ 6 for a Muju). |
| F13 | **Declining a free promotion kill.** Not promoting a Muju to Sachita on turn 3 to kill an adjacent Sjor (1+1 = 2 vs DEF 2). "That Sjor became the Aegirinn that dominated the middle game." | STRATEGY_GUIDE §9 mistake 1 | Include promotions in the Place-phase kill search; a promotion is free of actions. |
| F14 | **Clustering soft miners in a chainable line.** Three adjacent Mujus fall to three actions of Cleave; a Hono at C9 killed B9 and C8 from one square. | codex-vs-claude ¶"Exploit killing chains"; FOUR_ACTIONS_REPORT line 20 | For each enemy unit of tier N, count own units killable in a Cleave chain from any square it can reach. |
| F15 | **Trusting a headline threat list.** Briefing threat lists scan existing single hits only; promotions, purchases and combinations are omitted. | MCP_TOOL_TAPS lines 49, 87 | Never treat an empty threat list as safety; `proven_impossible` only within a declared scope. |
| F16 | **Tool/protocol self-inflicted losses.** Diagonal MOVE attempts; `END_PLACE_PHASE` sent after placement auto-advanced (whole batch rejected, atomic); analyze output silently truncated by the byte budget while the gate printed "clean"; 90-second turns on a 30-second delay. | napkin 2026-09-12/13; MCP_TOOL_TAPS "Habits that cost the games" | Orthogonal only; send `END_PLACE_PHASE` iff a purchase or promotion is still affordable; one topic per analyze call and refuse to act if `output.omittedSections` is non-empty; pre-compute during the opponent's turn. |

---

## 3. The winning recipes, and what an engine needs to find them

### 3.1 Codex's recipe (won napkin game 3 as White; the loser wrote it down)

> "Hi E4 t1; 2–3 Mujus per turn on home 10s **and** both rich patches (9 Mujus by
> t8, income 13); Sjor→Straumr t3→Aegirinn t4 parked at G6/G8 as a forward spawn
> anchor; fresh-Hi raid on a perimeter Muju every turn from t5; Inyan→Mazask→Tanka
> t6–8 (Tanka hit-and-runs Hi: 3 sq out, kill, back); Hi→Hono→Kagari t8–9 sent to
> the H2/I2 patch; Tanka+Aeg (3+3) finish the last Aeg."
> — napkin, Patterns That Work, 2026-09-13

Also recorded (napkin 2026-09-12): "Hi to a central 8 turn 1, Muju+Radi
hit-and-run early, then promote metal to Mazask/Tanka (DEF 4/5) once ahead; only
Hono/Kagari or two Hi can answer Mazask, only Kagari answers Tanka."

| Component | Machine-checkable form |
|---|---|
| Hi to a central 8 on turn 1 | Maximize `Σ reserve` over squares newly exposed inside the rectangle, subject to the anchor being outside every enemy kill radius. On v2.8: F5 exposes D5+E5+F4 = 24; H3 exposes H2 = 16 with the best per-square reserve. |
| Mujus on home **and** both patches | Purchase scoring = `min(Mining, reserve)` summed over the miner's remaining lifetime at that square (`Σ_{k} min(3, reserve − 3k)`), discounted for the probability the square is raided. Prefer 16 ≫ 8 > 4; forbid 4 until 16s and 8s are taken. |
| Water climb Sjor→Straumr→Aegirinn by t4–5 | A promotion is legal only from a unit that existed at Place start; the earliest tier 3 is turn 3 for a starting unit. Search should treat "promote the starting Sjor" as a first-class turn-2/3 candidate. Aegirinn DEF 4 + SPD 2 is the cheapest unit that survives every tier-1 attack. |
| Park a DEF-4 unit forward as the anchor | Anchor score = `(rectangle area newly opened) × (survivability)`, where survivability = 0 if any enemy one-shot or 2-hit combination reaches it, and a blocking-set size of 1 disqualifies it. |
| Fresh-Hi raid every turn from t5 | Each turn, enumerate `(spawn square, Hi) → target` with `ceil(d/2) + 1 ≤ 4` and `3 ≥ target DEF`. Score = target cost − 3 − (expected recapture cost). Also resets the draw clock. |
| Metal climb Inyan→Mazask→Tanka t6–8 | Tanka DEF 5 SPD 2 is the only piece immune to everything but Kagari; its hit-and-run is 3 squares out, kill, back (P6 with `s = 2`, `d ≤ 4`). |
| Finish an Aegirinn with Tanka + Aegirinn (3+3) | Combined-damage DP over shared actions with pre-adjacency (P8). |

### 3.2 Claude's recipe (won the archived 17-turn game as White) — fully replayed

Verified from `tests/fixtures/codex-claude-2026-09-12.json` (`commands` + `entries`).
Numbers in brackets are the **old 496 map**; the v2.8 equivalent square value follows.

| Turn | White (winner) | Verified effect |
|---|---|---|
| 1 | `MOVE Hi B1→H3` — 8 squares, all 4 AP | Anchor beside the NE pocket. Rectangle A1–H3 = 24 squares. Hi is DEF 1 but Black's turn-1 reach cannot touch it (distance 8 > kill radius 7) and Black has 0 crystals. |
| 2 | `BUY plant_1@H2` [10 → today **16**]; `MOVE Hi H3→H8` (3 AP); `ATK H9` — kills Black's Hi | One purchase pays back in 2 turns; a Hi-for-Hi trade on the far side. |
| — | Black replies: Sjor I6→H7, `ATK H8` kills White's Hi, Sjor retreats H7→H6 | The strike-and-retreat pattern of P6, by a **speed-1** unit (d = 2 ≤ 2s). |
| 3 | `BUY plant_1@G2` [10 → today 4]; `BUY water_1@H1` [4]; `MOVE Muju A2→A1` | Bank 10 → 1. Two buys, one action spent. |
| — | Black: `BUY plant_1@I10`, `BUY fire_1@I6`, new Hi → I2, `ATK H2` kills the pocket Muju, retreats to I4 | The canonical **spawn-strike**: 3 crystals, 4 AP, kills a 5-crystal miner. |
| 4 | `BUY plant_1@B1`, `BUY water_1@G1`, `END_PLACE_PHASE`, Sjor H1→I3 (3 AP), `ATK I4` kills the raider | Water kills fire: 2+1 = 3 ≥ DEF 1. Punishment of a **stranded** attacker. |
| 5 | `BUY shadow_1@F2`, `BUY shadow_1@E2` (both **0-reserve** approach squares), `BUY plant_1@A2`, `BUY plant_1@C1` | Göls bought purely as tactical furniture / ambush bait (STRATEGY_GUIDE §5's F2 and E2 traps). |
| 6–8 | Plants onto A4, B3, A5, B4, C2; Inyan onto F1, F3; Göl onto D3 | Steady home extraction; 0-reserve buys are anchors and blockers. |
| **9** | **Four Mujus in one Place phase onto B8, C8, B9, C9** (the SW pocket), anchored by the Göl at D9 | Income **14 → 25** in one turn. The single highest-value turn of the game. |
| 10–11 | Plant@C7; three Hi bought (C6, E1, D1) | First fire units, 3 crystals each, bought as punishers. |
| **12–13** | First promotions of the entire game: Hono@E1, Hono@D1 (t12), Kagari@E1 (t13) | **White paid zero upkeep until turn 13.** Bank at t12: 63. |
| 14–15 | Mazask@G2 (t14), Tanka@G2 (t15) | A DEF-5 wall parked on the NE 10-stack, "mining 4 a turn where nothing Black owned could hurt it". |
| 17 | Black resigns, 4 crystals to 57 | |

**The transferable shape.** Bank through the opening on free tier-1 plants, buy
cheap disposable killers (Hi 3, Göl 4) to punish raiders on the turn they stop,
take the far pocket in one burst from a forward anchor, and only convert cash to
tier-3 **after** the economy peaks and the enemy has already mortgaged itself to
upkeep.

| Component | Machine-checkable form |
|---|---|
| Turn-1 8-square anchor run | Maximize newly exposed `Σ reserve` in the rectangle, subject to `anchor ∉ ∪ enemy kill radii` and `blockingSet size ≥ 2`. |
| "Kill fires proactively" | After the opponent moves, for every enemy fire/lightning unit compute whether any own water/shadow unit (or purchasable Sjor/Göl) has `ceil(d/s)+1 ≤ 4` and lethal damage. Codex lost four fire units this way (STRATEGY_GUIDE §4). |
| Punish-or-don't-stand | For every own unit, require every enemy approach to be unreachable **or** a stranded square that my own combined reply (including purchases) can clear. |
| Four-buys-in-one-Place-phase burst | Place-phase search must be a **knapsack over the whole bank**, not a greedy single purchase: `max Σ value(square) s.t. Σ cost ≤ bank, squares ⊂ spawn set`. Purchases cost no actions, so there is no action coupling — only cash and square availability. |
| Delay promotions until the bank is large | Treat upkeep as a forecasted liability stream: promote only if `bank − Σ_{k=1..H} (upkeep_after − income_forecast_k) > reserve_for_spawn_strike` (6–8). |
| Tanka on a rich square nothing can hurt | Score a square by `min(Mining, reserve) × turns_safe`, where `turns_safe` counts turns until any enemy combination can assemble ≥ DEF damage there. |

### 3.3 Where the two recipes agree

1. A forward spawn anchor beats a compact corner. (Both winners took one on turn 1.)
2. Cheap tier-1 fire is the universal miner-killer; it is worth losing the raider.
3. The metal climb is an endgame wall, not an opening.
4. Tier 3 is bought with a surplus, never with income.
5. Buy onto the richest square inside the rectangle; never onto a square that pays less than the unit's price.

---

## 4. Opening knowledge

### 4.1 What is fixed on turn 1 [CODE]

- Both players start with **0 crystals**; income arrives at the end of your turn (`board.ts:212-224`, `mining.ts:18-34`). Neither seat can buy anything on turn 1.
- White: Hi **B1**, Sjor **B2**, Muju **A2**, home **A1**. Black: Hi **I10**, Sjor **I9**, Muju **J9**, home **J10** (`board.ts:184-197`).
- All three starting squares hold 8 on v2.8, so a stationary trio banks exactly **6** (1+2+3) at the end of turn 1. Moving them does not change that, because every neighbouring square also holds ≥ 4 ≥ their Mining except the empty approaches.
- Turn-2 bank of 6 buys exactly one of: **one Muju (5)**, **one Sjor or Göl (4)**, **two Hi/Radi (3+3)**, or **one Hi→Hono promotion (4)**. It cannot buy a Muju and anything else.
- Turn-1 spawn geometry is degenerate: the largest rectangle from the corner to a starting unit is 2×2 and every square in it is occupied except the corner itself.

### 4.2 Recommended White opening (turns 1–5)

**Turn 1 — commit the Hi to an anchor.** This is the only real decision.
Three candidates, all reachable in exactly 4 AP on an open board, and all safe
from Black's turn-1 reach (Black's Hi kill radius is 7; distances are 8, 8, 10):

All three also unlock the home 8s at **C1** and **A3**, which no turn-1 rear
anchor can reach (the rear rectangles are A1–B2 and A1–A2 only). Since the
turn-2 bank is exactly 6, what matters is **the single richest square each
anchor exposes**:

| Anchor | AP | Rectangle (empty squares) | Richest newly exposed square | ≥8 squares exposed | Evidence |
|---|---:|---|---|---:|---|
| **H3** (7,2) | 4 | A1–H3, 24 (21 empty) | **H2 = 16** | A1, B1, C1, A3, **H2** = 48 | [GAME] played by the winner of the archived match; on the old map H2 was a 10. |
| **F5** (5,4) | 4 | A1–F5, 30 (27 empty) | D5 / E5 / F4 = 8 | A1, B1, C1, A3, D5, E5, F4 = 56 | [SIM] tested on the 480/496 maps: 18/40 wins vs Balanced, **0/40 vs Rush**; `blockingSet` size **1** (an enemy on C3 cuts 27 spawn squares to 2). |
| **D5** (3,4) | 3 (1 AP spare) | A1–D5, 20 (17 empty) | C1 / A3 = 8 (home cluster only) | A1, B1, C1, A3 = 32 | [SIM] worst tested route: **37 losses, 0 wins, 3 draws vs Rush on both maps**; 9/40 vs Balanced. |

**Recommendation: H3.** It is the only one of the three that exposes a **16** on
the current map, and it is the only one with a game win behind it. F5 has the
larger rectangle but the fragility is decisive: one 3-crystal unit at C3 deletes
it, and the lab's route screen found no compensating win rate. D5 is dominated.
[INFER] the case for H3 is *stronger* under v2.8 than when it was played, because
the expansion squares went 10 → 16 while home went 10 → 8.

Caveat I will not hide: the route experiments were run on the 480/496 maps with
fixed bot policies, and the report itself says they "do not validate an automatic
turn-1 E5/F5 opening" and that "an unsupported economic opening remains
punishable" (ALTERNATE_MAP lines 89, 134).

**Turn 2 — one Muju onto the richest exposed square.** With the Hi at H3, buy
`plant_1@H2` (16). Payback is 2 turns; total yield 16. Then spend the remaining
AP either killing something the opponent left in reach, or pulling the Hi back
toward its own lines — the archived game's Hi pushed on to H8 to take a trade and
died the next turn to a Sjor. [INFER] retreating the Hi to a square outside every
enemy strike-and-retreat radius (P6) is probably better than the trade, but this
is untested.

**Turn 3 — buy a second Muju and a cheap guard.** With ~10 crystals: one Muju (5)
on the next-richest exposed square plus one Sjor (4) as a fire-proof sentry, or a
Göl (4) if the opponent has committed to water. Do not promote.

**Turns 4–5 — one plant per turn onto 16s/8s, one cheap hunter per turn, kill
every enemy fire the turn it stops.** Bank everything else. STRATEGY_GUIDE §10:
"By turn 6 you should have 20+ crystals, 15+ income and no enemy fire on the
board." [GAME] the archived winner had bank 20 and income 15 at turn 4, bank 21
and income 19 at turn 5 — the guide's target is met a turn or two early on the
old map, and the v2.8 map's richer pockets should make it easier still, though
the smaller home cluster makes the first three turns thinner.

**What not to do in the opening (all [GAME]-attested):**
- Do not fill the corner (F1).
- Do not buy onto a 4 while a 16 or 8 is inside any rectangle (F4/F12).
- Do not leave the Hi where a speed-1 water unit can reach it (F3): the killer
  radius for Sjor/Straumr is **4** squares, not 1.
- Do not promote before turn 6 unless the promotion makes a specific capture
  (F13 is the *one* recorded exception: promoting a Muju to Sachita to kill an
  adjacent Sjor was correct and was declined).

### 4.3 Recommended Black opening

No document gives a Black-specific opening. What the corpus supports:

**The mirror is exact.** The map has 180° rotational symmetry, and the mirror map
is `(x,y) → (9−x, 9−y)`. White's H3 anchor maps to **C8** for Black; White's H2
purchase maps to **C9 = 16**. Black's Hi at I10 reaches C8 in exactly 8 squares
(6 west along row 10, then 2 north), i.e. 4 AP, on an open board. [INFER,
verified geometrically.]

**But Black must not simply mirror.** The single hardest measured asymmetry in
the corpus: [SIM] ALTERNATE_MAP H4, Rush mirrors were **White 15/20, Black 0/20,
five draws — on both maps**. "Rotational symmetry alone is insufficient evidence
of fair alternating-turn play" (line 111). Black moving second means White's
anchor is already committed when Black chooses, which is information — and also
means White strikes first in any race.

**What a real Black opening did** [GAME, archived match, Black = Codex]:
- T1: Sjor I9→I6 (3 AP, toward the contested right flank), Hi I10→H9 (1 AP). Black spends turn 1 developing **two** units rather than committing one far forward.
- T2: `BUY plant_1@I9`; Sjor I6→H7 (2 AP), `ATK H8` killing White's forward Hi, then Sjor H7→H6 (retreat). A **speed-1 strike-and-retreat**.
- T3: `BUY plant_1@I10`, `BUY fire_1@I6`; the fresh Hi walks I6→I2 and kills White's pocket Muju at H2, then retreats to I4. A **spawn-strike on White's new expansion**.
- T4: promote Sjor→Straumr; `BUY plant_1@J10` (**home-square insurance**); `BUY water_1@I6`; Straumr →I4, kills White's Sjor.
- T5: promote Straumr→Aegirinn (bank 5). Tier 3 on turn 5.

That opening won the first five turns on tempo and material and still lost the
game, for the reasons in P5 and P12. **Black's recorded opening is tactically
excellent and economically fatal**: it reached tier 3 on turn 5 and was paying
upkeep from turn 5 to the end, 54 crystals in all.

**My synthesis for Black** [INFER, explicitly untested]:
1. T1: develop **two** units — the Hi toward a forward anchor square and the Sjor one or two squares toward the contested flank — rather than committing the Hi 8 squares deep. Black gets to see White's anchor first; use that.
2. T2: buy a Muju onto the richest square White's anchor choice has *not* contested (C9 = 16 if White went east; H8/I8 or the home cluster if White came at the SW pocket).
3. T3–4: the spawn-strike is Black's best tempo tool (it worked twice in the archived game). Keep 3–6 crystals liquid for it every turn.
4. T4: a Muju on **J10** is cheap home insurance and was verified to invalidate White's one-turn assaults.
5. **Do not take the water climb to Aegirinn before turn 6–7.** That is the specific move the archived loser identifies as its "bigger mistake… building a collection of expensive pieces without maintaining enough productive activity around them."
6. If the room offers it, `blackCrystalHandicap` of 3–20 lets Black buy on turn 1 (SKILL.md lines 81-97); 1–2 does nothing because the cheapest unit costs 3.

---

## 5. Evaluation features implied by the corpus

Column "In code?" refers to `src/ai/evaluation.ts` + `src/ai/types.ts:73-88`
(the current static evaluator, weights in brackets).

### 5.1 Economy

| Feature | Proposed definition | In code? |
|---|---|---|
| **E1. Projected income** | `Σ_{u ∈ mine} min(Mining(u), reserve(square(u)))` | Yes — `calculateMiningPotential` → `projectedIncome` [0.2] |
| **E2. Crystals remaining under own miners** | `Σ_{u ∈ mine, Mining(u)>0} reserve(square(u))`. The single most important missing term: E1 is a snapshot and the corpus's loudest lesson (P2) is that the snapshot lies. | **No** |
| **E3. Sustained income over horizon H** | `Σ_{k=1..H} Σ_u min(Mining(u), max(0, reserve_u − (k−1)·Mining(u)))` with units held stationary. H = 5 matches the draw clock's half-life. The MCP already exposes this as `harvestTrend` / `forecastStop` (ANALYSIS_TOOLS "Economy"). | **No** |
| **E4. Upkeep–income margin** | `income_forecast(k) − upkeepDue(me)` for k = 1..H; and `turnsToInsolvency = min{k : bank + Σ_{j≤k}(income_j − upkeep) < 0}`. MCP calls this `shortfallIn`. | **No** (`upkeepDue` is imported but used only in `shouldResign`, `evaluation.ts:411`) |
| **E5. Relocation debt** | Number of own miners whose square will be empty within 2 turns, × the action cost of moving each to the nearest square with `reserve ≥ 2·Mining`. Codex: "identify next turn's mining moves before ending this turn." | **No** |
| **E6. Purchase-square quality** | For a candidate square `q` and unit `u`: `lifetimeYield(u,q) = Σ_k min(Mining(u), reserve(q) − k·Mining(u))`, i.e. 16 for a 16-square Muju, 8 for an 8, 4 for a 4. Reject purchases with `lifetimeYield < cost(u)`. | **No** |
| **E7. Bank liquidity for spawn-strike** | `min(bank, 8)` — the corpus's standing reserve requirement (P3). Penalise banks below the cost of the cheapest lethal reply to the opponent's most valuable exposed unit. | **No** |

### 5.2 Territory and deployment

| Feature | Proposed definition | In code? |
|---|---|---|
| **T1. Spawn rectangle area** | `|getAllSpawnPositions(me)|` — empty squares in the union of unblocked rectangles. | Yes — `calculateTerritoryControl` [0.3] |
| **T2. Spawn area weighted by reserve** | `Σ_{q ∈ spawn set} reserve(q)` — distinguishes 27 empty approach squares from 27 squares containing three 16s. | **No** |
| **T3. Anchor blocking-set size** | For each anchor `a`, the minimum number of enemy units that must enter `rect(home, a)` to void it, counting units the enemy can **buy** into reach this turn. `min` over anchors that carry unique area. An anchor with blocking-set 1 is disqualified (P15, F5). | **No** (the MCP exposes `blockingSet`; the evaluator does not) |
| **T4. Anchor safety** | For each anchor: 1 if no enemy single attack or ≤ 4-action combination (including purchases) is lethal to it, else 0. Weight by the unique area it carries. | **No** |
| **T5. Spawn denial pressure** | Enemy units standing inside my spawn set. | Yes — `calculateSpawnDenialPressure` [−1.5] |
| **T6. Spawn infiltration** | My units standing inside the enemy spawn set. Should be weighted much higher when the infiltrator sits on I10/J9 (B1/A2 for Black) or on the enemy home corner, which shuts off **all** anchors. | Yes — `calculateSpawnInfiltration` [1.0], but with no corner weighting |
| **T7. Self-block penalty** | Own units occupying squares inside my own spawn set. Detects F1 directly: if `|spawn set| = 0`, the position is unbuyable. | **No** |

### 5.3 Threats and tactics

| Feature | Proposed definition | In code? |
|---|---|---|
| **X1. Approach classification per own unit** | For each own unit `v` and each enemy attacker `w` (existing **or** purchasable at each enemy spawn square): `d = shortest legal path from w to the cheapest empty square adjacent to v`; class = retreat if `d ≤ 2·speed(w)`, stranded if `≤ 3·speed(w)`, safe otherwise; lethal iff `attackPower(w,v) ≥ DEF(v)`. Aggregate as `Σ_{v lethal & retreat-class} cost(v)` (a pure loss) and `Σ_{v lethal & stranded-class} (cost(v) − punishValue(w))`. | Partly — `calculateKillThreatsReceived` [−2.0] uses only **adjacent** existing attackers (`getAttackersFor`), so it misses everything at range and every purchase |
| **X2. Purchasable-attacker reach set** | For each enemy spawn square `q` and each affordable tier-1 `u`: the set of squares reachable for a strike within `4 − 1` move-actions. Union over `(q,u)` = the true threat frontier. Directly fixes F2. | **No** |
| **X3. Combined-kill availability with pre-adjacency** | DP over the 4-action budget: for a target `t`, find `argmax Σ damage` s.t. `Σ (ceil(d_i/s_i) + 1) ≤ 4`, attackers distinct, damage measured against `DEF(t) − damageTaken(t)`. Already implemented for the home corner in `homeCheckmate.ts:27-49`; generalise it to any target. | Partly — `calculateCombinedAttackPotential` [0.8] only sums **already-adjacent** attackers |
| **X4. Cleave chain exposure** | For each enemy unit of tier N and each square it can reach in ≤ 3 move-actions, the number of my units killable in a chain from that square (each kill unlocking one more attack, total ≤ N, each attack costing an action). Detects F14. | **No** |
| **X5. Punishment capacity of a stranded square** | For each square adjacent to my units, the max damage I can deliver there next turn using existing units plus affordable purchases within 4 actions. A square where this ≥ the attacker's DEF makes my unit a deterrent rather than a target (P6). | **No** |
| **X6. Promotion-aware threat** | Enemy attack values must be computed after their best affordable Place-phase promotion, since promotions cost no actions and act immediately. MCP_TOOL_TAPS records a game lost precisely to Straumr 2 → Aegirinn 3. | **No** |

### 5.4 Clocks and terminal conditions

| Feature | Proposed definition | In code? |
|---|---|---|
| **C1. Draw-clock pressure** | `inactivityPlies / 10`, signed by who is winning on material+bank. If I am ahead, a high count is a *loss* term; if behind, a *gain* term. Also: "can I force a kill this turn?" (a fresh Hi vs any undefended enemy plant). | **No** — `getGameResult` returns 0 for a draw but nothing anticipates it |
| **C2. Home-neighbour control** | For each home corner, the state of its two neighbours (B1/A2 for White, I10/J9 for Black): mine / enemy / empty, plus whether a unit occupies the corner itself. Enemy control of both neighbours = all my anchors voided **and** the corner is one move from occupation. | **No** — only `homeOccupationPressure` at weight 0.08 |
| **C3. Home-rescue feasibility** | Run the bounded prover (`analyzeHomeDefense`) on the hypothetical where the opponent's fastest unit reaches my corner. Cheap proxy: `enoughPossibleDamage` (`homeCheckmate.ts:27-49`) against a hypothetical occupier, remembering that at most **two** attacks can land. | Prover exists; not wired into static eval |
| **C4. Time-bank pressure** (timed rooms) | `remainingBankMs / meanBankSpentMs` from `clockPressure`, with the explicit caveat that it is not the number of turns left. Governs how much search to spend, not how to evaluate. | n/a (client concern) |

### 5.5 Material and structure

| Feature | Proposed definition | In code? |
|---|---|---|
| **M1. Cost-weighted material** | `Σ cost(u)`. The lab's own adjudication metric (J-004: material + stockpile + queue). | Yes — `calculateUnitValue` [1.0] |
| **M2. Bank** | `resources` difference. | Yes [0.5] |
| **M3. Effective defense** | `Σ (DEF − damageTaken)`. | Yes — `calculateUnitHealth` [0.1], but it uses **base** defense, ignoring `damageTaken` |
| **M4. Action-throughput** | `min(#units that can act, actionsRemaining)`. Encodes "a ten-unit army still gets four actions". | Yes — `calculateStepEfficiency` [0.2] |
| **M5. Mobility / optionality** | Legal moves + 1.5 × legal attacks. Note this rewards large armies for having many *legal* but useless moves; P1 says throughput, not option count, is the constraint. | Yes — `calculateMobility` [0.3]; worth re-examining |
| **M6. Tech progress** | `Σ_element (highest tier − 1)`. The corpus says tier 3 is a *liability* without income, so this term should be conditioned on E4 rather than rewarded unconditionally. | Yes — `calculateTechTreeProgress` [0.4] |
| **M7. Centre control** | Distance-to-(4.5,4.5) bonus. On v2.8 the eight central squares hold 64 crystals, so this now partially proxies E2 — but ALTERNATE_MAP H2 measured that a richer centre raised central *income* (17.3 → 31.5/game) without raising central *occupation* (56.2 → 56.7 unit-turns). | Yes — `calculateCenterControl` [0.2] |

### 5.6 The four biggest gaps, in order

1. **E2/E3/E4** — nothing in the static evaluator knows that reserves deplete or
   that upkeep compounds. Both essays name this as the decisive axis of the one
   game that was played to a conclusion.
2. **X1/X2** — threat detection is adjacency-only and purchase-blind. Three
   recorded losses are directly attributable to this.
3. **T3/T4** — anchors are counted by area, not by survivability, so the
   evaluator cannot distinguish a 27-square rectangle with a blocking-set of 1
   from a 24-square rectangle that cannot be cut.
4. **C1** — the draw is worth 0 and is never anticipated, in a game where the
   scripted mix draws 20–60% of the time.

---

## 6. Open questions the corpus does not answer

- **Nothing has been measured on the v2.8 map.** J-020 says so explicitly: the expansion economy is "mechanics and design intentions, not measured balance outcomes." Every win rate in every report predates it.
- **Is the H3/C8 far-pocket opening still best now that pockets are 16s and home is 8s?** One game, on a different map.
- **Is the promoted-Plant line (3+5+8 on a 16) actually good, or just a DEF-3 raid magnet?** Untested.
- **First-player advantage.** The only measurement is a scripted rush mirror: White 15/20, Black 0/20 on both maps. `blackCrystalHandicap` exists as a lever; nobody has calibrated it.
- **Does the "never leave a soft unit on a strike-and-retreat square" rule actually make fragile pieces permanent deterrents,** as STRATEGY_GUIDE §5 claims? One game, self-reported.
- **What punishes a forward-anchor raiding strategy?** Napkin game 3 lost to it and its stated counter ("fight for an anchor early") is untested.
- **Human play.** DESIGN_REVIEW §6: "Nobody has played it. Every number in this review is a bot number." That remains true of every strategic claim above except the three agent-vs-agent games.
