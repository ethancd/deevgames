/** Wilson score interval for a binomial proportion (95% default). */
export function wilson(
  successes: number,
  trials: number,
  z = 1.96
): { p: number; lo: number; hi: number } {
  if (trials === 0) return { p: NaN, lo: NaN, hi: NaN };
  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / denom;
  return { p, lo: Math.max(0, center - margin), hi: Math.min(1, center + margin) };
}

export function mean(xs: number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function fmtPct(x: number): string {
  return Number.isNaN(x) ? '—' : `${(100 * x).toFixed(1)}%`;
}

export function fmtCI(ci: { p: number; lo: number; hi: number }): string {
  return Number.isNaN(ci.p) ? '—' : `${fmtPct(ci.p)} [${fmtPct(ci.lo)}–${fmtPct(ci.hi)}]`;
}
