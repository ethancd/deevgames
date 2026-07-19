// Renders the blind-design screen (plan rule 4): the human types their card
// while Claude designs in parallel server-side; live mechanical validation
// (shared/validation.ts, via net/apiClient.ts#validateCard) as they type;
// draft autosave to localStorage (src/ui/designDraft.ts) so a Claude design-
// call failure detour never costs the human their typed-but-unlocked card
// text; simultaneous reveal once both designs are in; then the STEAL
// RESHAPED v3 resolution UI after a decisive round:
//   (i)   the LOSER chooses keep vs steal (renderLoserDecision).
//   (ii)  if steal, the LOSER picks first -- the winner's new design, or any
//         card in the winner's deck (renderLoserStealPick).
//   (iii) then the WINNER counter-raids -- the loser's new design, or any
//         card in the loser's deck EXCLUDING what was just taken in step (ii)
//         (renderWinnerCounterRaidPick).
// Under keep, each player just adds their own design to their own deck --
// nothing crosses decks, both designs survive. Under steal, picking a deck
// card instead of the design offered DESTROYS that spurned design forever --
// both pick screens carry a persistent warning to that effect.

import type { CardDef, CardId, PlayerId, ValidateCardResponse } from '../../shared/types';
import { cardChipHtml } from './cardChip';
import { loadDesignDraft, saveDesignDraft } from './designDraft';

const DEBOUNCE_MS = 300;

export interface DesignFormCallbacks {
  onValidate: (name: string, effectText: string) => Promise<ValidateCardResponse>;
  onSubmit: (name: string, effectText: string) => void;
}

// Compact status strip shown above the design form's header (and, more
// tersely, above the keep/steal decision screen) -- see src/ui/app.ts's
// runDesignFlow/runLoserDecision, which compute both lines from state the
// flow already has (never re-derived here). `resultLine` is either the
// opening round's existing explainer text (round 1) or a plain won/lost
// sentence (every later round); `tallyLine` is the running match score.
export interface DesignStatusStrip {
  resultLine: string;
  tallyLine: string;
}

function statusStripHtml(strip: DesignStatusStrip): string {
  return `
    <div class="design-status-strip">
      <p class="design-status-strip__result">${escapeHtml(strip.resultLine)}</p>
      <p class="design-status-strip__tally">${escapeHtml(strip.tallyLine)}</p>
    </div>
  `;
}

