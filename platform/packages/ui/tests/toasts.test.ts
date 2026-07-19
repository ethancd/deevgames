import { describe, expect, it, vi } from 'vitest';
import { createToastQueue } from '../src/toasts.ts';

describe('createToastQueue', () => {
  it('push() adds a toast to both active() and history()', () => {
    let now = 1000;
    const queue = createToastQueue({ clock: () => now });
    const id = queue.push('hello');

    expect(queue.active()).toEqual([{ id, message: 'hello', kind: undefined, createdAt: 1000 }]);
    expect(queue.history()).toHaveLength(1);
  });

  it('expires toasts by ttl via manual tick() with an injected clock', () => {
    let now = 0;
    const queue = createToastQueue({ ttlMs: 100, clock: () => now });

    queue.push('a');
    now = 50;
    queue.tick();
    expect(queue.active()).toHaveLength(1); // not yet expired

    now = 150;
    queue.tick();
    expect(queue.active()).toHaveLength(0); // expired

    expect(queue.history()).toHaveLength(1); // history retained
  });

  it('tick() accepts an explicit `now` overriding the clock', () => {
    const queue = createToastQueue({ ttlMs: 100, clock: () => 0 });
    queue.push('a');
    queue.tick(200);
    expect(queue.active()).toHaveLength(0);
  });

  it('max cap evicts the oldest active toast (history keeps everything)', () => {
    let now = 0;
    const queue = createToastQueue({ max: 3, clock: () => now });

    queue.push('one');
    now = 1;
    queue.push('two');
    now = 2;
    queue.push('three');
    now = 3;
    queue.push('four');

    const active = queue.active();
    expect(active.map((t) => t.message)).toEqual(['two', 'three', 'four']);
    expect(queue.history().map((t) => t.message)).toEqual(['one', 'two', 'three', 'four']);
  });

  it('history is capped at 100 entries, oldest evicted first', () => {
    let now = 0;
    const queue = createToastQueue({ max: 1000, clock: () => now });
    for (let i = 0; i < 105; i++) {
      now = i;
      queue.push(`toast-${i}`);
    }
    const history = queue.history();
    expect(history).toHaveLength(100);
    expect(history[0].message).toBe('toast-5');
    expect(history[99].message).toBe('toast-104');
  });

  it('dismiss() removes a specific toast from active() without affecting history()', () => {
    const queue = createToastQueue({ clock: () => 0 });
    const id1 = queue.push('a');
    queue.push('b');

    queue.dismiss(id1);

    expect(queue.active().map((t) => t.id)).not.toContain(id1);
    expect(queue.active()).toHaveLength(1);
    expect(queue.history()).toHaveLength(2);
  });

  it('dismiss() on an unknown id is a no-op', () => {
    const queue = createToastQueue({ clock: () => 0 });
    queue.push('a');
    queue.dismiss(9999);
    expect(queue.active()).toHaveLength(1);
  });

  it('subscribe() fires on push, tick-expiry, and dismiss', () => {
    let now = 0;
    const queue = createToastQueue({ ttlMs: 10, clock: () => now });
    const fn = vi.fn();
    queue.subscribe(fn);

    const id = queue.push('a');
    expect(fn).toHaveBeenCalledTimes(1);

    now = 20;
    queue.tick();
    expect(fn).toHaveBeenCalledTimes(2);

    queue.push('b');
    queue.dismiss(id + 1);
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('defaults ttlMs=3000 and max=5 when not provided', () => {
    let now = 0;
    const queue = createToastQueue({ clock: () => now });
    for (let i = 0; i < 6; i++) queue.push(`t${i}`);
    expect(queue.active()).toHaveLength(5);

    now = 2999;
    queue.tick();
    expect(queue.active()).toHaveLength(5);

    now = 3000;
    queue.tick();
    expect(queue.active()).toHaveLength(0);
  });
});
