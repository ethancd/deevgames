export const EFFECTS = ['move', 'attack', 'capture', 'phase', 'arrive', 'promote', 'turnEnd', 'turnStart'] as const;
export type SoundEffect = typeof EFFECTS[number];

// Dry, quiet tabletop percussion. No samples, reverb, music, or network requests.
const LENGTH: Record<SoundEffect, number> = {
  move: .085, attack: .095, capture: .12, phase: .14,
  arrive: .115, promote: .14, turnEnd: .075, turnStart: .12,
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

  play(effects: readonly SoundEffect[]) {
    const context = this.context;
    if (!this.enabled || !this.volume || document.hidden || context?.state !== 'running' || !this.gain) return;
    // One cue per visible event; duplicate arrivals/captures never make a loud pileup.
    [...new Set(effects)].slice(0, 3).forEach((effect, i) => {
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
    if (document.hidden) {
      this.stop();
      void this.context?.suspend().catch(() => {});
    } else if (this.context) this.unlock();
  };

  dispose() {
    this.stop();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.buffers.clear();
  }
}
