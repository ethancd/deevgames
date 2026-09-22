# Muju Hono Irumbu — Game Specification (Current Rules)

This is the canonical rules specification for Muju Hono Irumbu as implemented.
It supersedes the original v1.0 implementation spec (this file's previous
content) and incorporates all v1.1 changes (`docs/v1.1-spec.md`). Where this
document and the code disagree, that is a bug in one of them: see
`lab/docs/SPEC_AUDIT.md` for the clause→code traceability table and the list
of known divergences. The stat tables in §7 are transcriptions of
`src/game/units.ts`, which is the canonical stat source.

**Spec version:** v3.3 (2026-09-22) — replaces the inactivity draw clock with
the **kill clock**: ten kill-free plies end the game on **mined totals**
(higher wins; a tie draws) instead of drawing outright at twenty. Black's
starting handicap counts toward Black's mined total. A predicted home
checkmate (`#`) is no longer awarded when the kill clock would end the game at
or before the invader's own next turn start (`c ≥ 9`); the game plays on
instead. Advances the rules revision from `muju-phasing-2` to
`muju-phasing-3`; every strength, ladder and suite record measured under the
old revision is void for the new one. See §9, `JUDGMENT_LOG.md` J-024 and
`muju/docs/changes/2026-09-22-kill-clock-SPEC.md`.

**Retained from v3.2** (2026-09-22) — renames the game title and ten piece
display names, plus three element language labels: Poṉ, Veḷḷi and Irumbu
(Metal); Sjór and Ægirinn (Water); Loş (Shadow); Mallki and Sach'akuna (Plant);
Kimbunga (Lightning); Honō (Fire). Water's language label is now "Old Norse",
Shadow's is "Turkish", Plant's is "Quechua", and Metal's is "Tamil" / "South
Asia". **Display names and labels only: every stable ID, stat, price and
promotion gap is unchanged, and no rule moved, so the rules revision remains
`muju-phasing-2` and no measurement is voided.** See `JUDGMENT_LOG.md` J-023
and `docs/changes/2026-09-22-rename-irumbu-plan.md`.

**Retained from v3.1** (2026-09-21) — retires the Standard ruleset. Phasing is
the sole ruleset, and §2, §5 and §9 below now state it normatively rather than
describing it as a variant. No rule changes; the rules revision remains
`muju-phasing-2`, and no measurement is voided. Standard can no longer be
created, chosen or resumed anywhere; stored Standard rooms and saves become
retired records (see "Stored artefacts by rules revision" at the end of §1).
`docs/PHASING-2026-09-16.md` is superseded by this document and retained as the
dated record of the variant era. See `JUDGMENT_LOG.md` J-022 and amendment A6 in
`docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md`.

**Retained from v2.9** (2026-09-18) — Metal is Poṉ → Veḷḷi → Irumbu, with
ATK/DEF/SPD/MINE 1/3/0/3, 1/4/1/4, 2/5/2/5. Poṉ cannot move but may attack
adjacent enemies, mine, anchor purchases and promote normally. Prices and IDs
are unchanged. Existing saves and rooms use this catalogue; recorded historical
boards and move labels are preserved. The v2.8 economy remains: new games use 8-crystal home squares and
16-crystal expansions, with 504 crystals total. Plant Mining is 3/5/8. Saved and
in-progress games retain their stored maps and use the updated unit catalogue.
See `docs/EXPANSION_ECONOMY-2026-09-13.md`.
Every game uses 4 shared actions per
turn. Only an enemy kill by attack resets the kill clock (§9). Tier-1 purchases cost 3/4/5 by pair;
all promotions cost 4 to tier 2 and 8 to tier 3. Muju has DEF 3, Irumbu DEF 5,
C4/C5/H6/H7 hold 4 crystals each, and F3/E8 hold 0. See
`docs/BALANCE-2026-09-11.md` for rationale and compatibility.

