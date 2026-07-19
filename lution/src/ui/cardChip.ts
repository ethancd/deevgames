// Shared markup for a "card chip": name + point value, with the full effect
// text revealed by TAP (never hover-only — see styles.css's `.is-expanded` /
// `:focus-within` rules). Used by hand.ts, board.ts, and designRound.ts so
// every card looks and behaves consistently across screens.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Non-blocking implement-job feature: shared copy for why a locked card
// can't be played yet -- reused by cardChipHtml's tooltip and hand.ts's tap
// preview so the wording never drifts between the two surfaces.
export const LOCKED_CARD_NOTE = "This card's law is still being written — unplayable until forged.";

export interface CardChipOptions {
  // True when the card's registry entry has implemented === false &&
  // destroyed === false (see shared/cardLock.ts). A locked card shows a
  // "being forged" badge where the point value would be, regardless of
  // whether `value` happens to already be known.
  locked?: boolean;
}

// value is undefined when a card's effect module hasn't been implemented
// yet (a brand-new design between reveal and the implement job finishing) --
// this is exactly the locked state for the 20-30 seconds before `locked`
// becomes derivable from a real registry row, so the two render identically
// even though only `locked` is precise once the registry entry exists.
export function cardChipHtml(
  name: string,
  value: number | undefined,
  effectText: string,
  options: CardChipOptions = {}
): string {
  const locked = options.locked ?? false;
  const valueLabel = locked ? '⚒' : value === undefined ? '?' : String(value);
  const valueAriaLabel = locked
    ? 'being forged, not yet playable'
    : value === undefined
      ? 'value not yet known'
      : `worth ${value} points`;
  return `
    <span class="card-chip__head">
      <span class="card-chip__name">${escapeHtml(name)}</span>
      <span class="card-chip__value${locked ? ' card-chip__value--locked' : ''}" aria-label="${valueAriaLabel}">${valueLabel}</span>
    </span>
    <span class="card-chip__tooltip">${escapeHtml(effectText)}${locked ? `<br><em>${escapeHtml(LOCKED_CARD_NOTE)}</em>` : ''}</span>
  `;
}

// Wires up tap-to-expand for any "static" card chip in `root` — i.e. chips
// that are just informational (keepers already in play), as opposed to
// hand.ts's chips which use tap for selection instead and show the full
// effect text in a preview panel. Call once after setting innerHTML.
export function attachCardChipToggles(root: HTMLElement, selector = '[data-role="chip-toggle"]'): void {
  root.querySelectorAll<HTMLButtonElement>(selector).forEach((btn) => {
    btn.addEventListener('click', () => {
      const expanded = btn.classList.toggle('is-expanded');
      btn.setAttribute('aria-expanded', String(expanded));
    });
  });
}
