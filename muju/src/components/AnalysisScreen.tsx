import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameView } from './GameScreen';
import { createInitialGameState, getUnitById } from '../game/board';
import { gameReducer } from '../hooks/useGameState';
import { applyAction } from '../ai/simulate';
import { automaticUpkeepUndo } from '../game/turn';
import { describeTransition, movementStep, type MoveHistoryEntry, type RoomMoveHistory } from '../game/moveHistory';
import type { AIAction } from '../ai/types';
import type { GameConfig, GameState, PlayerId, Position } from '../game/types';
import { parseObserverConnection, roomRequest } from '../online/client';
import './AnalysisScreen.css';

interface Frame { sequence: number; step: number; label: string; turn: string }
interface LocalFrame { state: GameState; label: string; turn: string }
interface Variation { frames: LocalFrame[]; cursor: number }
const turnKey = (state: GameState) => `${state.turn.turnNumber}.${state.turn.currentPlayer}`;
const localFrame = (state: GameState, label = 'Starting position'): LocalFrame => ({ state, label, turn: turnKey(state) });
const config: GameConfig = { mode: 'pass-play', controls: { white: 'human', black: 'human' }, aiDifficulty: { white: 'medium', black: 'medium' } };
function entryFrames(entry: MoveHistoryEntry): Frame[] {
  const count = entry.kind === 'move' ? entry.ap : 1;
  const turn = `${entry.positionTurn?.turnNumber ?? entry.turnNumber}.${entry.positionTurn?.player ?? entry.player}`;
  return Array.from({ length: count }, (_, i) => ({ sequence: entry.sequence, step: i + 1, turn,
    label: count > 1 ? `${entry.notation} · step ${i + 1}/${count}` : entry.notation }));
}

