// Renders the human player's hand as a bottom "dock": a horizontally
// scrollable strip of compact card chips (thumb reach), tap-to-select
// (never tap-to-immediately-play, so fat fingers don't misplay a card), and
// a preview panel with the full card name/effect + explicit "Play this
// card" / "Cancel" buttons once something is selected. A persistent Pass
// button sits below the strip. Calls onPlay(instanceId) only once the play
// is explicitly confirmed, or onPass() when the human declines to play.

import type { CardDef, CardId, CardInstance } from '../../shared/types';
import { isCardLocked } from '../../shared/cardLock';
import { cardChipHtml, LOCKED_CARD_NOTE } from './cardChip';

export interface RenderHandOptions {
  onPlay: (instanceId: string) => void;
  onPass?: () => void;
  // Whether the hand is currently interactive (it's this player's turn and
  // no other decision — e.g. a choice modal — is blocking play). When
  // false, the whole dock renders locked (dimmed, unclickable, with an
  // explicit "not your turn" note) — an obvious disabled state.
  interactive: boolean;
  // "Compact starters" view preference (localStorage, read by the caller at
  // render time — see viewPrefs.ts). When true, starter cards (registry
  // creatorId === 'starter') render as slim chips (name + value only,
  // roughly half width); designed (human/claude) cards always render
  // full-size.
  compactStarters: boolean;
  // The currently-running implement job's id (MatchState.activeJobId), or
  // null if none is in flight. Drives which label/action the locked-card
  // preview's forge button offers: "Watch it being forged" when a job is
  // live, or the stalled-job "inspect" fallback when it isn't.
  activeJobId: string | null;
  // Opens the live forge-progress overlay (src/ui/forgeProgress.ts) for
  // activeJobId. Only invoked while activeJobId is non-null.
  onWatchForge: () => void;
  // Opens the existing failed/needs-clarification paused overlay when a
  // card is locked but no job is currently running (e.g. after an
  // interrupt) -- there is nothing live to "watch" in that case.
  onInspectStalled: () => void;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderHand(
  container: HTMLElement,
  hand: CardInstance[],
  registry: ReadonlyMap<CardId, CardDef>,
  effects: ReadonlyMap<CardId, unknown>,
  options: RenderHandOptions
): void {
  interface Entry {
    instanceId: string;
    name: string;
    effectText: string;
    value: number | undefined;
    // Non-blocking implement-job feature: drawable/holdable but not
    // playable (see shared/cardLock.ts). Derived from the REGISTRY, not
    // from whether an effect module happens to be loaded -- the two usually
    // agree, but the registry is the ground truth.
    locked: boolean;
    // Compact-starters view preference: plain starter cards render as slim
    // chips. Locked cards never go slim — they're novel (human/claude)
    // designs by construction, and the ⚒ "being forged" treatment always
    // wins.
    slim: boolean;
  }

  const entries: Entry[] = hand.map((inst) => {
    const def = registry.get(inst.cardId);
    const effect = effects.get(inst.cardId) as { baseValue?: number } | undefined;
    const locked = isCardLocked(def);
    return {
      instanceId: inst.instanceId,
      name: def?.name ?? inst.cardId,
      effectText: def?.effectText ?? '',
      value: effect?.baseValue,
      locked,
      slim: options.compactStarters && !locked && def?.creatorId === 'starter',
    };
  });

  let selectedId: string | null = null;

  function render(): void {
    const selected = entries.find((e) => e.instanceId === selectedId) ?? null;
    // A selection can go stale if the hand re-renders out from under us
    // (e.g. a fresh state came in after this instance was played/discarded).
    if (selectedId && !selected) selectedId = null;

    const previewHtml = selected
      ? `
        <div class="hand-preview${selected.locked ? ' hand-preview--locked' : ''}">
          <div class="hand-preview__text">
            <div class="hand-preview__name">${escapeHtml(selected.name)}</div>
            <p class="hand-preview__effect">${escapeHtml(selected.effectText) || '<em>No effect text.</em>'}</p>
            ${selected.locked ? `<p class="hand-preview__locked-note">&#9874;&#65039; ${escapeHtml(LOCKED_CARD_NOTE)}</p>` : ''}
          </div>
          <div class="hand-preview__actions">
            <button type="button" class="hand-preview__cancel" data-role="cancel">Cancel</button>
            ${
              selected.locked
                ? `<button type="button" class="hand-preview__forge-watch" data-role="forge-watch">${options.activeJobId ? 'Watch it being forged' : 'Forging stalled — inspect'}</button>`
                : '<button type="button" class="hand-preview__play" data-role="confirm-play">Play this card</button>'
            }
          </div>
        </div>
      `
      : '';

    const stripHtml =
      entries.length === 0
        ? `<p class="hand-empty">Your hand is empty.</p>`
        : entries
            .map(
              (e) => `
              <button
                type="button"
                class="card-chip card-chip--hand${e.instanceId === selectedId ? ' is-selected' : ''}${e.locked ? ' card-chip--locked' : ''}${e.slim ? ' card-chip--slim' : ''}"
                data-instance-id="${e.instanceId}"
                aria-pressed="${e.instanceId === selectedId}"
                ${options.interactive ? '' : 'disabled'}
              >
                ${cardChipHtml(e.name, e.value, e.effectText, { locked: e.locked })}
              </button>
            `
            )
            .join('');

    container.innerHTML = `
      <div class="hand-dock__body${options.interactive ? '' : ' hand-dock__body--locked'}">
        ${options.interactive ? '' : '<p class="hand-dock__locked-note">Waiting&hellip; it isn&rsquo;t your turn to act right now.</p>'}
        ${previewHtml}
        <div class="hand-strip" data-role="strip">${stripHtml}</div>
        <button type="button" class="pass-button" data-role="pass" ${options.interactive ? '' : 'disabled'}>
          Pass
        </button>
      </div>
    `;

    if (!options.interactive) return;

    container.querySelectorAll<HTMLButtonElement>('[data-instance-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.instanceId;
        if (!id) return;
        selectedId = selectedId === id ? null : id;
        render();
      });
    });

    container.querySelector<HTMLButtonElement>('[data-role="cancel"]')?.addEventListener('click', () => {
      selectedId = null;
      render();
    });

    container.querySelector<HTMLButtonElement>('[data-role="confirm-play"]')?.addEventListener('click', () => {
      if (selectedId) options.onPlay(selectedId);
    });

    container.querySelector<HTMLButtonElement>('[data-role="forge-watch"]')?.addEventListener('click', () => {
      if (options.activeJobId) options.onWatchForge();
      else options.onInspectStalled();
    });

    container.querySelector<HTMLButtonElement>('[data-role="pass"]')?.addEventListener('click', () => {
      options.onPass?.();
    });
  }

  render();
}
