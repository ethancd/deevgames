# BREADTH_ANALYSIS.md — Might & Magic: Spire content-expansion breadth study

> Design artifact. **No gameplay code changes here.** Sibling to
> `BALANCE_PROPOSALS.md` (which goes deep on the shipped *Necropolis-only* corpus:
> 27 spells, 17 artifacts, 14 creatures). This doc goes **wide**: it surveys all 9
> base-HoMM3 factions, then ranks the **NEW content** an expansion would add —
> **Castle (good)** and **Stronghold (neutral)** creatures first, plus the ~3×
> spell and artifact pools — by *naive power in the CURRENT engine*. The question
> answered throughout: **"if we dropped this in as-is, how strong would it be —
> and is it INERT because its key ability isn't mechanized?"**
>
> Analyzed through the **strategy-mindset** lens (slime-mold: find the dominant
> path, flag the dead options). Grouped aggressively where entities share an
> engine fate; grouping is called out each time.

---

## 0. Engine truths that decide every ranking (the load-bearing facts)

Traced through `battle.ts` / `adapter.ts` / `run.ts` at branch tip
`leyline/mms-breadth-analysis` (off the orchestrator engine). These are the same
truths as `BALANCE_PROPOSALS.md §0`, restated with the deltas the BATCH/LIGHT/§19
work added since.

1. **Damage = `count · perCreatureRoll · adMultiplier`.** Hero attack/defense add
   **flat to the whole army**. A/D curve: +5%/pt attack (cap +300% at diff≥60),
   −2.5%/pt defense (cap −70% at diff≤−28). So **+attack scales with stack size and
   compounds with the A/D multiplier** — the single best stat to stack.
2. **Two ranks.** Melee hits front-only until front is empty. **Shooters** hit any
   rank + take **no retaliation** (strongest profile). **Flyers** hit any rank but
   are melee → take/deal retaliation (flying-reach-back is **ON** now, §15).
3. **Retaliation once per round** per defender (`hasRetaliated`, reset round start).
   Suppressed by shooting, by `no enemy retaliation`, or once already used.
4. **Spells:** magnitude = `base + powerScale·hero.power`. **One cast/turn.** Mana
   = `knowledge·10` (+ `manaMax` artifacts), +1/turn, full on Rest.
5. **NO status/duration layer, NO initiative, NO positions/AoE geometry, NO
   morale, NO luck, NO spell-school immunity.** These five missing subsystems are
   where almost every INERT verdict below comes from.
6. **Buffs/debuffs are permanent for the battle but NO-RESTACK per same spell**
   (`spellMarks`, BATCH §16-A). Different spells still stack.
7. **Mechanized creature abilities** (everything else on a creature is **flavor**):
   `undead` (gates Necromancy), `shooter`/`ranged`, `no enemy retaliation`,
   `life drain`, `regeneration`, `flying` (reach-back ON), `death blow` (20%→×2),
   `aging` (½ maxHp once/defender), `disease` (−1/−1 once), `curse` on-hit
   (min-roll once), `drains enemy mana` (−2 hero mana on enemy→player hit).
   Detection is `hasAbility` = **case-insensitive substring match** — this matters:
   a new creature whose ability string *contains* a mechanized keyword fires it
   for free; one whose string doesn't is inert.
8. **AoE is faked:** `area/chain/multi` → single-target; `all-units` → loops
   enemy stacks (or both armies for Death Ripple/Armageddon, §14).
