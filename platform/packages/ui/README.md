# @deev/ui

Mobile game shell, tap-select-confirm, skins, versioned storage over
`@deev/core`'s save envelope, toasts, and layout-invariance test helpers.
Everything ships headless/framework-free — no `react` dependency. React
adapter recipes below are documented as thin and test-exempt (a few lines
each, all logic lives in the tested headless cores).

## Provenance

- **`shell.css` / `shell.ts`** — Lution's mobile UI pass (`napkin.md`,
  "Round 2: mobile UI pass"): the `100dvh` flex-column shell with a sticky
  header, scrollable content, and an action dock docked *outside* the
  scroll region so it stays in thumb reach. Also carries forward the
  napkin's CSS-specificity gotcha (avoid `:not()` scoping tricks) as an
  inline comment in `shell.css`.
- **`confirm.ts`** — FORGE's two-click burn interaction (tap selects, tap
  again confirms) combined with Lution's fat-finger fix (tap SELECTS
  instead of acting immediately, with an explicit confirm/cancel step).
- **`skins.ts`** — an **honest redesign**, not "FORGE generalized". FORGE's
  actual skin system (`forge/src/skins/types.ts`, read-only reference) has
  no CSS custom properties at all — its load-bearing part is a typed
  `theme` object (Tailwind class bundles per faction/symbol), a card-name
  remap, and an `imagePath` function, all read directly by components. This
  module keeps that shape (`theme: T` is what your components read) and
  adds the plumbing FORGE re-implemented ad hoc per game: root-class
  swapping, an *optional* CSS-vars channel for games that do want themeable
  CSS, name-remap-with-fallback, and injectable persistence.
- **`storage.ts`** — a thin adapter over `@deev/core`'s
  `SaveEnvelope`/`definePersistence` (see `packages/core/src/persist.ts`).
  It owns only key handling, JSON (de)serialization, and the
  corrupt-JSON-to-`null` fallback. The `structuredClone` snapshot-on-write
  guarantee lives in core's `definePersistence`, not here — see the comment
  in `storage.ts`.
- **`test/layout.ts`** — Oracle of Delve's layout-invariance discipline
  (`oracle/src/test/layout-invariant.visual.test.tsx` +
  `oracle/LAYOUT_STABILITY_REPORT.md`, read-only references): measure
  actual rendered geometry (`getBoundingClientRect`, `getComputedStyle`)
  rather than trusting CSS class names, so HP-text length, conditional
  status strings, alive/defeated state, and name length can never silently
  shift layout.

## The jsdom-quick vs browser-mode dual-run recipe

`test/layout.ts`'s assertions are only meaningful where a real layout
engine exists. **jsdom has no layout engine** — `getBoundingClientRect()`
always reports `0x0`, which would otherwise make every assertion here
"pass" by comparing zero to zero. All three assertions (`expectStableRect`,
`expectExplicitSize`, `expectStableGaps`) check for this up front and throw
a pointed error naming the fix instead of rubber-stamping a false pass.

Run both suites, for different reasons:

- **jsdom (fast, this package's `vitest.config.ts`)** — catches wiring bugs
  (wrong selector, component throws, wrong element type) at CI speed. It
  will reliably throw the "jsdom has no layout engine" error if you call
  these three assertions directly against jsdom-rendered elements — that
  throw is itself a correctness signal, not a bug to suppress.
- **Vitest browser mode / Playwright** — the only place these assertions
  can actually pass on their success path, because it's the only place a
  real layout engine computes non-zero geometry. Add a
  `*.visual.test.ts(x)` (or your project's equivalent) suite pointed at
  `vitest --browser` / Playwright and call `expectStableRect` /
  `expectExplicitSize` / `expectStableGaps` there against your real
  components.

This package ships only the jsdom-guard test (`tests/layout.test.ts` —
asserts the pointed error fires) for this pass. **`layout.ts`'s success
path is validated by its first browser-mode consumer** — i.e. the first
downstream game that wires up a `*.visual.test.tsx` suite against real
components is what proves these helpers actually catch layout drift, not
just that they refuse to lie under jsdom.

## React adapter recipes

These are intentionally thin — a few lines wrapping the headless core in
`useState`/`useSyncExternalStore`. They are **not covered by this
package's tests** (no `react` devDependency here); treat them as a
documented starting point for a consuming game's own adapter, tested at
that layer.

### `useConfirm`

```tsx
import { useMemo, useState } from 'react';
import { createConfirmMachine, type ConfirmState } from '@deev/ui';

function useConfirm<T>(onConfirm: (item: T) => void) {
  const machine = useMemo(() => createConfirmMachine<T>({ onConfirm }), []);
  const [state, setState] = useState<ConfirmState<T>>('idle');

  return {
    state,
    select: (item: T) => {
      machine.select(item);
      setState(machine.state());
    },
    confirm: () => {
      machine.confirm();
      setState(machine.state());
    },
    clickElsewhere: () => {
      machine.clickElsewhere();
      setState(machine.state());
    },
  };
}
```

### `useSkin`

```tsx
import { useSyncExternalStore } from 'react';
import type { SkinManager } from '@deev/ui';

function useSkin<T>(manager: SkinManager<T>) {
  return useSyncExternalStore(
    (onStoreChange) => manager.subscribe(onStoreChange),
    () => manager.current()
  );
}
```

### `useToasts`

```tsx
import { useEffect, useSyncExternalStore } from 'react';
import type { ToastQueue } from '@deev/ui';

function useToasts(queue: ToastQueue) {
  const active = useSyncExternalStore(
    (onStoreChange) => queue.subscribe(onStoreChange),
    () => queue.active()
  );

  useEffect(() => {
    const id = setInterval(() => queue.tick(), 500);
    return () => clearInterval(id);
  }, [queue]);

  return active;
}
```

## Usage notes

- Import the shell CSS manually where you mount your app shell:
  ```ts
  import '@deev/ui/src/shell.css';
  ```
- `storage.ts`'s `defineStore` expects a `Persistence<T>` built with
  `@deev/core`'s `definePersistence` — one envelope shape, one migrate
  chain, shared between your save/load code and any lab/replay tooling
  that also reads saves.
- All modules take an injectable storage/clock where relevant
  (`skins.ts`, `storage.ts`, `toasts.ts`) — pass an in-memory
  implementation in tests, real `localStorage`/`Date.now` in production
  (all default to the real thing).
