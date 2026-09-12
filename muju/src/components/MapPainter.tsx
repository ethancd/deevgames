import { useEffect, useRef, useState } from 'react';
import { RESOURCE_MAP_NAME, UNEQUAL_ROUTES_MAP } from '../game/resourceMap';
import { CellReserve } from './CellReserve';
import './MapPainter.css';

const STORAGE_KEY = 'muju:painter:v1';
const SIZE = 10;
const HISTORY_LIMIT = 200;

function loadDraft(): number[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (Array.isArray(saved) && saved.length === SIZE * SIZE &&
      saved.every(value => Number.isInteger(value) && value >= 0 && value <= 10)) return saved;
  } catch { /* Start with the default map if storage is unavailable or the draft is invalid. */ }
  return [...UNEQUAL_ROUTES_MAP];
}

function formatMap(map: number[]): string {
  return `[\n${Array.from({ length: SIZE }, (_, y) =>
    `  ${map.slice(y * SIZE, (y + 1) * SIZE).join(', ')}`).join(',\n')}\n]`;
}

export function MapPainter() {
  const [history, setHistory] = useState(() => ({ past: [] as number[][], map: loadDraft(), future: [] as number[][] }));
  const [saved, setSaved] = useState(true);
  const [notice, setNotice] = useState('');
  const [showCopy, setShowCopy] = useState(false);
  const [activeCell, setActiveCell] = useState(0);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const copyField = useRef<HTMLTextAreaElement>(null);
  const { map, past, future } = history;

  useEffect(() => {
    const title = document.title;
    document.title = 'Crystal painter · Muju';
    return () => { document.title = title; };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); setSaved(true); }
    catch { setSaved(false); }
  }, [map]);

  useEffect(() => {
    if (showCopy) { copyField.current?.focus(); copyField.current?.select(); }
  }, [showCopy]);

  const change = (update: (current: number[]) => number[]) => {
    setNotice('');
    setHistory(current => {
      const next = update(current.map);
      if (next.every((value, index) => value === current.map[index])) return current;
      return { past: [...current.past, current.map].slice(-HISTORY_LIMIT), map: next, future: [] };
    });
  };
  const paint = (index: number, amount: number) => change(current => current.map((value, i) =>
    i === index ? Math.max(0, Math.min(10, value + amount)) : value));
  const undo = () => {
    setNotice('');
    setHistory(current => current.past.length ? {
      past: current.past.slice(0, -1), map: current.past[current.past.length - 1],
      future: [current.map, ...current.future],
    } : current);
  };
  const redo = () => {
    setNotice('');
    setHistory(current => current.future.length ? {
      past: [...current.past, current.map], map: current.future[0], future: current.future.slice(1),
    } : current);
  };
  const copyMap = async () => {
    try { await navigator.clipboard.writeText(formatMap(map)); setNotice('Map copied.'); }
    catch { setShowCopy(true); setNotice('Select and copy the map below.'); }
  };
  const downloadMap = () => {
    const url = URL.createObjectURL(new Blob([formatMap(map) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'muju-crystal-map.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Map exported.');
  };

  return <main className="map-painter" onKeyDown={event => {
    if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      if (event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
    }
  }}>
    <header className="painter-header">
      <a href="/muju/">← Back to Muju</a>
      <span className="painter-secret">Secret workshop</span>
      <h1>Crystal painter</h1>
      <p>Make a little abundance. Leave a little scarcity.</p>
    </header>

    <section className="painter-workbench" aria-label="Crystal map editor">
      <div className="painter-toolbar">
        <div className="painter-history">
          <button type="button" onClick={undo} disabled={!past.length} title="Undo (⌘/Ctrl Z)">↶ Undo</button>
          <button type="button" onClick={redo} disabled={!future.length} title="Redo (⌘/Ctrl Shift Z)">↷ Redo</button>
        </div>
        <output className="painter-total" aria-label="Total crystals"><strong>{map.reduce((sum, value) => sum + value, 0)}</strong> crystals</output>
      </div>
      <p className="painter-instructions" id="painter-instructions">Click <b>+1</b> <span>·</span> Right-click <b>−1</b> <span>·</span> Hold Shift for <b>2</b></p>
      <div className="painter-board-frame">
        <div className="painter-column-labels" aria-hidden="true">{'ABCDEFGHIJ'.split('').map(letter => <span key={letter}>{letter}</span>)}</div>
        <div className="painter-row-labels" aria-hidden="true">{Array.from({ length: SIZE }, (_, y) => <span key={y}>{y + 1}</span>)}</div>
        <div className="battle-board painter-board" role="group" aria-label="Starting crystals" aria-describedby="painter-instructions painter-keyboard">
          <div className="battle-grid">
            {map.map((value, index) => {
              const x = index % SIZE, y = Math.floor(index / SIZE);
              const coordinate = `${String.fromCharCode(65 + x)}${y + 1}`;
              const home = index === 0 ? 'white' : index === 99 ? 'black' : null;
              return <div className="board-square" key={index}>
                <button type="button" className={`board-cell painter-cell reserve-${value}`}
                  ref={node => { cells.current[index] = node; }}
                  tabIndex={activeCell === index ? 0 : -1}
                  aria-label={`${coordinate}, ${value} crystal${value === 1 ? '' : 's'}${home ? `, ${home} home` : ''}`}
                  title={`${coordinate}: ${value} / 10 crystals`}
                  onFocus={() => setActiveCell(index)}
                  onClick={event => paint(index, event.shiftKey ? 2 : 1)}
                  onContextMenu={event => { event.preventDefault(); paint(index, event.shiftKey ? -2 : -1); }}
                  onKeyDown={event => {
                    if (event.metaKey || event.ctrlKey || event.altKey) return;
                    if (['Enter', ' ', 'Backspace', 'Delete', '-', '+', '='].includes(event.key)) {
                      event.preventDefault();
                      const direction = ['Backspace', 'Delete', '-'].includes(event.key) ? -1 : 1;
                      paint(index, direction * (event.shiftKey ? 2 : 1));
                    }
                    const destination = event.key === 'ArrowLeft' ? y * SIZE + Math.max(0, x - 1) :
                      event.key === 'ArrowRight' ? y * SIZE + Math.min(SIZE - 1, x + 1) :
                      event.key === 'ArrowUp' ? Math.max(0, y - 1) * SIZE + x :
                      event.key === 'ArrowDown' ? Math.min(SIZE - 1, y + 1) * SIZE + x : null;
                    if (destination !== null) { event.preventDefault(); cells.current[destination]?.focus(); }
                  }}>
                  <CellReserve cell={{ position: { x, y }, resourceLayers: value }} />
                  {home && <span className={`home-marker home-${home}`} aria-hidden="true">⌂</span>}
                  <span className="painter-count" aria-hidden="true">{value}</span>
                </button>
              </div>;
            })}
          </div>
        </div>
      </div>
      <div className="painter-map-actions">
        <button type="button" onClick={() => change(() => [...UNEQUAL_ROUTES_MAP])}>Reset to default</button>
        <button type="button" onClick={() => change(() => Array(SIZE * SIZE).fill(0))}>Clear map</button>
        <span>0–10 per square</span>
      </div>
    </section>

    <footer className="painter-footer">
      <div className="painter-export">
        <button type="button" className="painter-primary" onClick={() => void copyMap()}>Copy map</button>
        <button type="button" onClick={downloadMap}>Download JSON</button>
      </div>
      <p className="painter-save-status" role="status" aria-label="Draft status">{notice || (saved ? 'Draft saved on this device.' : 'Draft could not be saved. Copy or download to keep it.')}</p>
      {showCopy && <div className="painter-copy-fallback">
        <label htmlFor="painter-map-json">Map JSON · columns A–J, rows 1–10</label>
        <textarea id="painter-map-json" ref={copyField} readOnly value={formatMap(map)} rows={12} />
        <button type="button" onClick={() => setShowCopy(false)}>Close</button>
      </div>}
      <p>Starts from {RESOURCE_MAP_NAME}. Export your layout to share it. Painting edits this draft only.</p>
      <p id="painter-keyboard">Keyboard: arrow keys to navigate, Enter to add, Delete to remove. Shift doubles either.</p>
    </footer>
  </main>;
}
