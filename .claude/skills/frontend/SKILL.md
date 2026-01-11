---
name: frontend
description: Sets up frontend projects with React 19, Vite, Tailwind v4, Vitest, and Playwright. Use when scaffolding new game directories, configuring build tools, or implementing responsive/mobile-first UI.
---

# Frontend Development Skill

## Tech Stack

This repo uses a consistent frontend stack across all game projects:

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite 7** - Build tool and dev server
- **Tailwind CSS v4** - Utility-first styling
- **Vitest** - Unit testing with browser mode support
- **Playwright** - End-to-end testing

---

## Project Scaffolding

When creating a new game directory (e.g., `/elemental`), include these files:

### package.json

```json
{
  "name": "game-name",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  },
  "devDependencies": {
    "@playwright/test": "^1.57.0",
    "@tailwindcss/postcss": "^4.1.18",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.1",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^22.16.0",
    "@types/react": "^19.2.7",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.2",
    "@vitest/browser": "^4.0.16",
    "@vitest/browser-playwright": "^4.0.16",
    "@vitest/ui": "^4.0.16",
    "jsdom": "^27.4.0",
    "playwright": "^1.57.0",
    "postcss": "^8.5.6",
    "tailwindcss": "^4.1.18",
    "typescript": "^5.9.3",
    "vite": "^7.3.0",
    "vitest": "^4.0.16"
  },
  "dependencies": {
    "react": "^19.2.3",
    "react-dom": "^19.2.3"
  }
}
```

### vite.config.ts

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,  // Increment for each game (3001, 3002, etc.)
    host: true,  // Expose to local network for mobile testing
  },
})
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

---

## Tailwind CSS v4 Setup

**CRITICAL:** Tailwind v4 uses a different configuration approach than v3.

### Required Files

#### postcss.config.js

```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

**Note:** This is the v4 PostCSS plugin. Do NOT use `tailwindcss` or `autoprefixer` directly.

#### tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

#### src/index.css

```css
@import "tailwindcss";

/* Custom fonts (optional) */
@import url('https://fonts.googleapis.com/css2?family=...');

/* Base styles */
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Custom animations */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}
```

### Common v4 Gotchas

1. **Import syntax:** Use `@import "tailwindcss"` not `@tailwind base/components/utilities`
2. **PostCSS plugin:** Use `@tailwindcss/postcss` not `tailwindcss`
3. **No autoprefixer needed:** The v4 plugin handles prefixing automatically
4. **CSS-first config:** Tailwind v4 prefers CSS-based configuration, but JS config still works

---

## Playwright E2E Testing

### playwright.config.ts

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Mobile devices - ALWAYS INCLUDE FOR TOUCH GAMES
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
    {
      name: 'tablet',
      use: { ...devices['iPad Pro 11'] },
    },
  ],

  // Start dev server before tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Test Structure

```
tests/
├── e2e/
│   ├── game-flow.spec.ts    # Full game scenarios
│   ├── mobile.spec.ts       # Mobile-specific tests
│   └── accessibility.spec.ts
└── unit/
    └── *.test.ts            # Vitest unit tests
```

### Sample E2E Test (tests/e2e/game-flow.spec.ts)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Game Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should start a new game', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /game title/i })).toBeVisible();
    await page.getByRole('button', { name: /start/i }).click();
    await expect(page.locator('[data-testid="game-board"]')).toBeVisible();
  });

  test('should handle touch interactions on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-only test');

    await page.getByRole('button', { name: /start/i }).tap();
    // Touch-specific assertions
  });
});
```

### Mobile-Specific Tests (tests/e2e/mobile.spec.ts)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Mobile Experience', () => {
  test('viewport fits without horizontal scroll', async ({ page }) => {
    await page.goto('/');

    const body = page.locator('body');
    const viewportWidth = page.viewportSize()?.width ?? 0;
    const bodyWidth = await body.evaluate(el => el.scrollWidth);

    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
  });

  test('touch targets are at least 44x44px', async ({ page }) => {
    await page.goto('/');

    const buttons = page.locator('button');
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('no hover-only interactions', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-only test');

    // All hover states should have tap equivalents
    await page.goto('/');
    // Test that tooltips/menus are accessible via tap
  });
});
```

### Running E2E Tests

```bash
# Run all tests
npm run test:e2e

# Run with UI for debugging
npm run test:e2e:ui

# Run specific browser/device
npx playwright test --project=mobile-chrome

