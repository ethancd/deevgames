// Renders the running turn/event log (InnerGameState.log) as a scrollback
// panel. Auto-scrolls to the newest entry unless the viewer has scrolled up
// to read history, in which case we leave their scroll position alone.

import type { LogEntry, PlayerId } from '../../shared/types';

const PLAYER_LABEL: Record<PlayerId, string> = {
  human: 'You',
  claude: 'Claude',
};

function entryHtml(entry: LogEntry): string {
  const who = PLAYER_LABEL[entry.player] ?? entry.player;
  return `
    <li class="log-entry log-entry--${escapeAttr(entry.type)}">
      <span class="log-entry__turn">T${entry.turn}</span>
      <span class="log-entry__who">${escapeHtml(who)}</span>
      <span class="log-entry__message">${escapeHtml(entry.message)}</span>
    </li>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function renderLog(container: HTMLElement, log: LogEntry[]): void {
  const wasNearBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight < 24;

  if (log.length === 0) {
    container.innerHTML = `<p class="log-empty">The table is quiet. Nothing has happened yet.</p>`;
    return;
  }

  container.innerHTML = `<ul class="log-list">${log.map(entryHtml).join('')}</ul>`;

  if (wasNearBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

// Small helper other UI modules use for one-off narration text (e.g.
// AI keep/steal narration outside of an InnerGameState.log context).
export function appendNarrationLine(container: HTMLElement, message: string): void {
  const p = document.createElement('p');
  p.className = 'narration-line';
  p.textContent = message;
  container.appendChild(p);
  container.scrollTop = container.scrollHeight;
}
