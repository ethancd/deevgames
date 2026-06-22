# BALANCE_PROPOSALS.md — Might & Magic: Spire

> Design artifact. **No gameplay code changes here.** Grounded in the *actual*
> v1 engine: `battle.ts`, `adapter.ts`, `run.ts`, `COMBAT.md`, `ADAPTER.md`, and
> the `@mms/data` corpus (27 spells, 17 artifacts, 14 Necropolis creatures).
> Every "INERT" / "no-op" flag below was traced through the real code path, not
> guessed.

---

## 0. Engine truths that drive every ranking (read first)

These are the load-bearing facts. Most balance problems are downstream of them.

1. **Damage = `count · perCreatureRoll · adMultiplier`.** Hero attack/defense add
   *flat to the whole army*. A/D curve: +5%/pt attack (cap +300%), −2.5%/pt
   defense (cap −70%). (`computeDamage`, `adMultiplier`.)
2. **Spell magnitude = `base + powerScale · hero.power`.** Resolved at cast.
   (`spellMagnitude`.)
3. **One spell per turn** (`spellCastThisTurn`). Mana = `knowledge·10` (+manaMax
   artifacts), +1/turn regen, full on Rest.
4. **No status/duration layer exists.** Every buff/debuff/disable a spell applies
   is a **permanent stat mutation for the rest of the battle**, and **repeated
   casts stack additively** (`applyStatMod`, no expiry). Disable (`Blind`) zeros
   the target's damage roll **forever** — it never wears off and is never undone.
5. **Speed is nearly inert.** It only sets enemy *action order* (`endPlayerTurn`
   sort). There is no initiative-gated extra attack, and every living stack acts
   exactly once per turn regardless of speed. So **+/− speed barely matters**.
6. **AoE is faked.** `area / multi-target / chain` → resolve as **single-target**.
   `all-units` → loops **enemy stacks only** (never your own army). No hex/zone.
7. **Abilities the engine actually reads:** `shooter`/`ranged`, `no enemy
   retaliation`, `life drain`, `regeneration`, `undead` (necromancy/flavor).
   **Everything else on a creature is flavor**: Flying (reach-back OFF), Disease,
   Drains enemy mana, Death cloud attack, Curse, Death blow, Death/Dragon,
   Reduces enemy morale, Aging, No morale penalty.
8. **Equipment effects parsed-but-unapplied in combat:** `hpPerCreature`,
   `speedAll`. Only `primaryDeltas`, `manaMax`, and `necromancyBonus` actually do
   anything.