History: v1.0 (original design), v1.1 (historical playtest balance pass),
v1.2 (canonical rewrite), v1.3 (role balance), v1.4 (Cleave), v1.5 (tier-3 cap),
v1.6 (upkeep and inactivity draw), v1.7 (Lightning/Metal adjustments),
v1.8 (mandatory T1 upkeep retention), v1.9 (ten-turn draw at turn end),
v2.0 (2026-09-09, passive mining and 4/8/10 reserves), v2.1 (2026-09-09,
public tier-1 purchase and promotion climb). The v2.0/v2.1 changes are
implemented together; v2.0 is not a separately deployed release. v2.2 (2026-09-10) doubles
purchase and promotion prices. v2.3 revises prices, two defenses and four reserves.
v2.4 (2026-09-11) clears F3/E8 to make both empty approaches 3×3 squares.
v2.5 adds a four-action variant for local games and online rooms.
v2.6 makes four actions the sole ruleset and defines a quiet turn as no attack kills.
v2.7 adopts larger home reserves, smaller distant rich patches and a central
eight-cell reserve cluster for new games, without changing existing boards. v2.8 reduces home reserves to 8, increases
expansions to 16, and raises Plant tier-2/tier-3 Mining to 5/8.
v2.9 (2026-09-18) revises the Metal line and renames Inyan to Yan.
v3.0 (2026-09-19) lengthens the inactivity draw clock from 10 to 20 quiet plies
and moves the amber warning from 7 to 17, advancing the rules revision to
`muju-phasing-2`. Nothing else changes; in particular, what counts as progress is
untouched. Entries at or before v2.9 describe the ten-ply clock as it then stood
and are history, not current rules.
v3.1 (2026-09-21) retires the Standard ruleset; Phasing becomes the sole ruleset
and is stated normatively here. No rule changes and no rules-revision advance:
`muju-phasing-2` stands and no measurement is voided. Entries at or before v3.0
describe the Standard turn order — a Place phase before actions, purchases that
appear and act at once, upkeep at turn start — as it then stood; those
turn-order descriptions are history, not current rules.
v3.2 (2026-09-22) renames the game title to Muju Hono Irumbu and ten piece
display names — fire_2 Hono→Honō, lightning_3 Kimubunga→Kimbunga, water_1
Sjor→Sjór, water_3 Aegirinn→Ægirinn, shadow_1 Göl→Loş, plant_2 Sachita→Mallki,
plant_3 Sachakuna→Sach'akuna, metal_1 Yan→Poṉ, metal_2 Mazask→Veḷḷi, metal_3
Tanka→Irumbu — and the Water/Shadow/Plant/Metal language labels. No rule
changes and no rules-revision advance: `muju-phasing-2` stands. Entries at or
before v3.1 use the pre-rename display names and are history, not current
naming.
v3.3 (2026-09-22) replaces the inactivity draw with the kill clock: the limit
returns to ten quiet plies (amber at 7) and the verdict changes from an
outright draw to the higher **mined total** — Black's handicap included — with
a tie still drawing; a predicted home checkmate is withheld when the kill
clock would end the game at or before the invader's own next turn start
(`c ≥ 9`). Advances the rules revision from `muju-phasing-2` to
`muju-phasing-3`. Entries at or before v3.2 describe the twenty-ply draw clock
as it then stood and are history, not current rules.

---

## 1. Overview

Muju Hono Irumbu is a two-player perfect-information strategy
board game combining territorial control (Go), tactical combat (Chess), and
economic buildup (StarCraft). Players are **White** and **Black**; either seat
may be a human or an AI (`vs-ai`, `pass-play`, and `ai-vs-ai` modes).

- **Six elements, three tiers:** 18 units; tier 3 is terminal.
- **Board:** 10×10 square grid.
- **Start:** White's corner is (0,0); Black's corner is (9,9). Each player
  starts with 3 units adjacent to their corner and 0 resources.
  - White: Hi (fire_1) at (1,0), Sjór (water_1) at (1,1), Muju (plant_1) at (0,1).
  - Black: Hi at (8,9), Sjór at (8,8), Muju at (9,8).
- **Resources:** **Unequal routes (central-reserve revision)**: the fixed
  180°-rotational layout. Cells hold 0/4/8/16 crystals, with **504 total** in new games.
  Eighteen blank squares form D1–F3 and E8–G10; they remain walkable and spawn-eligible. Ordinary ground
  holds 4; F4/D5/E5/F5/E6/F6/G6/E7 hold 8. Six home cells per side hold 8 (48 per home cluster);
  four cells in each distant rich patch hold 16 (64 per expansion). Exact layout:
  `src/game/resourceMap.ts`. The map revision did not bump the save schema or the
  online rules version, so a game this build can still resume keeps its exact
  board, depletion and original capacities. The schema-5 and schema-6 upgrade
  paths are history: nothing recorded under an earlier ruleset is upgraded or
  resumed today — see §1 "Stored artefacts by rules revision" below.
- **Actions per turn:** **4 shared actions** in every game, for either player.
  Local saves, online rooms, AI planning and rematches use the same rules.
  **Start Game** starts fresh; **Continue saved game** resumes the saved board
  when the save was recorded under these rules. Schema-5 saves and version-2/3
  rooms are retired records, not upgrade candidates: the in-place upgrade that
  once subtracted spent actions and restarted the clock is history, and no
  stored artefact is reinterpreted under a ruleset it was not recorded with.
  Completed results remain final. See §1 "Stored artefacts by rules revision".
