import { describe, expect, it } from 'vitest';
import { GRID_H, GRID_W } from '../core/types';
import { WORLD_PX_H, WORLD_PX_W, computeCamera, worldToScreen } from './camera';

describe('computeCamera', () => {
  it('fits the full grid at an integer scale when the canvas is large enough', () => {
    const camera = computeCamera(WORLD_PX_W * 2, WORLD_PX_H * 2, { x: 24, y: 16 });
    expect(camera.scale).toBe(2);
    expect(Number.isInteger(camera.scale)).toBe(true);
  });

  it('centers the fit-mode grid within the canvas', () => {
    const camera = computeCamera(WORLD_PX_W + 100, WORLD_PX_H + 40, { x: 0, y: 0 });
    expect(camera.scale).toBe(1);
    expect(camera.originXPx).toBeGreaterThan(0);
    expect(camera.originYPx).toBeGreaterThan(0);
  });

  it('follows the ember at scale 1 when the canvas is smaller than the full grid', () => {
    const canvasW = 300;
    const canvasH = 200;
    const camera = computeCamera(canvasW, canvasH, { x: 24, y: 16 });
    expect(camera.scale).toBe(1);
    // the ember's world position should map inside the visible canvas
    const screen = worldToScreen(camera, 24.5, 16.5);
    expect(screen.x).toBeGreaterThanOrEqual(0);
    expect(screen.x).toBeLessThanOrEqual(canvasW);
    expect(screen.y).toBeGreaterThanOrEqual(0);
    expect(screen.y).toBeLessThanOrEqual(canvasH);
  });

  it('clamps the follow camera to the grid bounds near an edge', () => {
    const camera = computeCamera(300, 200, { x: 0, y: 0 });
    expect(camera.originXPx).toBe(0);
    expect(camera.originYPx).toBe(0);
  });

  it('never produces a follow-mode origin that reveals past the grid edge', () => {
    const camera = computeCamera(300, 200, { x: GRID_W - 1, y: GRID_H - 1 });
    // bottom-right corner of the grid, in screen space, should not be to the
    // left/above the canvas origin by more than the grid itself allows
    const corner = worldToScreen(camera, GRID_W, GRID_H);
    expect(corner.x).toBeLessThanOrEqual(GRID_W * 16);
    expect(corner.y).toBeLessThanOrEqual(GRID_H * 16);
  });
});
