import type { Player, GameState, Card } from './types';

export function evaluateConditional(
  conditional: string,
  player: Player,
  state: GameState,
  card: Card
): number {
  if (!conditional || conditional === '—' || conditional === '') {
    return 0;
  }

  // "+2 if you have another card of this faction"
  if (conditional.includes('if you have another card of this faction')) {
    const match = conditional.match(/\+(\d+)/);
    const bonus = match ? parseInt(match[1]) : 0;
    const factionCount = player.tableau.filter(c => c.faction === card.faction).length;
    return factionCount >= 2 ? bonus : 0;
  }

  // "+X per [Faction] card"
  const perFactionMatch = conditional.match(/\+(\d+) per (.+?) card$/);
  if (perFactionMatch) {
    const multiplier = parseInt(perFactionMatch[1]);
    const faction = perFactionMatch[2];
    const count = player.tableau.filter(c => c.faction === faction).length;
    return multiplier * count;
  }

  // "+X per faction represented"
  if (conditional.includes('per faction represented')) {
    const match = conditional.match(/\+(\d+)/);
    const multiplier = match ? parseInt(match[1]) : 0;
    const factions = new Set(
      player.tableau.map(c => c.faction).filter(f => f !== 'General')
    );
    return multiplier * factions.size;
  }

  // "+X per faction with 2+ cards"
  if (conditional.includes('per faction with 2+ cards')) {
    const match = conditional.match(/\+(\d+)/);
    const multiplier = match ? parseInt(match[1]) : 0;
    const factionCounts = new Map<string, number>();
    player.tableau.forEach(c => {
      if (c.faction !== 'General') {
        factionCounts.set(c.faction, (factionCounts.get(c.faction) || 0) + 1);
      }
    });
    const factionsWithTwoPlus = Array.from(factionCounts.values()).filter(
      count => count >= 2
    ).length;
    return multiplier * factionsWithTwoPlus;
  }

  // "+X if cards from Y+ factions"
  const factionThresholdMatch = conditional.match(/\+(\d+) if cards from (\d+)\+ factions/);
  if (factionThresholdMatch) {
    const bonus = parseInt(factionThresholdMatch[1]);
    const threshold = parseInt(factionThresholdMatch[2]);
    const factions = new Set(
      player.tableau.map(c => c.faction).filter(f => f !== 'General')
    );
    return factions.size >= threshold ? bonus : 0;
  }

  // "+X if you won a card by counter-bidding"
  if (conditional.includes('if you won a card by counter-bidding')) {
    const match = conditional.match(/\+(\d+)/);
    const bonus = match ? parseInt(match[1]) : 0;
    return player.cardsWonByCounterBid > 0 ? bonus : 0;
  }

  // "+X per card you won by counter-bidding"
  if (conditional.includes('per card you won by counter-bidding')) {
    const match = conditional.match(/\+(\d+)/);
    const multiplier = match ? parseInt(match[1]) : 0;
    return multiplier * player.cardsWonByCounterBid;
  }

  // "+X if ≤Y cards remain face up in grid"
  const cardsRemainMatch = conditional.match(/\+(\d+) if ≤(\d+) cards remain face up in grid/);
  if (cardsRemainMatch) {
    const bonus = parseInt(cardsRemainMatch[1]);
    const threshold = parseInt(cardsRemainMatch[2]);
    let faceUpCount = 0;
    for (const cell of state.grid.cells.values()) {
      if (cell.type === 'card' && cell.faceUp) {
        faceUpCount++;
      }
    }
    return faceUpCount <= threshold ? bonus : 0;
  }

  // "+X per ruins space in grid"
  if (conditional.includes('per ruins space in grid')) {
    const match = conditional.match(/\+(\d+)/);
    const multiplier = match ? parseInt(match[1]) : 0;
    let ruinsCount = 0;
    for (const cell of state.grid.cells.values()) {
      if (cell.type === 'ruins') {
        ruinsCount++;
      }
    }
    return multiplier * ruinsCount;
  }

  // "+X if you have burned Y+ cards"
  const burnedThresholdMatch = conditional.match(/\+(\d+) if you have burned (\d+)\+ cards/);
  if (burnedThresholdMatch) {
    const bonus = parseInt(burnedThresholdMatch[1]);
    const threshold = parseInt(burnedThresholdMatch[2]);
    return player.cardsBurnedThisGame >= threshold ? bonus : 0;
  }

  // "+X if ≥Y cards burned this game"
  const totalBurnedMatch = conditional.match(/\+(\d+) if ≥(\d+) cards burned this game/);
  if (totalBurnedMatch) {
    const bonus = parseInt(totalBurnedMatch[1]);
    const threshold = parseInt(totalBurnedMatch[2]);
    return state.cardsBurnedThisGame >= threshold ? bonus : 0;
  }

  // "+X per card you burned this game"
  if (conditional.includes('per card you burned this game')) {
    const match = conditional.match(/\+(\d+)/);
    const multiplier = match ? parseInt(match[1]) : 0;
    return multiplier * player.cardsBurnedThisGame;
  }

  // "+X if you have ≤Y cards total"
  const cardsTotalMatch = conditional.match(/\+(\d+) if you have ≤(\d+) cards total/);
  if (cardsTotalMatch) {
    const bonus = parseInt(cardsTotalMatch[1]);
    const threshold = parseInt(cardsTotalMatch[2]);
    return player.tableau.length <= threshold ? bonus : 0;
  }

  // "+X per card fewer than opponent (min 0)"
  if (conditional.includes('per card fewer than opponent')) {
    const match = conditional.match(/\+(\d+)/);
    const multiplier = match ? parseInt(match[1]) : 0;
    const opponent = state.players.find(p => p.id !== player.id)!;
    const diff = opponent.tableau.length - player.tableau.length;
    return multiplier * Math.max(0, diff);
  }

  // "+X if this is your Yth+ card"
  const nthCardMatch = conditional.match(/\+(\d+) if this is your (\d+)th?\+ card/);
  if (nthCardMatch) {
    const bonus = parseInt(nthCardMatch[1]);
    const threshold = parseInt(nthCardMatch[2]);
    return player.tableau.length >= threshold ? bonus : 0;
  }

  // "+X per card you have (including this)"
  if (conditional.includes('per card you have (including this)')) {
    const match = conditional.match(/\+(\d+)/);
    const multiplier = match ? parseInt(match[1]) : 0;
    return multiplier * player.tableau.length;
  }

  // "+X if you have Y of each symbol unspent"
  const symbolsUnspentMatch = conditional.match(/\+(\d+) if you have (\d+) of each symbol unspent/);
  if (symbolsUnspentMatch) {
    const bonus = parseInt(symbolsUnspentMatch[1]);
    const threshold = parseInt(symbolsUnspentMatch[2]);
    const { mars, venus, mercury, moon } = player.symbols;
    if (mars >= threshold && venus >= threshold && mercury >= threshold && moon >= threshold) {
      return bonus;
    }
    return 0;
  }

  // If no pattern matched, return 0
  console.warn(`Unknown conditional pattern: ${conditional}`);
  return 0;
}

