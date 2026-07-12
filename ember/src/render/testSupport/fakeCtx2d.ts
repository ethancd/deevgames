/**
 * EMBER — test-only fake Ctx2D (src/render/testSupport/fakeCtx2d.ts).
 *
 * jsdom's HTMLCanvasElement.getContext('2d') returns null unless the
 * (disallowed-as-a-new-dependency) `canvas` npm package is installed, so
 * there is no real pixel-reading canvas backend available in this project's
 * test environment. This is a small software rasterizer that implements
 * exactly the Ctx2D surface (src/render/ctx2d.ts) our drawing code uses —
 * real fillRect-based compositing with alpha blending, backed by a plain
 * Uint8ClampedArray — so tests can exercise the ACTUAL production drawing
 * functions and read pixels back via getImageData, rather than merely
 * asserting "no exceptions were thrown". Not shipped in any production
 * bundle: only src/render/*.test.ts(x) import from here.
 */

import type { Ctx2D, Ctx2DGradient, Ctx2DImageData } from '../ctx2d';

function parseColor(color: string | Ctx2DGradient): [number, number, number, number] {
  if (typeof color !== 'string') {
    // Gradient fills aren't rasterized pixel-exactly here — callers that
    // care about gradient output test createRadialGradient() calls, not
    // pixel data, for those draws.
    return [255, 0, 255, 255];
  }
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 255];
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
    const [r, g, b, a = 1] = parts;
    return [r, g, b, Math.round(a * 255)];
  }
  return [0, 0, 0, 255];
}

export class FakeCtx2D implements Ctx2D {
  fillStyle: string | Ctx2DGradient = '#000000';
  globalAlpha = 1;
  imageSmoothingEnabled = true;
  font = '';
  textAlign: 'left' | 'center' | 'right' = 'left';
  textBaseline: 'top' | 'middle' | 'bottom' | 'alphabetic' = 'alphabetic';

  readonly width: number;
  readonly height: number;
  private readonly buf: Uint8ClampedArray;

  fillTextCalls: { text: string; x: number; y: number }[] = [];
  drawImageCalls = 0;
  gradientCalls = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.buf = new Uint8ClampedArray(width * height * 4);
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const [r, g, b, a] = parseColor(this.fillStyle);
    const alpha = (a / 255) * this.globalAlpha;
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const idx = (yy * this.width + xx) * 4;
        this.buf[idx] = this.buf[idx] * (1 - alpha) + r * alpha;
        this.buf[idx + 1] = this.buf[idx + 1] * (1 - alpha) + g * alpha;
        this.buf[idx + 2] = this.buf[idx + 2] * (1 - alpha) + b * alpha;
        this.buf[idx + 3] = Math.max(this.buf[idx + 3], a * alpha);
      }
    }
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const idx = (yy * this.width + xx) * 4;
        this.buf.fill(0, idx, idx + 4);
      }
    }
  }

  fillText(text: string, x: number, y: number): void {
    this.fillTextCalls.push({ text, x, y });
  }

  measureText(text: string): { width: number } {
    return { width: text.length * 6 };
  }

  createRadialGradient(): Ctx2DGradient {
    this.gradientCalls++;
    return { addColorStop: () => {} };
  }

  drawImage(): void {
    this.drawImageCalls++;
  }

  getImageData(x: number, y: number, w: number, h: number): Ctx2DImageData {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const srcIdx = ((y + yy) * this.width + (x + xx)) * 4;
        const dstIdx = (yy * w + xx) * 4;
        for (let c = 0; c < 4; c++) data[dstIdx + c] = this.buf[srcIdx + c] ?? 0;
      }
    }
    return { data, width: w, height: h };
  }
}
