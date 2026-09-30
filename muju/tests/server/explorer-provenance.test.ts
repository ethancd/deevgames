// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ExplorerStore } from '../../server/explorer/store';
import { EXPLORER_SOURCE_IDENTITY, EXPLORER_IMPLEMENTATION_SHA256, isCompatibleExplorerSource } from '../../server/explorer/provenance';

const legacy = ['3d14e85c953553f14ca0d81a0fddf86989b7fc8871a13310095206fe1bc7654a', 'c89676ed18ce8a4495c9a8473ec9a19b02ed294f9cac396caef0eabf18b51e51'];
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).reverse().forEach(fn => fn()));

it('accepts only exact audited source transitions and rejects changed implementation bytes', () => {
  expect(isCompatibleExplorerSource(EXPLORER_SOURCE_IDENTITY.sha256)).toBe(true);
  for (const old of legacy) {
    expect(isCompatibleExplorerSource(old)).toBe(true);
    expect(isCompatibleExplorerSource(old, EXPLORER_SOURCE_IDENTITY.sha256, 'different-engine-bytes')).toBe(false);
  }
  expect(isCompatibleExplorerSource('unknown-source', EXPLORER_SOURCE_IDENTITY.sha256, EXPLORER_IMPLEMENTATION_SHA256)).toBe(false);
});

it.each(legacy)('continues audited source %s with append-only provenance and sealed memory intact', source => {
  const dir = mkdtempSync(join(tmpdir(), 'muju-provenance-')), path = join(dir, 'rooms.sqlite');
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const store = new ExplorerStore(path); cleanup.push(() => store.close());
  const db = new DatabaseSync(path); cleanup.push(() => db.close());
  const { experiment, token } = store.create({ handicap: 18.5 });
  const white = store.claim(experiment.id, token, 'white')!;
  store.submit(experiment.id, token, white.id, { kind: 'assess', assessment: { whiteWin: 0.63, pressure: 'balanced', counterplay: '', explanation: '' }, memory: 'Sealed White strategy.' });
  const row = JSON.parse(db.prepare('SELECT data FROM muju_experiments WHERE id = ?').get(experiment.id)!.data as string);
  row.sourceIdentity = { sha256: source, commit: 'historical-commit' };
  db.prepare('UPDATE muju_experiments SET data = ? WHERE id = ?').run(JSON.stringify(row), experiment.id);
  const before = store.get(experiment.id);
  const after = store.review(experiment.id, token, 'Continuing an audited compatible release.');
  expect(after.sourceIdentity).toEqual(before.sourceIdentity);
  expect(after.games).toEqual(before.games); expect(after.config).toEqual(before.config); expect(after.plies).toBe(before.plies);
  expect(after.compatibleRuntimes).toHaveLength(1);
  expect(after.compatibleRuntimes![0]).toMatchObject({ sourceIdentity: EXPLORER_SOURCE_IDENTITY, afterPlies: 0, afterModelCalls: 0 });
  expect(store.review(experiment.id, token, 'Another note.').compatibleRuntimes).toHaveLength(1);
  const black = store.claim(experiment.id, token, 'black')!;
  expect(black.player).toBe('black'); expect(black.prompt).not.toContain('Sealed White strategy.'); expect(black.prompt).not.toContain('0.63');
  expect(JSON.stringify(store.get(experiment.id))).not.toContain('Sealed White strategy.');
  expect(() => store.control(experiment.id, 'wrong-token', 'resume')).toThrow('private experiment');
});

it.each(['source', 'rules'] as const)('still refuses a saved experiment with unapproved %s changes', mismatch => {
  const dir = mkdtempSync(join(tmpdir(), 'muju-provenance-')), path = join(dir, 'rooms.sqlite');
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const store = new ExplorerStore(path); cleanup.push(() => store.close());
  const db = new DatabaseSync(path); cleanup.push(() => db.close());
  const { experiment, token } = store.create({});
  const row = JSON.parse(db.prepare('SELECT data FROM muju_experiments WHERE id = ?').get(experiment.id)!.data as string);
  row.sourceIdentity.sha256 = mismatch === 'source' ? 'unknown-source' : legacy[0];
  if (mismatch === 'rules') row.rulesRevision = 'different-rules';
  db.prepare('UPDATE muju_experiments SET data = ? WHERE id = ?').run(JSON.stringify(row), experiment.id);
  expect(() => store.control(experiment.id, token, 'resume')).toThrow('another engine/controller revision');
  expect(store.get(experiment.id).compatibleRuntimes).toBeUndefined();
});
