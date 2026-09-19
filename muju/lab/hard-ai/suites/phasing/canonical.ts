import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { join, relative } from 'node:path';
import { applyAction } from '../../../../src/ai/simulate';
import { isLegalAction, phaseEndAction } from '../../../../src/game/legality';
import { getActionsPerTurn } from '../../../../src/game/rules';
import { setElementGraph } from '../../../../src/game/elements';
import { setCombatHandicap } from '../../../../src/game/combat';
import { defaultUpkeepAction, setUpkeepVariant } from '../../../../src/game/upkeep';
import { resolveSummons } from '../../../../src/game/summoning';
import { INACTIVITY_LIMIT, LEGACY_INACTIVITY_LIMIT } from '../../../../src/game/inactivity';
import type { AIAction, Boundary, GameState, Horizon, PhasingPosition, PlayerId, PositionRef, RulesBlock, SourceBinding } from './format';

/** Sorted object keys; ordered arrays are semantic, including attacks/receipts. */
export function stableJson(value: unknown): string {
  const visit = (x: unknown): unknown => {
    if (typeof x === 'number' && !Number.isFinite(x)) throw new Error('nonfinite JSON number');
    if (Array.isArray(x)) return x.map(visit);
    if (x !== null && typeof x === 'object') return Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, visit(v)]));
    if (x === undefined || typeof x === 'function' || typeof x === 'bigint') throw new Error('non-JSON value');
    return x;
  };
  return JSON.stringify(visit(value));
}
export const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
export const hashJson = (value: unknown): string => sha256(stableJson(value));
export function semanticState(state: GameState): Omit<GameState, 'selectedUnit' | 'validMoves' | 'validAttacks'> {
  const { selectedUnit: _selected, validMoves: _moves, validAttacks: _attacks, ...semantic } = state;
  return semantic;
}
export const semanticHash = (state: GameState): string => hashJson({ schema: 'muju-phasing-state-hash-v1', state: semanticState(state) });
export const boundaryOf = (state: GameState): Boundary => ({ kind: state.phase === 'victory' ? 'terminal' : state.turn.phase === 'action' ? 'act' : 'prepare', currentPlayer: state.turn.currentPlayer, actionsRemaining: state.turn.actionsRemaining, upkeepPending: !!state.upkeepPending });
export function makePosition(id: string, state: GameState, binding: SourceBinding, origin: PhasingPosition['origin']): PhasingPosition {
  return { schema: 'muju-phasing-position-v1', id, binding, boundary: boundaryOf(state), state, origin };
}
export function positionRef(position: PhasingPosition): PositionRef {
  return { id: position.id, sha256: hashJson({ ...position, state: semanticState(position.state) }) };
}

const MUJU = fileURLToPath(new NodeURL('../../../../', import.meta.url));
/** Explicit recipe: every .ts below src/game plus ai/simulate, keyed by relative path. No data files. */
export function canonicalSourceHashes(): Record<string, string> {
  const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(directory, e.name)) : e.name.endsWith('.ts') ? [join(directory, e.name)] : []);
  const paths = [...walk(join(MUJU, 'src/game')), join(MUJU, 'src/ai/simulate.ts')].sort();
  return Object.fromEntries(paths.map(path => [relative(MUJU, path).replaceAll('\\', '/'), sha256(readFileSync(path))]));
}
export const RULES_VERSIONS = ['muju-phasing-1', 'muju-phasing-2'] as const;
export type RulesVersion = typeof RULES_VERSIONS[number];
/** The revision THIS worktree implements, read off the shipped inactivity
 * constant rather than written down a second time.
 *
 * `muju-phasing-2` is the 20-ply inactivity clock reset only by a capture;
 * `muju-phasing-1` was the 10-ply clock, still named by
 * `LEGACY_INACTIVITY_LIMIT`. Deriving the revision means a binding cannot claim
 * `muju-phasing-1` while the code it binds counts to twenty — exactly the drift
 * a source binding exists to catch, and the one thing a hard-coded literal
 * could not see. An unrecognised limit is a refusal, never a guess. */
