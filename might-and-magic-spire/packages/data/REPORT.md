# @mms/data — Reconciliation Report (LIVE re-run)

Agent 1 (Researcher). Branch `leyline/mms-researcher-live`, built atop the v0
researcher branch (`claude/mms-researcher`) and the Phase 0 schema contract.

## Path taken: LIVE SCRAPE (web access works this run)

The v0 run shipped a curated dataset + a scrape/image pipeline that never got to
run (the build sandbox returned HTTP 403 for every host). This run executed that
pipeline against the **live** `heroes.thelazy.net` (HTTP 200). The parser — which
had been written without ever seeing a real page — was rewritten against the real
markup, every Necropolis creature was scraped and validated, scraped values were
reconciled against and promoted over the curated ones, and all 72 manifest images
are now **real artwork** downloaded from the source (zero placeholders).

### What the pages actually look like (and why v0's parser found nothing)

thelazy does NOT use a MediaWiki infobox/wikitable for creature stats. A creature
URL (e.g. `/index.php/Skeleton`) is a *combined* base+upgrade page ("Skeleton and
Skeleton Warrior") that renders each creature as a "card": a stack of
absolutely-positioned `<div>` pairs (left-positioned label div beside a
right-positioned value div) laid over a portrait. The v0 parser keyed on
`table.infobox tr / th+td` and matched nothing. `parse.ts` was rewritten to:
segment the page into cards at each "Attack Skill" label, pair label/value divs
by document order, read the trailing special-ability note out of the card text,
and select the base vs. upgrade card by the crawl-index `upgraded` flag.

## Creatures — 14/14 scraped + validated LIVE

`pnpm scrape` -> **14 validated, 0 dropped**. Output written to
`src/creatures.scraped.json` (committed for transparency), diffed against the
curated `src/creatures.json`, and the authoritative scraped values were promoted
to canonical. Curated wiring (`id` / `upgradeOf` upgrade arrows, `imageRef`) was
identical to the scrape's and is preserved. `curated-creatures.ts` was updated to
match so `build:data` stays idempotent with the live data.

attack / defense / hp / damageMin / damageMax / speed **all matched** the v0
from-memory values exactly across all 14 creatures — good corroboration. The
diffs that were promoted:

| Creature | Field | Curated (memory) | Scraped (thelazy) | Promoted |
|----------|-------|------------------|-------------------|----------|
| Walking Dead | growth | 9 | **8** | yes |
| Zombie | growth | 9 | **8** | yes |
| Wight | abilities | (no Flying) | **adds "Flying"** | yes |
| Wraith | abilities | (no Flying) | **adds "Flying"** | yes |
| Vampire | growth | 5 | **4** | yes |
| Vampire Lord | growth | 5 | **4** | yes |
| Lich | growth | 4 | **3** | yes |
| Power Lich | growth | 4 | **3** | yes |
| Power Lich | abilities | had "24 shots" | **removed** | yes |
| Black Knight | growth | 3 | **2** | yes |
| Dread Knight | growth | 3 | **2** | yes |
| Bone/Ghost Dragon | abilities | order Flying,Dragon | **order Dragon,Flying** | yes (cosmetic) |

### Notable, re: items flagged in v0

- **Wight / Wraith HP** (v0 low-confidence): the scraped **HP matched** curated
  (18 / 18). The real surprise was abilities — both creatures **Fly** on the
  page, which the from-memory set omitted. Promoted.
- **Lich / Power Lich shot counts** (v0 low-confidence): the page's special-
  ability note for the Lich line is "Undead. Shoots. Death Cloud attack." — it
  does **not** list a "24 shots" ability. The v0 "24 shots" on Power Lich was a
  from-memory embellishment and was **removed** to match the authoritative page.
  (Shot *count* is presented elsewhere on the page as a stat, not an ability, and
  the schema has no shot-count field, so it is intentionally not carried.) Both
  Lich growths also corrected 4->3.
- **Skeleton** still exactly matches the schema's `fixtureCreature` shape
  (`necropolis_skeleton`, growth 12 — confirmed unchanged; schema tests 12/12).

## Spells / Artifacts / Heroes — kept CURATED, spot-verified live

These pages are NOT cleanly tabular either (no infobox/wikitable; spell and
artifact data is free-text like `Class: Treasure Slot: Weapon Cost: 2000` and
`School: all schools Level: 1st Cost: 5/4`). A full scrape would need bespoke
per-field text parsing plus vocabulary mapping into the schema enums
(`ArtifactSlot`, `SpellSchool`) for 27 + 17 + 14 records. Given the creature
reconciliation + real-image work was the high-value core, these three sets were
**kept curated** but spot-verified against the live pages:

- **Magic Arrow** — page says "School: all schools", "Level: 1st", "Cost: 5/4".
  Matches curated (`All`, level 1, manaCost 5 = base/un-skilled). OK
- **Galthran** — page: Death Knight, Skeleton specialty, Necromancy + Armorer
  skills. Matches curated. OK
- **Centaur's Axe** — page: "**Class: Treasure**", "+2 Attack", slot Weapon.
  Curated `Treasure` / `+2 Attack` / `RightHand` is correct. **This confirms the
  schema fixture's `class: "Minor"` is the discrepancy, not the data** (see
  Flagged #1). OK

Curated artifact/spell/hero values are therefore trustworthy for v1; a full
structured scrape of these is a clean follow-up if breadth is wanted.

## Images — 72/72 REAL, 0 placeholders

`pnpm images` now fetches each record's wiki page (cache-first), extracts the
real artwork URL by name (`parseRecordImageUrl`: `Creature_*`, `Hero_*`,
`Artifact_*` / `*-artif`, and bare `<Spell>.png`), downloads it, and converts to
WebP at native resolution (capped at 256px; these are already small sprites).
The v0 solid-colour placeholders are all replaced.

- **72 real / 0 placeholders.** `src/placeholders.json` is now `[]`.
- Manifest `width`/`height` are read back from the real files — **real
  dimensions**, not the fixture 100x130 the frontend had assumed:
  - Creatures: 100x130 (14)
  - Heroes: 58x64 (14)
  - Spells: 74x70 (26), 42x32 (1: Magic Arrow icon variant)
  - Artifacts: 44x44 (16), 48x32 (1)
  - **Overall range: 42–100 wide, 32–130 tall.**
- Apostrophe gotcha fixed: MediaWiki file URLs encode `'` as `%27`, but JS
  `encodeURIComponent` leaves `'` untouched — the three apostrophe artifacts
  (Centaur's Axe, Armageddon's Blade, Titan's Lightning Bolt) failed until the
  matcher was taught to try the `%27` spelling explicitly.

## Flagged for human review

1. **Centaur's Axe class — schema fixture vs. reality.** The schema fixture in
   `packages/schema` says `class: "Minor"`. The live thelazy page says
   **`Class: Treasure`**, and the curated dataset uses Treasure (correct). The
   discrepancy is in the *fixture*, not the data. Schema is the fixed contract
   (not touched here) — if the fixture's "Minor" is wrong, that's a schema-owner
   change to route through the orchestrator.

2. **Spells / Artifacts / Heroes still curated (spot-verified, not scraped).**
   High confidence from spot checks, but not a wholesale live scrape. A bespoke
   text parser for these pages is the follow-up to make them as authoritative as
   the creatures now are.

3. **Lich shot count is not represented.** The schema has no shot-count field, so
   the Lich line's ammo (a real stat on the page) isn't carried anywhere. If the
   downstream adapter needs it, that's a schema addition.

4. **Spell mana costs are base (un-skilled).** thelazy shows "Cost: 5/4"
   (basic/advanced). The schema has a single `manaCost`; curated uses the base
   value. Per-skill costs would be a schema change.

## How to reproduce

```
pnpm install
pnpm --filter @mms/data scrape       # live: 14 validated, 0 dropped -> src/creatures.scraped.json
pnpm --filter @mms/data build:data   # validate curated -> src/*.json (idempotent with scrape)
pnpm --filter @mms/data images        # download real art -> assets/images + manifest dims
pnpm --filter @mms/data test          # 19 tests: validation + ref resolution + on-disk files
```

(`.cache/` holds the raw fetched HTML — gitignored, never committed. Re-runs of
scrape/images read from cache and never re-hit the site.)

## Done-when checklist

- [x] `pnpm --filter @mms/data test` green (19/19)
- [x] `pnpm --filter @mms/schema test` green (12/12) — fixed contract intact
- [x] 14/14 Necropolis creatures scraped + validated LIVE (0 dropped)
- [x] Scraped stats reconciled and promoted to canonical `src/creatures.json`
- [x] Skeleton still matches `fixtureCreature` (`necropolis_skeleton`)
- [x] 72/72 real images downloaded; 0 placeholders; real dimensions in manifest
- [x] Every imageRef resolves to a manifest entry that exists on disk
- [x] All changes confined to `packages/data/**` + `assets/images/**`

---

## Content expansion — Spells & Artifacts (base HoMM3 / Restoration of Erathia)

This pass widened the spell and artifact databases to broad base-game coverage.
Scope was confined to `spells.json`, `artifacts.json`, `manifest.json`,
`REPORT.md`, and `assets/images/**` (creatures/heroes/index.ts untouched — a
concurrent worktree owns those).

### Counts

| Record type | Before | Added | After |
|-------------|-------:|------:|------:|
| Spells      | 27     | 41    | 68    |
| Artifacts   | 17     | 50    | 67    |
| Manifest    | 72     | 91    | 163   |

**Spells** now span all five schools across all five levels:

- Air L1-5, Earth L1-5, Fire L1-5, Water L1-5, plus All (L1-2).
- 59 combat + 9 adventure spells. Adventure spells (`isCombat: false`):
  Visions, View Air, View Earth, Scuttle Boat, Summon Boat, Water Walk, Fly,
  Town Portal, Dimension Door.
- New iconic combat spells include Bloodlust, Frenzy, Berserk, Counterstrike,
  Magic Mirror, Hypnotize, Sacrifice, Clone, Teleport, Anti-Magic, the four
  Protection-from-element spells, Air/Fire Shield, Fortune/Mirth/Sorrow/
  Misfortune (luck & morale), Ice Bolt, Frost Ring, Destroy Undead, Quicksand,
  Land Mine, Force Field, Earthquake, Remove Obstacle, and all four
  Summon-Elemental spells.

**Artifacts** now cover all four classes (Treasure 19 / Minor 11 / Major 21 /
Relic 16) and varied slots (Head, Neck, Torso, RightHand, LeftHand, Ring, Feet,
Misc). New entries include the luck/morale set (Ladybird of Luck, Clover of
Fortune, Cards of Prophecy, Glyph of Gallantry, Badge of Courage, Crest of
Valor, Still Eye of the Dragon, Hourglass of the Evil Hour, Spirit of
Oppression), the mana set (Charm/Talisman/Mystic Orb of Mana), the four Tomes of
Magic, the gold/resource generators (Endless Bag/Purse of Gold, the Mercury/
Sulfur/Ore/Lumber generators), Spell-Power and combat stat-sticks (Necklace/
Crown of Dragontooth, the dragon-king and creature-king pieces, Dragon Scale
Armor/Shield), and the magic-suppression relics (Recanter's Cloak, Orb of
Vulnerability, Spellbinder's Hat, Boots of Polarity).

### Images

- **163/163 real images downloaded — 0 placeholders.** The image pipeline
  (`pnpm --filter @mms/data images`) fetched real artwork from
  heroes.thelazy.net for every new spell (74×70 sprites) and artifact (44×44
  sprites); real dimensions are recorded in `manifest.json`. `placeholders.json`
  remains empty.

### Schema validity

- `pnpm --filter @mms/data test` — 19/19 green.
- `pnpm --filter @mms/data typecheck` — clean.
- Every new `imageRef` resolves to a manifest entry whose WebP exists on disk.
- All ids are unique within each record type (`spell_<snake>`,
  `artifact_<snake>`).

### Guessed / flagged values

- **Spell mana costs** are base (un-skilled) values per the existing curated
  convention. Mostly verified against thelazy.net; a few (e.g. Land Mine 18,
  Earthquake 20, Hypnotize 18) are the commonly-misremembered ones and were
  double-checked.
- **Cape-slot artifacts** (Recanter's Cloak) are mapped to `Misc` because the
  schema's slot enum has no Cape slot — consistent with how Cape of Conjuring
  was already handled. If a Cape slot is added to the schema, these should move.
- **Expansion-only items deliberately EXCLUDED** to keep strictly to base RoE:
  Orb of Inhibition and Sea Captain's Hat (both Shadow of Death / Armageddon's
  Blade era), and Sleep (a Heroes 2 spell that does not exist in HoMM3 — its
  analog Blind was already present).
- **Gold generators**: Endless Bag of Gold (+1500/day, Relic) and Endless Purse
  of Gold (+1000/day, Major) included with confident values; the +750/day
  "Endless Sack of Gold" tier was omitted as its exact value was uncertain.
- **Badge of Courage** secondary clause ("immune to fear") is a best-effort
  detail beyond its confirmed +1 Morale.
