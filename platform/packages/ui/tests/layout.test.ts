import { describe, expect, it } from 'vitest';
import {
  expectStableRect,
  expectExplicitSize,
  expectStableGaps,
  isLayoutCapable,
  NO_LAYOUT_ENGINE_MESSAGE,
} from '../src/test/layout.ts';

// jsdom has no layout engine: getBoundingClientRect() always reports 0x0
// here. This is the ONLY layout.ts test this pass ships (per plan) — it
// proves the guard fires with the pointed browser-mode message, rather than
// silently rubber-stamping a 0x0-vs-0x0 "match". The success path (real
// geometry actually matching/diverging) is validated by this package's
// first browser-mode consumer (see README.md).

describe('layout.ts jsdom guard', () => {
  it('isLayoutCapable() is false under jsdom', () => {
    expect(isLayoutCapable()).toBe(false);
  });

  it('expectStableRect() throws the pointed browser-mode message under jsdom', () => {
    const render = (variant: string): HTMLElement => {
      const el = document.createElement('div');
      el.textContent = variant;
      document.body.appendChild(el);
      return el;
    };

    expect(() => expectStableRect(render, ['a', 'bbbbbb'])).toThrow(NO_LAYOUT_ENGINE_MESSAGE);
  });

  it('expectExplicitSize() throws the pointed browser-mode message under jsdom', () => {
    const el = document.createElement('div');
    el.style.height = '40px';
    el.style.minHeight = '40px';
    document.body.appendChild(el);

    expect(() => expectExplicitSize(el)).toThrow(NO_LAYOUT_ENGINE_MESSAGE);
  });

  it('expectStableGaps() throws the pointed browser-mode message under jsdom', () => {
    const getSiblings = (): HTMLElement[] => {
      const container = document.createElement('div');
      const a = document.createElement('div');
      const b = document.createElement('div');
      container.append(a, b);
      document.body.appendChild(container);
      return [a, b];
    };

    expect(() => expectStableGaps(getSiblings, ['x', 'y'])).toThrow(NO_LAYOUT_ENGINE_MESSAGE);
  });
});