9. **`parseBonuses` understands only:** `+N <primary>`, `+N to all primary`,
   `health point per creature`, `speed to all creatures`, `spell points`,
   `necromancy`, plus (§19) `"casting <Spell>"` → grantSpell and `"Casts A,B,C on
   … combat"` → castOnStart. **Everything else (morale, luck, "improves Air
   spells", scouting, immunity) parses to `none` → does nothing.**

> **The one-sentence model:** *Big +attack stat-sticks and shooters are S; anything
> whose identity is morale, luck, initiative/speed, real AoE, petrify/paralyze,
> resurrection, or spell-immunity is INERT until the matching subsystem ships.*

---

## 1. FACTION RESEARCH — all 9 base factions (Restoration of Erathia)

Base RoE creatures only (no AB/SoD expansion units). Conflux included as the 9th
standard town per scope. **Signature ability** = the upgraded form's defining
trait. **Engine column** flags how it lands today: ✅ mechanized · ⚠️ partial /
substring-lucky · ❌ INERT (needs a missing subsystem). Detail on Castle &
Stronghold (the expansion focus) in §2.

### Castle — *balanced "good" town; double-shot ranged + morale/resurrection backbone*
| T | Base → Upgrade | Signature ability | Engine |
|---|---|---|---|
| 1 | Pikeman → Halberdier | Bonus dmg vs cavalry | ❌ no creature-type bonus |
| 2 | Archer → **Marksman** | **Shoots twice** | ⚠️ shooter ✅, double-shot ❌ |
| 3 | Griffin → **Royal Griffin** | **Unlimited retaliation** + Flying | flying ✅, unlimited-retal ❌ |
| 4 | Swordsman → **Crusader** | **Attacks twice** | ❌ double-strike not modeled |
| 5 | Monk → **Zealot** | Shooter, **no melee penalty** | shooter ✅; melee-penalty ❌ (engine has none) |
| 6 | Cavalier → **Champion** | **Jousting** (+dmg per hex charged) | ❌ no movement/positions |
| 7 | Angel → **Archangel** | Flying, **+morale aura**, **resurrects** ally | flying ✅; morale ❌; resurrect ❌ |

### Rampart — *defensive/economical; magic-resistant, spell-immune dragons*
| T | Base → Upgrade | Signature | Engine |
|---|---|---|---|
| 1 | Centaur → Centaur Captain | — | ✅ vanilla stat-stick |
| 2 | Dwarf → Battle Dwarf | Magic resistance | ❌ no resist roll |
| 3 | Wood Elf → Grand Elf | Shoots twice | ⚠️ shooter ✅, double-shot ❌ |
| 4 | Pegasus → Silver Pegasus | Flying; enemy spell-cost aura | flying ✅; aura ❌ |
| 5 | Dendroid Guard → Dendroid Soldier | Binds (no-move/no-retal) | ❌ no bind |
| 6 | Unicorn → War Unicorn | Blind-on-hit; resist aura | ❌ |
| 7 | Green → **Gold Dragon** | Flying; immune spells L1–4 | flying ✅; immunity ❌ |

### Tower — *magic-centric, ranged-heavy, spell-tanky*
| T | Base → Upgrade | Signature | Engine |
|---|---|---|---|
| 1 | Gremlin → Master Gremlin | Master = shooter | shooter ✅ |
| 2 | Stone → Obsidian Gargoyle | Immune to mind spells | ❌ |
| 3 | Stone → Iron Golem | Magic-damage reduction | ❌ |
| 4 | Mage → Arch Mage | Shooter, no melee penalty | shooter ✅ |
| 5 | Genie → **Master Genie** | Flying; **casts random buff** on ally | flying ✅; cast ❌ (caster) |
| 6 | Naga → **Naga Queen** | **No enemy retaliation** | ✅ (substring "retaliation"… see note) |
| 7 | Giant → **Titan** | Shooter; immune mind spells | shooter ✅; immunity ❌ |

### Inferno — *aggressive swarm + summoning; luck suppression*
| T | Base → Upgrade | Signature | Engine |
|---|---|---|---|
| 1 | Imp → Familiar | Redirects enemy spell mana | ❌ |
| 2 | Gog → Magog | Shooter; **fireball splash** | shooter ✅; splash ❌ |
| 3 | Hell Hound → **Cerberus** | **No-retal**; 3-hex attack | no-retal ✅; multi-hex ❌ |
| 4 | Demon → Horned Demon | — | ✅ vanilla |
| 5 | Pit Fiend → **Pit Lord** | **Raises Demons** from dead | ❌ no summon |
| 6 | Efreeti → Efreet Sultan | Flying; fire immunity; fire shield | flying ✅; rest ❌ |
| 7 | Devil → **Arch Devil** | **No-retal**; teleport; −enemy luck | no-retal ✅; luck/teleport ❌ |

### Necropolis — *(shipped) attrition + necromancy snowball* — see `BALANCE_PROPOSALS.md` for the deep dive
| T | Base → Upgrade | Signature | Engine |
|---|---|---|---|
| 1 | Skeleton → Skeleton Warrior | Undead | ✅ (necromancy fuel) |
| 2 | Walking Dead → Zombie | **Disease** | ✅ (BATCH D.4) |
| 3 | Wight → Wraith | Regen; **drains mana** | ✅ regen, ✅ mana-drain (BATCH D.2) |
| 4 | Vampire → Vampire Lord | **Life drain**; no-retal | ✅ both |
| 5 | Lich → Power Lich | Shooter; death cloud | shooter ✅; cloud ❌ |
| 6 | Black → Dread Knight | **Death blow**; curse | ✅ both (BATCH D.1/D.5) |
| 7 | Bone → Ghost Dragon | Flying; **aging**; −morale | flying ✅, aging ✅; morale ❌ |

### Dungeon — *glass-cannon offense + petrify/paralyze + spell immunity*
| T | Base → Upgrade | Signature | Engine |
|---|---|---|---|
| 1 | Troglodyte → Infernal Trog. | Immune to blind | ❌ (would partly counter our best spell) |
| 2 | Harpy → **Harpy Hag** | Flying; strike-and-return, **no-retal** | flying ✅, no-retal ✅ |
| 3 | Beholder → Evil Eye | Shooter | shooter ✅ |
| 4 | Medusa → **Medusa Queen** | Shooter; **petrify** | shooter ✅; petrify ❌ |
| 5 | Minotaur → Minotaur King | +morale; fearless | ❌ |
| 6 | Manticore → **Scorpicore** | Flying; **paralyze** | flying ✅; paralyze ❌ |
| 7 | Red → **Black Dragon** | Flying; **immune ALL spells** | flying ✅; immunity ❌ |

### Stronghold — *pure cheap aggression, weak magic, raw might*
| T | Base → Upgrade | Signature | Engine |
|---|---|---|---|
| 1 | Goblin → Hobgoblin | — | ✅ vanilla |
| 2 | Wolf Rider → **Wolf Raider** | **Attacks twice** | ❌ double-strike |
| 3 | Orc → Orc Chief | Shooter | shooter ✅ |
| 4 | Ogre → **Ogre Magi** | **Casts Bloodlust** on ally | ❌ caster |
| 5 | Roc → **Thunderbird** | Flying; **lightning-strike** chance | flying ✅; bonus-dmg proc ❌ |
| 6 | Cyclops → Cyclops King | Shooter; **attacks walls** | shooter ✅; siege ❌ (no walls) |
| 7 | Behemoth → **Ancient Behemoth** | **−80% enemy defense** | ❌ no def-shred (huge if added) |

### Fortress — *tanky/disruptive; petrify, death-stare, all-around hydra*
| T | Base → Upgrade | Signature | Engine |
|---|---|---|---|
| 1 | Gnoll → Gnoll Marauder | — | ✅ vanilla |
| 2 | Lizardman → Lizard Warrior | Shooter | shooter ✅ |
| 3 | Serpent Fly → Dragon Fly | Flying; casts Weakness/Dispel | flying ✅; cast ❌ |
| 4 | Basilisk → Greater Basilisk | **Petrify** | ❌ |
| 5 | Gorgon → **Mighty Gorgon** | **Death stare** (instant-kill) | ❌ |
| 6 | Wyvern → Wyvern Monarch | Flying; **poison** | flying ✅; poison ❌ (DoT, no status layer) |
| 7 | Hydra → **Chaos Hydra** | **All-adjacent attack**; no-retal | no-retal ✅; multi-hex ❌ |

### Conflux — *fast spell-immune elementals; rebirth phoenix*
| T | Base → Upgrade | Signature | Engine |
|---|---|---|---|
| 1 | Pixie → Sprite | Flying; no-retal | flying ✅, no-retal ✅ |
| 2 | Air → Storm Elemental | Shooter; air-immunity | shooter ✅; immunity ❌ |
| 3 | Water → Ice Elemental | Shooter; ice-immunity | shooter ✅; immunity ❌ |
| 4 | Fire → Energy Elemental | Flying; fire-immunity | flying ✅; immunity ❌ |
| 5 | Earth → Magma Elemental | Immune mind/earth | ❌ |
| 6 | Psychic → Magic Elemental | Immune all spells; multi-hex | ❌ |
| 7 | Firebird → **Phoenix** | Fastest; fire-immune; **rebirth** | speed ✅(inert); rebirth ❌ |

**Note on substring luck (`hasAbility`).** Because detection is a substring match,
the *exact ability strings in the data corpus* decide whether "No enemy
retaliation" creatures (Naga Queen, Cerberus, Arch Devil, Sprite, Chaos Hydra)
fire ✅ — they will, **iff** their string literally contains `no enemy
retaliation` / `retaliation`. Conversely a creature tagged "Unlimited
retaliation" (Royal Griffin) contains the substring `retaliation` too — so a
naive import could **accidentally** flag the Royal Griffin as `no enemy
retaliation` and make it *wrongly* skip retaliation. **Flagged as a content-data
trap** (see §4 free-wins caveat).

**Cross-faction inert tally (signature abilities NOT mechanized):** morale auras
(Angel/Archangel, Minotaur, Ghost Dragon, Wayfarer-type), luck (Arch Devil),
double-strike (Crusader, Wolf Raider, Marksman/Grand Elf double-*shot*),
petrify/paralyze/death-stare (Medusa, Scorpicore, Basilisk, Gorgon), creature
spellcasting (Master Genie, Ogre Magi, Dragon Fly, Pit Lord summon), real
multi-hex/AoE (Cerberus, Hydra, Magog splash, Cyclops walls), spell-immunity
(every Dragon, elementals, Titan/Gargoyle mind-immunity), jousting/positions
(Champion), bonus-dmg procs (Thunderbird), def-shred (Behemoth). **~60% of all
upgraded-tier signatures are inert in the current engine** — concentrated, as
designed, in the subsystems §0.5 lists as missing.

---

## 2. NEW-CONTENT S–F RANKING — naive power if dropped in as-is

S = dominant / auto-include · A = strong · B = solid · C = situational · D = weak ·
**F = INERT (no-op)**. Focus: **all Castle + Stronghold creatures**, the **expanded
spell pool**, the **expanded artifact pool**. Rationale is *current-engine* power,
not HoMM3 power.

### 2a. CASTLE creatures (the "good" faction we'd add)

| Creature | Naive tier | Why (current engine) | Inert ability? |
|---|---|---|---|
| **Archer / Marksman** | **A** | Shooter ✅ (any-rank, no-retal). Highest-value profile in the engine. **Marksman's double-shot is INERT** → it's a Grand-Elf-clone shooter, still A on shooter alone. | double-shot ❌ |
| **Monk / Zealot** | **A** | Shooter ✅. Zealot's "no melee penalty" is a **no-op** (engine has no melee penalty for shooters anyway) → free upside lost but shooter carries it to A. | melee-penalty moot |
| **Angel / Archangel** | **B** | Big stat-stick + flying ✅ reaches back rank. But its two headline abilities — **+morale aura** and **resurrection** — are both **INERT**. So the marquee T7 is "just a flying brick." Massively under-delivers vs HoMM3. | morale ❌, resurrect ❌ |
| **Griffin / Royal Griffin** | **C** | Flying ✅. **Unlimited retaliation is INERT** (retaliation is hard-capped once/round) — its entire identity. A mid flyer with no special. | unlimited-retal ❌ |
| **Cavalier / Champion** | **C** | Decent melee stat-stick, but **jousting (+dmg per hex) is INERT** (no positions/movement). Pure vanilla bruiser. | jousting ❌ |
| **Swordsman / Crusader** | **C** | Solid front-line stats, but **"attacks twice" is INERT** (no double-strike model) → it deals one hit like any melee. Worst delta vs its real power. | double-strike ❌ |
| **Pikeman / Halberdier** | **D** | Vanilla T1 spearmen; "bonus vs cavalry" ❌ (no creature-typing). Fodder. | cav-bonus ❌ |

**Castle headline finding:** Castle's identity is **double-attacks (Marksman,
Crusader), unlimited retaliation (Royal Griffin), morale & resurrection
(Archangel), jousting (Champion)** — **five of seven tiers' signatures are
INERT.** Castle imported as-is is a faction of plain stat-sticks carried entirely
by its two **shooters** (Marksman, Zealot) and the **flying** brick Archangel.
This is the single biggest "imports broken" finding for creatures.

