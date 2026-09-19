import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { AIThinkingTimer, AI_TIMER_MIN_BUDGET_MS, remainingColor, remainingHue } from '../../src/components/AIThinkingTimer';

/**
 * The AI's turn clock. The wedge is the SEARCH time remaining — `spentMs` plus
 * whatever the in-flight search has been running — its colour is a continuous
 * function of that fraction, and an overrun stops at empty instead of counting
 * past zero. Everything is driven from `performance.now()`, so the tests move
 * the clock rather than waiting.
 */
let now = 0;
let reducedMotion = false;

beforeEach(() => {
  now = 0;
  reducedMotion = false;
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setInterval', 'clearInterval'] });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('matchMedia', (media: string) => ({
    media, matches: media.includes('prefers-reduced-motion') && reducedMotion,
    addEventListener() {}, removeEventListener() {},
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** Moves the shared clock and lets the component's own loop catch up. */
const advance = (ms: number) => act(() => { now += ms; vi.advanceTimersByTime(ms); });

const dial = () => screen.getByRole('timer');
const wedge = () => dial().querySelector('path');
const hand = () => dial().querySelector('.ai-timer-hand') as SVGLineElement;
/** The rotation the hand is drawn at, or null under reduced motion. */
const handAngle = () => dial().querySelector('g')?.getAttribute('transform') ?? null;

it('interpolates green → yellow → red continuously over the remaining time', () => {
  expect(remainingHue(1)).toBe(130);
  expect(remainingHue(0.5)).toBe(50);
  expect(remainingHue(0)).toBe(0);
  // Between the anchors it is a straight line, not a third step.
  expect(remainingHue(0.75)).toBe(90);
  expect(remainingHue(0.25)).toBe(25);
  // Clamped, so an overrun or a clock that jumps backwards is still a colour.
  expect(remainingHue(1.4)).toBe(130);
  expect(remainingHue(-0.2)).toBe(0);
  expect(remainingColor(1)).toBe('hsl(130.0, 68%, 46%)');
  expect(remainingColor(0)).toBe('hsl(0.0, 68%, 46%)');
});

it('shrinks the remaining wedge clockwise from 12 o’clock and recolours it', () => {
  render(<AIThinkingTimer budgetMs={30_000} spentMs={0} searchingSince={0} />);
  // A full allowance is a whole disc: a 360° arc would draw nothing.
  expect(wedge()).toBeNull();
  expect(dial().querySelector('circle[fill]')).toHaveAttribute('fill', 'hsl(130.0, 68%, 46%)');

  advance(15_000);
  // Half spent: the wedge starts at 6 o'clock and runs round to the top.
  expect(wedge()).toHaveAttribute('d', expect.stringContaining('L 24.00 42.00'));
  expect(wedge()).toHaveAttribute('fill', 'hsl(50.0, 68%, 46%)');

  advance(7_500);
  expect(wedge()).toHaveAttribute('fill', 'hsl(25.0, 68%, 46%)');
});

/**
 * THE DIAL COUNTS SEARCH TIME, NOT THE TURN'S WALL CLOCK. `spentMs` is what the
 * turn's finished searches were debited and `searchingSince` is null between
 * them, so a seat dispatching actions (the 400 ms `thinkingDelay`, the worker
 * round trip, React's commit — all outside the allowance) holds its wedge where
 * it was instead of draining it.
 */
it('pauses while no search is in flight and resumes with the next one', () => {
  const view = render(<AIThinkingTimer budgetMs={10_000} spentMs={4_000} searchingSince={null} />);
  const frozen = wedge()?.getAttribute('d');
  expect(dial()).toHaveAttribute('aria-label', 'AI thinking, 6 seconds left of 10');
  const still = handAngle();

  // Three seconds of dispatch: the dial does not move, because nothing is spent.
  advance(3_000);
  expect(wedge()?.getAttribute('d')).toBe(frozen);
  expect(dial()).toHaveAttribute('aria-label', 'AI thinking, 6 seconds left of 10');
  expect(handAngle()).toBe(still);

  // The next search starts, and only now does the wedge move again.
  view.rerender(<AIThinkingTimer budgetMs={10_000} spentMs={4_000} searchingSince={now} />);
  advance(1_000);
  expect(dial()).toHaveAttribute('aria-label', 'AI thinking, 5 seconds left of 10');

  // It ends having spent one of the two seconds it ran; the debit is what the
  // dial keeps, never the wall time it was up for.
  view.rerender(<AIThinkingTimer budgetMs={10_000} spentMs={5_000} searchingSince={null} />);
  advance(2_000);
  expect(dial()).toHaveAttribute('aria-label', 'AI thinking, 5 seconds left of 10');
});

it('clamps an overrun at an empty dial instead of counting past zero', () => {
  render(<AIThinkingTimer budgetMs={10_000} spentMs={0} searchingSince={0} />);
  advance(14_000);
  expect(wedge()).toBeNull();
  expect(dial().querySelector('circle[fill]')).toBeNull();
  expect(dial()).toHaveAttribute('aria-label', 'AI thinking, 0 seconds left of 10');
  expect(dial().querySelector('.ai-timer-seconds')).toHaveTextContent('0');
});

// One revolution per 10 s once the allowance is that long, one per allowance
// below it — which, given the 3 s gate, is only the 3 s allowances. A hand tied
// to a 60 s allowance would look stopped.
it('sweeps the second hand once per ten seconds, or once per short allowance', () => {
  const view = render(<AIThinkingTimer budgetMs={60_000} spentMs={0} searchingSince={0} />);
  advance(2_500);
  expect(dial().querySelector('g')).toHaveAttribute('transform', 'rotate(90 24 24)');
  view.rerender(<AIThinkingTimer budgetMs={AI_TIMER_MIN_BUDGET_MS} spentMs={0} searchingSince={now} />);
  advance(1_500);
  expect(dial().querySelector('g')).toHaveAttribute('transform', 'rotate(180 24 24)');
});

/**
 * THE HAND IS A POINTER IN THE OUTER BAND. Drawn from the centre it passed under
 * the centred numeral and at 9 o'clock read as a minus sign ("−3"); it now
 * starts outside the numeral's box and ends at the ring.
 */
it('draws the hand in the outer band, clear of the numeral', () => {
  render(<AIThinkingTimer budgetMs={30_000} spentMs={0} searchingSince={0} />);
  const inner = 24 - Number(hand().getAttribute('y1'));
  const tip = 24 - Number(hand().getAttribute('y2'));
  expect(hand().getAttribute('x1')).toBe('24');
  expect(hand().getAttribute('x2')).toBe('24');
  expect(inner).toBe(10);
  expect(tip).toBe(19.5);
  // Clear of a two-digit 13 px numeral (~9 px of half-width) and inside the
  // 21 px ring, so it reads as a hand at every hour.
  expect(inner).toBeGreaterThan(9);
  expect(tip).toBeLessThan(21);
  // The shadow underneath is the same segment, not a radius.
  const shadow = dial().querySelector('.ai-timer-hand-shadow') as SVGLineElement;
  expect(shadow.getAttribute('y1')).toBe(hand().getAttribute('y1'));
});

it('drops the hand and steps the wedge at 4 Hz under reduced motion', () => {
  reducedMotion = true;
  render(<AIThinkingTimer budgetMs={10_000} spentMs={0} searchingSince={0} />);
  expect(dial().querySelector('.ai-timer-hand')).toBeNull();
  advance(240);
  // Nothing has been redrawn yet — no per-frame updates at all.
  expect(wedge()).toBeNull();
  // The next step lands with a quarter of the allowance spent.
  advance(2_260);
  expect(wedge()).toHaveAttribute('fill', 'hsl(90.0, 68%, 46%)');
});

it('names the time left in whole seconds, without announcing every tick', () => {
  render(<AIThinkingTimer budgetMs={30_000} spentMs={0} searchingSince={0} />);
  expect(dial()).toHaveAttribute('aria-live', 'off');
  expect(dial()).toHaveAttribute('aria-label', 'AI thinking, 30 seconds left of 30');
  advance(18_000);
  expect(dial()).toHaveAttribute('aria-label', 'AI thinking, 12 seconds left of 30');
  advance(11_200);
  expect(dial()).toHaveAttribute('aria-label', 'AI thinking, 1 second left of 30');
});
