# Might & Magic: Spire

A roguelite deckbuilder that files the serial numbers off HoMM3. Necropolis
first: start a run, fight through an act map, draft cards and relics, reach the
boss — by touch, on a phone.

## The spine

The **data contract is the keystone**, not an output. It is built first, in
fixtures, so all four agents can run wide against it while the scrape is still
grinding. Two contracts, deliberately split:

- **`packages/schema`** — the *content* contract. `Source*` records + `CardDef`
  + the image manifest. The researcher produces it; everyone consumes it.
- **`packages/engine` public types** — the *runtime* contract. `RunState`,
  `Enemy`, `Intent`, `CombatState`. The mechanics agent produces it; the
  frontend consumes it.

The researcher never learns how a Pikeman becomes fun; the frontend imports
runtime types from the engine, not from the data layer. The seam between them
is the `Source → Card` adapter, owned by mechanics alone.

## Layout

```
might-and-magic-spire/
├── packages/
│   ├── schema/   # The keystone. Zod schemas + inferred types + fixtures.
│   ├── data/     # Researcher output: validated JSON at scale.
│   ├── engine/   # Mechanics. Headless, pure, seeded-RNG. No React.
│   └── app/      # Infra + frontend. Vite + React + TS PWA.
├── assets/images/  # Researcher's WebP + manifest.
└── package.json    # pnpm workspaces: ["packages/*"]
```

## The coordination primitive

`packages/schema/src/fixtures.ts` holds **one canonical instance of each**
record — Skeleton creature, Magic Arrow spell, Centaur's Axe artifact, Galthran
hero, the Skeleton's adapted card, and its manifest entry. Every agent imports
these. Four agents can't drift if they share one source of truth.
`fixtures.test.ts` proves the fixtures validate against the schema — if a schema
and its fixture ever drift, that test fails.

## Phases

- **Phase 0 (done):** schema contract + fixtures + monorepo scaffold. ← you are here
- **Fan-out:** four agents in git worktrees, one branch each
  (`agent/researcher`, `agent/infra`, `agent/mechanics`, `agent/frontend`),
  building wide against the fixtures. See each package README for its brief.
- **Integration:** merge the four branches, run the engine suite against **real**
  `packages/data` (not fixtures), reconcile real WebP dimensions against fixture
  sizes, play one full run end to end.

## Guardrails

- **Schema drift** — route every schema change through the orchestrator; version
  `packages/schema`, broadcast changes. No agent quietly adds a field.
- **Scrape fragility** — the raw-HTML cache + `REPORT.md` turn silent data loss
  into a visible, flagged gap.
- **Adapter-as-hidden-design** — `packages/engine/ADAPTER.md` surfaces the
  balance calls for review instead of letting the engine decide fun by itself.
- **Mock divergence** — the single canonical fixture everyone imports is the
  antidote.

## Dev

```bash
pnpm install
pnpm -r test        # currently: the schema contract suite
pnpm -r typecheck
```
