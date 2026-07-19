// Idempotency helpers.
//
// Napkin lesson (Lution Round 7): a guard keyed on an ORDINAL (round number)
// is a latent gap — anything that increments the counter can slip a stale
// payload past it. Key guards on the IDENTITY of the thing being consumed.
// And: fine-grained resumable sub-state must be cleared at lifecycle
// boundaries or it poisons the next cycle's resume logic.

export interface ConsumedSet {
  has(key: string): boolean;
  add(key: string): void;
}

/**
 * Returns true exactly once per identity key; false on any repeat.
 * Key on WHAT is consumed (e.g. `resolve:${designIdA}+${designIdB}`),
 * never on an ordinal (`resolve:round-${n}`).
 */
export function consumeOnce(consumed: ConsumedSet, identityKey: string): boolean {
  if (consumed.has(identityKey)) return false;
  consumed.add(identityKey);
  return true;
}

/**
 * Clear pending/resumable sub-state fields at a lifecycle boundary.
 * Returns a new object (does not mutate) with each key set to null.
 */
export function resetLifecycle<T extends object, K extends keyof T>(
  obj: T,
  keys: K[],
): T {
  const out = { ...obj };
  for (const k of keys) {
    (out as Record<PropertyKey, unknown>)[k] = null;
  }
  return out;
}
