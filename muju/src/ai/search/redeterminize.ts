import type { FullKnowledge } from '../state/types';
import type { GameState, PlayerId } from '../../game/types';

function getOpponent(player: PlayerId): PlayerId {
  return player === 'player' ? 'ai' : 'player';
}

export function redeterminize(knowledge: FullKnowledge, forPlayer: PlayerId): GameState {
  const opponentId = getOpponent(forPlayer);
  const particle = sampleParticle(knowledge.opponentBelief);

  return {
    phase: knowledge.public.phase,
    board: knowledge.public.board,
    turn: knowledge.public.turn,
    players: {
      ...knowledge.public.players,
      [forPlayer]: {
        ...knowledge.public.players[forPlayer],
        resources: knowledge.own.resources,
        buildQueue: knowledge.own.buildQueue,
      },
      [opponentId]: {
        ...knowledge.public.players[opponentId],
        resources: particle.resources,
        buildQueue: particle.buildQueue,
      },
    },
    winner: knowledge.public.winner,
    selectedUnit: knowledge.public.selectedUnit,
    validMoves: knowledge.public.validMoves,
    validAttacks: knowledge.public.validAttacks,
  };
}

function sampleParticle(belief: FullKnowledge['opponentBelief']) {
  if (belief.particles.length === 0) {
    return { resources: belief.minResources, buildQueue: [] };
  }

  const totalWeight = belief.particles.reduce((sum, p) => sum + p.weight, 0);
  const r = Math.random() * totalWeight;
  let running = 0;
  for (const particle of belief.particles) {
    running += particle.weight;
    if (r <= running) {
      return particle;
    }
  }

  return belief.particles[belief.particles.length - 1];
}
