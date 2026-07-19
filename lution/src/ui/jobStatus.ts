// Renders the implement-cards job-status screen (polled ~1s via
// net/apiClient.ts#getJob): queued -> running -> testing -> done | failed |
// needs-clarification | interrupted.
//
// 'queued' | 'running' | 'testing' render via renderJobStatus (live,
// non-blocking — MatchState.phase stays 'design' while these are showing).
// 'failed' | 'interrupted' | 'needs-clarification' render via renderPaused
// (MatchState.phase moves to 'paused' — all three need a human to act
// before the match can continue).
//
// The retry endpoint (POST /api/jobs/:id/retry) takes no body — there is no
// contract for submitting edited card text through the API. Per the plan,
// "manual mode" means the human edits the on-disk files directly (the
// registry entry's effectText and/or the generated effect module), then
// either "Retry" (let Claude take another swing) or "Verify & Resume" (just
// re-run the job, which re-reads the now-edited files and runs test:cards)
// — both call the same retryJob endpoint; the distinction is purely in the
// human's intent, not a different API call.

import type { CardDef, CardId, JobRecord, JobStatus } from '../../shared/types';
import type { CardEffect } from '../engine/types';
import { humanizeApiError } from '../net/apiClient';
import { cardChipHtml } from './cardChip';
import { renderCodeViewToggle, wireCodeViewToggles } from './codeView';

export interface JobStatusCallbacks {
  onRetry: () => void;
  onManualVerifyAndResume: () => void;
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'Queued',
  running: 'Writing effect code',
  testing: 'Running tests',
  done: 'Done',
  failed: 'Failed',
  'needs-clarification': 'Needs clarification',
  interrupted: 'Interrupted',
};

function syntheticLogLines(job: JobRecord): string[] {
  const lines: string[] = [`Job ${job.id} for round ${job.round} (${job.cardIds.join(', ')})`];
  if (job.attempts > 0) {
    lines.push(`Attempt ${job.attempts}${job.attempts > 1 ? ' (retry)' : ''} started.`);
  }
  switch (job.status) {
    case 'queued':
      lines.push('Waiting for a worker slot…');
      break;
    case 'running':
      lines.push('Claude is writing src/effects/<id>.ts + tests/cards/<id>.test.ts…');
      break;
    case 'testing':
      lines.push('Running `npm run test:cards` against the new effect module(s)…');
      break;
    case 'done':
      lines.push('All tests passed. Registry updated.');
      break;
    default:
      break;
  }
  return lines;
}

export function renderJobStatus(container: HTMLElement, job: JobRecord): void {
  const lines = syntheticLogLines(job);
  container.innerHTML = `
    <section class="job-status">
      <h2>Implementing new cards&hellip;</h2>
      <div class="job-status__badge job-status__badge--${job.status}">
        <span class="spinner" aria-hidden="true"></span>
        ${STATUS_LABEL[job.status]}
      </div>
      <ul class="job-status__log">
        ${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}
      </ul>
      <p class="job-status__hint">This polls the server about once a second &mdash; no need to refresh.</p>
    </section>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Feature: non-blocking implement jobs. When a background job fails or
// needs clarification WHILE the match is live and playable, the match must
// NOT swap to a full-screen 'paused' state (the playing screen holds live
// input promises) -- instead app.ts shows a small header banner and, only
// when the human taps it, opens this exact same renderPaused markup as a
// body-appended overlay (same pattern as src/ui/codex.ts), on top of
// whatever screen is live underneath. Dismissing it (backdrop/close button)
// leaves the game exactly as it was -- the job stays failed/needing
// clarification until the human retries via the overlay's own buttons,
// which reuse the SAME callbacks a full paused screen would have used.
const JOB_ISSUE_OVERLAY_ID = 'job-issue-overlay';

export function openPausedOverlay(
  job: JobRecord,
  registryEntryPath: string,
  callbacks: JobStatusCallbacks & { onDismiss?: () => void }
): void {
  if (document.getElementById(JOB_ISSUE_OVERLAY_ID)) return;

  const overlay = document.createElement('div');
  overlay.id = JOB_ISSUE_OVERLAY_ID;
  overlay.className = 'job-issue-overlay';
  overlay.innerHTML = `
    <div class="job-issue-overlay__backdrop" data-role="job-issue-backdrop"></div>
    <div class="job-issue-overlay__panel" role="dialog" aria-modal="true" aria-label="Card forging issue">
      <button type="button" class="job-issue-overlay__close" data-role="job-issue-close" aria-label="Dismiss">&times;</button>
      <div data-role="job-issue-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const body = overlay.querySelector<HTMLElement>('[data-role="job-issue-body"]')!;
  renderPaused(body, job, registryEntryPath, callbacks);

  function close(): void {
    overlay.remove();
    callbacks.onDismiss?.();
  }
  overlay.querySelector('[data-role="job-issue-close"]')?.addEventListener('click', close);
  overlay.querySelector('[data-role="job-issue-backdrop"]')?.addEventListener('click', close);
}

