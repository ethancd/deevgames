# MECHANISMS_AUDIT.md — Might & Magic: Spire

> **A hard-nosed design audit.** *Is everything that's already in important, or is
> there simplifying & essentializing we could do?* Grounded in the **shipped**
> engine (orchestrator tip: `battle.ts`, `run.ts`, `adapter.ts`, `content.ts`,
> `map.ts`, `types.ts` + the app screens), cross-checked against `COMBAT.md`
> §1–§22, `BALANCE_PROPOSALS.md`, and `BREADTH_ANALYSIS.md`. Every "inert" call
> below was traced to the real code path, not guessed. The Explore pass confirmed
> COMBAT.md is a **faithful** inventory — every documented lever is live.
>
> **The lens (strategy-mindset):** essentialize. A mechanism earns its place only
> if removing it would hurt the *decisions* a player makes or the *identity* the
> game projects. If it does neither, it is surface area — cut it, merge it, or
> make it pull weight. The model is **HoMM3 with one hero, no town; your army of
> stacks is your life bar; you grow on a node map.** That sentence is the spec the
> audit holds everything against.

---

## 0. The verdict up front

**The game is OVER-BUILT in breadth and UNDER-BUILT in one keystone.**

The combat *core* (two-rank reach, A/D curve, kill/chip pool, hero-buffs-army,
retaliation, Necromancy, rubber-band scaling) is tight, load-bearing, and well
tuned. But a long tail of mechanics was mechanized "because the data string was
there," and several now **collide** (Shield/Stone Skin already cut; Curse-spell
vs Curse-on-hit vs Weakness all do the same thing) or are **near-inert** (speed,
jousting-as-flat-premium, Disease, mana-drain). The single highest-leverage move
is not to add content — it's to **add initiative**, the one small subsystem that
*retroactively* makes ~6 already-shipped speed mechanics matter.

Net: the spine is ~12 mechanisms. Everything past that must justify itself, and
about a third of it currently can't.

---

## 1. MECHANISM INVENTORY + DUAL RATING

**Axes.** *Gameplay cruciality* = does removing it hurt the decisions/depth?
*Thematic cruciality* = does it carry the "HoMM3-with-one-hero" identity? Each
High / Med / Low. **Verdict** ∈ KEEP · KEEP-BUT-FIX · SIMPLIFY · MERGE · CUT.

### 1a. Core combat spine

| Mechanism | Where | Gameplay | Thematic | Verdict | One-line rationale |
|---|---|---|---|---|---|
| **Two-rank reach (front/back)** | `legalTargets` | High | High | **KEEP** | The whole tactical layer; front wall vs back casters is the puzzle. |
| **Shooters (any-rank, no-retal)** | `isShooter` | High | High | **KEEP** | Strongest profile in the game; the reason back rank exists. |
| **Flyers (reach-back, melee)** | `isFlying` | High | High | **KEEP** | Half the Necropolis roster's identity; the answer to the front wall. |
| **A/D damage curve + hero-buffs-army** | `adMultiplier`, `effAttack/Defense` | High | High | **KEEP** | The hero's *entire* presence in combat; +attack is the best stat because of this. |
| **Kill/chip pool model** | `applyDamage` | High | High | **KEEP** | The "army is your life bar" math; HoMM3-faithful, elegant, pinned. |
| **Retaliation (once/round)** | `resolveAttack`, `hasRetaliated` | High | High | **KEEP** | The only auto-reaction; the cost of meleeing into a fat stack. |
| **Necromancy growth** | `applyNecromancy` | High | High | **KEEP** | The only no-gold compounding engine; the run's heartbeat. Best-tuned lever. |
| **Defend (+0.2 def, resets)** | `DEFEND_DEFENSE_FRACTION` | Med | Med | **KEEP** | Cheap real choice (eat a hit vs brace); HoMM3-standard. Fine as-is. |
| **Side-alternation turns** | `endPlayerTurn` | Med | Med | **KEEP-BUT-FIX** | Functional, but it's where *speed should bite and doesn't* — see initiative below. |
| **No-enemy-retaliation** | `resolveAttack` | Med | Med | **KEEP** | Real edge for fragile high-dmg melee (Vampires); reads cleanly. |

### 1b. The growth/map/economy frame

