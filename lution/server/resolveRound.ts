// Applies one design round's keep/steal/destroy resolution atomically to the
// registry (data/cards.json) and both players' deck lists (MatchState.decks)
// per STEAL RESHAPED 2026-07-02 (v3):
//   - The LOSER of the inner game chooses keep vs steal.
//   - KEEP (unchanged): each player's own new design enters their own deck.
//     Nothing crosses decks; both designs survive.
//   - STEAL: a strict TWO-PICK sequence.
//       1. The LOSER picks FIRST, from the winner's brand-new design OR any
//          card already in the winner's deck.
//       2. The WINNER counter-raids, from the loser's brand-new design OR
//          any card in the loser's deck EXCLUDING the card the loser just
//          took in step 1.
//     In either step: picking the design offered always MOVES it ('taken').
//     Picking an 'existing' card MOVES it ('taken') unless the picker
//     originally created that card's type, in which case it is EXECUTED
//     ('destroyed' -- removed from the game, the picker gains nothing).
//     EITHER WAY, when a picker chooses 'existing' instead of the design
//     being offered, that spurned design is DESTROYED too -- it never enters
//     any deck. General principle: any designed card that isn't kept or
//     stolen is explicitly destroyed.
//
// Global uniqueness invariant: because steal only ever MOVES or DESTROYS
// (never copies), every card id exists in AT MOST ONE deck across BOTH
// players combined. This function enforces that on every resolution path.
//
// Pure function: no I/O. The caller (server/router.ts) is responsible for
// reading the current registry/match state, calling this, and persisting
// both returned values as one atomic pair.

import type { CardDef, CardId, MatchState, PlayerId, RoundPick, RoundRecord } from '../shared/types';

export interface ResolveRoundParams {
  match: MatchState;
  registry: CardDef[];
  round: number;
  designs: Record<PlayerId, CardId | null>;
  winner: PlayerId;
  decision: 'keep' | 'steal';
  loserPick: RoundPick | null;
  winnerPick: RoundPick | null;
}

export interface ResolveRoundResult {
  match: MatchState;
  registry: CardDef[];
  record: RoundRecord;
  // Same-round designs destroyed by the orphan sweep below (a SUBSET of
  // record.destroyed) -- broken out separately purely so the caller
  // (server/router.ts#handleResolveRound) can log which ids were swept
  // without having to re-derive the distinction from `destroyed` after the
  // fact.
  sweptOrphans: CardId[];
}

function otherPlayer(player: PlayerId): PlayerId {
  return player === 'human' ? 'claude' : 'human';
}

// Shared legality + outcome-derivation logic for one pick (either step). All
// three arguments describe the pick FROM the picker's point of view:
//   - offeredDesignId: the design the picker may take wholesale.
//   - sourceDeck: the ORIGINAL (pre-this-round-mutation) deck the picker may
//     otherwise raid an 'existing' card from.
//   - excludedCardId: (winnerPick only) the card the loser just took in step
//     1 -- never a legal 'existing' target for the counter-raid.
function validateAndResolvePick(
  label: 'loserPick' | 'winnerPick',
  pick: RoundPick,
  picker: PlayerId,
  offeredDesignId: CardId | null,
  sourceDeck: readonly CardId[],
  registryById: Map<CardId, CardDef>,
  excludedCardId: CardId | null
): void {
  const pickedCard = registryById.get(pick.cardId);
  if (!pickedCard) {
    throw new Error(`resolveRound: ${label} target "${pick.cardId}" has no registry entry.`);
  }

  if (pick.source === 'design') {
    if (!offeredDesignId || pick.cardId !== offeredDesignId) {
      throw new Error(
        `resolveRound: ${label} with source 'design' must reference the offered design (got "${pick.cardId}").`
      );
    }
    if (pick.outcome !== 'taken') {
      throw new Error(
        `resolveRound: ${label} outcome "${pick.outcome}" for a 'design' pick should be "taken".`
      );
    }
    return;
  }

  if (pick.source !== 'existing') {
    throw new Error(`resolveRound: unknown ${label} source "${(pick as { source: string }).source}".`);
  }

  // Checked BEFORE plain deck-membership so this specific illegal case (the
  // winner grabbing back what the loser just took in step 1) gets its own
  // clear message -- it would otherwise also fail deck-membership, since a
  // card that just moved into the loser's deck this round was, by
  // definition, not already there before the round started.
  if (excludedCardId !== null && pick.cardId === excludedCardId) {
    throw new Error(
      `resolveRound: ${label} may not target "${pick.cardId}" -- it was just taken in step 1.`
    );
  }
  if (!sourceDeck.includes(pick.cardId)) {
    throw new Error(
      `resolveRound: ${label} 'existing' target "${pick.cardId}" is not in the offering deck.`
    );
  }

  const pickerCreatedIt = pickedCard.creatorId === picker;
  const expectedOutcome: 'taken' | 'destroyed' = pickerCreatedIt ? 'destroyed' : 'taken';
  if (pick.outcome !== expectedOutcome) {
    throw new Error(
      `resolveRound: ${label} outcome "${pick.outcome}" for "${pick.cardId}" should be ` +
        `"${expectedOutcome}" (picker ${pickerCreatedIt ? 'created' : 'did not create'} this card).`
    );
  }
}