export interface DesignFormHandle {
  setClaudeStatus(status: 'designing' | 'ready'): void;
  // Locks the form read-only and shows a "waiting on Claude" / "revealing"
  // message once the human has submitted their own design.
  setSubmittedLocked(name: string, effectText: string): void;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderDesignForm(
  container: HTMLElement,
  round: number,
  callbacks: DesignFormCallbacks,
  statusStrip: DesignStatusStrip
): DesignFormHandle {
  container.innerHTML = `
    ${statusStripHtml(statusStrip)}
    <section class="design-round design-round--sheet">
      <header class="design-round__header">
        <h2>Design round ${round}</h2>
        <p class="design-round__intro">
          Both you and Claude design a brand-new card, blind — neither of you sees the
          other's design until both are locked in. Only the numeral "1" (or "one",
          "once", "a"/"an") may appear; no other digits or number words. Keep it in
          English, don't repeat the same subeffect, hold the name to 32 characters
          and the effect text to 280 characters or fewer, and the card may only
          reference things inside a single game — no creators, rounds, or match state.
        </p>
        <p class="design-round__claude-status" data-role="claude-status">Claude is designing&hellip;</p>
      </header>
      <form class="design-form" data-role="design-form">
        <div class="design-form__fields">
          <label class="design-form__field">
            <span>Card name</span>
            <input type="text" name="name" maxlength="32" autocomplete="off" required />
          </label>
          <label class="design-form__field">
            <span>Effect text</span>
            <textarea name="effectText" rows="5" maxlength="280" required></textarea>
          </label>
          <ul class="design-form__violations" data-role="violations"></ul>
        </div>
        <div class="design-form__footer">
          <button type="submit" class="design-form__submit" data-role="submit" disabled>
            Lock in design
          </button>
        </div>
      </form>
    </section>
  `;

  const form = container.querySelector<HTMLFormElement>('[data-role="design-form"]')!;
  const nameInput = form.querySelector<HTMLInputElement>('input[name="name"]')!;
  const effectInput = form.querySelector<HTMLTextAreaElement>('textarea[name="effectText"]')!;
  const violationsEl = container.querySelector<HTMLElement>('[data-role="violations"]')!;
  const submitButton = container.querySelector<HTMLButtonElement>('[data-role="submit"]')!;
  const claudeStatusEl = container.querySelector<HTMLElement>('[data-role="claude-status"]')!;

  let latestOk = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let validateToken = 0;

  function renderViolations(violations: string[]): void {
    violationsEl.innerHTML = violations.map((v) => `<li>${escapeHtml(v)}</li>`).join('');
  }

  function scheduleValidate(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    const name = nameInput.value.trim();
    const effectText = effectInput.value.trim();
    if (!name || !effectText) {
      latestOk = false;
      submitButton.disabled = true;
      renderViolations([]);
      return;
    }
    debounceTimer = setTimeout(() => {
      // Autosave (Feature: design draft autosave) piggybacks on this same
      // debounce -- a Claude design-call failure detour (renderDesignFailure
      // wipes this form out of the DOM entirely) or an accidental reload
      // must not cost the human their typed-but-not-yet-locked card text.
      saveDesignDraft({ round, name, effectText });
      const token = ++validateToken;
      callbacks
        .onValidate(name, effectText)
        .then((result: ValidateCardResponse) => {
          if (token !== validateToken) return; // a newer keystroke superseded this check
          latestOk = result.ok;
          submitButton.disabled = !result.ok;
          renderViolations(result.violations);
        })
        .catch((err: unknown) => {
          if (token !== validateToken) return;
          latestOk = false;
          submitButton.disabled = true;
          renderViolations([`Validation check failed: ${String(err)}`]);
        });
    }, DEBOUNCE_MS);
  }

  // Restore a same-round draft (e.g. this form is re-rendering after a
  // "retry design call" detour) and immediately trigger the usual
  // validation pass so the submit button's enabled state matches the
  // restored text right away, instead of staying disabled until the next
  // keystroke.
  const draft = loadDesignDraft(round);
  if (draft) {
    nameInput.value = draft.name;
    effectInput.value = draft.effectText;
    scheduleValidate();
  }

  nameInput.addEventListener('input', scheduleValidate);
  effectInput.addEventListener('input', scheduleValidate);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!latestOk) return;
    // NOTE: deliberately NOT clearDesignDraft() here -- see designDraft.ts's
    // module doc. The draft is cleared only at the round-resolution
    // lifecycle point (finalizeRoundResolution), so a post-lock-in Claude
    // design-call failure that re-renders this form (see app.ts's
    // runDesignFlow/pendingHumanDraft resume path) still has something to
    // restore instead of showing empty.
    callbacks.onSubmit(nameInput.value.trim(), effectInput.value.trim());
  });

  return {
    setClaudeStatus(status) {
      claudeStatusEl.textContent =
        status === 'ready' ? 'Claude has locked in a design.' : 'Claude is designing…';
    },
    setSubmittedLocked(name, effectText) {
      container.innerHTML = `
        <section class="design-round design-round--sheet design-round--locked">
          <header class="design-round__header">
            <h2>Design round ${round}</h2>
            <p class="design-round__locked">Your design is locked in. Waiting for the simultaneous reveal&hellip;</p>
          </header>
          <div class="design-round__locked-card">
            <div class="card-chip card-chip--own card-chip--reveal">
              ${cardChipHtml(name, undefined, effectText)}
            </div>
          </div>
        </section>
      `;
    },
  };
}

