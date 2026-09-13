// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AnalysisService } from '../../server/analysis';
import { economyForecast, economy } from '../../server/analysis/economy';
import { analysisSchema } from '../../server/analysis/schema';
import { simulateSequence, turnFor, WorkBudget } from '../../server/analysis/core';
import { searchTurn, singleThreats, replyTo } from '../../server/analysis/tactics';
import { blockingSet, mobility, spawnGeometry } from '../../server/analysis/geometry';
import { analyzeHomeDefenseEvidence } from '../../src/game/homeCheckmate';
import { applyAction, transitionWithoutCheckmate } from '../../src/ai/simulate';
import { createInitialGameState } from '../../src/game/board';
import { calculateDefense } from '../../src/game/combat';
import { getUnitDefinition } from '../../src/game/units';
import { generateAllActions } from '../../src/ai/moves';
import type { AIAction } from '../../src/ai/types';
import { matchPositions, piece, position, snapshot } from '../fixtures/analysis';

const work = (nodes = 10000) => new WorkBudget(nodes, 10000);
const inputFor = (s: ReturnType<typeof position>, extra: object = {}) => analysisSchema.parse({ roomId: snapshot(s).id,
  expectedRevision: 1, player: 'white', topics: ['economy'], ...extra });

describe('financial checkpoints', () => {
  it('forecasts deposit collapse, partial harvests and stops before an insolvent army is retained', () => {
    const s = position([piece('miner', 'plant_3', 'white', 2, 2), piece('other', 'plant_1', 'black', 9, 9)], 0);
    s.board.cells[2][2].resourceLayers = 6;
    const before = structuredClone(s), f = economyForecast(s);
    expect(f.checkpoints.filter(c => c.player === 'white' && c.kind === 'harvest').map(c => c.amount)).toEqual([5, 1, 0, 0]);
    expect(f.failure).toMatchObject({ player: 'white', afterOwnHarvests: 4, treasury: 0, due: 2, shortfall: 2 });
    expect(f.stop).toBe('upkeep_shortfall');
    expect(s).toEqual(before);
    const detail = economy(s, inputFor(s));
    expect(detail.units[0]).toMatchObject({ next: 5, harvestsLeft: 2, reserve: 6 });
  });
  it('does not credit an incoming attacker with its end-turn income or heal the other side', () => {
    const s = position([piece('w', 'water_2', 'white', 2, 2), piece('b', 'fire_2', 'black', 5, 5)], 1);
    s.board.units[0].damageTaken = 1; s.board.units[1].damageTaken = 1;
    s.board.units[1].canActThisTurn = false;
    const next = turnFor(s, 'black').state;
    expect(next.players.black.resources).toBe(0);
    expect(next.board.units.find(u => u.id === 'b')).toMatchObject({ damageTaken: 0, canActThisTurn: true });
    expect(next.board.units.find(u => u.id === 'w')!.damageTaken).toBe(1);
    expect(next.turn.actionsRemaining).toBe(4);
  });
  it('detects a pending shortfall at checkpoint zero and respects terminal draw boundaries', () => {
    const s = position([piece('w', 'metal_3', 'white', 1, 1), piece('b', 'plant_1', 'black', 8, 8)]);
    s.upkeepPending = true; s.turn.phase = 'place';
    expect(economyForecast(s).failure?.afterOwnHarvests).toBe(0);
    const quiet = createInitialGameState(); quiet.inactivityPlies = 9;
    expect(economyForecast(quiet).stop).toBe('terminal:inactivity');
  });
});

