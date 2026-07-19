import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  readRegistry,
  writeRegistry,
  readMatchState,
  writeMatchState,
  readJobs,
  writeJobs,
  appendNextCardsEntry,
  type PersistencePaths,
} from '../../server/persistence';
import type { CardDef, JobRecord, MatchState } from '../../shared/types';

function starter(overrides: Partial<CardDef> = {}): CardDef {
  return {
    id: 'starter-example',
    name: 'Example Starter',
    effectText: 'Keeper. Worth 1 point(s) while in play.',
    creatorId: 'starter',
    createdInRound: 0,
    destroyed: false,
    implemented: true,
    ...overrides,
  };
}

function emptyMatch(overrides: Partial<MatchState> = {}): MatchState {
  return {
    matchId: 'match-1',
    createdAt: new Date(0).toISOString(),
    decks: { human: [], claude: [] },
    innerWins: { human: 0, claude: 0 },
    round: 1,
    nextFirstPlayer: 'human',
    matchSeed: 42,
    currentInnerGame: null,
    roundHistory: [],
    phase: 'playing',
    winner: null,
    ...overrides,
  };
}

describe('server/persistence', () => {
  let dir: string;
  let paths: PersistencePaths;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lution-persistence-'));
    paths = {
      dataDir: path.join(dir, 'data'),
      nextCardsPath: path.join(dir, 'NEXT_CARDS.md'),
    };
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('readRegistry returns [] when cards.json does not exist yet', async () => {
    expect(await readRegistry(paths)).toEqual([]);
  });

  it('round-trips the registry through write then read', async () => {
    const registry = [starter(), starter({ id: 'starter-two', name: 'Two' })];
    await writeRegistry(paths, registry);
    expect(await readRegistry(paths)).toEqual(registry);
  });

  it('leaves no tmp files behind after a write', async () => {
    await writeRegistry(paths, [starter()]);
    const files = await fs.readdir(paths.dataDir);
    expect(files).toEqual(['cards.json']);
  });

  it('readMatchState returns null when match-state.json does not exist yet', async () => {
    expect(await readMatchState(paths)).toBeNull();
  });

  it('round-trips match state through write then read', async () => {
    const state = emptyMatch();
    await writeMatchState(paths, state);
    expect(await readMatchState(paths)).toEqual(state);
  });

  it('readJobs returns [] when jobs.json does not exist yet', async () => {
    expect(await readJobs(paths)).toEqual([]);
  });

  it('round-trips jobs through write then read', async () => {
    const job: JobRecord = {
      id: 'job-1',
      status: 'queued',
      round: 1,
      cardIds: ['a'],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      attempts: 0,
    };
    await writeJobs(paths, [job]);
    expect(await readJobs(paths)).toEqual([job]);
  });

  it('serializes concurrent writes to the same file without corruption', async () => {
    const writes = Array.from({ length: 20 }, (_, i) =>
      writeRegistry(paths, [starter({ id: `starter-${i}` })])
    );
    await Promise.all(writes);
    // Whichever write "won" the race, the result must be valid JSON
    // representing exactly one starter card -- never a partial/interleaved
    // write from two concurrent renames.
    const result = await readRegistry(paths);
    expect(result).toHaveLength(1);
    expect(result[0].id).toMatch(/^starter-\d+$/);
  });

  it('appendNextCardsEntry creates the file with a header on first use', async () => {
    await appendNextCardsEntry(paths, '## Round 1\n\nSomething happened.\n');
    const content = await fs.readFile(paths.nextCardsPath, 'utf8');
    expect(content).toContain('# NEXT_CARDS.md');
    expect(content).toContain('## Round 1');
    expect(content).toContain('Something happened.');
  });

  it('appendNextCardsEntry appends subsequent entries without clobbering prior ones', async () => {
    await appendNextCardsEntry(paths, '## Round 1\n\nFirst entry.\n');
    await appendNextCardsEntry(paths, '## Round 2\n\nSecond entry.\n');
    const content = await fs.readFile(paths.nextCardsPath, 'utf8');
    expect(content).toContain('First entry.');
    expect(content).toContain('Second entry.');
    expect(content.indexOf('First entry.')).toBeLessThan(content.indexOf('Second entry.'));
  });

  it('appendNextCardsEntry adds a trailing newline when the entry is missing one', async () => {
    await appendNextCardsEntry(paths, '## Round 1 (no trailing newline)');
    await appendNextCardsEntry(paths, '## Round 2');
    const content = await fs.readFile(paths.nextCardsPath, 'utf8');
    expect(content).toContain('## Round 1 (no trailing newline)\n## Round 2');
  });
});