- **Optional Black crystal handicap:** New games may grant Black any whole
  number from 1 to 20 starting crystals (off/0 by default). White still starts
  with 0. The handicap never changes the opening phase: both players begin their
  first turn in Act, Black included. The grant is separate from mined income,
  is awarded only at game creation, and persists in saves, online rooms and
  rematches. Both sides retain four actions.
- **White moves first.** Every first turn begins in Act (§2); crystals are only
  ever spent in Prepare, at the end of a turn.

### Stored artefacts by rules revision

Muju plays exactly one rule set. Every stored artefact still names the revision
it was recorded under, and nothing is reinterpreted under a revision it was not
recorded with.

- **Online rooms.** Playable rooms are `muju-phasing-3` — the one revision new
  rooms are created under and the only one the server opens. `muju-online-2`,
  `muju-online-3`, `muju-online-4`, `muju-online-5`, `muju-online-6` (Standard),
  `muju-phasing-1` and `muju-phasing-2` are retired identifiers: those rows stay
  in the archive exactly as written, are listed as retired, and refuse to open
  or mutate. They are never migrated in place.
- **Local saves.** Save schema 10 resumes Phasing games only. A stored save whose
  ruleset is not Phasing is moved byte-for-byte to a retired slot, never resumed
  and never reinterpreted; it stays reviewable read-only.
- **Replays and move history.** Recorded boards, move labels and analysis text
  are frozen as written under the revision that produced them.
- **Opening corpora.** `p1-dev`, `p1-val` and `p1-sealed` are Phasing corpora
  frozen on 2026-09-18 under `muju-phasing-1` and used unchanged since;
  `lab/hard-ai/ladder/openings/ALLOCATION-P1.md` pins each file's rows, bytes and
  sha256. Only `p1-dev.jsonl` and `p1-val.jsonl` are in the repository:
  `p1-sealed.jsonl` is held outside it at mode 0600, with only its hash published,
  and is consumed once under the preregistered Gate 2 run.
- **Strength records.** `docs/hard-ai/phasing/repair-2026-09-20/` was measured
  under `muju-phasing-2` and remains valid. `docs/hard-ai/RELEASE-2026-09-18.md`
  and every earlier Standard ladder, suite or balance study describe Standard and
  are valid only for the `standard-final` tag; they are history, not evidence
  about current play.

## 2. Turn structure

A turn runs Act → mine and upkeep → Prepare, in that order:

1. **Act** — spend up to **4 shared actions** (`getActionsPerTurn(state)`) on
   moves and attacks. Movement can repeat; attacks obey Cleave (§4.2). Units
   that arrived at this turn's start (§5.3) act immediately. The player may end
   Act early; spending every action does not end the turn.
2. **`END_ACTION_PHASE` — mine, then pay upkeep.** Resolve passive mining once
   for the mover (§5.1), then settle upkeep (§5.5) out of the stockpile that
   mining has just refilled. Affordable upkeep is automatic unless review is
   enabled; otherwise a mandatory affordable keep-set choice pauses here. This
   command does not hand over.
3. **Prepare** — in any order, promote actual pieces (§5.4) and pay for public
   tier-1 summons by choosing their type and square (§5.2). Both verbs cost
   crystals and **no actions**. Promotions apply immediately, but actions and
   mining are already finished for this turn.

`END_PLACE_PHASE` ends the turn: it advances the kill clock once, checks the
ten-quiet-ply verdict (§9) and hands play over. Preparation always ends
explicitly, even when nothing is affordable. Income cannot be undone across the
handoff: undo is confined to the current turn. There is no queue phase.

One online time allowance covers the whole turn; a phase change never resets it.
The server retains `turn.phase='place'` for Prepare.

Tapping an empty reachable square moves immediately and keeps the piece selected.
Undo restores the move and its action cost within the current turn, including online.
Tapping an enemy with an own piece selected previews the shortest unblocked path
to an adjacent square, reserving one action for a legal attack (including Cleave
limits). A ghost marks the landing square. Confirm attack commits the movement
and attack together; Cancel spends nothing. Equal-length routes use stable
orthogonal neighbor order. Tapping a different empty square moves there immediately
and keeps the target selected if an adjacent attack is still legal. The combined
action is one local undo step and
one atomic online request.

