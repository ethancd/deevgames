import type { Ruleset } from '../game/types';

export function RulesetSelect({ value, onChange }: { value: Ruleset; onChange: (value: Ruleset) => void }) {
  return <fieldset className="ruleset-select">
    <legend>Ruleset</legend>
    <div>{(['standard', 'phasing'] as const).map(rule => <label key={rule} data-selected={value === rule}>
      <input type="radio" name="ruleset" value={rule} checked={value === rule} onChange={() => onChange(rule)} />
      <span><strong>{rule === 'standard' ? 'Standard' : 'Phasing'}{rule === 'phasing' && <small>Experimental</small>}</strong>
        <span>{rule === 'standard' ? 'Buy & promote → act → mine' : 'Act → mine → upkeep → summon & promote'}</span></span>
    </label>)}</div>
    <p>{value === 'phasing'
      ? 'Summons are public commitments. They arrive at your next turn if the square is still legal; otherwise you get a full refund. Human play only for now.'
      : 'Instant purchases before actions. The current rules used by the AI.'}</p>
  </fieldset>;
}
