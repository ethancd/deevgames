# SEMANTICS.md — template

This is a template. Every game that uses `defineCatalog` (see `src/ast.ts`)
should copy this file into its own repo (or fill in this one, if the catalog
lives alongside the game) and complete the three sections below for its
*own* atom set. The framework in `@deev/llm` deliberately does not — and
cannot — fill these in for you: they describe the semantics of atoms you
haven't invented yet.

This template's structure and the contract it describes are adapted from the
doc comment at the top of `lution/shared/atoms.ts` (see "SNAPSHOT SEMANTICS"
there) — read it if you want the fully-worked example this was distilled
from.

**No executor lives in `@deev/llm`.** Everything below is a contract your
own game-side interpreter must honor — `@deev/llm`'s `ast.ts` only validates
shape and semantics and emits the wire schema; it never runs a composition
against live game state. Compiling a `Composition` into real effects (what
`lution/src/engine/compileComposition.ts` does for Lution) is inherently
game-specific and stays entirely in your game's codebase.

---

## Snapshot semantics contract

State the resolution model your interpreter uses when one effect body (one
hook firing) executes multiple atoms in sequence. Concretely, answer:

- Do selectors resolved later in the same body see a **snapshot** of zone
  membership taken when the body started (MTG-style, "state-based"
  resolution), or do they **re-query live state** after each prior atom's
  mutation?
- If snapshotted: which parts of a card/entity are frozen (zone membership)
  vs. still live (mutable per-instance attributes, e.g. a "frozen" flag or a
  numeric value comparison)?
- What happens when a snapshot goes stale mid-body — i.e., an earlier atom
  in the same sequence removes/moves the very thing a later atom's selector
  already resolved against the (now stale) snapshot? Your interpreter must
  pick one of: skip the stale candidate silently, skip it with a log line,
  or throw. Document which, and why.

_(Fill in for your game's atom catalog here.)_

## Selector identity

State how your selectors pick among multiple matching candidates, and who
breaks ties:

- Which pick modes exist (e.g. "all", "a specific chooser's choice",
  "random", "highest/lowest by some value", "self")?
- For any pick mode that requires a chooser, who is that chooser by default,
  and can the atom override it?
- Are selector results ever bound to a name for later reference within the
  same body (e.g. so a later step can act on "the same thing an earlier step
  picked")? If so, describe the binding/reference mechanism and what happens
  if a reference is dangling (points at a binding that was never made).

_(Fill in for your game's atom catalog here.)_

## Mutation re-check rule

State the rule your interpreter follows immediately before an atom mutates a
resolved candidate:

- Does the interpreter re-check the candidate's live state (e.g. "is it
  still in the zone the selector thought it was in?") immediately before
  mutating, given the snapshot/live-state split above?
- What happens on a re-check failure — is the mutation silently skipped, is
  it logged, does the whole body abort?
- Are there any atoms explicitly exempt from this re-check (e.g. an atom
  that operates on "whichever instance is currently resolving this hook",
  which by definition can't be stale)?

_(Fill in for your game's atom catalog here.)_

---

## Using this alongside `@deev/llm`'s `ast.ts`

- `defineCatalog({ name, atoms, semanticRules })` gives you `validateShape`
  (structure + atom-name + param-schema checks), `validateSemantics` (your
  own cross-cutting rules — express contract violations like "atom X may
  only appear under trigger Y" as a `semanticRules` entry, the same way
  Lution's `validateCompositionSemantics` checks `grantImmunity`/`onEnterPlay`
  and `cancelDestroy`/`onBeforeDestroy`), `wireSchema` (the non-recursive
  JSON-string envelope for structured LLM calls), and `catalogDriftCheck`
  (catches an atom's doc string pointing at a renamed/removed sibling atom).
- None of those four functions execute a composition. Once a composition
  passes both validators, compiling it into your game's real effects is your
  interpreter's job — write it the way `compileComposition.ts` does for
  Lution: one case per atom name, honoring exactly the contract you filled
  in above.
