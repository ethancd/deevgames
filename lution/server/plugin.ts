// Vite dev-server plugin entry point: lutionServer() mounts the /api router
// (server/router.ts) as Vite middleware and owns all disk writes (registry,
// match state, jobs, NEXT_CARDS.md) via server/persistence.ts.
//
// Boot-time job recovery (jobs stuck 'running'/'queued'/'testing' in
// jobs.json -> 'interrupted') happens as a side effect of constructing the
// JobManager inside createApiRouter, which runs once here in
// configureServer -- i.e. once per dev-server boot, before any request is
// served.

import type { Plugin } from 'vite';
import path from 'node:path';
import { createApiRouter } from './router';
import { recoverPendingResolution, type PersistencePaths } from './persistence';

export interface LutionServerOptions {
  // Root-relative or absolute path to the project directory whose data/,
  // src/effects/, and NEXT_CARDS.md this instance manages. Defaults to the
  // Vite config root when omitted.
  root?: string;
}

export function lutionServer(options: LutionServerOptions = {}): Plugin {
  return {
    name: 'lution-server',
    async configureServer(server) {
      const projectRoot = path.resolve(options.root ?? server.config.root);
      const paths: PersistencePaths = {
        dataDir: path.join(projectRoot, 'data'),
        nextCardsPath: path.join(projectRoot, 'NEXT_CARDS.md'),
      };

      // Boot-time recovery: replay any resolve-round transaction that was
      // still in flight (marker present) when the previous dev-server
      // process died -- see persistence.ts's recoverPendingResolution doc.
      await recoverPendingResolution(paths);

      const router = createApiRouter({ paths, projectRoot });

      server.middlewares.use('/api', router);
    },
  };
}
