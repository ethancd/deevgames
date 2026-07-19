// TESSER web app — portrait mobile-first vanilla TS over the Stage A engine.
//
// Structure (all inside createApp so tests can mount many instances):
//   - @deev/ui mountShell: header (title/status/difficulty), content (board),
//     dock (tap-select-then-confirm action surface, always in thumb reach).
//   - createConfirmMachine<TesserAction>: taps SELECT a fully-specified
//     action; an explicit Confirm button executes it; tapping elsewhere
//     cancels (clickElsewhere).
//   - UndoStack (@deev/core) with attack/fold as commit points. The Undo
//     button undoes one full player turn: the AI reply (if any) plus the
//     player action, refusing whenever either crosses a commit point.
//   - defineStore over src/persist.ts's persistence: save after every
//     applied action, resume on load, Restart/New Game clears.
//   - Opponent seam (./opponent.ts): greedy fallback now, tesserMinimaxBot
//     when Stage B lands. AI replies apply after a short delay with damage
//     toasts.

import {
  tesser,
  persistence,
  footprintCells,
  volume,
  totalMeasure,
  BOARD_W,
  BOARD_H,
} from '../src/index.ts';
import type { Cell, Dir, Piece, TesserAction, TesserSeat, TesserState } from '../src/index.ts';
import { UndoStack, engineHash, mulberry32, stableStringify } from '@deev/core';
import {
  createConfirmMachine,
  createToastQueue,
  defineStore,
  mountShell,
  type StorageLike,
} from '@deev/ui';
import { DIFFICULTIES, loadOpponent, type Difficulty, type Opponent } from './opponent.ts';

export const SAVE_KEY = 'tesser:save';
const DIFFICULTY_KEY = 'tesser:difficulty';

const DELTA: Record<Dir, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
};

const DIR_NAMES: Record<Dir, string> = { N: 'north', S: 'south', E: 'east', W: 'west' };

type Mode = 'none' | 'group' | 'move' | 'attack' | 'fold-shape' | 'fold-anchor';

export interface AppOptions {
  /** Injectable storage (tests); defaults to localStorage. */
  storage?: StorageLike;
  /** Delay before the AI's reply is applied. Default 300ms. */
  aiDelayMs?: number;
  /** When false the AI never moves on its own; drive turns via dispatch()/aiStep(). */
  autoAi?: boolean;
  /** Toast expiry tick interval; <= 0 disables the interval. Default 500ms. */
  toastTickMs?: number;
  seed?: number;
  difficulty?: Difficulty;
}

