# DeevGames Platform

Shared game-infrastructure kits factored out of nineteen games' worth of lessons (see `docs/game-design-dossier.md` at the repo root). Built as **new code only** — no existing game was modified; the games under `muju/`, `might-and-magic-spire/`, `lution/`, etc. served as read-only reference implementations.

This is a self-contained pnpm workspace: the repo root has no workspace config, so **all pnpm commands run from `platform/`**.

```bash
cd platform
pnpm install
pnpm -r typecheck
pnpm -r test
```

## The six kits

| Package | What it is | Factored from |
|---|---|---|
| **@deev/core** | Deterministic game substrate: the `GameDef` contract (`toAct`/`legal`/`apply`/`observe`/`score`/`isCommitPoint`), seeded **serializable** RNG, self-describing transcripts + replay convergence, versioned save envelopes with snapshot-on-write, commit-point-aware undo, identity-keyed idempotency | muju's pure `src/game` layer; MMS engine's seeded runs + `fork(label)`; Lution's serializable rng + M5 choice replay; napkin idempotency lessons |
| **@deev/lab** | Headless balance lab over any GameDef: view-typed `ScriptedBot` + async full-state `RawBot` (strict / as-shipped legality, illegal-emission counting), seeded series runner with series-level seat rotation, invariant-abort semantics, Wilson CIs, timestamp-free matchup & sweep reports, experiments, judgment-log template | `muju/lab/harness` — both bot kinds, including the measure-as-shipped discipline |
| **@deev/ai** | Generic opponents: `makeMinimaxBot` (alpha-beta + iterative deepening + optionality evaluation) and `makeIsmctsBot` (re-determinized ISMCTS over particle beliefs, optional beam planner). Difficulty = search budget, never rules. Bots satisfy lab's `ScriptedBot` structurally — benchmark with zero adapters | muju `src/ai` (engine-v2, belief/, planner/, search/) + the minimax-ai skill — **reference only; muju untouched** |
| **@deev/content** | Schema-first content pipeline: zod schemas + canonical fixtures with drift & cross-fixture seam tests, warnings-not-throws registries, the self-describing CSV loader (`fk__`/`m2m__`/`goc_m2m__` columns, skip sentinels), and the explicit-seeds verifier framework (`solvable`/`notPreSolved`/`survivable`) | MMS `packages/schema`; Mythgarden's `seed_database` command; verifier **reconstructed from the dossier's LUMENGRID description** (artifact source not in repo) |
| **@deev/llm** | LLM game services with the house wire constraints baked in: raw-fetch Anthropic client (lazy env keys — tested zero-key CI guarantee), `structuredCall` with JSON-string transport for recursive schemas + retry-with-feedback, `makeJudge` sugar, guarded agent implement-jobs (git lockout always merged, SDK dynamically imported), and the generic effect-AST catalog framework (validators + wire schema + drift check; **no executor** — execution stays game-side) | `lution/server/claude.ts` + `lution/shared/atoms.ts`; napkin Domain Notes |
| **@deev/ui** | Mobile game shell (100dvh, docked action bar), tap-select-then-confirm machine, typed-theme skin manager, localStorage adapter over core's save envelopes, deterministic toast queue, layout-invariance test helpers with a jsdom false-pass guard | Lution's mobile pass (napkin Round 2); FORGE skins (**redesigned** — the typed theme object is the load-bearing part); Oracle's layout-stability discipline |

Dependency edges: `lab → core`; `ai → core` (+ `lab` as dev, for benchmarks); `ui → core` (storage reuses the save envelope). `lab` never imports `ai`.

## The worked example

`examples/pebble-duel` — a 3-heap Nim variant proving the kits compose:
- **core**: GameDef + seeded matches + replay convergence (stage 1 landed before any other kit was built, consumer-validating the contract).
- **lab**: perfect-play (Grundy mod-4) vs random over 200 seeded games — CI excludes 0.5, and `REPORT.md` is **byte-identical across runs** (reports carry no timestamps).
- **ai**: `makeMinimaxBot` on the same GameDef, benchmarked through lab.
- **content**: the puzzle pack ships as a self-describing CSV, schema-validated, and machine-verified (every position winnable-for-first and not pre-solved — with a test proving the verifier catches a zero-Grundy trap).
- **llm**: a `RawBot` that picks moves via `structuredCall` against a scripted mock client — llm → lab → core composition with zero network. (UI coverage is intentionally thin; the confirm machine is exercised in @deev/ui's own suite.)

## The first real game

`examples/tesser` — TESSER, winner of the July 2026 design tournament (`docs/game-design-tournament-2026-07.md`): a dueling tactics game where pieces are conserved hypervolume folded between spear/slab/tower geometries. Five kits load-bearing (llm deferred to post-V1 shape drops by design), 68 tests, machine-verified 12-mission campaign, playable portrait web UI. See its `SPEC.md` and `README.md`.

## Starting a new game on the platform

1. `mkdir examples/<your-game>` (or a sibling repo) with a package.json declaring `workspace:*` deps on the kits you need.
2. Implement `GameDef` first; reify pass/end-turn as actions (legal() is never empty for acting seats); bump `version` on every logic change.
3. Wire a lab series with `randomBot` + `greedyBot` on day one — the sensitivity gate tells you your harness can detect advantage before you trust any balance number.
4. Ship content through `defineContent` + a verifier; put `verifierIssues(...) === []` in CI.
5. If the game has hidden information, keep one public channel deterministic (the muju lesson) — that's what makes `BeliefModel.sampleWorld` tractable.

## Deferred (recorded, not built)

- `@deev/ai`: tactical sharpener + engine orchestrators (muju `eval/sharpener.ts`, `engine-v2.ts`), Web-Worker wrapper, expectimax for stochastic games.
- `@deev/llm`: an atom-composition **executor** (stays game-side by design; see `SEMANTICS.md`).
- `@deev/lab`: sampled-replay retention and per-turn metric-curve hooks beyond the current optional hooks.
- `@deev/ui`: browser-mode validation of the layout helpers' success path (the first browser-mode consumer's job; this pass ships the jsdom-guard test only).

## Provenance honesty

Every README in `packages/*` carries a per-module provenance map. Where a pattern was reconstructed from a description rather than factored from readable source (the LUMENGRID verifier), it says so explicitly.
