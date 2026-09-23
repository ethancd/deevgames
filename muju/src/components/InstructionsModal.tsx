import { useState } from 'react';
import type { ActionsPerTurn } from '../game/types';
import { DEFAULT_ACTIONS_PER_TURN } from '../game/rules';
import { PlayDialog } from './PlayDialog';
import { VisualKey } from './VisualKey';
import { UNIT_DEFINITIONS, getUnitDefinition } from '../game/units';
import { BOARD_SIZE } from '../game/board';
import { INITIAL_MAP_RESOURCES, UNEQUAL_ROUTES_MAP } from '../game/resourceMap';
import { INACTIVITY_LIMIT } from '../game/inactivity';
import { UPKEEP_BY_TIER } from '../game/upkeep';

const hi = getUnitDefinition('fire_1');
const hono = getUnitDefinition('fire_2');
const kagari = getUnitDefinition('fire_3');
const miner = getUnitDefinition('plant_2');
const metal1 = getUnitDefinition('metal_1');
const reserves = [...new Set(UNEQUAL_ROUTES_MAP)].sort((a,b)=>a-b);
/**
 * ONE DECK. Until 2026-09-21 this file carried two page sets — a Standard deck
 * and a Phasing deck that reused four of its pages — and the `phasing` prop
 * chose between them. Standard is retired, so the Phasing deck IS the deck: the
 * pages that were only ever true under the old Place-first turn (buying during
 * Place, promoting during Place, upkeep at turn start) are gone, and the two
 * ruleset-neutral practical pages the Phasing deck never had (the phone page
 * and the keyboard page) are folded in with their Place lines rewritten as
 * Prepare.
 */
