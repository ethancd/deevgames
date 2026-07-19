import { describe, expect, it, vi } from 'vitest';
import { createConfirmMachine } from '../src/confirm.ts';

describe('createConfirmMachine', () => {
  it('starts idle', () => {
    const machine = createConfirmMachine<string>({ onConfirm: vi.fn() });
    expect(machine.state()).toBe('idle');
  });

  it('select() moves to selected state', () => {
    const machine = createConfirmMachine<string>({ onConfirm: vi.fn() });
    machine.select('card-a');
    expect(machine.state()).toEqual({ selected: 'card-a' });
  });

  it('selecting the SAME item is a no-op (does not re-select or confirm)', () => {
    const onConfirm = vi.fn();
    const machine = createConfirmMachine<string>({ onConfirm });
    machine.select('card-a');
    machine.select('card-a');
    expect(machine.state()).toEqual({ selected: 'card-a' });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('selecting a DIFFERENT item switches selection without confirming', () => {
    const onConfirm = vi.fn();
    const machine = createConfirmMachine<string>({ onConfirm });
    machine.select('card-a');
    machine.select('card-b');
    expect(machine.state()).toEqual({ selected: 'card-b' });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirm() only fires onConfirm when something is selected, then resets to idle', () => {
    const onConfirm = vi.fn();
    const machine = createConfirmMachine<string>({ onConfirm });

    machine.confirm(); // nothing selected: no-op
    expect(onConfirm).not.toHaveBeenCalled();

    machine.select('card-a');
    machine.confirm();
    expect(onConfirm).toHaveBeenCalledWith('card-a');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(machine.state()).toBe('idle');
  });

  it('cancel() fires onCancel with the selected item and resets to idle', () => {
    const onCancel = vi.fn();
    const machine = createConfirmMachine<string>({ onConfirm: vi.fn(), onCancel });
    machine.select('card-a');
    machine.cancel();
    expect(onCancel).toHaveBeenCalledWith('card-a');
    expect(machine.state()).toBe('idle');
  });

  it('cancel() on idle is a no-op', () => {
    const onCancel = vi.fn();
    const machine = createConfirmMachine<string>({ onConfirm: vi.fn(), onCancel });
    machine.cancel();
    expect(onCancel).not.toHaveBeenCalled();
    expect(machine.state()).toBe('idle');
  });

  it('clickElsewhere() is an alias of cancel() (FORGE reset rule)', () => {
    const onCancel = vi.fn();
    const machine = createConfirmMachine<string>({ onConfirm: vi.fn(), onCancel });
    machine.select('card-a');
    machine.clickElsewhere();
    expect(onCancel).toHaveBeenCalledWith('card-a');
    expect(machine.state()).toBe('idle');
  });

  it('supports a custom isSame for value-equality items', () => {
    const onConfirm = vi.fn();
    const machine = createConfirmMachine<{ id: string }>({
      onConfirm,
      isSame: (a, b) => a.id === b.id,
    });
    machine.select({ id: 'x' });
    machine.select({ id: 'x' }); // different object, same id -> no-op
    expect(machine.state()).toEqual({ selected: { id: 'x' } });
    machine.confirm();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
