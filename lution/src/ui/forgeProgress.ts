// Live "forge progress" viewer: while a card is locked and its implement
// job is running in the background, tapping the header "forging…" chip or
// the hand's locked-card preview opens this overlay to watch Claude write
// the card's effect code and tests in near-real-time.
//
// Same body-appended-overlay pattern as src/ui/codex.ts and
// src/ui/jobStatus.ts's job-issue/card-reveal overlays: appended directly to
// document.body, NOT into AppController's `container`, so it can sit on top
// of a live playing screen (pending input promises, background poll, etc.)
// without disturbing any of that.
//
// LIVE UPDATES: openForgeProgress does one initial GET /api/jobs/:id fetch
// to render immediately, then relies ENTIRELY on the caller invoking
// updateForgeProgress(job) on every tick of its OWN poll loop (src/ui/app.ts's
// pollJobInBackground) -- this module never starts its own polling interval,
// so there is exactly one poll loop per job, ever.

import type { CardDef, CardId, JobRecord, JobStatus } from '../../shared/types';
import type { CardEffect } from '../engine/types';
import * as api from '../net/apiClient';
import { STATUS_LABEL, openCardRevealOverlay } from './jobStatus';

const OVERLAY_ID = 'forge-progress-overlay';

// shared/types.ts's JobRecord doesn't declare `log` (it's a real field on
// the wire -- see server/router.ts's handleGetJob, which sends
// `job satisfies GetJobResponse & { log: string[] }`) -- widen locally
// rather than touch the shared type.
interface JobRecordWithLog extends JobRecord {
  log?: string[];
}

export interface ForgeProgressParams {
  jobId: string;
  registry: CardDef[];
  effects: Map<CardId, CardEffect>;
  // failed | needs-clarification | interrupted: handed the terminal job so
  // the caller can open ITS OWN paused/clarification overlay (which owns the
  // retry/manual-verify callbacks) after this overlay closes itself.
  onOpenPaused?: (job: JobRecord) => void;
}

const TERMINAL_STATUSES: readonly JobStatus[] = ['done', 'failed', 'needs-clarification', 'interrupted'];

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isStuckToBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 24;
}

function renderLogLine(line: string): string {
  const isTool = line.startsWith('[tool]');
  return `<div class="forge-log__line${isTool ? ' forge-log__line--tool' : ''}">${escapeHtml(line)}</div>`;
}

// The one live overlay instance's re-render handle, if any is currently
// open -- updateForgeProgress is a no-op unless it matches this jobId.
let current: { jobId: string; render: (job: JobRecord) => void } | null = null;

