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
const reserves = [...new Set(UNEQUAL_ROUTES_MAP)].sort((a,b)=>a-b);
const getPages = (actionsPerTurn: ActionsPerTurn) => [
  {title:'Playing on a phone', content:<>
    <p>In vs AI setup, choose White or Black under Play as. White moves first; when you choose Black, the AI opens the game.</p>
    <p>Tap one of your pieces, then an empty reachable square to move immediately. Undo can reverse moves within your turn in local games. Shared online moves are final.</p>
    <p>Tap a reachable enemy to preview the shortest route to an adjacent square and the attack together. Confirm attack commits both; Cancel spends nothing. To choose your landing square, tap it to move there; the attack stays selected if it is still legal.</p>
    <p>In Place, tap a tier-1 unit in the shop, then a highlighted empty square to buy it. Tap a piece already on the board to promote it.</p>
    <p>Tap an enemy you cannot attack to inspect it with reach already on. Hide reach toggles off its movement range and red attack frontier: up to {actionsPerTurn - 1} move actions plus 1 attack at its current speed. Blockers and board edges limit the frontier; dots show attack reach, not guaranteed kills. Key explains the board; Units opens the full catalogue.</p>
  </>},
  {title:'Win the game', content:<>
    <p>Hold the enemy home corner until the start of your next turn, or eliminate every enemy piece. If no legal reply can remove the invader, checkmate wins immediately. Otherwise the defender gets one turn to clear it. An empty army loses even with crystals in the bank.</p>
    <p>The {BOARD_SIZE}×{BOARD_SIZE} board starts with {INITIAL_MAP_RESOURCES} crystals. Each side begins with Hi, Sjor and Muju, and no crystals in the bank. White moves first.</p>
    <p>After {INACTIVITY_LIMIT} consecutive completed player turns without an enemy kill by attack, the game is a draw. Only an attack kill resets the clock; income, movement, purchases, promotions and upkeep losses do not. The draw is checked at turn end, before the next home check.</p>
  </>},
  {title:'Two phases: Place · Act', content:<>
    <p>At turn start, resolve home occupation and elimination, pay upkeep, then heal your pieces and reset their turn flags.</p>
    <p><strong>Place:</strong> buy tier-1 pieces and promote existing pieces, in any order. Buying and promoting cost crystals, with no action cost. Skip an empty Place phase automatically.</p>
    <p><strong>Act:</strong> spend up to {actionsPerTurn} shared actions on movement and attacks. You can finish early.</p>
    <p>At turn end, every friendly piece collects crystals from its square. Then update the quiet-turn clock and hand over to the opponent. Undo stays within the turn; collected turn-end income cannot be undone.</p>
  </>},
  {title:'Movement', content:<>
    <p>Move orthogonally through empty squares. One action moves a piece up to its Speed. Longer moves cost the shortest path length divided by Speed, rounded up. Pieces cannot pass through other pieces.</p>
    <p>{hi.name} has Speed {hi.speed}. Moving three squares costs {Math.ceil(3/hi.speed)} actions. A piece with positive Speed may move repeatedly while shared actions remain. Yan has Speed 0: it cannot move, but can attack adjacent enemies and promote to gain movement.</p>
  </>},
  {title:'Combat & Cleave', content:<>
    <p>Attack an orthogonally adjacent enemy for one action. Attack reduces its remaining Defense; reaching zero eliminates it. There is no retaliation. Damage accumulates until the damaged unit’s next turn and heals at the start of the damaged piece’s own turn.</p>
    <p>A piece begins with one attack. Its own killing blow unlocks another, up to its tier: at most 1 / 2 / 3 attacks. A surviving target ends that piece’s attack chain. It cannot attack the same target twice in one turn.</p>
    <p>You may move between attacks, paying the usual action cost. Newly bought and promoted pieces act immediately.</p>
  </>},
  {title:'Elements', content:<>
    <p>Fire and Lightning beat Plant and Metal; Plant and Metal beat Water and Shadow; Water and Shadow beat Fire and Lightning.</p>
    <p>Advantage adds 1 Attack. Disadvantage subtracts 1, with a floor of zero. Elements in the same pair are neutral. Attack previews include the modifier.</p>
  </>},
  {title:'Mining at turn end', content:<>
    <p><strong>At the end of your turn, every one of your units takes crystals from the square it stands on: up to its Mining stat, up to what the square holds.</strong></p>
    <p>The square has one number: its remaining reserve. Starting reserves are {reserves.join(' / ')}. Subtract the crystals taken; they do not return. Mining 0 takes nothing.</p>
    <p>{miner.name} has Mining {miner.mining}: on a square holding 8 it takes {Math.min(miner.mining,8)}, leaving {8-Math.min(miner.mining,8)}. Moving, attacking, being bought or being promoted does not stop income.</p>
    <p>The projected-income readout updates as your pieces move. Income enters your public bank at turn end, ready for next turn’s upkeep and purchases.</p>
  </>},
  {title:'Buying & spawn rectangles', content:<>
    <p>Buy any number of tier-1 pieces during Place, limited by crystals and legal empty squares. Choose from {UNIT_DEFINITIONS.filter(d=>d.tier===1).map(d=>`${d.name} (${d.cost})`).join(', ')}.</p>
    <p>Each friendly piece anchors a rectangle from your home corner to its square, including the edges. You may buy on any empty square in any unblocked rectangle. One enemy anywhere inside a rectangle blocks that entire rectangle.</p>
    <p>An invader on your home corner blocks every rectangle. Clear it during Act to restore buying on a later turn. Pieces bought in Place can move and attack immediately.</p>
  </>},
  {title:'Promotion climb', content:<>
    <p>Tier 2 and tier 3 come only from promoting a tier-1 piece on the board. During Place, promote to the next tier of the same element: 4 crystals to tier 2, then 8 crystals to tier 3.</p>
    <p>Each piece can promote at most once per turn. A piece bought this turn cannot promote this turn. Tier 3 is terminal. Other pieces of the same element are not required.</p>
    <p>Buy {hi.name} for {hi.cost}; on a later turn promote to {hono.name} for {hono.cost-hi.cost}; on another turn promote to {kagari.name} for {kagari.cost-hono.cost}. Promoted pieces act immediately and use their new Mining stat at turn end.</p>
  </>},
  {title:'Upkeep & public economy', content:<>
    <p>At your turn start, tier 1 costs {UPKEEP_BY_TIER[1]}, tier 2 costs {UPKEEP_BY_TIER[2]} and tier 3 costs {UPKEEP_BY_TIER[3]} crystals per piece. You pay from your bank after last turn’s income. A newly promoted piece first owes its new rent next turn.</p>
    <p>If you cannot afford the army, choose an affordable set to keep. Tier-1 pieces always stay. You may enable upkeep review to release tier-2/3 pieces voluntarily. Releases do not count as attack kills.</p>
    <p>Both banks, all pieces, reserves, purchases and promotions are public.</p>
  </>},
  {title:'Read the board', content:<VisualKey />},
  {title:'Keyboard controls', content:<>
    <p>Tab cycles every piece: yours first, then your opponent’s, each in A–J then 1–10 order; Shift+Tab goes back. N cycles only your pieces. Arrow keys prepare movement; a full Speed of steps commits automatically. Escape cancels pending movement, then clears the selection. Enter completes the phase and Command/Ctrl+Z undoes within the current turn, wherever focus rests; in the upkeep choice, Enter pays for the checked pieces.</p>
    <p>During Place, 1–6 or A S D F G H select a tier-1 purchase by element (Fire, Lightning, Water, Shadow, Plant, Metal); click an empty highlighted square to buy. P promotes the selected eligible piece. Space operates a focused button.</p>
    <p>U opens and closes the unit guide. Inside it, 1–3 choose the tier, A S D F G H choose the element, and Tab steps through every piece from tier 1 upward.</p>
  </>},
];

