# @mms/app — implementation notes

The app shell + deploy pipeline + React game screens. Built against `@mms/schema`
fixtures and the **pinned engine runtime contract**, with placeholder chrome and
a fixture-backed mock engine to swap for the real `@mms/engine` at integration.

## Build & run

```bash
pnpm --filter @mms/app build     # tsc -b && vite build -> dist/ (installable PWA)
pnpm --filter @mms/app dev       # dev server on :3003 (host:true for phone testing)
pnpm --filter @mms/app preview   # serve the production build locally
pnpm --filter @mms/app test      # vitest (engine loop + component/integration smoke)
```

The build emits a PWA: `dist/sw.js` (Workbox precache of the whole shell —
offline-first, since all content is local data), `dist/manifest.webmanifest`,
and icons (`pwa-192/512`, maskable, `apple-touch-icon`). `index.html` carries the
iOS `apple-mobile-web-app-capable` + `viewport-fit=cover` tags so **Add to Home
Screen works on iOS Safari** — the whole distribution story.

`base: './'` (relative) so the same `dist/` deploys to a root or a sub-path
without reconfiguration.

## Deploy

Static host. Config is committed for both targets:

- **Vercel** — `vercel.json` (buildCommand `pnpm --filter @mms/app build`,
  outputDirectory `dist`, SPA rewrite to `index.html`).
- **Cloudflare Pages** — build command `pnpm --filter @mms/app build`, output
  `packages/app/dist`; `public/_redirects` handles the SPA fallback.

No live deploy is performed here — `dist/` is the artifact.

## The engine seam (how to swap mock -> real at integration)

The UI imports its engine **only** from `src/engine` — never the mock directly.

- `src/engine/contract.ts` — the PINNED runtime types + `EngineApi` op surface
  (`startRun, chooseNode, playCard, endTurn, pickReward`), verbatim from the
  orchestrator. `Rarity` is derived from `CardDef['rarity']` to avoid a zod dep.
- `src/engine/mockEngine.ts` — a faithful fixture-backed Slay-the-Spire loop
  (seeded PRNG, branching act map, intents, card play, rewards, act boss). Cards
  are derived from `fixtureCard` so the mock never drifts from the content
  contract. Also exports `lookupCard/lookupRelic` registries for reward previews.
- `src/engine/index.ts` — **the seam.** Today `engine = mockEngine`. To swap:
  1. Have `@mms/engine` export the five ops (and optionally `pendingRewards`)
     per `contract.ts`.
  2. Uncomment the `realApi` block and set `USE_REAL_ENGINE = true`.
  3. Delete `mockEngine.ts` (or keep it for tests).

Because both sides implement `EngineApi`, **no screen changes** at integration.

`pendingRewards` is the one op beyond the minimal pinned list: it's optional on
the contract; if the real engine omits it, the UI falls back to a generic
"continue" affordance.

## Two image streams (kept separate)

- **Content art** (creature portraits): `src/content/images.ts` globs
  `assets/images/<ref>.webp` at build time and resolves an `imageRef` -> bundled
  URL. Missing asset -> `null`. `src/chrome/ContentImage.tsx` renders a bone-skull
  placeholder so a portrait-less build still reads as Necropolis. When the
  researcher's real assets land they drop into `assets/images/` and resolve for
  free.
- **Chrome** (frames, icons, cost orbs, backgrounds, buttons): MINE, all
  CSS/SVG — `src/chrome/icons.tsx`, `src/index.css`, `public/favicon.svg`
  (rasterized to the PWA PNG icons). Swap-ready placeholders.

## Necropolis visual direction

Art-historical register: **gothic memento-mori**. Bone ivory (`#e8e2d0`) and
**verdigris** — oxidized copper green (`#3a6b5f`/`#7cae9e`) — on grave-black
(`#0b0d0a`), with a single **blood-crimson** accent (`#8b1a1a`) used sparingly
(cost orbs, attack intents, the End Turn rune). Ornamental serif display type
(Cinzel) set in engraved/chiselled text; body in EB Garamond. The crypt backdrop
is a verdigris vignette over faint bone-dust hairlines. Deliberately NOT a CSS-
framework default — every node, card and orb is hand-built chrome.

## Mobile-first / touch

Single `max-w-md` column at `100dvh`, safe-area insets honoured, `touch-action:
manipulation` (no 300ms delay), all targets thumb-sized. Targeting in combat is
tap-an-enemy-then-tap-a-card; AoE/self cards ignore selection. No keyboard
anywhere.
