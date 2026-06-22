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

# Castle + Stronghold expansion (Agent: factions)

Added the full **Castle** (good) and **Stronghold** (neutral) rosters from base
HoMM3 (Restoration of Erathia, **no expansion units**), matching the Necropolis
authoring pattern. Curated in two new files —
`scripts/lib/curated-castle.ts` and `scripts/lib/curated-stronghold.ts` — wired
into `scripts/build.ts`, validated against `@mms/schema`, and emitted to
`src/creatures.json` / `src/heroes.json` / `src/manifest.json`.

## Counts added

| Faction | Creatures (base+upgrade) | Heroes | Hero classes |
|---------|--------------------------|--------|--------------|
| Castle | 14 (7 tiers × base+upgrade) | 16 | Knight ×8, Cleric ×8 |
| Stronghold | 14 (7 tiers × base+upgrade) | 16 | Barbarian ×9, Battle Mage ×7 |
| **Added total** | **28 creatures** | **32 heroes** | |

Dataset totals after this work: **42 creatures** (Necropolis 14 + Castle 14 +
Stronghold 14), **46 heroes** (Necropolis 14 + Castle 16 + Stronghold 16), 27
spells, 17 artifacts (the latter two untouched — owned by a concurrent stream),
**132 manifest entries**.

### Castle creatures (tiers 1–7)
Pikeman/Halberdier, Archer/Marksman ("Shoots twice"), Griffin ("Two
retaliations")/Royal Griffin ("Unlimited retaliation"), Swordsman/Crusader
("Attacks twice"), Monk/Zealot (both "Ranged"), Cavalier/Champion ("Jousting"),
Angel/Archangel ("Flying", "Hates Devils"; Archangel "Resurrects allies").

### Stronghold creatures (tiers 1–7)
Goblin/Hobgoblin, Wolf Rider/Wolf Raider ("Attacks twice"), Orc/Orc Chief (both
"Ranged"), Ogre/Ogre Mage ("Casts Bloodlust"), Roc/Thunderbird ("Lightning
strike"), Cyclops/Cyclops King (both "Ranged"), Behemoth/Ancient Behemoth (both
"Reduces enemy defense").

## Stats source & confidence

All `attack / defense / hp / damageMin / damageMax / speed / growth` values are
the canonical RoE base-game stats from HoMM3 domain knowledge (the same values
thelazy renders on the creature cards). These were authored from knowledge, NOT
re-scraped this run (the live creature scraper targets Necropolis page wiring);
they are high-confidence standard base-game numbers. **Abilities** use the
existing canonical vocabulary where one exists ("Flying", "Ranged", "Attacks
twice", "Jousting", "Unlimited retaliation", "Reduces enemy defense") and
descriptive verbatim strings otherwise ("Casts Bloodlust", "Lightning strike",
"Hates Devils", "Resurrects allies", "Two retaliations", "No melee penalty",
"Attacks adjacent walls", "+1 morale to all allies").

### Heroes — names & specialties
Real RoE hero names and specialties per class. Castle Knights include Sir
Mullich (Speed), Tyris/Sorsha/Roland (Swordsmen), Christian (Ballista),
Catherine (Crusaders), Valeska (Archers), Lord Haart (Estates); Clerics include
Rion (First Aid), Adela (Bless), Loynis (Prayer), Caitlin (Intelligence),
Adelaide (Frost Ring), Ingham (Monks), Cuthbert (Armorer), Sephinroth (Crystal).
Stronghold Barbarians include Crag Hack (Offense), Gurnisson (Ballista), Yog
(Cyclopes), Krellion (Behemoths), Jabarkas (Orcs), Shakti (Ogres), Saurug
(Rocs), Gretchin (Pathfinding), Tyraxor (Goblins); Battle Mages include Gird,
Vey, Dessa (Logistics), Terek (Haste), Zubin (Magic Arrow), Gundula, Oris (Eagle
Eye). `startingSkills` are the two secondaries each hero begins with.

ID-collision notes: Lord Haart exists as both a Castle Knight and a Necropolis
Death Knight, so the Castle record uses `hero_lord_haart_knight`. Tyraxor is a
Stronghold Barbarian (`hero_tyraxor_stronghold`); an earlier draft mistakenly
also placed him in Castle — that fabricated Castle entry was removed.

## Images — 132/132 REAL, 0 placeholders

Ran the existing `pnpm images` pipeline against live `heroes.thelazy.net` (HTTP
200 this run). All 28 new creature sprites + 32 new hero portraits downloaded as
real artwork; combined with the existing 72 Necropolis refs that is **132/132
real, 0 placeholders** (`src/placeholders.json` is `[]`). Manifest `width`/
`height` are read back from the real files (creatures 100×130, heroes 58×64).

Pipeline fixes made so the run is reproducible (not one-off manual patches):
- **`Orc Chief` had no standalone wiki page** (`/index.php/Orc%20Chief` → 404);
  its art lives on the combined **Orc** page. Added a `CREATURE_PAGE_OVERRIDE`
  in `build.ts` so the manifest `sourceUrl` for `stronghold_orc_chief` points at
  the Orc page, an `IMAGE_NAME_ALIASES` entry (`Orc Chief` → `Orc Chieftain`,
  the wiki file-name spelling) in `parse.ts`, and made `images.ts:describe()`
  derive a creature's sprite-match name from its `ref` rather than the page
  title (the page title is wrong for combined-page upgrades).
- **Base-game art preference:** the creature image matcher now drops expansion
  variants (`(HotA)`/`%28HotA%29`, `(HD)`) when a plain RoE/SoD sprite exists, so
  base-game art is selected (this also corrected the Orc base sprite, which had
  been resolving to the HotA variant).

## Safety / scope

- Touched ONLY `creatures.json`, `heroes.json`, `manifest.json`, `REPORT.md`,
  `assets/images/**`, plus the build/parse/image **scripts** and two new curated
  TS files. **`spells.json` and `artifacts.json` are byte-for-byte unchanged**
  (a concurrent agent owns them). To guarantee this, `build.ts` no longer
  re-emits `spells.json`/`artifacts.json` — it still pulls their `imageRef`s into
  the manifest from the curated arrays, but writes only creatures/heroes/manifest.
- Necropolis data is unchanged (all 14 creatures, 14 heroes, their stats and the
  `fixtureCreature` Skeleton match).

## Flagged for human review (Castle + Stronghold)

1. **Stats authored from knowledge, not live-scraped.** Unlike Necropolis (which
   was reconciled against a live scrape), the 28 new creatures' numbers are
   standard RoE base-game values written from domain knowledge. High confidence,
   but a live scrape of the Castle/Stronghold creature pages would be the
   belt-and-suspenders follow-up to make them as authoritative as Necropolis.
2. **Ability strings are partly free-text.** Effects without an existing
   canonical token (e.g. "Casts Bloodlust", "Lightning strike", "Two
   retaliations") are descriptive verbatim strings; the downstream adapter may
   want to normalise these into a shared vocabulary.
3. **`hero_lord_haart_knight` id suffix** disambiguates the Castle Knight from a
   possible future Necropolis "Lord Haart" Death Knight (same person, two
   classes across the campaign).
