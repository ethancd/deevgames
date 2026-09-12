import type { ActionsPerTurn } from '../game/types';

export function ActionBudgetSelect({ value, onChange }: { value: ActionsPerTurn; onChange: (value: ActionsPerTurn) => void }) {
  return <label className="action-budget-select">
    <span>Actions per turn</span>
    <select aria-label="Actions per turn" value={value} onChange={event => onChange(Number(event.target.value) as ActionsPerTurn)}>
      <option value={6}>6 · Standard</option>
      <option value={4}>4 · Variant</option>
    </select>
    <small>Shared by your army. All other rules stay the same.</small>
  </label>;
}
