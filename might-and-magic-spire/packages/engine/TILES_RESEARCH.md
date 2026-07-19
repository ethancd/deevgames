# TILES_RESEARCH — HoMM3 adventure-map objects as roguelite tile-bonus nodes

Catalog of HoMM3 adventure-map objects that grant a permanent or visit-based bonus
to the hero/army, tier-ranked for use as small "tile bonus" nodes in
**Might & Magic: Spire** (a HoMM3-derived roguelite deckbuilder, DAG map, one node = one day).

## How tiers were assigned

Two axes, blended into a single S/A/B/C/D tier:

- **Effectiveness** — does it make a *felt-but-trivial* permanent bonus per node?
  A small persistent power gain is ideal; one-shot consumables and game-warping
  jumps are worse.
- **Mechanical fit** — does it map cleanly onto an EXISTING system?
  The engine has: hero primaries **attack / defense / power / knowledge**
  (`Hero` in `types.ts`), **maxMana = knowledge×10**, army-wide **luck / morale / speed**
  (`Army.luck/morale`), **gold** (`RunState.gold`), **creature stacks**
  (recruit / upgrade / raise via `RewardChoice`), **necromancy**, spellbook learning,
  and the incoming **XP/leveling** + **day/week calendar**.
  It has **NO** movement points, **NO** map vision/fog, **NO** ships/water economy,
  **NO** town building, **NO** non-gold resources (wood/ore/gems/etc.).
  Objects that need those subsystems are rejected.

Tier rubric:
- **S** — perfect fit + meaningful permanent bonus to a core primary/level. The backbone of the tile system.
- **A** — clean fit, slightly narrower or weaker, or a strong economy/growth node.
- **B** — fits, but either consumable-flavored (refits to "until next battle" → "this battle") or modest.
- **C** — usable with light reskinning, weak or redundant payoff.
- **D** — marginal; keep only for flavor variety.
- **Rejected** — needs a subsystem this game lacks.

Sources cross-checked: heroes.thelazy.net, mightandmagic.fandom.com,
homm.fandom.com (HotA effects), homm.miraheze.org.

---

## Summary table