export function currentRulesVersion(limit: number = INACTIVITY_LIMIT): RulesVersion {
  if (limit === INACTIVITY_LIMIT) return 'muju-phasing-2';
  if (limit === LEGACY_INACTIVITY_LIMIT) return 'muju-phasing-1';
  throw new Error(`No Phasing rules revision is defined for an inactivity limit of ${limit}`);
}
export const CURRENT_RULES_VERSION: RulesVersion = currentRulesVersion();
export function sourceBinding(rules: RulesBlock, rulesVersion: RulesVersion = CURRENT_RULES_VERSION): SourceBinding {
  return { ruleset: 'phasing', rulesVersion, rules: structuredClone(rules), rulesSourcesSha256: hashJson(canonicalSourceHashes()), catalogueSha256: sha256(readFileSync(join(MUJU, 'src/game/units.ts'))) };
}
export function verifySourceBinding(binding: SourceBinding): void {
  // Verification still demands the CURRENT revision: a v1 document parses under
  // the widened schema and fails here, which is the intended split.
  const actual = sourceBinding(binding.rules);
  if (binding.ruleset !== actual.ruleset || binding.rulesVersion !== actual.rulesVersion || binding.rulesSourcesSha256 !== actual.rulesSourcesSha256 || binding.catalogueSha256 !== actual.catalogueSha256) throw new Error('canonical source binding mismatch');
}
function installRules(binding: SourceBinding): void {
  setElementGraph(binding.rules.elementGraph); setUpkeepVariant(binding.rules.upkeep);
  setCombatHandicap('white', binding.rules.combatHandicap.white); setCombatHandicap('black', binding.rules.combatHandicap.black);
}
/** Callers provide their known prior context: canonical globals have no getters. Synchronous only. */
export function withRules<T>(binding: SourceBinding, callback: () => T, restoreBinding: SourceBinding): T {
  verifySourceBinding(binding);
  installRules(binding);
  try { const result = callback(); if (result && typeof (result as { then?: unknown }).then === 'function') throw new Error('withRules callback must be synchronous'); return result; }
  finally { installRules(restoreBinding); }
}

export interface TraceStep { index: number; before: GameState; after: GameState; action: AIAction | null; component?: 'resolve-batch' }
export interface CanonicalTrace { root: GameState; endpoint: GameState; steps: TraceStep[]; boundary: 'intermediate' | 'first-handoff-or-terminal' | 'coverage-sequence' | 'scripted' | 'component'; additionalHandoffs: number }
export function isMacroEndpoint(root: GameState, end: GameState): boolean {
  return end.phase === 'victory' || (end.phase === 'playing' && end.turn.currentPlayer !== root.turn.currentPlayer && end.turn.phase === 'action' && end.turn.actionsRemaining === getActionsPerTurn(end) && !end.upkeepPending);
}
export function replayTrace(root: GameState, actions: readonly AIAction[], endpoint: 'intermediate' | 'first-handoff-or-terminal' | 'coverage-sequence' = 'intermediate'): CanonicalTrace {
  if (!actions.length || actions.length > 512) throw new Error('trace must contain 1..512 actions');
  if (root.phase !== 'playing') throw new Error('trace root is not playing');
  let current = root;
  const steps: TraceStep[] = [];
  for (const action of actions) {
    if (current.phase === 'victory' || (endpoint !== 'coverage-sequence' && current.turn.currentPlayer !== root.turn.currentPlayer)) throw new Error('action after first handoff or terminal');
    if (!isLegalAction(current, action)) throw new Error(`illegal canonical action at ${steps.length}`);
    const next = applyAction(current, action);
    if (semanticHash(next) === semanticHash(current)) throw new Error(`canonical no-op at ${steps.length}`);
    steps.push({ index: steps.length, before: current, after: next, action }); current = next;
  }
  if (endpoint === 'first-handoff-or-terminal' && !isMacroEndpoint(root, current)) throw new Error('incomplete macro');
  return { root, endpoint: current, steps, boundary: endpoint, additionalHandoffs: 0 };
}
export const replayMacro = (root: GameState, actions: readonly AIAction[]): CanonicalTrace => replayTrace(root, actions, 'first-handoff-or-terminal');
export function continueHorizon(trace: CanonicalTrace, horizon: Horizon): CanonicalTrace {
  if (trace.boundary !== 'first-handoff-or-terminal') throw new Error('horizon requires complete macro');
  if (horizon.kind === 'first-handoff-or-terminal') return trace;
  if (horizon.policy !== 'pass-only@1' || !Number.isInteger(horizon.additionalHandoffs) || horizon.additionalHandoffs < 1 || horizon.additionalHandoffs > 10 || typeof horizon.homeFirst !== 'boolean') throw new Error('invalid passive horizon');
  let current = trace.endpoint, handoffs = 0;
  const steps = [...trace.steps];
  for (let n = 0; n < 40 && handoffs < horizon.additionalHandoffs && current.phase !== 'victory'; n++) {
    const action = current.upkeepPending ? defaultUpkeepAction(current, horizon.homeFirst) : phaseEndAction(current);
    if (!isLegalAction(current, action)) throw new Error('pass-only generated illegal action');
    const next = applyAction(current, action);
    if (semanticHash(current) === semanticHash(next)) throw new Error('pass-only generated no-op');
    steps.push({ index: steps.length, before: current, after: next, action });
    if (next.turn.currentPlayer !== current.turn.currentPlayer) handoffs++;
    current = next;
  }
  if (current.phase !== 'victory' && handoffs !== horizon.additionalHandoffs) throw new Error('pass-only horizon incomplete');
  return { ...trace, endpoint: current, steps, boundary: 'scripted', additionalHandoffs: handoffs };
}
export function componentBatch(root: GameState, player: PlayerId): CanonicalTrace {
  const after = resolveSummons(root, player);
  return { root, endpoint: after, steps: [{ index: 0, before: root, after, action: null, component: 'resolve-batch' }], boundary: 'component', additionalHandoffs: 0 };
}
