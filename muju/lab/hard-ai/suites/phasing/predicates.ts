import { applyAction, transitionWithoutCheckmate } from '../../../../src/ai/simulate';
import { isLegalAction } from '../../../../src/game/legality';
import { getAllSpawnPositions, isValidSpawnPosition } from '../../../../src/game/spawning';
import { getValidMoves } from '../../../../src/game/movement';
import { getAttackCount } from '../../../../src/game/combat';
import { getPromotionCost, getUnitDefinition } from '../../../../src/game/units';
import { getHomeOccupier } from '../../../../src/game/victory';
import { analyzeHomeDefenseEvidence } from '../../../../src/game/homeCheckmate';
import { resetUnitActions } from '../../../../src/game/board';
import { DEFAULT_RULES } from '../../positions/corpus';
import { getActionsPerTurn } from '../../../../src/game/rules';
import type { PendingSummon } from '../../../../src/game/types';
import { componentBatch, continueHorizon, hashJson, positionRef, replayMacro, replayTrace, semanticHash, sourceBinding, withRules } from './canonical';
import type { CanonicalTrace } from './canonical';
import type { Compare, GameState, MacroDecision, PhasingCase, PhasingPosition, PlayerId, PositionRef, PredicateSpec, ProbeSpec, SourceBinding, StateFact, SuiteDocument } from './format';

export interface PredicateResult { status: 'pass' | 'fail' | 'indeterminate'; facts: unknown[] }
const result = (pass: boolean, ...facts: unknown[]): PredicateResult => ({ status: pass ? 'pass' : 'fail', facts });
export const compare = (actual: number, expected: Compare): boolean => 'eq' in expected ? actual === expected.eq : 'min' in expected ? actual >= expected.min : actual <= expected.max;
const other = (side: PlayerId): PlayerId => side === 'white' ? 'black' : 'white';
const at = (trace: CanonicalTrace, where: 'root' | 'endpoint'): GameState => where === 'root' ? trace.root : trace.endpoint;
export const rootTrace = (root: GameState): CanonicalTrace => ({ root, endpoint: root, steps: [], boundary: 'intermediate', additionalHandoffs: 0 });

function stateFact(f: StateFact, s: GameState): { pass: boolean; actual: unknown; expected: StateFact } {
  let actual: unknown, pass = false;
  switch (f.kind) {
    case 'unit': case 'pending': {
      const found = (f.kind === 'unit' ? s.board.units : s.pendingSummons ?? []).find(u => u.id === f.id);
      actual = found ?? null; pass = !!found === f.present;
      if (found && f.present) pass &&= (!f.owner || found.owner === f.owner) && (!f.definitionId || found.definitionId === f.definitionId) && (!f.position || hashJson(found.position) === hashJson(f.position)) && (!('cost' in f) || f.cost === undefined || ('cost' in found && found.cost === f.cost));
      break;
    }
    case 'army-count': actual = s.board.units.filter(u => u.owner === f.player).length; pass = compare(actual as number, f.value); break;
    case 'pending-count': actual = (s.pendingSummons ?? []).filter(u => u.owner === f.player).length; pass = compare(actual as number, f.value); break;
    case 'spawn-area': actual = getAllSpawnPositions(f.player, s.board).length; pass = compare(actual as number, f.value); break;
    case 'mobility-count': case 'unit-attack-count': { const u = s.board.units.find(u => u.id === f.unitId); actual = u ? f.kind === 'mobility-count' ? getValidMoves(u, s.board).length : getAttackCount(u) : null; pass = actual !== null && compare(actual as number, f.value); break; }
    case 'inactivity-plies': actual = s.inactivityPlies ?? 0; pass = compare(actual as number, f.value); break;
    case 'game-phase': actual = s.phase; pass = actual === f.value; break;
    case 'bank': actual = s.players[f.player].resources; pass = compare(actual as number, f.value); break;
    case 'reserve': actual = s.board.cells[f.position.y][f.position.x].resourceLayers; pass = compare(actual as number, f.value); break;
    case 'turn': actual = { ...s.turn, upkeepPending: !!s.upkeepPending }; pass = s.turn.currentPlayer === f.player && s.turn.phase === f.phase && (f.actionsRemaining === undefined || s.turn.actionsRemaining === f.actionsRemaining) && (f.upkeepPending === undefined || !!s.upkeepPending === f.upkeepPending); break;
    case 'terminal': actual = { phase: s.phase, winner: s.winner, reason: s.victoryReason }; pass = s.phase === 'victory' && s.winner === f.winner && (f.reason === undefined || s.victoryReason === f.reason); break;
    case 'unit-flag': { const u = s.board.units.find(u => u.id === f.id); actual = u ? !!u[f.flag] : null; pass = actual === f.value; break; }
    case 'damage': { const u = s.board.units.find(u => u.id === f.id); actual = u?.damageTaken ?? null; pass = actual !== null && compare(actual as number, f.value); break; }
  }
  return { pass, actual, expected: f };
}

