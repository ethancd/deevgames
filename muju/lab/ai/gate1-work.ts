/**
 * The one thing that makes a Gate 1 work budget and a Gate 1 work measurement the
 * same quantity: a meter over `SearchBudget#spend`.
 *
 * `SearchBudget` (`src/ai/runtime.ts`) counts one unit per `spend()`, and
 * `fixedWork` is a cap on exactly that counter. The class does not expose the
 * counter, and `src/ai/**` is not this lane's to edit, so the meter below wraps
 * `SearchBudget.prototype.spend` for the duration of a measurement and restores
 * it afterwards.
 *
 * WHY IT LIVES IN ITS OWN FILE. It was inside `gate1-calibrate.ts` while only the
 * calibration measured work. The row's adapter (`gate1-bot.ts`) now needs it too:
 * the shipped whole-turn loop debits a turn's allowance by what each search
 * ACTUALLY SPENT (`useAI.ts` debits `result.timeMs`), and the fixed-work analogue
 * of "what the search spent" is this counter. A row that charged the requested
 * slice instead would bill a search that finished early for work it never did,
 * which is how the previous adapter ended up spending a whole turn's allowance on
 * the first third of the turn.
 *
 * SINGLE-THREADED BY CONTRACT. One search is in flight at a time — the harness
 * awaits `nextAction` — so a process-wide counter is exact. `install()` throws if
 * a meter is already installed, so a leaked patch can never silently
 * double-count, and one meter is shared by both engines of a row.
 */
import { SearchBudget } from '../../src/ai/runtime';

export class WorkMeter {
  private original: SearchBudget['spend'] | null = null;
  private total = 0;
  install(): void {
    if (this.original) throw new Error('Work meter already installed');
    this.original = SearchBudget.prototype.spend;
    const original = this.original;
    const meter = this;
    SearchBudget.prototype.spend = function (this: SearchBudget, amount = 1): boolean {
      const accepted = original.call(this, amount);
      if (accepted) meter.total += amount;
      return accepted;
    };
  }
  uninstall(): void {
    if (!this.original) return;
    SearchBudget.prototype.spend = this.original;
    this.original = null;
  }
  /** True while this meter is patched in; a row asserts it before it plays. */
  get installed(): boolean { return this.original !== null; }
  reset(): void { this.total = 0; }
  read(): number { return this.total; }
  /** Installs the meter for `fn` and always restores the prototype. */
  static async around<T>(fn: (meter: WorkMeter) => Promise<T>): Promise<T> {
    const meter = new WorkMeter();
    meter.install();
    try { return await fn(meter); } finally { meter.uninstall(); }
  }
}
