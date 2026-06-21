// THE CODEX — a data explorer & balance editor (a design tool, not a game
// screen). It browses the imported @mms/data corpus (creatures, spells,
// artifacts, heroes) with the researcher's real art, and shows each record's
// raw HoMM3 SOURCE stats side-by-side with the IN-GAME object the engine's
// adapter turns it into (a CardDef for creatures, a Relic for artifacts/heroes).
//
// Editing a source value re-runs the adapter live, so you can see exactly how a
// stat change moves the card numbers — the brief's "adapter is design, surface
// it" made interactive. Edits are in-memory; "Export" downloads the edited
// array as JSON to drop back into packages/data.
import { useMemo, useState } from 'react';
import {
  creatures as srcCreatures,
  spells as srcSpells,
  artifacts as srcArtifacts,
  heroes as srcHeroes,
} from '@mms/data';
import { adaptCreature, adaptArtifact, signatureRelicForHero } from '@mms/engine';
import type {
  SourceCreature,
  SourceSpell,
  SourceArtifact,
  SourceHero,
} from '@mms/schema';
import { Card } from '../components/Card';
import { ContentImage } from '../chrome/ContentImage';

type Tab = 'creatures' | 'spells' | 'artifacts' | 'heroes';
const TABS: { key: Tab; label: string }[] = [
  { key: 'creatures', label: 'Creatures' },
  { key: 'spells', label: 'Spells' },
  { key: 'artifacts', label: 'Artifacts' },
  { key: 'heroes', label: 'Heroes' },
];

const clone = <T,>(x: T): T => structuredClone(x);

