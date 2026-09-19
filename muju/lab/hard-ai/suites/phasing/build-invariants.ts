/** Twenty Phasing pair motifs; canonical premises are independent of Hard bits
 * or weighted scores. #15/#18 are protocol coverage, never strict preferences. */
import { makePosition, positionRef, replayTrace } from './canonical';
import { authoredState, authorCommon, stateFacts, all, ledger, passive, probe, type AuthoredUnit } from './build-economy';
import type { AIAction, GameState, SourceBinding, SuiteDocument, PhasingPosition, PredicateSpec, ProbeSpec, InvariantPair, StateFact, Position } from './format';

const EA: AIAction = { type: 'END_ACTION_PHASE' }, EP: AIAction = { type: 'END_PLACE_PHASE' };
const PASS: AIAction[] = [EA, EP];
const unit = (id: string, def: string, owner: 'white' | 'black', x: number, y: number): AuthoredUnit => ({ id, def, owner, x, y });
const W = (id: string, def: string, x: number, y: number) => unit(id, def, 'white', x, y);
const B = (id: string, def: string, x: number, y: number) => unit(id, def, 'black', x, y);
const QUIET = B('opponent', 'metal_1', 9, 9);
const move = (unitId: string, x: number, y: number): AIAction => ({ type: 'MOVE', unitId, to: { x, y } });
const hit = (unitId: string, x: number, y: number): AIAction => ({ type: 'ATTACK', unitId, targetPosition: { x, y } });
const present = (id: string, position?: Position): StateFact => ({ kind: 'unit', id, present: true, ...(position ? { position } : {}) });
const absent = (id: string): StateFact => ({ kind: 'unit', id, present: false });
const root = (...facts: StateFact[]) => stateFacts('root', ...facts);
const end = (...facts: StateFact[]) => stateFacts('endpoint', ...facts);

/** Caller must install binding rules before this builder: some members are
 * actual legal-prefix results. This function never calls a Hard implementation. */
