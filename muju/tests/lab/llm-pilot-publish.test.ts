// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// CAMPAIGN_DIR is read from MUJU_PILOT_CAMPAIGN_DIR at module-load time, so it
// must be set BEFORE either module is first imported in this process.
const campaignDir = mkdtempSync(join(tmpdir(), 'muju-llm-pilot-publish-'));
process.env.MUJU_PILOT_CAMPAIGN_DIR = campaignDir;

const { actionsLogPath, gameDir } = await import('../../tools/llm-pilot/pilot');
const { appendExperience, assertCitationsExist, curatePlaybook, freezeSnapshot, readExperiences,
  playbookVersion, UncitedRevisionError, withPublishLock } = await import('../../tools/llm-pilot/publish');

function fakeGame(id: string, revisions: number[]) {
  mkdirSync(gameDir(id as never), { recursive: true });
  for (const revision of revisions) {
    appendFileSync(actionsLogPath(id as never), `${JSON.stringify({ at: new Date().toISOString(), revision, requestId: `r${revision}`, actions: [] })}\n`);
  }
}

describe('publish.ts', () => {
  beforeEach(() => { rmSync(campaignDir, { recursive: true, force: true }); mkdirSync(campaignDir, { recursive: true }); });
  afterEach(() => { rmSync(campaignDir, { recursive: true, force: true }); });

  it('accepts a reflection whose cited revisions all appear in its own actions.jsonl', async () => {
    fakeGame('P01-W', [1, 2, 3]);
    const record = { gameId: 'P01-W' as never, pairId: 'P01', model: 'luna' as const, effort: 'low' as const,
      toolTier: 'bare' as const, llmSeat: 'white' as const, handicap: 1, result: 'win' as const, turns: 3,
      citedRevisions: [2, 3], reflection: 'won at revision 2 and 3', writtenAt: new Date().toISOString() };
    await expect(appendExperience(record)).resolves.toMatchObject({ citedRevisions: [2, 3] });
    expect(readExperiences()).toHaveLength(1);
  });

  it('with a finalRevision, keeps every real room revision (engine moves too) and drops the rest', async () => {
    fakeGame('P02-W', [2]);
    const record = { gameId: 'P02-W' as never, pairId: 'P02', model: 'sonnet' as const, effort: 'low' as const,
      toolTier: 'bare' as const, llmSeat: 'white' as const, handicap: 2, result: 'loss' as const, turns: 2,
      citedRevisions: [3, 7, 99], finalRevision: 12, reflection: 'engine struck at revision 3; revision 99 is made up',
      writtenAt: new Date().toISOString() };
    const published = await appendExperience(record);
    expect(published.citedRevisions).toEqual([3, 7]);
    expect(published.droppedCitations).toEqual([99]);
    expect(readExperiences()[0].droppedCitations).toEqual([99]);
  });

  it('rejects a reflection citing a revision that never happened in that game', async () => {
    fakeGame('P01-B', [1, 2]);
    const record = { gameId: 'P01-B' as never, pairId: 'P01', model: 'luna' as const, effort: 'low' as const,
      toolTier: 'bare' as const, llmSeat: 'black' as const, handicap: 1, result: 'loss' as const, turns: 2,
      citedRevisions: [2, 99], reflection: 'claims revision 99', writtenAt: new Date().toISOString() };
    expect(() => assertCitationsExist(record)).toThrow(UncitedRevisionError);
    await expect(appendExperience(record)).rejects.toThrow(/revision\(s\) \[99\]/);
    expect(readExperiences()).toHaveLength(0); // rejected citation never partially appends
  });

  it('serializes concurrent appends through the single-writer lock (no interleaved lines)', async () => {
    fakeGame('P02-W', [1]);
    fakeGame('P02-B', [1]);
    const recordFor = (id: string, seat: 'white' | 'black') => ({ gameId: id as never, pairId: 'P02', model: 'sonnet' as const,
      effort: 'low' as const, toolTier: 'bare' as const, llmSeat: seat, handicap: 2, result: 'win' as const, turns: 1,
      citedRevisions: [1], reflection: `reflection for ${id}`, writtenAt: new Date().toISOString() });
    await Promise.all([appendExperience(recordFor('P02-W', 'white')), appendExperience(recordFor('P02-B', 'black'))]);
    const lines = readExperiences();
    expect(lines).toHaveLength(2);
    expect(new Set(lines.map(l => l.gameId)).size).toBe(2);
  });

  it('curatePlaybook --dry-run composes a versioned prompt without writing or spawning', async () => {
    const result = await curatePlaybook({ dryRun: true });
    expect(result.wrote).toBe(false);
    expect(result.nextVersion).toBe(1); // no playbook yet -> version 0 -> next 1
    expect(result.prompt).toContain('Write version: 1');
    expect(result.prompt).toContain('A record with "engineProfile"'); // STRATEGOS W1.14: kept apart from desktop evidence
    expect(playbookVersion()).toBe(0); // untouched
  });

  it('freezeSnapshot copies the current (possibly empty) memory into snapshots/v<N>', () => {
    const dir = freezeSnapshot(1);
    expect(dir).toContain('v1');
  });

  it('withPublishLock reclaims a stale lock left by a dead pid', async () => {
    // Simulate a crashed publisher: a lock directory whose holder pid is not alive.
    const { mkdirSync: mkdir, writeFileSync } = await import('node:fs');
    const lockDir = join(campaignDir, 'memory', '.publish.lock');
    mkdir(lockDir, { recursive: true });
    writeFileSync(join(lockDir, 'holder.json'), JSON.stringify({ pid: 999999, startedAt: new Date().toISOString() }));
    let ran = false;
    await withPublishLock(() => { ran = true; }, { timeoutMs: 2000, pollMs: 20 });
    expect(ran).toBe(true);
  });
});
