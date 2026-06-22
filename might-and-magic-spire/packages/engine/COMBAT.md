# COMBAT.md — the army-combat balance levers

> **This is the design surface.** Every formula and constant in `src/battle.ts`
> and the combat half of `src/run.ts` is a *named lever* below. Ethan vetoes
> balance by changing the constant; the code reads off the constant, so a single
> edit re-tunes the game and the tests re-validate. Nothing here is buried.

The model: **HoMM3 with one hero and no town.** Two ranks (front melee / back
ranged+casters), side-alternation turns, retaliation the only auto-reaction. The
**army is the player's life** — when every player stack is dead, the run is lost.
Growth happens on the map (Necromancy + Dwelling/Altar/Shrine/Merchant), not in a
town.

---

## 1. Effective stats — *hero buffs the whole army* (plan lever #2)

```
effAttack(stack)  = stack.attack  + hero.attack  + skills.Offense
effDefense(stack) = stack.defense + hero.defense + skills.Armorer
                    + (isDefending ? round(stack.defense * DEFEND_DEFENSE_FRACTION) : 0)
```

| Lever | Default | Where | Note |
|---|---|---|---|
| Hero Attack → whole army | `hero.attack` flat add | `battle.heroAttackBonus` | The hero is a force multiplier on every stack. |
| `Offense` skill | +rank to attack | `battle.heroAttackBonus` | Galthran ships with Offense 1. |
| `Armorer` skill | +rank to defense | `battle.heroDefenseBonus` | |
| `DEFEND_DEFENSE_FRACTION` | `0.2` | `battle.ts` | Defend adds `round(defense*0.2)` to effDefense, resets next turn. |

---

## 2. The A/D curve — the damage multiplier (plan lever #2 cap)

```
diff = effAttack(attacker) - effDefense(defender)
diff >= 0 → mult = 1 + min(diff * AD_ATTACK_STEP,  AD_ATTACK_CAP)
diff <  0 → mult = 1 - min(-diff * AD_DEFENSE_STEP, AD_DEFENSE_CAP)
```

| Lever | Default | Effect |
|---|---|---|
| `AD_ATTACK_STEP` | `0.05` | +5% damage per point of attack advantage |
| `AD_ATTACK_CAP` | `3.0` | max +300% (binds at diff ≥ 60) |
| `AD_DEFENSE_STEP` | `0.025` | −2.5% per point of defense advantage |
| `AD_DEFENSE_CAP` | `0.7` | max −70% (binds at diff ≤ −28) |

Sampled curve (`mult` by `diff`): −30→×0.30, −10→×0.75, 0→×1.00, +10→×1.50,
+20→×2.00, +40→×3.00, +60→×4.00 (capped).

**Safety valve:** the +300% cap is the snowball brake. With Galthran (Attack 3 +
Offense 1) the army gains +4 effAttack — meaningful but far from the cap; the cap
only binds against very low-defense chaff. Verify it does **not** trivialize
elite/boss fights (their defenses are 9–18, so the cap never binds there).

---

## 3. Damage & the kill/chip model

```
perCreature = rng.int(damageMin, damageMax)      // ONE shared roll per stack (HoMM3-style)
base        = count * perCreature
damage      = floor(base * mult)

applyDamage: pool = hpTop + (count-1)*maxHpPer
             remaining = pool - damage
             count' = ceil(remaining / maxHpPer)
             hpTop' = remaining - (count'-1)*maxHpPer
             remaining <= 0 → stack destroyed (overkill has NO carry)
```

Worked example (pinned in `battle.test.ts`): **10 Skeletons (maxHp 6, hpTop 6)
taking 15 → count 8, hpTop 3, 2 slain.** Overkill: 10 Skeletons (pool 60) hit for
200 → all 10 slain, only 60 hp "dealt" (clamped; no waste tracked).

---

## 4. Retaliation — the only auto-reaction

A melee defender strikes back **once per round**. Suppressed when:
- the attacker **shoots** (ranged), or
- the attacker has **"No enemy retaliation"** (Vampire / Vampire Lord), or
- the defender already retaliated this round (`hasRetaliated`, reset at round start).

`hasRetaliated` resets at the top of each round in `endPlayerTurn`.

---

## 5. Reach — two ranks (flying-reach-back ON; see §15)

- **Melee (ground)** may target the enemy **front rank only**, until the front is
  empty, then it reaches the back.
- **Shooters** (Lich/Power Lich: ability `Ranged`) hit **any** rank, and take **no
  retaliation** when shooting.
- **Flyers** (`Flying`: Wight, Wraith, Vampire(s), Bone & Ghost Dragon) hit **any**
  rank — they ignore the front wall — but are **melee**, so they still **take and
  deal retaliation** (unlike shooters). This is the faction's core tactic: flyers
  dive the back-rank casters. (`battle.isFlying` / `legalTargets`; lever §15.)

---

