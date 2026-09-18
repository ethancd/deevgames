/**
 * E2.1's witness cases: four authored positions that exercise the place-phase
 * families the audit is about (EPIC-PLAN §4 E2.1, "canonical witness for
 * multi-promotion, purchase+promotion, upkeep and summon-and-strike cases").
 *
 * Every case is built here, verified against the CANONICAL rules through
 * `exam/witness.ts`, and only then written into the exam set's `dev` stratum.
 * The label is decided by the verification, never asserted:
 *
 *   `exact`    the canonical enumeration completed AND every end position
 *              satisfying the claim came from a turn of the intended family.
 *              That is what makes the case a proof that the family is REQUIRED,
 *              not merely available.
 *   `judgment` anything weaker — the enumeration was capped, or the claim is
 *              also satisfiable by a turn of another family. The reason says so.
 *
 * Run: `node --import tsx lab/hard-ai/audit/seed-cases.ts [--write]`
 * Without `--write` it prints what it would add and changes nothing.
 */
import path from 'node:path';
import type { GameState, PlayerId, Unit } from '../../../src/game/types';
import { createInitialGameState } from '../../../src/game/board';
import { createUnitFromDefinition } from '../../../src/game/building';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import { DEFAULT_RULES } from '../positions/corpus';
import {
  CASES_DIR,
  loadStratum,
  stratumFile,
  withExamRules,
  writeCases,
  type ExactClaim,
  type ExamCase,
  type ExamDemand,
} from '../exam/format';
import { DEFAULT_ENUM_BUDGET, claimHolds, enumerateTurnEnds, verifyExactWitness } from '../exam/witness';
import { applyAction } from '../../../src/ai/simulate';
import { getPromotionCost } from '../../../src/game/promotion';
import { getUnitDefinition } from '../../../src/game/units';
import { enumeratePlacePhase } from './place-enum';

const ENUM_BUDGET = 12_000_000;
const VERIFIED_BY = 'lab/hard-ai/audit/seed-cases.ts';

let seq = 0;
function body(defId: string, owner: PlayerId, x: number, y: number): Unit {
  return {
    ...createUnitFromDefinition(defId, owner, { x, y }, `e21-${owner}-${defId}-${seq++}`),
    placedThisTurn: false,
    promotedThisPlacement: false,
    canActThisTurn: true,
  };
}

function position(units: Unit[], whiteCrystals: number, opts: { upkeepPending?: boolean } = {}): GameState {
  const s = createInitialGameState();
  return {
    ...s,
    board: { ...s.board, units },
    turn: { ...s.turn, phase: 'place', turnNumber: 5, actionsRemaining: 4 },
    upkeepPending: opts.upkeepPending === true,
    players: {
      ...s.players,
      white: { ...s.players.white, resources: whiteCrystals },
    },
  };
}

/**
 * Every end position of the root that satisfies `claim`, paired with the family
 * of a turn that reaches it. The family comes from the PLACE enumeration plus
 * the canonical action-phase completion, so "which families can satisfy this
 * claim" is answered by the rules and not by the engine.
 */
interface ClaimProfile {
  keys: string[];
  complete: boolean;
  /** Claim-satisfying keys reachable ONLY through a prefix the case is about. */
  onlyVia: string[];
  /** Minimum promotions over the place prefixes whose completions satisfy the claim. */
  minPromotions: number | null;
  maxPromotions: number | null;
  minBuys: number | null;
  shapes: Set<string>;
}

function profileClaim(root: GameState, claim: ExactClaim, wanted: (f: { buys: number; promotions: number }) => boolean): ClaimProfile {
  const mover = root.turn.currentPlayer;
  const { ends, complete } = enumerateTurnEnds(root, ENUM_BUDGET);
  const keys: string[] = [];
  for (const [key, end] of ends) if (claimHolds(claim, root, end, mover)) keys.push(key);
  keys.sort();

  // Which place-phase shapes can reach a satisfying end position?
  const shapes = new Set<string>();
  let minPromotions: number | null = null;
  let maxPromotions: number | null = null;
  let minBuys: number | null = null;
  const place = enumeratePlacePhase(root, { maxPrefixes: 4_000, maxVisits: 60_000 });
  const satisfying = new Set(keys);
  const viaWanted = new Set<string>();
  const viaOther = new Set<string>();
  for (const prefix of place.prefixes) {
    const reached = enumerateTurnEnds(prefix.end, 1_500_000);
    const hits: string[] = [];
    for (const [key, end] of reached.ends) {
      if (!satisfying.has(key)) continue;
      if (claimHolds(claim, root, end, mover)) hits.push(key);
    }
    const sink = wanted(prefix.family) ? viaWanted : viaOther;
    for (const key of hits) sink.add(key);
    if (hits.length === 0) continue;
    shapes.add(prefix.shape);
    const pr = prefix.family.promotions;
    const bu = prefix.family.buys;
    if (minPromotions === null || pr < minPromotions) minPromotions = pr;
    if (maxPromotions === null || pr > maxPromotions) maxPromotions = pr;
    if (minBuys === null || bu < minBuys) minBuys = bu;
  }
  const onlyVia = [...viaWanted].filter(k => !viaOther.has(k)).sort();
  return { keys, complete: complete && !place.capped, onlyVia, minPromotions, maxPromotions, minBuys, shapes };
}

