import type { GameState } from '../game/types';
import { getUnitDefinition } from '../game/units';
import { isValidSpawnPosition } from '../game/spawning';
import { historySquare } from '../game/moveHistory';
import { ElementIcon } from './ElementGlyph';

export function SummoningStatus({ state, onInspect }: { state: GameState; onInspect?: (id: string) => void }) {
  const pending = state.pendingSummons ?? [], result = state.lastSummoning;
  return <section className="summoning-status" aria-label="Phasing summons">
    {result && (!!result.summoned.length || !!result.disrupted.length) && <p role="status" title={`${result.player} arrival: ${result.summoned.length} summoned; ${result.disrupted.map(s => `${getUnitDefinition(s.definitionId).name} at ${historySquare(s.position)} disrupted, refunded ${s.cost}`).join("; ")}`}>
      {result.player === 'white' ? 'White' : 'Black'} arrival · {result.summoned.length} summoned
      {result.disrupted.length > 0 && ` · ${result.disrupted.map(s => `${getUnitDefinition(s.definitionId).name} at ${historySquare(s.position)}`).join(', ')} disrupted · refunded ${result.disrupted.reduce((n, s) => n + s.cost, 0)} ◆`}
    </p>}
    {(!!pending.length || !!result?.summoned.length || !!result?.disrupted.length) && <details><summary>{pending.length ? `◌ Phasing in · ${pending.length}` : 'Arrival details'}</summary>
      {result && <p>{result.player === 'white' ? 'White' : 'Black'} arrival · {result.summoned.length} summoned · {result.disrupted.map(s => `${getUnitDefinition(s.definitionId).name} at ${historySquare(s.position)} disrupted · refunded ${s.cost} ◆`).join('; ')}</p>}
      <p>Dashed pieces are commitments, not occupants. They arrive at their owner's next turn. Legality is checked then.</p>
      <ul>{pending.map(s => {
        const d = getUnitDefinition(s.definitionId), valid = isValidSpawnPosition(s.position, s.owner, state.board);
        return <li key={s.id}><ElementIcon element={d.element} /><span>
          <button onClick={event => { onInspect?.(s.id); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{s.owner === 'white' ? 'White' : 'Black'} {d.name} · {historySquare(s.position)} · Show reach</button>
          <small>ATK {d.attack} · DEF {d.defense} · SPD {d.speed} · Mining {d.mining} · {s.cost} ◆ committed</small>
          <small className={valid ? '' : 'rent-warning'}>{valid ? 'Currently supported' : 'Currently disrupted — refund if still blocked at arrival'}</small>
        </span></li>;
      })}</ul>
    </details>}
  </section>;
}
