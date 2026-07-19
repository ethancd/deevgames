// Headless toast queue. No timers of its own — callers drive `tick()`,
// which keeps the queue deterministic and testable without fake-timer
// gymnastics: tests just call tick(now) with whatever `now` they want.

export interface Toast {
  id: number;
  message: string;
  kind?: string;
  createdAt: number;
}

export interface ToastPushOptions {
  kind?: string;
}

export interface ToastQueueOptions {
  ttlMs?: number;
  max?: number;
  /** Injectable clock; defaults to Date.now. */
  clock?(): number;
}

export interface ToastQueue {
  push(message: string, opts?: ToastPushOptions): number;
  /** Currently active (not expired, not dismissed) toasts, oldest first. */
  active(): Toast[];
  /** Everything ever pushed, capped at 100 entries (oldest evicted first). */
  history(): Toast[];
  dismiss(id: number): void;
  /** Expires active toasts older than ttlMs as of `now` (defaults to clock()). */
  tick(now?: number): void;
  subscribe(fn: () => void): () => void;
}

const HISTORY_CAP = 100;

export function createToastQueue(opts: ToastQueueOptions = {}): ToastQueue {
  const ttlMs = opts.ttlMs ?? 3000;
  const max = opts.max ?? 5;
  const clock = opts.clock ?? Date.now;

  let nextId = 1;
  let active: Toast[] = [];
  const history: Toast[] = [];
  const subscribers = new Set<() => void>();

  function notify(): void {
    for (const fn of subscribers) fn();
  }

  return {
    push(message, pushOpts) {
      const toast: Toast = {
        id: nextId++,
        message,
        kind: pushOpts?.kind,
        createdAt: clock(),
      };

      active.push(toast);
      while (active.length > max) active.shift(); // max cap evicts oldest active

      history.push(toast);
      while (history.length > HISTORY_CAP) history.shift();

      notify();
      return toast.id;
    },
    active() {
      return active.slice();
    },
    history() {
      return history.slice();
    },
    dismiss(id) {
      const before = active.length;
      active = active.filter((toast) => toast.id !== id);
      if (active.length !== before) notify();
    },
    tick(now) {
      const t = now ?? clock();
      const before = active.length;
      active = active.filter((toast) => t - toast.createdAt < ttlMs);
      if (active.length !== before) notify();
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
