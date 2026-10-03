import { useCallback, useEffect, useImperativeHandle, useRef, type RefObject } from 'react';
import type { Element } from '../game/types';
import { ELEMENT_HEX } from '../utils/colors';
import { ARMY_COLORS, ELEMENT_LOOK, MAGNITUDE_SCALE, particleCount, shakeFor, type BoardEffect, type ParticleShape } from './effectModel';

export interface BoardEffectsHandle { emit: (effect: BoardEffect) => void }

/** `emit` is stable; it is a no-op until the layer mounts. */
export function useBoardEffects() {
  const handle = useRef<BoardEffectsHandle | null>(null);
  const emit = useCallback((effect: BoardEffect) => handle.current?.emit(effect), []);
  return { handle, emit };
}

interface Particle {
  shape: ParticleShape; color: string;
  x: number; y: number; vx: number; vy: number;
  size: number; grow: number; rot: number; vr: number;
  gravity: number; drag: number; born: number; life: number; alpha: number;
  /** Flight from (x, y) to a destination along a curve, for crystal lights. */
  path?: { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number };
  points?: [number, number][];
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const tint = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
};
const LIGHTER: Record<Element, string> = {
  fire: '#ffd27a', lightning: '#ffffff', water: '#bfe3ff', shadow: '#2a1846', plant: '#d9f99d', metal: '#fff4d6',
};

/** Absolute, pointer-events-none overlay. Place it inside a positioned element that
 * also contains the board; cells are located by their `cell-x-y` test ids. */