export interface ArrivalEvent { step: number; player: PlayerId; window: number; summoned: PendingSummon[]; disrupted: PendingSummon[]; refund: number }
/** Check the receipt against the original board, including simultaneous batch order. */
export function arrivalEvents(trace: CanonicalTrace): ArrivalEvent[] {
  const windows = { white: 0, black: 0 }, events: ArrivalEvent[] = [];
  for (const step of trace.steps) {
    const receipt = step.after.lastSummoning;
    if (!receipt || receipt === step.before.lastSummoning) continue;
    const player = receipt.player, pending = (step.before.pendingSummons ?? []).filter(p => p.owner === player);
    const summoned = pending.filter(p => isValidSpawnPosition(p.position, player, step.before.board));
    const disrupted = pending.filter(p => !summoned.includes(p));
    if (hashJson(receipt.summoned) !== hashJson(summoned) || hashJson(receipt.disrupted) !== hashJson(disrupted)) throw new Error('arrival receipt disagrees with original-board validity');
    if (hashJson(step.after.pendingSummons ?? []) !== hashJson((step.before.pendingSummons ?? []).filter(p => p.owner !== player))) throw new Error('arrival pending removal mismatch');
    if (hashJson(step.after.board.units.map(u => u.id)) !== hashJson([...step.before.board.units.map(u => u.id), ...summoned.map(u => u.id)])) throw new Error('arrival append order mismatch');
    for (const p of summoned) { const u = step.after.board.units.find(u => u.id === p.id); if (!u || u.owner !== p.owner || u.definitionId !== p.definitionId || hashJson(u.position) !== hashJson(p.position)) throw new Error('arrival identity mismatch'); }
    const refund = disrupted.reduce((n, p) => n + p.cost, 0);
    if (step.after.players[player].resources - step.before.players[player].resources !== refund) throw new Error('arrival original-cost refund mismatch');
    events.push({ step: step.index, player, window: ++windows[player], summoned, disrupted, refund });
  }
  return events;
}
export interface PlayerLedger { bank: number; mined: number; upkeep: number; refund: number; commitmentSpent: number; promotionSpent: number; incomeWindows: number; miners: Record<string, number> }
export function economyLedger(trace: CanonicalTrace): Record<PlayerId, PlayerLedger> {
  const blank = (p: PlayerId): PlayerLedger => ({ bank: trace.endpoint.players[p].resources, mined: 0, upkeep: 0, refund: 0, commitmentSpent: 0, promotionSpent: 0, incomeWindows: 0, miners: {} });
  const ledger = { white: blank('white'), black: blank('black') }, arrivals = arrivalEvents(trace);
  for (const event of arrivals) ledger[event.player].refund += event.refund;
  for (const step of trace.steps) {
    const income = step.after.lastIncome;
    if (income && income !== step.before.lastIncome) {
      const sum = income.takes.reduce((n, t) => n + t.amount, 0); if (sum !== income.total) throw new Error('income receipt arithmetic mismatch');
      ledger[income.player].mined += sum; ledger[income.player].incomeWindows++;
      for (const take of income.takes) ledger[income.player].miners[take.unitId] = (ledger[income.player].miners[take.unitId] ?? 0) + take.amount;
    }
    const upkeep = step.after.lastUpkeep;
    if (upkeep && upkeep !== step.before.lastUpkeep) ledger[upkeep.player].upkeep += upkeep.paid;
    const a = step.action, owner = step.before.turn.currentPlayer;
    if (a?.type === 'BUY_UNIT') ledger[owner].commitmentSpent += getUnitDefinition(a.definitionId).cost;
    if (a?.type === 'PROMOTE_UNIT') { const u = step.before.board.units.find(u => u.id === a.unitId); if (!u) throw new Error('promotion missing unit'); ledger[owner].promotionSpent += getPromotionCost(u.definitionId); }
  }
  for (const p of ['white', 'black'] as const) { const l = ledger[p]; if (trace.root.players[p].resources + l.mined - l.upkeep + l.refund - l.commitmentSpent - l.promotionSpent !== l.bank) throw new Error(`bank ledger does not reconcile for ${p}`); }
  return ledger;
}