export function buildInvariants(binding: SourceBinding): SuiteDocument {
  const out: SuiteDocument = { schema: 'muju-phasing-suite-v1', family: 'invariants', positions: [], cases: [] };
  const diagram = (id: string, state: GameState, rationale: string, counterfactual = false) => {
    const p = makePosition(id, state, binding, counterfactual ? { kind: 'counterfactual-defense', rationale } : { kind: 'authored-diagram', rationale });
    out.positions.push(p); return p;
  };
  const derive = (id: string, seed: PhasingPosition, actions: AIAction[]) => {
    const p = makePosition(id, replayTrace(seed.state, actions).endpoint, binding,
      { kind: 'legal-prefix', seed: positionRef(seed), actions, seedReachability: 'authored-diagram' });
    out.positions.push(p); return p;
  };
  const state = (units: AuthoredUnit[], extra: Partial<Parameters<typeof authoredState>[1]> = {}) =>
    authoredState(binding, { current: 'black', white: 8, black: 8, units, ...extra });
  const add = (n: number, slug: string, rationale: string, violating: PhasingPosition | GameState, correct: PhasingPosition | GameState,
    vp: PredicateSpec, cp: PredicateSpec, vprobes: ProbeSpec[] = [], cprobes: ProbeSpec[] = []) => {
    const id = `inv${n}-${slug}`, isPosition = (s: PhasingPosition | GameState): s is PhasingPosition => 'schema' in s;
    const v = isPosition(violating) ? violating : diagram(`${id}-violating`, violating, rationale, n === 15);
    const c = isPosition(correct) ? correct : diagram(`${id}-correct`, correct, rationale, n === 15);
    const base = authorCommon(id, 'invariants', rationale, [], []);
    const item: InvariantPair = { ...base, family: 'invariants', kind: 'invariant-pair', invariant: n,
      violating: positionRef(v), correct: positionRef(c), perspective: 'white', premise: { violating: vp, correct: cp },
      probes: { violating: vprobes, correct: cprobes }, classification: n === 15 || n === 18 ? 'structural' : 'preference',
      primaryMetric: n === 15 || n === 18 ? 'none' : 'eval-gap',
      ...(n === 15 || n === 18 ? {} : { work: 120_000 }),
      evidence: { ...base.evidence,
        positive: [{ kind: 'legality@1', member: 'violating', action: EP, expected: false },
          { kind: 'legality@1', member: 'correct', action: EP, expected: false }],
        negative: [],
      },
    };
    out.cases.push(item);
  };

  add(1, 'spawn-zero', 'Same living material and cash; moving the sole anchor away from its occupied home square opens canonical recruitment area. Synthetic post-handoff comparison, not an immediate purchased anchor.',
    state([W('anchor', 'water_1', 0, 0), QUIET]), state([W('anchor', 'water_1', 1, 1), QUIET]),
    root({ kind: 'spawn-area', player: 'white', value: { eq: 0 } }), root({ kind: 'spawn-area', player: 'white', value: { eq: 3 } }));

  add(2, 'corner-seal', 'Own miners on both home-adjacent cells seal the named home body movement range; shifting one to C1 opens A2. This is a current-board mobility fact, not a claim that no rescue can ever exist.',
    state([W('home-body', 'water_1', 0, 0), W('east', 'plant_1', 1, 0), W('south', 'plant_1', 0, 1), QUIET]),
    state([W('home-body', 'water_1', 0, 0), W('east', 'plant_1', 1, 0), W('south', 'plant_1', 2, 0), QUIET]),
    root({ kind: 'mobility-count', unitId: 'home-body', value: { eq: 0 } }), root({ kind: 'mobility-count', unitId: 'home-body', value: { min: 1 } }));

  {
    const common = [W('survivor', 'water_1', 2, 2), B('attacker', 'fire_1', 9, 2), QUIET];
    add(3, 'retreat-square', 'An existing Fire I reaches H5 in two move actions, kills Plant I H6 and retreats to J5 within four AP. Target B5 is Manhattan10 away: even the optimistic three-move-plus-hit bound is7. No new purchase contributes.',
      state([...common, W('target', 'plant_1', 7, 5)]), state([...common, W('target', 'plant_1', 1, 4)]),
      root(present('target', { x: 7, y: 5 })), root(present('target', { x: 1, y: 4 })),
      [probe([move('attacker', 9, 4), move('attacker', 7, 4), hit('attacker', 7, 5), move('attacker', 9, 4)],
        end(absent('target'), present('attacker', { x: 9, y: 4 }), { kind: 'turn', player: 'black', phase: 'action', actionsRemaining: 0 }), undefined, 'intermediate')]);
  }
  {
    const common = [W('survivor', 'plant_1', 2, 2), B('attacker', 'fire_1', 9, 9)];
    add(4, 'strand-unpunished', 'Fire I spends three moves and its fourth AP killing the forward Plant I. The only surviving White unit is Plant I, which has zero effective attack against Fire. The C5 comparison target is beyond the optimistic seven-square move-and-hit bound. This is an actual-army contrast, not a forecast of future shopping.',
      state([...common, W('target', 'plant_1', 8, 4)]), state([...common, W('target', 'plant_1', 2, 4)]),
      root(present('target', { x: 8, y: 4 })), root(present('target', { x: 2, y: 4 })),
      [probe([move('attacker', 9, 7), move('attacker', 9, 5), move('attacker', 8, 5), hit('attacker', 8, 4)],
        end(absent('target'), present('survivor'), { kind: 'turn', player: 'black', phase: 'action', actionsRemaining: 0 }), undefined, 'intermediate')]);
  }
  {
    const pending = (y: number) => [{ id: 'paid-miner', owner: 'white' as const, definitionId: 'plant_1', position: { x: 3, y }, cost: 5 }];
    const v = state([W('anchor', 'water_1', 4, 4), QUIET], { pending: pending(0), reserves: [{ x: 3, y: 0, amount: 2 }] });
    const c = state([W('anchor', 'water_1', 4, 4), QUIET], { pending: pending(4), reserves: [{ x: 3, y: 4, amount: 9 }] });
    const receipt: PredicateSpec = { kind: 'summon-resolution@1', commitment: { kind: 'root', id: 'paid-miner' }, outcome: 'arrived', player: 'white', window: 1 };
    const future = (mined: number) => probe(PASS, all(receipt, ledger({ player: 'white', metric: 'mined', value: { eq: mined } }, { player: 'white', metric: 'incomeWindows', value: { eq: 2 } })), passive(3));
    add(5, 'poor-miner-square', 'Equal paid Plant-I commitments remain inert during Black Act. A real pass-only arrival then two outgoing White harvests consume2 versus6 crystals from the named finite reserve cells; no claimed immediate placed body.', v, c,
      root({ kind: 'pending', id: 'paid-miner', present: true, position: { x: 3, y: 0 } }, absent('paid-miner')),
      root({ kind: 'pending', id: 'paid-miner', present: true, position: { x: 3, y: 4 } }, absent('paid-miner')), [future(2)], [future(6)]);
  }
  {
    const v = state([W('anchor', 'water_1', 4, 4), B('intruder', 'fire_1', 9, 5)]);
    const c = state([W('anchor', 'water_1', 2, 2), B('intruder', 'fire_1', 9, 5)]);
    const line = [move('intruder', 7, 5), move('intruder', 5, 5), move('intruder', 3, 5), move('intruder', 3, 4)];
    add(6, 'fragile-anchor', 'The live Fire-I intrusion J6→H6→F6→D6→D5 voids the E5 rectangle. C3 remains supported after that same line; entering any empty C3-rectangle square needs at least11 movement distance, beyond eight this Act. Pending commitments do not supply anchors.', v, c,
      root(present('anchor', { x: 4, y: 4 })), root(present('anchor', { x: 2, y: 2 })),
      [probe(line, end({ kind: 'spawn-area', player: 'white', value: { eq: 0 } }), undefined, 'intermediate')],
      [probe(line, end({ kind: 'spawn-area', player: 'white', value: { min: 1 } }), undefined, 'intermediate')]);
  }
  {
    const id = 'inv7-promote-no-runway', rationale = 'A real Prepare promotion consumes the eight-crystal reserve. Rent is not paid again now. After a passive Black reply the promoted Lightning III has no income and cannot pay its next rent2; the banked Lightning II can pay rent1. A free Plant I keeps both scenarios nonterminal.';
    const seed = diagram(`${id}-seed`, state([W('investment', 'lightning_2', 2, 2), W('survivor', 'plant_1', 1, 1), QUIET], { current: 'white', phase: 'place', white: 8 }), rationale);
    const v = derive(`${id}-violating`, seed, [{ type: 'PROMOTE_UNIT', unitId: 'investment' }, EP]);
    const c = derive(`${id}-correct`, seed, [EP]);
    add(7, 'promote-no-runway', rationale, v, c,
      root({ kind: 'bank', player: 'white', value: { eq: 0 } }, { kind: 'unit', id: 'investment', present: true, definitionId: 'lightning_3' }),
      root({ kind: 'bank', player: 'white', value: { eq: 8 } }, { kind: 'unit', id: 'investment', present: true, definitionId: 'lightning_2' }),
      [probe(PASS, all(end(absent('investment'), present('survivor')), ledger({ player: 'white', metric: 'upkeep', value: { eq: 0 } })), passive(1))],
      [probe(PASS, all(end(present('investment')), ledger({ player: 'white', metric: 'upkeep', value: { eq: 1 } })), passive(1))]);
  }
  {
    const id = 'inv8-no-pre-adjacency', rationale = 'Authentic alternatives from one White Act: Water I chips the durable Metal III, or fresh Fire I kills the adjacent Black Fire I. The durable enemy survives and heals at Black start. No stale Metal-I attack or fabricated spent flags establish the missed-kill premise.';
    const seed = diagram(`${id}-seed`, state([W('chipper', 'water_1', 2, 2), W('killer', 'fire_1', 6, 6), B('durable', 'metal_3', 3, 2), B('target', 'fire_1', 7, 6)], { current: 'white' }), rationale);
    const v = derive(`${id}-violating`, seed, [hit('chipper', 3, 2), ...PASS]);
    const c = derive(`${id}-correct`, seed, [hit('killer', 7, 6), ...PASS]);
    add(8, 'no-pre-adjacency', rationale, v, c,
      root(present('target'), { kind: 'unit-attack-count', unitId: 'chipper', value: { eq: 1 } }, { kind: 'damage', id: 'durable', value: { eq: 0 } }),
      root(absent('target'), { kind: 'unit-flag', id: 'killer', flag: 'lastAttackKilled', value: true }));
  }
  {
    const id = 'inv9-chip-across-turn', rationale = 'With one AP, a genuine nonlethal chip heals at the victim incoming turn, while the legal B3 relocation mines2 before outgoing rent. The useful alternative gives a distinct economic endpoint; this does not demand a strict weighted preference between two otherwise identical healed boards.';
    const seed = diagram(`${id}-seed`, state([W('miner', 'water_1', 2, 2), W('survivor', 'plant_1', 1, 1), B('durable', 'metal_3', 3, 2), QUIET],
      { current: 'white', actions: 1, reserves: [{ x: 1, y: 2, amount: 4 }] }), rationale);
    const v = derive(`${id}-violating`, seed, [hit('miner', 3, 2), ...PASS]);
    const c = derive(`${id}-correct`, seed, [move('miner', 1, 2), ...PASS]);
    add(9, 'chip-across-turn', rationale, v, c,
      root({ kind: 'damage', id: 'durable', value: { eq: 0 } }, { kind: 'unit-attack-count', unitId: 'miner', value: { eq: 1 } }, { kind: 'bank', player: 'white', value: { eq: 8 } }),
      root({ kind: 'unit-attack-count', unitId: 'miner', value: { eq: 0 } }, present('miner', { x: 1, y: 2 }), { kind: 'bank', player: 'white', value: { eq: 10 } }));
  }
  {
    const common = [W('defender', 'water_1', 2, 2), W('blocker', 'metal_1', 1, 0)];
    add(10, 'home-reachable', 'An existing Lightning I E5 can enter A1 in three moves. J7 is Manhattan15 from home, beyond four speed3 moves. This is entry availability with the actual defending army, not a mate verdict or access to incoming defender shopping.',
      state([...common, B('runner', 'lightning_1', 4, 4)]), state([...common, B('runner', 'lightning_1', 9, 6)]),
      root(present('runner', { x: 4, y: 4 })), root(present('runner', { x: 9, y: 6 })),
      [probe([move('runner', 1, 4), move('runner', 0, 2), move('runner', 0, 0)], end(present('runner', { x: 0, y: 0 })), undefined, 'intermediate')]);
  }
  add(11, 'home-bare', 'Same material: Metal I C1 versus B1 changes bare home-neighbor geometry in the presence of an existing enemy runner. The preference is an authored defense heuristic, not proof that a single plug guarantees safety or that affordable purchases attack immediately.',
    state([W('defender', 'water_1', 2, 2), W('plug', 'metal_1', 2, 0), B('runner', 'lightning_1', 9, 9)]),
    state([W('defender', 'water_1', 2, 2), W('plug', 'metal_1', 1, 0), B('runner', 'lightning_1', 9, 9)]),
    root(present('plug', { x: 2, y: 0 })), root(present('plug', { x: 1, y: 0 })));

  {
    const common = [W('survivor', 'water_1', 2, 2), B('attacker', 'fire_2', 5, 8), QUIET];
    add(12, 'cleave-line', 'A real Fire-II four-AP reply moves F7/F6 then kills E6 and G6. The first kill unlocks the second distinct attack. Alternative targets B3/D2 exceed the optimistic move-and-hit distance; no promotion is inserted before this Act.',
      state([...common, W('left', 'lightning_1', 4, 5), W('right', 'lightning_1', 6, 5)]),
      state([...common, W('left', 'lightning_1', 1, 2), W('right', 'lightning_1', 3, 1)]),
      root(present('left', { x: 4, y: 5 }), present('right', { x: 6, y: 5 })),
      root(present('left', { x: 1, y: 2 }), present('right', { x: 3, y: 1 })),
      [probe([move('attacker', 5, 6), move('attacker', 5, 5), hit('attacker', 4, 5), hit('attacker', 6, 5)],
        end(absent('left'), absent('right'), present('survivor'), { kind: 'unit-attack-count', unitId: 'attacker', value: { eq: 2 } }), undefined, 'intermediate')]);
  }
  add(13, 'turtle', 'Same catalogue material and no invented movement by immobile Metal I. Water I B2 versus D3 gives a larger live-anchor rectangle. Preference for expansion is a declared strategic comparison, not a theorem that greater area always wins.',
    state([W('mobile-anchor', 'water_1', 1, 1), W('fixed', 'metal_1', 2, 0), B('enemy', 'shadow_1', 6, 6), B('support', 'plant_1', 7, 8)]),
    state([W('mobile-anchor', 'water_1', 3, 2), W('fixed', 'metal_1', 2, 0), B('enemy', 'shadow_1', 6, 6), B('support', 'plant_1', 7, 8)]),
    root({ kind: 'spawn-area', player: 'white', value: { eq: 3 } }), root({ kind: 'spawn-area', player: 'white', value: { eq: 10 } }));

  {
    const units = [W('rent-bearing', 'metal_3', 2, 2), W('survivor', 'plant_1', 1, 1), QUIET];
    add(14, 'liquidity-floor', 'Replace the unapproved universal six-crystal threshold with actual imminent rent2 and zero projected income. Cash1 cannot retain the Metal III at its next outgoing rent; cash4 can. A tier-I survivor prevents elimination from masquerading as an economic result.',
      state(units, { white: 1 }), state(units, { white: 4 }), root({ kind: 'bank', player: 'white', value: { eq: 1 } }), root({ kind: 'bank', player: 'white', value: { eq: 4 } }),
      [probe(PASS, all(end(absent('rent-bearing'), present('survivor')), ledger({ player: 'white', metric: 'upkeep', value: { eq: 0 } })), passive(1))],
      [probe(PASS, all(end(present('rent-bearing')), ledger({ player: 'white', metric: 'upkeep', value: { eq: 2 } })), passive(1))]);
  }
  {
    const s = state([W('occupier', 'fire_1', 9, 9), W('survivor', 'plant_1', 0, 0), B('rescuer', 'water_1', 7, 9)]);
    const limited: PredicateSpec = { kind: 'home-proof-budget@1', at: 'root', invader: 'white', expected: 'unknown', maxNodes: 1 };
    const resolved: PredicateSpec = { kind: 'home-defense@1', at: 'root', invader: 'white', expected: 'rescue', maxNodes: 100 };
    const checks = [probe([move('rescuer', 8, 9)], all(limited, resolved), undefined, 'intermediate'),
      probe([move('rescuer', 8, 9), hit('rescuer', 9, 9)], end(absent('occupier'), present('survivor')), undefined, 'intermediate')];
    add(15, 'unknown-as-safe', 'Identical explicit occupied-home diagrams test proof-budget handling, not a preference. Node cap1 cannot finish the required move then hit and must remain UNKNOWN/node_limit. An independent ample-cap rescue and canonical move/capture witness establish the tactical truth. Ordinary unresolved proofs remain indeterminate; this deliberate protocol check earns no decision unit.',
      s, structuredClone(s), limited, limited, checks, checks);
  }
  {
    const units = [W('a', 'water_1', 2, 2), W('b', 'plant_1', 1, 3), W('c', 'plant_1', 1, 4), QUIET];
    add(16, 'clock-discipline', 'The same White catalogue-material lead faces a kill-free counter9 versus2. One passive Black handoff reaches inactivity10/draw versus3/playing. This documents timing and the declared draw-avoidance preference while ahead, not a proof of a forced win.',
      state(units, { clock: 9 }), state(units, { clock: 2 }), root({ kind: 'inactivity-plies', value: { eq: 9 } }), root({ kind: 'inactivity-plies', value: { eq: 2 } }),
      [probe(PASS, end({ kind: 'terminal', winner: null, reason: 'inactivity' }))],
      [probe(PASS, end({ kind: 'inactivity-plies', value: { eq: 3 } }, { kind: 'game-phase', value: 'playing' }))]);
  }
  {
    const units = [W('runner', 'lightning_1', 0, 0), W('south-blocker', 'shadow_1', 0, 1), W('anchor', 'water_1', 3, 2), QUIET];
    const pending = (x: number) => [{ id: 'paid-blocker', owner: 'white' as const, definitionId: 'plant_1', position: { x, y: 0 }, cost: 5 }];
    const v = state(units, { pending: pending(1) }), c = state(units, { pending: pending(2) });
    const before = root({ kind: 'mobility-count', unitId: 'runner', value: { min: 1 } }, absent('paid-blocker'));
    const arrival: PredicateSpec = { kind: 'summon-resolution@1', commitment: { kind: 'root', id: 'paid-blocker' }, player: 'white', outcome: 'arrived', window: 1 };
    add(17, 'self-block', 'Equal public commitments are non-occupying now. After the actual incoming batch, B1 together with the existing A2 blocker seals the runner at A1; C1 leaves a legal exit. The pending unit does not block an already-finished Act.', v, c, before, before,
      [probe(PASS, all(arrival, end({ kind: 'mobility-count', unitId: 'runner', value: { eq: 0 } })))],
      [probe(PASS, all(arrival, end({ kind: 'mobility-count', unitId: 'runner', value: { min: 1 } })))]);
  }
  {
    const s = state([W('survivor', 'water_1', 2, 2), QUIET]);
    const premise = root({ kind: 'turn', player: 'black', phase: 'action', actionsRemaining: 4, upkeepPending: false });
    const checks: ProbeSpec[] = [{ kind: 'legality@1', action: EP, expected: false },
      probe(PASS, all(end({ kind: 'turn', player: 'white', phase: 'action', actionsRemaining: 4, upkeepPending: false }),
        { kind: 'action-legality@1', at: 'endpoint', action: EP, expected: false }))];
    add(18, 'wasted-end-place', 'Identical full-Act states test protocol. END_PLACE is illegal during Act; completing Act then Prepare performs exactly one required handoff. The complete-macro replay rejects continuation after that handoff. This is structural coverage and earns no weighted gap.', s, structuredClone(s), premise, premise, checks, checks);
  }
  {
    const id = 'inv19-soft-miner-exposed', rationale = 'White handoff actually resolves a previously paid Black Fire-I batch. The live fresh Fire can reach and kill the E5 soft miner; A2 lies Manhattan9 away, beyond the three-move-plus-hit bound7. Black cash cannot invent immediate new attackers.';
    const seed = (role: string, x: number, y: number) => diagram(`${id}-${role}-seed`, state([W('target', 'fire_1', x, y), W('survivor', 'water_1', 2, 2), B('anchor', 'metal_1', 5, 4)],
      { current: 'white', phase: 'place', pending: [{ id: 'paid-attacker', owner: 'black', definitionId: 'fire_1', position: { x: 5, y: 5 }, cost: 3 }] }), rationale);
    const v = derive(`${id}-violating`, seed('violating', 4, 4), [EP]), c = derive(`${id}-correct`, seed('correct', 0, 1), [EP]);
    add(19, 'soft-miner-exposed', rationale, v, c,
      root(present('paid-attacker'), { kind: 'pending', id: 'paid-attacker', present: false }, present('target', { x: 4, y: 4 })),
      root(present('paid-attacker'), { kind: 'pending', id: 'paid-attacker', present: false }, present('target', { x: 0, y: 1 })),
      [probe([move('paid-attacker', 4, 5), hit('paid-attacker', 4, 4)], end(absent('target'), present('survivor')), undefined, 'intermediate')]);
  }
  {
    const id = 'inv20-strand-no-retreat', rationale = 'A real Shadow-I kill leaves one AP. Passing strands the killer next to immobile Metal I, whose effective attack2 kills it; the legal D6 retreat moves outside that actual opponent attack. Both members preserve genuine kill history; new purchases do not supply reply threats.';
    const seed = diagram(`${id}-seed`, state([W('killer', 'shadow_1', 5, 5), W('survivor', 'water_1', 2, 2), B('victim', 'lightning_1', 4, 5), B('punisher', 'metal_1', 5, 6), QUIET], { current: 'white', actions: 2 }), rationale);
    const v = derive(`${id}-violating`, seed, [hit('killer', 4, 5), ...PASS]);
    const c = derive(`${id}-correct`, seed, [hit('killer', 4, 5), move('killer', 3, 5), ...PASS]);
    add(20, 'strand-no-retreat', rationale, v, c,
      root(present('killer', { x: 5, y: 5 }), { kind: 'unit-flag', id: 'killer', flag: 'lastAttackKilled', value: true }),
      root(present('killer', { x: 3, y: 5 }), { kind: 'unit-flag', id: 'killer', flag: 'lastAttackKilled', value: true }),
      [probe([hit('punisher', 5, 5)], end(absent('killer'), present('survivor')), undefined, 'intermediate')],
      [{ kind: 'legality@1', action: hit('punisher', 3, 5), expected: false }, { kind: 'legality@1', action: move('punisher', 3, 6), expected: false }]);
  }
  return out;
}
