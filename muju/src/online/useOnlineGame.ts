import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Position, PlayerId } from '../game/types';
import type { AIAction } from '../ai/types';
import { getUnitById } from '../game/board';
import { getValidMoves } from '../game/movement';
import { getValidAttacks } from '../game/combat';
import { OnlineError, playRoom, readRoom } from './client';
import type { ActionRequest, RoomAction, RoomConnection, RoomSnapshot } from './types';

export function useOnlineGame(connection: RoomConnection, initial: RoomSnapshot, onLeave: () => void) {
  const [room, setRoom] = useState(initial);
  const roomRef = useRef(room);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [uncertain, setUncertain] = useState<ActionRequest | null>(null);
  const accept = useCallback((next: RoomSnapshot) => {
    if (next.revision <= roomRef.current.revision) return;
    roomRef.current = next; setRoom(next); setSelected(null);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { accept(await readRoom(connection, controller.signal)); if (!controller.signal.aborted) setConnectionError(null); }
      catch (error) { if (!controller.signal.aborted) setConnectionError(error instanceof Error ? error.message : 'Connection interrupted. Reconnecting…'); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1000);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [connection, accept]);

  const send = useCallback(async (request: ActionRequest) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    try { accept(await playRoom(connection, request)); setUncertain(null); }
    catch (error) {
      setError(error instanceof Error ? error.message : 'Move could not be sent.');
      if (error instanceof OnlineError && error.status < 500) {
        setUncertain(null);
        try { accept(await readRoom(connection)); } catch { /* polling will reconnect */ }
      } else setUncertain(request);
    } finally { locked.current = false; setBusy(false); }
  }, [connection, accept]);
  const dispatch = useCallback((action: RoomAction) => {
    if (locked.current || uncertain) return;
    // getRandomValues also works on HTTP LAN origins where randomUUID is unavailable.
    const requestId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    void send({ expectedRevision: roomRef.current.revision, requestId, actions: [action] });
  }, [send, uncertain]);
  const state = useMemo(() => {
    const s = room.state;
    const u = selected ? getUnitById(s.board, selected) : null;
    return { ...s, selectedUnit: u?.id ?? null,
      validMoves: u && s.turn.phase === 'action' ? getValidMoves(u, s.board) : [],
      validAttacks: u && s.turn.phase === 'action' ? getValidAttacks(u, s.board) : [] };
  }, [room, selected]);
  const selectUnit = useCallback((id: string) => {
    const s = roomRef.current.state, u = getUnitById(s.board, id);
    if (u?.owner === connection.player && s.turn.currentPlayer === connection.player && s.turn.phase === 'action') setSelected(id);
  }, [connection.player]);
  const game = {
    state, selectUnit, deselect: () => setSelected(null),
    moveUnit: (unitId: string, to: Position) => dispatch({ type: 'MOVE', unitId, to }),
    attackWith: (unitId: string, targetPosition: Position) => dispatch({ type: 'ATTACK', unitId, targetPosition }),
    endPlacePhase: () => dispatch({ type: 'END_PLACE_PHASE' }), endActionPhase: () => dispatch({ type: 'END_ACTION_PHASE' }),
    buyUnit: (definitionId: string, position: Position) => dispatch({ type: 'BUY_UNIT', definitionId, position }),
    promoteUnit: (unitId: string) => dispatch({ type: 'PROMOTE_UNIT', unitId }),
    payUpkeep: (keepUnitIds: string[]) => dispatch({ type: 'PAY_UPKEEP', keepUnitIds }),
    setUpkeepReview: (_player: PlayerId, enabled: boolean) => dispatch({ type: 'SET_UPKEEP_REVIEW', enabled }),
    resign: () => dispatch({ type: 'RESIGN' }), applyAIAction: useCallback((action: AIAction) => dispatch(action), [dispatch]),
    resetGame: onLeave, undo: () => {}, canUndo: false,
    selectedUnitData: selected ? getUnitById(state.board, selected) : null,
    isPlayerTurn: state.turn.currentPlayer === connection.player, canEndTurn: state.turn.phase === 'action',
  };
  return { game, room, busy: busy || !!uncertain, connected: !connectionError, error: error ?? connectionError, retry: uncertain ? () => void send(uncertain) : undefined };
}