### 2b. STRONGHOLD creatures (the "neutral" faction we'd add)

| Creature | Naive tier | Why (current engine) | Inert ability? |
|---|---|---|---|
| **Orc / Orc Chief** | **A** | Shooter ✅. High base damage. Best Stronghold import — shooter profile is king. | — (none to lose) |
| **Cyclops / Cyclops King** | **A** | Shooter ✅ with very high damage. **"Attacks walls"** ❌ but irrelevant (no sieges) → loses nothing it'd use; stays A on raw shooter damage. | siege moot |
| **Behemoth / Ancient Behemoth** | **B→would-be-S** | Huge HP + attack melee brick (B as a vanilla stat-stick). **−80% enemy defense is INERT** — if mechanized it'd be **S** (defense-shred feeds the A/D multiplier, the strongest lever). Biggest *upside-if-activated* in the set. | def-shred ❌ |
| **Roc / Thunderbird** | **C** | Flying ✅ brick. **Lightning-strike proc is INERT** → no bonus damage. Mid flyer. | lightning ❌ |
| **Ogre / Ogre Magi** | **D** | Melee stat-stick. **Ogre Magi's "casts Bloodlust" is INERT** (creature casters not modeled) → it's a plain Ogre with a better number. | caster ❌ |
| **Wolf Rider / Wolf Raider** | **C** | Fast melee. **"Attacks twice" is INERT** → single hit. Speed ✅(but inert). Vanilla. | double-strike ❌ |
| **Goblin / Hobgoblin** | **D** | Vanilla T1 fodder; no ability either form. Cheap bodies. | — |

