import { createHash } from 'node:crypto';
import type { GameState, PlayerId, Unit } from '../../src/game/types';
import type { RoomSnapshot } from '../../src/online/types';
import { getAdjacentPositions, getStartCorner, getUnitAt } from '../../src/game/board';
import { createUnitFromDefinition } from '../../src/game/building';
import { UNIT_DEFINITIONS } from '../../src/game/units';
import { getHomeOccupier, getOpponent } from '../../src/game/victory';
import { analyzeHomeDefenseEvidence } from '../../src/game/homeCheckmate';
import { transitionWithoutCheckmate } from '../../src/ai/simulate';
import { RoomError } from '../schema';
import { describeAction, square } from '../notation';
import { analysisSchema, type AnalysisInput } from './schema';
import { economy, economyForecast, economyHeadlines, minerDetail } from './economy';
import { blockingSet, mobility, reach, selectedUnits, spawnGeometry } from './geometry';
import { matchups, unitDetails } from './units';
import { exchange } from './exchange';
import { modelDescription, simulateSequence, turnFor, WorkBudget, type TurnModel } from './core';
import { approachTable, damageUpperBound, describeEvidence, replyTo, searchTurn, singleThreats, type Evidence } from './tactics';

const sides = ['white', 'black'] as const;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Sections = Record<string, unknown>;
type FollowUp = { tool: string; arguments: Record<string, unknown> };
function followUp(room: RoomSnapshot, player: PlayerId, topics: string[], extra: Record<string, unknown> = {}): FollowUp {
  return { tool: 'muju_analyze', arguments: { roomId: room.id, expectedRevision: room.revision, player, topics, ...extra } };
}
function envelope(room: RoomSnapshot, s: GameState, player: PlayerId, applied: ReturnType<typeof describeAction>[], assumptions: string[], stateKind: string) {
  return { roomId: room.id, revision: room.revision, perspective: player, turn: s.turn,
    phase: s.phase === 'playing' ? s.upkeepPending ? 'upkeep' : s.turn.phase : s.phase,
    stateKind, hypothetical: { actions: applied, assumptions } };
}
function urgent(s: GameState, player: PlayerId, budget: WorkBudget) {
  const flags: string[] = [];
  for (const side of sides) {
    const invader = getHomeOccupier(s.board, side);
    if (invader) flags.push(`home:${side}:${invader.id}`);
  }
  const trapped = s.board.units.filter(u => u.owner === player && getAdjacentPositions(u.position).every(p => !!getUnitAt(s.board, p)));
  flags.push(...trapped.slice(0, 2).map(u => `trapped:${u.id}`));
  const own = turnFor(s, player), enemy = turnFor(s, getOpponent(player));
  for (const [model, owner, label] of [[enemy, player, 'threat'], [own, getOpponent(player), 'capture']] as const) {
    for (const target of s.board.units.filter(u => u.owner === owner)) {
      if (!budget.available()) break;
      if (singleThreats(model.state, target.id, ['existing'], budget, 40, true).lines.some(l => l.lethal)) {
        flags.push(`${label}${model.setupActions.length ? 'NextTurn' : 'Now'}:${target.id}`); break;
      }
    }
  }
  return flags;
}

function validateTargets(s: GameState, input: AnalysisInput) {
  for (const id of input.targets.unitIds ?? []) if (!s.board.units.some(u => u.id === id)) {
    throw new RoomError(422, 'TARGET_NOT_FOUND', `No unit ${id} in the analyzed state.`);
  }
}
/** Structural defenders are explicitly conditional. Relocation removes the same
 * instance first; insertion never overwrites another unit or charges a fictitious purchase. */
