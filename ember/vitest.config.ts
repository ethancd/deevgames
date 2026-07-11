import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    // Headless phase (WF1): no DOM needed yet. Switch to 'jsdom' when the
    // React/canvas UI lands in WF2.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
