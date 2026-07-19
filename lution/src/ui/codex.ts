// The Codex: a full-screen card-gallery overlay (feature: the Codex). Shows
// every registered card, grouped into "Your deck" / "Claude's deck" /
// "Unowned" / "The Fallen" (destroyed), built entirely from data the client
// already has (registry + MatchState + the loaded effects map) -- no new
// network calls except the lazy "view the law" fetch (src/ui/codeView.ts).
//
// CRITICAL: openCodex() appends its overlay directly to document.body, NOT
// into AppController's `container`. The playing screen holds live
// pending-input promises (chooseCardToPlay, choiceResponder) that would be
// orphaned by a container re-render, and renderScreenShell (src/ui/app.ts)
// wipes container.innerHTML on every screen transition -- while the Codex is
// open, an AI turn, job-status poll, etc. can still legitimately redraw the
// screen underneath. Living outside that subtree is what makes the overlay
// safe to layer on top without disturbing any of that.

import type { CardDef, CardId, MatchState } from '../../shared/types';
import { isCardLocked } from '../../shared/cardLock';
import type { CardEffect } from '../engine/types';
import { renderCodeViewToggle, wireCodeViewToggles } from './codeView';

const OVERLAY_ID = 'codex-overlay';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface CodexParams {
  registry: CardDef[];
  match: MatchState;
  effects: Map<CardId, CardEffect>;
}

function creatorLabel(creatorId: CardDef['creatorId']): string {
  if (creatorId === 'human') return 'you';
  if (creatorId === 'claude') return 'Claude';
  return 'starter';
}

function roundBornLabel(card: CardDef): string {
  return card.creatorId === 'starter' ? 'starter' : `round ${card.createdInRound}`;
}

// Best-effort "which round destroyed this card" lookup: prefers an explicit
// RoundRecord.destroyed entry (the normal keep/steal/destroy resolution
// path). Falls back to createdInRound for cards destroyed via the
// identical-simultaneous-designs void path (POST /api/void-round-designs) --
// that path never produces a RoundRecord for the voided attempt at all, so
// those cards die in the very round they were born and createdInRound is
// exact, not just an approximation.
function roundDiedLabel(card: CardDef, roundHistory: MatchState['roundHistory']): number {
  const record = roundHistory.find((r) => r.destroyed.includes(card.id));
  return record ? record.round : card.createdInRound;
}

function renderCardEntry(card: CardDef, match: MatchState, effects: Map<CardId, CardEffect>): string {
  const value = effects.get(card.id)?.baseValue;
  // Non-blocking implement-job feature: a locked card shows the same
  // "being forged" badge hand.ts/board.ts use in place of '?', so the Codex
  // never implies a locked card's value is simply "unknown" the way a
  // genuinely un-implemented-yet design would look pre-feature.
  const locked = isCardLocked(card);
  const valueLabel = locked ? '⚒' : value === undefined ? '?' : String(value);
  const valueAriaLabel = locked
    ? 'being forged, not yet playable'
    : value === undefined
      ? 'value not yet known'
      : `worth ${value} points`;
  const fallen = card.destroyed;
  return `
    <div class="codex-card${fallen ? ' codex-card--fallen' : ''}">
      <div class="codex-card__head">
        <span class="codex-card__name">${escapeHtml(card.name)}</span>
        <span class="codex-card__value${locked ? ' codex-card__value--locked' : ''}" aria-label="${valueAriaLabel}">${valueLabel}</span>
      </div>
      <p class="codex-card__effect">${escapeHtml(card.effectText)}</p>
      <div class="codex-card__meta">
        <span class="codex-chip codex-chip--creator-${card.creatorId}">${creatorLabel(card.creatorId)}</span>
        ${
          // Starters would render "starter starter" (creator chip + born
          // chip say the same word) -- one chip carries it all for them.
          card.creatorId === 'starter'
            ? ''
            : `<span class="codex-chip codex-chip--round">${roundBornLabel(card)}</span>`
        }
      </div>
      ${
        fallen
          ? `<p class="codex-card__epitaph">&#10013; extinct &mdash; round ${roundDiedLabel(card, match.roundHistory)}</p>`
          : ''
      }
      ${card.implemented ? renderCodeViewToggle(card.id) : ''}
    </div>
  `;
}

function byRoundThenName(a: CardDef, b: CardDef): number {
  return a.createdInRound - b.createdInRound || a.name.localeCompare(b.name);
}

function renderSection(title: string, cards: CardDef[], match: MatchState, effects: Map<CardId, CardEffect>): string {
  if (cards.length === 0) return '';
  const sorted = [...cards].sort(byRoundThenName);
  return `
    <section class="codex-section">
      <h2 class="codex-section__title">${escapeHtml(title)} <span class="codex-section__count">(${sorted.length})</span></h2>
      <div class="codex-section__cards">
        ${sorted.map((c) => renderCardEntry(c, match, effects)).join('')}
      </div>
    </section>
  `;
}

// Idempotent: a second call while the Codex is already open is a no-op
// rather than stacking a duplicate overlay.
export function openCodex(params: CodexParams): void {
  if (document.getElementById(OVERLAY_ID)) return;

  const { registry, match, effects } = params;
  const live = registry.filter((c) => !c.destroyed);
  const extinct = registry.filter((c) => c.destroyed);
  const inHumanDeck = new Set(match.decks.human);
  const inClaudeDeck = new Set(match.decks.claude);

  const yourDeck = live.filter((c) => inHumanDeck.has(c.id));
  const claudeDeck = live.filter((c) => inClaudeDeck.has(c.id));
  const unowned = live.filter((c) => !inHumanDeck.has(c.id) && !inClaudeDeck.has(c.id));

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'codex-overlay';
  overlay.innerHTML = `
    <div class="codex-backdrop" data-role="codex-backdrop"></div>
    <div class="codex-panel" role="dialog" aria-modal="true" aria-label="The Codex">
      <header class="codex-panel__header">
        <h1>The Codex</h1>
        <button type="button" class="codex-close" data-role="codex-close" aria-label="Close the Codex">&times;</button>
      </header>
      <p class="codex-summary">
        ${live.length} card${live.length === 1 ? '' : 's'} live &middot; ${extinct.length} extinct
        &middot; your deck ${match.decks.human.length} &middot; Claude's deck ${match.decks.claude.length}
      </p>
      <div class="codex-body" data-role="codex-body">
        ${renderSection('Your deck', yourDeck, match, effects)}
        ${renderSection("Claude's deck", claudeDeck, match, effects)}
        ${renderSection('Unowned', unowned, match, effects)}
        ${renderSection('The Fallen', extinct, match, effects)}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  function close(): void {
    overlay.remove();
  }

  overlay.querySelector('[data-role="codex-close"]')?.addEventListener('click', close);
  overlay.querySelector('[data-role="codex-backdrop"]')?.addEventListener('click', close);

  wireCodeViewToggles(overlay);
}
