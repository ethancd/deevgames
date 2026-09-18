/**
 * E4 lane 6 (P7): does the proposed cache key cover everything the canonical
 * home verdict reads?
 *
 * For each probe state the script perturbs ONE field of `GameState` at a time,
 * re-runs `analyzeHomeDefense` (unmodified, from `src/game/homeCheckmate.ts`)
 * and compares a fingerprint of the run — the verdict plus the instrumented
 * copy's node, damage-bound and transition counts, which change on any
 * difference in the searched tree even when the verdict does not. The rule the
 * memo needs is one-directional: a perturbation that moves the fingerprint MUST
 * move the key. A perturbation that moves the key without moving the fingerprint
 * is only a missed cache hit.
 *
 * node --import tsx lab/results/hard-ai-e4/p7/key-sensitivity.ts --out <file>
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadReplay, reconstruct, withMatchRules } from '../../../hard-ai/analyze/replay';
import { applyAction } from '../../../../src/ai/simulate';
import { analyzeHomeDefense } from '../../../../src/game/homeCheckmate';
import { transitionWithoutCheckmate } from '../../../../src/ai/simulate';
import { getOpponent } from '../../../../src/game/victory';
import { getActionsPerTurn } from '../../../../src/game/rules';
import { readPositions } from '../../../hard-ai/positions/corpus';
import { setElementGraph } from '../../../../src/game/elements';
import { setUpkeepVariant } from '../../../../src/game/upkeep';
import { setCombatHandicap, resetCombatHandicap } from '../../../../src/game/combat';
import type { GameState, PlayerId, Unit } from '../../../../src/game/types';

const REPO = path.resolve(import.meta.dirname, '../../../..');
const P8_REPLAY = 'lab/results/hard-ai-e3/ablate/eval-correct-v1/fixed100k/replays/e1-g2-s40_3_3-A-white.json';

function verdictKey(state: GameState, invader: PlayerId): string {
  const defender = getOpponent(invader);
  const size = state.board.cells.length;
  const attackers: string[] = [], defenders: string[] = [];
  for (const u of state.board.units) {
    const square = u.position.x + size * u.position.y;
    if (u.owner === invader) attackers.push(`${square}.${u.definitionId}.${u.damageTaken}`);
    else defenders.push(`${square}.${u.definitionId}`);
  }
  attackers.sort(); defenders.sort();
  return [invader, size, getActionsPerTurn(state), state.ruleset ?? 'standard',
    state.players[defender].resources, 'A', attackers.join('|'), 'D', defenders.join('|')].join('/');
}

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s)) as GameState;
const mapUnits = (s: GameState, f: (u: Unit) => Unit): GameState =>
  ({ ...s, board: { ...s.board, units: s.board.units.map(f) } });

interface Probe { id: string; state: GameState; rules?: () => void }

type Mutation = { field: string; apply: (s: GameState, invader: PlayerId) => GameState };

const MUTATIONS: Mutation[] = [
  { field: 'turn.actionsRemaining', apply: s => ({ ...s, turn: { ...s.turn, actionsRemaining: Math.max(0, s.turn.actionsRemaining - 1) } }) },
  { field: 'turn.turnNumber', apply: s => ({ ...s, turn: { ...s.turn, turnNumber: s.turn.turnNumber + 7 } }) },
  { field: 'players[invader].resources', apply: (s, inv) => ({ ...s, players: { ...s.players, [inv]: { ...s.players[inv], resources: s.players[inv].resources + 25 } } }) },
  { field: 'players[defender].resources', apply: (s, inv) => { const d = getOpponent(inv); return { ...s, players: { ...s.players, [d]: { ...s.players[d], resources: s.players[d].resources + 25 } } }; } },
  { field: 'players[defender].resources-zero', apply: (s, inv) => { const d = getOpponent(inv); return { ...s, players: { ...s.players, [d]: { ...s.players[d], resources: 0 } } }; } },
  { field: 'actionsPerTurn', apply: s => ({ ...s, actionsPerTurn: undefined }) },
  { field: 'pendingSummons', apply: s => ({ ...s, pendingSummons: [...(s.pendingSummons ?? []), { id: 'probe-summon', owner: s.turn.currentPlayer, definitionId: 'fire_1', position: { x: 0, y: 0 }, cost: 3 }] }) },
  { field: 'inactivityPlies', apply: s => ({ ...s, inactivityPlies: (s.inactivityPlies ?? 0) + 5 }) },
  { field: 'progressThisTurn', apply: s => ({ ...s, progressThisTurn: !s.progressThisTurn }) },
  { field: 'blackCrystalHandicap', apply: s => ({ ...s, blackCrystalHandicap: 7 }) },
  { field: 'lastUpkeep', apply: s => ({ ...s, lastUpkeep: { player: 'white', paid: 3, released: [], turnNumber: 1 } }) },
  { field: 'selectedUnit+validMoves', apply: s => ({ ...s, selectedUnit: s.board.units[0].id, validMoves: [{ x: 1, y: 1 }], validAttacks: [{ x: 2, y: 2 }] }) },
  { field: 'board.cells.resourceLayers', apply: s => ({ ...s, board: { ...s.board, cells: s.board.cells.map(row => row.map(c => ({ ...c, resourceLayers: 0 }))) } }) },
  { field: 'defender.damageTaken', apply: (s, inv) => mapUnits(s, u => u.owner === getOpponent(inv) ? { ...u, damageTaken: 1 } : u) },
  { field: 'defender.hasMoved+hasAttacked', apply: (s, inv) => mapUnits(s, u => u.owner === getOpponent(inv) ? { ...u, hasMoved: true, hasAttacked: true } : u) },
  { field: 'defender.canActThisTurn=false', apply: (s, inv) => mapUnits(s, u => u.owner === getOpponent(inv) ? { ...u, canActThisTurn: false } : u) },
  { field: 'defender.attackedThisTurn', apply: (s, inv) => mapUnits(s, u => u.owner === getOpponent(inv) ? { ...u, attackedThisTurn: s.board.units.filter(x => x.owner === inv).map(x => x.id) } : u) },
  { field: 'defender.placedThisTurn', apply: (s, inv) => mapUnits(s, u => u.owner === getOpponent(inv) ? { ...u, placedThisTurn: true } : u) },
  { field: 'defender.promotedThisPlacement', apply: (s, inv) => mapUnits(s, u => u.owner === getOpponent(inv) ? { ...u, promotedThisPlacement: true } : u) },
  { field: 'invader.damageTaken', apply: (s, inv) => mapUnits(s, u => u.owner === inv ? { ...u, damageTaken: 1 } : u) },
  { field: 'invader.canActThisTurn=false', apply: (s, inv) => mapUnits(s, u => u.owner === inv ? { ...u, canActThisTurn: false } : u) },
  { field: 'invader.attackedThisTurn', apply: (s, inv) => mapUnits(s, u => u.owner === inv ? { ...u, attackedThisTurn: [], hasAttacked: false, lastAttackKilled: false } : u) },
  { field: 'unit.id renaming', apply: s => { const ids = new Map(s.board.units.map((u, i) => [u.id, `probe-${i}`])); return mapUnits(s, u => ({ ...u, id: ids.get(u.id)!, attackedThisTurn: (u.attackedThisTurn ?? []).map(x => ids.get(x) ?? x) })); } },
  { field: 'unit order reversed', apply: s => ({ ...s, board: { ...s.board, units: [...s.board.units].reverse() } }) },
];

interface Fingerprint { verdict: string; ms: number }

function fingerprint(state: GameState, invader: PlayerId): Fingerprint {
  const t = Number(process.hrtime.bigint()) / 1e6;
  const verdict = analyzeHomeDefense(state, invader, transitionWithoutCheckmate);
  return { verdict, ms: Math.round((Number(process.hrtime.bigint()) / 1e6 - t) * 1000) / 1000 };
}

function run(probe: Probe): unknown {
  const invader = probe.state.turn.currentPlayer;
  const base = fingerprint(probe.state, invader);
  const baseKey = verdictKey(probe.state, invader);
  const rows: unknown[] = [];
  for (const mutation of MUTATIONS) {
    const mutated = mutation.apply(clone(probe.state), invader);
    const f = fingerprint(mutated, invader);
    const key = verdictKey(mutated, invader);
    const verdictMoved = f.verdict !== base.verdict;
    const keyMoved = key !== baseKey;
    rows.push({ field: mutation.field, verdict: f.verdict, verdictMoved, keyMoved,
      ms: f.ms, unsafe: verdictMoved && !keyMoved });
  }
  return { id: probe.id, invader, baseVerdict: base.verdict, baseMs: base.ms, rows };
}

function main(): void {
  const argv = process.argv.slice(2);
  let out: string | null = null;
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--out') out = argv[++i];

  const results: unknown[] = [];

  // Probe 1: the P8 position, after the MOVE that puts white on the corner.
  const replay = loadReplay(path.resolve(REPO, P8_REPLAY));
  const recon = reconstruct(replay);
  const turn = recon.bySide.white.find(t => t.seatTurnIndex === 24)!;
  withMatchRules(replay.options, () => {
    let s = turn.startState;
    for (const a of turn.actions.slice(0, 3)) s = applyAction(s, a);
    results.push(run({ id: 'p8-white24-after-move', state: s }));
  });

  // Probes 2..n: every stored home-mate position whose state already carries an
  // occupation, under its own rules block.
  const stored = readPositions(path.resolve(REPO, 'lab/hard-ai/suites/home-mate.positions.jsonl'));
  for (const pos of stored) {
    const state = pos.state as GameState;
    try {
      setElementGraph(pos.rules.elementGraph);
      setUpkeepVariant(pos.rules.upkeep);
      setCombatHandicap('white', pos.rules.combatHandicap.white);
      setCombatHandicap('black', pos.rules.combatHandicap.black);
      const invader = state.turn.currentPlayer;
      if (analyzeHomeDefense(state, invader, transitionWithoutCheckmate) === 'rescue'
        && state.board.units.every(u => !(u.owner === invader
          && u.position.x === (invader === 'white' ? state.board.cells.length - 1 : 0)
          && u.position.y === (invader === 'white' ? state.board.cells.length - 1 : 0)))) continue;
      results.push(run({ id: pos.id, state }));
    } finally {
      setElementGraph('double-thick'); setUpkeepVariant('shipped'); resetCombatHandicap();
    }
  }

  const unsafe = results.flatMap(r => (r as { id: string; rows: { field: string; unsafe: boolean }[] }).rows
    .filter(x => x.unsafe).map(x => ({ id: (r as { id: string }).id, field: x.field })));
  const payload = { stamp: new Date().toISOString(), probes: results.length, unsafe, results };
  const text = JSON.stringify(payload, null, 2) + '\n';
  console.log(JSON.stringify({ probes: results.length, unsafeCount: unsafe.length, unsafe }, null, 2));
  if (out) { fs.mkdirSync(path.dirname(path.resolve(REPO, out)), { recursive: true }); fs.writeFileSync(path.resolve(REPO, out), text); }
}

main();
