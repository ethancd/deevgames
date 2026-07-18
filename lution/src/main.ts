// Boot entry point: mounts the real app (src/ui/app.ts), which owns
// fetching /api/state + /api/registry, loading effect modules, and resuming
// or starting a match. Kept intentionally thin — all boot logic lives in
// app.ts so it's exercised the same way whether mountApp is called from here
// or (in principle) from a test harness.

import { mountApp } from './ui/app';

const container = document.getElementById('app');
if (!container) {
  throw new Error('main.ts: #app container not found in index.html');
}

mountApp(container);
