import { describe, it, expect } from 'vitest';
import { createInitialGameState } from '../src/game/board';
import { applyAction } from '../src/ai/simulate';
import { generateMoveActions, generatePlaceActions, generateAttackActions } from '../src/ai/moves';
import { analysisFrames, startHistory } from '../src/game/analysis';
import { isLegalAction } from '../src/game/legality';
import { formatPositionReport, type PositionReportInput } from '../src/utils/positionReport';
import { formatCompactReport, parseCompactReport } from '../src/utils/compactReport';
import type { AIAction } from '../src/ai/types';
import type { GameState } from '../src/game/types';

/** A deterministic few turns of real play: moves, an attack if one appears, mining, summons. */
function play(turns: number) {
  let state = createInitialGameState(undefined, undefined, 0, 'phasing');
  const history = startHistory(state, true); let last: AIAction[] = [];
  const act = (action: AIAction) => { const next = applyAction(state, action); expect(next).not.toBe(state);
    history.frames.push(...analysisFrames(state, action, next)); last.push(action); state = next; };
  for (let t = 0; t < turns && state.phase === 'playing'; t++) {
    const player = state.turn.currentPlayer; last = [];
    for (let i = 0; i < 3 && state.turn.actionsRemaining > 0; i++) {
      const options = [...generateAttackActions(state, player), ...generateMoveActions(state, player)];
      if (!options.length) break;
      act(options[(t * 7 + i * 3) % options.length]);
    }
    act({ type: 'END_ACTION_PHASE' });
    if (state.upkeepPending) act({ type: 'PAY_UPKEEP', keepUnitIds: state.board.units.filter(u => u.owner === player && u.definitionId.endsWith('_1')).map(u => u.id) });
    const buys = generatePlaceActions(state, player);
    if (buys.length) act(buys[t % buys.length]);
    if (state.turn.currentPlayer === player) act({ type: 'END_PLACE_PHASE' });
  }
  return { state, history, last };
}
const comparable = (state: GameState) => ({
  cells: state.board.cells.flat().map(c => c.resourceLayers), initial: state.board.initialResourceLayers,
  units: state.board.units.map(({ id: _id, attackedThisTurn, ...u }) => ({ ...u, placedThisTurn: !!u.placedThisTurn, promotedThisPlacement: !!u.promotedThisPlacement,
    lastAttackKilled: !!u.lastAttackKilled, attacked: attackedThisTurn?.length ?? 0 })),
  summons: (state.pendingSummons ?? []).map(({ id: _id, ...s }) => s),
  players: state.players, turn: state.turn, ruleset: state.ruleset, upkeepPending: !!state.upkeepPending,
  inactivityPlies: state.inactivityPlies ?? 0, progress: !!state.progressThisTurn, phase: state.phase,
});

describe('compact position report', () => {
  for (const turns of [1, 4, 9]) it(`round-trips a Phasing position after ${turns} turns and stays small`, () => {
    const { state, history, last } = play(turns);
    const input: PositionReportInput = { state, difficulty: 'hard', pace: 'deep', engine: 'hard', lastTurnActions: last, note: 'fire  wandered\noff' };
    const text = formatCompactReport(input, history), parsed = parseCompactReport(text);
    expect(comparable(parsed.state)).toEqual(comparable(state));
    expect(parsed.note).toBe('fire wandered off');
    // Fresh ids, same report: nothing that is written depends on what was dropped.
    expect(formatCompactReport({ ...input, state: parsed.state, lastTurnActions: [] }).split('\n').filter(l => !l.startsWith('last ')))
      .toEqual(text.split('\n').filter(l => !l.startsWith('last ') && !l.startsWith('game ')));
    // The rebuilt position is playable under the canonical rules.
    const player = parsed.state.turn.currentPlayer;
    const moves = parsed.state.turn.phase === 'action' ? generateMoveActions(parsed.state, player) : generatePlaceActions(parsed.state, player);
    for (const move of moves.slice(0, 3)) expect(isLegalAction(parsed.state, move)).toBe(true);
    expect(text).toMatch(/^[\x20-\x7E\n]*$/);
    // The position itself is ~60x smaller than the JSON; even with the whole game score attached it stays far below it.
    const json = formatPositionReport(input).length, position = formatCompactReport(input).length;
    expect(position * 50).toBeLessThan(json);
    expect(text.length * 10).toBeLessThan(json);
    if (process.env.SHOW_REPORT) console.log(`turns=${turns} json=${json} position=${position} withGame=${text.length}\n${text}`);
  });

  it('refuses a report it does not understand', () => {
    expect(() => parseCompactReport('muju/1 phasing | hard deep hard | T1 white action ap4/4')).toThrow(/Unsupported/);
    const { state } = play(1);
    const text = formatCompactReport({ state, difficulty: 'hard', pace: 'deep', engine: 'hard', lastTurnActions: [], note: null });
    expect(() => parseCompactReport(text.replace(/wF1([a-j])/, 'wQ1$1'))).toThrow(/Malformed unit/);
  });
});