| Mechanism | Where | Gameplay | Thematic | Verdict | One-line rationale |
|---|---|---|---|---|---|
| **Encounter rubber-band scaling** | `armyValue`, budget mults | High | Med | **KEEP** | Self-correcting difficulty; the reason runs resolve instead of snowballing/stalling. |
| **`bossMaxDragons` cap** | `ENCOUNTER` | High | Low | **KEEP** | Load-bearing balance fix (4%→59% win rate). Ugly but essential; document, don't touch. |
| **Node types: combat/elite/boss** | `map.ts` | High | High | **KEEP** | The run's pacing skeleton; the climax structure. |
| **Node types: dwelling/altar/shrine/merchant/rest** | `map.ts`, `run.ts` | High | Med | **MERGE-candidate** | Four growth nodes + rest = the gold sink. *Real* choices, but see §2: altar/shrine overlap is thin. |
| **Economy (gold costs)** | `STARTING_GOLD`, `*_COST_*` | Med | Med | **KEEP** | The opportunity-cost layer that makes nodes choices, not handouts. |
| **Walk-trail / lock-out** | app + `clearedNodeIds` | Med | Low | **KEEP** | Path commitment = the only "build" decision on the map; cheap, works. |
| **Faction selection (3 playable)** | `startRun(heroId)`, `RunState.faction` | Med | High | **KEEP-BUT-FIX** | Big replay/identity value, BUT non-Necro factions lean on inert abilities (see §2). |

### 1c. Spells (the magic layer)

| Mechanism | Where | Gameplay | Thematic | Verdict | One-line rationale |
|---|---|---|---|---|---|
| **One spell/turn + mana (knowledge·10)** | `spellCastThisTurn`, `MANA_PER_KNOWLEDGE` | High | High | **KEEP** | The tempo constraint; the hero's per-turn decision. |
| **Power-scaling magnitude** | `spellMagnitude` | High | High | **KEEP** | Ties spell value to a build stat; greenfield but correct. |
| **Single-target nukes** (Magic Arrow → Implosion) | `DAMAGE_*_BY_LEVEL` | High | High | **KEEP** | The clean, working backbone of the spellbook. |
| **No-restack (`spellMarks`)** | `run.ts` | High | Med | **KEEP** | Closes the "stack Curse to delete enemy damage" exploit with no duration layer. Smart. |
| **Blind (disable + expiry)** | `blindedFrom` | High | Med | **KEEP-BUT-FIX** | Best disable in the game; expiry tamed it, but it's still the boss "off-switch." Watch in sim. |
| **Heals/Res (Cure/Animate/Resurrection)** | `applyHeal`, `startCount` cap | Med | High | **KEEP** | Army sustain; the boss-fight clutch. Good ladder. |
| **LIGHT roll-mode: Bless/Curse** | `rollmode` | Med | Med | **KEEP-BUT-FIX** | Correct identity now — but Curse-spell now overlaps Curse-on-hit + Weakness (see §2). |
| **LIGHT reset: Dispel/Cure** | `reset` kind | Med | Low | **KEEP** | Fixed a real correctness bug (Dispel cast on wrong side); zero-tracking; keep. |
| **LIGHT buffAll: Prayer** | `buffAll` | Low | Low | **KEEP-BUT-FIX** | Now hits all 3 stats — but one of those (speed) is inert, so it's really a +atk/+def buff with a dead third. |
| **LIGHT bothArmies: Death Ripple/Armageddon** | `bothArmies/skipUndead` | Med | High | **KEEP** | Death Ripple = the signature undead "safe nuke"; highest-flavor win shipped. Keep. |
| **LIGHT backRankOnly: Precision** | `backRankOnly` | Low | Low | **SIMPLIFY** | Niche gate; fine, but it's a +damage buff (weak vs +attack) — low payoff. |
| **LIGHT noShoot: Forgetfulness** | `noShoot`, `isShooter` | Med | Med | **KEEP** | Genuinely tactical — turns off an enemy shooter's whole profile. Underrated, real. |
| **AoE-faked nukes** (Fireball/Inferno/Meteor/Chain) | `adapter.ts` | Low | Low | **MERGE/CUT** | Pay AoE mana, hit one stack. Traps. Either re-route to all-enemies or cut from pool. |
| **Speed spells: Haste / Slow** | `buff/debuff speed` | Low | Low | **CUT-or-FIX** | Speed only sorts enemy actions → near-cosmetic. The poster children for "initiative or cut." |
| **Spellbook (learn/equip union)** | `baseSpellbook`, `recomputeHero` | Med | Med | **KEEP** | Clean plumbing; learned + granted dedup is correct and invisible to the app. |

