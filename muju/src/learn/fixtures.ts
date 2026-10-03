import type { PuzzleSpec } from './types';

/**
 * Test puzzles, one per goal kind, each proved by `verifyPuzzle` in
 * `tests/learn/fixtures.test.ts`. The screen loads them from
 * `?learn=<id>&fixture=1` so end-to-end tests do not depend on the catalog
 * authors' choices. They are not part of the course.
 */
export const FIXTURES: readonly PuzzleSpec[] = [
  { id: 'fx-reach', idea: 'reach', board: ['P1 .  .', '.  .  .', '.  .  .'], goal: { kind: 'reach', flags: ['b1'] }, solution: ['a1-b1'] },
  { id: 'fx-mine', idea: 'mine', board: ['P1 .  .', '.  8  .', '.  .  .'], goal: { kind: 'mine', atLeast: 3 }, solution: ['a1-a2', 'a2-b2', 'mine'], tries: [['mine']] },
  { id: 'fx-capture', idea: 'capture', board: ['F1 l1 .', '.  .  .', '.  .  m1'], goal: { kind: 'capture', targets: ['b1'] }, solution: ['a1xb1'] },
  { id: 'fx-eliminate', idea: 'eliminate', board: ['F1 l1 .', '.  .  .', '.  .  .'], goal: { kind: 'eliminate' }, solution: ['a1xb1'] },
  { id: 'fx-home', idea: 'home', homes: true, banks: { white: 2 }, board: ['.  .  .  .', '.  M3 .  .', '.  .  .  .', 'f1 .  .  .'], goal: { kind: 'home' }, solution: ['b2-d4', 'mine'] },
  { id: 'fx-summon', idea: 'summon', homes: true, banks: { white: 3 }, board: ['.  .  .  .', '.  P1 .  .', '.  .  .  .', '.  .  .  m1'], goal: { kind: 'summon', type: 'F1' }, solution: ['mine', '+F1@a1'] },
  { id: 'fx-arrive', idea: 'arrive', homes: true, banks: { white: 3 }, board: ['.  .  .  .  .  .', '.  P1 .  .  .  .', '.  .  .  .  .  .', '.  .  .  .  .  .', '.  .  .  .  .  .', '.  .  .  .  .  m1'], goal: { kind: 'summon', type: 'F1', arrive: true }, solution: ['mine', '+F1@a2', 'end'] },
  { id: 'fx-promote', idea: 'promote', homes: true, banks: { white: 1 }, board: ['P1 .  .', '.  4  .', '.  .  m1'], goal: { kind: 'promote', to: 'P2' }, solution: ['a1-a2', 'a2-b2', 'mine', '^b2'], tries: [['mine']] },
  { id: 'fx-bank', idea: 'bank', board: ['P1 .  .', '.  4  .', '.  .  m1'], goal: { kind: 'bank', atLeast: 3 }, solution: ['a1-a2', 'a2-b2', 'mine', 'end'], tries: [['mine', 'end']] },
  { id: 'fx-keep', idea: 'keep', board: ['M3 P1 .', '.  4  .', '.  .  m1'], goal: { kind: 'keep', pieces: ['a1'] }, solution: ['b1-b2', 'mine', 'end'], tries: [['mine', 'keep b1']] },
  { id: 'fx-survive', idea: 'survive', board: ['.  .  .  .  .', '.  F1 .  .  .', '.  .  .  .  .', '.  .  .  .  .', '.  .  w1 .  .'], goal: { kind: 'survive' }, solution: ['b2-a1', 'mine', 'end'], tries: [['mine', 'end']] },
  { id: 'fx-hold', idea: 'hold', homes: true, board: ['.  .  .  .  .', '.  F1 .  .  .', '.  .  .  .  .', '.  .  .  .  .', '.  .  w1 .  .'], goal: { kind: 'hold' }, solution: ['b2-a1', 'mine', 'end'], tries: [['mine', 'end']] },
  { id: 'fx-all', idea: 'reach and mine', board: ['P1 .  .', '.  8  .', '.  .  .'], goal: { kind: 'all', goals: [{ kind: 'reach', flags: ['b2'] }, { kind: 'mine', atLeast: 3 }] }, solution: ['a1-a2', 'a2-b2', 'mine'], tries: [['a1-a2', 'mine']] },
  { id: 'fx-two-turns', idea: 'two turns', turns: 2, board: ['P1 .  .  .  .  .', '.  .  .  .  .  .', '.  .  .  .  .  .', '.  .  .  .  .  .', '.  .  .  .  .  .', '.  .  .  .  .  m1'], goal: { kind: 'reach', flags: ['a6'] }, solution: ['a1-a5', 'mine', 'end'] },
];

export const fixtureById = (id: string) => FIXTURES.find(f => f.id === id);
