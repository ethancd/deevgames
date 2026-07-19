# @deev/llm

LLM opponent/judge/compiler services for DeevGames titles, with the house
gotchas baked in: a raw-fetch Anthropic client with lazy env resolution, a
JSON-string transport for recursive schemas, an LLM-judge built as sugar over
the same call pipeline, a guarded agent implement-job runner, and a generic
effect-AST catalog toolkit (framework only — no executor).

## Provenance

Generalized from two real, working call sites, both read-only references for
this package (never modified):

- `lution/server/claude.ts` — the five entry points (`designCard`,
  `compileCard`, `judgeSemanticDuplicate`, `generateStarterNames`,
  `implementCards`). `client.ts` generalizes its raw-fetch Messages API
  pattern and the `ANTHROPIC_PERSONAL_API_KEY` / `ANTHROPIC_API_KEY`
  fallback story; `structured.ts` generalizes its JSON-string transport for
  the recursive `composition` field (`parseCompositionString`); `jobs.ts`
  generalizes `implementCards`'s Claude Agent SDK half, including its
  `git`-tool-lockout comment and its prior-failure retry loop.
- `lution/shared/atoms.ts` — the catalog/validator architecture
  (`CardComposition`, `ATOM_NAMES`, `validateCompositionShape` /
  `validateCompositionSemantics`, `ATOM_JSON_SCHEMA`) that `ast.ts`
  generalizes into a framework. This package ships the FRAMEWORK, not
  Lution's specific atom catalog — no `draw`/`destroy`/`freezeInPlay`-style
  atom lives in `@deev/llm`; every game defines its own via `defineCatalog`.
- The current Anthropic Messages API request shape (model IDs, structured
  outputs via `output_config.format`, adaptive thinking) comes from the
  `claude-api` skill, not from memory — see `src/client.ts`'s request
  construction for the exact fields sent.

## Zero-key CI guarantee (tested)

Every module in this package is safe to `import` — and every `LlmClient` is
safe to *construct* — with **no** `ANTHROPIC_*` environment variable set and
**no** network access. `anthropicClient()` resolves its API key lazily,
inside the first `complete()` call, never at construction or module load.
`tests/client.test.ts` asserts this directly: `anthropicClient({ env: {} })`
constructs without throwing, and only the first `complete()` call rejects,
naming every env var it tried.

The entire test suite (`tests/`) is mocked: zero network calls, zero real
API keys, zero dependence on `@anthropic-ai/claude-agent-sdk` actually
resolving anything. `jobs.ts`'s default runner dynamically `import()`s the
Agent SDK *inside* the function body specifically so that supplying a mock
`runner` (as every test does) never triggers that import — the SDK is a
`devDependency` used for types only.

## Deferred: no executor

`ast.ts` is a validator + wire-schema + drift-check toolkit, not an
interpreter. Compiling a validated `Composition` into real game effects is
irreducibly game-specific (see `SEMANTICS.md`, which ships as a template for
each game to fill in) and stays entirely game-side — the way
`lution/src/engine/compileComposition.ts` does it for Lution's own atom
catalog, outside this package's scope.

Per the platform build plan, `ast.ts` is **the first module to defer under
time pressure** — every other module in this package (`client.ts`,
`structured.ts`, `judge.ts`, `jobs.ts`) is considered load-bearing first.

## Modules

| File | What it is |
| --- | --- |
| `src/client.ts` | `LlmClient` interface + `anthropicClient()`: raw fetch over `/v1/messages`, lazy env resolution, injectable `env`/`fetchImpl`. |
| `src/structured.ts` | `structuredCall<T>()`: the JSON-string transport for recursive schemas, tolerant decode, retry-with-feedback loop. `wireSchemaFor`/`parseTolerant` are exported helpers used internally. |
| `src/judge.ts` | `makeJudge<T>()`: an LLM-as-judge over an enum of string literals, implemented as sugar over `structuredCall` — same transport, same retry loop, no second call pipeline. |
| `src/jobs.ts` | `runImplementJob()`: attempt/gate loop for an agent implement-job, with the `Bash(git *)`/`Bash(git:*)` lockout always merged in and an injectable `runner` seam. |
| `src/ast.ts` | `defineCatalog()`: generic effect-AST catalog toolkit (shape validator, semantic-rule runner, non-recursive wire schema, catalog-vs-docs drift check). No executor. |
| `SEMANTICS.md` | Template a game author fills in: snapshot semantics, selector identity, mutation re-check rule — the contract the game's own (game-side) executor must honor. |

## Verify

```sh
cd platform
pnpm --filter @deev/llm typecheck
pnpm --filter @deev/llm test
```
