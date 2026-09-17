import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EFFECTS, SoundEngine, effectSamples } from '../src/sound/effects';
import { SoundControls, SoundProvider } from '../src/sound/SoundProvider';

class FakeAudio {
  static instances:FakeAudio[]=[];
  state:AudioContextState='suspended'; currentTime=10; sampleRate=48000; destination={};
  sources:{start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>}[]=[];
  gain={gain:{value:0,setTargetAtTime:vi.fn()},connect:vi.fn()};
  constructor(){FakeAudio.instances.push(this);}
  createGain(){return this.gain;}
  resume=vi.fn(async()=>{this.state='running';});
  suspend=vi.fn(async()=>{this.state='suspended';});
  close=vi.fn(async()=>{this.state='closed';});
  createBuffer=vi.fn((_channels:number,length:number)=>({getChannelData:()=>new Float32Array(length)}));
  createBufferSource(){const source={start:vi.fn(),stop:vi.fn(),connect:vi.fn(),disconnect:vi.fn(),onended:null,buffer:null};this.sources.push(source);return source;}
}
beforeEach(()=>{localStorage.clear();FakeAudio.instances=[];vi.stubGlobal('AudioContext',FakeAudio);});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});

it.each(EFFECTS)('%s is short, bounded, finite and fades fully to silence',effect=>{
  const samples=effectSamples(effect,48000);
  expect(samples.length/48000).toBeLessThanOrEqual(.15);
  expect(Math.abs(samples[0])).toBe(0);expect(Math.abs(samples.at(-1)!)).toBe(0);
  let peak=0,energy=0;
  for(const sample of samples){expect(Number.isFinite(sample)).toBe(true);peak=Math.max(peak,Math.abs(sample));energy+=sample*sample;}
  expect(peak).toBeGreaterThan(.02);expect(peak).toBeLessThanOrEqual(.25);
  expect(Math.sqrt(energy/samples.length)*.35).toBeLessThan(.025);
});

it('waits for a gesture, caches buffers, limits layering, and cancels scheduled sounds on mute',()=>{
  const engine=new SoundEngine();engine.play(['move']);
  expect(FakeAudio.instances).toHaveLength(0);
  engine.unlock();const context=FakeAudio.instances[0];
  engine.play(['move']);engine.play(['move']);
  expect(context.createBuffer).toHaveBeenCalledTimes(1);
  engine.play(['turnEnd','arrive','arrive','turnStart']);
  expect(context.sources.slice(2).map(s=>s.start.mock.calls[0][0])).toEqual([10,10.085,10.17]);
  engine.configure(false,.35);
  expect(context.sources.every(s=>s.stop.mock.calls.length===1)).toBe(true);
  engine.play(['move']);expect(context.sources).toHaveLength(5);
  engine.dispose();expect(context.close).toHaveBeenCalledTimes(1);
});

it('stops when hidden, resumes only a previously unlocked context and never queues blocked sound',()=>{
  const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(false);
  const engine=new SoundEngine();engine.visibilityChanged();expect(FakeAudio.instances).toHaveLength(0);
  engine.unlock();const context=FakeAudio.instances[0];engine.play(['move']);
  hidden.mockReturnValue(true);engine.visibilityChanged();engine.play(['capture']);
  expect(context.sources[0].stop).toHaveBeenCalled();expect(context.sources).toHaveLength(1);
  hidden.mockReturnValue(false);engine.visibilityChanged();expect(context.resume).toHaveBeenCalledTimes(2);
  context.state='suspended';engine.play(['move']);expect(context.sources).toHaveLength(1);
  engine.dispose();
});

it('persists a separate effects toggle and level, including silent reloads',()=>{
  localStorage.setItem('muju:music:v1',JSON.stringify({muted:false,volume:.8}));
  const view=render(<SoundProvider><SoundControls/></SoundProvider>);
  expect(FakeAudio.instances).toHaveLength(0);
  fireEvent.pointerDown(screen.getByRole('button',{name:'Test sound'}));
  fireEvent.click(screen.getByRole('button',{name:'Test sound'}));
  expect(FakeAudio.instances[0].sources).toHaveLength(1);
  fireEvent.change(screen.getByRole('slider',{name:'Effects volume'}),{target:{value:'.2'}});
  fireEvent.click(screen.getByRole('button',{name:'Sound effects'}));
  expect(JSON.parse(localStorage.getItem('muju:sfx:v1')!)).toEqual({enabled:false,volume:.2});
  expect(JSON.parse(localStorage.getItem('muju:music:v1')!).volume).toBe(.8);
  view.unmount();
  render(<SoundProvider><SoundControls/></SoundProvider>);
  expect(screen.getByRole('button',{name:'Sound effects'})).toHaveAttribute('aria-pressed','false');
  expect(screen.getByRole('slider',{name:'Effects volume'})).toHaveValue('0.2');
  expect(screen.getByRole('button',{name:'Test sound'})).toBeDisabled();
  fireEvent.pointerDown(window);expect(FakeAudio.instances).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Sound effects'}));
  expect(FakeAudio.instances).toHaveLength(2);
});

it('survives unavailable audio and malformed or inaccessible storage',()=>{
  vi.stubGlobal('AudioContext',undefined);
  localStorage.setItem('muju:sfx:v1','{bad');
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});
  render(<SoundProvider><SoundControls/></SoundProvider>);
  expect(screen.getByRole('slider',{name:'Effects volume'})).toHaveValue('0.35');
  fireEvent.pointerDown(window);fireEvent.click(screen.getByRole('button',{name:'Test sound'}));
  fireEvent.click(screen.getByRole('button',{name:'Sound effects'}));
  expect(screen.getByRole('button',{name:'Sound effects'})).toHaveAttribute('aria-pressed','false');
});