Every board square has a thin outline in the bright ten-crystal color.
Reserves are off by default. The Reserves toggle replaces square shading with two bottom-aligned stacks of
crystal bricks on dark ground. Each crystal occupies one fixed-size slot in a
2-column × 8-row grid, filling left then right at each level (3 = 2 left + 1 right).
Every brick uses the original ten-crystal color with a slight outline. Zero is
fully dark. Counts remain in accessible square labels and inspection text;
hiding the stacks restores the reserve shading. Colors 0–10 are unchanged;
11–16 blend from the ten-crystal pale teal toward neutral white at 16.

Enemy inspection defaults **Show reach** on whenever an enemy is opened for
inspection (including tapping an enemy the selected piece cannot attack). It can
be toggled off while inspecting that piece. **Show reach** uses the match's full
action budget for movement and adds red dots on the perimeter of the potential
attack area: up to three movement actions
at current Speed, then one adjacent attack. The outline follows current
blockers and clips to board edges. It includes occupied opposing targets but
does not indicate a guaranteed kill, promotions, or paths opened by earlier
attacks. It previews a fresh enemy turn, independently of spent turn flags.

If the game continues, start the next player's turn in this order:

- Check their home occupation and existing board elimination (§9).
- Resolve all of their pending summons (§5.2) against that same board: a summon
  becomes an actual tier-1 piece when its square is empty and inside a current
  unblocked spawn rectangle (§5.3); otherwise it disappears and refunds its exact
  original cost. Incoming pieces cannot support one another.
- Heal all their units and reset their move, attack, Cleave, summon and
  promotion flags.
- Enter Act with four shared actions.

Upkeep is **not** paid at turn start. It is paid during the player's own turn, at
`END_ACTION_PHASE`, after that turn's mining (§5.5).

`turnNumber` increments when the turn passes back to White (a full round).

## 3. Movement

- Orthogonal only; no diagonals.
- A unit's **Speed** is the number of squares per **one action**. Moving
  farther in a single declared move costs multiple actions:
  `cost = ceil(squares_traveled / speed)`, path found by BFS around
  obstructions. The move is legal only if the player has that many actions
  remaining (all consumed at once).
- Units cannot move through or onto occupied squares (either side's).
- There is no zone of control; movement never triggers combat.

## 4. Combat

### 4.1 Attacks
- Melee only: attacker must be orthogonally adjacent to the target.
- An attack costs 1 action.
- **Elemental modifier (±1 ATK):** attacker gets +1 ATK against an element it
  has advantage over, −1 ATK against an element it is disadvantaged against
  (§6). Defense is never modified. Effective ATK floors at 0.

### 4.2 Cleave
- Every unit begins its turn eligible to attack once.
- **Killing the target** unlocks one further attack by that same unit, with a
  maximum of **tier attacks per turn** (I: 1, II: 2, III: 3).
- Each attack still costs **one shared action**. Moving between attacks
  is allowed at the normal cost; it neither restores nor consumes attack eligibility.
- If a target survives, the attack chain ends for that unit this turn, including
  a zero-damage hit. A later kill by another unit does not reopen that chain.
- A newly arrived Tier I can attack immediately but cannot attack twice.
- Combined attacks resolve individually; only the actual killing blow unlocks Cleave.
- History includes eliminated targets (`attackedThisTurn`); `lastAttackKilled`
  records the result of this unit's last attack. Both reset on its owner's turn.
  Completed human and AI actions, plus undo, save the board and attack allowance
  together. Save schema 5 discards unfinished games from older releases;
  no legacy tier-4 catalogue is loaded.

### 4.3 Damage and elimination
- If effective ATK ≥ effective DEF, the defender is **eliminated**.
- Otherwise the defender takes damage equal to the attack: `damageTaken`
  accumulates and reduces effective DEF (`DEF_eff = max(0, DEF −
  damageTaken)`). Multiple units can therefore bring down a big unit by
  combining attacks **within the defender's exposure window**.
- **Full heal:** `damageTaken` resets to 0 at the start of the **owner's**
  turn. Chip damage does not persist across the defender's own turn — a kill
  must be completed before the defender's turn begins. This is a deliberate
  board-game-ability ruling (state stays trackable by position plus a
  transient damage marker; no persistent per-unit HP).
- There is no retaliation damage; attacking is risk-free except for position.

## 5. Economy

### 5.1 Mining

At `END_ACTION_PHASE`, after your actions and before Prepare, every one of your units takes crystals from the square it stands on: up to its Mining stat, up to what the square holds.
The take is `min(Mining, reserve)`, reduces that square's reserve by the same amount, and enters your public bank and cumulative income.
This applies unconditionally to moved, attacked and newly arrived units; Mining 0 takes nothing, reserves never replenish, and there is no mine action or depth. Pending summons are not units and never mine.

### 5.2 Buying

- During Prepare, pay a tier-1 unit's catalogue cost to commit a **public pending
  summon**: its owner, unit type, square, paid cost and a unique ID, all visible
  to both players. The piece does not appear yet. The square must be **empty and
  inside one of your current unblocked spawn rectangles (§5.3) at the moment you
  commit**, and you may hold at most one own commitment per square. A commitment
  that fails this test is not legal and is rejected; it does not become a pending
  summon and nothing is paid or refunded.
- A pending summon becomes an actual piece at your **next** turn start, if its
  square is then empty and supported by a current unblocked spawn rectangle
  (§5.3). Otherwise it disappears and refunds its exact original cost; there is
  no relocation and no automatic replacement purchase. Only the arrival-time
  position decides whether it *survives*, so a temporary intrusion that has left
  again is harmless.
- A pending summon is not a unit: it cannot occupy a square, block movement,
  attack, be attacked, mine, promote, anchor or block a rectangle, occupy home,
  incur upkeep, or postpone elimination. One own commitment per square; real
  units may move through or stop on that square.
- Commit any number, limited only by crystals and the legal squares defined
  above — empty, inside a current unblocked rectangle, one own commitment each.
  Committing costs no actions. Higher tiers cannot be bought. Ordinary
  within-turn undo can revise a commitment before handoff.
- There is no build queue, build time, readiness or separate tech requirement.
  Every tier-2 unit was a tier-1 on the board, and every tier-3 was a tier-2:
  this is structural, enforced by the promotion path, not another prerequisite.
- The bank holds unspent purchasing power when spawns are blocked.

### 5.3 Spawning (arrival)
- A pending summon arrives at its owner's next turn start at **no action cost**.
- **Spawn rectangle:** choose any friendly unit as an *anchor*; the rectangle
  spans from the player's start corner to the anchor (inclusive, both
  corners). If **no enemy unit is inside the rectangle**, the new unit may be
  placed on any **empty** square within it. Any enemy inside the rectangle
  blocks that anchor entirely (infiltration denies spawn zones).