function defenderCases(s: GameState, input: AnalysisInput) {
  const cases: { state: GameState; target: Unit; assumption: string }[] = selectedUnits(s, input)
    .map(target => ({ state: s, target, assumption: 'Existing instance in the analyzed state.' }));
  if (input.targets.defenders?.length) cases.length = 0;
  for (const [i, d] of (input.targets.defenders ?? []).entries()) {
    const def = UNIT_DEFINITIONS.find(u => u.id === d.definitionId);
    const original = d.unitId ? s.board.units.find(u => u.id === d.unitId) : null;
    if (d.unitId && (!original || original.owner !== d.owner)) throw new RoomError(422, 'INVALID_DEFENDER', 'Relocation requires an existing instance with the same owner.');
    const damage = d.damageTaken ?? original?.damageTaken ?? 0;
    if (!def || damage >= def.defense) throw new RoomError(422, 'INVALID_DEFENDER', 'Use a catalogue definition and damage below its base defense.');
    const occupied = getUnitAt(s.board, d.square);
    if (occupied && occupied.id !== original?.id) throw new RoomError(422, 'OCCUPIED_TARGET', 'Hypothetical defenders never overwrite an occupied square.');
    let id = `analysis-defender-${i}`;
    while (s.board.units.some(u => u.id === id)) id += '-new';
    const target: Unit = { ...(original ?? createUnitFromDefinition(d.definitionId, d.owner, d.square, id)),
      definitionId: d.definitionId, position: d.square, damageTaken: damage };
    cases.push({ state: { ...s, board: { ...s.board, units: [...s.board.units.filter(u => u.id !== target.id), target] } }, target,
      assumption: `${original ? 'Relocated/retyped existing instance' : 'Inserted defender'} without spending or a placement action. Witnesses are conditional on this structural state; use hypotheticalActions for executable plans.` });
  }
  return cases;
}

function exposure(line: Evidence, budget: WorkBudget, deep: boolean, quota: number) {
  const attackers = [...new Set(line.actions.filter(a => a.type === 'ATTACK').map(a => a.unitId))];
  return { replies: attackers.map(attacker => ({ attacker,
    ...replyTo({ ...line, attackerId: attacker }, budget, deep, Math.max(1, Math.floor(quota / attackers.length))) })) };
}

function threats(s: GameState, input: AnalysisInput, budget: WorkBudget, quotaTotal = budget.maxNodes - budget.nodes) {
  const cases = defenderCases(s, input);
  const ceiling = budget.nodes + quotaTotal;
  const actors = new Map<PlayerId, TurnModel>();
  return cases.map(({ state, target, assumption }, index) => {
    if (!budget.available()) return { target: target.id, square: square(target.position), kill: 'unknown', lines: [], singleScanComplete: false,
      search: { completeness: 'bounded', cutoffReason: budget.cutoffReason, omittedCaseClasses: ['target not searched'] } };
    const actor = getOpponent(target.owner);
    let model = state === s ? actors.get(actor) : undefined;
    if (!model) { model = turnFor(state, actor); if (state === s) actors.set(actor, model); }
    const quota = Math.max(1, Math.floor((ceiling - budget.nodes) / Math.max(1, cases.length - index)));
    const local = budget.fork(quota, budget.remainingMs / Math.max(1, cases.length - index));
    const singles = singleThreats(model.state, target.id, input.categories, local, Math.max(1, Math.floor(quota * (input.deep ? 0.35 : 0.65))));
    const combined = input.deep && local.available() ? searchTurn(model.state, local, { targetId: target.id, categories: input.categories,
      quota: Math.max(1, Math.floor(quota * 0.4)) }) : null;
    const lines = [...singles.lines];
    if (combined?.best) {
      if (!lines.some(l => JSON.stringify(l.actions) === JSON.stringify(combined.best!.actions))) lines.push(combined.best);
      else local.collapsed++;
    }
    lines.sort((a, b) => Number(b.lethal) - Number(a.lethal) || a.crystals - b.crystals || a.ap - b.ap || b.damage - a.damage);
    const display = lines.slice(0, input.limit);
    const kills = lines.filter(l => l.lethal);
    const cost = (line: Evidence) => ({ ap: line.ap, crystalsSpent: line.crystals - line.upkeepPaid, upkeepPaid: line.upkeepPaid });
    const cheapest = [...kills].sort((a, b) => (a.crystals - a.upkeepPaid) - (b.crystals - b.upkeepPaid) || a.ap - b.ap)[0];
    const fastest = [...kills].sort((a, b) => a.ap - b.ap || a.crystals - b.crystals)[0];
    const report = { target: target.id, square: square(target.position), assumption, model: modelDescription(model),
      targetPresentAfterSetup: model.state.board.units.some(u => u.id === target.id),
      kill: lines.some(l => l.lethal) ? 'proven_possible' : combined?.proof ?? 'unknown',
      scope: input.categories, singleScanComplete: singles.complete,
      maxSingleHitFound: singles.lines.length ? Math.max(...singles.lines.map(l => l.damage)) : 0,
      bestKillFound: cheapest ? { cheapest: cost(cheapest), fewestActions: cost(fastest), optimality: 'best_found' } : null,
      lines: display.map(line => ({ ...describeEvidence(model.state, line, target.id, input.detail === 'full' || !!input.targets.unitIds?.length || !!input.targets.defenders?.length),
        ...(input.replies && line.lethal ? { exposure: exposure(line, local, input.deep, Math.max(1, Math.floor(quota * 0.25 / display.length))) } : {}) })),
      omittedLines: Math.max(0, lines.length - display.length),
      ...(input.detail === 'full' ? { approaches: approachTable(model.state, target) } : {}),
      search: combined?.search ?? { completeness: 'bounded', cutoffReason: singles.complete ? null : local.cutoffReason ?? 'target_quota', omittedCaseClasses: singles.omitted } };
    budget.absorb(local); return report;
  });
}