export function BoardEffects({ handle }: { handle: RefObject<BoardEffectsHandle | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const frame = useRef(0);

  const draw = useCallback(() => {
    const element = canvas.current, context = element?.getContext('2d');
    frame.current = 0;
    if (!element || !context) return;
    const now = performance.now(), ratio = window.devicePixelRatio || 1;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, element.width, element.height);
    particles.current = particles.current.filter(p => now - p.born < p.life);
    for (const p of particles.current) {
      const age = now - p.born;
      if (age < 0) continue;
      const t = age / p.life;
      if (p.path) {
        const e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2, u = 1 - e;
        p.x = u * u * p.path.x0 + 2 * u * e * p.path.cx + e * e * p.path.x1;
        p.y = u * u * p.path.y0 + 2 * u * e * p.path.cy + e * e * p.path.y1;
      } else {
        p.vx *= p.drag; p.vy = p.vy * p.drag + p.gravity; p.x += p.vx; p.y += p.vy;
      }
      p.rot += p.vr;
      const fade = p.alpha * (p.shape === 'glow' || p.shape === 'ring' ? 1 - t : t < .7 ? 1 : 1 - (t - .7) / .3);
      const size = p.size * (1 + p.grow * t);
      context.save();
      context.globalAlpha = Math.max(0, fade);
      context.translate(p.x, p.y); context.rotate(p.rot);
      paint(context, p, size, t);
      context.restore();
    }
    if (particles.current.length) frame.current = requestAnimationFrame(draw);
    else context.clearRect(0, 0, element.width, element.height);
  }, []);

  const fit = useCallback(() => {
    const element = canvas.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
    if (element.width !== Math.round(width * ratio)) element.width = Math.round(width * ratio);
    if (element.height !== Math.round(height * ratio)) element.height = Math.round(height * ratio);
  }, []);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(element);
    fit();
    return () => { observer?.disconnect(); cancelAnimationFrame(frame.current); };
  }, [fit]);

  const emit = useCallback((effect: BoardEffect) => {
    const element = canvas.current;
    const host = element?.parentElement;
    if (!element || !host) return;
    fit();
    const origin = element.getBoundingClientRect();
    const locate = (x: number, y: number) => {
      const cell = host.querySelector(`[data-testid="cell-${x}-${y}"]`)?.getBoundingClientRect();
      return cell ? { x: cell.left - origin.left + cell.width / 2, y: cell.top - origin.top + cell.height / 2, size: cell.width } : null;
    };
    const at = locate(effect.x, effect.y);
    if (!at) return;
    const now = performance.now(), reduced = reducedMotion(), out = particles.current;
    const add = (p: Partial<Particle> & Pick<Particle, 'shape' | 'color'>) => out.push({
      x: at.x, y: at.y, vx: 0, vy: 0, size: at.size * .1, grow: 0, rot: 0, vr: 0, gravity: 0, drag: .96,
      born: now, life: 500, alpha: 1, ...p,
    });
    const s = at.size / 60;
    if (effect.kind === 'hit' || effect.kind === 'kill') {
      const color = ELEMENT_HEX[effect.attackerElement], scale = MAGNITUDE_SCALE[effect.magnitude], kill = effect.kind === 'kill';
      if (reduced) { add({ shape: 'glow', color, size: at.size * .55 * scale, life: 260, alpha: .8 }); return start(); }
      const look = ELEMENT_LOOK[effect.attackerElement];
      add({ shape: 'glow', color: kill ? LIGHTER[effect.attackerElement] : color, size: at.size * (kill ? .75 : .5) * scale, grow: .6, life: 300 * scale, alpha: kill ? 1 : .75 });
      if (effect.attackerElement === 'lightning') {
        for (let i = 0; i < (kill ? 3 : 2); i++) add({ shape: 'bolt', color: i ? color : '#ffffff', life: 220 + i * 60, size: at.size,
          points: bolt(0, -at.size * 1.6 * scale, at.size * .06, 7) , x: at.x + rand(-4, 4) * s });
      }
      if (effect.attackerElement === 'water' || effect.attackerElement === 'shadow') {
        for (let i = 0; i < (kill ? 3 : 2); i++) add({ shape: 'ring', color: effect.attackerElement === 'water' ? color : '#4c1d95',
          size: at.size * .2, grow: 3.2 * scale, life: (520 + i * 160) * scale, born: now + i * 90, alpha: .9 });
      }
      for (let i = 0, n = particleCount(effect.attackerElement, effect.magnitude, effect.kind); i < n; i++) {
        const angle = look.particle === 'ember' ? rand(-Math.PI * .95, -Math.PI * .05) : rand(0, Math.PI * 2);
        const speed = look.speed * rand(.4, 1.1) * Math.sqrt(scale) * s * (kill ? 1.25 : 1);
        add({ shape: look.particle, color: i % 3 ? color : LIGHTER[effect.attackerElement],
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, gravity: look.gravity * s, drag: look.particle === 'ink' ? .93 : .955,
          size: at.size * (look.particle === 'ink' ? rand(.12, .22) : rand(.035, .07)) * Math.sqrt(scale), grow: look.particle === 'ink' ? 1.8 : 0,
          rot: rand(0, Math.PI * 2), vr: rand(-.2, .2), life: look.life * scale * rand(.7, 1.15), alpha: look.particle === 'ink' ? .55 : 1 });
      }
      if (kill) {
        // Token shatter: the defender's counter breaks into its army's colors.
        const shards = ARMY_COLORS[effect.defenderOwner ?? 'black'];
        for (let i = 0; i < Math.round(12 * scale); i++) {
          const angle = rand(0, Math.PI * 2), speed = rand(1.5, 4.2) * s * Math.sqrt(scale);
          add({ shape: 'shard', color: shards[i % 2], vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1.5 * s,
            gravity: .28 * s, size: at.size * rand(.07, .13), rot: rand(0, 6), vr: rand(-.3, .3), life: 700 * scale });
        }
      }
      shake(host, shakeFor(effect.magnitude, effect.kind), 260 * scale);
    } else if (effect.kind === 'collect') {
      const to = effect.to ? locate(effect.to.x, effect.to.y) : null;
      const end = to ?? { x: at.x, y: -at.size * .5 };
      for (let i = 0; i < effect.count; i++) {
        const x0 = at.x + (i - (effect.count - 1) / 2) * at.size * .18, y0 = at.y;
        if (reduced) { add({ shape: 'glow', color: '#9fe8ff', x: x0, size: at.size * .3, life: 260, born: now + i * 120 }); continue; }
        add({ shape: 'light', color: '#bff4ff', x: x0, y: y0, size: at.size * .12, life: 760, born: now + i * 160, drag: 1,
          path: { x0, y0, cx: x0 + (i - 1) * at.size * .8, cy: Math.min(y0, end.y) - at.size * 1.2, x1: end.x, y1: end.y } });
      }
    } else if (effect.kind === 'checkmate') {
      const colors = ARMY_COLORS[effect.winner];
      add({ shape: 'glow', color: '#f5d780', size: at.size * 1.2, grow: 2.5, life: reduced ? 300 : 900, alpha: .9 });
      if (reduced) return start();
      add({ shape: 'ring', color: '#f5d780', size: at.size * .3, grow: 9, life: 1000 });
      const width = origin.width, height = origin.height;
      for (let i = 0; i < 90; i++) {
        const angle = rand(0, Math.PI * 2), speed = rand(2, 9) * s;
        add({ shape: 'confetti', color: colors[i % colors.length], vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 3 * s,
          gravity: .18 * s, drag: .965, size: at.size * rand(.08, .14), rot: rand(0, 6), vr: rand(-.25, .25), life: rand(1400, 2200) });
      }
      for (let i = 0; i < 70; i++) add({ shape: 'confetti', color: colors[i % colors.length], x: rand(0, width), y: rand(-height * .3, -10),
        vx: rand(-.6, .6), vy: rand(1, 3), gravity: .05, drag: .99, size: at.size * rand(.07, .12), rot: rand(0, 6), vr: rand(-.2, .2),
        born: now + rand(0, 700), life: rand(1800, 2600) });
      shake(host, 4, 380);
    } else if (effect.kind === 'reveal') {
      add({ shape: 'glow', color: '#f5d780', size: at.size * 1.4, grow: 1.5, life: reduced ? 260 : 900, alpha: .7 });
      if (!reduced) add({ shape: 'ring', color: '#f5d780', size: at.size * .5, grow: 5, life: 900, alpha: .8 });
    }
    start();
    function start() { if (!frame.current) frame.current = requestAnimationFrame(draw); }
  }, [draw, fit]);

  useImperativeHandle(handle, () => ({ emit }), [emit]);
  return <canvas ref={canvas} className="board-effects" aria-hidden="true" data-testid="board-effects" />;
}