export function renderReveal(
  container: HTMLElement,
  mine: { name: string; effectText: string },
  theirs: { name: string; effectText: string },
  onContinue: () => void
): void {
  container.innerHTML = `
    <section class="reveal">
      <h2>Reveal</h2>
      <div class="reveal__cards">
        <div class="reveal__card">
          <h3>Your design</h3>
          <div class="card-chip card-chip--own card-chip--reveal">${cardChipHtml(mine.name, undefined, mine.effectText)}</div>
        </div>
        <div class="reveal__card">
          <h3>Claude's design</h3>
          <div class="card-chip card-chip--opponent card-chip--reveal">${cardChipHtml(theirs.name, undefined, theirs.effectText)}</div>
        </div>
      </div>
      <button type="button" class="reveal__continue" data-role="continue">Continue</button>
    </section>
  `;
  container
    .querySelector<HTMLButtonElement>('[data-role="continue"]')
    ?.addEventListener('click', () => onContinue());
}

export interface DesignFailureCallbacks {
  onRetry: () => void;
  onGhostwrite: (name: string, effectText: string) => void;
  onValidateGhostwrite: (name: string, effectText: string) => Promise<ValidateCardResponse>;
}

// Rendered when POST /api/design-card fails (network/API-key error, or all
// mechanical-validation retries exhausted server-side) — per the plan's
// failure-handling section: "Design call failure -> retry or human
// ghostwrites Claude's card." The human can either ask the server to try
// Claude again, or type Claude's card themselves (mechanically validated the
// same way their own card is) so the round isn't blocked indefinitely.
//
// This form's name/effect inputs are deliberately NOT prefilled from
// src/ui/designDraft.ts's saved draft: that draft holds the HUMAN's own
// design (from renderDesignForm, which re-renders and restores it once this
// screen resolves via retry/ghostwrite), never Claude's — pasting it in here
// would silently hand Claude the human's own card text.
export function renderDesignFailure(
  container: HTMLElement,
  errorMessage: string,
  callbacks: DesignFailureCallbacks
): void {
  container.innerHTML = `
    <section class="design-failure">
      <h2>Claude's design call failed</h2>
      <p class="design-failure__error">${escapeHtml(errorMessage)}</p>
      <p>You can ask Claude to try again, or ghostwrite Claude's card yourself so the round can continue.</p>
      <button type="button" class="design-failure__retry" data-role="retry">Retry design call</button>
      <details class="design-failure__ghostwrite">
        <summary>Ghostwrite Claude's card instead</summary>
        <form data-role="ghostwrite-form" class="design-form">
          <label class="design-form__field">
            <span>Card name</span>
            <input type="text" name="name" maxlength="32" autocomplete="off" required />
          </label>
          <label class="design-form__field">
            <span>Effect text</span>
            <textarea name="effectText" rows="4" maxlength="280" required></textarea>
          </label>
          <ul class="design-form__violations" data-role="violations"></ul>
          <button type="submit" class="design-form__submit" data-role="ghostwrite-submit" disabled>
            Use this as Claude's card
          </button>
        </form>
      </details>
    </section>
  `;

  container.querySelector<HTMLButtonElement>('[data-role="retry"]')?.addEventListener('click', () => {
    callbacks.onRetry();
  });

  const form = container.querySelector<HTMLFormElement>('[data-role="ghostwrite-form"]')!;
  const nameInput = form.querySelector<HTMLInputElement>('input[name="name"]')!;
  const effectInput = form.querySelector<HTMLTextAreaElement>('textarea[name="effectText"]')!;
  const violationsEl = container.querySelector<HTMLElement>('[data-role="violations"]')!;
  const submitButton = container.querySelector<HTMLButtonElement>('[data-role="ghostwrite-submit"]')!;

  let latestOk = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let validateToken = 0;

  function scheduleValidate(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    const name = nameInput.value.trim();
    const effectText = effectInput.value.trim();
    if (!name || !effectText) {
      latestOk = false;
      submitButton.disabled = true;
      violationsEl.innerHTML = '';
      return;
    }
    debounceTimer = setTimeout(() => {
      const token = ++validateToken;
      callbacks
        .onValidateGhostwrite(name, effectText)
        .then((result: ValidateCardResponse) => {
          if (token !== validateToken) return;
          latestOk = result.ok;
          submitButton.disabled = !result.ok;
          violationsEl.innerHTML = result.violations.map((v) => `<li>${escapeHtml(v)}</li>`).join('');
        })
        .catch((err: unknown) => {
          if (token !== validateToken) return;
          latestOk = false;
          submitButton.disabled = true;
          violationsEl.innerHTML = `<li>Validation check failed: ${escapeHtml(String(err))}</li>`;
        });
    }, DEBOUNCE_MS);
  }

  nameInput.addEventListener('input', scheduleValidate);
  effectInput.addEventListener('input', scheduleValidate);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!latestOk) return;
    callbacks.onGhostwrite(nameInput.value.trim(), effectInput.value.trim());
  });
}