describe('legal tactical witnesses', () => {
  it('finds a fresh purchase where existing pieces cannot kill', () => {
    const s = position([piece('target', 'plant_1', 'white', 4, 4), piece('anchor', 'plant_1', 'black', 5, 5)], 3, 'black');
    s.turn.phase = 'place';
    const existing = singleThreats(s, 'target', ['existing'], work());
    expect(existing.lines.some(l => l.lethal)).toBe(false);
    const purchases = singleThreats(s, 'target', ['purchase'], work());
    const kill = purchases.lines.find(l => l.lethal)!;
    expect(kill).toBeDefined(); expect(kill.category).toBe('purchase'); expect(kill.crystals).toBe(3);
    expect(simulateSequence(s, kill.actions).state.board.units.some(u => u.id === 'target')).toBe(false);
  });
  it('charges promotion differences and respects current placement flags', () => {
    const s = position([piece('w', 'fire_1', 'white', 3, 3), piece('b', 'plant_3', 'black', 3, 4), piece('spare', 'plant_1', 'black', 8, 8)], 4);
    s.turn.phase = 'place';
    expect(singleThreats(s, 'b', ['existing'], work()).lines.some(l => l.lethal)).toBe(false);
    const promoted = singleThreats(s, 'b', ['promotion'], work()).lines.find(l => l.lethal)!;
    expect(promoted.crystals).toBe(4);
    s.board.units[0].placedThisTurn = true;
    expect(singleThreats(s, 'b', ['promotion'], work()).lines).toHaveLength(0);
  });
  it('combines fresh purchases under one treasury and one action budget', () => {
    const s = position([piece('target', 'metal_3', 'white', 4, 4), piece('anchor', 'plant_1', 'black', 5, 3),
      piece('spare', 'plant_1', 'white', 0, 0)], 6, 'black');
    s.turn.phase = 'place';
    const result = searchTurn(s, work(20000), { targetId: 'target', categories: ['purchase'] });
    expect(result.proof).toBe('proven_possible');
    expect(result.best!.actions.filter(a => a.type === 'BUY_UNIT')).toHaveLength(2);
    expect(result.best!.crystals).toBe(6); expect(result.best!.ap).toBeLessThanOrEqual(4);
    s.players.black.resources = 5;
    expect(searchTurn(s, work(20000), { targetId: 'target', categories: ['purchase'] }).proof).not.toBe('proven_possible');
  });
  it('does not sum independent attacks that exceed the shared action budget', () => {
    const s = position([piece('a', 'fire_1', 'white', 4, 1), piece('b', 'fire_1', 'white', 1, 4),
      piece('target', 'metal_3', 'black', 4, 4), piece('spare', 'plant_1', 'black', 8, 8)]);
    s.turn.actionsRemaining = 3;
    const single = singleThreats(s, 'target', ['existing'], work());
    expect(new Set(single.lines.map(l => l.attackerId)).size).toBe(2);
    expect(searchTurn(s, work(20000), { targetId: 'target', categories: ['existing'] }).proof).not.toBe('proven_possible');
    s.turn.actionsRemaining = 4;
    const combo = searchTurn(s, work(), { targetId: 'target', categories: ['existing'] });
    expect(combo.proof).toBe('proven_possible'); expect(combo.best?.ap).toBe(4);
  });
  it('clears a blocker and uses the killing blow to unlock a second attack', () => {
    const s = position([piece('hono', 'fire_2', 'white', 9, 7), piece('blocker', 'plant_1', 'black', 9, 8),
      piece('target', 'plant_3', 'black', 9, 9), piece('wall', 'metal_3', 'white', 8, 9), piece('other', 'plant_1', 'black', 0, 0)]);
    s.board.units.find(u => u.id === 'wall')!.canActThisTurn = false;
    const result = searchTurn(s, work(), { targetId: 'target', categories: ['existing'] });
    expect(result.proof).toBe('proven_possible');
    expect(result.best!.actions.filter(a => a.type === 'ATTACK')).toHaveLength(2);
    expect(simulateSequence(s, result.best!.actions).state.board.units.some(u => u.id === 'target')).toBe(false);
    s.board.units.find(u => u.id === 'hono')!.definitionId = 'fire_1';
    expect(searchTurn(s, work(), { targetId: 'target', categories: ['existing'] }).proof).not.toBe('proven_possible');
  });
  it('search exhaustion is unknown, and an attack never moves its attacker', () => {
    const s = position([piece('w', 'water_1', 'white', 2, 2), piece('b', 'fire_1', 'black', 2, 3), piece('other', 'plant_1', 'black', 9, 9)]);
    expect(searchTurn(s, work(0), { targetId: 'b', categories: ['existing'] }).proof).toBe('unknown');
    const kill = singleThreats(s, 'b', ['existing'], work()).lines.find(l => l.lethal && l.ap === 1)!;
    expect(kill.after.board.units.find(u => u.id === 'w')!.position).toEqual({ x: 2, y: 2 });
  });
  it('returns a verified post-attack purchase recapture', () => {
    const s = position([piece('hi', 'fire_1', 'white', 4, 4), piece('bait', 'plant_1', 'black', 4, 5),
      piece('anchor', 'plant_1', 'black', 3, 6)], 4);
    const kill = singleThreats(s, 'bait', ['existing'], work()).lines.find(l => l.lethal && l.ap === 1)!;
    const reply = replyTo(kill, work(), false, 2000);
    expect(reply.proof).toBe('proven_possible');
    expect(reply).toHaveProperty('capture.category', 'purchase');
  });
  it('agrees with an unpruned exhaustive reference on small two-action positions', () => {
    const exists = (s: ReturnType<typeof position>, id: string): boolean => {
      if (!s.board.units.some(u => u.id === id)) return true;
      if (s.phase !== 'playing' || s.turn.actionsRemaining === 0) return false;
      return generateAllActions(s, s.turn.currentPlayer).filter(a => a.type === 'MOVE' || a.type === 'ATTACK')
        .some(a => exists(applyAction(s, a), id));
    };
    for (const attacker of ['fire_1', 'water_1', 'plant_1', 'metal_2', 'shadow_2', 'lightning_3']) {
      for (const defender of ['plant_1', 'water_2', 'fire_3']) {
        const s = position([piece('a', attacker, 'white', 4, 3), piece('support', 'fire_1', 'white', 3, 4),
          piece('target', defender, 'black', 4, 4), piece('spare', 'plant_1', 'black', 8, 8)]);
        s.turn.actionsRemaining = 2;
        const expected = exists(s, 'target'), result = searchTurn(s, work(20000), { targetId: 'target', categories: ['existing'] });
        expect(result.proof, `${attacker} vs ${defender}`).toBe(expected ? 'proven_possible' : 'proven_impossible');
      }
    }
  });
});