## 6. Abilities (Necropolis-relevant)

| Ability | Effect | Lever |
|---|---|---|
| Undead / No morale | flavor; raisable by Necromancy | `applyNecromancy` |
| Ranged / Shooter | back rank, hits any rank, no retaliation | `battle.isShooter` |
| No enemy retaliation | attacker takes no counter | `resolveAttack` |
| Life drain (Vampire Lord) | heal attacker by `LIFE_DRAIN_FRACTION * dealt`, **capped at battle-start count** | `LIFE_DRAIN_FRACTION = 1.0`, `startCount` |
| Regeneration | top creature heals to full at the owner's turn start | `REGEN_FRACTION = 1.0` |

**Life-drain cap (plan lever #4):** a Vampire Lord can resurrect/heal back up to
`stack.startCount` — the count at the start of *that battle*. It can never exceed
it, so a drained-down stack recovers but the ability cannot manufacture an army.

---

## 7. Necromancy — the growth engine (plan lever #3, THE big one)

After a won battle:

```
skill   = hero.skills.Necromancy            // 0..4
pct     = min(NECRO_CAP, NECRO_BASE_PCT[skill] + equipmentNecroBonus)
slainHp = Σ over slain enemy creatures of (their maxHp)
raised  = floor(slainHp * pct / SKELETON.maxHp)
raised  = min(raised, totalCreaturesSlain)  // never raise more bodies than fell
```

| Lever | Default | Note |
|---|---|---|
| `NECRO_BASE_PCT` | `[0, 0.30, 0.40, 0.50, 0.60]` | index by Necromancy rank |
| `NECRO_CAP` | `0.75` | hard ceiling on the percentage |
| Cloak of the Undead King | `+0.15` necro bonus | `adaptEquipment` → `necromancyBonus` |
| `SKELETON_ID` | `necropolis_skeleton` | raised bodies are Skeletons (maxHp 6) |

Raised Skeletons merge into your existing Skeleton stack, else create one (if under
`ARMY_CAP`), else surface as a `{kind:'raise'}` reward you may accept (replacing
the weakest stack) or skip.

**Why it's the big lever:** this is the *only* compounding growth that doesn't cost
gold. At `0.10` (the original guess) the army ball **deflated** under attrition and
the run was unwinnable (0% in the sim). At `0.30` base a Necromancy-1 hero
**net-recovers** from a typical fight and the ball rolls. Too high and you drown in
Skeletons. Tuned against the full-run sweep in `run.test.ts`.

---

## 8. Economy (gold)

| Lever | Default | Where |
|---|---|---|
| `STARTING_GOLD` | `200` | `run.ts` |
| `RECRUIT_COST_PER_TIER` | `30` | Dwelling |
| `UPGRADE_COST_PER_TIER` | `50` | Altar |
| `SHRINE_COST_PER_LEVEL` | `40` | Shrine |
| `ARTIFACT_COST` | Treasure 60 / Minor 100 / Major 180 / Relic 300 | Merchant |
| `REST_MANA_FRACTION` | `1.0` | Rest refills mana fully |
| `REST_HEAL_PER_STACK` | `0.25` | Rest heals 25% of each stack's missing pool |
| `TURN_MANA_REGEN` | `1` | mana regained each player turn |
| `MANA_PER_KNOWLEDGE` | `10` | `maxMana = knowledge * 10` |
| `ARMY_CAP` | `7` | max stacks (plan: 7) |

---

## 9. Encounter scaling — the difficulty curve

Enemies are built from a **power budget** that tracks the player's *current* army
value, so attrition is self-correcting (a weakened player faces a smaller foe — a
natural rubber band).

```
armyValue(stack) = count * (maxHpPer + avgDamage*2)
budget           = max(playerArmyValue, 300) * mult        // mult by node type + depth
depth            = node.row / bossRow                       // 0 at the opener, 1 at the boss
```

| Lever | Default | Note |
|---|---|---|
| `combatMult` | `[0.22, 0.42]` | lerp by depth: 0.22× at row 0 → 0.42× near boss |
| `eliteMult` | `[0.45, 0.65]` | |
| `bossMult` | `0.7` | |
| `bossMaxDragons` | `2` | **critical** — see degenerate cases |
| `maxStacks` | `4` | |

**Why `bossMaxDragons` is load-bearing:** a Bone Dragon is hp150, A17, dmg25–50. A
stack of 3+ one-rounds the player's whole front, and a Skeleton-heavy army cannot
out-chip 450 hp of dragon before being wiped — the fight is an *unkillable wall*.
Capping the boss at 1–2 dragons (excess budget → a Lich guard) moved the greedy-bot
win rate from **4% → 59%**. The boss is still where ~80% of losses happen, which is
correct: it's the climax, and it rewards bringing high-tier units (Vampires,
Liches, Black Knights) and spells, not just a Skeleton ball.

---