export function calculateVP(player: Player, state: GameState): number {
  let total = 0;

  for (const card of player.tableau) {
    // Base VP
    total += card.baseVP;

    // Conditional VP
    if (card.conditionalVP) {
      total += evaluateConditional(card.conditionalVP, player, state, card);
    }
  }

  return total;
}

export function calculateWinner(state: GameState): {
  winner: 0 | 1 | 'tie';
  scores: [number, number];
} {
  const scores: [number, number] = [
    calculateVP(state.players[0], state),
    calculateVP(state.players[1], state),
  ];

  // VP comparison
  if (scores[0] > scores[1]) {
    return { winner: 0, scores };
  }
  if (scores[1] > scores[0]) {
    return { winner: 1, scores };
  }

  // Tiebreaker 1: Most unspent symbols
  const totalSymbols = [
    state.players[0].symbols.mars +
      state.players[0].symbols.venus +
      state.players[0].symbols.mercury +
      state.players[0].symbols.moon,
    state.players[1].symbols.mars +
      state.players[1].symbols.venus +
      state.players[1].symbols.mercury +
      state.players[1].symbols.moon,
  ];

  if (totalSymbols[0] > totalSymbols[1]) {
    return { winner: 0, scores };
  }
  if (totalSymbols[1] > totalSymbols[0]) {
    return { winner: 1, scores };
  }

  // Tiebreaker 2: Most cards
  const cardCounts = [
    state.players[0].tableau.length,
    state.players[1].tableau.length,
  ];

  if (cardCounts[0] > cardCounts[1]) {
    return { winner: 0, scores };
  }
  if (cardCounts[1] > cardCounts[0]) {
    return { winner: 1, scores };
  }

  // True tie
  return { winner: 'tie', scores };
}
