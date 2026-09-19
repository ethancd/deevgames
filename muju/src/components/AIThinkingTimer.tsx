import { useEffect, useState } from 'react';

/**
 * The AI seat's turn clock: a simplified stopwatch whose filled wedge is the
 * SEARCH time remaining of this turn's allowance (`ai/turnTime.ts`), shrinking
 * clockwise from 12 o'clock and drifting green → yellow → red as it goes.
 *
 * IT COUNTS THE CLOCK THE ALLOWANCE IS DENOMINATED IN. `useAI` funds a turn
 * with search milliseconds and debits only what a search reported spending; the
 * 400 ms per-action dispatch animation, the worker round trips and React's own
 * commits are outside that budget. So the dial runs on `spentMs` plus the time
 * since `searchingSince`, and `searchingSince` is null whenever no search is in
 * flight — between two searches of one turn the hand stands still and the wedge
 * is frozen, because nothing is being spent.
 *
 * The AI moves as soon as it is ready, so this never runs out in an ordinary
 * turn — it unmounts mid-sweep when the plan comes back. Nothing here drives
 * the rest of the screen: the elapsed time lives in this component's own
 * state, so a frame costs one small re-render and never touches the board.
 */
interface AIThinkingTimerProps {
  /** Whole-turn allowance in milliseconds. */
  budgetMs: number;
  /** Search time this turn's finished searches have already been debited. */
  spentMs: number;
  /** `performance.now()` when the in-flight search started, or `null` when the
   * seat is between searches (dispatching, awaiting a commit, falling back). */
  searchingSince: number | null;
}

/**
 * THE SHORTEST ALLOWANCE THAT GETS A DIAL. Easy at `quick` is one second: a
 * dial there mounts, sweeps a whole revolution and unmounts every turn, which
 * reads as a flicker rather than as a clock, and a one-second countdown is
 * nothing a player can act on. Below this the caller keeps the static thinking
 * panel the game has always shown (`GameScreen.tsx` holds the one gate). At
 * three seconds the hand sweeps once per three seconds — a single calm
 * revolution per allowance — and only at ten seconds and above does it settle
 * into one revolution per ten (`sweepMs`).
 */
export const AI_TIMER_MIN_BUDGET_MS = 3000;

// One viewBox unit is one CSS pixel, so the dial reads the same everywhere.
const DIAL = 48;
const CENTRE = DIAL / 2;
const RING_R = 21, WEDGE_R = 18;
/**
 * The hand is a POINTER IN THE OUTER BAND, not a radius: it runs from `HAND_R0`
 * out to `HAND_R1`, where it meets the ring. A hand drawn from the centre passes
 * under the centred numeral, and at 9 o'clock a bar to the left of "3" reads as
 * "−3". `HAND_R0` clears the 13 px numeral (about 9 px of half-width at two
 * digits, outline included) with a pixel to spare.
 */
const HAND_R0 = 10, HAND_R1 = 19.5;
/**
 * How long the second hand takes for one revolution. ONE REVOLUTION PER
 * ALLOWANCE would be unreadable at 60 s, so the hand sweeps once per 10 s for
 * every allowance of 10 s or more and exactly once per allowance below that —
 * which, given `AI_TIMER_MIN_BUDGET_MS`, means the 3 s allowances and nothing
 * shorter. The floor of 1 ms only keeps the division defined.
 */
const sweepMs = (budgetMs: number): number => Math.min(Math.max(budgetMs, 1), 10_000);
/** Reduced motion drops the hand entirely and steps the wedge at 4 Hz. */
const REDUCED_STEP_MS = 250;
/** Below this the "remaining" arc is a full circle; an arc of 360° draws nothing. */
const FULL = 0.999;

/**
 * Remaining fraction → hue: 130 (green) when the turn is fresh, 50 (amber) at
 * half, 0 (red) at empty, interpolated continuously so the dial drifts through
 * the whole range instead of stepping between three colors.
 */
export function remainingHue(fraction: number): number {
  const f = Math.min(1, Math.max(0, fraction));
  return f >= 0.5 ? 50 + (f - 0.5) * 2 * (130 - 50) : f * 2 * 50;
}

export const remainingColor = (fraction: number): string => `hsl(${remainingHue(fraction).toFixed(1)}, 68%, 46%)`;