## 10. Spells — magnitude (plan lever #5: powerScale is greenfield)

```
magnitude = effect.base + effect.powerScale * hero.power
```

The schema only gives `effectTags` + `description`; the per-Power scaling is **pure
design** and the single biggest tuning item after Necromancy. Tables live in
`adapter.ts`:

| Lever | Default |
|---|---|
| `DAMAGE_BASE_BY_LEVEL` | `[_, 10, 18, 28, 45, 70]` (index by spell level) |
| `DAMAGE_SCALE_BY_LEVEL` | `[_, 10, 12, 15, 18, 22]` |
| heal base / scale | `10*level` / `10` |
| buff/debuff base / scale | `2+level` / `1` |

v1 simplifications (levers): **area/chain/all-units spells resolve as single-target**
(no AoE geometry without a hex grid); **disable** zeroes the target's damage roll.

See **§14 LIGHT balance rules** for the additive spell re-maps (Bless/Curse
roll-mode, Dispel/Cure reset, Death Ripple/Armageddon both-armies, Prayer
all-three-stats, Precision back-rank gate, Forgetfulness no-shoot, Blind expiry)
layered on top of these magnitude tables.

---

## 11. Enemy AI — deterministic lookup planner (honest telegraph)

`chooseEnemyIntent` is a pure function used to **both** render the telegraph and
drive the executed action — so the telegraph never lies. It prefers a target it can
**wipe**, else the **highest-threat** legal target
(`threat = count*avgDamage + attack`). It is a lookup, **not a search** — no
minimax, fully deterministic from the board.

Enemies act in **speed order** (highest first) at `endPlayerTurn`.

---

## 12. Degenerate cases (pressure-tested with the strategy-mindset lens)

**Snowball (army ball):** Necromancy is the compounding vector. Brakes:
`NECRO_CAP 0.75`, the *creatures-slain* cap (you can't raise more than fell),
`ARMY_CAP 7`, and the A/D `+300%` cap on hero-attack scaling. The budget-tracks-
current-army rule means snowballing also *raises the difficulty*, so the snowball
funds the next fight rather than trivializing it. **Status: bounded.**

**Stalemate (zero-damage chip):** with the −70% defense cap, a *tiny* stack can hit
the floor where `floor(count * perCreature * 0.30) == 0` — e.g. 1 creature of
dmg 1 vs a high-defense wall deals **0** net damage. A real stalemate is therefore
*possible* for a single whittled creature, but evaporates with count: 20×dmg1 at
×0.30 still chips 6. Because the army ball keeps stacks fat and the budget shrinks
as you weaken, sustained stalemates don't occur in the sim (every run resolves to
won/lost; the keystone test asserts **no hangs** across 25 seeds). **Mitigation
lever if it ever bites:** a flat "minimum 1 damage per attacking creature" floor in
`computeDamage`. Left out in v1 to keep HoMM3 fidelity. **Status: theoretically
reachable, practically absent; documented.**

**Determinism:** a run is a pure function of its seed — `run.test.ts` asserts
byte-identical final `RunState` for the same seed.

---

## 13. Things deliberately deferred (levers to revisit)

- AoE spell geometry (§10) — needs positions/hex.
- Morale/luck (needs a morale/luck subsystem); spell-school typing /
  spell-immunity (Dragon/Death typing — needs an immunity layer).
- **Mana drain, aging, disease, curse-on-hit are now MECHANIZED** — see §17
  (Item D). Still deferred there: **Death cloud** (Lich splash — needs
  multi-target/AoE), **Reduces enemy morale / No morale penalty** (needs the
  morale subsystem), **Dragon/Death typing** (needs spell-immunity).
- Multi-act runs (the run wins at the act-1 boss today; regen the map + bump `act`).
- **Double attack/shot, extra/unlimited retaliation, jousting, and Behemoth
  defense-shred are now MECHANIZED** — see §20–§21 (Items F/G). Still deferred
  there: **creature spellcasting** (Ogre Magi Bloodlust, Thunderbird lightning —
  needs a caster/proc hook), **morale auras** (Archangel — needs morale),
  **resurrection** (Archangel), and **true jousting-by-distance** (needs
  positions).

---

## 14. LIGHT balance rules (BALANCE_PROPOSALS.md §3)

The **LIGHT** set: additive only, reuse existing kinds, **no new subsystem** (no
duration/status layer, no initiative, no positions). It turns ~8 broken/inert
spells and 2 inert artifacts correct with no UI change. Everything below is a
named lever; the app seam casts structurally, so the new engine-internal fields
(`Stack.noShoot`, `Stack.blindedFrom`, `SpellEffect` `rollmode`/`reset`/
`buffAll` + the `bothArmies`/`skipUndead`/`backRankOnly`/`noShoot`/`reset` flags)
need **no app contract/mock change** — the UI never reads them.