function download(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- small field primitives -------------------------------------------------

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-[0.7rem] uppercase tracking-wider text-bone-500">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-28 rounded border border-verd-800 bg-grave-800 px-2 py-1 text-right text-sm text-bone-100 focus:border-verd-300 focus:outline-none';

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <Row label={label}>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        className={inputCls}
        aria-label={label}
      />
    </Row>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return (
    <Row label={label}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} w-44 text-left`}
        aria-label={label}
      />
    </Row>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <Row label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={`${inputCls} w-44 text-left`}
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Row>
  );
}

function BoolField({ label, value, onChange }: { label: string; value: boolean; onChange: (b: boolean) => void }) {
  return (
    <Row label={label}>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-verd-500"
        aria-label={label}
      />
    </Row>
  );
}

const csv = {
  parse: (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean),
  show: (a: string[]) => a.join(', '),
};

const FACTIONS = [
  'Castle', 'Rampart', 'Tower', 'Inferno', 'Necropolis',
  'Dungeon', 'Stronghold', 'Fortress', 'Conflux', 'Neutral',
] as const;
const SCHOOLS = ['Air', 'Earth', 'Fire', 'Water', 'All'] as const;
const ART_CLASSES = ['Treasure', 'Minor', 'Major', 'Relic'] as const;
const ART_SLOTS = [
  'Head', 'Neck', 'Torso', 'RightHand', 'LeftHand', 'Ring', 'Feet', 'Misc', 'Special',
] as const;

// --- the adapted (in-game) panel -------------------------------------------

function StatTable({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[0.7rem] uppercase tracking-wider text-bone-500">{k}</dt>
          <dd className="text-bone-100">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const RARITY_COLOR: Record<string, string> = {
  starter: 'text-bone-300',
  common: 'text-bone-100',
  uncommon: 'text-verd-300',
  rare: 'text-amber-300',
};

function AdaptedCreature({ c }: { c: SourceCreature }) {
  const card = adaptCreature(c);
  const eff = card.effects[0];
  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row">
      <Card card={card} />
      <StatTable
        rows={[
          ['Card id', <code className="text-xs text-verd-300">{card.id}</code>],
          ['Cost', card.cost],
          ['Type', card.type],
          ['Rarity', <span className={RARITY_COLOR[card.rarity]}>{card.rarity}</span>],
          ['Text', card.text],
          ['Effect', `${eff.kind} ${eff.amount ?? ''} → ${eff.target ?? ''}`],
          ['As enemy', `HP ${c.hp}, telegraphs ~${c.attack} dmg`],
        ]}
      />
    </div>
  );
}

function RelicTile({ imageRef, name }: { imageRef: string; name: string }) {
  return (
    <div className="flex w-28 flex-col items-center gap-2">
      <div className="h-16 w-16 overflow-hidden rounded-full border border-verd-500">
        <ContentImage imageRef={imageRef} alt={name} className="h-full w-full" />
      </div>
      <div className="text-center font-display text-xs engraved">{name}</div>
    </div>
  );
}

function AdaptedArtifact({ a }: { a: SourceArtifact }) {
  const relic = adaptArtifact(a);
  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row">
      <RelicTile imageRef={relic.imageRef} name={relic.name} />
      <StatTable
        rows={[
          ['Relic id', <code className="text-xs text-verd-300">{relic.id}</code>],
          ['Rarity', <span className={RARITY_COLOR[relic.rarity]}>{relic.rarity}</span>],
          ['Effect', `${relic.effect.kind}${'amount' in relic.effect ? ` (${relic.effect.amount})` : ''}`],
          ['Description', relic.description],
        ]}
      />
    </div>
  );
}

function AdaptedHero({ h }: { h: SourceHero }) {
  const relic = signatureRelicForHero(h);
  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row">
      <RelicTile imageRef={relic.imageRef} name={relic.name} />
      <StatTable
        rows={[
          ['Signature relic', <code className="text-xs text-verd-300">{relic.id}</code>],
          ['Rarity', <span className={RARITY_COLOR[relic.rarity]}>{relic.rarity}</span>],
          ['Effect', `${relic.effect.kind}${'amount' in relic.effect ? ` (${relic.effect.amount})` : ''}`],
          ['Description', relic.description],
        ]}
      />
    </div>
  );
}

function AdaptedSpell({ s }: { s: SourceSpell }) {
  return (
    <div className="text-sm text-bone-300">
      <p className="italic text-bone-500">
        Spells are not yet adapted to cards in v0 — shown here as source records for the
        researcher's data. Effect tags hint at the future card shape.
      </p>
      <StatTable
        rows={[
          ['School', s.school],
          ['Level', s.level],
          ['Mana', s.manaCost],
          ['Kind', s.isCombat ? 'Combat' : 'Adventure'],
          ['Effect tags', s.effectTags.join(', ')],
        ]}
      />
    </div>
  );
}

// --- the source editor ------------------------------------------------------

function CreatureEditor({ c, set }: { c: SourceCreature; set: (patch: Partial<SourceCreature>) => void }) {
  return (
    <>
      <TextField label="Name" value={c.name} onChange={(name) => set({ name })} />
      <SelectField label="Faction" value={c.faction} options={FACTIONS} onChange={(faction) => set({ faction })} />
      <NumField label="Tier" value={c.tier} onChange={(tier) => set({ tier })} />
      <BoolField label="Upgraded" value={c.upgraded} onChange={(upgraded) => set({ upgraded })} />
      <NumField label="Attack" value={c.attack} onChange={(attack) => set({ attack })} />
      <NumField label="Defense" value={c.defense} onChange={(defense) => set({ defense })} />
      <NumField label="HP" value={c.hp} onChange={(hp) => set({ hp })} />
      <NumField label="Damage min" value={c.damageMin} onChange={(damageMin) => set({ damageMin })} />
      <NumField label="Damage max" value={c.damageMax} onChange={(damageMax) => set({ damageMax })} />
      <NumField label="Speed" value={c.speed} onChange={(speed) => set({ speed })} />
      <NumField label="Growth" value={c.growth} onChange={(growth) => set({ growth })} />
      <TextField label="Abilities" value={csv.show(c.abilities)} onChange={(v) => set({ abilities: csv.parse(v) })} />
    </>
  );
}

function ArtifactEditor({ a, set }: { a: SourceArtifact; set: (patch: Partial<SourceArtifact>) => void }) {
  return (
    <>
      <TextField label="Name" value={a.name} onChange={(name) => set({ name })} />
      <SelectField label="Class" value={a.class} options={ART_CLASSES} onChange={(v) => set({ class: v })} />
      <SelectField label="Slot" value={a.slot} options={ART_SLOTS} onChange={(slot) => set({ slot })} />
      <TextField label="Bonuses" value={a.bonuses} onChange={(bonuses) => set({ bonuses })} />
    </>
  );
}

function HeroEditor({ h, set }: { h: SourceHero; set: (patch: Partial<SourceHero>) => void }) {
  return (
    <>
      <TextField label="Name" value={h.name} onChange={(name) => set({ name })} />
      <SelectField label="Faction" value={h.faction} options={FACTIONS} onChange={(faction) => set({ faction })} />
      <TextField label="Class" value={h.heroClass} onChange={(heroClass) => set({ heroClass })} />
      <TextField label="Specialty" value={h.specialty} onChange={(specialty) => set({ specialty })} />
      <TextField label="Skills" value={csv.show(h.startingSkills)} onChange={(v) => set({ startingSkills: csv.parse(v) })} />
    </>
  );
}

function SpellEditor({ s, set }: { s: SourceSpell; set: (patch: Partial<SourceSpell>) => void }) {
  return (
    <>
      <TextField label="Name" value={s.name} onChange={(name) => set({ name })} />
      <SelectField label="School" value={s.school} options={SCHOOLS} onChange={(school) => set({ school })} />
      <NumField label="Level" value={s.level} onChange={(level) => set({ level })} />
      <NumField label="Mana cost" value={s.manaCost} onChange={(manaCost) => set({ manaCost })} />
      <BoolField label="Combat spell" value={s.isCombat} onChange={(isCombat) => set({ isCombat })} />
      <TextField label="Description" value={s.description} onChange={(description) => set({ description })} />
      <TextField label="Effect tags" value={csv.show(s.effectTags)} onChange={(v) => set({ effectTags: csv.parse(v) })} />
    </>
  );
}

// --- the screen -------------------------------------------------------------

export function CodexScreen({ onExit }: { onExit: () => void }) {
  const [tab, setTab] = useState<Tab>('creatures');
  const [sel, setSel] = useState(0);

  const [creatures, setCreatures] = useState<SourceCreature[]>(() => clone(srcCreatures));
  const [spells, setSpells] = useState<SourceSpell[]>(() => clone(srcSpells));
  const [artifacts, setArtifacts] = useState<SourceArtifact[]>(() => clone(srcArtifacts));
  const [heroes, setHeroes] = useState<SourceHero[]>(() => clone(srcHeroes));

  const list = useMemo(() => {
    switch (tab) {
      case 'creatures': return creatures;
      case 'spells': return spells;
      case 'artifacts': return artifacts;
      case 'heroes': return heroes;
    }
  }, [tab, creatures, spells, artifacts, heroes]);

  const item = list[Math.min(sel, list.length - 1)];

  function patch(p: Record<string, unknown>) {
    const idx = Math.min(sel, list.length - 1);
    const apply = <T,>(arr: T[]): T[] => arr.map((x, i) => (i === idx ? { ...x, ...p } : x));
    if (tab === 'creatures') setCreatures(apply);
    else if (tab === 'spells') setSpells(apply);
    else if (tab === 'artifacts') setArtifacts(apply);
    else setHeroes(apply);
  }

  function resetAll() {
    setCreatures(clone(srcCreatures));
    setSpells(clone(srcSpells));
    setArtifacts(clone(srcArtifacts));
    setHeroes(clone(srcHeroes));
  }

  function exportCurrent() {
    download(`${tab}.json`, list);
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-grave-900 text-bone-100">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-2 border-b border-verd-800 bg-grave-800 px-3 py-2">
        <button
          type="button"
          onClick={onExit}
          className="rounded border border-verd-700 px-2 py-1 text-xs text-bone-300 active:scale-95 hover:border-verd-300"
        >
          ← Title
        </button>
        <h1 className="font-display text-sm tracking-widest engraved">✦ CODEX</h1>
        <span className="text-[0.65rem] text-bone-500">data explorer &amp; balance editor</span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={resetAll}
            className="rounded border border-grave-600 px-2 py-1 text-xs text-bone-400 active:scale-95 hover:border-blood-500"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={exportCurrent}
            className="rounded border border-verd-500 bg-verd-700/40 px-2 py-1 text-xs text-bone-100 active:scale-95 hover:bg-verd-700/70"
          >
            Export {tab}.json
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex gap-1 border-b border-grave-700 bg-grave-800 px-3 py-1.5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setSel(0);
            }}
            className={[
              'rounded px-3 py-1 font-display text-xs tracking-wider',
              tab === t.key
                ? 'bg-verd-700/50 text-bone-100 engraved'
                : 'text-bone-500 hover:text-bone-300',
            ].join(' ')}
          >
            {t.label}
            <span className="ml-1 text-[0.6rem] text-bone-600">
              {t.key === 'creatures' ? creatures.length
                : t.key === 'spells' ? spells.length
                : t.key === 'artifacts' ? artifacts.length
                : heroes.length}
            </span>
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        {/* Item strip / rail */}
        <ul
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-grave-700 p-2 sm:w-52 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r"
          aria-label={`${tab} list`}
        >
          {list.map((o, i) => (
            <li key={o.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setSel(i)}
                aria-current={sel === i}
                className={[
                  'flex w-36 items-center gap-2 rounded px-2 py-1 text-left text-xs sm:w-full',
                  sel === i ? 'bg-verd-700/40 text-bone-100' : 'text-bone-400 hover:bg-grave-700',
                ].join(' ')}
              >
                <span className="h-8 w-8 shrink-0 overflow-hidden rounded border border-grave-600">
                  <ContentImage imageRef={o.imageRef} alt={o.name} className="h-full w-full" />
                </span>
                <span className="truncate font-display">{o.name}</span>
              </button>
            </li>
          ))}
        </ul>

        {/* Detail */}
        {item && (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mb-4 flex items-center gap-3">
              <span className="h-16 w-16 overflow-hidden rounded border border-verd-700">
                <ContentImage imageRef={item.imageRef} alt={item.name} className="h-full w-full" />
              </span>
              <div>
                <h2 className="font-display text-lg engraved">{item.name}</h2>
                <code className="text-xs text-verd-300">{item.id}</code>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* SOURCE (editable) */}
              <section className="rounded-lg border border-grave-700 bg-grave-800/50 p-3">
                <h3 className="mb-2 font-display text-xs uppercase tracking-widest text-bone-500">
                  Source stats (HoMM3) — editable
                </h3>
                <div className="divide-y divide-grave-700/60">
                  {tab === 'creatures' && <CreatureEditor c={item as SourceCreature} set={patch} />}
                  {tab === 'artifacts' && <ArtifactEditor a={item as SourceArtifact} set={patch} />}
                  {tab === 'heroes' && <HeroEditor h={item as SourceHero} set={patch} />}
                  {tab === 'spells' && <SpellEditor s={item as SourceSpell} set={patch} />}
                </div>
              </section>

              {/* ADAPTED (in-game) */}
              <section className="rounded-lg border border-verd-800 bg-grave-800/50 p-3">
                <h3 className="mb-3 font-display text-xs uppercase tracking-widest text-verd-400">
                  In-game (engine adapter) — live
                </h3>
                {tab === 'creatures' && <AdaptedCreature c={item as SourceCreature} />}
                {tab === 'artifacts' && <AdaptedArtifact a={item as SourceArtifact} />}
                {tab === 'heroes' && <AdaptedHero h={item as SourceHero} />}
                {tab === 'spells' && <AdaptedSpell s={item as SourceSpell} />}
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
