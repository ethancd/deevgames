# ADAPTER.md — Source → runtime adapters (v2, ARMY model)

> The seam where HoMM3 stat-blocks become engine objects. **This is design, not
> engineering** — the balance choices live here and in `COMBAT.md`. The adapters
> never touch `@mms/schema` (the content contract is fixed); they read `Source*`
> records and emit runtime types from `src/types.ts`.

## RETIRED: the card adapter and the fixtureCard invariant

The old Slay-the-Spire adapter is **gone**:

- `adaptCreature(c) → CardDef` — **deleted.** Creatures no longer become cards;
  they become **Stacks** (`adaptStack`).
- The hard contract **`adapt(fixtureCreature)` deep-equals `fixtureCard`** is
  **RETIRED.** There is no card adapter to satisfy it, so the invariant and its
  test are removed. `fixtureCard` survives in `@mms/schema` only for the Codex's
  creature-as-card display; the engine does not produce it.
- `adaptArtifact(a) → Relic`, `signatureRelicForHero`, `costForTier`,
  `magnitudeForCreature`, `rarityForCreature` — **deleted** (Relic/Card concepts
  are gone).

What remains is four adapters that build the army runtime.

---

## 1. `adaptStack(creature, count, opts?) → Stack`

Carries the **REAL HoMM3 stats verbatim** — `attack`, `defense`, `hp`,
`damageMin`, `damageMax`, `speed`, `abilities` — so the battle math reads off the
source numbers directly. A fresh stack starts at full strength:

```
hpTop = maxHpPer = creature.hp
count = startCount = <count>          // startCount caps Vampire life-drain resurrect
rank  = rankForCreature(creature)     // Shooter/Ranged/Caster → "back", else "front"
```

`opts.side` ('player'|'enemy') and `opts.idSuffix` keep stack ids unique across the
army and the enemy roster.

**Design note — rank:** only `Ranged`/`Shooter`/`Caster` go to the back. Flyers
stay in the front in v1 (flying-reach-back is OFF — see COMBAT.md §5), so a Vampire
fights from the front despite its `Flying` tag.

---

## 2. `adaptEquipment(artifact) → Equipment`

Parses the human-readable `bonuses` string into machine-readable mechanics:

```
primaryDeltas: Partial<Record<'attack'|'defense'|'power'|'knowledge', number>>
effects:       EquipmentEffect[]   // hpPerCreature | speedAll | manaMax | necromancyBonus | none
```

`parseBonuses` rules (all documented, all best-effort, tested in `adapter.test.ts`):

| `bonuses` text | → result |
|---|---|
| `"+2 Attack"` (Centaur's Axe) | `primaryDeltas { attack: 2 }` |
| `"+1 Attack, +1 Defense"` (Quiet Eye) | `{ attack: 1, defense: 1 }` |
| `"+3 to all primary skills"` (Dragon Wing Tabard) | `{ attack:3, defense:3, power:3, knowledge:3 }` |
| `"+12 Attack, +12 Defense, +500 spell points"` (Sword of Judgement) | deltas **+** `manaMax 500` |
| `"+1 Health point per creature"` (Ring of Vitality) | effect `hpPerCreature 1` |
| `"+1 Speed to all creatures..."` (Necklace of Swiftness) | effect `speedAll 1` |
| contains `"Necromancy"` (Cloak of the Undead King) | effect `necromancyBonus 0.15` |

`rarityForArtifactClass`: Treasure→common, Minor→uncommon, Major→rare, Relic→rare.

**Hooked into the engine:** `recomputeHero` re-derives the hero's primaries +
`maxMana` from `baseAttack/…` + the equipped artifacts' `primaryDeltas`/`manaMax`,
then clamps current mana. `equipmentNecroBonus` sums `necromancyBonus` for §7 of
COMBAT.md. (`hpPerCreature`/`speedAll` are parsed and surfaced but not yet applied
in combat — a documented v1 gap.)

---

## 3. `adaptSpell(spell) → CombatSpell`

The schema gives only `school/level/manaCost/isCombat/effectTags/description`. The
adapter classifies the spell from its tags into a mechanical `SpellEffect` with a
`target` and a `base + powerScale*power` magnitude.

```
kindFromTags:   damage | heal(resurrect) | disable | buff | debuff
targeting:      enemyStack | allyStack | allEnemies | self | none
magnitude:      effect.base + effect.powerScale * hero.power      (resolved at cast)
```

Examples (tested):
- **Magic Arrow** (tags `damage,single-target`) → `damage`, `enemyStack`,
  base/scale from the level table.
- **Resurrection** (`heal,resurrect`) → `heal`, `allyStack`.
- **Haste** (`buff,speed`) → `buff` of `speed` onto `allyStack`.
- **Slow** (`debuff,speed`) → `debuff` of `speed` onto `enemyStack`.

The `powerScale` tables (`DAMAGE_BASE_BY_LEVEL`, `DAMAGE_SCALE_BY_LEVEL`, etc.) are
**greenfield design** and the biggest spell lever — see COMBAT.md §10. v1 resolves
area/chain/all-units as single-target (no hex geometry).

---

## 4. `deriveHero(sourceHero, { creatures, spells }) → { hero, startingArmy }`

Builds the runtime `Hero` (which has **no hp**) and a sensible starting army.

```
classBaseStats:  Death Knight {A2,D2,P1,K1}   Necromancer {A1,D1,P2,K2}
specialtyBonus:  +1 to the primary the specialty implies
                 (Skeletons/creature specialties → +attack; Wisdom → +knowledge;
                  Sorcery/Meteor/Ripple → +power; Armorer → +defense)
maxMana       =  knowledge * MANA_PER_KNOWLEDGE (10)
skills        =  each startingSkill at rank 1 (Necromancy seeded for necro heroes)
spellbook     =  Magic Arrow + Bless + Haste (the starter book)
startingArmy  =  20 Skeletons + a stack of the specialty creature (or Walking Dead)
```

**Worked example — Galthran** (Death Knight, specialty *Skeletons*, skills
*[Necromancy, Offense]*): `{A: 2+1=3, D: 2, P: 1, K: 1}`, `maxMana = 10`,
`skills {Necromancy:1, Offense:1}`, spellbook includes Magic Arrow, starting army a
big Skeleton stack. Pinned in `adapter.test.ts`.

The deps (`creatures`, `spells`) are injected so the adapter stays content-agnostic;
`src/run.ts` supplies the `@mms/data` corpus.

---

## Exposed for the Codex / app to reuse

Adapters: `adaptStack`, `adaptEquipment`, `adaptSpell`, `deriveHero`,
`parseBonuses`, `rankForCreature`, `rarityForArtifactClass`, `MANA_PER_KNOWLEDGE`.

Content arrays + lookups: `CREATURES`, `ALL_CREATURES`, `BASE_CREATURES`,
`ARTIFACTS`, `HEROES`, `SPELLS`, `creatureById`, `spellById`, `artifactById`,
`heroById`, `upgradeFormOf`.
