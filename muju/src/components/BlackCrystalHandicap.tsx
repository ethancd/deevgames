import { useId } from 'react';
import { MAX_BLACK_CRYSTAL_HANDICAP } from '../game/rules';

/** `phasing` is accepted and ignored since the 2026-09-21 single-ruleset
 * release: every game begins in Act, handicap or not. */
export function BlackCrystalHandicap({ value, onChange }: { value: number; onChange: (value: number) => void; phasing?: boolean }) {
  const id = useId();
  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm text-gray-400">Black crystal handicap</label>
    <select id={id} value={value} onChange={event => onChange(Number(event.target.value))}
      aria-describedby={`${id}-hint`} className="w-full bg-gray-800 border border-gray-700 rounded p-2">
      <option value={0}>Off · No handicap</option>
      {Array.from({ length: MAX_BLACK_CRYSTAL_HANDICAP }, (_, i) => i + 1).map(amount =>
        <option key={amount} value={amount}>{amount} {amount === 1 ? 'crystal' : 'crystals'}</option>)}
    </select>
    <p id={`${id}-hint`} className="text-sm text-gray-400">
      {value > 0
        ? `Black starts with ${value} ${value === 1 ? 'crystal' : 'crystals'}. Both players begin with actions; spend after mining and upkeep. White still moves first.`
        : 'Give Black 1–20 starting crystals. Both players begin with actions; spend after mining and upkeep. White still moves first.'}
    </p>
  </div>;
}
