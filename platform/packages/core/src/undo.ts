// Undo with commit-point boundaries.
//
// Naive state-history undo lets a player undo across an rng-consuming or
// information-revealing action (draw a card, see it, undo, redraw). Games
// mark such actions via GameDef.isCommitPoint; UndoStack snapshots
// (state, rngState) per push and refuses to pop across a commit boundary
// unless forced.

import type { GameDef, Seat } from './game.ts';
import type { RngState } from './rng.ts';

export interface UndoEntry<S, A> {
  state: S;
  rngState: RngState;
  /** The action that LED AWAY from this snapshot (undefined for the initial push). */
  action?: A;
  actionSeat?: Seat;
  commit: boolean;
}

export class UndoStack<S, A, C = unknown, O = S> {
  private entries: UndoEntry<S, A>[] = [];

  constructor(private def: GameDef<S, A, C, O>) {}

  /** Push the pre-action snapshot together with the action about to apply. */
  push(state: S, rngState: RngState, action?: A, actionSeat?: Seat): void {
    const commit =
      action !== undefined && (this.def.isCommitPoint?.(state, action) ?? false);
    this.entries.push({ state, rngState, action, actionSeat, commit });
  }

  get depth(): number {
    return this.entries.length;
  }

  canUndo(): boolean {
    const top = this.entries[this.entries.length - 1];
    return top !== undefined && !top.commit;
  }

  /**
   * Pop the most recent snapshot. Refuses (returns null) if that snapshot's
   * action was a commit point, unless force is set.
   */
  undo(opts: { force?: boolean } = {}): { state: S; rngState: RngState } | null {
    const top = this.entries[this.entries.length - 1];
    if (!top) return null;
    if (top.commit && !opts.force) return null;
    this.entries.pop();
    return { state: top.state, rngState: top.rngState };
  }

  clear(): void {
    this.entries = [];
  }
}
