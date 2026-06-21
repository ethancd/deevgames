# @mms/engine — Mechanics (Agent 3)

Owner: **Mechanics**. Branch: `agent/mechanics`.

The headless engine. A pure library — **no React, no DOM**. This is the game.

## You own

- **Seeded RNG.** Every run reproducible from a seed. Non-negotiable.
- **Run state + act-map graph generator** (combat / elite / event / shop / rest / boss).
- **Combat resolution** — turn structure, energy, block, the effect system from
  `CardDef.effects`.
- **Card / relic / intent systems.** Relics come from Artifacts (rarity from
  `ArtifactClass`) and hero specialties (the signature relic). Intents telegraph;
  the AI is a lookup table, not a planner.
- **The `Source → Card` adapter** — the seam where HoMM stats become card numbers.

## The runtime contract

Export `RunState`, `Enemy`, `Intent`, `CombatState` as your public API from
`src/index.ts`. **The frontend imports these from you, not from `@mms/schema`.**

## The adapter is design, not engineering

Surface it. Emit your stat→fun mapping as a readable table in
`packages/engine/ADAPTER.md`: how attack/damage/hp/tier/growth map to cost,
magnitude, and rarity. Ethan vetoes balance; don't auto-decide it silently. The
`fixtureCard` in `@mms/schema` is the agreed output shape for the Skeleton —
match it.

## Build against fixtures, test everything

Unit tests on combat math, the graph generator, and the adapter. Zero frontend
dependency. Done when a full run resolves headless from a seed (map → combats →
elite → boss), the suite is green, and `ADAPTER.md` lays out the balance calls.
