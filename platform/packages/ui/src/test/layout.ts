// Layout-invariance test helpers.
//
// Provenance: Oracle of Delve's layout-invariant.visual.test.tsx +
// LAYOUT_STABILITY_REPORT.md (oracle/, read-only reference) — the
// discipline of measuring actual rendered geometry (getBoundingClientRect,
// getComputedStyle) rather than trusting CSS class names, so content
// variation (HP text length, conditional status strings, alive/defeated
// state, name length, ...) can never silently shift layout.
//
// jsdom trap: jsdom has NO layout engine. getBoundingClientRect() always
// returns a 0x0 rect there, which would make every one of these assertions
// pass "successfully" for entirely the wrong reason (nothing was actually
// measured). All three assertions below check for this up front and throw
// a pointed error instead of silently rubber-stamping. See README.md for
// the jsdom-quick vs browser-mode dual-run recipe — the *success* path of
// these helpers is only meaningfully validated under Vitest browser mode /
// Playwright, by this package's first browser-mode consumer.

export const NO_LAYOUT_ENGINE_MESSAGE =
  'jsdom has no layout engine — these assertions require Vitest browser mode / Playwright (see README).';

interface RectLike {
  width: number;
  height: number;
}

/**
 * True if the current environment can actually compute layout geometry.
 * Renders a probe element with an explicit size and checks whether
 * getBoundingClientRect reports it — jsdom never does.
 */
export function isLayoutCapable(): boolean {
  if (typeof document === 'undefined') return false;
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.width = '123px';
  probe.style.height = '123px';
  document.body.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  document.body.removeChild(probe);
  return rect.width > 0 || rect.height > 0;
}

function assertMeasured(rects: RectLike[]): void {
  const allZero = rects.every((r) => r.width === 0 && r.height === 0);
  if (allZero) {
    throw new Error(NO_LAYOUT_ENGINE_MESSAGE);
  }
}

/**
 * Renders each variant and asserts they all produce the same
 * getBoundingClientRect width/height. Throws listing the divergent
 * variant(s) + their px values.
 */
export function expectStableRect(render: (variant: string) => HTMLElement, variants: string[]): void {
  const rects = variants.map((variant) => render(variant).getBoundingClientRect());

  assertMeasured(rects);

  const [first, ...rest] = rects;
  const divergent: string[] = [];
  rest.forEach((rect, i) => {
    if (rect.width !== first.width || rect.height !== first.height) {
      divergent.push(
        `"${variants[i + 1]}" was ${rect.width}x${rect.height}, expected ${first.width}x${first.height} (from "${variants[0]}")`
      );
    }
  });

  if (divergent.length > 0) {
    throw new Error(`expectStableRect: divergent variants:\n${divergent.join('\n')}`);
  }
}

/**
 * Asserts `el`'s computed height and min-height are explicit sizes, not
 * 'auto' or '' — the geometry-first discipline from Oracle's
 * LAYOUT_STABILITY_REPORT.md ("Container has min-h-[...] or fixed
 * grid-template-rows").
 */
export function expectExplicitSize(el: HTMLElement): void {
  assertMeasured([el.getBoundingClientRect()]);

  const style = getComputedStyle(el);
  if (style.height === 'auto' || style.height === '') {
    throw new Error(`expectExplicitSize: computed height must not be 'auto'/'' (got "${style.height}")`);
  }
  if (style.minHeight === 'auto' || style.minHeight === '') {
    throw new Error(`expectExplicitSize: computed minHeight must not be 'auto'/'' (got "${style.minHeight}")`);
  }
}

/**
 * For each variant, measures the gaps between consecutive siblings
 * (next.top - prev.bottom) and asserts those gap sequences are identical
 * across all variants. Throws listing the divergent variant + gap index.
 */
export function expectStableGaps(
  getSiblings: (variant: string) => HTMLElement[],
  variants: string[]
): void {
  const gapsByVariant = variants.map((variant) => {
    const rects = getSiblings(variant).map((el) => el.getBoundingClientRect());
    assertMeasured(rects);
    const gaps: number[] = [];
    for (let i = 0; i < rects.length - 1; i++) {
      gaps.push(rects[i + 1].top - rects[i].bottom);
    }
    return gaps;
  });

  const [firstGaps, ...restGaps] = gapsByVariant;
  const divergent: string[] = [];
  restGaps.forEach((gaps, i) => {
    gaps.forEach((gap, j) => {
      if (gap !== firstGaps[j]) {
        divergent.push(
          `"${variants[i + 1]}" gap[${j}] = ${gap}, expected ${firstGaps[j]} (from "${variants[0]}")`
        );
      }
    });
  });

  if (divergent.length > 0) {
    throw new Error(`expectStableGaps: divergent gaps:\n${divergent.join('\n')}`);
  }
}