| # | Rule | Spell/artifact fixed | Where |
|---|---|---|---|
| 1 | **Equipment combat effects applied at battle open.** `hpPerCreature` → every player stack `maxHpPer += n` and `hpTop += n`; `speedAll` → `speed += n`. | Ring of Vitality, Necklace of Swiftness (were parsed-but-dropped) | `run.ts` `equipmentCombatBonuses` + `openCombat` |
| 2 | **Bless/Curse → roll-mode.** Bless (ally) sets `damageMin = damageMax` (always max). Curse (enemy) sets `damageMax = damageMin` (always min). Reuses the disable damage-roll edit; distinct from Weakness/Stone Skin. | Bless, Curse | `adapter.ts` (`rollmode` kind) + `run.ts` `applySpell` |
| 3 | **Dispel/Cure → reset to base.** `reset` looks up `creatureById(stack.sourceId)` and restores `attack/defense/speed/damageMin/damageMax` to base — undoes any buff OR debuff, zero tracking. Dispel = pure reset on an enemy (was a mislabeled +attack ally buff — a real correctness bug). Cure = heal **+ reset rider**. | Dispel, Cure | `adapter.ts` (`reset` kind, Cure `heal.reset`) + `run.ts` `resetStackToBase` |
| 4 | **Death Ripple → both armies, skip undead.** `damage` effect flags `bothArmies + skipUndead`; the loop hits `enemyArmy` and `yourArmy`, skipping any `hasAbility(s,"undead")`. Roster is all-undead → your army takes 0 (signature "safe nuke"). | Death Ripple | `adapter.ts` flags + `run.ts` `applySpell` |
| 5 | **Armageddon → both armies (no skip).** `bothArmies` only — friend-and-foe downside/identity returns. | Armageddon | `adapter.ts` flag + `run.ts` `applySpell` |
| 6 | **Prayer → all three stats.** `buffAll` kind applies `+mag` to attack AND defense AND speed on the ally (was silently speed-only). | Prayer | `adapter.ts` (`buffAll`) + `run.ts` `applySpell` |
| 7 | **Precision back-rank gate + Forgetfulness no-shoot.** Precision's `+damage` buff only lands on a `rank==="back"` ally (else whiffs). Forgetfulness sets the enemy's `noShoot` flag; `isShooter` returns false when set → a shooter is forced to melee (eats retaliation, loses reach). | Precision, Forgetfulness | `adapter.ts` (`backRankOnly`, `debuff.noShoot`), `battle.ts` `isShooter`, `run.ts` `applySpell` |
| 8 | **Blind expires.** When `disable` (Blind) zeroes a stack's roll, it stores the pre-zero `{damageMin,damageMax}` in `Stack.blindedFrom`. At that stack's **next action** (`commandStack` for player stacks, `enemyAct` for enemy stacks) the roll is restored and the flag cleared — Blind costs the target one action, then wears off (kills the permanent-lock exploit). | Blind | `types.ts` `Stack.blindedFrom`, `run.ts` `applySpell` + `restoreBlindAfterAction` |

**Determinism preserved.** All rules are pure stat edits / content lookups; no
new RNG draws. The keystone full-run + byte-identical determinism tests in
`run.test.ts` stay green, and `light.test.ts` pins all 8 behaviors.

**NOT in LIGHT** (left for MEDIUM/HEAVY): morale, luck, initiative, real AoE
geometry, ~~on-combat-start artifact casting~~ (now done — see §19), per-school
spell scaling, duration timers. Speed stays weak (rule 1 only makes Necklace non-inert, not strong);
Shield stays a Stone-Skin dup (needs `block` — MEDIUM).

---

## 15. Flying reach-back (post-LIGHT addition)

Flying was the one HEAVY-tier item pulled forward by request — it's core to the
Necropolis identity (half the roster flies). A `Flying` stack (`battle.isFlying`)
targets **any** rank like a shooter, but it is **melee**: it still takes and
deals **retaliation** (a shooter does not). So flyers are the back-line divers —
your Vampires/Dragons reach their casters, theirs reach yours — at the cost of
eating a counter (except Vampires, which also have `No enemy retaliation`).
Enemy flyers route through the same `legalTargets`, so their telegraphs now
correctly threaten your back rank. Verified: keystone full-run + win-search tests
stay green with flyers enabled.

---

## 16. BATCH balance: no re-stack + pool/stat-stick fixes (approved decisions)

Additive only — **no new subsystem** (no morale/luck, no initiative, no
positions/AoE, no duration layer). New `Stack`/`SpellEffect` flags are
engine-internal; the app seam casts structurally and never reads them. All
behavior is pinned in `batch.test.ts`; the keystone determinism tests stay green.

### Item A — no re-stack of the SAME spell (open-Q #2)