const getPages = (actionsPerTurn: ActionsPerTurn) => [
  {title:'Your turn', content:<>
    <p>All pieces, pending summons and both banks are public. Play against the AI, another person on this device, or online.</p>
    <p>Start each turn by resolving your pending summons, then heal your units and take up to {actionsPerTurn} actions. Both players begin the game in Act, even with a Black crystal handicap.</p>
    <p>Choose Mine &amp; prepare to collect mining and pay upkeep. Then promote pieces and commit new summons. Choose End turn to hand over. Mining is collected only once.</p>
  </>},
  {title:'Playing on a phone', content:<>
    <p>In vs AI setup, choose White or Black under Play as. White moves first; when you choose Black, the AI opens the game.</p>
    <p>Tap one of your pieces, then an empty reachable square to move immediately. Undo can reverse moves within your turn in local games. Shared online moves are final.</p>
    <p>Tap a reachable enemy to preview the shortest route to an adjacent square and the attack together. Confirm attack commits both; Cancel spends nothing. To choose your landing square, tap it to move there; the attack stays selected if it is still legal.</p>
    <p>In Prepare, tap a tier-1 unit in the shop, then a highlighted empty square to commit a summon. Tap a piece already on the board to promote it.</p>
    <p>Tap an enemy you cannot attack to inspect it with reach already on. Hide reach toggles off its movement range and red attack frontier: up to {actionsPerTurn - 1} move actions plus 1 attack at its current speed. Blockers and board edges limit the frontier; the dots themselves just show attack reach. A separate KO badge marks an actual single-attack elimination: ☠ on an enemy your selected unit could eliminate with its next attack, ⚠ on one of your own units the inspected enemy could eliminate on its next turn. Key explains the board; Units opens the full catalogue.</p>
  </>},
  {title:'Win the game', content:<>
    <p>Hold the enemy home corner until the start of your next turn, or eliminate every enemy piece. If no legal reply can remove the invader, checkmate wins immediately — unless the kill clock below would end the game first, in which case no checkmate is called and the defender gets its reply. Otherwise the defender gets one turn to clear it. An empty army loses even with crystals in the bank.</p>
    <p>The {BOARD_SIZE}×{BOARD_SIZE} board starts with {INITIAL_MAP_RESOURCES} crystals. Each side begins with Hi, Sjór and Muju, and no crystals in the bank. White moves first.</p>
    <p>After {INACTIVITY_LIMIT} consecutive completed player turns without an enemy kill by attack, the kill clock ends the game: whoever has mined more crystals in total wins (Black's starting handicap counts toward its total); an equal total is a draw. Only an attack kill resets the clock; income, movement, purchases, promotions and upkeep losses do not. The clock is checked at turn end, before the next home check.</p>
  </>},
  {title:'Commit a summon', content:<>
    <p>In Prepare, choose a tier-1 piece and an empty square in a legal spawn rectangle. Pay its full price now. You can commit several summons, but only one of yours per square. Choose from {UNIT_DEFINITIONS.filter(d=>d.tier===1).map(d=>`${d.name} (${d.cost})`).join(', ')}.</p>
    <p>Each actual friendly piece anchors a rectangle from your home corner to its square. Any enemy inside blocks that rectangle. An invader on your home corner blocks every rectangle. Pending summons cannot anchor or block rectangles.</p>
    <p>The dashed piece shows its owner, element and type. It cannot act, mine, promote, be attacked, occupy home, or keep an otherwise eliminated army alive. Anyone may move through or onto its square.</p>
  </>},
  {title:'Arrival or full refund', content:<>
    <p>At the start of your next turn, check every pending summon against the board as it stands. If its square is empty and in any legal friendly spawn rectangle, it materializes. Otherwise it is removed and its entire original price is refunded.</p>
    <p>Check all summons together. New arrivals cannot support one another. Walking through a square or temporarily blocking a rectangle does not disrupt a summon if the position is legal at arrival.</p>
    <p>Arrivals can move and attack that turn, and promote during its Prepare phase. Existing home-occupation and elimination wins resolve before arrivals.</p>
  </>},
  {title:'Movement', content:<>
    <p>Move orthogonally through empty squares. One action moves a piece up to its Speed. Longer moves cost the shortest path length divided by Speed, rounded up. Pieces cannot pass through other pieces.</p>
    <p>{hi.name} has Speed {hi.speed}. Moving three squares costs {Math.ceil(3/hi.speed)} actions. A piece with positive Speed may move repeatedly while shared actions remain. {metal1.name} has Speed {metal1.speed}: it cannot move, but can attack adjacent enemies and promote to gain movement.</p>
  </>},
  {title:'Combat & Cleave',content:<>
    <p>Attack an orthogonally adjacent enemy for one action. Damage accumulates until that enemy’s next turn; reaching zero defense eliminates it. There is no retaliation. Pending summons cannot be attacked.</p>
    <p>A killing blow unlocks another attack by the same piece, at any tier, as long as shared actions remain. A surviving target ends the chain. A piece cannot attack the same target twice in one turn.</p>
    <p>Move between attacks if actions remain. Units arriving at turn start can act immediately. End-of-turn promotions cannot attack until their next turn.</p>
  </>},
  {title:'Elements', content:<>
    <p>Fire and Lightning beat Plant and Metal; Plant and Metal beat Water and Shadow; Water and Shadow beat Fire and Lightning.</p>
    <p>Advantage adds 1 Attack. Disadvantage subtracts 1, with a floor of zero. Elements in the same pair are neutral. Attack previews include the modifier.</p>
  </>},
  {title:'Mine, then pay upkeep',content:<>
    <p>After actions, every actual friendly piece takes up to its Mining stat from its square’s remaining reserve. Pending summons take nothing. Deposits never replenish. Starting reserves are {reserves.join(' / ')}; {miner.name} has Mining {miner.mining}, so on a square holding 8 it takes {Math.min(miner.mining,8)}, leaving {8-Math.min(miner.mining,8)}.</p>
    <p>Then pay upkeep: tier 1 is free, tier 2 costs {UPKEEP_BY_TIER[2]}, tier 3 costs {UPKEEP_BY_TIER[3]}. This turn’s income can fund the payment. If unaffordable, choose higher-tier pieces to release; tier 1 always stays. Releases do not count as attack kills.</p>
    <p>Upkeep review can be enabled in the menu. Affordable payments otherwise happen automatically. Newly promoted pieces pay their new rate after mining on their next turn.</p>
  </>},
  {title:'End-of-turn promotions',content:<>
    <p>After mining and upkeep, promote any materialized piece once to the next tier of the same element: 4 crystals to tier 2, or 8 to tier 3. A piece that arrived this turn is eligible. Pending summons are not. Tier 3 is terminal.</p>
    <p>Buy {hi.name} for {hi.cost}; on a later turn promote to {hono.name} for {hono.cost-hi.cost}; on another turn promote to {kagari.name} for {kagari.cost-hono.cost}. Other pieces of the same element are not required.</p>
    <p>New stats apply immediately during the opponent’s reply. Mining and actions have already finished, so there is no extra mining or attack. Promotions and new summons can be chosen in either order.</p>
  </>},
  {title:'Controls & undo',content:<>
    <p>Tap a piece and a reachable square to move. Tap a reachable enemy to preview an attack, then confirm. In Prepare, select a shop piece and its highlighted square to summon, or tap an existing piece to promote.</p>
    <p>Enter completes the current phase; Command/Ctrl+Z undoes within your turn. Mine &amp; prepare is reversible until handoff. Undo never reverses your opponent’s turn.</p>
    <p>The {INACTIVITY_LIMIT}-turn kill clock and the online time delay advance only at End turn, after preparation. Summoning, refunds and promotions do not reset the kill clock.</p>
  </>},
  {title:'Read the board', content:<VisualKey />},
  {title:'Keyboard controls', content:<>
    <p>Tab cycles every piece: yours first, then your opponent’s, each in 1–10 then A–J order; Shift+Tab goes back. N cycles only your pieces. Arrow keys prepare movement; a full Speed of steps commits automatically. Escape cancels pending movement, then clears the selection. Enter completes the phase and Command/Ctrl+Z undoes within the current turn, wherever focus rests; in the upkeep choice, Enter pays for the checked pieces.</p>
    <p>During Prepare, 1–6 or A S D F G H select a tier-1 summon by element (Fire, Lightning, Water, Shadow, Plant, Metal); click an empty highlighted square to commit it. P promotes the selected eligible piece. Space operates a focused button.</p>
    <p>U opens and closes the unit guide. Inside it, 1–3 choose the tier, A S D F G H choose the element, and Tab steps through every piece from tier 1 upward.</p>
  </>},
];

/** `phasing` is accepted and ignored: `GameScreen` still passes it and every
 * live game is Phasing, so there is nothing left for it to select. */
export function InstructionsModal({isOpen,onClose,actionsPerTurn=DEFAULT_ACTIONS_PER_TURN}: {isOpen:boolean;onClose:()=>void;actionsPerTurn?:ActionsPerTurn;phasing?:boolean}) {
  const [page,setPage]=useState(0);
  const pages=getPages(actionsPerTurn);
  if(!isOpen)return null;
  return <PlayDialog title="How to play" onClose={onClose}>
    <div className="help-body"><h3>{pages[page].title}</h3><div className="tutorial-copy">{pages[page].content}</div></div>
    <div className="help-navigation"><button disabled={page===0} onClick={()=>setPage(page-1)}>← Previous</button><span>{page+1} / {pages.length}</span><button disabled={page===pages.length-1} onClick={()=>setPage(page+1)}>Next →</button></div>
  </PlayDialog>;
}