function opportunities(s: GameState, input: AnalysisInput, budget: WorkBudget) {
  const model = turnFor(s, input.player);
  const targets = model.state.board.units.filter(u => u.owner !== input.player && (!input.targets.unitIds?.length || input.targets.unitIds.includes(u.id)));
  const lines: { target: string; line: Evidence }[] = [];
  let complete = true;
  for (const target of targets) {
    const scan = singleThreats(model.state, target.id, input.categories, budget, Math.max(30, Math.floor(budget.maxNodes / Math.max(1, targets.length))), true);
    complete &&= scan.complete;
    for (const line of scan.lines.filter(l => l.lethal).slice(0, 2)) lines.push({ target: target.id, line });
  }
  const chain = input.deep && budget.available() ? searchTurn(model.state, budget, { categories: input.categories, objective: 'capturedValue' }) : null;
  if (chain?.best) lines.push({ target: '', line: chain.best });
  lines.sort((a, b) => a.line.crystals - b.line.crystals || a.line.ap - b.line.ap);
  return { model: modelDescription(model), lines: lines.slice(0, input.limit).map(({ target, line }) => ({ target,
    ...describeEvidence(model.state, line, target || undefined, input.detail === 'full'),
    ...(input.replies ? { exposure: exposure(line, budget, false, 80) } : {}) })),
    omittedLines: Math.max(0, lines.length - input.limit),
    homeReach: model.state.board.units.filter(u => u.owner === input.player).flatMap(u => reach(model.state, { ...input, targets: { unitIds: [u.id] } }).filter(r => r.homeReachable)),
    search: chain?.search ?? { completeness: 'bounded', cutoffReason: complete ? null : budget.cutoffReason ?? 'target_quota', omittedCaseClasses: ['multi-attacker combinations', 'blocker clearing', 'all capture chains'] } };
}

function checkmate(s: GameState, budget: WorkBudget) {
  if (s.phase !== 'playing') return { result: s.victoryReason === 'home-checkmate' ? 'proven_possible' : 'not_applicable',
    winner: s.winner, reason: s.victoryReason, method: 'authoritative_terminal_state' };
  const invader = s.turn.currentPlayer, occupier = getHomeOccupier(s.board, invader);
  if (!occupier) {
    const enemy = getOpponent(invader), threat = getHomeOccupier(s.board, enemy);
    if (!threat) return { result: 'not_applicable', reason: 'No home occupation. Use hypotheticalActions to place a legal occupier.' };
    const reply = searchTurn(s, budget, { targetId: threat.id, categories: ['combined'] });
    return { scope: 'remaining current defense turn', rescue: reply.proof, search: reply.search,
      ...(reply.best ? { reply: describeEvidence(s, reply.best, threat.id) } : {}) };
  }
  if (getHomeOccupier(s.board, getOpponent(invader))) return { result: 'not_applicable', reason: 'Earlier opposing home occupation has priority.' };
  if (s.victoryRule === 'elimination') return { result: 'not_applicable', reason: 'Elimination-only rules.' };
  const proof = analyzeHomeDefenseEvidence(s, invader, transitionWithoutCheckmate, Math.max(0, budget.maxNodes - budget.nodes), () => !budget.available());
  budget.nodes += proof.nodes;
  return { occupier: occupier.id, result: proof.result === 'mate' ? 'proven_possible' : proof.result === 'rescue' ? 'proven_impossible' : 'unknown',
    search: { completeness: proof.result === 'unknown' ? 'bounded' : 'complete', nodes: proof.nodes, cutoffReason: proof.cutoffReason, omittedCaseClasses: [] },
    method: proof.method, rescueCategories: proof.categories,
    ...(proof.witness ? { reply: { ...(proof.witness.length <= 32 ? { witness: proof.witness.map(describeAction) } : {
      witnessCommands: Array.from({ length: Math.ceil(proof.witness.length / 32) }, (_, i) => proof.witness!.slice(i * 32, (i + 1) * 32).map(describeAction)) }),
      basis: 'Defender start before upkeep/healing, with upkeep review enabled. Purchases are forbidden by home occupation. No future defender income.',
      setup: 'If upkeep was paid automatically, undo that payment alone before previewing this reply; otherwise enable upkeep review before handoff.' } } : {}),
    cornerEntrances: getAdjacentPositions(getStartCorner(getOpponent(invader))).map(p => ({ square: square(p), unitId: getUnitAt(s.board, p)?.id ?? null })),
    cornerRule: 'Only two adjacent attack squares; three distinct hits need at least five AP.' };
}