Stat-mod spells (`buff`, `buffAll`, `debuff`, `rollmode` — **not** `damage`,
`heal`, `reset`) used to **stack permanently and additively** on recast. Now a
spell that's already been applied to a stack is a **NO-OP on recast of the SAME
spell**: `applySpell` checks `target.spellMarks` for the casting spell's id —
if present, it logs `"… is already affected by …"` and does nothing; else it
applies the change and appends the spell id to `spellMarks`. **DIFFERENT** spells
still stack (Curse + Weakness both land); the **same** spell can't re-stack.

| Lever | Where | Note |
|---|---|---|
| `Stack.spellMarks?: string[]` | `types.ts` | per-stack record of stat-mod spell ids already applied; pure, no RNG. |

This closes the "out-mana-regen a fight → stack Curse/Weakness to delete enemy
damage" exploit without a duration layer. `damage`/`heal`/`reset` are unmarked by
design (nukes/heals/Dispel are meant to repeat).

### Item B — Shield cut from the pool (open-Q #5)

**Shield** (`spell_shield`) and **Stone Skin** are identical +defense buffs;
differentiating Shield needs the `block` field (MEDIUM). We ship **one** and cut
the other: `content.ts` filters `spell_shield` out of `SPELLS` via the
`CUT_SPELLS` set lever, so Shrines and starter books never offer it. **Stone
Skin stays.** The `spell_shield` data record is left intact (free to revive when
`block` lands).

| Lever | Where | Default |
|---|---|---|
| `CUT_SPELLS` | `content.ts` | `{ "spell_shield" }` — ids dropped from the usable pool. |

### Item C — Armor of the Damned → real stat stick (open-Q #4)

> **Superseded by §19.** The on-combat-start casting deferred here is now
> IMPLEMENTED (`castOnStart` effect kind). The `+4 Defense` stat stick below
> STAYS — AOTD is now both a +4 Defense armor AND opens combat with
> Slow/Curse/Weakness on every enemy. (Misfortune is still inert — no data
> record; see §19.)

The Relic's headline ("Casts Slow, Curse, Weakness, Misfortune on all enemy
stacks at combat start") originally parsed to **nothing** — on-combat-start enemy
casting was a deferred subsystem. Rather than ship a dead Relic, its `bonuses`
string is **prepended with `+4 Defense`** in `packages/data/src/artifacts.json`.
`parseBonuses` reads the leading `+N <primary>`, so the Torso Relic now adapts to
`{ defense: +4 }` (a fitting armor stat). `bonuses` is a free string, so the
`@mms/data` schema tests are unaffected; the flavor text is preserved after the
stat.

---

## 17. BATCH balance: mechanized creature on-hit abilities (Item D, open-Q #6)