export function evaluatePredicate(spec: PredicateSpec, trace: CanonicalTrace): PredicateResult {
  switch (spec.kind) {
    case 'action-legality@1': { const state = at(trace, spec.at), legal = isLegalAction(state, spec.action); return result(legal === spec.expected && (legal || semanticHash(applyAction(state, spec.action)) === semanticHash(state)), { legal, expected: spec.expected }); }
    case 'all@1': {
      if (!spec.predicates.length) throw new Error('empty conjunction');
      const children = spec.predicates.map(p => evaluatePredicate(p, trace));
      return { status: children.some(p => p.status === 'indeterminate') ? 'indeterminate' : children.some(p => p.status === 'fail') ? 'fail' : 'pass', facts: children };
    }
    case 'any-of@1': {
      // Several canonically correct answers, any one of which scores. Scoring
      // one of several equally valid targets as the only correct answer is the
      // v1 defect this exists to remove. A passing branch settles the case even
      // when a sibling could not be proved: the sibling is an alternative
      // answer, not an additional requirement. With no passing branch an
      // unresolved one still makes the whole predicate indeterminate, so an
      // exhausted proof can never be silently read as a miss.
      if (!spec.predicates.length) throw new Error('empty disjunction');
      const children = spec.predicates.map(p => evaluatePredicate(p, trace));
      return { status: children.some(p => p.status === 'pass') ? 'pass' : children.some(p => p.status === 'indeterminate') ? 'indeterminate' : 'fail', facts: children };
    }
    case 'state-facts@1': { if (!spec.facts.length) throw new Error('empty facts'); const facts = spec.facts.map(f => stateFact(f, at(trace, spec.at))); return result(facts.every(f => f.pass), ...facts); }
    case 'target-removed@1': {
      const target = trace.root.board.units.find(u => u.id === spec.targetId); if (!target) throw new Error('target must bind root unit');
      for (const id of spec.survivingIds ?? []) if (!trace.root.board.units.some(u => u.id === id)) throw new Error('survivor must bind root unit');
      const removed = !trace.endpoint.board.units.some(u => u.id === spec.targetId);
      const attack = trace.steps.some(s => s.action?.type === 'ATTACK' && s.before.turn.currentPlayer === trace.root.turn.currentPlayer && s.before.board.units.some(u => u.id === spec.targetId) && !s.after.board.units.some(u => u.id === spec.targetId));
      return result(removed && (spec.cause !== 'own-act-attack' || attack) && (spec.survivingIds ?? []).every(id => trace.endpoint.board.units.some(u => u.id === id)) && (spec.survivingSides ?? []).every(p => trace.endpoint.board.units.some(u => u.owner === p)), { removed, attack });
    }
    case 'summon-resolution@1': {
      let selected: PendingSummon | undefined;
      if (spec.commitment.kind === 'root') { const id = spec.commitment.id; selected = trace.root.pendingSummons?.find(s => s.id === id); }
      else {
        const q = spec.commitment, step = trace.steps[q.actionIndex], a = step?.action;
        if (a?.type === 'BUY_UNIT' && step.before.turn.currentPlayer === q.owner && a.definitionId === q.definitionId && hashJson(a.position) === hashJson(q.position)) {
          const added = (step.after.pendingSummons ?? []).filter(p => !(step.before.pendingSummons ?? []).some(old => old.id === p.id));
          if (added.length !== 1) throw new Error('BUY commitment selector is not unique'); selected = added[0];
        }
      }
      if (!selected) return result(false, { reason: 'selected commitment not created/present' });
      if (selected.owner !== spec.player) throw new Error('commitment player mismatch');
      const all = arrivalEvents(trace), matches = all.filter(e => [...e.summoned, ...e.disrupted].some(p => p.id === selected!.id));
      if (matches.length > 1) throw new Error('commitment resolved more than once');
      const event = matches[0];
      return result(!!event && (spec.window === undefined || event.window === spec.window) && (spec.outcome === 'arrived' ? event.summoned : event.disrupted).some(p => hashJson(p) === hashJson(selected)), { selected, event: event ?? null });
    }
    case 'economy-ledger@1': {
      const ledger = economyLedger(trace), states = [trace.root, ...trace.steps.map(s => s.after)];
      const survival = spec.surviveThroughout.every(p => states.every(s => s.phase === 'playing' && s.board.units.some(u => u.owner === p)));
      const facts = spec.facts.map(f => { if (f.unitId && (f.metric !== 'mined' || !trace.root.board.units.some(u => u.id === f.unitId && u.owner === f.player))) throw new Error('miner must bind root owned unit'); const actual = f.unitId ? ledger[f.player].miners[f.unitId] ?? 0 : ledger[f.player][f.metric]; return { expected: f, actual, pass: compare(actual, f.value) }; });
      return result(survival && facts.every(f => f.pass), { survival, ledger }, ...facts);
    }
    case 'home-defense@1': case 'home-proof-budget@1': {
      const s = at(trace, spec.at), target = getHomeOccupier(s.board, spec.invader);
      if (s.phase !== 'playing') return result(false, { reason: 'home proof requires a playing snapshot; terminal phase is not a tactical proof' });
      if (!target) return result(false, { reason: 'no actual home occupier' });
      const proof = analyzeHomeDefenseEvidence(s, spec.invader, transitionWithoutCheckmate, spec.maxNodes);
      if (spec.kind === 'home-proof-budget@1') return result(proof.result === 'unknown' && proof.cutoffReason === 'node_limit', proof);
      if (proof.result === 'unknown') return { status: 'indeterminate', facts: [proof] };
      if (proof.result === 'rescue') {
        if (!proof.witness?.length) throw new Error('rescue proof lacks witness');
        const defender = other(spec.invader);
        let ready: GameState = { ...s, board: resetUnitActions(s.board, defender), upkeepPending: false, turn: { ...s.turn, currentPlayer: defender, phase: 'action', actionsRemaining: getActionsPerTurn(s) } };
        for (const action of proof.witness) { if (!isLegalAction(ready, action)) throw new Error('illegal home proof witness'); const next = transitionWithoutCheckmate(ready, action); if (semanticHash(next) === semanticHash(ready)) throw new Error('no-op home witness'); ready = next; }
        if (ready.board.units.some(u => u.id === target.id)) throw new Error('home witness did not remove occupier');
      }
      return result(proof.result === spec.expected, proof);
    }
  }
}

