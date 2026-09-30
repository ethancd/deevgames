import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDITED_EXPLORER_COMPATIBILITY } from './compatibility';
const root = fileURLToPath(new URL('../../', import.meta.url));
const collect = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(e => e.isDirectory() ? collect(join(path, e.name)) : e.name.endsWith('.ts') ? [join(path, e.name)] : []);
const files = [...collect(join(root, 'src/game')), ...collect(join(root, 'server/explorer')), join(root, 'src/ai/simulate.ts'), join(root, 'server/observation.ts')].sort();
const hash = createHash('sha256');
const implementation = createHash('sha256');
for (const file of files) {
  const path = relative(root, file), bytes = readFileSync(file);
  hash.update(path).update('\0').update(bytes).update('\0');
  if (path !== 'server/explorer/compatibility.ts') implementation.update(path).update('\0').update(bytes).update('\0');
}
export const EXPLORER_SOURCE_IDENTITY = { commit: process.env.RENDER_GIT_COMMIT ?? process.env.MUJU_SOURCE_REVISION ?? null, sha256: hash.digest('hex') };
export const EXPLORER_IMPLEMENTATION_SHA256 = implementation.digest('hex');
export function isCompatibleExplorerSource(source: string, current = EXPLORER_SOURCE_IDENTITY.sha256, implementationSha = EXPLORER_IMPLEMENTATION_SHA256) {
  return source === current || AUDITED_EXPLORER_COMPATIBILITY[source] === implementationSha;
}