**Stronghold headline finding:** Stronghold survives the import **better than
Castle** — its best units (Orc Chief, Cyclops King) are **shooters whose
signature is irrelevant** (walls), so they keep full power, and its bricks
(Behemoth) are fine as stat-sticks. The one tragedy is the **Ancient Behemoth's
−80% defense**, which would be **S-tier** if mechanized (it directly inflates the
A/D damage multiplier army-wide-equivalent on its own attacks). **Most-broken-if-
activated new creature = Ancient Behemoth.**

### 2c. EXPANDED SPELL POOL — the new spells a ~3× expansion adds

Grouped by engine fate. (The shipped 27 are ranked in `BALANCE_PROPOSALS.md §1a`;
here are the *new* ones an expansion to ~80 spells would pull from base HoMM3.)

| New spell(s) — grouped | School/Lvl | Naive tier | Why | Inert? |
|---|---|---|---|---|
| **Frost Ring, Ice Bolt, Death Ripple-likes** (more single-target nukes) | Water/Earth 2–3 | **A** | `damage` works perfectly; scale by level table. Reliable. | — |
| **Town Portal, Dimension Door, Fly, Water Walk, View Earth/Air, Visions, Scuttle Boat** (adventure-map spells) | various | **F** | No overworld movement / fog / map interaction exists. Parse to nothing usable in combat. **Whole adventure-spell class is INERT.** | **INERT (no map layer)** |
| **Sacrifice** (Earth 5, kill own stack → mega-resurrect another) | Earth 5 | **F→C** | No multi-stack-cost mechanic; naive `heal` import drops the "sacrifice a stack" cost → either inert or an unbalanced free big heal. | **needs cost mechanic** |
| **Berserk** (force enemy to attack its allies) | Fire 4 | **F** | No "control/forced-attack" mechanic; resolves to nothing or a mis-routed debuff. | **INERT** |
| **Hypnotize / Blind-likes / Paralyze** (control) | various | **A (if routed to `disable`) / F** | If tagged `disable` they inherit Blind's (still strong, now expires per LIGHT §8) damage-zero. If tagged anything else → inert. **Whichever route, none get true "take control."** | control ❌ |
| **Counterstrike** (grant extra retaliation), **Air Shield, Protection from <school>, Anti-Magic** | various | **F** | Retaliation cap, no damage-typing, no spell-immunity → all parse to inert or a generic +defense at best. | **INERT** |
| **Bloodlust** (+attack melee), **Frenzy** (def→atk), **Mirth/Sorrow** (morale), **Fortune/Misfortune** (luck) | various 1–3 | **B / F** | Bloodlust/Frenzy → `buff,attack` = a real (strong) +attack buff ✅. **Mirth/Sorrow/Fortune/Misfortune are INERT** (no morale/luck). | morale/luck ❌ |
| **Summon Elementals, Clone** (summon/duplicate) | Water/Earth 3–4 | **F** | No summon/clone mechanic — can't create a stack mid-fight. | **INERT** |
| **Cure-likes, Antimagic-as-reset, Remove Obstacle** | Water 1–2 | **C** | Best case re-uses the `reset` kind (LIGHT §14-3). Otherwise filler. | — |
| **Earthquake** (siege only) | Earth | **F** | Damages walls; no walls. | **INERT** |
| **Magic Mirror** (reflect spells) | Air | **F** | No spell-targeting-reflection mechanic. | **INERT** |
| **Slayer** (+dmg vs Dragons/etc) | Air | **F** | No creature-typing. | **INERT** |

**Spell headline finding:** the new-spell class **bifurcates hard**: more **direct-
damage and +attack-buff** spells are **A/B and work for free**; but the entire
**adventure/utility/control/summon/morale-luck/immunity** half of HoMM3's spell
book (Town Portal, Berserk, Hypnotize, Summon Elementals, Mirth, Fortune,
Counterstrike, Slayer, Earthquake, Magic Mirror) is **INERT** because each needs
a subsystem we don't have. **Most-broken new spell to watch: any nuke/`disable`
import** (Blind already proved a `disable` is S-class even after the LIGHT expiry
nerf — a second `disable`-routed spell like a control spell would be similarly
strong). **Most-inert: the adventure-map spells (a whole class of no-ops).**

### 2d. EXPANDED ARTIFACT POOL — new artifacts a ~3× expansion adds

Grouped by what `parseBonuses` does with them (§0.9). The shipped 17 are in
`BALANCE_PROPOSALS.md §1b`; these are the *new* base-HoMM3 artifacts.

