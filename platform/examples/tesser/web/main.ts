// @deev/ui's README says `import '@deev/ui/src/shell.css'`, but its
// package.json exports map only exposes "." — Vite's strict exports
// resolution rejects the subpath. Import the file relatively instead
// (stable within the pnpm workspace).
import '../../../packages/ui/src/shell.css';
import './style.css';
import { createApp } from './app.ts';

const root = document.getElementById('app');
if (!root) throw new Error('tesser: missing #app root');
createApp(root);
