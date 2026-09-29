import { afterEach, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { crystalLightSlots } from '../../src/components/CrystalLights';
import { Board } from '../../src/components/Board';
import { createInitialGameState } from '../../src/game/board';

afterEach(cleanup);
const positions = (n: number) => crystalLightSlots(n).map(({ x, y }) => [x, y]);

it('converges to midpoints at four and midpoints plus corners at eight', () => {
  expect(positions(4)).toEqual([[50,10],[10,50],[50,90],[90,50]]);
  expect(positions(8)).toEqual([[10,10],[10,90],[90,90],[90,10],...positions(4)]);
  expect(positions(16).slice(8)).toEqual(positions(8));
  expect(positions(8).slice(4)).toEqual(positions(4));
  expect(positions(3)).toEqual([[10,50],[50,90],[90,50]]);
  expect(positions(2)).toEqual([[50,90],[90,50]]);
  expect(positions(1)).toEqual([[90,50]]);
});

it('removes one light at a time without moving survivors, for every reserve', () => {
  for (let count=16; count>0; count--) {
    expect(positions(count)).toHaveLength(count);
    expect(positions(count).slice(1)).toEqual(positions(count-1));
  }
  const full=positions(16);
  expect(new Set(full.map(p=>p.join(','))).size).toBe(16);
  for (const side of [10,90]) {
    expect(full.filter(([x])=>x===side).map(([,y])=>y).sort((a,b)=>a-b)).toEqual([10,30,50,70,90]);
    expect(full.filter(([,y])=>y===side).map(([x])=>x).sort((a,b)=>a-b)).toEqual([10,30,50,70,90]);
  }
  expect(positions(0)).toEqual([]);
});

it('renders the same remaining lights regardless of original reserves or missing legacy metadata', () => {
  const { board }=createInitialGameState(undefined,undefined,0,'phasing');
  board.cells[1][7].resourceLayers=4; // H2 originally holds sixteen.
  board.cells[1][0].resourceLayers=4;
  const props={board,selectedUnit:null,validMoves:[],validAttacks:[],validSpawns:[],onCellClick:()=>{},onUnitClick:()=>{}};
  const {getByTestId,rerender}=render(<Board {...props} />);
  const slots=(id:string)=>Array.from(getByTestId(id).querySelectorAll('.crystal-light')).map(n=>n.getAttribute('transform'));
  const fresh=slots('cell-0-1');
  expect(fresh).toHaveLength(4);
  expect(slots('cell-7-1')).toEqual(fresh);
  delete board.initialResourceLayers;
  rerender(<Board {...props} />);
  expect(slots('cell-7-1')).toEqual(fresh);
  expect(getByTestId('cell-7-1')).toHaveAccessibleName('H2, 4 crystals remaining');
});
