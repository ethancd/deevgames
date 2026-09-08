import { CrystalWell } from './CrystalWell';
import { UnitArtwork } from './UnitArtwork';
import { ElementIcon } from './ElementGlyph';
import type { Element, Tier } from '../game/types';

const examples = [
  { left: 5, dug: 0, label: 'Full', detail: '5 left · next 1' },
  { left: 3, dug: 0, label: 'Thin seam', detail: '3 left · next 1' },
  { left: 3, dug: 2, label: 'Dug down', detail: '3 left · next 3' },
  { left: 1, dug: 4, label: 'Deep', detail: '1 left · next 5' },
  { left: 1, dug: 0, label: 'Shallow', detail: '1 left · next 1' },
  { left: 0, dug: 5, label: 'Empty', detail: '0 left' },
];
const elements: Element[] = ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal'];

export function VisualKey() {
  return <div className="visual-key">
    <section><h3>Crystals are little wells</h3>
      <p>Brighter squares hold more crystals. Dark inset walls show how far down you have dug. Read the five slots on the right from shallow to deep.</p>
      <div className="well-examples">{examples.map(example => <figure key={example.label}>
        <div className={`well-example board-cell depth-${example.left}`}><CrystalWell cell={{ position: { x: 0, y: 0 }, resourceLayers: example.left, minedDepth: example.dug }} /></div>
        <figcaption><strong>{example.label}</strong><small>{example.detail}</small></figcaption>
      </figure>)}</div>
      <div className="gauge-key"><span><i className="crystal" /> Crystal left</span><span><i className="mined" /> Already mined</span><span><i className="bedrock" /> Bedrock</span></div>
      <p>The first lit slot is the <strong>Mining</strong> needed to reach the next crystal. A square with three crystals can still be too deep for a weak miner. Turn on <strong>Depths</strong> for reserve counts and next-depth numbers.</p>
    </section>
    <section><h3>Two armies, six element symbols</h3><p><strong>Ivory / White:</strong> round, pale stone. <strong>Obsidian / Black:</strong> angular, dark stone. The same symbols identify elements on either army, even without color.</p>
      <div className="army-examples">{elements.map(element => <figure key={element}><div>
        <UnitArtwork owner="white" element={element} tier={2} /><UnitArtwork owner="black" element={element} tier={2} />
      </div><figcaption><ElementIcon element={element} /> {element}</figcaption></figure>)}</div>
    </section>
    <section><h3>Rank belongs on the base</h3><div className="rank-examples">{([1, 2, 3, 4] as Tier[]).map(tier => <figure key={tier}><UnitArtwork owner="white" element="water" tier={tier} /><figcaption>Tier {tier}</figcaption></figure>)}</div>
      <p>Count the one to four rank marks. Higher tiers have larger bases; tiers 3–4 gain an inner rim and tier 4 a crest. Tier is a rank, not a universal attack value—tap a unit to compare its actual stats. A red badge shows damage.</p>
    </section>
  </div>;
}