describe('geometry and hypothetical semantics', () => {
  it('changes deployment coverage after a real hypothetical anchor move and preserves the source', () => {
    const s = position([piece('anchor', 'plant_1', 'white', 3, 3), piece('enemy', 'plant_1', 'black', 8, 8)]);
    const before = structuredClone(s), action: AIAction = { type: 'MOVE', unitId: 'anchor', to: { x: 3, y: 2 } };
    const after = simulateSequence(s, [action]).state;
    expect(spawnGeometry(after, 'white').count).toBeLessThan(spawnGeometry(s, 'white').count);
    expect(s).toEqual(before);
    const set = blockingSet(s, 'white', work()); expect(set).toMatchObject({ minimum: 1, optimality: 'proven' });
  });
  it('finds sealed free regions and friendly blockers without inventing legal vacating sequences', () => {
    const s = position([piece('trapped', 'plant_1', 'white', 0, 0), piece('right', 'plant_1', 'white', 1, 0),
      piece('below', 'plant_1', 'white', 0, 1), ...Array.from({ length: 10 }, (_, y) => piece(`wall${y}`, 'plant_1', 'black', 5, y))]);
    const report = mobility(s, inputFor(s));
    expect(report.units.find(u => u.id === 'trapped')).toMatchObject({ trapped: true });
    expect(report.regions.length).toBe(2);
    expect(report.units.find(u => u.id === 'trapped')!.friendlyBlockers.map(b => b.id)).toEqual(['below', 'right']);
  });
  it('rejects overwritten defenders, bad instances, stale revisions, room actions and cross-turn batches', () => {
    const s = position([piece('w', 'water_1', 'white', 2, 2), piece('b', 'plant_1', 'black', 8, 8)]), service = new AnalysisService(), room = snapshot(s);
    const request = { roomId: room.id, expectedRevision: 1, player: 'white', topics: ['threats'] };
    expect(() => service.analyze(room, { ...request, expectedRevision: 0 })).toThrow(/revision/);
    expect(() => service.analyze(room, { ...request, targets: { defenders: [{ square: 'I9', owner: 'white', definitionId: 'fire_1' }] } })).toThrow(/overwrite/);
    expect(() => service.analyze(room, { ...request, targets: { unitIds: ['missing'] } })).toThrow(/No unit/);
    expect(() => simulateSequence(s, [{ type: 'UNDO' }])).toThrow(/preview/);
    expect(() => simulateSequence(s, [{ type: 'END_ACTION_PHASE' }, { type: 'END_ACTION_PHASE' }])).toThrow(/illegal/);
  });
  it('cancels queued actions only on immediate home checkmate, like preview', () => {
    const s = position([piece('w', 'plant_1', 'white', 9, 8), piece('b', 'plant_1', 'black', 3, 3)]);
    const line = simulateSequence(s, [{ type: 'MOVE', unitId: 'w', to: { x: 9, y: 9 } }, { type: 'END_ACTION_PHASE' }]);
    expect(line.applied).toHaveLength(1); expect(line.state.victoryReason).toBe('home-checkmate');
  });
  it('uses exact damage bounds for catalogue survival and labels empty-square profiles as conditional', () => {
    const s = position([piece('w', 'plant_1', 'white', 0, 0), piece('fire', 'fire_1', 'black', 2, 3)]);
    const room = snapshot(s), service = new AnalysisService();
    const result = service.analyze(room, { roomId: room.id, expectedRevision: 1, player: 'white', topics: ['survival'],
      targets: { squares: ['C3'] }, categories: ['existing'], detail: 'full', searchBudget: { maxNodes: 2000, maxMs: 750 } });
    const rows = result.sections.survival as { profiles: { definitionId: string; survives: string; minimumDefense: object }[] }[];
    expect(rows[0].profiles.find(p => p.definitionId === 'plant_1')?.survives).toBe('proven_impossible');
    expect(rows[0].profiles.find(p => p.definitionId === 'plant_3')).toMatchObject({ survives: 'proven_possible',
      minimumDefense: { status: 'proven', lowerBound: 4, sufficientUpperBound: 4 } });
  });
  it('honors cancellation and does not cache an abandoned tactical query', () => {
    const s = position([piece('w', 'fire_1', 'white', 4, 4), piece('target', 'plant_1', 'black', 4, 5), piece('spare', 'plant_1', 'black', 8, 8)]);
    const room = snapshot(s), service = new AnalysisService(), request = { roomId: room.id, expectedRevision: 1, player: 'white', topics: ['threats'],
      targets: { unitIds: ['target'] }, categories: ['existing'], replies: false };
    const cancelled = service.analyze(room, request, AbortSignal.abort());
    expect(cancelled.sections.threats).toMatchObject([{ kill: 'unknown' }]);
    expect(service.analyze(room, request).sections.threats).toMatchObject([{ kill: 'proven_possible' }]);
  });
  it('batches opponent reply objectives for multiple friendly targets in one call', () => {
    const s = position([piece('first', 'fire_1', 'white', 4, 4), piece('second', 'fire_1', 'white', 5, 4),
      piece('water', 'water_1', 'black', 4, 5), piece('shadow', 'shadow_1', 'black', 5, 5)]);
    const room = snapshot(s), service = new AnalysisService();
    const report = service.analyze(room, { roomId: room.id, expectedRevision: 1, player: 'white', topics: ['reply'],
      targets: { unitIds: ['first', 'second'] }, categories: ['existing'], detail: 'full' });
    expect(report.sections.reply).toMatchObject({ model: { actor: 'black' }, results: [
      { target: 'first', proof: 'proven_possible' }, { target: 'second', proof: 'proven_possible' },
    ] });
  });
  it('checks exposure for every attacker participating in a combined kill', () => {
    const s = position([piece('target', 'metal_3', 'white', 4, 4), piece('anchor', 'plant_1', 'black', 5, 3),
      piece('spare', 'plant_1', 'white', 0, 0)], 6, 'black');
    s.turn.phase = 'place';
    const room = snapshot(s), service = new AnalysisService();
    const report = service.analyze(room, { roomId: room.id, expectedRevision: 1, player: 'white', topics: ['threats'],
      targets: { unitIds: ['target'] }, categories: ['combined'], deep: true, detail: 'full', searchBudget: { maxNodes: 10000, maxMs: 750 } });
    const rows = report.sections.threats as { lines: { category: string; lethal: boolean; exposure?: { replies: { attacker: string }[] } }[] }[];
    const combination = rows[0].lines.find(l => l.category === 'combined' && l.lethal)!;
    expect(new Set(combination.exposure!.replies.map(r => r.attacker)).size).toBe(2);
  });
  it('preserves the hypothetical state and permissions in size-budget recovery queries', () => {
    const s = position([piece('anchor', 'plant_1', 'white', 3, 3), piece('enemy', 'plant_1', 'black', 8, 8)]);
    const room = snapshot(s), service = new AnalysisService();
    const actions = [{ type: 'MOVE', unitId: 'anchor', to: 'D3' }];
    const report = service.analyze(room, { roomId: room.id, expectedRevision: 1, player: 'white',
      topics: ['economy', 'mobility', 'matchups'], hypotheticalActions: actions, detail: 'headline', categories: ['existing'] });
    const recovery = report.next.find(n => n.arguments.limit === 1)!;
    expect(recovery.arguments).toMatchObject({ hypotheticalActions: actions, categories: ['existing'], stateKind: 'current' });
  });
  it('reports a defender released during handoff without inventing an approach attack on its empty square', () => {
    const s = position([piece('released', 'water_2', 'white', 4, 4), piece('kept', 'plant_1', 'white', 0, 0),
      piece('enemy', 'fire_1', 'black', 4, 5)]);
    s.upkeepPending = true; s.turn.phase = 'place';
    const room = snapshot(s), report = new AnalysisService().analyze(room, { roomId: room.id, expectedRevision: 1, player: 'white',
      topics: ['threats'], targets: { unitIds: ['released'] }, categories: ['existing'], detail: 'full' });
    expect(report.sections.threats).toMatchObject([{ targetPresentAfterSetup: false, lines: [], approaches: [] }]);
  });
});