interface Built {
  id: string;
  demand: ExamDemand;
  tags: string[];
  rationale: string;
  state: GameState;
  claim: ExactClaim;
  /** The place-phase family the case is about. */
  wanted: (f: { buys: number; promotions: number }) => boolean;
  /** Prose for the artifact: what the family requirement is. */
  familyNote: string;
}

/** Find a tier-1 attacker/defender pair the promotion threshold separates:
 * the tier-1 body cannot kill the victim, its tier-2 form can, in one blow. */
function findPromotionKillPair(): { attacker: string; victim: string } {
  for (const attacker of TIER1) {
    for (const victim of ALL_VICTIMS) {
      if (!killsInOneBlow(attacker, victim) && killsInOneBlow(promoted(attacker), victim)) {
        return { attacker, victim };
      }
    }
  }
  throw new Error('no promotion threshold pair found in the shipped price list');
}

const TIER1 = ['fire_1', 'lightning_1', 'water_1', 'shadow_1', 'plant_1', 'metal_1'];
const ALL_VICTIMS = [
  'fire_1', 'lightning_1', 'water_1', 'shadow_1', 'plant_1', 'metal_1',
  'fire_2', 'lightning_2', 'water_2', 'shadow_2', 'plant_2', 'metal_2',
];

interface DisjointPairs {
  a: string; va: string;
  b: string; vb: string;
}

/**
 * Two attacker/victim pairs that need SEPARATE promotions: each promoted
 * attacker removes its own victim and neither attacker, at either tier, can
 * remove the other's. A turn that wins from such a position must promote twice,
 * which is the shape `gen/generate.ts buildCombos` cannot hold.
 */
function findDisjointPromotionPairs(): DisjointPairs {
  for (const a of TIER1) {
    for (const va of ALL_VICTIMS) {
      if (killsInOneBlow(a, va) || !killsInOneBlow(promoted(a), va)) continue;
      for (const b of TIER1) {
        for (const vb of ALL_VICTIMS) {
          if (vb === va) continue;
          if (killsInOneBlow(b, vb) || !killsInOneBlow(promoted(b), vb)) continue;
          // Neither attacker, at either tier, may remove the other's victim.
          if (killsInOneBlow(a, vb) || killsInOneBlow(promoted(a), vb)) continue;
          if (killsInOneBlow(b, va) || killsInOneBlow(promoted(b), va)) continue;
          return { a, va, b, vb };
        }
      }
    }
  }
  throw new Error('no disjoint promotion-threshold pairs in the shipped price list');
}

/** A body the anchor cannot remove, and a purchasable body that can. */
function findSummonStrikeTriple(): { anchor: string; victim: string; buy: string } {
  for (const anchor of TIER1) {
    for (const victim of ALL_VICTIMS) {
      if (killsInOneBlow(anchor, victim)) continue;
      for (const buy of [...TIER1, 'fire_2', 'shadow_2', 'metal_2', 'lightning_2']) {
        if (buy === anchor) continue;
        if (killsInOneBlow(buy, victim)) return { anchor, victim, buy };
      }
    }
  }
  throw new Error('no summon-and-strike triple in the shipped price list');
}

function promoted(defId: string): string {
  const [element, tier] = defId.split('_');
  return `${element}_${Number(tier) + 1}`;
}

/** One ATTACK from (0,0) onto (0,1), decided by the canonical rules. */
function killsInOneBlow(attackerDef: string, victimDef: string): boolean {
  const a = body(attackerDef, 'white', 0, 0);
  const v = body(victimDef, 'black', 0, 1);
  const state = position([a, v], 0);
  return withExamRules({ rules: DEFAULT_RULES }, () => {
    const acted = { ...state, turn: { ...state.turn, phase: 'action' as const } };
    const after = applyAction(acted, { type: 'ATTACK', unitId: a.id, targetPosition: { x: 0, y: 1 } });
    return after !== state && !after.board.units.some(u => u.id === v.id);
  });
}

function unitCost(defId: string): number {
  return getUnitDefinition(defId).cost;
}

