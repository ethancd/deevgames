// Headless tap-select-then-confirm state machine.
//
// Provenance: FORGE's two-click burn interaction (tap to select, tap again
// to confirm) plus Lution's fat-finger fix (napkin.md, "Round 2: mobile UI
// pass" — tap now SELECTS and shows explicit confirm/cancel instead of
// acting immediately). Fully synchronous, no DOM — pair with a thin
// framework adapter (see README.md for a React recipe).

export type ConfirmState<T> = 'idle' | { selected: T };

export interface ConfirmMachineOptions<T> {
  onConfirm(item: T): void;
  onCancel?(item: T): void;
  /** Identity check used to detect "selecting the same item". Defaults to `===`. */
  isSame?(a: T, b: T): boolean;
}

export interface ConfirmMachine<T> {
  state(): ConfirmState<T>;
  /** Selecting the SAME item is a no-op; selecting a different item switches selection (does not confirm). */
  select(item: T): void;
  /** Only fires onConfirm when something is selected, then resets to idle. */
  confirm(): void;
  cancel(): void;
  /** Alias of cancel per the FORGE reset rule (tapping outside the selection resets it). */
  clickElsewhere(): void;
}

export function createConfirmMachine<T>(opts: ConfirmMachineOptions<T>): ConfirmMachine<T> {
  const isSame = opts.isSame ?? ((a: T, b: T) => a === b);
  let current: ConfirmState<T> = 'idle';

  function cancel(): void {
    if (current === 'idle') return;
    const { selected } = current;
    current = 'idle';
    opts.onCancel?.(selected);
  }

  return {
    state() {
      return current;
    },
    select(item: T) {
      if (current !== 'idle' && isSame(current.selected, item)) {
        return; // same item tapped again: no-op, does not confirm
      }
      current = { selected: item }; // switching selection never auto-confirms
    },
    confirm() {
      if (current === 'idle') return;
      const { selected } = current;
      current = 'idle';
      opts.onConfirm(selected);
    },
    cancel,
    clickElsewhere: cancel,
  };
}