export interface ProbeResult extends PredicateResult { trace?: CanonicalTrace }
export function evaluateProbe(probe: ProbeSpec, root: GameState): ProbeResult {
  if (probe.kind === 'legality@1') {
    const legal = isLegalAction(root, probe.action); const unchanged = legal || semanticHash(applyAction(root, probe.action)) === semanticHash(root);
    return result(legal === probe.expected && unchanged, { legal, rejectedActionUnchanged: unchanged });
  }
  let trace = probe.kind === 'resolve-batch@1' ? componentBatch(root, probe.player) : replayTrace(root, probe.actions, probe.endpoint);
  if (probe.kind === 'legal-trace@1' && probe.horizon) trace = continueHorizon(trace, probe.horizon);
  return { ...evaluatePredicate(probe.assert, trace), trace };
}
export function evaluateDecision(c: MacroDecision, trace: CanonicalTrace): PredicateResult {
  if (c.terminalPolicy === 'allow-root-mover-win' && trace.endpoint.phase === 'victory' && trace.endpoint.winner === trace.root.turn.currentPlayer) return result(true, { explicitTerminalWin: true });
  return evaluatePredicate(c.accept, trace);
}
export interface AuthorValidation { status: 'pass' | 'fail' | 'indeterminate'; results: PredicateResult[] }
/** Rules must already be installed. Each pair member is resolved/checked independently. */
export function validateAuthorEvidence(c: PhasingCase, resolve: (ref: PositionRef) => PhasingPosition): AuthorValidation {
  const results: PredicateResult[] = [];
  for (const probe of [...c.evidence.positive, ...c.evidence.negative]) {
    const root = resolve(c.kind === 'invariant-pair' ? probe.member === 'correct' ? c.correct : c.violating : c.root).state;
    results.push(evaluateProbe(probe, root));
  }
  if (c.kind === 'macro-decision') {
    for (const [probes, expected] of [[c.evidence.positive, 'pass'], [c.evidence.negative, 'fail']] as const) {
      const complete = probes.filter(p => p.kind === 'legal-trace@1' && p.endpoint === 'first-handoff-or-terminal');
      if (!complete.length) throw new Error('decision evidence lacks complete positive/negative macro');
      for (const probe of complete) { if (probe.kind !== 'legal-trace@1') continue; const decision = evaluateDecision(c, continueHorizon(replayMacro(resolve(c.root).state, probe.actions), c.horizon)); results.push(decision.status === 'indeterminate' ? decision : result(decision.status === expected, { expectedDecisionStatus: expected, decision })); }
    }
  } else if (c.kind === 'canonical-coverage') results.push(...c.probes.map(p => evaluateProbe(p, resolve(c.root).state)));
  else for (const member of ['violating', 'correct'] as const) { const root = resolve(c[member]).state; results.push(evaluatePredicate(c.premise[member], rootTrace(root)), ...(c.probes?.[member] ?? []).map(p => evaluateProbe(p, root))); }
  return { status: results.some(r => r.status === 'indeterminate') ? 'indeterminate' : results.some(r => r.status === 'fail') ? 'fail' : 'pass', results };
}

