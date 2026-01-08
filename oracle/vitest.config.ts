import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['playwright', 'playwright-core', '@playwright/test', 'chromium-bidi', 'fsevents'],
  },
  ssr: {
    noExternal: false,
    external: ['playwright', 'playwright-core', '@playwright/test', 'chromium-bidi', 'fsevents'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    server: {
      deps: {
        external: [/playwright/, /chromium-bidi/, /fsevents/],
        inline: [],
      },
    },
    browser: {
      enabled: false, // Enable with --browser.enabled=true
      headless: true,
      provider: playwright(),
      instances: [
        { browser: 'chromium' },
      ],
    },
  },
});