function survival(s: GameState, input: AnalysisInput, budget: WorkBudget) {
  const locations = input.targets.squares ?? input.targets.defenders?.map(d => d.square) ?? [];
  return locations.slice(0, input.limit).map(position => {
    if (getUnitAt(s.board, position)) throw new RoomError(422, 'OCCUPIED_TARGET', 'Survival profiles require an empty square; use threats for an existing unit.');
    const profiles = UNIT_DEFINITIONS.map((definition, i) => {
      if (!budget.available()) return { definitionId: definition.id, element: definition.element, defense: definition.defense,
        survives: 'unknown', search: { completeness: 'bounded', cutoffReason: budget.cutoffReason, omittedCaseClasses: ['profile not searched'] } };
      const target = createUnitFromDefinition(definition.id, input.player, position, `analysis-survival-${i}`);
      while (s.board.units.some(u => u.id === target.id)) target.id += '-new';
      const augmented = { ...s, board: { ...s.board, units: [...s.board.units, target] } };
      const model = turnFor(augmented, getOpponent(input.player));
      if (model.state.phase !== 'playing' || !model.state.board.units.some(u => u.id === target.id)) return {
        definitionId: definition.id, element: definition.element, defense: definition.defense, survives: 'not_applicable',
        reason: model.state.phase !== 'playing' ? `terminal:${model.state.victoryReason}` : 'defender released during setup', model: modelDescription(model) };
      const scan = singleThreats(model.state, target.id, input.categories, budget, Math.max(1, Math.floor(budget.maxNodes / 36)));
      const single = scan.lines.find(l => l.lethal);
      const deep = input.deep && !single && budget.available() ? searchTurn(model.state, budget,
        { targetId: target.id, categories: input.categories, quota: Math.max(1, Math.floor(budget.maxNodes / 36)) }) : null;
      const upper = damageUpperBound(model.state, target, input.categories);
      const lower = Math.max(0, ...scan.lines.map(l => l.damage), deep?.best?.damage ?? 0);
      const found = single ?? (deep?.best?.lethal ? deep.best : null);
      return { definitionId: definition.id, element: definition.element, defense: definition.defense,
        survives: found ? 'proven_impossible' : upper < definition.defense || deep?.proof === 'proven_impossible' ? 'proven_possible' : 'unknown',
        minimumDefense: { status: lower === upper ? 'proven' : 'bounded', lowerBound: lower + 1, sufficientUpperBound: upper + 1 },
        ...(found && input.detail === 'full' ? { model: modelDescription(model), threat: describeEvidence(model.state, found, target.id) } : {}),
        search: deep?.search ?? { completeness: 'bounded', omittedCaseClasses: scan.omitted } };
    });
    return { square: square(position), owner: input.player, scope: input.categories,
      assumption: 'Independent catalogue insertions, no spending. This is a structural profile, not a purchase/capture on the empty square.', profiles };
  });
}

interface Result {
  [key: string]: unknown;
  sections: Sections;
  next: FollowUp[];
}
/** Bounded process-local LRU. Clock values are never cached. State content is part
 * of identity because previews share a live revision and tests can share room IDs. */
