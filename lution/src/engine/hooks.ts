// Hook dispatcher: collects HookSpecs from card instances in scoped zones of
// BOTH players, filters by side relative to the event's active player, sorts
// by priority then deterministic card order (starters, then ascending
// createdInRound, ties by cardId), and invokes handlers sequentially,
// honoring {cancel: true}. Unknown hook names with no registered handlers
// are simply no-ops (the candidate list is just empty).

import type { CardDef, CardId, PlayerId, PlayerState } from '../../shared/types';
import type { CardEffect, EngineAPI, HookEvent, HookName, HookResult, HookSpec } from './types';

export type CompareCardOrder = (a: CardId, b: CardId) => number;

// Starters all have createdInRound === 0, so sorting by createdInRound
// ascending already puts them first; ties (including two starters, or two
// non-starter cards minted the same round) break by cardId so ordering is
// fully deterministic regardless of Map/object iteration order.
export function makeCardOrderComparator(
  registry: ReadonlyMap<CardId, CardDef>
): CompareCardOrder {
  return (a: CardId, b: CardId): number => {
    const roundA = registry.get(a)?.createdInRound ?? 0;
    const roundB = registry.get(b)?.createdInRound ?? 0;
    if (roundA !== roundB) return roundA - roundB;
    return a < b ? -1 : a > b ? 1 : 0;
  };
}

export interface DispatchDeps {
  api: EngineAPI;
  players: Record<PlayerId, PlayerState>;
  effects: ReadonlyMap<CardId, CardEffect>;
  compareCardOrder: CompareCardOrder;
}

// Fixed iteration order for players so tie-breaking by "in-play instance
// order" is deterministic regardless of how the Record was constructed.
const PLAYER_ORDER: PlayerId[] = ['human', 'claude'];

interface Candidate {
  owner: PlayerId;
  cardId: CardId;
  instance: PlayerState['inPlay'][number];
  spec: HookSpec;
  zoneOrder: number;
}

function zoneForScope(
  player: PlayerState,
  scope: NonNullable<HookSpec['scope']>
): PlayerState['inPlay'] {
  if (scope === 'inHand') return player.hand;
  if (scope === 'inPlay') return player.inPlay;
  // 'always': the instance may be sitting in any zone (e.g. a card's own
  // onDiscard handler firing right after it lands in the discard pile).
  return [...player.inPlay, ...player.hand, ...player.discard];
}

function sideMatches(side: NonNullable<HookSpec['side']>, owner: PlayerId, activePlayer: PlayerId): boolean {
  if (side === 'any') return true;
  if (side === 'owner') return owner === activePlayer;
  return owner !== activePlayer; // 'opponent'
}

export async function dispatchHooks(
  hookName: HookName,
  event: HookEvent,
  deps: DispatchDeps
): Promise<HookResult[]> {
  const { api, players, effects, compareCardOrder } = deps;
  const candidates: Candidate[] = [];
  let zoneOrder = 0;

  for (const owner of PLAYER_ORDER) {
    const playerState = players[owner];
    if (!playerState) continue;

    const considerZone = (list: PlayerState['inPlay']) => {
      for (const instance of list) {
        const effect = effects.get(instance.cardId);
        const spec = effect?.hooks?.[hookName];
        if (!spec) continue;
        const scope = spec.scope ?? 'inPlay';
        const zone = zoneForScope(playerState, scope);
        if (!zone.includes(instance)) continue;
        // An active score override (EngineAPI.setScoreOverride -- e.g. a
        // freeze effect) fully replaces this instance's own contribution to
        // score(), so its own modifyScore handler is suppressed rather than
        // also running on top of the override. Scoped to modifyScore only:
        // every other hook name still dispatches normally for a frozen
        // instance (freezing only concerns scoring). Purely additive --
        // instances with no override are entirely unaffected.
        if (hookName === 'modifyScore' && api.getScoreOverride(instance.instanceId) !== undefined) continue;
        const side = spec.side ?? 'owner';
        if (!sideMatches(side, owner, event.activePlayer)) continue;
        candidates.push({ owner, cardId: instance.cardId, instance, spec, zoneOrder: zoneOrder++ });
      }
    };

    // A card could only ever match once per instance (its own scope
    // determines which single zone list is relevant), so scanning the union
    // of all three zones per player is sufficient and instance-safe (an
    // instance lives in exactly one zone at a time).
    considerZone([...playerState.inPlay, ...playerState.hand, ...playerState.discard]);
  }

  candidates.sort((a, b) => {
    const pa = a.spec.priority ?? 0;
    const pb = b.spec.priority ?? 0;
    if (pa !== pb) return pb - pa; // higher priority first
    const cardCmp = compareCardOrder(a.cardId, b.cardId);
    if (cardCmp !== 0) return cardCmp;
    return a.zoneOrder - b.zoneOrder;
  });

  const results: HookResult[] = [];
  for (const candidate of candidates) {
    const result = await candidate.spec.handler({
      api,
      event,
      cardId: candidate.cardId,
      instance: candidate.instance,
      owner: candidate.owner,
    });
    if (result) results.push(result);
    if (result?.cancel) break;
  }
  return results;
}
