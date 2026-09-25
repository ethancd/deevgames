import { getUnitDefinition } from '../src/game/units';
import { MICRO_ACTIONS_PER_TURN, MICRO_BOARD_SIZE, MICRO_CATALOGUE, MICRO_MAP, MICRO_MAP_RESOURCES, MICRO_RULES_REVISION, MICRO_TITLE } from '../src/game/micro';

/** Variant-neutral protocol sections taken from Prime's payload (passed in to avoid an import cycle). */
type Shared = Record<'summons' | 'workflow' | 'observers' | 'history' | 'restoreSeat', string> & { timeControl: object };

const catalogue = MICRO_CATALOGUE.map(getUnitDefinition);
const prices = catalogue.map(d => `${d.id} ${d.name} ${d.cost}`).join(', ');

/**
 * The agent-facing rules for MICRO MUJU rooms (`docs/MICRO_MUJU.md`). Built from
 * the canonical catalogue and map so stats and reserves cannot drift. Shared,
 * variant-neutral protocol sections (clocks, staging, observers, history, seats)
 * are reused from Prime's payload unchanged.
 */
export const microRulesFrom = (rules: Shared) => ({
  game: MICRO_TITLE,
  variant: 'micro' as const,
  ruleset: { name: 'phasing', variant: 'micro', revision: MICRO_RULES_REVISION, immutable: true },
  summary: `${MICRO_TITLE} is a smaller Muju Hono Irumbu: ${MICRO_BOARD_SIZE}×${MICRO_BOARD_SIZE} board, only Hi, Sjór and Muju with their normal stats and prices, ${MICRO_ACTIONS_PER_TURN} shared actions per turn, one attack per unit per turn (no Cleave), no promotions, no upkeep, no crystal handicap and no kill clock. Everything else follows the Phasing turn.`,
  board: `${MICRO_BOARD_SIZE}×${MICRO_BOARD_SIZE}. Columns A–F left to right, rows 1–6 top to bottom. White home A1; Black home F6. No perspective flipping. All board information is public.`,
  opening: 'White: Hi B1, Sjór B2, Muju A2. Black: Hi E6, Sjór E5, Muju F5. Both banks start at 0. White moves first. Both players start in Act.',
  resourceMap: { name: 'MICRO MUJU default', total: MICRO_MAP_RESOURCES, startingReserves: [...new Set(MICRO_MAP)].sort((a, b) => a - b),
    layout: Array.from({ length: MICRO_BOARD_SIZE }, (_, row) => MICRO_MAP.slice(row * MICRO_BOARD_SIZE, row * MICRO_BOARD_SIZE + MICRO_BOARD_SIZE)),
    note: 'layout[row][column]; row 0 is rank 1 (A1–F1). Zero-crystal squares are ordinary walkable, summonable ground. Use each observation’s reserves for current values.' },
  catalogue,
  actionsPerTurn: { default: MICRO_ACTIONS_PER_TURN, options: [MICRO_ACTIONS_PER_TURN], setting: 'Every MICRO MUJU game uses two shared actions per player turn.' },
  turn: ['Start: existing victory checks, then resolve all own pending summons simultaneously, heal/reset units, and Act.',
    `Act: spend up to ${MICRO_ACTIONS_PER_TURN} shared actions. Movement is orthogonal through empty cells; cost is ceil(path length / speed), and a unit may move again while actions remain. An attack targets an orthogonally adjacent enemy and costs 1.`,
    'END_ACTION_PHASE collects mining once (no upkeep is ever due). It does not hand off.',
    `Prepare (turn.phase=place): BUY_UNIT pays now and commits a public summon (${prices}). There is no PROMOTE_UNIT. END_PLACE_PHASE ends the full turn and hands over.`],
  combat: 'Attack ≥ remaining defense eliminates; otherwise damage lasts until the defender’s turn starts. Damage from several attackers adds up. No retaliation. Each unit may attack AT MOST ONCE per turn, even after a kill: there is no Cleave.',
  elements: 'Fire beats Plant, Plant beats Water, Water beats Fire. Advantage +1 attack; disadvantage −1, minimum 0.',
  summons: rules.summons,
  spawning: 'Where BUY_UNIT may place: an empty square inside one of your unblocked spawn rectangles. Every actual unit you own is an anchor; its rectangle spans from your home corner (White A1, Black F6) to the anchor’s square, inclusive. If any enemy unit stands anywhere inside a rectangle, that anchor is blocked. Pending summons never anchor or block. An enemy on your home corner blocks every rectangle. The same test runs again at arrival; a failed arrival refunds in full.',
  mining: 'At END_ACTION_PHASE each of your units takes min(its mining stat, the crystals left on its own square) from that square, whether or not it acted. Squares never refill.',
  upkeep: 'None. Every unit is tier 1 and tier 1 is free. PAY_UPKEEP and SET_UPKEEP_REVIEW are never needed.',
  promotion: 'None. PROMOTE_UNIT is always illegal in MICRO MUJU.',
  victory: 'Eliminate every actual enemy unit (pending summons do not postpone elimination; losing your last unit loses immediately whatever your bank), or occupy the enemy home and still be there at the start of your next turn (checked before arrivals and healing). Resignation or timeout loses. There is NO kill clock, inactivity draw, mined-total verdict, move limit or repetition draw: if nobody wins, the game continues.',
  checkmate: 'After your mining, if your unit occupies the enemy home and the defender has no legal two-action reply that removes it, you win immediately by home checkmate. The defender’s rescue uses its actual army after healing; home occupation prevents all pending arrivals. No clock can suppress a checkmate. If checkmate ends a muju_play batch, remaining commands are skipped.',
  analysis: 'Hosted analysis (muju_analyze, briefing:true) is not available for MICRO MUJU rooms and returns ANALYSIS_UNAVAILABLE. Use muju_legal_actions (with move costs and attack outcomes) and muju_preview.',
  workflow: rules.workflow,
  undo: 'Send UNDO alone via muju_play to reverse the latest command in this full turn. Repeat while canUndo is true. Mining belongs to the reversible END_ACTION_PHASE command. Undo never crosses END_PLACE_PHASE, reverses the opponent’s turn or reopens a finished game.',
  timeControl: rules.timeControl,
  observers: rules.observers,
  history: rules.history,
  restoreSeat: rules.restoreSeat,
  create: 'Create with muju_create_room and variant:"micro" (omit actionsPerTurn and blackCrystalHandicap), or host from the browser at /muju/micro/ → Play online.',
  endTurnAction: 'END_PLACE_PHASE' as const,
});