export class AnalysisService {
  private cache = new Map<string, { value: Result; bytes: number }>();
  private baselines = new Map<string, { sections: Sections; bytes: number }>();
  private bytes = 0;
  private baselineBytes = 0;
  private get(key: string) {
    const entry = this.cache.get(key);
    if (entry) { this.cache.delete(key); this.cache.set(key, entry); return structuredClone(entry.value); }
    return null;
  }
  private put(key: string, value: Result) {
    const bytes = JSON.stringify(value).length;
    if (bytes > 250000) return;
    this.bytes -= this.cache.get(key)?.bytes ?? 0;
    this.cache.set(key, { value: structuredClone(value), bytes }); this.bytes += bytes;
    while (this.cache.size > 64 || this.bytes > 4_000_000) {
      const key = this.cache.keys().next().value!; this.bytes -= this.cache.get(key)!.bytes; this.cache.delete(key);
    }
  }
  headline(room: RoomSnapshot, player = room.state.turn.currentPlayer) {
    const key = `headline:${room.id}:${room.revision}:${player}:${hash([room.state, room.ready])}`;
    const cached = this.get(key); if (cached) return cached;
    const budget = new WorkBudget(160, 15), s = room.state, forecast = economyForecast(s);
    const result: Result = { ...envelope(room, s, player, [], ['stay-in-place economy; Now flags use current turn; NextTurn flags assume engine handoff; existing single-hit witnesses only'], 'current'),
      sections: { economy: economyHeadlines(s, forecast), forecastStop: forecast.stop,
        deployment: Object.fromEntries(sides.map(p => { const geometry = spawnGeometry(s, p); return [p, [geometry.count, geometry.anchors.some(a => a.blockedBy.length > 0)]]; })),
        draw: [s.inactivityPlies ?? 0, 10], urgent: room.ready ? urgent(s, player, budget) : [] },
      search: budget.report(false, ['combinations', 'spending', 'nondefault upkeep', 'unlisted threats']),
      next: [followUp(room, player, ['threats'], { deep: true })] };
    this.put(key, result); return result;
  }
  analyze(room: RoomSnapshot, raw: unknown, signal?: AbortSignal): Result {
    const input = analysisSchema.parse(raw);
    if (input.roomId !== room.id || input.expectedRevision !== room.revision) throw new RoomError(409, 'STALE_REVISION', `Analysis requires revision ${room.revision}. Read the room again.`);
    if (input.sinceRevision !== undefined && input.sinceRevision > room.revision) throw new RoomError(422, 'INVALID_BASELINE', 'sinceRevision cannot be newer than the analyzed revision.');
    if (!room.ready && (input.hypotheticalActions.length || input.stateKind !== 'current')) throw new RoomError(409, 'WAITING_FOR_OPPONENT', 'Hypothetical play requires a ready room.');
    const { sinceRevision: _since, ...parameters } = input;
    const key = `analysis:${room.id}:${room.revision}:${hash([room.state, room.ready, parameters])}`;
    let result = this.get(key);
    if (!result) {
      const budget = new WorkBudget(input.searchBudget.maxNodes, input.searchBudget.maxMs, signal);
      const hypothetical = simulateSequence(room.state, input.hypotheticalActions);
      const model = input.stateKind === 'opponentNextTurn' ? turnFor(hypothetical.state, getOpponent(hypothetical.state.turn.currentPlayer)) : null;
      const s = model?.state ?? hypothetical.state;
      validateTargets(s, input);
      const sections: Sections = {};
      for (const topic of [...new Set(input.topics)]) {
        switch (topic) {
          case 'economy': sections.economy = economy(s, input); break;
          case 'units': sections.units = unitDetails(s, input); break;
          case 'matchups': sections.matchups = matchups(s); break;
          case 'spawn': sections.spawn = sides.map(p => ({ ...spawnGeometry(s, p), blockingSet: blockingSet(s, p, budget) })); break;
          case 'reach': sections.reach = reach(s, input); break;
          case 'mobility': sections.mobility = mobility(s, input); break;
          case 'threats': {
            sections.threats = room.ready ? threats(s, input, budget) : { unavailable: 'waiting_for_opponent' };
            const empty = input.targets.squares?.filter(p => !getUnitAt(s.board, p));
            if (empty?.length) sections.emptySquareProfiles = survival(s, { ...input, targets: { squares: empty } }, budget);
            break;
          }
          case 'opportunities': sections.opportunities = room.ready ? opportunities(s, input, budget) : { unavailable: 'waiting_for_opponent' }; break;
          case 'survival': sections.survival = survival(s, input, budget); break;
          case 'checkmate': sections.checkmate = checkmate(s, budget); break;
          case 'exchange': sections.exchange = exchange(room.state, input.hypotheticalActions); break;
          case 'reply': {
            const replyModel = turnFor(s, getOpponent(input.player));
            const targetIds = input.objective === 'killTarget' ? input.targets.unitIds?.length ? input.targets.unitIds
              : s.board.units.filter(u => u.owner === input.player).map(u => u.id) : [undefined];
            sections.reply = { model: modelDescription(replyModel), objective: input.objective,
              results: targetIds.map((targetId, index) => {
                const remaining = targetIds.length - index;
                const local = budget.fork(Math.floor((budget.maxNodes - budget.nodes) / remaining), budget.remainingMs / remaining);
                const reply = searchTurn(replyModel.state, local, { targetId, categories: input.categories, objective: input.objective });
                budget.absorb(local);
                return { target: targetId ?? null, ...reply, best: reply.best ? describeEvidence(replyModel.state, reply.best, targetId) : null };
              }) }; break;
          }
        }
      }
      const context = { targets: input.targets, hypotheticalActions: input.hypotheticalActions.map(describeAction), stateKind: input.stateKind, categories: input.categories };
      const next = [followUp(room, input.player, ['threats'], { ...context, deep: true, detail: 'full' }),
        followUp(room, input.player, ['checkmate'], context)];
      result = { ...envelope(room, s, input.player, hypothetical.applied.map(describeAction),
        [...(model?.assumptions ?? ['current state after the supplied legal sequence']), `categories: ${input.categories.join(',')}; pending upkeep choices are reported per search`],
        model ? 'opponentNextTurn' : hypothetical.applied.length || input.targets.defenders?.length ? 'afterHypothetical' : 'current'),
        ...(model ? { turnSetup: modelDescription(model) } : {}), sections,
        search: budget.report(!input.topics.some(t => ['threats', 'opportunities', 'survival', 'reply'].includes(t)),
          input.topics.some(t => ['threats', 'opportunities', 'survival', 'reply'].includes(t)) ? ['See per-target scope and search metadata; absence of a witness is not safety.'] : []), next };
      this.fit(result, input.detail === 'headline' ? 1800 : input.detail === 'full' ? 120000 : 24000, input);
      if (!signal?.aborted) this.put(key, result);
    }
    const baselineKey = `${room.id}:${input.player}:${hash({ ...parameters, expectedRevision: 0 })}`;
    return this.diff(result, baselineKey, room.revision, input.sinceRevision);
  }
  briefing(room: RoomSnapshot, player: PlayerId, sinceRevision?: number): Result {
    const key = `briefing:${room.id}:${room.revision}:${player}:${hash([room.state, room.ready])}`;
    let result = this.get(key);
    if (!result) {
      const s = room.state, budget = new WorkBudget(900, 65), forecast = economyForecast(s);
      const input = analysisSchema.parse({ roomId: room.id, expectedRevision: room.revision, player, topics: ['threats'], replies: false,
        categories: ['existing', 'promotion', 'purchase'], limit: 3 });
      const own = s.board.units.filter(u => u.owner === player);
      const matrix = matchups(s);
      const threatBudget = budget.fork(500, 38);
      const threatsFound = room.ready ? threats(s, input, threatBudget) : [];
      budget.absorb(threatBudget);
      const opportunitiesFound = room.ready ? opportunities(s, { ...input, limit: 2 }, budget) : null;
      result = { ...envelope(room, s, player, [], ['Stay-in-place economy; next-turn threats use engine handoff; no opponent future harvest.'], 'current'),
        sections: { economy: economyHeadlines(s, forecast), forecastStop: forecast.stop,
          miners: own.map(u => { const m = minerDetail(s, u, 3, false, 1, 1); return `${u.id}@${m.square} take${m.next}/left${m.reserve}/harvests${m.harvestsLeft}/upkeep${m.upkeep}`; }),
          matchups: { definitions: matrix.definitions, attack: matrix.attack, blackAttackOverride: matrix.blackAttackOverride },
          spawn: sides.map(p => { const g = spawnGeometry(s, p); return { player: p, count: g.count, squares: g.squares,
            blocked: g.anchors.filter(a => a.blockedBy.length).map(a => [a.id, a.blockedBy]) }; }),
          threats: threatsFound.filter(t => t.lines.length).map(t => ({ target: t.target, kill: t.kill, lines: t.lines.slice(0, 1).map(l => l.line) })),
          opportunities: opportunitiesFound?.lines.map(l => l.line) ?? [],
          mobility: own.filter(u => getAdjacentPositions(u.position).some(p => getUnitAt(s.board, p)?.owner === player)).slice(0, 4).map(u => ({ id: u.id,
            trapped: getAdjacentPositions(u.position).every(p => !!getUnitAt(s.board, p)), blockers: getAdjacentPositions(u.position).map(p => getUnitAt(s.board, p)).filter(v => v?.owner === player).map(v => v!.id) })),
          urgent: this.headline(room, player).sections.urgent },
        search: budget.report(false, ['multi-attacker combinations', 'unlisted units and lines', 'alternate upkeep', 'searched recaptures', 'sealed-region details']),
        next: [followUp(room, player, ['threats'], { targets: { unitIds: threatsFound.filter(t => t.lines.length).slice(0, 2).map(t => t.target) }, deep: true, detail: 'full' }),
          followUp(room, player, ['economy', 'mobility'], { detail: 'full' })] };
      this.fit(result, 6000); this.put(key, result);
    }
    // Pace is live metadata, outside the revision cache and changed-section baseline.
    return { ...this.diff(result, `briefing:${room.id}:${player}`, room.revision, sinceRevision),
      clockPressure: room.clockPressure ?? null };
  }
  private fit(result: Result, maximum: number, input?: AnalysisInput) {
    const omitted: string[] = [];
    result.output = { targetBytes: maximum, omittedSections: omitted };
    const length = () => Buffer.byteLength(JSON.stringify(result));
    // Drop complete optional sections, never truncate action arrays or matrices
    // into misleading/inexecutable fragments. Focused full queries recover them.
    for (const topic of ['mobility', 'matchups', 'miners', 'spawn', 'economy', 'emptySquareProfiles', 'survival', 'reach', 'units', 'opportunities', 'threats', 'reply']) {
      if (length() <= maximum - 600) break;
      if (!(topic in result.sections)) continue;
      delete result.sections[topic]; omitted.push(topic);
    }
    if (omitted.length) result.next.push({ tool: 'muju_analyze', arguments: { roomId: result.roomId, expectedRevision: result.revision,
      player: result.perspective, ...(input ? { targets: input.targets, hypotheticalActions: input.hypotheticalActions.map(describeAction),
        stateKind: input.stateKind, categories: input.categories, deep: input.deep, replies: input.replies, actions: input.actions, horizon: input.horizon } : {}),
      topics: [...new Set(omitted.map(t => t === 'miners' ? 'economy' : t === 'emptySquareProfiles' ? 'survival' : t))], detail: 'full', limit: 1 } });
    const output = { targetBytes: maximum, omittedSections: omitted, overBudget: false };
    result.output = output; output.overBudget = length() > maximum;
  }
  private diff(result: Result, key: string, revision: number, sinceRevision?: number): Result {
    if (sinceRevision !== undefined && sinceRevision > revision) throw new RoomError(422, 'INVALID_BASELINE', 'sinceRevision is in the future.');
    const old = sinceRevision === undefined ? null : this.baselines.get(`${key}:${sinceRevision}`)?.sections;
    const id = `${key}:${revision}`, bytes = JSON.stringify(result.sections).length;
    this.baselineBytes -= this.baselines.get(id)?.bytes ?? 0;
    this.baselines.set(id, { sections: structuredClone(result.sections), bytes }); this.baselineBytes += bytes;
    while (this.baselines.size > 128 || this.baselineBytes > 4_000_000) {
      const oldest = this.baselines.keys().next().value!; this.baselineBytes -= this.baselines.get(oldest)!.bytes; this.baselines.delete(oldest);
    }
    if (sinceRevision === undefined) return result;
    if (!old) return { ...result, diff: { mode: 'full', sinceRevision, reason: 'baseline_not_cached; full result returned' } };
    return { ...result, sections: Object.fromEntries(Object.entries(result.sections).filter(([name, value]) => name === 'urgent' || JSON.stringify(value) !== JSON.stringify(old[name]))),
      diff: { mode: 'changed_sections', sinceRevision, noLongerReturnedSections: Object.keys(old).filter(k => !(k in result.sections)),
        note: 'Replaced arrays include removed entries. Search omissions and removed witnesses do not prove safety.' } };
  }
}
export const analysisService = new AnalysisService();
