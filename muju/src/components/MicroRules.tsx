import { getUnitDefinition } from '../game/units';
import { MICRO_ACTIONS_PER_TURN, MICRO_BOARD_SIZE, MICRO_CATALOGUE, MICRO_MAP, MICRO_MAP_RESOURCES } from '../game/micro';
import { UnitArtwork } from './UnitArtwork';
import { VisualKey } from './VisualKey';

const pieces = MICRO_CATALOGUE.map(getUnitDefinition);
const reserves = [...new Set(MICRO_MAP)].sort((a, b) => a - b);

/** The three pieces, straight from the canonical catalogue. */
export function MicroPieceTable() {
  return <table className="micro-piece-table">
    <thead><tr><th>Piece</th><th>ATK</th><th>DEF</th><th>SPD</th><th>Mine</th><th>Price</th></tr></thead>
    <tbody>{pieces.map(d => <tr key={d.id}>
      <th scope="row"><span className="micro-piece-name"><UnitArtwork element={d.element} owner="white" tier={1} /> {d.name} <small>{d.element}</small></span></th>
      <td>{d.attack}</td><td>{d.defense}</td><td>{d.speed}</td><td>{d.mining}</td><td>◆ {d.cost}</td>
    </tr>)}</tbody>
  </table>;
}

/** Short rules for the landing page. */
export function MicroRulesSummary() {
  return <ul className="micro-rules-summary">
    <li>{MICRO_BOARD_SIZE}×{MICRO_BOARD_SIZE} board. White’s home is A1, Black’s is F6. White moves first; both banks start empty.</li>
    <li><b>{MICRO_ACTIONS_PER_TURN} shared actions</b> a turn: move (repeatable) or attack an adjacent enemy.</li>
    <li>Each piece attacks <b>at most once per turn</b>, even after a kill. No Cleave.</li>
    <li>Only Hi, Sjór and Muju. No promotions, no upkeep.</li>
    <li>After acting, your pieces mine automatically. Then summon for next turn, and hand over the device.</li>
    <li>Win by holding the enemy home until your next turn, by home checkmate, or by eliminating every enemy piece. No clock, and no draw by time.</li>
  </ul>;
}

export const MICRO_PAGES = [
  { title: 'MICRO MUJU', content: <>
    <p>A smaller Muju Hono Irumbu on a {MICRO_BOARD_SIZE}×{MICRO_BOARD_SIZE} board, for two players on one device. The pieces are unchanged from the full game. Some things are simply left out.</p>
    <p>White starts with Hi on B1, Sjór on B2 and Muju on A2. Black starts with Hi on E6, Sjór on E5 and Muju on F5. Nobody starts with crystals. White moves first.</p>
    <p>The map holds {MICRO_MAP_RESOURCES} crystals, with reserves of {reserves.join(' / ')} per square. Empty squares are ordinary ground: walk on them and summon onto them.</p>
  </> },
  { title: 'Your turn', content: <>
    <p>At the start of your turn your pending summons arrive (or are refunded) and your pieces heal. Then take up to {MICRO_ACTIONS_PER_TURN} shared actions.</p>
    <p>Choose Mine &amp; prepare: every piece you have takes up to its Mining stat from its square. This costs no action. Then commit summons, and choose End turn to hand the device over.</p>
    <p>Undo works throughout your own turn, including Mine &amp; prepare, until you end it.</p>
  </> },
  { title: 'The three pieces', content: <>
    <MicroPieceTable />
    <p>These are the only pieces. You can’t promote them, and as tier 1 pieces they pay no upkeep.</p>
  </> },
  { title: 'Moving and fighting', content: <>
    <p>One action moves a piece up to its Speed, orthogonally through empty squares. A piece may move again while actions remain.</p>
    <p>One action attacks an orthogonally adjacent enemy. <b>Each piece attacks at most once per turn, even after a kill.</b> Damage from several attackers adds up. A piece is eliminated when its defense reaches zero. There is no retaliation, and damaged pieces heal fully at the start of their owner’s turn.</p>
    <p>Fire beats Plant, Plant beats Water, Water beats Fire: +1 attack with advantage, −1 against it (never below zero). Attack previews include this.</p>
  </> },
  { title: 'Summoning', content: <>
    <p>In Prepare, pick Hi, Sjór or Muju, pay its price and choose an empty square. Each of your pieces anchors a rectangle from your home corner to its square. An enemy anywhere inside blocks that rectangle.</p>
    <p>The summon is public and arrives at the start of your next turn if the square is still empty and inside an unblocked rectangle. It may act that turn. Otherwise it is refunded in full.</p>
    <p>A pending summon is not a piece: it cannot anchor, block, mine, fight, or keep your army alive.</p>
  </> },
  { title: 'Winning', content: <>
    <p>Occupy the enemy home (A1 or F6) and still be there at the start of your next turn: you win, before any arrivals or healing.</p>
    <p>If the defender has no legal way to remove the invader on their reply, it is home checkmate and you win at once.</p>
    <p>Losing your last piece loses immediately, whatever is in your bank or phasing in.</p>
    <p>There is no clock, kill counter or draw by time. If nobody wins, the game goes on.</p>
  </> },
  { title: 'Read the board', content: <VisualKey /> },
];