- The rectangle test runs **twice**, and both tests apply: once on the board as
  it stands when you commit (§5.2), and **again** on the **arrival-turn** board —
  not merely on the board as it stood when the summon was paid for. Only the
  arrival-time test can refund. A square that is occupied or unsupported *now*
  cannot be bought at all; a commitment that was legal when paid for and is
  occupied or unsupported on arrival disappears and returns its exact cost. The
  opponent therefore has one full turn to occupy the square or break its support.
- **Arrivals act immediately** on the turn they arrive — a full turn after
  payment. There is no summoning sickness, and there is no summon-and-strike: a
  piece can never act on the turn it was paid for.

### 5.4 Promotion
- During Prepare — after Act and after this turn's mining — pay
  `cost(next tier) − cost(current tier)` to upgrade a unit to the next tier of
  its element, in place. This is always 4 crystals for T1 → T2 and 8 crystals
  for T2 → T3. This turn's income can fund it.
- Restrictions: cannot skip tiers; T3 cannot promote; a unit may be promoted
  **at most once per turn**. A piece that **arrived this turn is eligible** to
  promote at that turn's Prepare. Pending summons are not on the board and
  cannot be promoted.
- A committed tier-1 therefore arrives one own turn after payment and can first
  become tier-2 at the end of that arrival turn, tier-3 one own turn later,
  giving the opponent turns to contest both the arrival and the climb.
- Promotion is public information. A promotion's new upkeep rate first applies
  after mining on the next own turn (§5.5). A promoted piece does not act again
  this turn: Act is already over.

### 5.5 Upkeep

Each turn, at `END_ACTION_PHASE` and immediately **after** that turn's mining,
pay 1 crystal for each of your tier-2 units and 2 for each tier-3. Any unit you
do not pay for is lost.
Tier1 units are free and must always be kept during upkeep. Payment uses the existing stockpile and no actions.
A promotion pays its new tier's rent beginning after mining next own turn, not retroactively.
Because mining settles first, this turn's income funds this turn's rent.

When the stockpile covers the army, all units are kept and payment is automatic.
Otherwise `END_ACTION_PHASE` pauses with a mandatory affordable keep-set choice,
before Prepare opens.
The optional **Review upkeep each turn** menu setting allows voluntary release
of tier2 and tier3 units even when all rent is affordable. Tier1 units cannot
be released. Every legal keep-set must include all owned tier1 units and be
affordable. The empty set is legal only when there are no tier1 units; it loses
if it removes the last on-board unit.
Releases are not attacks: they add no combat history, trigger no Cleave, and
never reset the inactivity clock. Healing and flag reset follow payment.