// Idempotent: a second call while the overlay is already open is a no-op,
// same as src/ui/codex.ts's openCodex.
export function openForgeProgress(params: ForgeProgressParams): void {
  if (document.getElementById(OVERLAY_ID)) return;

  const { jobId, registry, effects, onOpenPaused } = params;
  const registryMap = new Map(registry.map((c) => [c.id, c]));

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'forge-overlay';
  overlay.innerHTML = `
    <div class="forge-overlay__backdrop" data-role="forge-backdrop"></div>
    <div class="forge-overlay__panel" role="dialog" aria-modal="true" aria-label="The Forge">
      <header class="forge-overlay__header">
        <h1>The Forge</h1>
        <button type="button" class="forge-overlay__close" data-role="forge-close" aria-label="Close">&times;</button>
      </header>
      <div class="forge-cards" data-role="forge-cards"></div>
      <div class="forge-status" data-role="forge-status"></div>
      <div class="forge-log" data-role="forge-log"><p class="forge-log__empty">Waiting for the job to start&hellip;</p></div>
      <div data-role="forge-terminal"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  function close(): void {
    overlay.remove();
    if (current?.jobId === jobId) current = null;
  }
  overlay.querySelector('[data-role="forge-close"]')?.addEventListener('click', close);
  overlay.querySelector('[data-role="forge-backdrop"]')?.addEventListener('click', close);

  const cardsEl = overlay.querySelector<HTMLElement>('[data-role="forge-cards"]')!;
  const statusEl = overlay.querySelector<HTMLElement>('[data-role="forge-status"]')!;
  const logEl = overlay.querySelector<HTMLElement>('[data-role="forge-log"]')!;
  const terminalEl = overlay.querySelector<HTMLElement>('[data-role="forge-terminal"]')!;

  let cardsRendered = false;

  function render(job: JobRecord): void {
    // The cards being forged never change across a single job's lifetime --
    // render them once, the first time a job payload arrives.
    if (!cardsRendered) {
      const cards = job.cardIds.map((id) => registryMap.get(id)).filter((c): c is CardDef => c !== undefined);
      cardsEl.innerHTML = cards
        .map(
          (c) =>
            `<span class="forge-card-badge"><span class="forge-card-badge__icon" aria-hidden="true">&#9874;&#65039;</span>${escapeHtml(c.name)}</span>`
        )
        .join('');
      cardsRendered = true;
    }

    statusEl.innerHTML = `
      <span class="job-status__badge job-status__badge--${job.status}">
        <span class="spinner" aria-hidden="true"></span>
        ${STATUS_LABEL[job.status]}
      </span>
      ${job.attempts > 0 ? `<span class="forge-status__attempt">Attempt ${job.attempts}</span>` : ''}
    `;

    const lines = (job as JobRecordWithLog).log ?? [];
    const wasStuck = isStuckToBottom(logEl);
    logEl.innerHTML =
      lines.length === 0
        ? '<p class="forge-log__empty">Waiting for the job to start&hellip;</p>'
        : lines.map(renderLogLine).join('');
    if (wasStuck) logEl.scrollTop = logEl.scrollHeight;

    if (!TERMINAL_STATUSES.includes(job.status)) {
      terminalEl.innerHTML = '';
      return;
    }

    if (job.status === 'done') {
      terminalEl.innerHTML = `
        <div class="forge-terminal forge-terminal--done">
          <p class="forge-terminal__headline">&#10024; Forged! The law is written.</p>
          <button type="button" class="forge-terminal__button" data-role="forge-reveal">See what it became</button>
        </div>
      `;
      terminalEl.querySelector('[data-role="forge-reveal"]')?.addEventListener('click', () => {
        const cards = job.cardIds
          .map((id) => registryMap.get(id))
          .filter((c): c is CardDef => c !== undefined && !c.destroyed);
        close();
        openCardRevealOverlay(cards, effects);
      });
      return;
    }

    const label = job.status === 'needs-clarification' ? 'Claude needs clarification.' : 'Forging failed.';
    terminalEl.innerHTML = `
      <div class="forge-terminal forge-terminal--issue">
        <p class="forge-terminal__headline">${escapeHtml(label)}</p>
        <button type="button" class="forge-terminal__button" data-role="forge-inspect">Inspect</button>
      </div>
    `;
    terminalEl.querySelector('[data-role="forge-inspect"]')?.addEventListener('click', () => {
      close();
      onOpenPaused?.(job);
    });
  }

  current = { jobId, render };

  api
    .getJob(jobId)
    .then((job) => {
      if (current?.jobId === jobId) render(job);
    })
    .catch((err) => {
      console.error(`Failed to load forge progress for job ${jobId}`, err);
      if (document.getElementById(OVERLAY_ID) === overlay) {
        logEl.innerHTML = `<p class="forge-log__empty">Couldn&rsquo;t load progress for this job.</p>`;
      }
    });
}

// Called from app.ts's own background poll loop on every tick -- a no-op
// unless the overlay is open for this exact job id, so this module never
// needs (and must never start) a second competing poll loop.
export function updateForgeProgress(job: JobRecord): void {
  if (current?.jobId === job.id) current.render(job);
}