/** A point on the dial, `turns` clockwise from 12 o'clock. */
const pointOn = (turns: number, radius: number): string => {
  const angle = (turns - 0.25) * 2 * Math.PI;
  return `${(CENTRE + radius * Math.cos(angle)).toFixed(2)} ${(CENTRE + radius * Math.sin(angle)).toFixed(2)}`;
};

/**
 * The wedge still owed to the AI. Elapsed time is erased clockwise from 12
 * o'clock, so what is left runs from the sweep position round to 12 again.
 */
const wedgePath = (fraction: number): string =>
  `M ${CENTRE} ${CENTRE} L ${pointOn(1 - fraction, WEDGE_R)} A ${WEDGE_R} ${WEDGE_R} 0 ${fraction > 0.5 ? 1 : 0} 1 ${pointOn(1, WEDGE_R)} Z`;

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => !!window.matchMedia?.(REDUCED_MOTION).matches);
  useEffect(() => {
    const query = window.matchMedia?.(REDUCED_MOTION);
    if (!query) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

export function AIThinkingTimer({ budgetMs, spentMs, searchingSince }: AIThinkingTimerProps) {
  const reduced = usePrefersReducedMotion();
  /** Search time inside the request now in flight; 0 while none is. */
  const [searchingMs, setSearchingMs] = useState(() => searchingSince === null ? 0 : Math.max(0, performance.now() - searchingSince));

  useEffect(() => {
    // Nothing is being spent between searches, so there is nothing to animate:
    // one read to settle the frozen frame, and no loop at all.
    if (searchingSince === null) {
      setSearchingMs(0);
      return;
    }
    const read = () => setSearchingMs(Math.max(0, performance.now() - searchingSince));
    read();
    if (reduced) {
      const stepper = window.setInterval(read, REDUCED_STEP_MS);
      return () => window.clearInterval(stepper);
    }
    let frame = requestAnimationFrame(function tick() { read(); frame = requestAnimationFrame(tick); });
    return () => cancelAnimationFrame(frame);
  }, [searchingSince, reduced]);

  const elapsedMs = Math.max(0, spentMs) + searchingMs;
  // An overrun — a search that ran long, or a re-request the turn could not
  // afford — clamps at an empty red dial rather than counting past zero.
  const remainingMs = Math.min(budgetMs, Math.max(0, budgetMs - elapsedMs));
  const fraction = budgetMs > 0 ? remainingMs / budgetMs : 0;
  const color = remainingColor(fraction);
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const totalSeconds = Math.round(budgetMs / 1000);
  // Whole seconds, so the accessible name changes at most once a second even
  // though the wedge is redrawn every frame. `aria-live` stays off: the dial is
  // a progress readout to consult, not an announcement to sit through.
  const label = `AI thinking, ${secondsLeft} second${secondsLeft === 1 ? '' : 's'} left of ${totalSeconds}`;

  return (
    <svg className="ai-thinking-timer" role="timer" aria-live="off" aria-label={label}
      width={DIAL} height={DIAL} viewBox={`0 0 ${DIAL} ${DIAL}`} focusable="false">
      <circle className="ai-timer-face" cx={CENTRE} cy={CENTRE} r={RING_R} />
      {fraction >= FULL
        ? <circle cx={CENTRE} cy={CENTRE} r={WEDGE_R} fill={color} />
        : fraction > 0 && <path d={wedgePath(fraction)} fill={color} />}
      <circle className="ai-timer-ring" cx={CENTRE} cy={CENTRE} r={RING_R} />
      {!reduced && <g transform={`rotate(${((elapsedMs % sweepMs(budgetMs)) / sweepMs(budgetMs)) * 360} ${CENTRE} ${CENTRE})`}>
        <line className="ai-timer-hand-shadow" x1={CENTRE} y1={CENTRE - HAND_R0} x2={CENTRE} y2={CENTRE - HAND_R1} />
        <line className="ai-timer-hand" x1={CENTRE} y1={CENTRE - HAND_R0} x2={CENTRE} y2={CENTRE - HAND_R1} />
      </g>}
      {/* Whole seconds, outlined so they stay legible over any wedge color. */}
      <text className="ai-timer-seconds" x={CENTRE} y={CENTRE} textAnchor="middle" dominantBaseline="central">{secondsLeft}</text>
    </svg>
  );
}
