// Shared "view the law" code-reveal widget (feature: show the code). A
// lazy-fetched, collapsible monospace view of a card's generated effect
// module and (when present) its test file, via GET /api/card-source/:id.
// Used by both the Codex (src/ui/codex.ts) and the post-implement-job "See
// what your card became" reveal (src/ui/jobStatus.ts#renderCardReveal) so
// the two surfaces never drift apart.
//
// renderCodeViewToggle returns markup for ONE card; wireCodeViewToggles must
// be called once afterward on an ancestor element to attach the lazy-fetch
// behavior (mirrors cardChip.ts's render-then-attach convention).

import type { CardId } from '../../shared/types';
import * as api from '../net/apiClient';

export function renderCodeViewToggle(cardId: CardId): string {
  return `
    <div class="code-view" data-role="code-view" data-card-id="${cardId}">
      <button type="button" class="code-view__toggle" data-role="code-view-toggle">View the law</button>
      <div class="code-view__body" data-role="code-view-body" hidden>
        <pre class="code-view__pre" data-role="code-view-effect-pre"></pre>
        <button
          type="button"
          class="code-view__test-toggle"
          data-role="code-view-test-toggle"
          hidden
        ></button>
        <pre class="code-view__pre code-view__pre--test" data-role="code-view-test-pre" hidden></pre>
      </div>
    </div>
  `;
}

// Call once after inserting any number of renderCodeViewToggle() blocks into
// `root`'s innerHTML.
export function wireCodeViewToggles(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-role="code-view"]').forEach((wrap) => {
    const cardId = wrap.dataset.cardId;
    if (!cardId) return;
    const toggleBtn = wrap.querySelector<HTMLButtonElement>('[data-role="code-view-toggle"]');
    const body = wrap.querySelector<HTMLElement>('[data-role="code-view-body"]');
    const effectPre = wrap.querySelector<HTMLElement>('[data-role="code-view-effect-pre"]');
    const testToggleBtn = wrap.querySelector<HTMLButtonElement>('[data-role="code-view-test-toggle"]');
    const testPre = wrap.querySelector<HTMLElement>('[data-role="code-view-test-pre"]');
    if (!toggleBtn || !body || !effectPre || !testToggleBtn || !testPre) return;

    let loaded = false;
    let loading = false;

    toggleBtn.addEventListener('click', () => {
      if (loading) return;

      if (loaded) {
        body.hidden = !body.hidden;
        toggleBtn.textContent = body.hidden ? 'View the law' : 'Hide the law';
        return;
      }

      loading = true;
      body.hidden = false;
      toggleBtn.disabled = true;
      toggleBtn.textContent = 'Loading…';

      api
        .getCardSource(cardId)
        .then((source) => {
          loaded = true;
          effectPre.textContent = source.effectSource;
          const lawLines = source.effectSource.split('\n').length;

          if (source.testSource !== null) {
            const testSource = source.testSource;
            const testCount = (testSource.match(/\bit(\.\w+)?\(/g) ?? []).length;
            testToggleBtn.hidden = false;
            testToggleBtn.textContent = `${lawLines} lines of law · ${testCount} tests`;
            testToggleBtn.addEventListener('click', () => {
              const nowHidden = !testPre.hidden;
              testPre.hidden = nowHidden;
              if (!nowHidden && !testPre.textContent) testPre.textContent = testSource;
            });
          } else {
            testToggleBtn.hidden = false;
            testToggleBtn.disabled = true;
            testToggleBtn.textContent = `${lawLines} lines of law · no tests (starter)`;
          }

          toggleBtn.textContent = 'Hide the law';
        })
        .catch((err: unknown) => {
          effectPre.textContent = `Failed to load source: ${err instanceof Error ? err.message : String(err)}`;
          toggleBtn.textContent = 'View the law';
        })
        .finally(() => {
          loading = false;
          toggleBtn.disabled = false;
        });
    });
  });
}