describe('home proof evidence and replay fixtures', () => {
  it('replays the prover rescue including its promotion and upkeep basis', () => {
    const s = position([piece('occupier', 'fire_1', 'white', 9, 9), piece('rescuer', 'lightning_1', 'black', 0, 7)], 4);
    const proof = analyzeHomeDefenseEvidence(s, 'white', transitionWithoutCheckmate);
    expect(proof.result).toBe('rescue'); expect(proof.categories).toContain('promotion');
    let reply = { ...s, upkeepPending: true, turn: { ...s.turn, currentPlayer: 'black' as const, phase: 'place' as const } };
    for (const action of proof.witness!) { const next = applyAction(reply, action); expect(next).not.toBe(reply); reply = next as typeof reply; }
    expect(reply.board.units.some(u => u.id === 'occupier')).toBe(false);
  });
  it('replays all archived commands from the recorded root through the engine and replay module', () => {
    const match = matchPositions();
    expect(match.recordingStart.complete).toBe(false);
    expect(match.final).toEqual(match.expectedFinal);
    for (const revision of [13, 19, 23, 29, 31, 32, 33]) {
      const room = match.positions.get(revision)!;
      expect(room.lastTurnReplay?.frames.length).toBeGreaterThan(0);
      expect(room.state.board.units.every(u => calculateDefense(u) > 0 && getUnitDefinition(u.definitionId))).toBe(true);
    }
  });
  it('categorizes and replays a voluntary upkeep release that opens the rescue route', () => {
    const s = position([piece('occupier', 'plant_3', 'white', 9, 9), piece('rescuer', 'fire_2', 'black', 9, 7),
      piece('blocker', 'metal_2', 'black', 9, 8), piece('wall1', 'metal_3', 'white', 8, 8), piece('wall2', 'metal_3', 'white', 8, 9)], 2);
    const proof = analyzeHomeDefenseEvidence(s, 'white', transitionWithoutCheckmate);
    expect(proof.categories).toContain('upkeep_choice');
    const pending = { ...s, upkeepPending: true, turn: { ...s.turn, currentPlayer: 'black' as const, phase: 'place' as const } };
    expect(simulateSequence(pending, proof.witness!).state.board.units.some(u => u.id === 'occupier')).toBe(false);
  });
  it('keys caches by complete state and parameters, returns honest diff baselines, and never changes rooms', () => {
    const service = new AnalysisService(), room = snapshot(createInitialGameState()), before = structuredClone(room);
    const request = { roomId: room.id, expectedRevision: 1, player: 'white', topics: ['economy'] };
    const first = service.analyze(room, request);
    expect(service.analyze(room, request)).toEqual(first);
    const diff = service.analyze(room, { ...request, sinceRevision: 1 }); expect(diff.sections).toEqual({});
    const noBaseline = service.analyze(room, { ...request, sinceRevision: 0 }); expect(noBaseline.diff).toMatchObject({ mode: 'full' });
    expect(room).toEqual(before);
    const changed = { ...room, state: { ...room.state, players: { ...room.state.players, white: { ...room.state.players.white, resources: 123 } } } };
    expect(service.analyze(changed, request).sections).not.toEqual(first.sections);
  });
});