export function AnalysisScreen() {
  const [query] = useState(() => new URLSearchParams(window.location.search));
  const roomId = query.get('room'), server = query.get('server') || window.location.origin;
  const [initial] = useState(createInitialGameState);
  const [frames, setFrames] = useState<Frame[]>([]), [cursor, setCursor] = useState(0);
  const [position, setPosition] = useState<GameState>(initial);
  const [variation, setVariation] = useState<Variation | null>(roomId ? null : { frames: [localFrame(initial)], cursor: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!roomId), [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0), [partial, setPartial] = useState(false), [roomInput, setRoomInput] = useState('');
  const cache = useRef(new Map<string, GameState>());
  const reviewing = !!roomId && !variation;

  useEffect(() => {
    if (!roomId) return;
    const controller = new AbortController();
    setLoading(true); setError(''); cache.current.clear();
    void (async () => {
      const all: MoveHistoryEntry[] = [];
      let after = 0, first: RoomMoveHistory | undefined;
      do {
        const page = await roomRequest<RoomMoveHistory>(server, `/${roomId}/history?after=${after}&limit=200`, undefined, undefined, controller.signal);
        first ??= page; all.push(...page.entries);
        if (!page.hasLater || !page.entries.length) break;
        after = page.entries.at(-1)!.sequence;
      } while (!controller.signal.aborted);
      if (controller.signal.aborted || !first) return;
      const root = await roomRequest<{ state: GameState }>(server, `/${roomId}/positions/0`, undefined, undefined, controller.signal);
      if (controller.signal.aborted) return;
      const timeline = [{ sequence: 0, step: 1, label: first.recordingStart.complete ? 'Starting position' : 'First recorded position', turn: turnKey(root.state) }, ...all.flatMap(entryFrames)];
      cache.current.set('0:1', root.state);
      setPartial(!first.recordingStart.complete); setFrames(timeline); setVariation(null);
      const requested = Number(query.get('event'));
      const requestedIndex = timeline.reduce((found, frame, i) => frame.sequence === requested ? i : found, -1);
      setCursor(Math.max(0, requested > 0 ? requestedIndex : timeline.length - 1));
      setPosition(root.state);
    })().catch(error => { if (!controller.signal.aborted) { setError(error.message); setLoading(false); } });
    return () => controller.abort();
  }, [roomId, server, refresh, query]);
  useEffect(() => {
    const frame = frames[cursor];
    if (!reviewing || !frame) return;
    const key = `${frame.sequence}:${frame.step}`, saved = cache.current.get(key);
    if (saved) { setPosition(saved); setLoading(false); setError(''); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    roomRequest<{ state: GameState }>(server, `/${roomId}/positions/${frame.sequence}?step=${frame.step}`, undefined, undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) { cache.current.set(key, result.state); setPosition(result.state); setLoading(false); } })
      .catch(error => { if (!controller.signal.aborted) { setError(error.message); setLoading(false); } });
    return () => controller.abort();
  }, [cursor, frames, reviewing, roomId, server]);

  const rawState = variation ? variation.frames[variation.cursor].state : position;
  const timeline = variation?.frames ?? frames, index = variation?.cursor ?? cursor;
  useEffect(() => { setSelected(null); }, [rawState]);
  const state = useMemo(() => selected ? gameReducer(rawState, { type: 'SELECT_UNIT', unitId: selected }) : rawState, [rawState, selected]);
  const go = (next: number) => {
    const bounded = Math.max(0, Math.min(timeline.length - 1, next));
    setSelected(null);
    if (variation) setVariation({ ...variation, cursor: bounded }); else setCursor(bounded);
  };
  const previousTurn = () => {
    let target = Math.max(0, index - 1);
    while (target > 0 && timeline[target].turn === timeline[index].turn) target--;
    while (target > 0 && timeline[target - 1].turn === timeline[target].turn) target--;
    go(target);
  };
  const nextTurn = () => {
    let target = index + 1;
    while (target < timeline.length - 1 && timeline[target].turn === timeline[index].turn) target++;
    go(target);
  };
  const dispatch = useCallback((actions: AIAction[]) => {
    setVariation(current => {
      if (!current) return current;
      let before = current.frames[current.cursor].state;
      const added: LocalFrame[] = [];
      for (const action of actions) {
        const after = applyAction(before, action);
        if (before === after) return current;
        const events = describeTransition(before, action, after);
        for (const event of events) {
          const steps = event.kind === 'move' ? event.ap : 1;
          for (let step = 1; step <= steps; step++) {
            const snapshot = event.kind === 'mining' ? automaticUpkeepUndo(before, after) ?? after : movementStep(before, after, event, step);
            added.push(localFrame(snapshot, `${event.notation}${steps > 1 ? ` · step ${step}/${steps}` : ''}`));
          }
        }
        if (!events.length) added.push(localFrame(after, action.type === 'END_PLACE_PHASE' ? 'Start actions' : action.type));
        before = after;
        if (after.phase === 'victory') break;
      }
      const next = [...current.frames.slice(0, current.cursor + 1), ...added];
      return { frames: next, cursor: next.length - 1 };
    });
    setSelected(null);
  }, []);
  const game = {
    state, lastTurnReplay: null, selectUnit: setSelected, deselect: () => setSelected(null),
    moveUnit: (unitId: string, to: Position) => dispatch([{ type: 'MOVE', unitId, to }]),
    moveAndAttack: (unitId: string, to: Position, targetPosition: Position) => dispatch([{ type: 'MOVE', unitId, to }, { type: 'ATTACK', unitId, targetPosition }]),
    attackWith: (unitId: string, targetPosition: Position) => dispatch([{ type: 'ATTACK', unitId, targetPosition }]),
    endPlacePhase: () => dispatch([{ type: 'END_PLACE_PHASE' }]), endActionPhase: () => dispatch([{ type: 'END_ACTION_PHASE' }]),
    buyUnit: (definitionId: string, position: Position) => dispatch([{ type: 'BUY_UNIT', definitionId, position }]),
    promoteUnit: (unitId: string) => dispatch([{ type: 'PROMOTE_UNIT', unitId }]),
    payUpkeep: (keepUnitIds: string[]) => dispatch([{ type: 'PAY_UPKEEP', keepUnitIds }]),
    setUpkeepReview: (player: PlayerId, enabled: boolean) => setVariation(current => current ? { ...current,
      frames: current.frames.map((frame, i) => i === current.cursor ? { ...frame, state: gameReducer(frame.state, { type: 'SET_UPKEEP_REVIEW', player, enabled }) } : frame) } : null),
    resign: () => dispatch([{ type: 'RESIGN' }]), applyAIAction: useCallback((action: AIAction) => dispatch([action]), [dispatch]),
    resetGame: () => setVariation({ frames: [localFrame(initial)], cursor: 0 }),
    undo: () => go(index - 1), canUndo: !!variation && index > 0,
    selectedUnitData: state.selectedUnit ? getUnitById(state.board, state.selectedUnit) : null,
    isPlayerTurn: true, canEndTurn: state.turn.phase === 'action',
  };
  const back = roomId ? `/muju/?room=${roomId}&server=${encodeURIComponent(server)}${query.get('watch') === '1' ? '&watch=1' : ''}` : '/muju/';
  const bar = <section className="analysis-controls" aria-label="Analysis controls" onKeyDown={event => event.stopPropagation()}>
    <div className="analysis-heading"><strong>{reviewing ? 'Game analysis' : roomId ? 'Private variation' : 'Analysis board'}</strong><a href={back}>{roomId ? 'Back to room' : 'Game modes'}</a></div>
    <p className="analysis-position" role="status">{loading && reviewing ? 'Loading position…' : timeline[index]?.label ?? 'Starting position'}</p>
    <div className="analysis-navigation">
      <button disabled={!index || loading} aria-label="First position" onClick={() => go(0)}>⏮</button>
      <button disabled={!index || loading} aria-label="Previous turn" onClick={previousTurn}>⇤ Turn</button>
      <button disabled={!index || loading} aria-label="Previous step" onClick={() => go(index - 1)}>←</button>
      <button disabled={index >= timeline.length - 1 || loading} aria-label="Next step" onClick={() => go(index + 1)}>→</button>
      <button disabled={index >= timeline.length - 1 || loading} aria-label="Next turn" onClick={nextTurn}>Turn ⇥</button>
      <button disabled={index >= timeline.length - 1 || loading} aria-label="Last position" onClick={() => go(timeline.length - 1)}>⏭</button>
    </div>
    <label className="analysis-position-picker">Position <select aria-label="Analysis position" value={index} disabled={loading || !timeline.length} onChange={event => go(Number(event.target.value))}>
      {timeline.map((frame, i) => <option key={i} value={i}>{i}. {frame.turn} · {frame.label}</option>)}
    </select></label>
    <div className="analysis-actions">
      {reviewing ? <button disabled={loading || !!error || rawState.phase !== 'playing'} onClick={() => setVariation({ frames: [localFrame(rawState, 'Variation starts here')], cursor: 0 })}>Explore from here</button> : <span>You control both players</span>}
      {roomId && <button onClick={() => { setVariation(null); setRefresh(value => value + 1); }}>Return to game score</button>}
      {partial && <small>Earlier positions were not recorded.</small>}
    </div>
    {error && <p role="alert">{error} <button onClick={() => setRefresh(value => value + 1)}>Reload score</button></p>}
    {!roomId && <details><summary>Analyze an online room</summary><form onSubmit={event => {
      event.preventDefault();
      try { const connection = parseObserverConnection(roomInput, window.location.origin);
        window.location.href = `/muju/analysis?room=${connection.roomId}&server=${encodeURIComponent(connection.serverUrl)}&watch=1`;
      } catch (error) { setError(error instanceof Error ? error.message : 'Invalid room link.'); }
    }}><input aria-label="Room link or ID" value={roomInput} onChange={event => setRoomInput(event.target.value)} placeholder="Room link or ID" /><button>Open</button></form></details>}
  </section>;
  return <GameView game={game} config={config} onBackToMenu={() => { window.location.href = '/muju/'; }} analysis={{ bar, reviewing: reviewing || loading,
    result: rawState.phase === 'victory' ? `${rawState.winner ? `${rawState.winner} wins` : 'Draw'} · ${rawState.victoryReason?.replaceAll('-', ' ')}` : undefined }} />;
}