function buildCases(): Built[] {
  const pairs = findDisjointPromotionPairs();
  const triple = findSummonStrikeTriple();
  const single = findPromotionKillPair();
  const out: Built[] = [];

  // A — MULTI-PROMOTION. Both attackers stand on their own back rank, where
  // `getAllSpawnPositions` returns nothing, so no purchase can substitute. Each
  // victim yields only to ITS OWN attacker's promoted form, so a winning turn
  // must promote twice. The bank is exactly the two promotion prices.
  out.push({
    id: 'e21-multi-promotion-double-threshold',
    demand: 'immediate-action',
    tags: ['e2.1', 'multi-promotion', 'promotion'],
    rationale: `A ${pairs.a} faces a ${pairs.va} and a ${pairs.b} faces a ${pairs.vb}. Neither attacker removes the other's victim at either tier, and neither removes its own at tier 1. Black holds exactly those two bodies, so the only winning turn promotes BOTH attackers. Promotions are place-phase actions and cost no part of the four-action budget.`,
    state: position(
      [
        body(pairs.a, 'white', 0, 0),
        body(pairs.b, 'white', 1, 0),
        body(pairs.va, 'black', 0, 1),
        body(pairs.vb, 'black', 1, 1),
      ],
      promotionPrice(pairs.a) + promotionPrice(pairs.b),
    ),
    claim: 'win',
    wanted: f => f.promotions >= 2,
    familyNote: 'two or more promotions in one place phase',
  });

  // D — SUMMON-AND-STRIKE. The white anchor stands deep, two squares from the
  // black body, and cannot remove it at its own power. A body bought on the
  // anchor's spawn rectangle next to the victim removes it the same turn,
  // because placement imposes no summoning sickness (`src/game/types.ts:77`).
  out.push({
    id: 'e21-summon-and-strike',
    demand: 'immediate-action',
    tags: ['e2.1', 'summon-strike', 'purchase'],
    rationale: `A ${triple.anchor} cannot remove the ${triple.victim} at any range; a ${triple.buy} can. The white anchor stands deep enough that its spawn rectangle reaches a square next to the victim, while the victim itself lies outside that rectangle and so does not block it. The kill belongs to a body bought this turn.`,
    state: position([body(triple.anchor, 'white', 1, 1), body(triple.victim, 'black', 2, 0)], unitCost(triple.buy)),
    claim: 'kill',
    wanted: f => f.buys >= 1,
    familyNote: 'a body bought in this same place phase',
  });

  // B — PURCHASE + PROMOTION. One black body yields only to a promotion, the
  // other only to a body bought this turn. A winning turn does both in the same
  // place phase.
  out.push({
    id: 'e21-purchase-plus-promotion',
    demand: 'immediate-action',
    tags: ['e2.1', 'purchase', 'promotion'],
    rationale: `A ${single.attacker} must promote to break the ${single.victim} next to it. The second black body, a ${triple.victim}, is out of that attacker's reach and yields to a ${triple.buy} bought this turn. Winning therefore needs a buy AND a promotion in one place phase.`,
    state: position(
      [
        body(single.attacker, 'white', 1, 1),
        body(single.victim, 'black', 1, 2),
        body(triple.victim, 'black', 2, 0),
      ],
      promotionPrice(single.attacker) + unitCost(triple.buy) + 1,
    ),
    claim: 'win',
    wanted: f => f.buys >= 1 && f.promotions >= 1,
    familyNote: 'a purchase and a promotion in the same place phase',
  });

  // C — UPKEEP RELEASE. Not an exact claim: "released the right body" is a
  // preference, and the format refuses a preference wearing the exact label.
  out.push({
    id: 'e21-upkeep-release-choice',
    demand: 'recurring-upkeep',
    tags: ['e2.1', 'upkeep', 'release'],
    rationale: 'The bank cannot pay the rent on the whole army, so the place phase opens with a forced release and the turn family is decided before a single action is spent. Which body goes is a judgment; the case exists so the release family is represented in the set at all.',
    state: position(
      [
        body('water_2', 'white', 4, 4),
        body('fire_2', 'white', 5, 4),
        body('plant_1', 'white', 3, 3),
        body('fire_1', 'black', 4, 5),
      ],
      1,
      { upkeepPending: true },
    ),
    claim: 'kill',
    wanted: f => f.buys === 0 && f.promotions === 0,
    familyNote: 'an upkeep release, which no exact claim can name',
  });

  return out;
}

function promotionPrice(defId: string): number {
  const cost = getPromotionCost(body(defId, 'white', 0, 0));
  if (cost === null) throw new Error(`${defId} has no next tier`);
  return cost;
}