// Called after a successful retry (a NEW job id was just kicked off) so the
// stale overlay for the OLD failed job doesn't linger on screen.
export function closePausedOverlay(): void {
  document.getElementById(JOB_ISSUE_OVERLAY_ID)?.remove();
}

export function renderPaused(
  container: HTMLElement,
  job: JobRecord,
  registryEntryPath: string,
  callbacks: JobStatusCallbacks
): void {
  const isClarification = job.status === 'needs-clarification';
  container.innerHTML = `
    <section class="paused">
      <h2>${isClarification ? 'Claude needs clarification' : 'Something went wrong'}</h2>
      <div class="job-status__badge job-status__badge--${job.status}">${STATUS_LABEL[job.status]}</div>

      ${
        isClarification
          ? `<p class="paused__question">${escapeHtml(job.clarificationQuestion ?? 'Claude could not implement one of the new cards as written.')}</p>`
          : `<p class="paused__error">${escapeHtml(
              job.error ? humanizeApiError(job.error) : 'The implement job failed after its automatic retries.'
            )}</p>`
      }

      <div class="paused__manual">
        <h3>Manual mode</h3>
        <ol>
          <li>Open <code>${escapeHtml(registryEntryPath)}</code> and edit the card's <code>effectText</code>${
    isClarification ? ' to resolve the question above' : ', or hand-fix the generated effect module in src/effects/'
  }.</li>
          <li>Save your changes.</li>
          <li>Click "Verify &amp; resume" below — this re-runs the job against your edits.</li>
        </ol>
        <button type="button" class="paused__verify" data-role="verify">Verify &amp; resume</button>
      </div>

      <div class="paused__retry">
        <p>Or, let Claude take another automatic swing at it:</p>
        <button type="button" class="paused__retry-button" data-role="retry">Retry</button>
      </div>
    </section>
  `;

  container.querySelector<HTMLButtonElement>('[data-role="retry"]')?.addEventListener('click', () => {
    callbacks.onRetry();
  });
  container.querySelector<HTMLButtonElement>('[data-role="verify"]')?.addEventListener('click', () => {
    callbacks.onManualVerifyAndResume();
  });
}

// Feature: "show the code" job-done moment. Rendered right after an
// implement job finishes (see src/ui/app.ts#completeImplementSuccess),
// before the match moves on to the next inner game -- a purely
// informational, stateless detour: nothing here is persisted to MatchState,
// so a reload instead of tapping Continue just skips straight past it (the
// existing designPhase/enterDesign machinery re-derives "these cards are
// implemented, resume playing" exactly as it always has).
export function renderCardReveal(
  container: HTMLElement,
  cards: CardDef[],
  effects: Map<CardId, CardEffect>,
  onContinue: () => void
): void {
  const plural = cards.length === 1 ? '' : 's';
  container.innerHTML = `
    <section class="card-reveal">
      <h2>See what your card${plural} became</h2>
      <p class="card-reveal__intro">
        Claude just wrote the code behind this round's new card${plural}. Take a look, or just
        continue &mdash; nothing here is required.
      </p>
      <div class="card-reveal__cards" data-role="card-reveal-cards">
        ${cards
          .map(
            (card) => `
              <div class="card-reveal__card">
                <div class="card-chip card-chip--reveal">
                  ${cardChipHtml(card.name, effects.get(card.id)?.baseValue, card.effectText)}
                </div>
                ${renderCodeViewToggle(card.id)}
              </div>
            `
          )
          .join('')}
      </div>
      <button type="button" class="card-reveal__continue" data-role="continue">Continue</button>
    </section>
  `;

  wireCodeViewToggles(container.querySelector<HTMLElement>('[data-role="card-reveal-cards"]')!);
  container.querySelector<HTMLButtonElement>('[data-role="continue"]')?.addEventListener('click', () => {
    onContinue();
  });
}

