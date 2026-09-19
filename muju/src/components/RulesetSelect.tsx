import type { Ruleset } from '../game/types';
import { PHASING_PREVIEW_BADGE } from '../ai/phasingPreview';

/**
 * `aiPreview` is the personal Phasing AI preview (`src/ai/phasingPreview.ts`),
 * and it only ever reaches this component from a mode that puts an ENGINE in a
 * seat. Without it this is the shipped control, byte for byte: Phasing is
 * "Experimental", and the copy says human play only, because no release gate has
 * passed for either engine under those rules. With it, the Phasing option
 * carries a visible "Preview · unreleased AI" badge instead — the player is told
 * what he is opting into at the moment he picks it, not afterwards.
 */
export function RulesetSelect({ value, onChange, aiPreview = false }: { value: Ruleset; onChange: (value: Ruleset) => void; aiPreview?: boolean }) {
  return <fieldset className="ruleset-select">
    <legend>Ruleset</legend>
    <div>{(['standard', 'phasing'] as const).map(rule => <label key={rule} data-selected={value === rule}>
      <input type="radio" name="ruleset" value={rule} checked={value === rule} onChange={() => onChange(rule)} />
      <span><strong>{rule === 'standard' ? 'Standard' : 'Phasing'}{rule === 'phasing' && <small>{aiPreview ? PHASING_PREVIEW_BADGE : 'Experimental'}</small>}</strong>
        <span>{rule === 'standard' ? 'Buy & promote → act → mine' : 'Act → mine → upkeep → summon & promote'}</span></span>
    </label>)}</div>
    <p>{value === 'phasing'
      ? aiPreview
        ? 'Summons are public commitments. They arrive at your next turn if the square is still legal; otherwise you get a full refund. The AI plays these rules only as an unreleased preview: no release gate has passed for it here, and there is no strength guarantee.'
        : 'Summons are public commitments. They arrive at your next turn if the square is still legal; otherwise you get a full refund. Human play only for now.'
      : 'Instant purchases before actions. The current rules used by the AI.'}</p>
  </fieldset>;
}
