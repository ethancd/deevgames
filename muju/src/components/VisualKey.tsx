import { CellReserve } from './CellReserve';
import { UnitArtwork } from './UnitArtwork';
import { ElementIcon } from './ElementGlyph';
import type { Element, Tier } from '../game/types';

const examples = [0, 4, 8, 10];
const elements: Element[] = ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal'];

export function VisualKey() {
  return <div className="visual-key">
    <section><h3>One reserve per square</h3>
      <p>Each pale brick is one crystal remaining. Two stacks grow from the bottom, up to five bricks each; odd totals put the extra brick on the left. At your turn end, each piece takes up to its Mining stat, up to the square’s reserve. Mining 0 takes nothing.</p>
      <div className="reserve-examples">{examples.map(reserve => <figure key={reserve}>
        <div className={`reserve-example board-cell reserve-${reserve}`}><CellReserve cell={{position:{x:0,y:0},resourceLayers:reserve}} /></div>
        <figcaption>{reserve} crystals</figcaption></figure>)}</div>
      <p>Tap a piece to see its Mining number and how much it takes here. The Reserves toggle shows or hides the brick stacks. With stacks hidden, brighter squares hold more.</p>
    </section>
    <section><h3>Two armies, six element symbols</h3><p><strong>Ivory / White:</strong> round, pale stone. <strong>Obsidian / Black:</strong> angular, dark stone. The same symbols identify elements on either army, even without color.</p>
      <div className="army-examples">{elements.map(element => <figure key={element}><div>
        <UnitArtwork owner="white" element={element} tier={2} /><UnitArtwork owner="black" element={element} tier={2} />
      </div><figcaption><ElementIcon element={element} /> {element}</figcaption></figure>)}</div>
    </section>
    <section><h3>Rank belongs on the base</h3><div className="rank-examples">{([1, 2, 3] as Tier[]).map(tier => <figure key={tier}><UnitArtwork owner="white" element="water" tier={tier} /><figcaption>Tier {tier}</figcaption></figure>)}</div>
      <p>Count the one to three rank marks. Higher tiers have larger bases; tier 3 gains an inner rim. Tier is a rank, not a universal attack value—tap a unit to compare its actual stats. A red badge shows damage.</p>
    </section>
  </div>;
}