export function resolveRound(params: ResolveRoundParams): ResolveRoundResult {
  const { match, registry, round, designs, winner, decision, loserPick, winnerPick } = params;
  const loser = otherPlayer(winner);

  const registryById = new Map(registry.map((c) => [c.id, c]));
  const decks: Record<PlayerId, CardId[]> = {
    human: [...match.decks.human],
    claude: [...match.decks.claude],
  };

  const winnerDesignId = designs[winner] ?? null;
  const loserDesignId = designs[loser] ?? null;
  const destroyed: CardId[] = [];

  if (decision === 'keep') {
    if (loserPick || winnerPick) {
      throw new Error('resolveRound: a keep resolution must not carry a loserPick or winnerPick.');
    }
    if (winnerDesignId && !decks[winner].includes(winnerDesignId)) {
      decks[winner] = [...decks[winner], winnerDesignId];
    }
    if (loserDesignId && !decks[loser].includes(loserDesignId)) {
      decks[loser] = [...decks[loser], loserDesignId];
    }
  } else if (decision === 'steal') {
    if (!loserPick || !winnerPick) {
      throw new Error('resolveRound: a steal resolution must carry both a loserPick and a winnerPick.');
    }
    // Defensive: the loser can never pick from their OWN deck (candidates
    // are the winner's design/deck only).
    if (loserPick.source === 'existing' && match.decks[loser].includes(loserPick.cardId)) {
      throw new Error(
        `resolveRound: loserPick "${loserPick.cardId}" is in the loser's OWN deck -- the loser may only pick from the winner's design/deck.`
      );
    }

    // --- Step 1: the loser picks first, from the winner's design/deck. ---
    validateAndResolvePick(
      'loserPick',
      loserPick,
      loser,
      winnerDesignId,
      match.decks[winner],
      registryById,
      null
    );

    let loserJustTook: CardId | null = null;
    if (loserPick.source === 'design') {
      // Design pick: always taken, never destroyed. Brand new this round,
      // so it can never already be in any deck.
      decks[loser] = [...decks[loser], loserPick.cardId];
      loserJustTook = loserPick.cardId;
    } else if (loserPick.outcome === 'taken') {
      decks[winner] = decks[winner].filter((id) => id !== loserPick.cardId);
      decks[loser] = [...decks[loser], loserPick.cardId];
      loserJustTook = loserPick.cardId;
    } else {
      // Executed: removed from the winner's deck, the loser gains nothing.
      decks[winner] = decks[winner].filter((id) => id !== loserPick.cardId);
      destroyed.push(loserPick.cardId);
    }

    // Either way, choosing 'existing' instead of the design spurns it --
    // destroyed, never enters any deck.
    if (loserPick.source === 'existing' && winnerDesignId) {
      destroyed.push(winnerDesignId);
    }

    // --- Step 2: the winner counter-raids, from the loser's design/deck,
    // excluding whatever the loser just took above. Checked against the
    // POST-step-1 winner deck (not the pre-round snapshot): a card the loser
    // just took FROM the winner's deck no longer belongs to the winner, so
    // it must fall through to the (separate) just-taken exclusion check
    // below rather than being misreported as "still the winner's own".
    if (winnerPick.source === 'existing' && decks[winner].includes(winnerPick.cardId)) {
      throw new Error(
        `resolveRound: winnerPick "${winnerPick.cardId}" is in the winner's OWN deck -- the winner may only pick from the loser's design/deck.`
      );
    }
    validateAndResolvePick(
      'winnerPick',
      winnerPick,
      winner,
      loserDesignId,
      match.decks[loser],
      registryById,
      loserJustTook
    );

    if (winnerPick.source === 'design') {
      decks[winner] = [...decks[winner], winnerPick.cardId];
    } else if (winnerPick.outcome === 'taken') {
      decks[loser] = decks[loser].filter((id) => id !== winnerPick.cardId);
      decks[winner] = [...decks[winner], winnerPick.cardId];
    } else {
      decks[loser] = decks[loser].filter((id) => id !== winnerPick.cardId);
      destroyed.push(winnerPick.cardId);
    }

    if (winnerPick.source === 'existing' && loserDesignId) {
      destroyed.push(loserDesignId);
    }
  } else {
    throw new Error(`resolveRound: unknown decision "${decision as string}".`);
  }

  // Orphaned-designs sweep (rules consistency fix): "any designed card that
  // isn't kept or stolen is explicitly destroyed" applies to more than just
  // the two designs THIS resolution decided the fate of (winnerDesignId /
  // loserDesignId) -- it also covers any OTHER still-alive card minted for
  // this exact round that this resolution never references and that ends up
  // in neither deck. That's exactly the shape of an abandoned re-request/
  // reload orphan (a design minted for round N that got superseded before a
  // round-N resolution ever ran) -- a real one was found live in
  // data/cards.json as r3-claude-the-reflationary-thaw (implemented: false,
  // destroyed: false, in no deck, dangling since round 3 resolved without
  // ever mentioning it). Swept here so it can never happen again; the
  // pre-existing instance had to be repaired by hand since round 3 is long
  // resolved and this sweep only runs at resolution time.
  const resolvedDesignIds = new Set(
    [winnerDesignId, loserDesignId].filter((id): id is CardId => id !== null)
  );
  const sweptOrphans: CardId[] = [];
  for (const candidate of registry) {
    if (
      candidate.createdInRound === round &&
      candidate.creatorId !== 'starter' &&
      !candidate.destroyed &&
      !resolvedDesignIds.has(candidate.id) &&
      !destroyed.includes(candidate.id) &&
      !decks.human.includes(candidate.id) &&
      !decks.claude.includes(candidate.id)
    ) {
      sweptOrphans.push(candidate.id);
      destroyed.push(candidate.id);
    }
  }

  const destroyedSet = new Set(destroyed);
  const newRegistry =
    destroyedSet.size > 0
      ? registry.map((card) => (destroyedSet.has(card.id) ? { ...card, destroyed: true } : card))
      : registry;

  // Global uniqueness invariant: every card id must appear at most once
  // across BOTH decks combined (never twice in one deck, never in both).
  const seen = new Set<CardId>();
  for (const player of ['human', 'claude'] as const) {
    for (const id of decks[player]) {
      if (seen.has(id)) {
        throw new Error(
          `resolveRound: global uniqueness invariant violated -- card id "${id}" appears more than once across the two decks.`
        );
      }
      seen.add(id);
    }
  }
  // A destroyed card must never linger in a deck.
  for (const player of ['human', 'claude'] as const) {
    for (const id of decks[player]) {
      if (destroyedSet.has(id)) {
        throw new Error(
          `resolveRound: destroyed card "${id}" still present in ${player}'s deck -- destroyed cards must leave decks entirely.`
        );
      }
    }
  }

  const record: RoundRecord = {
    round,
    designs,
    winner,
    loser,
    decision,
    loserPick: decision === 'steal' ? loserPick! : null,
    winnerPick: decision === 'steal' ? winnerPick! : null,
    destroyed,
    timestamp: new Date().toISOString(),
  };

  const newMatch: MatchState = {
    ...match,
    decks,
    roundHistory: [...match.roundHistory, record],
  };

  return { match: newMatch, registry: newRegistry, record, sweptOrphans };
}