| Object | HoMM3 effect | One-time? | Maps to | Tier | Roguelite adaptation |
|---|---|---|---|---|---|
| **Mercenary Camp** | +1 hero Attack, first visit | One-time/hero | attack | **S** | +1 permanent hero Attack |
| **Marletto Tower** | +1 hero Defense, first visit | One-time/hero | defense | **S** | +1 permanent hero Defense |
| **Star Axis** | +1 hero Power (spell power), first visit | One-time/hero | power | **S** | +1 permanent hero Power |
| **Garden of Revelation** | +1 hero Knowledge, first visit | One-time/hero | knowledge (→ +10 maxMana) | **S** | +1 permanent hero Knowledge (+10 maxMana) |
| **Tree of Knowledge** | +1 hero level (cost: 2000g OR 10 gems OR free, random per tree) | One-time/hero | XP/level | **S** | +1 hero level (free, or gold-gated variant) |
| **Learning Stone** | +1000 experience, first visit | One-time/hero | XP | **S** | fixed XP grant (~one level's worth, scaled) |
| **Arena** | choose +2 Attack OR +2 Defense, once | One-time/hero | attack/defense | **S** | choose +2 Attack or +2 Defense |
| **Colosseum of the Magi / School of Magic** | choose +2 Power OR +2 Knowledge, once | One-time/hero | power/knowledge | **A** | choose +2 Power or +2 Knowledge |
| **Library of Enlightenment** | +2 to ALL four primaries (requires hero level ≥10) | One-time/hero | all 4 primaries | **A** | +2 to all primaries; gate behind a level/act milestone |
| **Witch Hut** | teaches one random secondary skill (basic) | One-time/hero | skills (Offense/Armorer/…) | **A** | learn/raise one random hero skill |
| **Scholar** | teaches a spell, a secondary skill, OR a primary point | One-time/hero | spell/skill/primary | **A** | small "learn" node: pick spell, skill, or +1 primary |
| **Pyramid** | learn one L5 spell after a guarded fight (needs Expert Wisdom) | One-time/hero | spellbook | **A** | guarded node → learn a high-tier spell |
| **Magic Spring / Mana Vortex** | doubles maxMana + refill, once per week | Repeatable (weekly) | mana / maxMana | **A** | full mana refill + small permanent +maxMana (weekly-gated) |
| **Hill Fort** | upgrade any non-upgraded creatures, cheap | Repeatable | stack upgrade (Altar) | **A** | discounted stack upgrade node |
| **Refugee Camp** | recruit a small # of random (incl. neutral) creatures; changes weekly | Repeatable (weekly) | recruit (Dwelling) | **A** | recruit a random stack (off-faction allowed) |
| **Idol of Fortune** | +1 morale (even days) / +1 luck (odd days) / +1 both (day 7) | Repeatable (visit) | luck/morale | **B** | +1 luck or +1 morale for next battle (calendar-flavored) |
| **Temple** | +1 morale next battle (+2 on day 7) | Repeatable (visit) | morale | **B** | +morale buff for next battle (rest-adjacent) |
| **Faerie Ring / Mermaids** | +1 luck next battle | Repeatable (visit) | luck | **B** | +luck buff for next battle |
| **Oasis / Buoy / Watering Hole** | +1 morale next battle (+movement, ignored) | Repeatable (visit) | morale | **B** | +morale buff for next battle |
| **Fountain of Fortune** | random −1..+3 luck until next battle | Repeatable | luck | **B** | gamble node: random luck for next battle |
| **Magic Well** | restore 100% mana, once per day | Repeatable (daily) | mana | **B** | full mana refill node (no permanent gain) |
| **Treasure Chest** | choose gold (1000/1500/2000) OR exp (500/1000/1500); 5% artifact | One-time | gold / XP | **B** | choose gold or XP (small artifact chance) |
| **Pandora's Box** | scripted payload: gold/exp/creatures/spell, often guarded | One-time | gold/XP/creatures/spell | **B** | designer-set reward chest behind a fight |
| **Campfire** | 400–600 gold + 4–6 other resources | One-time | gold (drop resources) | **C** | small gold pile |
| **Gazebo** | +2000 exp for 1000 gold | One-time/hero | XP (gold cost) | **C** | buy XP for gold |
| **Warrior's Tomb / Grave / Crypt** | random artifact + gold, but −3 morale | One-time | artifact/gold w/ morale risk | **C** | loot node: artifact/gold but morale penalty next battle |
| **Corpse / Wagon / Sea Chest / Shipwreck Survivor / Flotsam** | small chance of artifact / minor gold | One-time | gold/artifact (tiny) | **C/D** | minor gold or artifact scrap pickup |
| **Hermit's Shack** | improves a random secondary skill | Repeatable | skills | **C** | raise a random skill (redundant with Witch Hut) |
| **Mystical Garden / Derrick / Windmill / Waterwheel** | weekly gold (or gems) | Repeatable (weekly) | gold | **C** | passive weekly gold (calendar tie-in) |
| **Altar of Mana** | sacrifice creatures → mana (up to 4× cap) | Repeatable | mana (creature cost) | **D** | sacrifice a stack for mana |
| **Sanctuary** | hero can't be attacked while resident | n/a | (no PvP map) | **Rejected** | — |
| **Stables** | +movement; auto-upgrades Cavalier→Champion | Repeatable | movement points | **Rejected** | (movement) — keep only the free-upgrade idea, folds into Hill Fort |
| **Redwood Observatory / Cover of Darkness / Pillar of Fire / Observation Tower** | reveal/hide map tiles | — | map vision/fog | **Rejected** | — |
| **Cartographer** | reveal whole map for 10000 gold | One-time | map vision/fog | **Rejected** | — |
| **Obelisk** | reveals a piece of the Grail puzzle map | One-time | map vision / Grail | **Rejected** | — |
| **Lighthouse** | +water movement for allied heroes when flagged | Passive | water movement | **Rejected** | — |
| **Jetsam / Lean To / resource piles (wood/ore/gem/etc.)** | grants non-gold resources | One-time | resource economy | **Rejected** | (no non-gold resources) — reskin to gold if used |

---

## Per-tier notes

### S tier — the backbone of the tile system

These are the "Marletto Tower = +1 Defense" archetype: a clean one-time permanent
bump to a core stat the engine already tracks. They are the canonical small permanent
node and should be the most common bonus-tile family.

- **Mercenary Camp → +1 Attack**, **Marletto Tower → +1 Defense**,
  **Star Axis → +1 Power**, **Garden of Revelation → +1 Knowledge**.
  One node each, +1 to the matching primary. In HoMM3 each is once-per-hero/first-visit;
  here every visit is a fresh tile so "one-time" is automatic. Knowledge is doubly nice
  because it also lifts `maxMana` (+10 per point) for free via the existing
  `maxMana = knowledge×10` rule. Suggest a shared "Obelisk of <stat>" tile family of four.
- **Tree of Knowledge → +1 hero level.** Maps perfectly onto the incoming XP/leveling.
  In HoMM3 it grants exactly the exp needed for the next level and (per-tree, rolled at
  map gen) is free, costs 2000 gold, or costs 10 gems. Adapt as a free +1 level node,
  optionally a gold-gated variant ("pay 2000g for a level") for economy tension.
- **Learning Stone → fixed XP grant (~1000, scale to your curve).** Smaller, always-free
  XP. Pairs with Tree of Knowledge as the "minor" XP tile.
- **Arena → choose +2 Attack OR +2 Defense.** A meatier S pick because it's a *choice*
  node (more interesting than a flat +1) and doubles the magnitude. Great for an
  occasional "stat shrine" with a decision.

### A tier — clean fits, slightly narrower or growth-flavored

- **Colosseum of the Magi / School of Magic → choose +2 Power OR +2 Knowledge.**
  The caster counterpart to Arena. A because magic primaries matter less to a melee army
  build, but a perfect mechanical fit and a nice build-defining choice.
- **Library of Enlightenment → +2 to ALL four primaries.** Powerful, so keep HoMM3's
  level gate: require hero level ≥ N (or "Act 2+") so it's a mid/late reward, not an
  early snowball. Excellent capstone tile.
- **Witch Hut → learn/raise one random hero skill** (Offense, Armorer, Necromancy, …).
  Direct map onto `Hero.skills`. Random is fine and on-theme; if a skill is maxed/owned,
  fall back to a small consolation (gold or +1 primary).
- **Scholar → flexible "learn" node**: offer a spell, a skill, or +1 primary (pick one).
  The most versatile teaching tile; good for a player-agency beat.
- **Pyramid → guarded high-tier spell.** A fight-gated node that, on win, teaches a strong
  spell into the spellbook. Maps onto Shrine-style learning but with risk. Drop the
  "needs Expert Wisdom or it's lost forever" rule — too punitive for a roguelite; just
  grant the spell.
- **Magic Spring / Mana Vortex → full mana refill + small permanent +maxMana.** The only
  clean *permanent mana* source. HoMM3 "doubles maxMana, weekly" is too swingy permanently;
  adapt as full refill now + a modest permanent +maxMana (e.g. +5 or +10), optionally
  weekly-gated via the calendar.
- **Hill Fort → discounted stack upgrade.** A cheaper Altar. Maps onto the existing
  `upgrade` reward. Folds in the Stables "free Cavalier→Champion" idea as flavor.
- **Refugee Camp → recruit a random stack** (faction-agnostic, incl. neutrals), refreshed
  weekly. Maps onto the `recruit` reward / Dwelling, but with a random/off-faction pool —
  a nice way to splash a unit you can't normally get.

### B tier — buffs and refills (refit "until next battle" → "next combat")

These are HoMM3 *temporary, pre-battle* buffs. They map onto the new army-wide luck/morale
and onto mana, but they're consumable, not permanent. Best used as cheap "rest-adjacent"
or pre-elite tiles. Refit HoMM3's "until next battle" to "your next combat."

- **Temple / Oasis / Buoy / Watering Hole → +morale next combat.** All collapse to one
  morale-buff tile. The day-7 "+2" rider is a natural calendar hook.
- **Faerie Ring / Mermaids → +luck next combat.** Same, for luck.
- **Idol of Fortune → +luck or +morale next combat** (which one keyed to even/odd day, +both
  on day 7). A single tile that flexes with the calendar — a good showcase of the day system.
- **Fountain of Fortune → random −1..+3 luck.** A gamble tile; keep the small downside risk
  for spice, or floor it at 0 if negative feels bad.
- **Magic Well → full mana refill** (no permanent gain). A pure utility breather tile.
- **Treasure Chest → choose gold OR XP.** The classic decision pickup; maps to gold+XP,
  both of which exist. Small artifact chance optional.
- **Pandora's Box → designer-set reward behind a fight.** Engine-flexible chest: gold, XP,
  a creature stack, or a spell, optionally guarded. Use sparingly as a scripted surprise.

### C tier — weak, redundant, or needs reskinning

- **Campfire → small gold pile.** HoMM3 gives gold + *other resources*; drop the resources
  (no non-gold economy) and it's just a minor gold node — fine as filler.
- **Gazebo → buy XP for gold.** Trades the gold economy for XP; works but bland.
- **Warrior's Tomb / Grave / Crypt → risky loot.** Artifact/gold but with a morale penalty
  (HoMM3 −3) carried into the next battle. Maps onto morale; a nice risk/reward beat but
  fiddly to communicate.
- **Corpse / Wagon / Sea Chest / Shipwreck Survivor / Flotsam → minor gold/artifact scraps.**
  Tiny one-shots; reskin the water/wreck ones to land. Mostly redundant with Campfire/Chest.
- **Hermit's Shack → raise a random skill.** Redundant with Witch Hut.
- **Mystical Garden / Derrick / Windmill / Waterwheel → passive weekly gold.** Maps onto gold
  + the weekly calendar; could be a "flagged" income tile but there's no flag/ownership system,
  so it'd grant once. Weak unless you add map ownership.

### D tier — marginal

- **Altar of Mana → sacrifice a stack for mana.** Mechanically fits (creatures→mana) but
  sacrificing your army for spell points is rarely worth it in a roguelite; keep only as a
  desperation/flavor node.

---

## Rejected (needs missing subsystem)

| Object | Why rejected |
|---|---|
| **Stables** | Core effect is +movement points — no movement economy. (Its free Cavalier→Champion upgrade is salvageable, but that's just Hill Fort.) |
| **Redwood Observatory, Cover of Darkness, Pillar of Fire, Observation Tower, Observatory** | Reveal/hide map tiles — no fog-of-war / map vision. |
| **Cartographer** | Reveals the whole map for gold — no fog-of-war. |
| **Obelisk** | Reveals Grail puzzle-map pieces — no Grail / no fog. |
| **Sanctuary** | "Hero can't be attacked while resident" — no enemy heroes roaming the map. |
| **Lighthouse** | +water movement when flagged — no water economy, no map flagging. |
| **Subterranean Gate / Monolith / Whirlpool / Boat / Shipyard** | Map teleport/water traversal — the DAG handles traversal; no overworld movement. |
| **Keymaster Tent / Border Guard / Quest Guard / Seer's Hut** | Gating/quest objects tied to overworld pathing and quest inventory — no map-gate system. |
| **Resource piles & generators (Wood/Ore/Mercury/Sulfur/Crystal/Gems), Sawmill, Ore Pit, mines, Lean To, Jetsam, Windmill (non-gold), Magic Garden non-gold rolls** | Grant non-gold resources — the economy is gold-only. (Reskin to gold if any are wanted.) |
| **Garrison / Town objects / Creature Banks (as town-building)** | Town building / persistent garrison defense — no town layer. (Note: Creature Banks could be reused as *guarded treasure fights* — see Pandora's Box.) |

### Notes on terrain native-morale (for completeness)

In HoMM3, fighting on your faction's *native terrain* gives +1 morale (e.g. Castle on
Grass, Necropolis on Dirt, Stronghold on Rough). There is no overworld terrain layer here,
but the idea is portable: a node could carry a "terrain" tag granting +1 morale if it
matches the run's faction — a cheap way to add map texture using the existing morale stat.
Treat as optional flavor, not a core tile.
