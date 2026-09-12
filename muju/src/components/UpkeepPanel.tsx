import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../game/types';
import { getUnitDefinition } from '../game/units';
import { unitUpkeep } from '../game/upkeep';

export function UpkeepPanel({state,onConfirm,disabled=false}:{state:GameState;onConfirm:(ids:string[])=>void;disabled?:boolean}) {
  const units=state.board.units.filter(u=>u.owner===state.turn.currentPlayer);
  const [kept,setKept]=useState(()=>units.map(u=>u.id));
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();return ()=>dialog.current?.close();},[]);
  const cost=units.filter(u=>kept.includes(u.id)).reduce((sum,u)=>sum+unitUpkeep(u),0);
  const cash=state.players[state.turn.currentPlayer].resources;
  return <dialog ref={dialog} className="play-dialog upkeep-dialog" aria-label="Choose upkeep" aria-busy={disabled} onCancel={e=>e.preventDefault()}>
    <div className="dialog-content"><h2>Choose units to keep</h2>
      <p>Pay upkeep before healing and placement. Tier 1 units always stay and cannot be released. Unchecked higher-tier units leave the board. This costs no actions.</p>
      <div className="upkeep-list">{units.map(u=>{const d=getUnitDefinition(u.definitionId);return <label key={u.id}>
        <input type="checkbox" disabled={disabled||d.tier===1} checked={kept.includes(u.id)} onChange={e=>setKept(e.target.checked?[...kept,u.id]:kept.filter(id=>id!==u.id))}/>
        <span>{d.name} <small>T{d.tier} · {String.fromCharCode(65+u.position.x)}{u.position.y+1}{d.tier===1 ? ' · Always kept' : ''}</small></span><b>◆ {unitUpkeep(u)}</b>
      </label>;})}</div>
      <p role="status" className={cost>cash?'rent-warning':''}>Upkeep {cost} / {cash} crystals · {units.length-kept.length} released</p>
      <button className="primary" disabled={disabled||cost>cash} onClick={()=>onConfirm(kept)}>{disabled ? 'Confirming upkeep…' : 'Pay upkeep & continue'}</button>
    </div>
  </dialog>;
}