Five creature abilities, previously flavor, are now wired into combat
resolution. Each fires off the **MAIN hit only** (never retaliation — keeps it
simple), is **deterministic** via the existing attack `rng`, **logs a line**, and
(where it's a debuff) applies **ONCE per defender stack** via a flag so it can't
infinitely re-stack. Detection uses `hasAbility(stack, "…")` (case-insensitive
substring, already in `battle.ts`). All levers live in `battle.ts`.

| # | Ability (creature) | Effect | Lever(s) | Default | Flag |
|---|---|---|---|---|---|
| D.1 | **Death blow** (Dread Knight) | `rng.next() < CHANCE` → main-hit damage ×`MULT`. Logs `"Death blow!"`. | `DEATH_BLOW_CHANCE` / `DEATH_BLOW_MULT` | `0.2` / `2` | — |
| D.2 | **Drains enemy mana** (Wraith) | enemy→player hit drains `AMOUNT` from `hero.mana` (clamp ≥ 0). `resolveAttack` returns `manaDrain`; the `run.ts` enemy-attack path subtracts it. Player→enemy is inert (enemies use `NULL_HERO`, no mana). | `MANA_DRAIN_AMOUNT` | `2` | — |
| D.3 | **Aging** (Ghost Dragon) | once per defender: `maxHpPer → max(1, floor(maxHpPer * FRACTION))`, then re-clamp the pool to `count*maxHpPer` (excess creatures die — the HoMM3 effect). Logs `"… ages (max hp halved)"`. | `AGING_FRACTION` | `0.5` | `aged?` |
| D.4 | **Disease** (Zombie) | once per defender: `-ATK` attack, `-DEF` defense (floored at 0). Logs `"… is diseased"`. | `DISEASE_ATK` / `DISEASE_DEF` | `1` / `1` | `diseased?` |
| D.5 | **Curse on-hit** (Black & Dread Knight) | once per defender: set min-roll (`damageMax = damageMin`), matching the Curse SPELL but as an on-hit rider. Logs `"… is cursed (min damage)"`. | — | — | `cursed?` |

The on-hit debuffs (D.3–D.5) run on the **surviving** defender after the main
hit (skipped if the stack died). `aged?/diseased?/cursed?` are additive
engine-internal `Stack` flags. Death blow's `rng.next()` draw is **conditional on
the attacker having the ability**, so it doesn't perturb the RNG stream of any
ability-less attacker — the byte-identical determinism tests stay green.

**Explicitly deferred (need subsystems we're not building here):**
- **Death cloud** (Lich splash) — needs multi-target / real AoE geometry.
- **Reduces enemy morale / No morale penalty** — needs a morale subsystem.
- **Dragon / Death typing** — needs spell-immunity (a spell-school type layer).

We don't fake these; they're flagged in §13.

---

## 18. BATCH balance: Death Ripple is a power lever (Item E, open-Q #3)

**Death Ripple's mechanic is unchanged** — `bothArmies + skipUndead` (it nukes
both armies but skips any `undead` stack) stays exactly as in §14 rule 4. On the
all-undead Necropolis roster your own army takes **0**, so it is the signature
"safe nuke" and, by design, a **near-auto-include**.

That power level is an **explicit balance lever**, not an accident: the knobs are
its **mana cost** (`SourceSpell.manaCost` in the data corpus) and its **base
damage** (`DAMAGE_BASE_BY_LEVEL` / `DAMAGE_SCALE_BY_LEVEL` in `adapter.ts`, indexed
by spell level). If the all-undead auto-include becomes oppressive in the sim,
**raise its mana cost** (cheapest, most surgical) or trim its level's base before
touching the mechanic. We are **not** nudging the cost in this batch — it isn't
trivially low and no change is obviously warranted yet; this note simply flags the
lever so the decision is deliberate next time the run is tuned.

---

## 19. Relic plumbing: artifact → spell (grantSpell + castOnStart)

Two HoMM3 Relics carried PROSE in their `bonuses` that `parseBonuses` dropped on
the floor — the spells already existed as castable `CombatSpell`s, but nothing
wired the artifact to them. Both directives now parse to engine-internal
`EquipmentEffect` kinds and deliver. **Additive only** — no new subsystem, no
RNG, pure stat edits / content lookups; the keystone byte-identical determinism
test stays green. The app reads `hero.spellbook` (the EFFECTIVE book) and the
combat log, so no app contract change is needed (one display-only narrowing in
the debug Codex tile, since it enumerates effect kinds).

### Effect kinds (`types.ts`)

| Kind | Shape | Meaning |
|---|---|---|
| `grantSpell` | `{ spellIds: string[] }` | While equipped, these spells are castable (unioned into `hero.spellbook`). |
| `castOnStart` | `{ spellIds: string[] }` | At combat open, script-cast each spell onto **every** enemy stack. |

### Parsing (`adapter.ts`, pure string work — no `content.ts` import)

`deriveSpellId(name)` mirrors the data id convention
`spell_<name lowercased, non-alphanumerics → "_">` ("Armageddon" →
`spell_armageddon`). `parseBonuses` adds two directive matchers on top of the
existing `+N stat` parse (which is untouched — A'sB still yields **+3 all**, AOTD
still yields **+4 Defense**):

- `"(allows )?casting <Spell>( as …)"` → `grantSpell [deriveSpellId(Spell)]`.
- `"Casts A, B, C(, and D) on … combat"` → `castOnStart` with the derived ids of
  every listed name.
- `"immunity to <X>"` → **IGNORED** (needs an immunity subsystem we are not
  building — see the Armageddon caveat below).

### grantSpell → the effective spellbook (`Hero.baseSpellbook` + `recomputeHero`)

`Hero` gains an engine-internal `baseSpellbook: CombatSpell[]` — the LEARNED set
(starting spells + shrine-learned). `deriveHero` seeds it; `learnAt`/`learn`
append to it (never to `spellbook` directly). `recomputeHero` (already run on
equip/unequip) rebuilds the effective `spellbook` as
`baseSpellbook ∪ {adaptSpell(spellById(id)) for each grantSpell id}`, **deduped
by spell id**; ids that don't resolve are skipped. So equipping Armageddon's
Blade makes Armageddon castable and unequipping removes it — **unless** the hero
also learned it at a shrine (it stays in `baseSpellbook`).

### castOnStart → every enemy stack at combat open (`run.ts`)

`openCombat` (the same place LIGHT `hpPerCreature`/`speedAll` are applied) calls
`applyCastOnStart` **after** the enemy army is built: for each equipped
`castOnStart` spell id, resolve `adaptSpell(spellById(id))` (skip unresolved),
and apply its effect to every living enemy stack via
`applySpellEffectToStack(spell, hero, stack)` — the **same** per-stack core a
normal cast uses (extracted so the two never drift). Magnitude scales off the
wielder's `hero.power` like any cast; the no-restack `spellMarks` rule applies;
one log line per cast. So **Armor of the Damned** opens combat by hitting every
enemy with **Slow** (speed debuff) + **Curse** (min-roll) + **Weakness** (attack
debuff). Deterministic — these are stat edits, no RNG.

### Edge: Misfortune & the Armageddon no-immunity caveat

- **Misfortune** is a Luck spell with **no data record** (`spell_misfortune`).
  It's still listed in AOTD's prose, so it derives to `spell_misfortune` and is
  carried in `castOnStart.spellIds` — but `spellById` returns `undefined`, so it
  is **skipped gracefully** (no crash, no mark). If a luck system ever lands,
  adding the data record is all it takes.
- **No "immunity to Armageddon".** We do NOT implement the immunity subsystem, so
  a hero who casts their granted Armageddon **also hits their own army** (it's a
  `bothArmies` damage spell — see §14 rule 5). That is the honest, accepted
  tradeoff of delivering the cast without the immunity: Armageddon's Blade makes
  Armageddon *castable*, not *safe*.

| Lever | Where | Note |
|---|---|---|
| `EquipmentEffect.grantSpell` / `castOnStart` | `types.ts` | engine-internal effect kinds; app reads only the resolved `spellbook`/log. |
| `Hero.baseSpellbook` | `types.ts` | learned set; effective `spellbook` = base ∪ granted (recomputeHero). |
| `deriveSpellId` | `adapter.ts` | pure name → data-id; no content import in the adapter. |
| `applySpellEffectToStack` | `run.ts` | shared per-enemy-stack cast core (turn cast + castOnStart). |
| `applyCastOnStart` | `run.ts` | opening Relic casts in `openCombat`. |

---

## 20. Castle/Stronghold ability mechanization — strikes & retaliation (Item F)

Two FREE+LIGHT wins from `BREADTH_ANALYSIS.md` (the "double-attack" Group A and
the "extra retaliation" Group B). **Additive only** — no positions, no
initiative, no morale/luck. Deterministic via the attack `rng` (new draws only
fire when the attacker actually has the ability). All levers live in `battle.ts`;
behavior pinned in `abilities.test.ts`.

### 20.1 `extraStrikes` — double attack / double shot

A creature whose ability list contains an exact double-attack phrase deals its
**main hit `1 + EXTRA_STRIKES` times** in one action. The loop reruns the
full main-hit path (damage roll + jousting premium + death-blow chance +
`applyDamage`) per strike and **stops early if the defender dies**; the
death-blow and life-drain hooks ride along naturally. **Retaliation still occurs
at most ONCE per action** (HoMM3: the defender counters a double-attacker only
once) — this falls out because retaliation is resolved once per `resolveAttack`,
after all strikes. Shooters that double-shot take no retaliation (shooting
suppresses it), exactly like a single shot.

| Lever | Default | Note |
|---|---|---|
| `DOUBLE_ATTACK_PHRASES` | `["attacks twice","strikes twice","shoots twice"]` | exact (case-insensitive whole-string) phrases via `hasAbilityPhrase` — NOT a loose substring. |
| `EXTRA_STRIKES` | `1` | extra strikes granted (total hits = 2). |

Activates **Marksman** ("Shoots twice"), **Crusader** & **Wolf Raider**
("Attacks twice"). Zealot is a plain shooter in the data (no double-attack
phrase) so it is not affected — matches the analysis.

### 20.2 Extra / unlimited retaliation — a per-round budget

The boolean `hasRetaliated` is supplemented by a per-stack **`retaliationsUsed`**
counter (reset at round start in `endPlayerTurn`, and on settle). A defender may
counter while `retaliationsUsed < retaliationBudget(stack)`. So **Royal Griffin
("Unlimited retaliation")** can counter every attacker that hits it in a round,
and **Griffin ("Two retaliations")** counters twice. `retaliationsUsed` is
authoritative when present; if only the legacy `hasRetaliated` boolean is set
(older callers/tests), it falls back to "1 used", preserving once-per-round.

| Lever | Default | Note |
|---|---|---|
| `DEFAULT_RETALIATIONS` | `1` | HoMM3 once-per-round budget for any stack. |
| `TWO_RETALIATIONS` | `2` | "Two retaliations" (Griffin). |
| `retaliationBudget(stack)` | — | `∞` for "Unlimited retaliation", `2` for "Two retaliations", else `DEFAULT_RETALIATIONS`. |
| `Stack.retaliationsUsed?` | `0` | counters used this round; reset alongside `hasRetaliated`. |

### 20.3 The `hasAbilityPhrase` substring-landmine guard (analysis §1/§4)

`hasAbility` is a **case-insensitive SUBSTRING** match. The analysis flagged that
importing **Royal Griffin ("Unlimited retaliation")** could accidentally trip the
`no enemy retaliation` branch. New ability checks therefore use
**`hasAbilityPhrase`** (whole-string equality): the retaliation-suppression check
and all the new strike/jousting/defense-shred checks match precise phrases.
`abilities.test.ts` pins that a Royal Griffin attacker does **not** suppress its
victim's retaliation, while a real "No enemy retaliation" creature still does.

---

## 21. Castle/Stronghold ability mechanization — jousting & defense-shred (Item G)

### 21.1 Jousting (Cavalier / Champion) — reskinned as a flat premium

HoMM3 jousting is `+dmg per hex charged`. With **no positions/movement** in this
engine we reskin it as a **flat damage premium** on the attacker's main hit
(applied per strike, before death-blow). **Simplification:** it is a constant
bonus, not distance-scaled.

| Lever | Default | Note |
|---|---|---|
| `JOUSTING_BONUS` | `0.25` | +25% main-hit damage when the attacker has the exact "Jousting" ability. |

### 21.2 Behemoth / Ancient Behemoth "Reduces enemy defense" (S-tier feed)

On hit, a Behemoth applies a **once-per-defender defense debuff** (reusing the
Disease-style flag mechanism). Lower defense feeds the **A/D multiplier** — the
engine's strongest lever (analysis flags this S-tier) — so every subsequent
attacker hits the debuffed stack harder. **Ancient Behemoth shreds more.** Both
creatures carry the same `"Reduces enemy defense"` ability string, so the Ancient
(larger shred) is distinguished by its stable `sourceId`/`name` containing
`"ancient"`.

| Lever | Default | Flag | Note |
|---|---|---|---|
| `DEFENSE_SHRED` | `4` | `Stack.defenseShred?` | defense stripped by a Behemoth, floored at 0. |
| `DEFENSE_SHRED_ANCIENT` | `8` | — | Ancient Behemoth strips this much. |
| `defenseShredAmount(attacker)` | — | — | picks the Ancient amount when id/name includes "ancient". |

### 21.3 Deferred (need subsystems — NOT faked here)

Per the analysis SKIP list, these remain inert and documented (see §13):
- **Caster-on-hit creatures** — Ogre Magi "Casts Bloodlust", Thunderbird
  "Lightning strike" (spell-as-proc). Needs the creature-casting hook / a
  bonus-damage-proc mechanism; they do **not** fit the existing buff/debuff/damage
  hooks trivially, so they are **deferred** (Group C / Thunderbird in the
  analysis). The bodies still work (Ogre Magi = melee brick, Thunderbird = flyer).
- **"Hates X" / creature typing, morale auras** (Archangel), **true
  jousting-by-distance**, **no-melee-penalty shooters** (the engine has no melee
  penalty, so Zealot's perk is moot, not faked).
- Archangel's **resurrection** and Royal Griffin/Champion's positional identities
  beyond the reskins above.

## 22. Multi-faction playability (Necropolis / Castle / Stronghold)

The run is now playable as ANY faction's hero, not just Necropolis.
`startRun(seed, heroId?)` derives the chosen hero (default `hero_galthran`,
Necropolis, byte-identical to v0) and sets `RunState.faction = hero.faction`.

### Per-faction wiring (no new subsystem)

- **Starting army** (`adapter.deriveHero`): a tier-1 core stack (×20) of the
  hero's faction plus a second stack — the hero's specialty creature if its name
  matches a faction base creature, else the faction's tier-2 base (×10/5/2 by
  tier). Necropolis/Galthran is unchanged: 20 Skeleton + 10 Walking Dead.
- **Starter spellbook/skills** (`adapter`): faction-flavored —
  Necropolis → Necromancy opener (Magic Arrow/Bless/Haste), Castle → Bless +
  Cure, Stronghold → Haste only (it wins by swinging). Skills seed from the
  hero's `startingSkills` (rank 1).
- **Encounters** (`rollEncounter`): foes are drawn from a **broad cross-faction
  pool** (`ALL_BASE_CREATURES` — every faction's base creatures), NOT the
  player's own roster (no civil war), budget-matched so difficulty is unchanged.
  The **boss** stays a fixed Necropolis antagonist theme (the Spire's Lich King:
  Bone Dragon + Lich guard) for every run.
- **Dwellings** (`rollDwelling`): recruit the **player's OWN faction**
  (`basePool(run.faction)`) so you grow your own army. Altar upgrades remain
  faction-agnostic (`upgradeFormOf`).

### Growth: Necromancy stays skill-gated

`applyNecromancy` reads `hero.skills["Necromancy"]`; non-Necromancer factions
get 0 → no raise. They **sustain via Dwellings (recruit), Rest (heal+mana) and
gold** — the rubber-banding encounter budget keeps attrition survivable. No new
growth subsystem was added.

### Balance: NO lever changed

A seed sweep of the dumb auto-player (80 seeds) confirms every faction lands in
the sane win band with **no tuning**:

| Faction (hero) | Win rate |
|---|---|
| Necropolis (Galthran, default) | ~46% |
| Castle (Tyris / Sir Mullich) | ~45–49% |
| Stronghold (Crag Hack) | ~33% |

Castle (the keystone non-Necropolis target, `factions.test.ts`) needed **no
balance tuning** — it sits right beside Necropolis. The existing levers (rest
heal %, encounter mult, dwelling cost) were left untouched.
