import type { Element } from '../game/types';
export const EFFECTS = ['move', 'attack', 'capture', 'phase', 'arrive', 'promote', 'turnEnd', 'turnStart', 'yourTurn', 'opponentAction',
  'hint', 'collect', 'reveal', 'checkmate', 'wrong',
  'killFire', 'killLightning', 'killWater', 'killShadow', 'killPlant', 'killMetal'] as const;
export type SoundEffect = typeof EFFECTS[number];
/** One short kill layer per attacker element; `play(…, { rate })` pitches it by magnitude. */
export const KILL_SOUND: Record<Element, SoundEffect> = {
  fire: 'killFire', lightning: 'killLightning', water: 'killWater', shadow: 'killShadow', plant: 'killPlant', metal: 'killMetal',
};

/** Cues that must reach the player even on a hidden tab: a background-safe "your move"
 * chime and a soft tick for an opponent's in-progress action. Every other effect follows
 * the visible board only, exactly as before. */
const BACKGROUND_SAFE = new Set<SoundEffect>(['yourTurn', 'opponentAction']);

// Dry, quiet tabletop percussion. No samples, reverb, music, or network requests.
const LENGTH: Record<SoundEffect, number> = {
  move: .085, attack: .095, capture: .12, phase: .14,
  arrive: .115, promote: .14, turnEnd: .075, turnStart: .12,
  yourTurn: .26, opponentAction: .055,
  hint: .2, collect: .07, reveal: .28, checkmate: .3, wrong: .08,
  killFire: .16, killLightning: .13, killWater: .15, killShadow: .18, killPlant: .14, killMetal: .2,
};

export function effectSamples(effect: SoundEffect, sampleRate: number): Float32Array {
  const samples = new Float32Array(Math.ceil(LENGTH[effect] * sampleRate));
  let seed = 1937, softNoise = 0;
  const tap = (t: number, frequency: number, decay: number, weight = 1) => {
    if (t < 0) return 0;
    const envelope = Math.min(1, t / .0015) * Math.exp(-t / decay);
    return weight * envelope * (Math.sin(2 * Math.PI * frequency * t) * .65
      + Math.sin(2 * Math.PI * frequency * 2.73 * t) * .2 + softNoise * .35);
  };
  // A pure bell partial for the chimes; no noise, so it reads as light rather than wood.
  const tone = (t: number, frequency: number, decay: number, weight = 1) => t < 0 ? 0
    : weight * Math.min(1, t / .002) * Math.exp(-t / decay) * (Math.sin(2 * Math.PI * frequency * t) * .8 + Math.sin(2 * Math.PI * frequency * 2 * t) * .12);
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    softNoise += .28 * ((seed / 0x80000000 - 1) - softNoise);
    let value = 0;
    switch (effect) {
      case 'move': value = tap(t, 360, .014); break;
      case 'attack': value = tap(t, 270, .018) + tap(t - .012, 630, .008, .25); break;
      case 'capture': value = tap(t, 220, .022) + tap(t - .025, 480, .011, .55); break;
      case 'phase': value = softNoise * Math.sin(Math.PI * t / LENGTH.phase) ** 2 * .8 + tap(t - .105, 590, .008, .18); break;
      case 'arrive': value = tap(t, 310, .02) + tap(t - .025, 720, .011, .25); break;
      case 'promote': value = tap(t, 440, .012, .7) + tap(t - .045, 660, .017, .65); break;
      case 'turnEnd': value = tap(t, 240, .012, .65); break;
      case 'turnStart': value = tap(t, 510, .016, .65) + tap(t - .035, 510, .012, .35); break;
      // A rising two-note chime, clearly distinct from the visible-tab turnStart tap.
      case 'yourTurn': value = tap(t, 480, .05, .6) + tap(t - .1, 720, .09, .65); break;
      // A single soft tick, quieter and shorter than an ordinary move.
      case 'opponentAction': value = tap(t, 300, .012, .4); break;
      // Onboarding cues: a soft high chime, a crystal tick, a rising shimmer, a short fanfare, a dull miss.
      case 'hint': value = tone(t, 880, .05, .35) + tone(t - .07, 1320, .06, .3); break;
      case 'collect': value = tone(t, 1560, .012, .45) + tone(t - .022, 2340, .01, .3); break;
      case 'reveal': value = tone(t, 523, .05, .3) + tone(t - .06, 659, .05, .3) + tone(t - .12, 784, .07, .35); break;
      case 'checkmate': value = tap(t, 392, .03, .5) + tone(t - .05, 523, .04, .45) + tone(t - .1, 659, .04, .45) + tone(t - .15, 784, .06, .55) + tone(t - .15, 1047, .06, .3); break;
      case 'wrong': value = tap(t, 150, .02, .55); break;
      // Kill layers: one timbre per attacker element, laid over the existing capture tap.
      case 'killFire': value = softNoise * Math.exp(-t / .05) * 1.4 + tap(t, 140, .03, .6); break;
      case 'killLightning': value = Math.sin(2 * Math.PI * (2400 * t - 7000 * t * t)) * Math.exp(-t / .03) * .6 + softNoise * Math.exp(-t / .02); break;
      case 'killWater': value = Math.sin(2 * Math.PI * (300 * t + 2600 * t * t)) * Math.exp(-t / .04) * .7 + tap(t - .03, 900, .012, .25); break;
      case 'killShadow': value = Math.sin(2 * Math.PI * (220 * t - 280 * t * t)) * Math.min(1, t / .02) * Math.exp(-t / .07) * .7; break;
      case 'killPlant': value = tap(t, 330, .014, .6) + tap(t - .04, 250, .018, .55) + tap(t - .075, 420, .012, .3); break;
      case 'killMetal': value = Math.exp(-t / .07) * (Math.sin(2 * Math.PI * 1180 * t) * .35 + Math.sin(2 * Math.PI * 1710 * t) * .25 + Math.sin(2 * Math.PI * 2590 * t) * .15) * Math.min(1, t / .001) + tap(t, 200, .015, .4); break;
    }
    // Gentle onset and a forced fade to zero prevent clicks at buffer boundaries.
    const fade = Math.min(1, i / (sampleRate * .001), (samples.length - 1 - i) / (sampleRate * .012));
    samples[i] = Math.max(-.25, Math.min(.25, value * .24)) * fade;
  }
  return samples;
}