// Non-blocking implement jobs: once a background job finishes WHILE the
// match is already live and playable, the reveal can no longer be a screen
// swap (the playing screen holds live input promises -- see app.ts's module
// doc). This reuses the exact same renderCardReveal markup/behavior, just
// body-appended as a dismissible overlay (same pattern as src/ui/codex.ts)
// instead of taking over `container`. Reached from the "The law is
// written…" toast's "View" link (showUnlockToast below).
const CARD_REVEAL_OVERLAY_ID = 'card-reveal-overlay';

export function openCardRevealOverlay(cards: CardDef[], effects: Map<CardId, CardEffect>): void {
  if (document.getElementById(CARD_REVEAL_OVERLAY_ID)) return;
  if (cards.length === 0) return;

  const overlay = document.createElement('div');
  overlay.id = CARD_REVEAL_OVERLAY_ID;
  overlay.className = 'card-reveal-overlay';
  overlay.innerHTML = `
    <div class="card-reveal-overlay__backdrop" data-role="card-reveal-backdrop"></div>
    <div class="card-reveal-overlay__panel" role="dialog" aria-modal="true" aria-label="Newly forged cards">
      <button type="button" class="card-reveal-overlay__close" data-role="card-reveal-close" aria-label="Close">&times;</button>
      <div data-role="card-reveal-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  function close(): void {
    overlay.remove();
  }
  const body = overlay.querySelector<HTMLElement>('[data-role="card-reveal-body"]')!;
  renderCardReveal(body, cards, effects, close);
  overlay.querySelector('[data-role="card-reveal-close"]')?.addEventListener('click', close);
  overlay.querySelector('[data-role="card-reveal-backdrop"]')?.addEventListener('click', close);
}

// Non-blocking implement jobs: the dismissible "unlock" toast shown the
// instant a background job completes and its cards' effects have been
// hot-loaded into the live game. Purely a notification -- the game is
// already playable underneath by the time this appears. Stacks multiple
// toasts (rare, but possible if two jobs finish close together) in a single
// body-appended container rather than one overlay per toast.
const TOAST_STACK_ID = 'unlock-toast-stack';
const TOAST_AUTO_DISMISS_MS = 12000;

function toastStack(): HTMLElement {
  let stack = document.getElementById(TOAST_STACK_ID);
  if (!stack) {
    stack = document.createElement('div');
    stack.id = TOAST_STACK_ID;
    stack.className = 'unlock-toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}

export function showUnlockToast(cardNames: string[], onView: () => void): void {
  if (cardNames.length === 0) return;
  const toast = document.createElement('div');
  toast.className = 'unlock-toast';
  toast.innerHTML = `
    <span class="unlock-toast__text">The law is written &mdash; <strong>${escapeHtml(cardNames.join(', '))}</strong> now playable.</span>
    <button type="button" class="unlock-toast__view" data-role="unlock-toast-view">View</button>
    <button type="button" class="unlock-toast__dismiss" data-role="unlock-toast-dismiss" aria-label="Dismiss">&times;</button>
  `;
  toastStack().appendChild(toast);

  let dismissed = false;
  function dismiss(): void {
    if (dismissed) return;
    dismissed = true;
    toast.remove();
  }
  toast.querySelector('[data-role="unlock-toast-view"]')?.addEventListener('click', () => {
    onView();
    dismiss();
  });
  toast.querySelector('[data-role="unlock-toast-dismiss"]')?.addEventListener('click', dismiss);
  setTimeout(dismiss, TOAST_AUTO_DISMISS_MS);
}
