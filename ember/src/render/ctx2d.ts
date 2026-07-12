/**
 * EMBER — minimal canvas 2D context surface used by src/render/
 * (src/render/ctx2d.ts).
 *
 * All drawing helpers in this module are written against this small
 * structural interface rather than the DOM's full CanvasRenderingContext2D.
 * Two reasons:
 *   1. It keeps the renderer's canvas usage to a deliberately small, mostly
 *      blocky-pixel-art-friendly subset (fillRect + text + one radial
 *      gradient primitive for the glow) instead of sprawling across the
 *      whole canvas API.
 *   2. It makes the drawing functions testable without a real browser
 *      canvas backend: jsdom's HTMLCanvasElement.getContext('2d') returns
 *      null unless the (unavailable, and disallowed as a new dependency)
 *      `canvas` npm package is installed, so tests construct a lightweight
 *      fake that implements exactly this interface (see spriteSheets.test.ts
 *      and GameCanvas.test.tsx) and exercise the real drawing code against
 *      it — including reading pixels back via getImageData for the
 *      determinism check.
 *
 * A real CanvasRenderingContext2D satisfies this interface structurally, so
 * production code just passes one straight through.
 */

export interface Ctx2DGradient {
  addColorStop(offset: number, color: string): void;
}

export interface Ctx2DImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface Ctx2DImageSource {
  readonly width: number;
  readonly height: number;
}

export interface Ctx2D {
  fillStyle: string | Ctx2DGradient;
  globalAlpha: number;
  imageSmoothingEnabled: boolean;
  font: string;
  textAlign: 'left' | 'center' | 'right';
  textBaseline: 'top' | 'middle' | 'bottom' | 'alphabetic';

  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): Ctx2DGradient;
  drawImage(
    image: Ctx2DImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  getImageData(x: number, y: number, w: number, h: number): Ctx2DImageData;
}