export function renderVoidNotice(container: HTMLElement, onContinue: () => void): void {
  container.innerHTML = `
    <section class="void-notice">
      <h2>Identical designs</h2>
      <p>
        Both designs came out effect-for-effect identical. Per the rock-paper-scissors
        rule, both are void &mdash; you and Claude will each design again, blind.
      </p>
      <button type="button" class="void-notice__continue" data-role="continue">Design again</button>
    </section>
  `;
  container
    .querySelector<HTMLButtonElement>('[data-role="continue"]')
    ?.addEventListener('click', () => onContinue());
}

export interface LoserDecisionCallbacks {
  onKeep: () => void;
  onSteal: () => void;
}

// Step (i) of STEAL RESHAPED v3: the LOSER of the inner game decides keep vs
// steal. `ownDesign` is the loser's own new design (what keep guarantees
// them -- untouched, forever). `winnerDesign` is merely the FIRST thing steal
// makes available: choosing steal means the loser gets first pick from
// either the winner's design or the winner's whole deck, but it also forfeits
// their own new design to the winner's mandatory counter-raid (taken, or
// destroyed if the winner already owns its type).
export function renderLoserDecision(
  container: HTMLElement,
  ownDesign: { name: string; effectText: string },
  winnerDesign: { name: string; effectText: string },
  callbacks: LoserDecisionCallbacks,
  // Running match tally ("Wins  You {h}/{m} · Claude {c}/{m}") -- see
  // renderDesignForm's DesignStatusStrip; shown here as its own line since
  // this screen's heading already covers won/lost.
  tallyLine: string,
  // Set only for round 1's opening design round -- see renderDesignForm's
  // matching parameter. When present, the heading no longer claims "you lost
  // this round" (no inner game has been played yet this match).
  openingNote?: string
): void {
  const heading = openingNote ? 'Keep or steal?' : 'You lost this round &mdash; keep or steal?';
  container.innerHTML = `
    <section class="keep-steal keep-steal--loser">
      <h2>${heading}</h2>
      <p class="design-status-strip__tally">${escapeHtml(tallyLine)}</p>
      ${openingNote ? `<p class="keep-steal__opening-note">${escapeHtml(openingNote)}</p>` : ''}
      <p>
        As the loser, this choice is yours. <strong>Keep</strong> and you simply add your own
        new design to your deck &mdash; nothing else moves, ever. <strong>Steal</strong> and
        you pick FIRST from the winner's new design or anything in their deck &mdash; but your
        own new design is then forfeit: the winner counter-raids right back, taking it (or
        executing it, if they created its type) or something else of yours instead.
      </p>
      <div class="keep-steal__choice">
        <button type="button" class="keep-steal__keep" data-role="keep">
          Keep your own design
          <div class="card-chip card-chip--own card-chip--reveal">${cardChipHtml(ownDesign.name, undefined, ownDesign.effectText)}</div>
        </button>
        <button type="button" class="keep-steal__steal" data-role="steal">
          Steal &mdash; pick first from the winner's design or deck
          <div class="card-chip card-chip--target card-chip--reveal">${cardChipHtml(winnerDesign.name, undefined, winnerDesign.effectText)}</div>
        </button>
      </div>
    </section>
  `;

  container.querySelector<HTMLButtonElement>('[data-role="keep"]')?.addEventListener('click', () => {
    callbacks.onKeep();
  });
  container.querySelector<HTMLButtonElement>('[data-role="steal"]')?.addEventListener('click', () => {
    callbacks.onSteal();
  });
}

