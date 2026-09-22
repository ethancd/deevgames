/**
 * WHERE "REPORT THIS POSITION" IS OFFERED, AND WHERE IT MUST NOT BE.
 *
 * The button was preview-only while the Phasing AI was an opt-in; with the
 * preview retired it belongs to every LOCAL game — vs AI, Watch AI and Pass &
 * Play. `GameScreen.tsx`'s `!online && !analysis` is the only thing keeping it
 * off an online board and off the analysis screen, and until this file nothing
 * asserted the negative half: the report carries a whole `GameState` and the
 * hard-engine diagnostics to the clipboard, and neither an opponent's live room
 * nor a reviewed archive is a position this player's engine just played.
 *
 * Every test here opens the SAME menu and looks for the SAME button, and the
 * local case runs first as the control — an absent-button assertion that passes
 * because the dialog never opened would be worth nothing.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GameView } from '../../src/components/GameScreen';
import { useGameState } from '../../src/hooks/useGameState';
import type { GameConfig, PlayerId } from '../../src/game/types';
import type { ReactNode } from 'react';

const REPORT = 'Report this position';

const localConfig: GameConfig = { mode: 'vs-ai', newGame: true, ruleset: 'phasing',
  controls: { white: 'human', black: 'ai' }, aiDifficulty: { white: 'medium', black: 'medium' } };
const onlineConfig: GameConfig = { mode: 'online', ruleset: 'phasing',
  controls: { white: 'human', black: 'remote' }, aiDifficulty: { white: 'medium', black: 'medium' } };
const analysisConfig: GameConfig = { mode: 'pass-play', ruleset: 'phasing',
  controls: { white: 'human', black: 'human' }, aiDifficulty: { white: 'medium', black: 'medium' } };

/** The two boards that are not a local game, built the way their real callers
 * build them (`OnlineLobby.tsx:232`, `AnalysisScreen.tsx:167`) minus the
 * transport: what is under test is the gate, not the room or the archive. */
const onlineProp = (player: PlayerId | null) => ({ player, ready: true, busy: false,
  names: { white: 'White', black: 'Black' }, banner: null as ReactNode, analysisUrl: '' });

function Harness({ config, online, analysis }: {
  config: GameConfig;
  online?: ReturnType<typeof onlineProp>;
  analysis?: { bar: ReactNode; reviewing: boolean };
}) {
  const game = useGameState(config);
  return <GameView config={config} game={game} onBackToMenu={() => {}} online={online} analysis={analysis} />;
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/muju/');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // jsdom has no native <dialog> behaviour; `PlayDialog` (the Game menu) needs these two.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Game menu' }));

it('offers the report in a local game (the control for the three negatives)', () => {
  render(<Harness config={localConfig} />);
  openMenu();
  expect(screen.getByRole('button', { name: REPORT })).toBeInTheDocument();
});

it('never offers the report on an online board', () => {
  render(<Harness config={onlineConfig} online={onlineProp('white')} />);
  openMenu();
  // The menu really is open: its always-present item is here, the report is not.
  expect(screen.getByRole('button', { name: 'Choose game mode' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: REPORT })).toBeNull();
});

it('never offers the report to an observer either', () => {
  render(<Harness config={onlineConfig} online={onlineProp(null)} />);
  openMenu();
  expect(screen.getByRole('button', { name: 'Choose game mode' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: REPORT })).toBeNull();
});

it('never offers the report on an analysis board', () => {
  render(<Harness config={analysisConfig} analysis={{ bar: null, reviewing: false }} />);
  openMenu();
  // `Reset analysis` is the analysis screen's own menu item, so this is the
  // analysis menu and not some other dialog.
  expect(screen.getByRole('button', { name: 'Reset analysis' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: REPORT })).toBeNull();
});