Design intent: binary DEF walls require continuing income to sustain their tier.
An income lead can become a tier lead and then a broken wall. Invading armies
and corner garrisons pay the same rent. Tier1 swarms remain free; the shared
four-action pool and Cleave are their counterweights.

## 6. Elements — the Double-Thick Triangle

Six elements form three **pairs**; advantage cycles between pairs:

```
Fire & Lightning  →  Plant & Metal  →  Water & Shadow  →  Fire & Lightning
```

- Each element has advantage (+1 ATK) over **both** elements of the pair it
  beats, and disadvantage (−1 ATK) against both elements of the pair that
  beats it. Elements within the same pair are neutral to each other.
- Defense is never elementally modified.

| Element | Pair | Beats | Loses to | Archetype | Theme |
|---|---|---|---|---|---|
| Fire | Fire-Lightning | Plant, Metal | Water, Shadow | Rush | Japanese / Asia |
| Lightning | Fire-Lightning | Plant, Metal | Water, Shadow | Rush | Swahili / Africa |
| Plant | Plant-Metal | Water, Shadow | Fire, Lightning | Expand | Quechua / S. America |
| Metal | Plant-Metal | Water, Shadow | Fire, Lightning | Expand | Tamil / South Asia |
| Water | Water-Shadow | Fire, Lightning | Plant, Metal | Balanced | Old Norse / Europe |
| Shadow | Water-Shadow | Fire, Lightning | Plant, Metal | Balanced | Turkish / Eurasia |

**Design intent (Ethan ruling, 2026-06-09):** Rush beating Expand elementally
is intended — mass Fire_1 is the zerg rush, and Expand must answer it with
play, not a type-chart veto. The archetype triangle of v1.1 §2.3
(Rush > Balanced > Expand > Rush) was **not** adopted; the Double-Thick
Triangle above is the incumbent.

Note the **"Wind" element of v1.0 no longer exists** — it was renamed and
rethemed to **Shadow** (Turkish names: Loş, Gölge, Karanlık) with
new stats.

## 7. Unit catalog (canonical: `src/game/units.ts`)

Eighteen units, three per element. Stat columns: ATK / DEF / SPD / MINE / Cost.

The catalogue has no build times. Tier-1 costs are 3/4/5 by pair, with
universal 4/8 promotion steps; Muju has DEF 3 and Irumbu DEF 5. Tier 3 is terminal.
The historical tier-4 cut and its measured tradeoffs are recorded in
`docs/TIER3_CAP-2026-09-08.md`; those well-economy measurements are not current
balance evidence. Irumbu has Speed 2, Mining 5 and DEF 5.

### Fire (Rush — ATK specialist) — Japanese
| Tier | Name | ATK | DEF | SPD | MINE | Cost |
|---|---|---|---|---|---|---|
| 1 | Hi | 2 | 1 | 2 | 1 | 3 |
| 2 | Honō | 3 | 1 | 2 | 1 | 7 |
| 3 | Kagari | 4 | 2 | 3 | 1 | 15 |

### Lightning (Rush — SPD specialist) — Swahili
| Tier | Name | ATK | DEF | SPD | MINE | Cost |
|---|---|---|---|---|---|---|
| 1 | Radi | 1 | 1 | 3 | 0 | 3 |
| 2 | Umeme | 2 | 1 | 4 | 0 | 7 |
| 3 | Kimbunga | 3 | 1 | 5 | 0 | 15 |

### Water (Balanced — DEF-leaning) — Old Norse
| Tier | Name | ATK | DEF | SPD | MINE | Cost |
|---|---|---|---|---|---|---|
| 1 | Sjór | 2 | 2 | 1 | 2 | 4 |
| 2 | Straumr | 2 | 3 | 1 | 2 | 8 |
| 3 | Ægirinn | 3 | 4 | 2 | 3 | 16 |

### Shadow (Balanced — ATK/SPD-leaning) — Turkish
| Tier | Name | ATK | DEF | SPD | MINE | Cost |
|---|---|---|---|---|---|---|
| 1 | Loş | 2 | 2 | 2 | 0 | 4 |
| 2 | Gölge | 3 | 2 | 2 | 1 | 8 |
| 3 | Karanlık | 4 | 2 | 3 | 2 | 16 |