// One candidate on either steal-pick screen (loser's step-1 pick, or the
// winner's step-2 counter-raid pick). `source: 'design'` is the design being
// offered this step; `source: 'existing'` is a card already sitting in the
// offering deck. `willDestroy` is true only for an 'existing' candidate the
// CURRENT PICKER originally created -- picking it executes it (denial, not
// profit) instead of taking it.
export interface StealPickOption {
  card: CardDef;
  source: 'design' | 'existing';
  willDestroy: boolean;
  value: number | undefined;
}

export interface StealPickCallbacks {
  onPick: (cardId: CardId) => void;
}

function renderStealPickScreen(
  container: HTMLElement,
  opts: { heading: string; introHtml: string; warning: string; options: StealPickOption[] },
  callbacks: StealPickCallbacks
): void {
  container.innerHTML = `
    <section class="keep-steal keep-steal--pick">
      <h2>${opts.heading}</h2>
      ${opts.introHtml}
      <p class="keep-steal__warning">${escapeHtml(opts.warning)}</p>
      <div class="keep-steal__options" data-role="options">
        ${opts.options
          .map(
            (opt) => `
              <button type="button" class="keep-steal__option" data-role="option" data-card-id="${opt.card.id}">
                <div class="card-chip card-chip--target card-chip--reveal">${cardChipHtml(opt.card.name, opt.value, opt.card.effectText)}</div>
                <span class="keep-steal__outcome">${
                  opt.willDestroy
                    ? 'You created this one — picking it EXECUTES it (denial, not profit) instead of taking it.'
                    : opt.source === 'design'
                      ? 'Take the design — it moves straight into your deck.'
                      : 'Take this card — it moves into your deck.'
                }</span>
              </button>
            `
          )
          .join('')}
      </div>
    </section>
  `;

  container.querySelectorAll<HTMLButtonElement>('[data-role="option"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cardId = btn.dataset.cardId;
      if (cardId) callbacks.onPick(cardId);
    });
  });
}

// Step (ii) of STEAL RESHAPED v3: the LOSER's forced first pick, from the
// winner's brand-new design or any card already in the winner's deck.
// `offererLabel` names whose design/deck is on the table ("Claude" / "you").
export function renderLoserStealPick(
  container: HTMLElement,
  offererLabel: string,
  options: StealPickOption[],
  callbacks: StealPickCallbacks
): void {
  renderStealPickScreen(
    container,
    {
      heading: `You stole first — pick from ${offererLabel}'s design or deck`,
      introHtml: `<p>Pick exactly one: ${escapeHtml(offererLabel)}'s brand-new design, or any card already in ${escapeHtml(offererLabel)}'s deck.</p>`,
      warning: `Picking a deck card instead of the design destroys ${offererLabel}'s design forever.`,
      options,
    },
    callbacks
  );
}

// Step (iii) of STEAL RESHAPED v3: the WINNER's mandatory counter-raid pick,
// from the loser's brand-new design or any card in the loser's deck
// EXCLUDING whatever the loser just took in step (ii) -- the caller is
// responsible for excluding it from `options`. There is no "keep" option
// here; keep was already decided (and rejected) by the loser in step (i).
export function renderWinnerCounterRaidPick(
  container: HTMLElement,
  offererLabel: string,
  options: StealPickOption[],
  callbacks: StealPickCallbacks
): void {
  renderStealPickScreen(
    container,
    {
      heading: `You won — counter-raid ${offererLabel}'s design or deck`,
      introHtml: `<p>${escapeHtml(offererLabel)} stole your design. Now pick exactly one back: ${escapeHtml(offererLabel)}'s brand-new design, or any card in ${escapeHtml(offererLabel)}'s deck (except what was just taken from you).</p>`,
      warning: `Picking a deck card instead of the design destroys ${offererLabel}'s design forever.`,
      options,
    },
    callbacks
  );
}

// Narrates an automatic (AI-driven) round resolution, or confirms a human
// decision, as a simple readable summary shown between the reveal/keep-steal
// screen and the job-status screen.
export function renderRoundNarration(container: HTMLElement, lines: string[]): void {
  container.innerHTML = `
    <section class="round-narration">
      <h2>Round resolved</h2>
      <ul class="round-narration__lines">
        ${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}
      </ul>
    </section>
  `;
}

export function playerLabel(id: PlayerId): string {
  return id === 'human' ? 'You' : 'Claude';
}