export class SoundEngine {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private buffers = new Map<SoundEffect, AudioBuffer>();
  private sources = new Set<AudioBufferSourceNode>();
  private enabled = true;
  private volume = .35;

  configure(enabled: boolean, volume: number) {
    this.enabled = enabled;
    this.volume = volume;
    if (!enabled || !volume) this.stop();
    if (this.context && this.gain) this.gain.gain.setTargetAtTime(volume, this.context.currentTime, .01);
  }

  /** Called from a user gesture. A denied/interrupted context never queues sounds. */
  unlock = () => {
    if (!this.enabled || document.hidden) return;
    try {
      if (!this.context) {
        const Audio = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Audio) return;
        this.context = new Audio();
        this.gain = this.context.createGain();
        this.gain.gain.value = this.volume;
        this.gain.connect(this.context.destination);
      }
      if (this.context.state !== 'running') void this.context.resume().catch(() => {});
    } catch { /* Audio must never interrupt a game on an unsupported device. */ }
  };

  /** `rate` repitches the whole call (a heavier blow plays lower). */
  play(effects: readonly SoundEffect[], options: { rate?: number } = {}) {
    const context = this.context;
    if (!this.enabled || !this.volume || context?.state !== 'running' || !this.gain) return;
    // Every other effect still follows the visible board; only the background-safe
    // "your move"/opponent-action cues may reach a hidden tab. Never resume/create
    // the context here — that only ever happens from a user gesture in unlock().
    const playable = document.hidden ? effects.filter(effect => BACKGROUND_SAFE.has(effect)) : effects;
    if (!playable.length) return;
    // One cue per visible event; duplicate arrivals/captures never make a loud pileup.
    [...new Set(playable)].slice(0, 3).forEach((effect, i) => {
      try {
        let buffer = this.buffers.get(effect);
        if (!buffer) {
          const samples = effectSamples(effect, context.sampleRate);
          buffer = context.createBuffer(1, samples.length, context.sampleRate);
          buffer.getChannelData(0).set(samples);
          this.buffers.set(effect, buffer);
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        if (options.rate && options.rate !== 1 && source.playbackRate) source.playbackRate.value = options.rate;
        source.connect(this.gain!);
        source.onended = () => { this.sources.delete(source); source.disconnect(); };
        this.sources.add(source);
        source.start(context.currentTime + i * .085);
      } catch { /* Device audio can disappear independently of the room. */ }
    });
  }

  stop() {
    for (const source of this.sources) {
      try { source.stop(); source.disconnect(); } catch { /* Already ended. */ }
    }
    this.sources.clear();
  }

  visibilityChanged = () => {
    // Cut off whatever was audibly playing, but leave the context running (never
    // suspend it) so a background-safe cue can still be scheduled while hidden.
    if (document.hidden) this.stop();
    else if (this.context) this.unlock();
  };

  dispose() {
    this.stop();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.buffers.clear();
  }
}