### Plant (Expand — MINE specialist) — Quechua
| Tier | Name | ATK | DEF | SPD | MINE | Cost |
|---|---|---|---|---|---|---|
| 1 | Muju | 0 | 3 | 1 | 3 | 5 |
| 2 | Mallki | 1 | 3 | 1 | 5 | 9 |
| 3 | Sach'akuna | 2 | 4 | 1 | 8 | 17 |

### Metal (Expand — DEF specialist) — Tamil
| Tier | Name | ATK | DEF | SPD | MINE | Cost |
|---|---|---|---|---|---|---|
| 1 | Poṉ | 1 | 3 | 0 | 3 | 5 |
| 2 | Veḷḷi | 1 | 4 | 1 | 4 | 9 |
| 3 | Irumbu | 2 | 5 | 2 | 5 | 17 |

The Metal ladder is **Poṉ → Veḷḷi → Irumbu**. The title names a tier-1, tier-2,
and tier-3 unit: Muju / Hono / Irumbu — ASCII `Hono`, no macron in the title,
even though the tier-2 piece itself is Honō.

Starting units for both players: `fire_1`, `water_1`, `plant_1`.

## 8. Public information

The game is perfect-information. Both players see every unit, position,
tier, damage marker, cell reserve, current bank (`resources`) and cumulative
income (`resourcesGained`). Purchases, promotions, upkeep, the inactivity
counter, pending upkeep choice and settled income are public. The upkeep
subtotal (`resourcesUpkeep`) is telemetry, not an additional charge.

