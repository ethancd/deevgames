// @mms/engine public API — the runtime contract.
//
// Mechanics (Agent 3) fills this in. The frontend imports RunState, Enemy,
// Intent, and CombatState from here — not from @mms/schema. Until the engine
// lands, this file only re-exports the content contract so workspace wiring
// resolves and the app shell can boot against fixtures.

export * from "@mms/schema";

// TODO(mechanics): export { RunState, Enemy, Intent, CombatState } and the
// Source -> Card adapter from this barrel.
