import { defineConfig } from 'vite'
import { lutionServer } from './server/plugin'

export default defineConfig({
  base: '/lution/',
  plugins: [lutionServer()],
  server: {
    port: 3004,
    host: true,
    watch: {
      // Claude's implement job writes these mid-game; effects are loaded
      // explicitly (glob at boot, cache-busted dynamic import mid-session),
      // so file watching must never trigger HMR/reload races.
      ignored: [
        '**/src/effects/**',
        '**/data/**',
        '**/NEXT_CARDS.md',
        '**/tests/cards/**',
      ],
    },
  },
})
