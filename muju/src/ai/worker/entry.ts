import { instantiateTactics } from '../wasm/kernel';
import { createSearchHandler } from './handler';
import type { SearchRequest } from './protocol';

// Single threaded WASM + a dedicated browser worker. No server or isolation
// headers. ArrayBuffer instantiation also tolerates hosts with a wrong MIME type.
const ready = (async () => {
  try {
    const response = await fetch(new URL('../wasm/tactics.wasm', import.meta.url));
    if (!response.ok) throw new Error(`WASM HTTP ${response.status}`);
    return createSearchHandler(await instantiateTactics(await response.arrayBuffer()));
  } catch (error) {
    return createSearchHandler(undefined, `Using JavaScript tactical fallback: ${String(error)}`);
  }
})();
// Serialize requests: an async module-loading boundary must not interleave two
// searches on the same mutable WASM buffers or player context.
let pending = Promise.resolve();
self.onmessage = (event: MessageEvent<SearchRequest>) => {
  pending = pending.then(async () => { self.postMessage(await (await ready)(event.data)); });
};
