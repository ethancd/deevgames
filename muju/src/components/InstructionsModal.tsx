import { useState } from 'react';
import { PlayDialog } from './PlayDialog';
import { VisualKey } from './VisualKey';
import { UNIT_DEFINITIONS, getUnitDefinition } from '../game/units';
import { BOARD_SIZE, MAX_ACTIONS_PER_TURN } from '../game/board';
import { INITIAL_MAP_RESOURCES, UNEQUAL_ROUTES_MAP } from '../game/resourceMap';
import { INACTIVITY_LIMIT } from '../game/inactivity';
import { UPKEEP_BY_TIER } from '../game/upkeep';

const hi = getUnitDefinition('fire_1');
const hono = getUnitDefinition('fire_2');
const kagari = getUnitDefinition('fire_3');
const miner = getUnitDefinition('plant_2');
const reserves = [...new Set(UNEQUAL_ROUTES_MAP)].sort((a,b)=>a-b);
const pages = [
  {title:'Playing on a phone', content:<>
    <p>Tap one of your pieces, then a destination. Check the action cost and its end-of-turn income, then confirm. Cancel keeps the piece where it is.</p>
    <p>In Place, tap a tier-1 unit in the shop, then a highlighted empty square to buy it. Tap a piece already on the board to promote it.</p>
    <p>Tap an enemy to inspect its stats and movement reach. Key explains the board; Units opens the full catalogue.</p>
  </>},
  {title:'Win the game', content:<>
    <p>Hold the enemy home corner until the start of your next turn, or eliminate every enemy piece. The defender gets one turn to clear an invader. An empty army loses even with crystals in the bank.</p>
    <p>The {BOARD_SIZE}×{BOARD_SIZE} board starts with {INITIAL_MAP_RESOURCES} crystals. Each side begins with Hi, Sjor and Muju, and no crystals in the bank. White moves first.</p>
    <p>After {INACTIVITY_LIMIT} consecutive completed player turns with neither an enemy kill by attack nor any income, the game is a draw. Income or an attack kill resets the clock. The draw is checked at turn end, before the next home check.</p>
  </>},
  {title:'Two phases: Place · Act', content:<>
    <p>At turn start, resolve home occupation and elimination, pay upkeep, then heal your pieces and reset their turn flags.</p>
    <p><strong>Place:</strong> buy tier-1 pieces and promote existing pieces, in any order. Buying and promoting cost crystals, with no action cost. Skip an empty Place phase automatically.</p>
    <p><strong>Act:</strong> spend up to {MAX_ACTIONS_PER_TURN} shared actions on movement and attacks. You can finish early.</p>
    <p>At turn end, every friendly piece collects crystals from its square. Then update the quiet-turn clock and hand over to the opponent. Undo stays within the turn; collected turn-end income cannot be undone.</p>
  </>},
  {title:'Movement', content:<>
    <p>Move orthogonally through empty squares. One action moves a piece up to its Speed. Longer moves cost the shortest path length divided by Speed, rounded up. Pieces cannot pass through other pieces.</p>
    <p>{hi.name} has Speed {hi.speed}. Moving three squares costs {Math.ceil(3/hi.speed)} actions. A piece may move repeatedly while shared actions remain.</p>
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
    <p>Tier 2 and tier 3 come only from promoting a tier-1 piece on the board. During Place, promote to the next tier of the same element, paying the cost difference.</p>
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
    <p>N cycles your pieces. Arrow keys prepare movement; a full Speed of steps commits automatically. Escape cancels pending movement. Enter completes the phase. Command/Ctrl+Z undoes within the current turn.</p>
    <p>During Place, 1–6 select a tier-1 purchase by element; click an empty highlighted square to buy. U promotes the selected eligible piece. Tab and Enter also operate the buttons.</p>
  </>},
];

export function InstructionsModal({isOpen,onClose}: {isOpen:boolean;onClose:()=>void}) {
  const [page,setPage]=useState(0);
  if(!isOpen)return null;
  return <PlayDialog title="How to play" onClose={onClose}>
    <div className="help-body"><h3>{pages[page].title}</h3><div className="tutorial-copy">{pages[page].content}</div></div>
    <div className="help-navigation"><button disabled={page===0} onClick={()=>setPage(page-1)}>← Previous</button><span>{page+1} / {pages.length}</span><button disabled={page===pages.length-1} onClick={()=>setPage(page+1)}>Next →</button></div>
  </PlayDialog>;
}
