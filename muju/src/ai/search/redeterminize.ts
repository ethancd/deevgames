import type { RNG } from '../runtime';
import type { FullKnowledge } from '../state/types';
import type { GameState, PlayerId } from '../../game/types';

function getOpponent(player: PlayerId): PlayerId {
  return player === 'white' ? 'black' : 'white';
}

export function redeterminize(knowledge: FullKnowledge, forPlayer: PlayerId, rng: RNG = Math.random): GameState {
  const opponentId = getOpponent(forPlayer);
  const particle = sampleParticle(knowledge.opponentBelief, rng);

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
    victoryReason: knowledge.public.victoryReason,
    victoryRule: knowledge.public.victoryRule,
    selectedUnit: knowledge.public.selectedUnit,
    validMoves: knowledge.public.validMoves,
    validAttacks: knowledge.public.validAttacks,
  };
}

function sampleParticle(belief: FullKnowledge['opponentBelief'], rng: RNG) {
  if (belief.particles.length === 0) {
    return { resources: belief.minResources, buildQueue: [] };
  }

  const totalWeight = belief.particles.reduce((sum, p) => sum + p.weight, 0);
  const r = rng() * totalWeight;
  let running = 0;
  for (const particle of belief.particles) {
    running += particle.weight;
    if (r <= running) {
      return particle;
    }
  }

  return belief.particles[belief.particles.length - 1];
}
