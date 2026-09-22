import { useId } from 'react';
import { MAX_BLACK_CRYSTAL_HANDICAP } from '../game/rules';

export function BlackCrystalHandicap({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const id = useId();
  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm text-gray-400">Black crystal handicap</label>
    <select id={id} value={value} onChange={event => onChange(Number(event.target.value))}
      aria-describedby={`${id}-hint`} className="w-full bg-gray-800 border border-gray-700 rounded p-2">
      <option value={0}>Off · Standard start</option>
      {Array.from({ length: MAX_BLACK_CRYSTAL_HANDICAP }, (_, i) => i + 1).map(amount =>
        <option key={amount} value={amount}>{amount} {amount === 1 ? 'crystal' : 'crystals'}</option>)}
    </select>
    <p id={`${id}-hint`} className="text-sm text-gray-400">
      {value > 0
        ? `Black starts with ${value} ${value === 1 ? 'crystal' : 'crystals'}. ${value < 3 ? 'With fewer than 3 crystals, its first turn skips Place & Promote.' : 'Its first turn includes Place & Promote.'} White still moves first.`
        : 'Give Black 1–20 starting crystals. With 3 or more, its first turn includes Place & Promote.'}
    </p>
  </div>;
}