function bolt(x: number, y: number, jitter: number, steps: number): [number, number][] {
  const points: [number, number][] = [[x, y]];
  for (let i = 1; i <= steps; i++) points.push([x + (i === steps ? 0 : rand(-1, 1) * jitter * 4), y * (1 - i / steps)]);
  return points;
}

function shake(host: HTMLElement, pixels: number, duration: number) {
  if (!pixels || reducedMotion()) return;
  const board = host.querySelector<HTMLElement>('.battle-board');
  board?.animate?.([0, 1, -1, .6, -.6, .3, 0].map((k, i) => ({ transform: `translate(${k * pixels * (i % 2 ? 1 : -.7)}px, ${k * pixels * .5}px)` })),
    { duration, easing: 'ease-out' });
}

function paint(context: CanvasRenderingContext2D, p: Particle, size: number, t: number) {
  context.fillStyle = p.color; context.strokeStyle = p.color;
  switch (p.shape) {
    case 'glow': {
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, size);
      gradient.addColorStop(0, tint(p.color, .95)); gradient.addColorStop(.35, tint(p.color, .5)); gradient.addColorStop(1, tint(p.color, 0));
      context.fillStyle = gradient; context.beginPath(); context.arc(0, 0, size, 0, Math.PI * 2); context.fill(); break;
    }
    case 'ring': context.lineWidth = Math.max(1, size * .12 * (1 - t)); context.beginPath(); context.arc(0, 0, size, 0, Math.PI * 2); context.stroke(); break;
    case 'ember': case 'spark': case 'light': {
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, size * 2.2);
      gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.3, p.color); gradient.addColorStop(1, tint(p.color, 0));
      context.fillStyle = gradient; context.beginPath(); context.arc(0, 0, size * 2.2, 0, Math.PI * 2); context.fill();
      if (p.shape === 'light') { context.fillStyle = '#ffffff'; context.beginPath(); context.moveTo(0, -size); context.lineTo(size * .6, 0); context.lineTo(0, size); context.lineTo(-size * .6, 0); context.fill(); }
      break;
    }
    case 'droplet': context.beginPath(); context.ellipse(0, 0, size * .7, size * 1.1, 0, 0, Math.PI * 2); context.fill(); break;
    case 'ink': context.fillStyle = tint('#1e0b3a', .7); context.beginPath(); context.arc(0, 0, size, 0, Math.PI * 2); context.fill();
      context.fillStyle = tint(p.color, .45); context.beginPath(); context.arc(size * .2, -size * .15, size * .6, 0, Math.PI * 2); context.fill(); break;
    case 'leaf': context.beginPath(); context.ellipse(0, 0, size * 1.5, size * .65, 0, 0, Math.PI * 2); context.fill();
      context.strokeStyle = tint('#14532d', .7); context.lineWidth = Math.max(.5, size * .15); context.beginPath(); context.moveTo(-size * 1.3, 0); context.lineTo(size * 1.3, 0); context.stroke(); break;
    case 'shard': context.beginPath(); context.moveTo(0, -size * 1.4); context.lineTo(size * .55, size * .8); context.lineTo(-size * .45, size * .5); context.closePath(); context.fill(); break;
    case 'confetti': context.fillRect(-size * .5, -size * .25, size, size * .5 * Math.abs(Math.cos(p.rot * 3)) + 1); break;
    case 'bolt': if (p.points) {
      context.lineWidth = Math.max(1.5, p.size * .045); context.lineJoin = 'round'; context.shadowColor = p.color; context.shadowBlur = p.size * .25;
      context.beginPath(); p.points.forEach(([x, y], i) => i ? context.lineTo(x, y) : context.moveTo(x, y)); context.stroke();
    } break;
  }
}