9. **`parseBonuses` only understands `+N <primary>`, `+N to all primary`,
   `health point per creature`, `speed to all creatures`, `spell points`,
   `necromancy`.** Any artifact whose text is purely prose (Morale, "Casts X on
   combat start", "improves Air spells", "Protects from Death Ripple") parses to
   `{kind:'none'}` → **does nothing**.

---

## 1. RANKINGS

Tier = effectiveness **in the current engine** (S best … F dead weight).
"INERT" = does literally nothing or is grossly mis-modeled today.

### 1a. SPELLS (27)

| Spell | School/Lvl | Tier | Rationale (current engine) | Inert? |
|---|---|---|---|---|
| **Implosion** | Earth 5 | **S** | base70 +22·pow single-target nuke; deletes any one stack. | |
| **Titan's Lightning Bolt** | Air 5 | **S** | Identical numbers to Implosion (L5 damage). Best nukes. | |
| **Blind** | Fire 2 | **S** | `disable` zeros the target's damage roll **permanently** (never expires). Neutralizes the boss dragon for the whole fight for 10 mana. Single most broken spell. | |
| **Magic Arrow** | All 1 | **A** | base10 +10·pow, 5 mana, always in book. Cheap reliable chip; great mana-efficiency early. | |
| **Lightning Bolt** | Air 2 | **A** | L2 single-target (base18 +12·pow). Solid mid nuke. | |
| **Curse** | Fire 1 | **A** | *Mapped* to −attack debuff (permanent, stacks). NOT its real "min damage" effect, but a stacking −attack is strong & cheap. Theme wrong. | theme-wrong |
| **Weakness** | Water 2 | **A** | −attack debuff, permanent, stacks. Same engine effect as Curse, slightly bigger. | |
| **Bless** | Water 1 | **B** | *Mapped* to flat +attack ally buff (permanent). NOT "always max damage." Decent, in starter book. | theme-wrong |
| **Disrupting Ray** | Air 1 | **B** | −defense debuff on enemy → raises your A/D mult vs it. Permanent, stacks. Real value. | |
| **Stone Skin** | Earth 1 | **B** | +defense ally buff. Permanent. Reduces incoming A/D mult. | |
| **Resurrection** | Earth 4 | **B** | `heal` to ally, base40 +10·pow, capped at `startCount`. Real army sustain. | |
| **Animate Dead** | Earth 3 | **B** | `heal` base30 +10·pow; can even rebuild a wiped stack up to cap (`applyHeal` count==0 branch). `undead-synergy` tag ignored but heal still lands. | synergy-tag dead |
| **Cure** | Water 1 | **B** | `heal,dispel` → resolves as heal (base10 +10·pow). Cheap small heal; the dispel half does nothing. | dispel half dead |
| **Fireball** | Fire 3 | **C** | `area` → **single-target** L3 damage (base28 +15·pow). Overpriced single nuke; AoE lost. | AoE faked |
| **Inferno** | Fire 4 | **C** | `area` → single-target L4 (base45 +18·pow). 16 mana for one stack. | AoE faked |
| **Meteor Shower** | Earth 4 | **C** | `area` → single-target L4. Same as Inferno, costlier (16). | AoE faked |
| **Chain Lightning** | Air 4 | **C** | `chain` → single-target L4 (24 mana). Pays AoE price, hits one. | AoE faked |
| **Armageddon** | Fire 5 | **C** | `all-units` → loops **enemies only**. So it's an all-enemy-stacks L5 nuke that **skips its own "friend and foe" downside**. Strong vs many stacks but its drawback (and identity) is gone. | downside missing |
| **Death Ripple** | Earth 2 | **C** | `all-units` → all-enemy L2 nuke. `undead-synergy` (undead immune) **ignored** — but since it never hits your army anyway, moot. Theme lost. | synergy dead |
| **Shield** | Earth 1 | **C** | +defense buff. **Mechanically identical to Stone Skin** ("melee-only" distinction lost). Redundant. | dup of Stone Skin |
| **Precision** | Air 2 | **C** | `buff,ranged` → +damage buff to *any* ally (not just ranged). Works, but +damage is weak vs +attack (no A/D leverage) and theme is loose. | theme loose |
| **Fire Wall** | Fire 2 | **D** | `damage,area,terrain` → one-shot single-target L2 damage. The persistent-zone identity is fully gone. | terrain dead |
| **Slow** | Earth 1 | **D** | −speed debuff. Speed only reorders enemy actions; **almost no effect**. | speed inert |
| **Haste** | Air 1 | **D** | +speed buff. Same problem — speed barely matters. Starter-book filler. | speed inert |
| **Prayer** | Water 3 | **D** | Tags `attack,defense,speed` but adapter's `if speed first` → buffs **speed only**. So a 16-mana spell grants a near-useless +speed and silently drops attack/defense. | mis-routed |
| **Forgetfulness** | Water 2 | **D** | `debuff,ranged` → routes to **−attack** debuff. The real effect (ranged stack forced to melee) doesn't exist. Just a weak Weakness. | theme dead |
| **Dispel** | Water 1 | **F** | Tags `dispel,single-target` only — no kind tag → `kindFromTags` default **`buff`** → it casts a **+attack buff on an enemy stack's-ally slot**… i.e. resolves as `buff` on an ally. Net: a tiny random +attack ally buff labeled "Dispel." Completely mis-modeled; no dispel exists (nothing to dispel anyway). | fully broken |

**Spell worst offenders:** Dispel (does the wrong thing entirely), Prayer
(drops 2 of its 3 stats), Forgetfulness / Fire Wall / Slow / Haste (identity
gone), and the four AoE nukes (pay AoE cost, hit one).

### 1b. ARTIFACTS (17)

| Artifact | Class/Slot | Tier | Rationale (current engine) | Inert? |
|---|---|---|---|---|
| **Sword of Judgement** | Relic/RH | **S** | `+12 Atk +12 Def` to whole army **+500 max mana**. Massive A/D swing + effectively unlimited casting. Best item by far. | |
| **Cloak of the Undead King** | Relic/Neck | **S** | `+0.15` necromancy. Buffs the single compounding growth lever. Run-defining for necro. | |
| **Dragon Wing Tabard** | Major/Torso | **A** | `+3 all primary` → +3 atk/+3 def army-wide, +3 power (spells), +30 mana. | |
| **Sword of Hellfire** | Major/RH | **A** | `+6 Attack` whole army. Big A/D mult lever. | |
| **Centaur's Axe** | Treasure/RH | **B** | `+2 Attack`, cheap (60g). Strong gold-efficiency early. | |
| **Quiet Eye of the Dragon** | Minor/Ring | **B** | `+1 Atk +1 Def`. Solid cheap all-rounder. | |
| **Shield of the Dwarven Lords** | Treasure/LH | **B** | `+2 Defense` army-wide. | |
| **Helm of the Alabaster Unicorn** | Minor/Head | **C** | `+1 Knowledge` → +10 max mana. Niche; one extra small spell. | |
| **Armageddon's Blade** | Relic/RH | **C** | Only `+3 all primary` parses (good). Its headline — cast Armageddon, Armageddon immunity — is **lost**. A worse Sword of Judgement. | half-inert |
| **Ring of Vitality** | Treasure/Ring | **F** | `hpPerCreature` parsed but **never applied in combat**. Pure no-op. | **INERT** |
| **Necklace of Swiftness** | Minor/Neck | **F** | `speedAll` parsed but **never applied** — and speed is inert anyway. Double-dead. | **INERT** |
| **Cape of Conjuring** | Treasure/Neck | **F** | "Extends spell duration." No duration system. Parses to none. | **INERT** |
| **Speculum** | Treasure/Misc | **F** | "Scouting radius." No map scouting/fog. None. | **INERT** |
| **Pendant of Death** | Minor/Neck | **F** | "Protects from Death Ripple." No protection hook; Ripple can't hit you anyway. None. | **INERT** |
| **Orb of the Firmament** | Major/Misc | **F** | "Improves Air spells." No per-school scaling hook. None. | **INERT** |
| **Ring of the Wayfarer** | Major/Ring | **F** | `+1 Morale` (no morale system) + movement (no overworld move). Parses to none. | **INERT** |
| **Armor of the Damned** | Relic/Torso | **F** | "Casts Slow/Curse/Weakness/Misfortune on all enemies at combat start." No cast-on-start hook; prose unparsed. A **Relic that does nothing.** | **INERT** |

**Artifact worst offenders:** *8 of 17 artifacts are fully inert*, including a
**Relic (Armor of the Damned)** and a **Relic half-dead (Armageddon's Blade)**.
The Misc and Neck slots are graveyards. Ring of Vitality / Necklace of Swiftness
are parsed-but-unapplied (closest to "fixable in one line").

### 1c. ABILITIES (creature abilities, as seen by the engine)

| Ability | On | Tier | Rationale | Inert? |
|---|---|---|---|---|
| **Ranged / Shooter** | Lich, Power Lich | **S** | Back rank, hits **any** stack, takes **no retaliation**. Strongest ability — full damage with no downside. (`isShooter`, `legalTargets`.) | |
| **Life drain** | Vampire Lord | **A** | Heals attacker by damage dealt, capped at `startCount`. Real sustain on a flyer. (`resolveAttack`.) | |
| **No enemy retaliation** | Vampire, Vampire Lord | **A** | Attacker takes no counter. Big for fragile high-dmg melee. | |
| **Regeneration** | Wight, Wraith | **B** | Top creature heals to full each owner turn-start. Real, if modest (one creature). | |
| **Undead / No morale penalty** | all Necropolis | **B** | Flavor in battle, but gates **Necromancy** raising — the run's growth engine. Indirectly huge. | flavor-but-gating |
| **Flying** | Wight, Vamp, Dragons… | **F** | Reach-back **disabled in v1**. A Vampire fights from the front. Pure flavor today. | **INERT** |
| **Curse** (Black/Dread Knight) | T6 | **F** | Not parsed. No on-hit min-damage debuff. | **INERT** |
| **Death blow** (Dread Knight) | T6+ | **F** | Not parsed. No double-damage proc. | **INERT** |
| **Disease** (Zombie) | T2+ | **F** | Not parsed. No DoT/attack-down. | **INERT** |
| **Drains enemy mana** (Wraith) | T3+ | **F** | Not parsed. Enemies have no hero/mana; even vs player, no hook. | **INERT** |
| **Death cloud attack** (Lich) | T5 | **F** | Not parsed. Should be splash AoE; resolves as single melee… er, ranged hit only. | **INERT** |
| **Reduces enemy morale** (Dragons) | T7 | **F** | No morale system. | **INERT** |
| **Aging** (Ghost Dragon) | T7+ | **F** | No max-hp-halving hook. | **INERT** |
| **Dragon / Death** (typing) | T6–7 | **F** | No spell-immunity / typing system. | **INERT** |

**Ability worst offenders:** **9 of ~14 distinct abilities are pure flavor.**
The entire T6–T7 identity (Curse, Death blow, Aging, morale-reduction, Death
cloud) is cosmetic — high-tier units are just big stat-sticks. **Flying** being
off is the most felt: it silently flattens half the roster's positioning.

---

## 2. PER-SPELL PROPOSALS

For each spell: **3 HoMM3-mechanics** proposals (add a real subsystem so the
spell gets its authentic effect) and **3 fit-existing** proposals (re-express it
in today's `damage/heal/buff/debuff/disable` + count/mana, no new subsystem).
Near-identical spells are grouped; all 27 covered.

> **Grouping key:** `[DMG-ST]` single-target nukes · `[DMG-AOE]` faked-AoE nukes
> · `[ATK±]` attack buff/debuff · `[DEF±]` defense buff/debuff · `[SPD±]` speed ·
> `[HEAL]` heal/res · `[DISABLE]` Blind · `[UTILITY]` Cure/Dispel ·
> `[SPECIAL]` Bless/Curse/Precision/Forgetfulness/Fire Wall/Armageddon/Death Ripple.

### [DMG-ST] Magic Arrow · Lightning Bolt · Implosion · Titan's Lightning Bolt
These already work as intended (single-target damage scaling by level). Keep.
- **HoMM3-1:** Add **spell-school resistances/immunities** (Dragons immune to L≤3,
  etc.) so nukes interact with creature typing. Titan's Bolt ignores Air immunity.
- **HoMM3-2:** Add a **spell-power vs creature-level** falloff (HoMM3's "magic
  resistance" / level damage tables) so a L5 nuke isn't flat across tiers.
- **HoMM3-3:** Add **Sorcery skill** (hero skill) multiplying all damage spells;
  ties Magic Arrow's value to a build, not a flat constant.
- **fit-1:** Already correct — just tune `DAMAGE_*_BY_LEVEL`. (Lightning vs
  Implosion identity = keep Implosion higher base, no AoE.)
- **fit-2:** Give Implosion/Titan's a small **`disable` rider** (set target
  `damageMax=damageMin` for the fight) to mark them as "elite-killers."
- **fit-3:** Make Magic Arrow `powerScale` higher but `base` lower, so it's the
  *scaling* nuke and the L5s are the *burst* nukes — meaningful choice.

### [DMG-AOE] Fireball · Inferno · Meteor Shower · Chain Lightning
Today: pay AoE price, hit one stack. Identity fully lost.
- **HoMM3-1:** Add **positions/adjacency** (even a 1-D rank+slot index) so "area"
  hits the target **plus its neighbors**; Chain Lightning arcs to the next stack
  at halved damage.
- **HoMM3-2:** Add a **`multiTarget` SpellEffect** that hits the *N highest-count*
  enemy stacks (no geometry needed) — Fireball N=2, Inferno N=3, Chain N=4 with
  decay. Lightweight "AoE without hexes."
- **HoMM3-3:** Add **terrain/obstacle objects** so Fire Wall-style persistence and
  Meteor's "target area" mean something; meteors damage a zone for 1 round.
- **fit-1:** Re-tag them as honest **`all-units`→allEnemies** nukes (they already
  loop enemies) so at least they hit every enemy stack — matching their mana cost.
- **fit-2:** Keep single-target but give each a **secondary effect** to justify
  the cost: Fireball → damage + `−defense` debuff; Meteor → damage + small
  `−attack`; Chain → damage that also hits the 2nd-strongest stack for half.
- **fit-3:** Drop their mana cost to single-target parity (they're single-target
  in fact), making them sidegrades to Lightning Bolt rather than traps.

### [ATK+] Bless · [ATK−] Curse · Weakness · [DEF+] Stone Skin · Shield · [DEF−] Disrupting Ray
All resolve as permanent, **stacking** flat attack/defense mods.
- **HoMM3-1 (covers all):** Add a **status-effect/duration layer** (the keystone
  medium subsystem): each is a *timed* modifier (e.g. 3 rounds), non-stacking
  (recast refreshes). This alone fixes the "spam to stack to infinity" exploit and
  restores HoMM3 feel for ~8 spells at once.
- **HoMM3-2:** Bless/Curse get their **real** effect — Bless = "rolls
  `damageMax` always"; Curse = "rolls `damageMin` always" — via a per-stack
  `rollMode` flag the duration layer expires.
- **HoMM3-3:** Add **Shield vs Air-Shield distinction** (Shield = −% melee dmg,
  Air Shield = −% ranged) once a damage-type tag exists, separating Shield from
  Stone Skin.
- **fit-1 (Bless/Curse):** Implement `rollMode` cheaply *without* duration:
  Bless sets `damageMin = damageMax` on the ally for the battle; Curse sets
  `damageMax = damageMin` on the enemy. Reuses the exact mechanism `disable`
  already uses (it edits the damage roll). **Implementation-ready.**
- **fit-2 (Shield):** Differentiate from Stone Skin by routing Shield to a new
  small `block` field (flat damage reduction subtracted post-mult) while Stone
  Skin stays +defense (pre-mult). Two distinct defensive knobs.
- **fit-3 (all):** Cap stacking at +/−N and tune base via level so repeated casts
  have diminishing returns without a full duration system.

### [SPD+] Haste · [SPD−] Slow · (speed half of Prayer)
Today: speed only reorders enemy turns → near-inert.
- **HoMM3-1:** Add **initiative** (the marquee heavy subsystem): faster stacks act
  first and very-fast stacks may act twice. Then Haste/Slow are top-tier tempo.
- **HoMM3-2:** Add **"strike-first" / extra-attack on speed gap** so Haste lets a
  stack attack before retaliation resolves.
- **HoMM3-3:** Tie speed to **reach** (fast melee can hit the back rank) — Haste
  becomes a soft flying-reach enabler.
- **fit-1:** Re-skin Slow → **−attack and −defense** debuff (a "hobbled" creature
  is just weaker); Haste → small **+attack** ("charging in"). Themeless but real.
- **fit-2:** Make Slow grant the caster's side **a free attack** by setting the
  enemy stack `hasActed=true`-equivalent (skip its next action) — usable as a
  one-shot `disable`-style effect (skip-turn) rather than speed.
- **fit-3:** Have Haste set the ally's `damageMin=damageMax` for one turn (acts
  "sharply") — folds into the Bless mechanism; Slow does the inverse to an enemy.

### [HEAL] Resurrection · Animate Dead · (heal half of Cure)
Already functional (`heal`, capped at `startCount`).
- **HoMM3-1:** Add **undead-vs-living resurrection rules**: Animate Dead only
  works on undead (your whole roster is undead — fine), Resurrection on living;
  enforced by a creature-type check.
- **HoMM3-2:** Make resurrect cap = `startCount` of the *map* stack (persist
  beyond a single battle's start) so a wiped stack can be rebuilt across fights.
- **HoMM3-3:** Add **partial-resurrect overflow** (excess heal banks toward next
  raise) tied to the Necromancy ledger.
- **fit-1 (Cure):** Use the unused `dispel` half — Cure should **strip the
  strongest debuff** off the ally (needs a tiny tracked-effects list, or in the
  no-tracking world, **reset the ally's stats to its base creature stats**).
- **fit-2 (Animate Dead):** Boost its `base/scale` above Cure's so the 3 heal
  spells form a clear ladder (Cure cheap < Animate Dead < Resurrection).
- **fit-3:** Let heals overheal into `startCount` (already do) but surface the
  resurrect count in the log; tune so Resurrection is the boss-fight clutch.

### [DISABLE] Blind
Today: **permanent** damage-zero on one stack — S-tier and overpowered (never
expires; trivializes the boss dragon).
- **HoMM3-1:** Duration layer: Blind lasts K rounds and **breaks when the blinded
  stack is attacked** (the real HoMM3 rule). Massive nerf to honesty.
- **HoMM3-2:** Add a **resist roll** (higher-tier/Dragon types resist Blind),
  capping its dominance over bosses.
- **HoMM3-3:** Make Blind **mutually exclusive with attacking it** — if you damage
  the blinded stack you wake it, forcing a real tactical choice.
- **fit-1:** Cheapest fix today: have `disable` **expire after one enemy turn**
  (restore `damageMin/Max` at that stack's next action) — needs storing the
  pre-disable values; a tiny per-stack field.
- **fit-2:** Make Blind reduce damage by a % (debuff-style, e.g. −70%) instead of
  to zero, so it's strong but not an off-switch.
- **fit-3:** Gate Blind to one active instance (a second cast moves it, not
  stacks), preventing chain-blinding a multi-stack enemy.

### [UTILITY] Cure (utility half) · Dispel
- **HoMM3-1:** Duration/status layer makes both real: Dispel removes all timed
  effects from a stack; Cure removes negatives + heals.
- **HoMM3-2:** Add **"dispellable" tags** to buffs/debuffs so Dispel can strip an
  enemy's Bless or your own bad luck.
- **HoMM3-3:** Cure additionally removes **Disease/Aging/Curse** on-hit statuses
  once those abilities are mechanized.
- **fit-1 (Dispel):** Stop it defaulting to `buff`. Add a `reset` SpellEffect
  kind: **set the target stack's stats back to its base creature stats** (undoes
  any debuff *or* buff). Works with zero tracking. **Implementation-ready.**
- **fit-2 (Dispel):** Minimally, re-tag/re-route so Dispel is at least a **benign
  no-op on an ally** rather than a mislabeled enemy-targeting buff (it currently
  resolves on the wrong side — a correctness bug to flag).
- **fit-3 (Cure):** Give Cure a small `reset`-self rider on top of its heal, so
  its two tags both do something.

### [SPECIAL] Precision · Forgetfulness · Fire Wall · Armageddon · Death Ripple
- **Precision — HoMM3:** with a shooter/ammo system, +ranged-damage to shooters
  only. **fit:** keep as +damage buff but **gate to back-rank stacks** (check
  `rank==="back"`), restoring identity for free.
- **Forgetfulness — HoMM3:** with the shooter system, set the enemy `isShooter`
  off for K rounds (it must melee → eats retaliation, loses reach). **fit:** add
  a per-stack `noShoot` flag the engine reads in `isShooter`; one boolean,
  re-uses the existing shooter branch. **Implementation-ready-ish.**
- **Fire Wall — HoMM3:** terrain/obstacle subsystem → a persistent damaging zone.
  **fit:** convert to a **damage-over-2-turns** debuff (tick at enemy turn start)
  or just an honest single-target burn (current), but lower its mana.
- **Armageddon — HoMM3:** true battlefield AoE that **also hits your army**;
  pairs with Undead/immunity (your skeletons are fragile, so it's a real risk).
  **fit:** make it loop **both** armies (it already loops; just include
  `yourArmy`) so its "friend and foe" downside and identity return.
- **Death Ripple — HoMM3:** all-units damage with **undead immunity** honored —
  since your army is *all undead*, Ripple becomes a signature "safe nuke." This is
  the single best thematic win available. **fit:** in the `all-units` loop, skip
  stacks with `hasAbility(s,"undead")` — then re-route Ripple to hit **both**
  armies; your undead are immune, enemy undead (it's a mirror!) also immune.
  Honor the tag with a one-line guard. **Implementation-ready.**

---

## 3. CONSTRAINT-SATISFACTION SYNTHESIS (LIGHT / MEDIUM / HEAVY)

Treat the redesign as a CSP. **Variables** = which mechanics to add. **Objective**
= maximize the count of spells/artifacts/abilities that become meaningful.
**Constraints** define three budget tiers.

### LIGHT set — *additive only, reuse existing kinds, no new subsystem, no UI rework.* **(Implement next — ordered by value.)**

Each item names the inert/broken element it fixes and the exact small rule.

1. **Apply parsed-but-dropped equipment effects in combat.** `hpPerCreature` →
   add to every stack's `maxHpPer` (and `hpTop`) at battle open; `speedAll` →
   add to `speed`. *Activates:* **Ring of Vitality**, **Necklace of Swiftness**
   (becomes a +hp / +speed item — and feeds item 6). One function in `openCombat`.
2. **Bless/Curse → real roll-mode (reuse the `disable` damage-roll trick).**
   Bless: ally `damageMin = damageMax`. Curse: enemy `damageMax = damageMin`.
   *Activates/fixes:* **Bless**, **Curse** (correct identity), and makes them
   distinct from Weakness/Stone Skin. No new field.
3. **Dispel/Reset → add a `reset` resolution** (set target's `attack/defense/
   speed/damageMin/damageMax` back to its base-creature stats). *Fixes:*
   **Dispel** (currently a mislabeled enemy buff — also a correctness bug), gives
   **Cure**'s dispel tag a job. Pure data lookup, no tracking.
4. **Death Ripple honors Undead + hits both armies.** `all-units` loop includes
   `yourArmy`, skipping `hasAbility(s,"undead")`. *Activates:* **Death Ripple**'s
   `undead-synergy` identity (huge for an all-undead roster) and incidentally
   **Pendant of Death** if you later let it gate the immunity. One guard.
5. **Armageddon hits both armies.** Include `yourArmy` in its `all-units` loop.
   *Fixes:* **Armageddon**'s missing downside/identity. One line.
6. **Prayer routes to all three stats.** Replace the `if speed first` chain with
   "apply +mag to attack AND defense AND speed." *Fixes:* **Prayer** (currently
   silently speed-only). Trivial.
7. **Precision gates to back rank; Forgetfulness adds a `noShoot` flag.**
   Precision only buffs `rank==="back"` ally; add a per-stack `noShoot` boolean
   that `isShooter` checks. *Fixes:* **Precision** identity and **Forgetfulness**
   (enemy shooter forced to melee → eats retaliation). Reuses the shooter branch.
8. **Blind expires (anti-degenerate).** Store the disabled stack's pre-zero
   `damageMin/Max`; restore at that stack's next action. *Fixes:* the **Blind**
   permanent-lock exploit — the only S-tier-broken spell. Small per-stack field.

**NOT in LIGHT (explicitly):** morale, luck, initiative, real AoE geometry,
flying-reach-back, on-combat-start artifact casting (Armor of the Damned),
per-school spell scaling (Orb), duration timers. Speed stays weak (item 1 only
makes Necklace non-inert, not strong). Shield stays a Stone-Skin dup (needs
`block` — that's MEDIUM).

**LIGHT scoreboard:** turns ~**8 spells** (Bless, Curse, Dispel, Cure, Death
Ripple, Armageddon, Prayer, Precision, Forgetfulness, Blind) from broken/inert to
correct, and **2 artifacts** (Ring of Vitality, Necklace of Swiftness) from inert
to live — with zero new subsystems and no UI work.

### MEDIUM set — *one bounded new subsystem: a generic status/duration layer (+ modest UI).* Adds to LIGHT:

- **Status-effect layer:** each stack holds `effects: {stat, delta, rounds}[]`;
  `effAttack/effDefense` and damage roll read modifiers off it; ticks down at
  round start; **recast refreshes, does not stack** (kills the buff-spam exploit).
- **All buff/debuff spells become timed & non-stacking:** Bless, Curse, Weakness,
  Stone Skin, Shield, Disrupting Ray, Slow, Haste, Prayer, Precision — now
  HoMM3-honest. Blind becomes "K rounds, breaks on hit."
- **`block` field** (flat post-mult reduction): **Shield** = block, **Stone
  Skin** = +defense → finally distinct. Cape of Conjuring becomes live
  (+duration to all timed effects).
- **On-combat-start scripted casts:** parse "Casts X on all enemies at start" →
  **Armor of the Damned** becomes a real Relic (applies timed Slow/Curse/Weakness
  at round 1).
- **Per-school spell multiplier:** **Orb of the Firmament** (+Air), and a Sorcery
  hero skill, multiply matching spell magnitude.
- **DoT/zone-lite:** Fire Wall / Meteor leave a 1–2 round damage tick on the
  target (no geometry, just a timed negative effect).

*MEDIUM scoreboard:* nearly **all 27 spells** correct; **Cape, Armor of the
Damned, Orb** activated (3 more inert artifacts revived).

### HEAVY set — *multiple subsystems: positions + initiative + morale/luck (+ real UI).* Adds to MEDIUM:

- **Position/adjacency index** (rank + slot) → real AoE: Fireball/Inferno/Meteor
  hit a target **and neighbors**; Chain Lightning arcs with decay; **Flying
  reach-back** turns on (Vampire/Dragon ignore the front). Activates the whole
  flyer roster's identity.
- **Initiative/turn-order with extra actions** → Haste/Slow/Necklace/Prayer-speed
  become top-tier tempo; speed stops being inert.
- **Morale & Luck** → **Ring of the Wayfarer** (+morale), Bone/Ghost Dragon
  "reduces enemy morale", "No morale penalty" on undead, and luck rolls all go
  live; Bless/Curse can interact with morale.
- **On-hit status abilities** (`Disease`, `Aging`, `Curse`, `Death blow`, `Death
  cloud` splash, `Drains mana`) mechanized via the MEDIUM status layer + positions
  → T2–T7 creatures get their real kits; Cure/Dispel gain targets to clean.
- **Spell-school immunity/typing** → Dragon immunities, Death Ripple/Armageddon
  interactions, Armageddon's Blade immunity all meaningful.

*HEAVY scoreboard:* the **entire** spell/artifact/ability set becomes meaningful;
this is "actual HoMM3." Cost: it's effectively a second engine.

#### CSP consistency note
The three sets are **nested and contradiction-free**: LIGHT picks only additive
rules that don't presuppose a missing subsystem (it deliberately leaves Shield a
dup and speed weak rather than half-build `block`/initiative). MEDIUM introduces
exactly one shared primitive (the status layer) that *retroactively upgrades*
LIGHT's roll-mode hacks into timed effects. HEAVY adds the two primitives
(positions, initiative) that LIGHT/MEDIUM intentionally avoided. No rule in a
lower tier blocks a higher-tier rule.

---

## 4. WHAT I'D CUT IF FORCED + OPEN QUESTIONS

**Cut first (lowest value / highest awkwardness):**
- **Speed mechanics entirely** until HEAVY. Without initiative, every speed
  spell/artifact (Haste, Slow, Necklace, Prayer-speed) is near-cosmetic; don't
  spend LIGHT effort making them "work" — just make Necklace non-inert and move
  on. Re-skinning Slow→−attack (a fit-existing idea) is *fine* but muddies theme;
  I'd rather leave Slow honestly weak and flagged than ship a fake.
- **The four AoE nukes' geometry.** Cheapest acceptable answer is "route them to
  `all-units`→allEnemies" (LIGHT-adjacent) or cut their mana to single-target
  parity. Real area needs HEAVY; don't half-build it.
- **Fire Wall / terrain / Cape-of-Conjuring duration** — all wait for MEDIUM's
  status layer; no point faking persistence.
- If LIGHT must shrink: keep items **8 (Blind nerf), 2 (Bless/Curse), 3 (Dispel),
  4 (Death Ripple)** — these fix the worst exploit and the most broken/identity-
  defining spells. Drop items 1, 6, 7 last.

**Open questions for Ethan:**
1. **Is Blind's permanent lock a bug or a feature?** It's the strongest line in
   the game right now (10 mana hard-disables the boss for the whole fight). Nerf
   in LIGHT (item 8) or leave it as a deliberate "answer to the dragon wall"?
2. **Buff/debuff stacking:** are permanent, additively-stacking stat mods
   intended? If yes, a hero who out-mana-regens a fight can stack Curse/Weakness
   to delete enemy damage. If no, this argues for jumping straight to MEDIUM's
   non-stacking duration layer.
3. **Death Ripple as the "undead safe-nuke" signature** — do you want the roster's
   all-undead nature to be a *spell-list* advantage (Ripple/Armageddon immunity),
   not just a Necromancy one? That's the highest-flavor LIGHT win (item 4) but it
   makes Ripple a near-auto-include.
4. **Relics doing nothing:** Armor of the Damned and (half of) Armageddon's Blade
   are Relics that don't deliver their headline. Acceptable as "stat-stick
   relics" for now, or is a dead Relic a content bug to hide from the shop until
   MEDIUM?
5. **Shield vs Stone Skin** are identical today. Ship one and cut the other from
   the pool, or commit to the `block` field (MEDIUM) to differentiate?
6. **Enemy spellcasting:** the enemy has a `NULL_HERO` (no mana, no spellbook).
   Should bosses/elites cast (e.g. Lich AoE, Armor-of-the-Damned-style openers)?
   Several abilities (Death cloud, Curse-on-hit) only matter if enemies use them.
