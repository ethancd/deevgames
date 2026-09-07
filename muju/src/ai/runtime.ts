/** Search work is deterministic when maxWork is used without a deadline. */
export type RNG = () => number;
export function seededRandom(seed: number): RNG {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = Math.imul(a ^ a >>> 15, 1 | a); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export interface SearchStats {
  iterations: number; candidates: number; simulations: number; evaluations: number;
  tacticalNodes: number; turnBoundaries: number; elapsedMs: number;
  stopReason: 'complete' | 'deadline' | 'work'; backend: 'wasm' | 'javascript';
  tacticalStatus?: string;
}
export class SearchBudget {
  readonly started: number;
  readonly stats: SearchStats = { iterations: 0, candidates: 0, simulations: 0, evaluations: 0, tacticalNodes: 0, turnBoundaries: 0, elapsedMs: 0, stopReason: 'complete', backend: 'javascript' };
  private work = 0;
  constructor(readonly milliseconds = Infinity, readonly maxWork = Infinity, readonly now: () => number = () => performance.now()) { this.started = now(); }
  exhausted(): boolean {
    if (this.work >= this.maxWork) { this.stats.stopReason = 'work'; return true; }
    if (this.now() - this.started >= this.milliseconds) { this.stats.stopReason = 'deadline'; return true; }
    return false;
  }
  spend(amount = 1): boolean { if (this.exhausted()) return false; this.work += amount; return true; }
  finish(): SearchStats { this.stats.elapsedMs = this.now() - this.started; return this.stats; }
}
