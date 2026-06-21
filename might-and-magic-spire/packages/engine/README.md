# @mms/engine — Mechanics (army model)

The headless game engine. A pure library — **no React, no DOM**. This is the game.

The combat model is **HoMM3 with one hero and no town**: a hero with primary
stats (Attack/Defense/Power/Knowledge), a paper-doll of artifacts and a spellbook,
commanding an **army of creature stacks** that carry between battles with attrition
(the "rolling army ball"). The army is the player's life — empty army = you lose.

> The Slay-the-Spire deckbuilder model (cards/energy/hand, `Enemy.intent`, the
> `Source → Card` adapter, and the `adapt(creature)===card` invariant) has been
> **retired**. See `ADAPTER.md`.

## What you own

- **Seeded RNG** (`rng.ts`, verbatim) — every run reproducible from a seed.
- **Act-map graph** (`map.ts`) — node types: combat / elite / boss / **dwelling /
  altar / shrine / merchant** / rest.
- **Battle resolution** (`battle.ts`) — two-rank reach, the A/D damage curve, the
  kill/chip pool model, retaliation, life-drain, the deterministic enemy planner.
- **Run state machine** (`run.ts`) — the side-alternation turn loop, Necromancy,
  node interactions (recruit/upgrade/learn/buy/equip), rewards.
- **Source → runtime adapters** (`adapter.ts`) — `adaptStack`, `adaptEquipment`,
  `adaptSpell`, `deriveHero`. The design surface; documented in `ADAPTER.md`.

## The runtime contract

The frontend imports `RunState`, `Hero`, `Stack`, `Army`, `CombatState`,
`CombatSpell`, `Equipment`, `RewardChoice`, … from `src/index.ts` — **not** from
`@mms/schema`. The engine's `RunState`/`CombatState` may be a structural superset
of the app contract (extra internal fields); the app seam casts.

## Balance is design, not engineering

Every formula and constant is a named lever in **`COMBAT.md`** (A/D curve, defend
bonus, retaliation, reach, necromancy table + caps, life-drain cap, economy,
encounter scaling, `ARMY_CAP`, starting army) and **`ADAPTER.md`** (the four
adapters). Ethan vetoes balance by editing the constant.

## Verify

`pnpm --filter @mms/engine typecheck` and `pnpm --filter @mms/engine test` are
green. A full run resolves headless from a seed (map → army battles → boss →
won/lost), byte-identical for the same seed. The `run.test.ts` sweep doubles as the
balance-tuning harness (win-rate over many seeds).