| New artifact category — grouped | Naive tier | Why (parse fate) | Inert? |
|---|---|---|---|
| **Flat +primary stat sticks** (Blackshard/Greater Gnoll's Flail/Ogre's Club = +Atk; Breastplate/Rib Cage = +Def; Tomes/Orbs of magic = +Power/+Knowledge; "+N to all" cloaks/tabards) | **S–A** | `+N <primary>` parses cleanly → **flat army-wide A/D / spell power / mana**. **These are the best items in the game** (A/D compounds with the multiplier; +mana = more casts). Higher +N = higher tier. **+Attack ≥ +Defense ≥ +Power ≥ +Knowledge** in value. | — |
| **Combination relics** (Angelic Alliance, Cloak of the Undead King-likes, Power of the Dragon Father, Armor of Wonder set bonuses) | **S** | Whatever `+N`/`+N all`/necromancy text they carry parses; the **set-bonus / immunity / spellcasting halves are INERT**, but the raw stats are huge. | set-bonus ❌ |
| **+Spell-points / mana items** (Spellbinder's Hat, Orb of Driving Rain-type "spell points") | **A** | `spell points` → `manaMax` ✅ → more casts. Strong, esp. with nukes. | — |
| **+Morale artifacts** (Badge of Courage, Crest of Valor, Glyph of Gallantry, Cards of Prophecy if morale-tagged) | **F** | "+N Morale" → `none`. **Whole +morale artifact class INERT.** | **INERT** |
| **+Luck artifacts** (Hourglass of the Evil Hour, Ladybird of Luck, Clover, Lucky shamrock) | **F** | "+N Luck" → `none`. **Whole +luck artifact class INERT.** | **INERT** |
| **Movement / logistics / scouting** (Boots of Speed/Levitation, Equestrian's Gloves, Speculum-likes, Spyglass) | **F** | No overworld move / fog. → `none`. **Whole adventure-utility class INERT.** | **INERT** |
| **Spell-school boosters** (Orb of Tempestuous Fire = +Fire, Orb of the Firmament = +Air, Recanter's Cloak = caps enemy spell level, Orb of Inhibition, sphere-of-permanence) | **F** | No per-school multiplier, no enemy-spell-cap hook. → `none`. **Whole school-booster class INERT.** | **INERT** |
| **Immunity / protection items** (Garniture of Interference = magic resist, Pendant of <X> = immunity to a spell, Sea Captain's Hat, Pendant of Total Recall) | **F** | No resist/immunity layer (matches the shipped Pendant of Death being inert). → `none`. **Whole protection class INERT.** | **INERT** |
| **"Casts <Spell> at combat start" / "allows casting <Spell>" relics** (Armageddon's Blade-likes, Armor of the Damned-likes, Sandals of the Saint, Recanter's, Cornucopia) | **A–S** | **NOW LIVE** via §19 (`grantSpell`/`castOnStart`) — if their prose matches the `"casting X"` / `"Casts A,B,C on … combat"` patterns. A relic that opens combat by hitting every enemy with Curse/Weakness is **strong**; one that grants a free L5 nuke spell is **S**. | ⚠️ pattern-match dependent |
| **Spell-duration items** (Cape of Conjuring-likes, Ring of Infinite Gems = +duration) | **F** | No duration layer. → `none`. | **INERT** |
| **War machines / ballista / first-aid tent artifacts** | **F** | No war-machine subsystem. → `none`. | **INERT** |

**Artifact headline finding:** the import is **brutally bimodal**. **Flat
stat-stick artifacts are S–A and dominate** (the most-broken new items are simply
the **biggest "+N to all primary" relics** — they shove the whole army up the A/D
curve *and* boost spells *and* mana, all at once). Everything thematic —
**morale, luck, movement, scouting, spell-school boosters, immunity/protection,
duration, war machines** — is a **flat no-op**. Expect **well over half of any
imported artifact set to be INERT**, exactly mirroring the shipped corpus (8/17
inert). The **only** thematic artifacts that survive are the **§19
spell-casting/granting relics**, and only if their `bonuses` prose matches the
parser's two patterns.

---

## 3. 3-AND-3 BRAINSTORM per new element

For each grouped element: **3 HoMM3-mechanics** proposals (add a subsystem so it
gets its authentic effect) + **3 fit-existing** proposals (re-express in today's
kinds: `damage / heal / buff / debuff / rollmode / reset / disable` + the ability
flags + `count / mana`). **Grouped aggressively** — each group's heading says what
it covers.

### GROUP A — "Double-attack / double-shot" creatures
*(covers Marksman & Grand Elf double-shot, Crusader, Wolf Raider, anything "attacks twice")*
- **HoMM3-1:** Add an `attacksPerAction: number` field read in `resolveAttack`; loop the strike N times (shooters skip retaliation each loop; melee provokes retaliation only on the first per the real rule).
- **HoMM3-2:** Add a generic **`extraStrikes` ability flag** that, on the MAIN hit only, re-runs `computeDamage` once more before applying (mirrors the existing `death blow` ×2 hook — literally the same insertion point).
- **HoMM3-3:** Model it as **initiative-style "acts again"**: after a double-attacker resolves, re-queue it once this round (needs the turn-queue from the HEAVY initiative work).
- **fit-1:** Give the unit the **`death blow` ability with `CHANCE = 1.0`** → guaranteed ×2 main-hit damage. Zero new code (the hook exists); reads as "attacks twice" in net damage. **Implementation-ready.**
- **fit-2:** Bake the second hit into stats: **double `damageMin/damageMax`** at adapt time. Crude but exactly doubles output; loses the "retaliation only once" nuance (which is already free for the attacker).
- **fit-3:** Bump `count`-equivalent: model the extra strike as **+attack** (A/D multiplier proxy). Cheapest, themeless, undershoots vs low-defense targets.

### GROUP B — "Unlimited / extra retaliation" creatures
*(covers Royal Griffin)*
- **HoMM3-1:** Replace the boolean `hasRetaliated` with a **`retaliationsLeft: number`** per stack (default 1; Griffin = ∞/2), decremented per counter, reset at round start.
- **HoMM3-2:** Add a **`retaliateCount` ability field** the round-reset reads to set `retaliationsLeft`.
- **HoMM3-3:** Pair with the initiative subsystem so retaliation order is meaningful (HEAVY).
- **fit-1:** Give the Griffin **high `defense` + the existing once/round retaliation** and call it done — accept that "unlimited" collapses to "once" (its current C-tier fate). Honest, zero-cost.
- **fit-2:** Re-skin as **+attack** so its *offense* compensates for the lost defensive identity.
- **fit-3:** Flag it **`no enemy retaliation`** on its own attack as a (different but real) retaliation-themed perk, so the keyword at least *does* something.
- **⚠️ TRAP:** do NOT let its "retaliation" ability string get substring-matched as `no enemy retaliation` (see §1 note / §4).

### GROUP C — "Creature casts a spell" (Master Genie, Ogre Magi, Dragon Fly, Pit Lord summon)
- **HoMM3-1:** Add a **`castsSpell: {spellId, target}` ability**; on the unit's turn it calls the existing `applySpellEffectToStack` (the §19 shared core) instead of attacking — true creature casting, reusing the spell engine.
- **HoMM3-2:** Add an **on-turn-start trigger table** (like regeneration's hook) that fires the creature's spell each round (Ogre Magi → Bloodlust on a random ally).
- **HoMM3-3:** For Pit Lord's **summon Demons** / Genie's random buff, lean on the (HEAVY) summon and status subsystems.
- **fit-1:** Convert the cast into a **passive aura baked into stats**: Ogre Magi → its allies aren't reachable, so instead give the **Ogre Magi itself +attack** (the Bloodlust it would cast on a friend, applied to self). Themeless but live.
- **fit-2:** Give the caster the matching **on-hit ability flag**: Dragon Fly "casts Weakness" → reuse the **`curse` on-hit** (min-roll) or a new `weakens` flag mirroring `disease`. **Implementation-ready** (the on-hit debuff machinery exists).
- **fit-3:** Make the "buffer" creatures simply **better stat-sticks** (the buff value folded into their own line) and drop the cast — accept the D-tier fate.

### GROUP D — "Petrify / Paralyze / Death-stare / Blind-on-hit" control-on-hit
*(covers Medusa, Scorpicore, Basilisk, Mighty Gorgon, War Unicorn)*
- **HoMM3-1:** Add a **`skipTurn` status** (the MEDIUM duration layer): petrify/paralyze = target loses its next action(s); breaks on being attacked (like real petrify).
- **HoMM3-2:** Death-stare = a **chance-based instant partial-kill** (`rng.next() < p` → remove `floor(count·q)` creatures); a new resolve-time hook beside `death blow`.
- **HoMM3-3:** Blind-on-hit = reuse the **Blind `disable`** as an on-hit rider with the LIGHT §8 expiry.
- **fit-1:** Route them all to the existing **`curse` on-hit flag** (min-roll once) — a "softer petrify" that neuters the target's damage. **Implementation-ready** (substring `curse` already fires).
- **fit-2:** Petrify/paralyze → on-hit **`disease`-style −attack/−defense** (the existing once-per-defender debuff), re-themed.
- **fit-3:** Death-stare → bake a **flat damage premium** (high `damageMax`) so it "kills more" without an instant-kill mechanic.

### GROUP E — "Real AoE / multi-hex" attacks
*(covers Cerberus 3-hex, Chaos Hydra all-adjacent, Magog/Lich splash, Cyclops walls)*
- **HoMM3-1:** Add the **position/adjacency index** (rank+slot) so an attack hits the target plus neighbors (the HEAVY positions work; also turns on Fireball/Inferno geometry).
- **HoMM3-2:** Add a **`hitsNStacks: number` ability** that, on attack, applies damage to the N highest-threat enemy stacks (geometry-free, like the proposed `multiTarget` spell).
- **HoMM3-3:** Lich/Magog **death-cloud splash** = on-shot, also nuke adjacent (needs positions).
- **fit-1:** Give multi-hex attackers **+damage** (their splash folded into a bigger single hit) — keeps them strong without geometry.
- **fit-2:** Make Hydra/Cerberus **`no enemy retaliation`** (the wall-of-bodies feel: they hit many, fear no counter) — Hydra/Cerberus *already* have no-retal in canon, so this is faithful and **free**.
- **fit-3:** Cyclops "attacks walls" → **no-op accepted** (no sieges); keep it a shooter. Already its A-tier fate.

### GROUP F — "Morale" (auras + spells + artifacts)
*(covers Angel/Archangel aura, Minotaur, Ghost Dragon −morale, Mirth/Sorrow spells, all +morale artifacts, Ring of the Wayfarer)*
- **HoMM3-1:** Add the **morale subsystem**: a stack-level morale score (from heroes/artifacts/auras/spells); high morale → chance for a **bonus action**, low → chance to **skip**. Activates the whole class at once.
- **HoMM3-2:** Morale auras = a battle-open pass that sums each side's morale-granting creatures into a side-wide score (no per-turn rolls yet → deterministic).
- **HoMM3-3:** Tie morale to the (HEAVY) initiative queue so a "good morale" stack re-acts.
- **fit-1:** Re-express +morale as **+attack** (good morale ≈ harder hitting) and −morale aura as an enemy **−attack debuff** applied at combat open (reuse `castOnStart`-style). Themeless but makes Archangel/Minotaur/Wayfarer **live**. **Implementation-ready-ish.**
- **fit-2:** +morale artifact → **small `+N to all primary`** equivalent in `parseBonuses` (one new text rule) so the item isn't a no-op.
- **fit-3:** Morale spells (Mirth/Sorrow) → route to **`buffAll` (+all stats) / debuff** — folds into the existing Prayer machinery.

### GROUP G — "Luck" (spells + artifacts)
*(covers Fortune/Misfortune spells, all +luck artifacts, Arch Devil −luck)*
- **HoMM3-1:** Add a **luck subsystem**: luck score → chance to roll **`damageMax` (lucky)** / **`damageMin` (unlucky)** on a hit. (Cheap because the roll-mode plumbing from Bless/Curse already exists — luck is just a *chance* of it.)
- **HoMM3-2:** Tie luck to the same status layer as morale (one shared "fortune" subsystem covers both F and G).
- **HoMM3-3:** Arch Devil's −enemy-luck aura → applies an "unlucky" flag at combat open.
- **fit-1:** +luck → reuse **Bless's `rollmode`** permanently on the stack (always max). Overshoots (it's *guaranteed* not *chance*), but live and strong. **Implementation-ready.**
- **fit-2:** +luck artifact → parse to **+attack** (one `parseBonuses` rule), matching the morale fit so neither item class is inert.
- **fit-3:** −luck spell (Misfortune) → reuse **Curse `rollmode`** (always min) on the enemy. (Note: Misfortune has **no data record** today — §19 — so adding the record is step zero.)

### GROUP H — "Spell-school immunity / resistance / typing"
*(covers all Dragons, elementals, Gargoyle/Titan mind-immunity, Battle Dwarf/Garniture magic-resist, Protection/Anti-Magic spells, Recanter's/Orb-of-Inhibition, Slayer)*
- **HoMM3-1:** Add a **spell-school/type layer**: creatures carry `immuneSchools[]` / `resistPct`; `applySpell` checks before landing. Activates Dragons, elementals, resist items, Protection spells, Armageddon's-Blade immunity — the largest single dead class.
- **HoMM3-2:** Add a **creature-type tag** (Dragon/Undead/Living/Elemental) so Slayer-type +dmg and Death Ripple/Armageddon undead-skip generalize.
- **HoMM3-3:** Enemy-spell-level cap (Recanter's) needs an enemy-caster + a per-cast gate (also requires §4 open-Q: do enemies cast?).
- **fit-1:** Magic-resist creatures → **high `defense`** (a blunt all-source mitigation; doesn't distinguish spells from attacks). Themeless, live.
- **fit-2:** "Immune to spell X" creature → **no engine change**; accept inert (the spell still lands). Document, don't fake.
- **fit-3:** Resist *artifact* → **`+N defense`** via a `parseBonuses` rule, so the item does *something* defensive.

### GROUP I — "Adventure-map" spells & artifacts
*(covers Town Portal, Dimension Door, Fly, View Earth, Visions, Scuttle Boat; Boots of Speed, Spyglass, Speculum-likes, Sea Captain's Hat, Equestrian's Gloves)*
- **HoMM3-1:** Build the **overworld layer** (movement points, fog, scouting). Enormous — out of scope; the run is node-graph, not a hex overworld.
- **HoMM3-2:** Re-purpose to **run-map effects** (e.g. Town Portal → skip to a chosen node; Visions → reveal a node's encounter): fits the node-graph, not HoMM3-authentic but useful.
- **HoMM3-3:** N/A — most have no combat analog.
- **fit-1:** **Cut them from the pool** (like `CUT_SPELLS` for Shield) so they never offer as traps. **Implementation-ready.**
- **fit-2:** Convert each to a tiny **combat or economy perk** (Boots of Speed → `speedAll` which is parsed; Spyglass → +gold at node) so the *item* isn't dead even if the theme is gone.
- **fit-3:** Leave inert + **flag in the Codex** as "adventure (no effect in Spire)". Honest.

### GROUP J — "Summon / Clone / Sacrifice / Raise-on-the-field" spells & Pit Lord
- **HoMM3-1:** Add a **mid-battle stack-creation** mechanic (respects `ARMY_CAP`): Summon Elementals makes an elemental stack; Clone duplicates; Pit Lord raises Demons from your dead.
- **HoMM3-2:** Sacrifice = a **two-target spell** (consume ally stack → its pool feeds a resurrect on another), needs multi-target spell targeting.
- **HoMM3-3:** Tie raises to the **Necromancy ledger** so field-raises and post-battle raises share one accounting.
- **fit-1:** Clone/Summon → a big **`heal`** on an existing ally (reuse `applyHeal`'s count==0 rebuild branch — it can already resurrect a wiped stack up to cap). Approximates "more bodies." **Implementation-ready.**
- **fit-2:** Sacrifice → a **`heal` with a higher base** and accept the missing self-cost (or pre-subtract from the caster's weakest stack in `applySpell`).
- **fit-3:** Cut the ones with no fit (true Clone) from the pool.

### GROUP K — "Control" spells (Berserk, Hypnotize, Forgetfulness-likes)
- **HoMM3-1:** Add a **mind-control state**: a controlled enemy stack acts for your side for K rounds (needs the status layer + AI retargeting).
- **HoMM3-2:** Berserk = force-attack-nearest (needs positions + forced-target AI).
- **HoMM3-3:** Counterstrike (grant retaliation) → needs the `retaliationsLeft` field from Group B.
- **fit-1:** Route control spells to **`disable`** (Blind) — a hypnotized/berserked stack at least *does nothing* this turn (now expires, LIGHT §8). Strong, partial. **Implementation-ready.**
- **fit-2:** Berserk → an enemy **`debuff` (−attack)** ("confused, hits softly").
- **fit-3:** Skip-turn fit (the BALANCE_PROPOSALS Slow idea): set the enemy stack's `hasActed`-equivalent for one turn.

### GROUP L — Combination/set relics & big stat-stick artifacts
*(covers Angelic Alliance, Power of the Dragon Father, all "+N to all primary" and big single-stat items)*
- **HoMM3-1:** Add a **set-bonus subsystem** (owning the full set grants the combo's immunities/spellcasts) — mostly feeds Groups H/C/§19.
- **HoMM3-2:** Combo "casts X / immunity to Y" → §19 `castOnStart`/`grantSpell` + the immunity layer (Group H).
- **HoMM3-3:** N/A.
- **fit-1:** **Already S-tier — do nothing.** The `+N`/`+N all`/`spell points` parse delivers the dominant part; ship the set bonus as **inert flavor** for now. **Free win.**
- **fit-2:** Approximate the set bonus as **a bigger `+N to all`** baked into the relic's `bonuses` string (the AOTD §16-C precedent: prepend a stat).
- **fit-3:** Add the relic's spell via §19 `grantSpell` if its prose can be massaged to match `"casting <Spell>"`.

---

## 4. PRIORITIZED ACTIVATION LIST

Bucketed by cost. "Free" = works the instant the content is added, no engine
change. LIGHT = a tiny additive rule (reuse a kind/flag). MEDIUM = one bounded new
subsystem (status/duration **or** morale-luck). HEAVY = positions / initiative /
immunity.

### FREE wins (ship the content, it just works)
| New content | Why it's free |
|---|---|
| **Castle/Stronghold shooters** (Marksman, Zealot, Orc Chief, Cyclops King) | `shooter`/`ranged` already mechanized — the strongest profile, A-tier on arrival. |
| **Flyers** (Archangel, Roc/Thunderbird, Griffin) | `flying` reach-back is ON (§15). They reach the back rank for free (signature abilities still inert, but the *body* works). |
| **No-retaliation imports** (Naga Queen, Cerberus, Arch Devil, Sprite, Chaos Hydra) | `no enemy retaliation` mechanized — **iff** the data string contains the phrase. ✅ |
| **All "+N primary" / "+N to all" / "spell points" artifacts** | `parseBonuses` handles them → S–A stat-sticks, the best items. |
| **More direct-damage & +attack-buff spells** (nukes, Bloodlust, Frenzy) | `damage` / `buff,attack` route cleanly. |
| **§19 spell-casting/granting relics** | `castOnStart`/`grantSpell` already deliver, *if* prose matches the two patterns. |
| **CUT the dead classes** (adventure spells/artifacts, Berserk, Summon, +morale/+luck items) | Filtering them via the `CUT_SPELLS`/artifact-pool lever (BATCH §16-B) is "free" anti-trap hygiene. |

> **⚠️ FREE-WIN CAVEAT — the substring trap.** `hasAbility` is a substring match.
> Importing **Royal Griffin ("Unlimited retaliation")**, or any creature whose
> ability text contains `retaliation`/`shooter`/`flying`/`curse`/`disease`/`aging`
> as a substring, will **mis-fire** the mechanized branch (e.g. Royal Griffin
> wrongly skipping retaliation). **Audit new creatures' ability strings on import**
> — this is the cheapest bug to prevent and the easiest to ship by accident.

### LIGHT rules (tiny additive, high coverage) — *implement in this order*
1. **`extraStrikes` via `death blow` w/ chance 1.0** (Group A) → activates
   **Marksman, Crusader, Wolf Raider, Grand Elf** double-attacks. One ability flag
   reusing an existing hook. **Highest creature-coverage LIGHT win.**
2. **`parseBonuses` rules for +morale & +luck → +attack** (Groups F-fit, G-fit) →
   de-inerts an entire artifact class (and Ring of the Wayfarer) with one parser
   addition. **Highest artifact-coverage LIGHT win.**
3. **On-hit ability flags for control-on-hit creatures** (Group D-fit): route
   Medusa/Basilisk/Gorgon/Scorpicore/Unicorn to the existing **`curse`/`disease`**
   on-hit machinery. Activates ~5 creatures across Dungeon/Fortress.
4. **`hitsNStacks` / fold-splash-into-+damage** (Group E-fit) + give Hydra/Cerberus
   their canonical **`no enemy retaliation`** (free + faithful).
5. **Cut/repurpose adventure & summon spells** (Groups I/J/K-fit) → remove traps;
   route control spells to `disable`, summon/clone to `heal`-rebuild.
6. **Misfortune data record** (§19/§485 caveat) so AOTD's opener fully fires; then
   luck-spells can ride the Bless/Curse `rollmode` (Group G-fit).

### MEDIUM rules (one bounded subsystem)
- **Status/duration layer** → petrify/paralyze/skip-turn (Group D-HoMM3), control
  spells (Group K), Blind "breaks on hit", timed non-stacking buffs (already
  scoped in BALANCE_PROPOSALS §3 MEDIUM). Activates Castle/Dungeon/Fortress
  control identities.
- **Morale + Luck subsystem** (Groups F/G-HoMM3) → **Archangel/Angel aura**,
  Minotaur, Ghost Dragon, **all morale & luck spells/artifacts**, Arch Devil. One
  shared "fortune" layer covers both. Biggest single de-inert for the **good
  faction (Castle)** — its T7 marquee depends on it.
- **Creature-casting hook** (Group C-HoMM3) → Master Genie, Ogre Magi, Dragon Fly,
  Pit Lord (reuses the §19 shared cast core).
- **`retaliationsLeft` counter** (Group B) → Royal Griffin + Counterstrike spell.

### HEAVY rules (multiple subsystems — "actual HoMM3")
- **Positions/adjacency** → real AoE (Group E, Fireball/Inferno geometry),
  **jousting** (Champion), Cerberus/Hydra true multi-hex, Magog/Lich splash.
- **Initiative/turn-order + extra actions** → makes **speed** matter (every
  Stronghold/Conflux fast unit, Haste/Slow, double-attack-as-re-queue, morale
  bonus-actions).
- **Spell-school immunity/typing** (Group H) → **every Dragon**, elementals,
  Titan/Gargoyle mind-immunity, resist items, Protection/Anti-Magic spells,
  Armageddon's-Blade immunity, Slayer, **Ancient Behemoth's −80% defense** (a
  defense-shred is the typing layer's cheapest, highest-impact resident — S-tier).

### Coverage logic (CSP framing)
Maximize *meaningful entities per unit of work*. **Order of marginal value:**
1. FREE content + the substring audit (zero cost, immediate S–A units & items).
2. LIGHT #1 (double-attack) and #2 (morale/luck→stat parse) — each lights up a
   whole grouped class with a one-flag / one-parse-rule change.
3. MEDIUM **morale/luck** (unblocks Castle's identity — the good faction we're
   shipping) and the **status layer** (unblocks Dungeon/Fortress control).
4. HEAVY **immunity** before positions/initiative — it resurrects the most dead
   entities (every dragon, every elemental, every resist item) and contains the
   single best creature upside in the set (**Ancient Behemoth def-shred → S**).

---

## 5. Executive summary (6 bullets)

- **Most-broken NEW creature (if its ability were activated): Ancient Behemoth
  (Stronghold).** Its −80% enemy defense feeds the A/D multiplier — the engine's
  strongest lever — and would be **S-tier**. Inert today; top HEAVY-immunity prize.
- **Most-inert NEW faction on import: Castle (the "good" town we're shipping).**
  **5 of 7 tiers' signatures are dead** (Marksman double-shot, Crusader
  double-strike, Royal Griffin unlimited-retal, Champion jousting, Archangel
  morale + resurrection). Castle arrives as plain stat-sticks carried only by its
  two **shooters** and one **flying** brick — it under-delivers more than any other
  faction. Stronghold survives far better (its best units are shooters whose
  siege gimmick is simply irrelevant).
- **Most-inert NEW classes overall:** an entire **adventure-map** spell/artifact
  class (Town Portal, Boots of Speed, scouting) and the **morale / luck /
  spell-school-immunity** classes are flat no-ops — expect **>50% of any imported
  artifact set INERT**, mirroring the shipped 8/17.
- **Top FREE wins:** Castle/Stronghold **shooters** (Marksman, Zealot, Orc Chief,
  Cyclops King = instant A-tier), all **flyers** reach the back rank, all
  **"+N primary / +N to all / spell-points" artifacts** are S–A, and §19
  **spell-casting relics** deliver — *plus* cutting the dead classes as anti-trap
  hygiene. **No engine change required.**
- **Highest-leverage LIGHT rules:** (1) reuse the `death blow` hook with chance 1.0
  as a generic **`extraStrikes`** flag → activates every double-attack/double-shot
  unit at once; (2) one **`parseBonuses` rule mapping +morale/+luck → +attack** →
  de-inerts a whole artifact class. Both are single-insertion-point changes.
- **One landmine to prevent for free:** `hasAbility` is a **substring match**, so
  importing a creature like the **Royal Griffin ("Unlimited retaliation")** can
  accidentally trigger the `no enemy retaliation` branch. **Audit new ability
  strings on import** — the cheapest bug to avoid.