export function InstructionsModal({isOpen,onClose,actionsPerTurn=DEFAULT_ACTIONS_PER_TURN,phasing=false}: {isOpen:boolean;onClose:()=>void;actionsPerTurn?:ActionsPerTurn;phasing?:boolean}) {
  const [page,setPage]=useState(0);
  const standard=getPages(actionsPerTurn);
  const pages=phasing ? [
    {title:'Phasing · experimental rules', content:<>
      <p>All pieces, pending summons, and both banks are public. Play with another person locally or online. AI uses Standard rules.</p>
      <p>Start each turn by resolving your pending summons, then heal your units and take up to {actionsPerTurn} actions. Both players begin the game in Act, even with a Black crystal handicap.</p>
      <p>Choose Mine & prepare to collect mining and pay upkeep. Then promote pieces and commit new summons. Choose End turn to hand over. Mining is collected only once.</p>
    </>},
    standard[1],
    {title:'Commit a summon', content:<>
      <p>In Prepare, choose a tier-1 piece and an empty square in a legal spawn rectangle. Pay its full price now. You can commit several summons, but only one of yours per square.</p>
      <p>Each actual friendly piece anchors a rectangle from your home corner to its square. Any enemy inside blocks that rectangle. Pending summons cannot anchor or block rectangles.</p>
      <p>The dashed piece shows its owner, element and type. It cannot act, mine, promote, be attacked, occupy home, or keep an otherwise eliminated army alive. Anyone may move through or onto its square.</p>
    </>},
    {title:'Arrival or full refund', content:<>
      <p>At the start of your next turn, check every pending summon against the board as it stands. If its square is empty and in any legal friendly spawn rectangle, it materializes. Otherwise it is removed and its entire original price is refunded.</p>
      <p>Check all summons together. New arrivals cannot support one another. Walking through a square or temporarily blocking a rectangle does not disrupt a summon if the position is legal at arrival.</p>
      <p>Arrivals can move and attack that turn, and promote during its Prepare phase. Existing home-occupation and elimination wins resolve before arrivals.</p>
    </>},
    standard[3],
    {title:'Combat & Cleave',content:<>
      <p>Attack an orthogonally adjacent enemy for one action. Damage accumulates until that enemy’s next turn; reaching zero defense eliminates it. There is no retaliation. Pending summons cannot be attacked.</p>
      <p>A killing blow unlocks another attack, up to the attacker’s tier: 1 / 2 / 3 attacks. A surviving target ends the chain. A piece cannot attack the same target twice in one turn.</p>
      <p>Move between attacks if actions remain. Units arriving at turn start can act immediately. End-of-turn promotions cannot attack until their next turn.</p>
    </>},
    standard[5],
    {title:'Mine, then pay upkeep',content:<>
      <p>After actions, every actual friendly piece takes up to its Mining stat from its square’s remaining reserve. Pending summons take nothing. Deposits never replenish.</p>
      <p>Then pay upkeep: tier 1 is free, tier 2 costs 1, tier 3 costs 2. This turn’s income can fund the payment. If unaffordable, choose higher-tier pieces to release; tier 1 always stays.</p>
      <p>Upkeep review can be enabled in the menu. Affordable payments otherwise happen automatically. Newly promoted pieces pay their new rate after mining on their next turn.</p>
    </>},
    {title:'End-of-turn promotions',content:<>
      <p>After mining and upkeep, promote any materialized piece once: 4 crystals to tier 2, or 8 to tier 3. A piece that arrived this turn is eligible. Pending summons are not.</p>
      <p>New stats apply immediately during the opponent’s reply. Mining and actions have already finished, so there is no extra mining or attack. Promotions and new summons can be chosen in either order.</p>
    </>},
    {title:'Controls & undo',content:<>
      <p>Tap a piece and a reachable square to move. Tap a reachable enemy to preview an attack, then confirm. In Prepare, select a shop piece and its highlighted square to summon, or tap an existing piece to promote.</p>
      <p>Enter completes the current phase; Command/Ctrl+Z undoes within your turn. Mine & prepare is reversible until handoff. Undo never reverses your opponent’s turn.</p>
      <p>The {INACTIVITY_LIMIT}-turn quiet clock and the online time delay advance only at End turn, after preparation. Summoning, refunds and promotions do not reset the quiet clock.</p>
    </>},
    standard[10],
  ] : standard;
  if(!isOpen)return null;
  return <PlayDialog title="How to play" onClose={onClose}>
    <div className="help-body"><h3>{pages[page].title}</h3><div className="tutorial-copy">{pages[page].content}</div></div>
    <div className="help-navigation"><button disabled={page===0} onClick={()=>setPage(page-1)}>← Previous</button><span>{page+1} / {pages.length}</span><button disabled={page===pages.length-1} onClick={()=>setPage(page+1)}>Next →</button></div>
  </PlayDialog>;
}