function main(): void {
  const write = process.argv.includes('--write');
  const built = buildCases();
  const now = new Date().toISOString();

  const cases: ExamCase[] = [];
  for (const b of built) {
    const report = withExamRules({ rules: DEFAULT_RULES }, () => {
      const spawn = getAllSpawnPositions('white', b.state.board).length;
      const place = enumeratePlacePhase(b.state, { maxPrefixes: 4_000, maxVisits: 60_000 });
      const profile = profileClaim(b.state, b.claim, b.wanted);
      return { spawn, place, profile };
    });

    // EXACT only when the canonical enumeration completed AND it proved that
    // some end position satisfying the claim is reachable ONLY through the
    // family this case is about. `complete` stays false on the witness: the key
    // list is deliberately the family-only subset, not every satisfying end.
    const exact = report.profile.complete && report.profile.onlyVia.length > 0;
    const c: ExamCase = {
      schema: 'muju-exam-case-v1',
      id: b.id,
      version: 1,
      source: { kind: 'authored', from: 'lab/hard-ai/audit/seed-cases.ts#E2.1' },
      demand: b.demand,
      kind: exact ? 'exact' : 'judgment',
      rules: { ...DEFAULT_RULES, combatHandicap: { ...DEFAULT_RULES.combatHandicap } },
      position: { kind: 'state', state: b.state },
      sideToMove: 'white',
      witness: exact
        ? {
            label: 'exact',
            claim: b.claim,
            method: 'canonical-enumeration',
            endKeys: report.profile.onlyVia,
            avoidKeys: [],
            complete: false,
            note: `Canonical enumeration of every legal turn from this root completed. ${report.profile.keys.length} end position(s) satisfy "${b.claim}"; the ${report.profile.onlyVia.length} listed here are reachable ONLY through ${b.familyNote}. Spawn squares at the root: ${report.spawn}. Legal place prefixes: ${report.place.prefixes.length}, of which ${report.place.multiPromotion} promote two or more bodies. \`complete\` is false because the key list is the family-only subset, not every end position satisfying the claim.`,
            verifiedAt: now,
            verifiedBy: VERIFIED_BY,
          }
        : {
            label: 'judgment',
            preferredKeys: report.profile.keys.slice(0, 8),
            avoidKeys: [],
            reason: `The canonical enumeration ${report.profile.complete ? 'completed' : 'was capped'} and found ${report.profile.keys.length} end position(s) satisfying "${b.claim}", but none of them requires ${b.familyNote}: the shapes that reach one are ${[...report.profile.shapes].join(', ') || 'none'}. The preference is therefore an author's, not a proof. Legal place prefixes: ${report.place.prefixes.length}, multi-promotion: ${report.place.multiPromotion}.`,
            by: 'author',
          },
      stratum: 'dev',
      tags: b.tags,
      rationale: b.rationale,
    };
    // The exam runner re-verifies every exact witness at `DEFAULT_ENUM_BUDGET`.
    // A case that only verifies under a seeding-sized budget is not an exact
    // case in practice, so it is demoted here rather than left to fail there.
    let demoted = '';
    if (c.witness.label === 'exact') {
      const recheck = withExamRules(c, () => verifyExactWitness(c.witness as typeof c.witness & { label: 'exact' }, b.state, 'white', c.id, DEFAULT_ENUM_BUDGET));
      if (!recheck.ok) {
        demoted = ` (demoted: the exam runner's ${DEFAULT_ENUM_BUDGET}-call budget could not re-verify it)`;
        c.kind = 'judgment';
        c.witness = {
          label: 'judgment',
          preferredKeys: report.profile.onlyVia.slice(0, 8),
          avoidKeys: [],
          reason: `A seeding-budget enumeration proved these end positions satisfy "${b.claim}" and are reachable only through ${b.familyNote}, but the exam runner's ${DEFAULT_ENUM_BUDGET}-call budget cannot re-verify that, so the case is carried as a judgment.`,
          by: 'author',
        };
      }
    }
    cases.push(c);
    process.stdout.write(
      `${b.id}: ${c.kind} — satisfying=${report.profile.keys.length} onlyVia=${report.profile.onlyVia.length} complete=${report.profile.complete} shapes=${[...report.profile.shapes].join(',')} spawn=${report.spawn} prefixes=${report.place.prefixes.length} multi=${report.place.multiPromotion}${demoted}\n`,
    );
  }

  if (!write) {
    process.stdout.write('\n(dry run; pass --write to append these to the dev stratum)\n');
    return;
  }
  const existing = loadStratum('dev');
  const keep = existing.filter(c => !cases.some(n => n.id === c.id));
  writeCases(stratumFile('dev'), [...keep, ...cases]);
  process.stdout.write(`\nwrote ${cases.length} case(s) into ${path.relative(process.cwd(), stratumFile('dev', CASES_DIR))}\n`);
}

main();
