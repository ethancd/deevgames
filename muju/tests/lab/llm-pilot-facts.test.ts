// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MoveHistoryEntry } from '../../src/game/moveHistory';
import {
  computeFacts, fetchRoomHistory, outcomeRow, prepareReflectionFacts, renderFactsMarkdown, summarizeFacts,
  type FactsManifest, type HistoryPage, type HistoryRequest,
} from '../../tools/llm-pilot/facts';

// Real wave-1 game AS01-W (room 4fac4dfa80eacd839d1fdcb2e9523449): Astra 6 High as White, h1, won on
// the kill clock at r11, mined 58 v 31 (30 + 1); Hard made 0 attacks and passed outright at r7.
const as01wHistory = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/llm-pilot-as01w-history.json'), 'utf8')) as HistoryPage;
const as01wManifest: FactsManifest = {
  gameId: 'AS01-W', roomId: '4fac4dfa80eacd839d1fdcb2e9523449', llmSeat: 'white', engineSeat: 'black', blackCrystalHandicap: 1,
  model: 'astra', cliModel: 'gpt-6-astra', effort: 'high', toolTier: 'centaur', displayName: 'Astra 6 High',
  timeControl: { delaySeconds: 120, bankSeconds: 2400 }, startedAt: '2026-09-24T07:48:43.044Z',
};

