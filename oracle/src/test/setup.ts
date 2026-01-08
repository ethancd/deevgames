// Test setup for Vitest
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Import Tailwind CSS for browser tests
import '../index.css';

// Cleanup after each test
afterEach(() => {
  cleanup();
});