/** Canonical legal-prefix provenance, deliberately separate from full macro protocol. */
export function validateProvenance(doc: SuiteDocument, restoreBinding: SourceBinding = sourceBinding(DEFAULT_RULES)): void {
  const byId = new Map(doc.positions.map(p => [p.id, p]));
  for (const p of doc.positions) if (p.origin.kind === 'legal-prefix') {
    const origin = p.origin;
    withRules(p.binding, () => {
      const seed = byId.get(origin.seed.id); if (!seed || positionRef(seed).sha256 !== origin.seed.sha256 || hashJson(seed.binding) !== hashJson(p.binding)) throw new Error('provenance seed mismatch');
      if (origin.seedReachability === 'initial-game') {
        // createInitialGameState -> createUnit uses Date.now/Math.random IDs.
        // No reviewed bijective ID/reference policy exists in this schema yet.
        throw new Error('initial-game provenance is not supported in v1; use explicitly authored seed diagrams');
      }
      let state = seed.state;
      for (const action of origin.actions) { if (!isLegalAction(state, action)) throw new Error(`illegal provenance action ${p.id}`); const next = applyAction(state, action); if (semanticHash(next) === semanticHash(state)) throw new Error(`no-op provenance action ${p.id}`); state = next; }
      if (semanticHash(state) !== semanticHash(p.state)) throw new Error(`provenance endpoint mismatch ${p.id}`);
    }, restoreBinding);
  }
}