export interface AppHandle {
  state(): TesserState;
  /** Apply any action legal for the CURRENT seat (validated); returns success. */
  dispatch(action: TesserAction): boolean;
  selectPiece(id: string): void;
  canUndoTurn(): boolean;
  undoTurn(): boolean;
  restart(): void;
  setDifficulty(d: Difficulty): void;
  /** Resolve the opponent and play north's move immediately (awaitable). */
  aiStep(): Promise<void>;
  destroy(): void;
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function cellKey(c: Cell): string {
  return `${c.x},${c.y}`;
}

function pieceName(id: string): string {
  const m = /^[SN]-(.+)$/.exec(id);
  const raw = m ? m[1] : id;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Footprint cells of `piece` translated `steps` in `dir` (no clipping). */
function movedFootprint(piece: Piece, dir: Dir, steps: number): Cell[] {
  const { dx, dy } = DELTA[dir];
  return footprintCells({ x: piece.x + dx * steps, y: piece.y + dy * steps, w: piece.w, d: piece.d });
}

/** Strike footprint: slid `steps`, then one further cell in `dir`, clipped to board. */
function strikeCells(piece: Piece, dir: Dir, steps: number): Cell[] {
  return movedFootprint(piece, dir, steps + 1).filter(
    (c) => c.x >= 0 && c.x < BOARD_W && c.y >= 0 && c.y < BOARD_H,
  );
}

function describeAction(a: TesserAction): string {
  switch (a.type) {
    case 'move':
      return `Move ${a.steps} ${DIR_NAMES[a.dir]}`;
    case 'attack':
      return `Attack ${DIR_NAMES[a.dir]}${a.steps > 0 ? ` (slide ${a.steps})` : ''}`;
    case 'fold':
      return `Fold to ${a.w}×${a.d}×${a.h}`;
    case 'pass':
      return 'Pass';
  }
}

export function createApp(root: HTMLElement, opts: AppOptions = {}): AppHandle {
  const storage: StorageLike = opts.storage ?? localStorage;
  const autoAi = opts.autoAi ?? true;
  const aiDelayMs = opts.aiDelayMs ?? 300;
  const toastTickMs = opts.toastTickMs ?? 500;

  const rng = mulberry32((opts.seed ?? Date.now()) | 0);
  const aiRng = rng.fork('ai');
  const store = defineStore<TesserState>({
    key: SAVE_KEY,
    persistence,
    storage,
    engineHash: engineHash(tesser),
  });
  const undo = new UndoStack(tesser);
  /** Parallel record of pushes so the app can reason about turn pairs (the
   * UndoStack API pops blind — it does not expose whose entry is on top). */
  const histMeta: Array<{ seat: TesserSeat; commit: boolean }> = [];
  const toasts = createToastQueue();

  function readDifficulty(): Difficulty {
    const raw = storage.getItem(DIFFICULTY_KEY);
    return (DIFFICULTIES as readonly string[]).includes(raw ?? '') ? (raw as Difficulty) : 'medium';
  }

  let difficulty: Difficulty = opts.difficulty ?? readDifficulty();
  let opponentPromise: Promise<Opponent> | null = null;

  let state: TesserState = store.load()?.data ?? tesser.init({}, rng);

  // --- UI state -------------------------------------------------------------
  let selectedPieceId: string | null = null;
  let mode: Mode = 'none';
  let foldShape: { w: number; d: number; h: number } | null = null;
  let candidates = new Map<string, TesserAction>();
  let lastCells: Cell[] = [];
  let aiTimer: ReturnType<typeof setTimeout> | null = null;
  let aiThinking = false;
  let destroyed = false;
  /** Bumped on undo/restart so an in-flight aiStep() from before is dropped. */
  let epoch = 0;

  const machine = createConfirmMachine<TesserAction>({
    onConfirm: (action) => applyAction(action),
    isSame: (a, b) => stableStringify(a) === stableStringify(b),
  });

  function pendingAction(): TesserAction | null {
    const st = machine.state();
    return st === 'idle' ? null : st.selected;
  }

  // --- DOM skeleton ---------------------------------------------------------
  const header = el('header', 'ts-header');
  const content = el('div', 'ts-content');
  const dock = el('div', 'ts-dock');
  const shell = mountShell(root, { header, content, dock });

  const toastLayer = el('div', 'ts-toasts');
  const boardWrap = el('div', 'ts-board-wrap');
  const board = el('div', 'ts-board');
  board.dataset.testid = 'board';
  const cellEls: Array<{ elm: HTMLElement; k: string }> = [];
  for (let y = 0; y < BOARD_H; y++) {
    for (let x = 0; x < BOARD_W; x++) {
      const c = el('div', 'ts-cell');
      c.dataset.cell = `${x},${y}`;
      cellEls.push({ elm: c, k: `${x},${y}` });
      board.appendChild(c);
    }
  }
  const piecesLayer = el('div', 'ts-pieces');
  board.appendChild(piecesLayer);
  boardWrap.appendChild(board);
  content.appendChild(toastLayer);
  content.appendChild(boardWrap);

  // --- selection / candidate machinery -------------------------------------
  function targeting(): boolean {
    return mode === 'move' || mode === 'attack' || mode === 'fold-anchor';
  }

  function southLegal(): TesserAction[] {
    return state.current === 'south' && tesser.terminal(state) === null
      ? tesser.legal(state, 'south')
      : [];
  }

  function mustPiece(id: string): Piece {
    const p = state.pieces.find((pc) => pc.id === id);
    if (!p) throw new Error(`no piece '${id}'`);
    return p;
  }

  function buildMoveCandidates(pieceId: string): Map<string, TesserAction> {
    const piece = mustPiece(pieceId);
    const byCell = new Map<string, { action: TesserAction; steps: number }>();
    for (const a of southLegal()) {
      if (a.type !== 'move' || a.piece !== pieceId) continue;
      for (const c of movedFootprint(piece, a.dir, a.steps)) {
        const k = cellKey(c);
        const prev = byCell.get(k);
        // tap a cell -> the shortest move whose final footprint covers it;
        // ties resolved by first in legal() order (we iterate in that order).
        if (!prev || a.steps < prev.steps) byCell.set(k, { action: a, steps: a.steps });
      }
    }
    return new Map([...byCell].map(([k, v]) => [k, v.action]));
  }

  function buildAttackCandidates(pieceId: string): Map<string, TesserAction> {
    const piece = mustPiece(pieceId);
    const enemyCells = new Set(
      state.pieces
        .filter((p) => p.seat === 'north')
        .flatMap((p) => footprintCells(p).map(cellKey)),
    );
    const byCell = new Map<string, { action: TesserAction; steps: number }>();
    for (const a of southLegal()) {
      if (a.type !== 'attack' || a.piece !== pieceId) continue;
      for (const c of strikeCells(piece, a.dir, a.steps)) {
        const k = cellKey(c);
        if (!enemyCells.has(k)) continue; // only target cells that hit an enemy
        const prev = byCell.get(k);
        if (!prev || a.steps < prev.steps) byCell.set(k, { action: a, steps: a.steps });
      }
    }
    return new Map([...byCell].map(([k, v]) => [k, v.action]));
  }

  function foldShapesFor(pieceId: string): Array<{ w: number; d: number; h: number }> {
    const seen = new Set<string>();
    const shapes: Array<{ w: number; d: number; h: number }> = [];
    for (const a of southLegal()) {
      if (a.type !== 'fold' || a.piece !== pieceId) continue;
      const k = `${a.w}x${a.d}x${a.h}`;
      if (seen.has(k)) continue;
      seen.add(k);
      shapes.push({ w: a.w, d: a.d, h: a.h });
    }
    return shapes;
  }

  function buildFoldAnchorCandidates(
    pieceId: string,
    shape: { w: number; d: number; h: number },
  ): Map<string, TesserAction> {
    const map = new Map<string, TesserAction>();
    for (const a of southLegal()) {
      if (a.type !== 'fold' || a.piece !== pieceId) continue;
      if (a.w !== shape.w || a.d !== shape.d || a.h !== shape.h) continue;
      map.set(`${a.x},${a.y}`, a);
    }
    return map;
  }

  function actionCells(a: TesserAction): Cell[] {
    if (a.type === 'pass') return [];
    const piece = state.pieces.find((p) => p.id === a.piece);
    if (!piece) return [];
    if (a.type === 'move') return movedFootprint(piece, a.dir, a.steps);
    if (a.type === 'attack') return strikeCells(piece, a.dir, a.steps);
    return footprintCells({ x: a.x, y: a.y, w: a.w, d: a.d });
  }

  function clearSelection(): void {
    machine.cancel();
    selectedPieceId = null;
    mode = 'none';
    foldShape = null;
    candidates = new Map();
  }

  function cancelAll(): void {
    machine.clickElsewhere();
    selectedPieceId = null;
    mode = 'none';
    foldShape = null;
    candidates = new Map();
    render();
  }

  function selectPiece(id: string): void {
    const piece = state.pieces.find((p) => p.id === id);
    if (
      !piece ||
      piece.seat !== 'south' ||
      state.current !== 'south' ||
      tesser.terminal(state) !== null
    ) {
      return;
    }
    machine.cancel();
    selectedPieceId = id;
    mode = 'group';
    foldShape = null;
    candidates = new Map();
    render();
  }

  function enterMode(m: 'move' | 'attack' | 'fold-shape'): void {
    if (selectedPieceId === null) return;
    machine.cancel();
    foldShape = null;
    mode = m;
    candidates =
      m === 'move'
        ? buildMoveCandidates(selectedPieceId)
        : m === 'attack'
          ? buildAttackCandidates(selectedPieceId)
          : new Map();
    render();
  }

  function chooseFoldShape(shape: { w: number; d: number; h: number }): void {
    if (selectedPieceId === null) return;
    machine.cancel();
    foldShape = shape;
    mode = 'fold-anchor';
    candidates = buildFoldAnchorCandidates(selectedPieceId, shape);
    render();
  }

  // --- engine transitions ---------------------------------------------------
  function announce(prev: TesserState, next: TesserState, action: TesserAction): void {
    if (action.type !== 'attack') return;
    const attacker = prev.pieces.find((p) => p.id === action.piece);
    if (!attacker) return;
    for (const enemy of prev.pieces) {
      if (enemy.seat === attacker.seat) continue;
      const after = next.pieces.find((p) => p.id === enemy.id);
      const dealt = enemy.measure - (after?.measure ?? 0);
      if (dealt <= 0) continue;
      if (!after) {
        toasts.push(`${pieceName(attacker.id)} destroys ${pieceName(enemy.id)}!`, {
          kind: 'destroy',
        });
      } else {
        toasts.push(`${pieceName(attacker.id)} shaves ${dealt} off ${pieceName(enemy.id)}`, {
          kind: attacker.seat === 'south' ? 'dealt' : 'taken',
        });
      }
    }
  }

  function computeLastCells(prev: TesserState, action: TesserAction): Cell[] {
    if (action.type === 'pass') return [];
    const piece = prev.pieces.find((p) => p.id === action.piece);
    if (!piece) return [];
    if (action.type === 'move') return movedFootprint(piece, action.dir, action.steps);
    if (action.type === 'attack') {
      return [...movedFootprint(piece, action.dir, action.steps), ...strikeCells(piece, action.dir, action.steps)];
    }
    return footprintCells({ x: action.x, y: action.y, w: action.w, d: action.d });
  }

  function applyAction(action: TesserAction): void {
    const seat = state.current;
    undo.push(state, rng.getState(), action, seat);
    histMeta.push({ seat, commit: tesser.isCommitPoint?.(state, action) ?? false });
    const prev = state;
    state = tesser.apply(state, action, rng);
    lastCells = computeLastCells(prev, action);
    announce(prev, state, action);
    store.save(state, rng.getState());
    clearSelection();
    render();
    scheduleAi();
  }

  function dispatch(action: TesserAction): boolean {
    if (tesser.terminal(state) !== null) return false;
    const legal = tesser.legal(state, state.current);
    const wanted = stableStringify(action);
    const match = legal.find((a) => stableStringify(a) === wanted);
    if (!match) return false;
    applyAction(match);
    return true;
  }

  // --- undo -----------------------------------------------------------------
  // Semantics: Undo reverts one full PLAYER turn — the AI reply on top (if
  // any) plus the player action beneath it — but never crosses a commit
  // point (attack/fold, per tesser.isCommitPoint). If either entry is a
  // commit, Undo is unavailable; Restart is the full-reset escape hatch.
  function canUndoTurn(): boolean {
    const n = histMeta.length;
    if (n === 0) return false;
    const top = histMeta[n - 1];
    if (top.seat === 'south') return !top.commit; // AI hasn't replied yet
    if (top.commit) return false; // AI reply was a commit point
    const below = histMeta[n - 2];
    return below !== undefined && below.seat === 'south' && !below.commit;
  }

  function undoTurn(): boolean {
    if (!canUndoTurn()) return false;
    epoch++;
    if (aiTimer !== null) {
      clearTimeout(aiTimer);
      aiTimer = null;
    }
    let snap = undo.undo();
    if (snap === null) return false;
    histMeta.pop();
    if (snap.state.current === 'north') {
      // We undid the AI reply; also undo the player action beneath it.
      const deeper = undo.undo();
      if (deeper !== null) {
        histMeta.pop();
        snap = deeper;
      }
    }
    state = snap.state;
    rng.setState(snap.rngState);
    lastCells = [];
    store.save(state, rng.getState());
    clearSelection();
    render();
    scheduleAi();
    return true;
  }

  function restart(): void {
    epoch++;
    if (aiTimer !== null) {
      clearTimeout(aiTimer);
      aiTimer = null;
    }
    store.clear();
    state = tesser.init({}, rng);
    undo.clear();
    histMeta.length = 0;
    lastCells = [];
    store.save(state, rng.getState());
    clearSelection();
    render();
    scheduleAi();
  }

  // --- AI -------------------------------------------------------------------
  function getOpponent(): Promise<Opponent> {
    if (opponentPromise === null) opponentPromise = loadOpponent(difficulty);
    return opponentPromise;
  }

  function setDifficulty(d: Difficulty): void {
    difficulty = d;
    opponentPromise = null; // lazily reloaded with the new budget
    storage.setItem(DIFFICULTY_KEY, d);
    renderHeader();
  }

  function scheduleAi(): void {
    if (!autoAi || destroyed) return;
    if (aiTimer !== null) {
      clearTimeout(aiTimer);
      aiTimer = null;
    }
    if (tesser.terminal(state) !== null || state.current !== 'north') return;
    aiTimer = setTimeout(() => {
      aiTimer = null;
      void aiStep();
    }, aiDelayMs);
  }

  async function aiStep(): Promise<void> {
    if (destroyed || aiThinking) return;
    if (tesser.terminal(state) !== null || state.current !== 'north') return;
    aiThinking = true;
    const startedAt = epoch;
    try {
      const opponent = await getOpponent();
      if (destroyed || startedAt !== epoch) return;
      if (tesser.terminal(state) !== null || state.current !== 'north') return;
      const legal = tesser.legal(state, 'north');
      const action = opponent.choose(state, 'north', legal, aiRng);
      applyAction(action);
    } finally {
      aiThinking = false;
    }
  }

  // --- rendering ------------------------------------------------------------
  function button(
    label: string,
    cls: string,
    onClick: () => void,
    disabled = false,
  ): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.className = cls;
    b.disabled = disabled;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onClick();
    });
    return b;
  }

  function renderHeader(): void {
    header.textContent = '';
    const title = el('h1', 'ts-title');
    title.textContent = 'TESSER';
    const info = el('div', 'ts-header-info');
    const status = el('div', 'ts-status');
    const term = tesser.terminal(state);
    status.textContent = term
      ? term.winner === 'south'
        ? 'You win'
        : term.winner === 'north'
          ? 'AI wins'
          : 'Draw'
      : state.current === 'south'
        ? 'Your turn'
        : 'AI thinking…';
    const measures = el('div', 'ts-measures');
    measures.textContent = `You ${totalMeasure(state, 'south')} · AI ${totalMeasure(state, 'north')} · ply ${state.ply}/${state.plyCap}`;
    info.appendChild(status);
    info.appendChild(measures);

    const select = document.createElement('select');
    select.className = 'ts-difficulty';
    select.setAttribute('aria-label', 'AI difficulty');
    for (const d of DIFFICULTIES) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      opt.selected = d === difficulty;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => setDifficulty(select.value as Difficulty));
    select.addEventListener('click', (ev) => ev.stopPropagation());

    header.appendChild(title);
    header.appendChild(info);
    header.appendChild(select);
  }

  function renderCells(): void {
    const candSet = targeting() ? new Set(candidates.keys()) : new Set<string>();
    const pending = pendingAction();
    const selSet = new Set((pending ? actionCells(pending) : []).map(cellKey));
    const lastSet = new Set(lastCells.map(cellKey));
    board.classList.toggle('ts-targeting', targeting());
    for (const { elm, k } of cellEls) {
      elm.classList.toggle('ts-cand', candSet.has(k));
      elm.classList.toggle('ts-sel', selSet.has(k));
      elm.classList.toggle('ts-last', lastSet.has(k));
    }
  }

  function renderPieces(): void {
    piecesLayer.textContent = '';
    for (const p of state.pieces) {
      const d = el('div', 'ts-piece');
      d.classList.add(p.seat === 'south' ? 'ts-south' : 'ts-north');
      const vol = volume(p);
      if (p.measure < vol) d.classList.add('ts-wounded');
      if (p.id === selectedPieceId) d.classList.add('ts-selected');
      d.dataset.pieceId = p.id;
      d.dataset.x = String(p.x);
      d.dataset.y = String(p.y);
      d.dataset.w = String(p.w);
      d.dataset.d = String(p.d);
      d.dataset.h = String(p.h);
      d.dataset.measure = String(p.measure);
      d.style.left = `${(p.x / BOARD_W) * 100}%`;
      d.style.top = `${(p.y / BOARD_H) * 100}%`;
      d.style.width = `${(p.w / BOARD_W) * 100}%`;
      d.style.height = `${(p.d / BOARD_H) * 100}%`;

      const name = el('span', 'ts-p-name');
      name.textContent = pieceName(p.id);
      const stats = el('span', 'ts-p-stats');
      const height = el('span', 'ts-p-h');
      height.textContent = `h${p.h}`;
      const meas = el('span', 'ts-p-m');
      meas.textContent = p.measure < vol ? `${p.measure}/${vol}` : `${p.measure}`;
      stats.appendChild(height);
      stats.appendChild(meas);
      d.appendChild(name);
      d.appendChild(stats);
      piecesLayer.appendChild(d);
    }
  }

  function renderDock(): void {
    dock.textContent = '';
    dock.dataset.testid = 'dock';
    const term = tesser.terminal(state);
    const main = el('div', 'ts-dock-main');
    dock.appendChild(main);

    const pending = pendingAction();

    if (term !== null) {
      const hint = el('div', 'ts-hint');
      hint.textContent = 'Game over';
      main.appendChild(hint);
    } else if (state.current !== 'south') {
      const hint = el('div', 'ts-hint');
      hint.textContent = 'AI is thinking…';
      main.appendChild(hint);
    } else if (mode === 'none') {
      const hint = el('div', 'ts-hint');
      hint.textContent = 'Tap one of your pieces';
      main.appendChild(hint);
    } else if (mode === 'group' && selectedPieceId !== null) {
      const legal = southLegal().filter(
        (a) => a.type !== 'pass' && 'piece' in a && a.piece === selectedPieceId,
      );
      const moves = legal.filter((a) => a.type === 'move').length;
      const attacks = legal.filter((a) => a.type === 'attack').length;
      const foldsCount = foldShapesFor(selectedPieceId).length;
      const label = el('div', 'ts-hint');
      label.textContent = pieceName(selectedPieceId);
      main.appendChild(label);
      const row = el('div', 'ts-row');
      row.appendChild(button(`Move (${moves})`, 'ts-btn', () => enterMode('move'), moves === 0));
      row.appendChild(
        button(`Attack (${attacks})`, 'ts-btn', () => enterMode('attack'), attacks === 0),
      );
      row.appendChild(
        button(`Fold (${foldsCount})`, 'ts-btn', () => enterMode('fold-shape'), foldsCount === 0),
      );
      row.appendChild(
        button('Pass', 'ts-btn', () => {
          machine.select({ type: 'pass' });
          render();
        }),
      );
      main.appendChild(row);
    } else if (mode === 'move' || mode === 'attack') {
      const hint = el('div', 'ts-hint');
      hint.textContent =
        mode === 'move' ? 'Tap a highlighted destination' : 'Tap a highlighted target';
      main.appendChild(hint);
      main.appendChild(button('Back', 'ts-btn ts-ghost', () => selectPiece(selectedPieceId!)));
    } else if (mode === 'fold-shape' && selectedPieceId !== null) {
      const hint = el('div', 'ts-hint');
      hint.textContent = 'Pick a shape (w×d×h)';
      main.appendChild(hint);
      const row = el('div', 'ts-row ts-wrap');
      for (const shape of foldShapesFor(selectedPieceId)) {
        row.appendChild(
          button(`${shape.w}×${shape.d}×${shape.h}`, 'ts-btn ts-shape', () =>
            chooseFoldShape(shape),
          ),
        );
      }
      main.appendChild(row);
      main.appendChild(button('Back', 'ts-btn ts-ghost', () => selectPiece(selectedPieceId!)));
    } else if (mode === 'fold-anchor') {
      const hint = el('div', 'ts-hint');
      hint.textContent = foldShape
        ? `Tap an anchor cell for ${foldShape.w}×${foldShape.d}×${foldShape.h}`
        : 'Tap an anchor cell';
      main.appendChild(hint);
      main.appendChild(button('Back', 'ts-btn ts-ghost', () => enterMode('fold-shape')));
    }

    if (pending !== null && term === null) {
      const row = el('div', 'ts-row ts-pending');
      const what = el('span', 'ts-pending-label');
      what.textContent = describeAction(pending);
      row.appendChild(what);
      row.appendChild(
        button('Confirm', 'ts-btn ts-confirm', () => {
          machine.confirm();
        }),
      );
      row.appendChild(
        button('Cancel', 'ts-btn ts-ghost', () => {
          machine.cancel();
          render();
        }),
      );
      main.appendChild(row);
    }

    const meta = el('div', 'ts-row ts-meta');
    meta.appendChild(button('Undo', 'ts-btn ts-ghost', () => undoTurn(), !canUndoTurn()));
    meta.appendChild(button('Restart', 'ts-btn ts-ghost', () => restart()));
    dock.appendChild(meta);
  }

  function renderBanner(): void {
    boardWrap.querySelector('.ts-banner')?.remove();
    const term = tesser.terminal(state);
    if (term === null) return;
    const banner = el('div', 'ts-banner');
    banner.dataset.testid = 'banner';
    const title = el('div', 'ts-banner-title');
    title.textContent =
      term.winner === 'south' ? 'Victory' : term.winner === 'north' ? 'Defeat' : 'Draw';
    const why = el('div', 'ts-banner-why');
    why.textContent =
      term.reason === 'elimination'
        ? 'by elimination'
        : term.scores
          ? `by adjudication — you ${term.scores['south']} · ai ${term.scores['north']}`
          : `by ${term.reason}`;
    banner.appendChild(title);
    banner.appendChild(why);
    banner.appendChild(button('New Game', 'ts-btn ts-confirm', () => restart()));
    boardWrap.appendChild(banner);
  }

  function renderToasts(): void {
    toastLayer.textContent = '';
    for (const t of toasts.active()) {
      const d = el('div', `ts-toast${t.kind ? ` ts-toast-${t.kind}` : ''}`);
      d.textContent = t.message;
      toastLayer.appendChild(d);
    }
  }

  function render(): void {
    renderHeader();
    renderCells();
    renderPieces();
    renderDock();
    renderBanner();
  }

  // --- events ---------------------------------------------------------------
  board.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const pieceEl = target.closest('[data-piece-id]');
    if (pieceEl instanceof HTMLElement) {
      ev.stopPropagation();
      const id = pieceEl.dataset.pieceId!;
      const piece = state.pieces.find((p) => p.id === id);
      if (piece && piece.seat === 'south' && !targeting()) selectPiece(id);
      else cancelAll();
      return;
    }
    const cellEl = target.closest('[data-cell]');
    if (cellEl instanceof HTMLElement) {
      ev.stopPropagation();
      const action = candidates.get(cellEl.dataset.cell!);
      if (action !== undefined && targeting()) {
        machine.select(action);
        render();
      } else {
        cancelAll(); // tapping elsewhere cancels
      }
    }
  });
  content.addEventListener('click', () => cancelAll());

  const unsubToasts = toasts.subscribe(renderToasts);
  const toastTimer =
    toastTickMs > 0
      ? setInterval(() => {
          toasts.tick();
        }, toastTickMs)
      : null;

  render();
  renderToasts();
  scheduleAi(); // a resumed save may be mid-AI-turn

  return {
    state: () => state,
    dispatch,
    selectPiece,
    canUndoTurn,
    undoTurn,
    restart,
    setDifficulty,
    aiStep,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      epoch++;
      if (aiTimer !== null) clearTimeout(aiTimer);
      if (toastTimer !== null) clearInterval(toastTimer);
      unsubToasts();
      shell.destroy();
    },
  };
}
