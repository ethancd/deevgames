// TITLE — the "hello, run" entry that proves the data path end to end. It reads
// the playable heroes (grouped by faction) through the engine seam and starts a
// run as the chosen hero. The default is Galthran (Necropolis), preserving the
// v0 entry path + keystone.
//
// CHROME NOTE: the picker LIVE-PREVIEWS each faction's chrome — selecting a
// champion sets `data-faction` on the shell wrapper, so the page re-themes
// (Necropolis gothic ↔ Castle gilt-azure ↔ Stronghold bronze-iron) as you
// browse. The palette swap is driven entirely by the `[data-faction]` scopes
// in index.css; this screen only declares the active faction.
import { useEffect, useState } from 'react';
import { SkullIcon } from '../chrome/icons';
import { ContentImage } from '../chrome/ContentImage';
import { FACTIONS, PLAYABLE_HEROES, DEFAULT_HERO_ID } from '../engine';
import type { PlayableHero } from '../engine';

function heroById(id: string): PlayableHero | undefined {
  return PLAYABLE_HEROES.find((h) => h.id === id);
}

export function TitleScreen({
  onStart,
  onOpenCodex,
  onPreviewFaction,
}: {
  onStart: (seed: string, heroId?: string) => void;
  onOpenCodex?: () => void;
  /** Notifies the shell which faction's chrome to preview as the player browses. */
  onPreviewFaction?: (faction: string) => void;
}) {
  const [seed, setSeed] = useState('necropolis-1');
  const [heroId, setHeroId] = useState<string>(
    heroById(DEFAULT_HERO_ID) ? DEFAULT_HERO_ID : PLAYABLE_HEROES[0]?.id ?? '',
  );
  const selected = heroById(heroId);
  // Live theme preview: the shell's data-faction follows the SELECTED hero, so
  // picking Sir Mullich flips the whole page to Castle's gilt-azure chrome.
  const previewFaction = selected?.faction ?? 'Necropolis';
  useEffect(() => {
    onPreviewFaction?.(previewFaction);
  }, [previewFaction, onPreviewFaction]);

  return (
    <div className="flex h-full flex-col bg-necropolis px-4 pb-4 pt-6 text-center">
      <div className="shrink-0">
        <div className="mb-2 text-5xl text-bone-100 animate-fade-in">
          <SkullIcon />
        </div>
        <h1 className="font-display text-2xl font-black tracking-[0.18em] text-bone-100 engraved">
          MIGHT &amp; MAGIC
        </h1>
        <div className="mx-auto my-1 h-px w-40 bg-gradient-to-r from-transparent via-verd-500 to-transparent" />
        <h2 className="font-display text-lg tracking-[0.4em] text-verd-300">SPIRE</h2>
      </div>

      {/* Hero / faction picker */}
      <div
        data-testid="hero-picker"
        className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-lg border border-verd-900/60 bg-grave-900/40 p-2 text-left"
      >
        <p className="px-1 pb-2 text-[0.7rem] uppercase tracking-widest text-bone-600">
          Choose your champion
        </p>
        {FACTIONS.map((faction) => {
          const heroes = PLAYABLE_HEROES.filter((h) => h.faction === faction);
          if (!heroes.length) return null;
          return (
            <section key={faction} data-testid="faction-group" data-faction={faction} className="mb-3">
              <h3 className="sticky top-0 z-10 mb-1 bg-grave-900/90 px-1 py-1 font-display text-xs uppercase tracking-[0.25em] text-verd-300">
                {faction}
              </h3>
              <div className="grid grid-cols-3 gap-1.5">
                {heroes.map((h) => {
                  const isSel = h.id === heroId;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      data-testid="hero-option"
                      data-hero-id={h.id}
                      data-faction={h.faction}
                      data-selected={isSel}
                      aria-pressed={isSel}
                      onClick={() => setHeroId(h.id)}
                      className={`flex flex-col items-center gap-1 rounded-md border p-1.5 text-center transition active:scale-95 ${
                        isSel
                          ? 'border-verd-300 bg-verd-700/40 ring-1 ring-verd-300'
                          : 'border-grave-700 bg-grave-800/60 hover:border-verd-700'
                      }`}
                    >
                      <ContentImage
                        imageRef={h.imageRef}
                        alt={h.name}
                        className="h-12 w-12 rounded-sm"
                      />
                      <span className="line-clamp-1 w-full font-display text-[0.65rem] leading-tight text-bone-100">
                        {h.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Selected hero detail */}
      {selected && (
        <div
          data-testid="hero-detail"
          className="mt-2 shrink-0 rounded-md border border-verd-900/60 bg-grave-900/60 px-3 py-2 text-left text-xs text-bone-400"
        >
          <span className="font-display text-sm text-bone-100">{selected.name}</span>
          <span className="text-bone-600"> — {selected.faction}</span>
          <div className="mt-0.5 text-[0.7rem] text-bone-500">
            {selected.heroClass} · Specialty: {selected.specialty}
          </div>
        </div>
      )}

      <div className="mt-3 shrink-0">
        <label className="flex flex-col items-center gap-1 text-[0.7rem] text-bone-500">
          Seed
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            className="w-44 rounded border border-verd-700 bg-grave-800 px-3 py-1.5 text-center font-display text-bone-100 focus:border-verd-300 focus:outline-none"
            aria-label="Run seed"
          />
        </label>

        <button
          type="button"
          data-testid="start-run"
          onClick={() => onStart(seed || 'necropolis-1', heroId || undefined)}
          className="mt-3 w-full rounded-md border-2 border-verd-300 bg-verd-700/40 px-10 py-3 font-display text-lg uppercase tracking-widest text-bone-100 active:scale-95 hover:bg-verd-700/70"
        >
          Begin the Descent
        </button>

        {onOpenCodex && (
          <button
            type="button"
            data-testid="open-codex"
            onClick={onOpenCodex}
            className="mt-3 text-xs uppercase tracking-widest text-bone-600 underline-offset-4 hover:text-verd-300 hover:underline"
          >
            ✦ Codex — data explorer
          </button>
        )}
      </div>
    </div>
  );
}
