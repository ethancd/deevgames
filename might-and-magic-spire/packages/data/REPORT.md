# @mms/data — Reconciliation Report (v0)

Agent 1 (Researcher). Branch `worktree-agent-a1717609aa3572193`, rebased onto
the Phase 0 schema contract (`claude/mms-orchestrator-phase-0-60vsr7`).

## Path taken: CURATED (scrape blocked by egress policy)

Outbound network in this build environment is restricted by an allowlist.
`heroes.thelazy.net`, `mightandmagic.fandom.com`, and even `example.com` all
return HTTP 403 — "Host not in allowlist". External scraping is impossible here.

Per the brief, both paths were delivered:

1. Scrape pipeline built as code (runs, fails politely, never crashes):
   - `scripts/lib/http.ts` — cache-first fetcher: caches raw HTML to `.cache/`
     (gitignored) before parsing, re-parses from cache on re-runs, throttles
     live requests (1.5s), sends a descriptive User-Agent.
   - `scripts/lib/parse.ts` — cheerio parser for thelazy infobox stat tables.
   - `scripts/scrape.ts` — orchestrator: fetch -> cache -> parse ->
     `SourceCreature.parse()` -> write `src/creatures.scraped.json` (a separate
     file, never overwriting curated data — promotion is a human review step).
     Today it reports "0 validated, 14 dropped (HTTP 403)" and exits cleanly.
   - `scripts/images.ts` — image pass: download -> dedupe (content hash) ->
     normalize to <=100x130 WebP; on download failure, writes a deterministic
     solid-color placeholder so every ref still resolves.

2. Curated Necropolis v0 dataset, hand-authored from HoMM3: Shadow of Death
   stat tables, validated clean against `@mms/schema`. Source of truth until the
   scrape hosts are reachable.

When the hosts become reachable: `pnpm --filter @mms/data scrape`, then diff
`src/creatures.scraped.json` against `src/creatures.json` and reconcile.

## Record counts (validated, written)

| Type      | Written | Dropped | Expected (Necropolis v0)             |
|-----------|---------|---------|--------------------------------------|
| Creatures | 14      | 0       | 14 (7 base + 7 upgrade, tiers 1-7)   |
| Heroes    | 14      | 0       | ~16 total (Necro/Death Knight)       |
| Spells    | 27      | 0       | "solid spread" — combat, all schools |
| Artifacts | 17      | 0       | spread across all 4 classes          |
| Manifest  | 72      | —       | one per distinct imageRef            |

Necropolis-only is intentionally far fewer than the full game (~150 creatures /
~70 spells / ~140 artifacts / ~150 heroes). Breadth (other factions) deferred.

### Creatures — full Necropolis roster, upgrade arrows populated

All 7 tiers, base + upgrade, `upgradeOf` set on every upgrade and `null` on
every base:

| Tier | Base         | Upgrade (upgradeOf -> base) |
|------|--------------|-----------------------------|
| 1    | Skeleton     | Skeleton Warrior            |
| 2    | Walking Dead | Zombie                      |
| 3    | Wight        | Wraith                      |
| 4    | Vampire      | Vampire Lord                |
| 5    | Lich         | Power Lich                  |
| 6    | Black Knight | Dread Knight                |
| 7    | Bone Dragon  | Ghost Dragon                |

### Heroes

8 Death Knights (might) + 6 Necromancers (magic). Each carries its HoMM3
`specialty` (becomes the signature relic downstream) and two starting skills.
Galthran matches the canonical fixture exactly.

### Spells

27 combat spells spanning all four schools (Air/Earth/Fire/Water) and one
universal (All: Magic Arrow, matching the fixture), levels 1-5. Includes the
Necropolis-flavoured set (Death Ripple, Animate Dead, Curse) plus the universal
damage/buff/debuff spread.

### Artifacts

17 artifacts across all four classes: Treasure (5), Minor (4), Major (4),
Relic (4). Slots vary (Head/Neck/Torso/RightHand/LeftHand/Ring/Misc). Includes
the Necropolis signature relic Cloak of the Undead King. Centaur's Axe matches
the fixture id/name (class caveat below).

## Dropped records

None. Every authored record passed `Source*.parse()` and was written.

## Flagged for human review

1. Images are placeholders. All 72 `assets/images/*.webp` are deterministic
   solid-colour 100x130 WebPs (color seeded from the ref), generated because the
   real images could not be downloaded (egress block). Refs listed in
   `src/placeholders.json`. Replace by running `pnpm images` once the hosts are
   reachable — the pipeline will fetch, normalize, and overwrite, then rewrite
   `manifest.json` width/height from the real files. Each manifest `sourceUrl`
   is the thelazy page (not a direct image URL); when wiring real downloads,
   point `images.ts` at the parsed portrait URL (`parseCreatureImageUrl`).

2. Centaur's Axe class. The schema fixture says `class: "Minor"`. In HoMM3 SoD,
   Centaur's Axe is a Treasure artifact. The curated dataset uses Treasure (the
   accurate value). If the fixture's Minor is intentional, reconcile — surfaced
   rather than silently changed.

3. Creature stats are SoD values from memory, not scraped. Cross-check against
   thelazy when reachable. Highest confidence: Skeleton, Vampire Lord, Bone/Ghost
   Dragon. Lower confidence (verify damage/HP): Wight/Wraith HP, Lich/Power Lich
   shot counts.

4. Hero starting skills are typical SoD loadouts; verify a few magic heroes'
   second skill (Septienna->Scholar, Sandro->Sorcery) against the hero table.
   Necromancy is listed for all Necropolis heroes (town innate); confirm whether
   the downstream adapter wants it de-duplicated.

5. Spell mana costs are base (un-skilled) costs. If the adapter needs per-skill
   costs, that is a schema-level addition (route through the orchestrator); the
   current schema has a single `manaCost`.

## How to reproduce

```
pnpm --filter @mms/data build:data   # validate curated -> src/*.json
pnpm --filter @mms/data images        # image pass -> assets/images + manifest
pnpm --filter @mms/data test          # 19 tests: validation + ref resolution
pnpm --filter @mms/data scrape        # live pipeline (403 until egress opens)
```

## Done-when checklist

- [x] `pnpm --filter @mms/data test` green (19/19)
- [x] Every imageRef resolves to a manifest entry (asserted at module load AND in tests)
- [x] Every manifest localPath file exists on disk (asserted in tests)
- [x] index.ts re-validates all JSON against the schema at import, throws on failure
- [x] Scrape pipeline present (fetch->cache->parse->validate) and image pass present
- [x] REPORT.md shows what is complete and what is thin
