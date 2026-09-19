// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { summarize, summaryToCsv } from '../../lab/harness/summary';
import { sanityBands } from '../../lab/harness/phasing-round-robin';
import type { GameRecord } from '../../lab/harness/types';

const root = path.resolve(import.meta.dirname, '../..');
const dir = path.join(root, 'lab/harness/results/p1-scripted-2026-09-18');
it('re-derives the frozen scripted summary and baseline bands from all 840 raw games', () => {
  const records: GameRecord[] = fs.readFileSync(path.join(dir, 'games.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  expect(records).toHaveLength(840);
  for (const r of records) {
    expect(r.rulesVersion).toBe('muju-phasing-1');
    expect(r.invariantViolation).toBeNull();
    expect(r.anomalies).toEqual([]);
    expect(r.adjudicated).toBe(false);
    expect(r.players.white.illegalActions + r.players.black.illegalActions).toBe(0);
  }
  const rows = summarize(records);
  expect(rows).toHaveLength(210);
  expect(rows.every(r => r.games === 4 && r.gamesAasWhite === 2 && r.gamesAasBlack === 2)).toBe(true);
  expect(summaryToCsv(rows)).toBe(fs.readFileSync(path.join(dir, 'summary.csv'), 'utf8'));
  expect(sanityBands(records)).toEqual(JSON.parse(fs.readFileSync(path.join(dir, 'sanity-bands.json'), 'utf8')));
});

it('pins the harness and canonical source bytes used for the scripted campaign', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  for (const [file, hash] of Object.entries(manifest.sources)) {
    // Other lanes will port AI code. Canonical/harness hashes bind THIS row,
    // while future engine hashes are naturally allowed to change.
    if (!file.startsWith('lab/harness/')) continue;
    expect(createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'), file).toBe(hash);
  }
});