### 1d. Equipment & relics

| Mechanism | Where | Gameplay | Thematic | Verdict | One-line rationale |
|---|---|---|---|---|---|
| **Paper-doll + `+N primary` stat-sticks** | `parseBonuses`, slots | High | High | **KEEP** | The best items in the game (A/D + mana + power); the loot loop's payoff. |
| **`grantSpell` relic plumbing** | `EquipmentEffect.grantSpell` | Med | High | **KEEP** | Makes a relic feel like HoMM3 (Armageddon's Blade grants Armageddon). Real, deduped. |
| **`castOnStart` relic plumbing** | `applyCastOnStart` | Med | High | **KEEP-BUT-FIX** | Armor of the Damned opens combat with Slow/Curse/Weakness — but Slow is inert, see §2. |
| **`necromancyBonus` (Cloak)** | `adaptEquipment` | High | High | **KEEP** | Buffs the one compounding lever; run-defining. |
| **`manaMax` (Sword of Judgement etc.)** | `parseBonuses` | High | Med | **KEEP** | "More casts" is a real axis; pairs with one-spell/turn. |
| **`hpPerCreature` / `speedAll` equip effects** | `equipmentCombatBonuses` | Low | Low | **KEEP-BUT-FIX** | hpPerCreature is real; speedAll feeds inert speed → half-dead until initiative. |

### 1e. Creature abilities (mechanized on-hit / passive)

| Mechanism | Where | Gameplay | Thematic | Verdict | One-line rationale |
|---|---|---|---|---|---|
| **Life drain (capped at startCount)** | `resolveAttack` | High | High | **KEEP** | Real sustain on a flyer; bounded; signature Vampire feel. |
| **Regeneration (top creature, turn start)** | `startPlayerTurn` | Med | Med | **KEEP** | Modest but real; cheap to keep. |
| **Death blow (20%→×2)** | `DEATH_BLOW_*` | Med | High | **KEEP** | The T6 burst identity; deterministic; rides extraStrikes naturally. |
| **Defense-shred (Behemoth)** | `DEFENSE_SHRED*` | High | Med | **KEEP** | Feeds the A/D multiplier — the strongest lever. Best "ability that matters." |
| **extraStrikes / double-attack** | `DOUBLE_ATTACK_PHRASES` | Med | Med | **KEEP** | Activates Marksman/Crusader/Wolf Raider for one flag; high coverage per cost. |
| **Two / Unlimited retaliation** | `retaliationBudget` | Med | Med | **KEEP-BUT-FIX** | Real on defense — but the budget machinery is heavy for two creatures; see §2. |
| **Aging (Ghost Dragon, ½ maxHp)** | `applyAging` | Low | Med | **KEEP-BUT-FIX** | Mechanized, but fires off main-hit only, once/defender — rarely swings a fight. Low payoff for its code. |
| **Disease (Zombie, −1/−1)** | `applyDisease` | Low | Low | **MERGE/CUT** | −1 atk/−1 def once is statistically invisible against the A/D curve. Near-inert as shipped. |
| **Curse on-hit (Knights, min-roll)** | `applyCurseOnHit` | Low | Med | **MERGE** | Duplicates the Curse *spell's* effect; three mechanisms (spell, on-hit, Weakness) one outcome. |
| **Drains enemy mana (Wraith, −2)** | `resolveAttack` → `manaDrain` | Low | Low | **CUT-or-FIX** | Only bites on enemy→player hits; −2 mana rarely changes a turn. Decorative. |
| **Jousting (flat +25%)** | `JOUSTING_BONUS` | Low | Low | **MERGE** | Reskinned to a flat premium with no positions → indistinguishable from "+damage stat." Fold into stats. |
| **Undead (gates Necromancy)** | `applyNecromancy` | High | High | **KEEP** | Battle-flavor, but *the* gate on the growth engine. Indirectly load-bearing. |

---

## 2. THE REDUNDANCY / DEAD-WEIGHT LIST

Specific calls. For each: the cheapest path to either earning its keep or removal.

### A. Speed — the marquee near-inert mechanism *(and the keystone opportunity)*
- **What's live:** `speed` only sorts the order enemies act in (`endPlayerTurn`).
  Every living stack acts exactly once per turn regardless. No initiative, no
  extra action, no strike-first.
- **What rides on it and is therefore also dead:** Haste, Slow, the speed third of
  Prayer (`buffAll`), Necklace of Swiftness (`speedAll`), the `speedAll` equip
  path, and the **Slow** half of Armor of the Damned's `castOnStart` opener.
  That's **~6 shipped mechanics whose payoff is "reorder the enemy list."**
- **Verdict:** This is the *one* place where **adding a small thing
  retroactively justifies a pile of existing inert mechanics.** Add a minimal
  **initiative** rule (act in speed order across *both* armies, and/or
  fastest-stack-acts-twice-on-a-gap) and Haste/Slow/Prayer-speed/Necklace/Slow-opener
  all light up at once. **This is the single highest-leverage investment in the
  game.** If you will *not* build it: **cut Haste and Slow from the pool**
  (`CUT_SPELLS`), drop the speed tag from Prayer, and accept Necklace as a dead
  slot — stop pretending speed is a lever.

### B. The "min-roll debuff" triad — Curse (spell) · Curse (on-hit) · Weakness
- **Collision:** Curse-the-spell now sets `damageMax = damageMin` (rollmode). Curse-
  *on-hit* (Knights) sets `damageMax = damageMin`. **Weakness** is a −attack debuff
  that, against the A/D curve, also just makes the enemy hit softer. Three
  mechanisms, one felt outcome ("enemy deals less").
- **Fix (cheap):** Keep **Curse-the-spell** (rollmode, deliberate cast) and the
  **Curse-on-hit** rider (it's free and reads as creature identity). **Cut or re-
  theme Weakness** — either drop it from the pool as a Curse-dup, or make it the
  *attack-shred* twin of Disrupting Ray's defense-shred so the two debuffs feed
  opposite sides of the A/D curve (a real distinction, near-zero code).

### C. Disease (−1/−1, once) — over-modeled for its payoff
- A once-per-defender −1 attack / −1 defense is **noise** against a curve that
  moves in 5%/2.5%-per-point steps with hero bonuses of +4 and shred of 4–8.
  It has a flag (`diseased?`), a function, and a log line for an effect you cannot
  feel.
- **Fix:** Either bump it to a meaningful **−3/−3** (so it actually nudges the
  curve and reads as "rotting") **or merge it into the Curse-on-hit rider** and
  delete the separate path. Don't keep a flagged subsystem for ±1.

### D. Jousting — a flat premium pretending to be a positional mechanic
- With no positions, "jousting" is `dmg * 1.25`. That is **literally a +damage
  stat** wearing a HoMM3 costume. It carries no decision (you can't charge from
  range) and no distinct feel.
- **Fix:** **Merge** — bake the +25% into the Cavalier/Champion's `damageMin/Max`
  at adapt time and delete `JOUSTING_BONUS`. Identical output, one fewer
  named lever, honest about what it is. (Revive only if positions ever ship.)

### E. Drains enemy mana (−2) — decorative
- Fires only on enemy→player hits (enemies have `NULL_HERO`, so player→enemy is
  inert), and −2 mana rarely costs you a cast. A whole `manaDrain` return-value
  path through `resolveAttack` → `run.ts` for a near-zero effect.
- **Fix:** Either raise it to a number that threatens a cast (e.g. −5/−6, so a
  knowledge-light hero feels mana pressure) **or cut it** to flavor and remove the
  return-value plumbing. Today it's plumbing without payoff.

### F. AoE-faked nukes (Fireball / Inferno / Meteor / Chain Lightning) — traps
- They charge AoE mana and hit **one** stack. A rational player never buys them
  over Lightning Bolt/Implosion. They are strictly-dominated trap options in the
  shop and shrine.
- **Fix:** **Merge into the existing `bothArmies`/all-enemies machinery** —
  re-tag them to hit *all enemy stacks* (the loop already exists for Death
  Ripple), which finally matches their mana cost; **or** cut their cost to single-
  target parity; **or** `CUT_SPELLS` them entirely. Pick one — do not ship a trap.

### G. Two/Unlimited retaliation — heavy machinery, thin roster
- A per-stack `retaliationsUsed` counter + `retaliationBudget(stack)` +
  round-reset + a `hasAbilityPhrase` landmine guard… for **two** creatures
  (Griffin / Royal Griffin) that aren't even in the shipped Necropolis core.
- **Verdict:** **KEEP-BUT-FIX-LATER, low priority.** It's correct and the guard is
  genuinely needed (substring trap), but it's the clearest case of *engine breadth
  ahead of content breadth*. Don't expand it; let it earn out only if Castle's
  Griffin line actually ships into the encounter/dwelling pool meaningfully.

### H. Thematically load-bearing but mechanically thin
- **Aging (½ maxHp):** sounds terrifying, fires once/defender on main hit only;
  in practice a marginal HP trim. **Fix:** make it fire on *any* hit from the
  Ghost Dragon (drop the once-per-defender flag) so it actually erodes a stack —
  otherwise it's flavor with a flag.
- **Precision:** correct now (back-rank gate) but it's a +damage buff, and
  +damage has no A/D leverage. Low payoff; leave it but don't invest.
- **Prayer:** "+all three stats" reads great; one of the three (speed) is dead, so
  it's a +atk/+def buff with a phantom third. Honest only after initiative.

### Already-resolved redundancies (credit where due)
- **Shield vs Stone Skin:** correctly **already cut** — `CUT_SPELLS` drops
  `spell_shield`, Stone Skin stays. This is exactly the right move; it's the
  template for B/F above.
- **Necklace of Swiftness / Ring of Vitality:** LIGHT made them non-inert; Ring of
  Vitality (hp) genuinely works; Necklace is hostage to speed (see A).

---

## 3. THE ESSENTIAL CORE

**The spine is these ~12 mechanisms.** Remove any one and the game stops being
"HoMM3 with one hero, a rolling army as your life, two-rank tactics, on a growth
map." Everything else is *optional texture that must justify itself.*

1. **Two-rank reach** (front melee / back, front-wall rule)
2. **Shooters** (any-rank, no-retaliation)
3. **Flyers** (reach-back, melee — the answer to the wall)
4. **Retaliation** (once/round, the cost of meleeing)
5. **A/D damage curve + hero-buffs-the-whole-army**
6. **Kill/chip pool model** (the army-is-your-life math)
7. **Necromancy growth** (the no-gold compounding engine) + **Undead** gate
8. **Spells: one/turn, mana=knowledge·10, power-scaling, single-target nukes + heals**
9. **Equipment `+N primary` stat-sticks + `necromancyBonus` + `manaMax`** (the loot payoff)
10. **Encounter rubber-band scaling** (incl. the `bossMaxDragons` cap)
11. **The node map: combat/elite/boss + at least one recruit node + rest** (pacing + growth + gold sink)
12. **Faction selection** (the replay/identity axis — *kept as identity even though its non-Necro abilities lean inert*)

**The texture layer (must justify itself, in rough descending value):**
no-restack rule · Defend · no-enemy-retaliation · defense-shred · life-drain ·
death-blow · Blind+expiry · Death Ripple bothArmies · Forgetfulness noShoot ·
grantSpell/castOnStart · regeneration · extraStrikes · reset (Dispel/Cure) ·
roll-mode (Bless/Curse) · the four growth-node *distinctions* · curse-on-hit ·
Precision · two/unlimited retaliation · Prayer · jousting · aging · disease ·
mana-drain · **all speed mechanics**.

The line to draw: **the first ~6 texture items are clearly worth their code; the
last ~8 (jousting → speed) are at or below the waterline and should each be
cut, merged, or made to matter.**

---

## 4. THE SIMPLIFY / ESSENTIALIZE PLAN

Ordered. Distinguishes **cut-to-simplify** (free surface-area wins) from
**invest-to-make-it-matter** (one place buys back many).

### Phase 1 — Free cuts (reduce surface area now, no new systems)
1. **Merge jousting into stats.** Delete `JOUSTING_BONUS`; bake +25% into the
   Cavalier/Champion damage rolls at adapt time. (§2-D) *One fewer lever, zero
   behavior change.*
2. **Cut the AoE-trap nukes' trap-ness.** Re-route Fireball/Inferno/Meteor/Chain
   to the existing all-enemies loop **or** `CUT_SPELLS` them. (§2-F) *Removes 4
   strictly-dominated shop options.*
3. **Resolve the min-roll triad.** Cut or re-theme **Weakness** (make it the
   attack-shred twin of Disrupting Ray, or drop it as a Curse-dup). (§2-B)
4. **Fold or fix Disease & mana-drain & aging.** Either give each a number you can
   feel (Disease −3/−3, mana-drain −5+, Aging fires every hit) **or** merge/cut.
   (§2-C/E/H) *Stop maintaining flagged subsystems for invisible effects.*

### Phase 2 — The one investment that buys back the most (invest-to-matter)
5. **Add minimal initiative.** Act in speed order across *both* armies, with a
   "fastest stack on a speed gap acts twice" rule (no positions needed). This
   **retroactively activates** Haste, Slow, Prayer-speed, Necklace of Swiftness,
   the `speedAll` equip path, and Armor of the Damned's Slow opener — ~6 shipped
   mechanics — for one bounded subsystem. (§2-A) *Highest leverage in the codebase.
   Either do this, or do step 6.*

### Phase 3 — If you will NOT invest in initiative (the honest-cut alternative)
6. **Cut speed as a lever entirely.** `CUT_SPELLS` Haste + Slow, drop the speed
   tag from Prayer (`buffAll` → atk/def only), and stop counting Necklace/`speedAll`
   as anything but a dead stat. Better an honest 11-mechanism spine than a fake
   12th. (§2-A) *Mutually exclusive with step 5 — pick one; don't leave speed in
   limbo.*

### Phase 4 — Leave alone (it's earning its keep)
- The entire **core spine** (§3 items 1–12) — do not touch; it's tuned and pinned.
- **`bossMaxDragons`**, no-restack, Defend, Blind-expiry, defense-shred, life-drain,
  death-blow, Death Ripple bothArmies, Forgetfulness, grantSpell/castOnStart,
  reset, roll-mode — all pull their weight. Document, don't disturb.
- **Two/Unlimited retaliation:** leave as-is, **freeze** (don't expand). It only
  earns out if Griffin-line content actually ships. (§2-G)

### The retroactive-justification note (the crux)
There are **two** places where a small add pays for several inert mechanics, and
**one** is clearly the winner:
- **Initiative (winner):** ~6 speed mechanics go from cosmetic to live for one
  bounded subsystem. Do this *before* any content expansion — Stronghold/Conflux
  are speed-themed factions whose identity is currently flattened.
- **(Distant second) A status/duration layer:** would un-fake the AoE nukes,
  un-flatten Aging/Disease, and make timed buffs HoMM3-honest — but it's bigger,
  and §2's cheaper cuts/merges get most of the same simplification benefit without
  it. Defer.

---

## 5. Executive summary (6 bullets)

- **Top CUT candidates:** the **four AoE-faked nukes** (pay AoE mana, hit one — pure
  traps), **Weakness** (a third copy of the min-roll/Curse effect), **jousting**
  (a flat +25% cosplaying as a positional mechanic — fold into stats), and
  **Haste/Slow** (dead unless initiative ships).
- **Top KEEP-BUT-FIX items:** **speed** (add initiative or cut it — no limbo),
  **Disease/mana-drain/aging** (give them a felt number or merge/cut the flagged
  subsystems), and **side-alternation turns** (the seam where initiative belongs).
- **The one high-leverage investment:** **add minimal initiative** — it
  *retroactively* activates ~6 already-shipped speed mechanics (Haste, Slow,
  Prayer-speed, Necklace, `speedAll`, the Slow opener) for one bounded subsystem.
- **What's genuinely tight:** the combat core — two-rank reach, A/D curve,
  hero-buffs-army, kill/chip pool, Necromancy, rubber-band scaling. ~12 mechanisms
  form a clean, well-tuned spine; don't touch it.
- **Engine breadth has outrun content breadth:** several levers (two/unlimited
  retaliation, jousting, double-strike) exist for creatures not yet in the live
  encounter pool — correct code, but premature surface area. Freeze, don't expand.
- **One-sentence verdict:** *The game is **over-built in breadth and under-built in
  one keystone** — its core is essential and excellent, but a third of its texture
  layer is redundant or inert; cut/merge the dead weight and add the single
  initiative subsystem, and the same content becomes meaningfully deeper without
  growing the rules.*