There is no hidden production or hidden spending ledger. For each game,
`board reserves + White gained + Black gained = initial map total`
(504 for new games; the stored original total for existing games); spending changes banks
but never cumulative income. The built-in AI receives the real state and searches
it: easy and medium run `AIEngineV2` (MCTS with a beam and a tactical sharpener),
and hard runs the `src/ai/hard` search engine (`?hardAi=0` opts a seat back to
`AIEngineV2`'s hard preset). Both search the rules in this document. The former
observation, belief, particle-filter and re-determinization rules in
`AI_ENGINE_QUESTIONS.md` Q1–Q3 are superseded.

## 9. Victory

- **Home occupation:** at the start of your turn, before pending summons resolve
  and before healing, if your unit occupies the opponent's home corner, you win.
  White targets (9,9); Black targets (0,0). Entering the corner does not immediately
  win: the opponent has one full turn to remove the invader. Any element or tier
  qualifies; no additional action, countdown or occupation marker is required.
  An enemy on the home corner blocks every reinforcement rectangle under the
  existing spawning rules, including every pending arrival. Existing units can
  still move, attack and promote.
  An invader must survive its **own end-of-action upkeep** before immediate
  home-checkmate can be adjudicated. The defender's rescue is judged on its
  actual army and four actions, with no pre-action promotions and no upkeep
  releases.
  **The kill clock can pre-empt checkmate.** `#` is a prediction that the
  invader will still stand on the enemy home at the start of its own next turn;
  it may be awarded only when that turn start is guaranteed. Let `c` be the kill
  clock count the hand-off at the end of the invading turn is about to produce:
  `0` if that turn contained a kill, otherwise the current clock plus one. If
  `c ≤ 8`, checkmate is awarded as above. If `c ≥ 9`, no checkmate is awarded and
  the game plays on: at `c = 9` the defender's reply is the tenth kill-free ply
  and the kill clock decides unless the defender kills; at `c = 10` the kill
  clock ends the game at that very hand-off, on mined totals, and this can never
  be pre-empted by a mate award. ("c = 9 and the invader ahead on mining" is
  deliberately not a checkmate.)
  In simultaneous invasion races, the first player's qualifying turn start wins.
  Loading a current-schema mid-turn position does not retroactively resolve an occupation.

- **Elimination:** a player with **zero units on the board** loses, regardless
  of bank. No units means no spawn anchor. There is no queue exception.
- **Kill clock:** after 10 consecutive complete player turns without an enemy
  kill by attack, the game ends immediately and the higher **mined total** wins;
  an equal total is a draw. A ply means one player's turn, not one action or
  full round (ten plies are five rounds). A *kill* is any attack that removes a
  unit; releases, refunds, promotions, mining, chip damage and disrupted or
  failed summons are not kills. An attack kill resets the counter immediately
  and that turn ends at 0 — the killer's own turn is not counted. Each completed
  turn without a kill adds 1, even when it earns crystals. Chip attacks,
  movement, summoning, arrival, refunds, promotion and upkeep removal do not
  reset it — what counts as progress is unchanged since v3.0. The clock advances
  once per turn, at `END_PLACE_PHASE`. Because the killer's turn is always ply
  zero, the tenth ply is always the last killer's turn: the most recent killer
  takes the final move before the count is judged.
  A player's **mined total** is the sum of every crystal their units have ever
  taken from the board over the whole game — never reduced by spending, upkeep,
  release or refund. **Black's starting handicap crystals count toward Black's
  mined total.** The verdict resolves immediately at the end of the tenth
  kill-free turn. The next turn never begins: no home-win check, upkeep or
  healing can override it.
  Eliminating the last enemy during a turn still wins immediately. Saved
  kill-clock results preserve reason `kill-clock`, with `winner` set for a
  decisive verdict or `null` on a tie. Archived draws from earlier revisions
  keep reason `inactivity`.
  Schema-9 unfinished saves (`muju-phasing-2`, twenty quiet plies, draw verdict)
  and schema 5-7 unfinished saves (`muju-phasing-1`, ten quiet plies, draw
  verdict) are each adjudicated once under the limit and verdict they were
  RECORDED with — a game that had already drawn keeps that result — and a
  position that is still playing resumes with its clock **restarted at 0**
  rather than carrying a count whose meaning changed twice over. The revision is
  then stamped in, so the restart happens at most once. This mirrors
  `migrateLegacyGame`'s choice when the clock's reset rule changed, and never
  revives a finished game. `LEGACY_INACTIVITY_LIMIT` (20, `muju-phasing-2`'s own
  limit) and the persistence layer's own `PHASING_1_DRAW_LIMIT` (10,
  `muju-phasing-1`'s limit, pinned separately because it numerically coincides
  with the live kill clock's own limit) exist only for that adjudication and for
  replaying an archived record; live play always uses `INACTIVITY_LIMIT` with
  the `mined-total` verdict.
  The public counter turns amber at 7 quiet turns. Both players at zero units is
  also a draw, though normal play cannot reach that position.
  The lab-only `inactivityRule: 'off'` control keeps disabling the clock, for
  scripted-bot and analysis use.
- **Resignation:** the current player may resign; opponent wins. The AI plays out current-rule games: material deficits alone do not establish
  defeat when home occupation can win. Historical elimination-only lab games retain
  the older material-based resignation heuristic.

## 10. Architecture (orientation, not contract)

- `src/game/` contains pure rules: orthogonal movement, combat/Cleave, anchor
  rectangles, tier-1 buying, promotion, upkeep, turn boundaries and victory.
  `mining.ts` owns the shared per-unit take and player income settlement;
  reducer, AI simulations, planning and harness all use the same transition.
  `units.ts` is the canonical 18-unit catalogue.
- `src/game/legality.ts` validates every human and AI gameplay action before
  `src/ai/simulate.ts` applies it. Invalid legacy mine/queue actions are rejected.
- `src/ai/` contains public-state MCTS, beam and placement-template planning,
  evaluation and a tactical sharpener. Worker protocol 2 receives the real
  state. WASM ABI 7 covers bounded tactical movement/attacks and constrained
  promotions; general purchasing/placement is outside its proof scope and
  returns unknown. JS independently validates successful tactical witnesses.
  See `docs/AI_IMPLEMENTATION_STATUS.md` for limits.
- `lab/solver/` models passive finite-cell income, buy/promote financing and
  tactical frontiers. Historical map studies stay frozen under `lab/maps/`.
- UI and tutorial use the catalogue/map constants; saves use schema 10
  (see §1, "Stored artefacts by rules revision").

## 11. Design intent and evidence

Passive mining makes income a consequence of position, alongside combat,
spawn geometry and home defense. The 4/8/16 scale gives home clusters a shorter
runway and makes expansions more valuable. Plant Mining 3/5/8 empties a fresh
16-square in 6/4/2 collections; a newly placed Plant promoted on each following
own turn collects 3 + 5 + 8 from that square, with external financing for its
climb. Full-rate income after ongoing upkeep is 3/4/6. Experts must relocate to
sustain their tempo; foragers can collect while serving another positional purpose.
Rent still applies, and a richer extraction stat is not proof of higher net
strategic value.

The queue's hidden information, build delay, blocked-spawn persistence and
third phase are replaced by a public bank and a visible promotion climb.
No promotion on the purchase turn is load-bearing: the tier-3 path remains
contestable over two opponent turns. Haste, four actions, spawn rectangles,
the exact map topology and all catalogue stats/costs remain unchanged.

See `JUDGMENT_LOG.md` J-017/J-018 and the two September 9 simplification
reports for decisions, verification and registered future studies. Existing
opening/rush concerns remain hypotheses; implementation does not establish
fairness or rule out a first-player advantage.
