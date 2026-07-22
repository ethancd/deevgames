/**
 * EMBER — append-only event log (src/core/eventLog.ts).
 *
 * Implements the pinned `EventLog` interface from src/core/types.ts.
 *
 * serialize() must be byte-exact-comparable across replays. It stringifies
 * each event with object keys sorted recursively (a "stable stringify"),
 * so the output does not depend on the incidental key-insertion order any
 * particular call site used to build a payload object — only on the
 * semantic content of the (tick, topic, payload) tuples, in append order.
 * Events are newline-joined so the serialization is also diffable.
 */

import type { EventLog, SimEvent } from './types';

/** Deterministically stringify a JSON-like value with object keys sorted. */
function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',');
  return `{${body}}`;
}

class AppendOnlyEventLog implements EventLog {
  private events: SimEvent[] = [];

  append(e: SimEvent): void {
    this.events.push(e);
  }

  all(): readonly SimEvent[] {
    return this.events;
  }

  /** Matches topics equal to `prefix` or nested under it as dot segments,
   *  e.g. byTopic('world') matches 'world' and 'world.wolf.attack' but not
   *  'worldwide.foo'. */
  byTopic(prefix: string): readonly SimEvent[] {
    return this.events.filter(
      (e) => e.topic === prefix || e.topic.startsWith(`${prefix}.`),
    );
  }

  serialize(): string {
    return this.events.map((e) => stableStringify(e)).join('\n');
  }
}

/** Construct a fresh, empty EventLog. */
export function createEventLog(): EventLog {
  return new AppendOnlyEventLog();
}