describe('computeFacts on AS01-W (saved real history)', () => {
  const facts = computeFacts(as01wHistory, as01wManifest);

  it('matches the numbers the wave-1 digest and operator notes state', () => {
    expect(facts.identity).toMatchObject({ finalRevision: 11, result: 'win', winner: 'white', victoryReason: 'kill-clock', llmTurns: 5, hardTurns: 5 });
    expect(facts.mined).toMatchObject({ white: 58, black: 31, llm: 58, hard: 31, handicap: 1 });
    const hard = facts.sides.black;
    expect(hard).toMatchObject({ attacks: 0, kills: 0, promotions: 0, passTurns: 1, passRevisions: [7], buys: 7 });
    expect(hard.buysByClass).toEqual({ lightning_1: 3, shadow_1: 3, water_1: 1 });
    // Occupying C1 at r9 cancelled three of Astra's queued summons (refund 14).
    expect(facts.sides.white).toMatchObject({ disruptedSummons: 3, refunded: 14, promotions: 1, promotionRevisions: [10] });
  });

  it('runs the kill clock one ply per hand-off to ten, with no kills', () => {
    expect(facts.turns.map(t => t.killClock)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(facts.turns.map(t => t.revision)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(facts.killClock).toMatchObject({ final: 10, kills: [], longestQuiet: { plies: 10, fromRevision: 2, toRevision: 11 } });
    // White's mined total after its turn at r6 is 30; Black's is 13 until it mines at r7 (13 v 30 at Hard's pass).
    expect(facts.turns.find(t => t.revision === 6)).toMatchObject({ white: 30, black: 13 });
    expect(facts.mined.firstGap).toMatchObject({ revision: 8, leader: 'white', white: 45, black: 21 });
    expect(Object.values(facts.checks).every(Boolean)).toBe(true);
  });

  it('times turns from history timestamps', () => {
    expect(facts.timing.llm.slowest[0]).toMatchObject({ revision: 10 });
    expect(facts.timing.llm.estBankUsedS).toBe(0);
    expect(facts.timing.hard.medianS).toBeGreaterThan(50);
  });

  it('renders a compact sheet, a summary and a digest row', () => {
    const md = renderFactsMarkdown(facts);
    expect(md.split('\n').length).toBeLessThanOrEqual(62);
    expect(md).toContain('White 58 v Black 31 (30 + 1)');
    expect(md).toContain('| Pass turns | 0 | 1 (r7) |');
    expect(summarizeFacts(facts)).toMatchObject({ finalRevision: 11, minedLlm: 58, minedHard: 31, passTurns: { llm: 0, hard: 1 },
      attacks: { llm: 0, hard: 0 }, firstGapRevision: 8, firstGapLeader: 'llm', lastKillRevision: null });
    expect(outcomeRow(facts)).toBe('| AS01-W | Astra 6 High | centaur | 1 | white | 120/2400 | **WIN** | kill-clock | 5 | 0 / 0 / 1 | 58 v 31 | 11 | 0 / 0 |');
  });
});

// Minimal synthetic entries for the kill / zero-damage paths the short real game never reaches.
let seq = 0;
function entry(revision: number, player: 'white' | 'black', turnNumber: number, event: Record<string, unknown>): MoveHistoryEntry {
  seq += 1;
  return { sequence: seq, revision, player, turnNumber, notation: '', description: '', timestamp: new Date(Date.UTC(2026, 8, 24, 0, 0, revision * 10)).toISOString(), undoneAtRevision: null, ...event } as unknown as MoveHistoryEntry;
}
const unit = (symbol: string, square: string) => ({ id: square, definitionId: 'fire_1', name: 'x', player: 'white', symbol, square });
const turnEnd = (revision: number, player: 'white' | 'black', turnNumber: number, mined: number) => [
  entry(revision, player, turnNumber, { kind: 'mining', total: mined, bankBefore: 0, bankAfter: mined, takes: [] }),
  entry(revision, player, turnNumber, { kind: 'upkeep', automatic: true, paid: 0, bankBefore: 0, bankAfter: 0, kept: [], released: [] }),
];

describe('computeFacts kill clock and attacks (synthetic)', () => {
  seq = 0;
  const entries = [
    ...turnEnd(1, 'white', 1, 5),
    entry(2, 'black', 1, { kind: 'move', unit: unit('🔥1', 'J9'), from: 'J9', to: 'J8', path: [], ap: 1, speed: 1 }),
    ...turnEnd(2, 'black', 1, 3),
    entry(3, 'white', 2, { kind: 'attack', unit: unit('🔥1', 'C3'), target: unit('💧1', 'C4'), ap: 1, attackPower: 0, defenseBefore: 3, defenseAfter: 3, killed: false }),
    entry(3, 'white', 2, { kind: 'attack', unit: unit('🔥1', 'C2'), target: unit('💧1', 'C4'), ap: 1, attackPower: 3, defenseBefore: 3, defenseAfter: 0, killed: true }),
    ...turnEnd(3, 'white', 2, 4),
    ...turnEnd(4, 'black', 2, 2),
    entry(5, 'white', 3, { kind: 'summoning', summoned: [], disrupted: ['🔥1@A3'], refunded: 3 }),
    ...turnEnd(5, 'white', 3, 1),
    entry(6, 'black', 3, { kind: 'attack', unit: unit('🔥1', 'A1'), target: unit('🔥1', 'A2'), ap: 1, attackPower: 3, defenseBefore: 2, defenseAfter: 0, killed: true }),
    entry(6, 'black', 3, { kind: 'result', winner: 'black', reason: 'home-checkmate' }),
  ];
  const facts = computeFacts({ revision: 6, entries }, { gameId: 'T01-W', roomId: 'r', llmSeat: 'white', blackCrystalHandicap: 4 });

  it('resets the clock on the killer\'s hand-off and records the reset with mined totals at the kill', () => {
    expect(facts.turns.map(t => t.killClock)).toEqual([1, 2, 0, 1, 2, null]);
    expect(facts.killClock.kills).toEqual([
      expect.objectContaining({ revision: 3, killer: 'white', clockBefore: 2, white: 5, black: 7, leader: 'black' }),
      expect.objectContaining({ revision: 6, killer: 'black', clockBefore: 2, white: 10, black: 9, leader: 'white' }),
    ]);
    expect(facts.identity).toMatchObject({ result: 'loss', victoryReason: 'home-checkmate', llmTurns: 3, hardTurns: 3 });
  });

  it('counts passes, zero-damage attacks and disrupted summons per side', () => {
    expect(facts.sides.white).toMatchObject({ attacks: 2, kills: 1, zeroDamageAttacks: 1, zeroDamageRevisions: [3], passTurns: 2, passRevisions: [1, 5], disruptedSummons: 1, refunded: 3 });
    expect(facts.sides.black).toMatchObject({ attacks: 1, kills: 1, passTurns: 1, passRevisions: [4], mined: 9 });
    expect(facts.mined).toMatchObject({ white: 10, black: 9, leadChanges: 2 });
  });
});

describe('fetching and the play→reflect hook', () => {
  it('paginates the history by sequence', async () => {
    const all = as01wHistory.entries;
    const calls: string[] = [];
    const request: HistoryRequest = async <T>(p: string) => {
      calls.push(p);
      const after = Number(new URLSearchParams(p.split('?')[1]).get('after'));
      const page = all.filter(e => e.sequence > after).slice(0, 30);
      return { roomId: 'x', revision: 11, total: all.length, hasLater: page.at(-1)!.sequence < all.at(-1)!.sequence, entries: page } as T;
    };
    const history = await fetchRoomHistory(request, 'x');
    expect(history.entries).toHaveLength(all.length);
    expect(calls).toEqual(['/x/history?after=0&limit=200', '/x/history?after=30&limit=200', '/x/history?after=60&limit=200']);
  });

  it('writes facts.json/facts.md to the game dir and copies facts.md into the workspace', async () => {
    const root = mkdtempSync(join(tmpdir(), 'muju-facts-'));
    const gameDir = join(root, 'game'), workspace = join(root, 'ws');
    mkdirSync(gameDir); mkdirSync(workspace);
    writeFileSync(join(gameDir, 'manifest.json'), JSON.stringify(as01wManifest));
    const request: HistoryRequest = async <T>() => ({ ...as01wHistory, hasLater: false }) as T;
    await expect(prepareReflectionFacts(gameDir, workspace, { request })).resolves.toBe(true);
    expect(JSON.parse(readFileSync(join(gameDir, 'facts.json'), 'utf8')).mined.white).toBe(58);
    expect(readFileSync(join(workspace, 'facts.md'), 'utf8')).toContain('# Fact sheet — AS01-W');
  });

  it('never throws: a failed fetch is logged and the reflection proceeds', async () => {
    const root = mkdtempSync(join(tmpdir(), 'muju-facts-'));
    const gameDir = join(root, 'game'), workspace = join(root, 'ws');
    mkdirSync(gameDir); mkdirSync(workspace);
    writeFileSync(join(gameDir, 'manifest.json'), JSON.stringify(as01wManifest));
    const request: HistoryRequest = async () => { throw new Error('network down'); };
    await expect(prepareReflectionFacts(gameDir, workspace, { request })).resolves.toBe(false);
    expect(readFileSync(join(gameDir, 'player', 'facts.log'), 'utf8')).toContain('network down');
    expect(existsSync(join(workspace, 'facts.md'))).toBe(false);
  });
});
