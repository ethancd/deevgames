import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    browser: {
      provider: playwright(),
      enabled: false, // Enable with --browser.enabled=true
      headless: true,
      instances: [
        { browser: 'chromium' },
      ],
    },
  },
});
