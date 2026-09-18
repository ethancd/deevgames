import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/muju/',
  // MODULE workers (E5.1). `worker/client.ts` already constructs the worker
  // with `{ type: 'module' }`, so this only makes the BUILD agree with the
  // source; the default `iife` cannot code-split, which means a lazy
  // `await import()` inside the worker fails the build outright. The hard
  // engine is ~143 kB of replica/generators/tables/evaluator that only an
  // opted-in Hard game ever touches, and `format: 'es'` is what keeps it out
  // of the chunk every AI game downloads.
  //
  // THE FLOOR THIS SETS is the intersection of the three engines' support for
  // module workers: Chrome 80, Safari 15, Firefox 114. Firefox is the LATE
  // one, not Safari — it only shipped them in June 2023. `build.target` is
  // pinned to that intersection below rather than left at Vite's default
  // (`modules` ≡ chrome87/safari14/firefox78/edge88), which would emit syntax
  // for browsers that cannot run the worker at all. Recorded as the E5.3
  // device baseline — see `docs/hard-ai/e5/E5.1-OPT-IN-ROUTE.md`.
  worker: { format: 'es' },
  build: { target: ['chrome80', 'edge80', 'firefox114', 'safari15'] },
  server: {
    port: 3002,
    host: true,
  },
})
