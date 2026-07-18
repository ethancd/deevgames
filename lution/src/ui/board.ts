// Renders the play-area: each player's keepers-in-play + score/zone counts
// as its own standalone "zone" (mobile layout stacks opponent-zone / log /
// self-zone vertically — see app.ts's renderPlayingScreen), plus the slim
// sticky-header turn indicator + inner-win tally markup.

import type { CardDef, CardId, CardInstance, InnerGameState, PlayerId } from '../../shared/types';
import { isCardLocked } from '../../shared/cardLock';
import { attachCardChipToggles, cardChipHtml } from './cardChip';

const PLAYER_LABEL: Record<PlayerId, string> = {
  human: 'You',
  claude: 'Claude',
};

export interface ZoneOptions {
  // Score, computed asynchronously via EngineAPI.score() by the caller
  // (scoring is never cached, so this is the caller's latest read).
  score: number;
  winPoints: number;
  // "Compact starters" view preference (localStorage, read by the caller at
  // render time — see viewPrefs.ts). When true, starter keepers (registry
  // creatorId === 'starter') collapse into one summary pill per zone;
  // designed (human/claude) keepers always render full-size.
  compact: boolean;
}

export interface TurnHeaderOptions {
  innerWins: Record<PlayerId, number>;
  winPoints: number;
  matchWins: number;
}

function keeperChipHtml(
  inst: CardInstance,
  registry: ReadonlyMap<CardId, CardDef>,
  effects: ReadonlyMap<CardId, unknown>
): string {
  const def = registry.get(inst.cardId);
  const label = def?.name ?? inst.cardId;
  const effectText = def?.effectText ?? '';
  const effect = effects.get(inst.cardId) as { baseValue?: number } | undefined;
  // Locked cards never enter inPlay by construction (resolvePlay
  // rejects the play) -- this is defense-in-depth only, so a bug
  // elsewhere can't accidentally render a "playable-looking" chip
  // for a card that shouldn't be here at all.
  const locked = isCardLocked(def);
  return `
    <button
      type="button"
      class="card-chip card-chip--keeper"
      data-role="chip-toggle"
      aria-expanded="false"
    >
      ${cardChipHtml(label, effect?.baseValue, effectText, { locked })}
    </button>
  `;
}

function inPlayHtml(
  inPlay: CardInstance[],
  registry: ReadonlyMap<CardId, CardDef>,
  effects: ReadonlyMap<CardId, unknown>,
  compact: boolean
): string {
  if (inPlay.length === 0) {
    return `<p class="zone-empty">No keepers in play.</p>`;
  }

  if (!compact) {
    return `
      <div class="keeper-row">
        ${inPlay.map((inst) => keeperChipHtml(inst, registry, effects)).join('')}
      </div>
    `;
  }

  const starters = inPlay.filter((inst) => registry.get(inst.cardId)?.creatorId === 'starter');
  const designed = inPlay.filter((inst) => registry.get(inst.cardId)?.creatorId !== 'starter');

  const designedHtml =
    designed.length > 0
      ? `<div class="keeper-row">${designed.map((inst) => keeperChipHtml(inst, registry, effects)).join('')}</div>`
      : '';

  if (starters.length === 0) {
    return designedHtml;
  }

  const totalPts = starters.reduce((sum, inst) => {
    const effect = effects.get(inst.cardId) as { baseValue?: number } | undefined;
    return sum + (effect?.baseValue ?? 0);
  }, 0);

  return `
    <div class="keeper-summary-group">
      <button
        type="button"
        class="keeper-summary"
        data-role="keeper-summary-toggle"
        aria-expanded="false"
      >
        &#9862; ${starters.length} starter${starters.length === 1 ? '' : 's'} &middot; ${totalPts} pts
      </button>
      <div class="keeper-row keeper-row--starters" data-role="keeper-summary-cards">
        ${starters.map((inst) => keeperChipHtml(inst, registry, effects)).join('')}
      </div>
      ${designedHtml}
    </div>
  `;
}

// Tapping the starter-summary pill expands that zone's starters inline —
// deliberately NOT persisted anywhere: it's a per-render convenience that
// collapses again on the next re-render (a turn passing, a card being
// played, the compact toggle itself). Parallel to attachCardChipToggles.
function attachKeeperSummaryToggle(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>('[data-role="keeper-summary-toggle"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      const row = btn.parentElement?.querySelector<HTMLElement>('[data-role="keeper-summary-cards"]');
      row?.classList.toggle('is-expanded', !expanded);
    });
  });
}

// Renders ONE player's zone (self or opponent) into `container` — the
// mobile layout calls this twice (opponent zone above the log, self zone
// below it) instead of a single two-column board.
export function renderPlayerZone(
  container: HTMLElement,
  id: PlayerId,
  self: PlayerId,
  state: InnerGameState,
  registry: ReadonlyMap<CardId, CardDef>,
  effects: ReadonlyMap<CardId, unknown>,
  options: ZoneOptions
): void {
  const player = state.players[id];
  const isActive = state.activePlayer === id;
  const isSelf = id === self;
  container.innerHTML = `
    <div class="player-column${isSelf ? ' player-column--self' : ' player-column--opponent'}${isActive ? ' player-column--active' : ''}">
      <header class="player-column__header">
        <h2>${PLAYER_LABEL[id]}${isActive ? ' <span class="turn-badge">turn</span>' : ''}</h2>
        <div class="player-column__score">${options.score} <span class="score-target">/ ${options.winPoints}</span></div>
      </header>
      <div class="zone-counts">
        <span title="Cards remaining in draw pile">Deck ${player.drawPile.length}</span>
        <span title="Cards in discard pile">Discard ${player.discard.length}</span>
        <span title="Cards in hand">Hand ${player.hand.length}</span>
      </div>
      ${inPlayHtml(player.inPlay, registry, effects, options.compact)}
    </div>
  `;
  attachCardChipToggles(container);
  attachKeeperSummaryToggle(container);
}

// Markup for the slim sticky header's status row: whose turn it is, plus
// the inner-game win tally (requirement: both live in the header, not the
// scrollable board).
export function turnHeaderHtml(state: InnerGameState, self: PlayerId, options: TurnHeaderOptions): string {
  const isYourTurn = state.activePlayer === self;
  return `
    <span class="turn-indicator ${isYourTurn ? 'turn-indicator--yours' : 'turn-indicator--theirs'}">
      ${isYourTurn ? 'Your turn' : 'Claude&rsquo;s turn'}
    </span>
    <span class="tally">
      Wins&ensp;You ${options.innerWins.human}/${options.matchWins} &middot; Claude ${options.innerWins.claude}/${options.matchWins}
    </span>
  `;
}