# Run specific test file
npx playwright test tests/e2e/mobile.spec.ts
```

---

## Mobile-First Development

### Design Principles

1. **Mobile-first CSS:** Start with mobile layout, add complexity for larger screens
2. **Touch-friendly targets:** Minimum 44x44px for all interactive elements
3. **No hover-only states:** Everything accessible via tap
4. **Responsive typography:** Use `clamp()` or Tailwind's responsive prefixes
5. **Safe areas:** Account for notches and home indicators

### Responsive Breakpoints (Tailwind)

```
sm: 640px   - Large phones / small tablets (landscape)
md: 768px   - Tablets (portrait)
lg: 1024px  - Tablets (landscape) / small laptops
xl: 1280px  - Desktops
2xl: 1536px - Large desktops
```

### Mobile-First Component Pattern

```tsx
function GameBoard() {
  return (
    <div className={`
      /* Mobile first (default) */
      grid grid-cols-5 gap-1 p-2

      /* Tablet and up */
      sm:grid-cols-8 sm:gap-2 sm:p-4

      /* Desktop */
      lg:grid-cols-10 lg:gap-3
    `}>
      {cells.map(cell => (
        <Cell
          key={cell.id}
          className={`
            /* Touch-friendly on mobile */
            min-w-[44px] min-h-[44px]

            /* Can be smaller on desktop with mouse */
            lg:min-w-[32px] lg:min-h-[32px]
          `}
        />
      ))}
    </div>
  );
}
```

### Touch Event Handling

```tsx
function InteractiveCell({ onClick, onLongPress }) {
  const [pressTimer, setPressTimer] = useState<number | null>(null);

  const handleTouchStart = () => {
    const timer = window.setTimeout(() => {
      onLongPress?.();
    }, 500);
    setPressTimer(timer);
  };

  const handleTouchEnd = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      setPressTimer(null);
      onClick?.(); // Short tap
    }
  };

  return (
    <button
      onClick={onClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => pressTimer && clearTimeout(pressTimer)}
      className="touch-manipulation" // Prevents 300ms delay
    >
      {/* content */}
    </button>
  );
}
```

### Viewport Meta Tag (index.html)

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <title>Game Title</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### Safe Area Handling

```css
/* For devices with notches/rounded corners */
.game-container {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
```

---

## Vitest Configuration

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
})
```

### tests/setup.ts

```typescript
import '@testing-library/jest-dom/vitest';
```

### Sample Unit Test

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameBoard } from '../src/components/GameBoard';

describe('GameBoard', () => {
  it('renders the correct number of cells', () => {
    render(<GameBoard rows={10} cols={10} />);
    expect(screen.getAllByTestId('cell')).toHaveLength(100);
  });

  it('highlights valid moves on unit selection', async () => {
    const user = userEvent.setup();
    render(<GameBoard />);

    await user.click(screen.getByTestId('unit-fire-1'));

    expect(screen.getAllByTestId('valid-move')).toHaveLength(4);
  });
});
```

---

## Directory Structure Template

```
game-name/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── postcss.config.js
├── tailwind.config.js
├── playwright.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── game/           # Game logic (pure TypeScript)
│   │   ├── types.ts
│   │   └── *.ts
│   ├── components/     # React components
│   │   └── *.tsx
│   ├── hooks/          # React hooks
│   │   └── *.ts
│   └── utils/          # Helpers
│       └── *.ts
└── tests/
    ├── setup.ts
    ├── unit/           # Vitest unit tests
    │   └── *.test.ts
    └── e2e/            # Playwright tests
        └── *.spec.ts
```

---

## Quick Start Checklist

When setting up a new game:

- [ ] Create directory structure
- [ ] Copy package.json, update name and port
- [ ] Add postcss.config.js (v4 format)
- [ ] Add tailwind.config.js
- [ ] Add vite.config.ts
- [ ] Add vitest.config.ts
- [ ] Add playwright.config.ts with mobile devices
- [ ] Add tsconfig.json
- [ ] Create index.html with viewport meta
- [ ] Create src/index.css with `@import "tailwindcss"`
- [ ] Create src/main.tsx entry point
- [ ] Create tests/setup.ts
- [ ] Run `npm install`
- [ ] Run `npx playwright install` for browsers
- [ ] Verify with `npm run dev`

---

## Common Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build
npm run preview          # Preview production build

# Testing
npm run test             # Run unit tests once
npm run test:watch       # Watch mode
npm run test:ui          # Vitest UI
npm run test:e2e         # Playwright tests
npm run test:e2e:ui      # Playwright UI mode

# Mobile testing on real device
# 1. Find your local IP: ifconfig | grep inet
# 2. Access http://YOUR_IP:3000 from mobile device
```
