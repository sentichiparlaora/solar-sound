// Web Audio sonification engine.
//
// One Sonifier owns the AudioContext and a master bus. Each data source gets
// its own Voice, driven by three normalized controls (0..1):
//   pitch  -> oscillator frequency (log scale)
//   volume -> voice loudness
//   timbre -> low-pass cutoff + blend from a soft sine to a bright sawtooth

import { clamp, toFrequency } from '../util/scale.js';

const GLIDE_S = 3;          // time constant feel for transitions
const MIN_GAIN = 0.04;      // never fully silent while playing
const MAX_GAIN = 0.35;

class Voice {
  constructor(ctx, destination, { lowHz = 110, highHz = 880 } = {}) {
    this.ctx = ctx;
    this.lowHz = lowHz;
    this.highHz = highHz;

    this.sine = new OscillatorNode(ctx, { type: 'sine' });
    this.saw = new OscillatorNode(ctx, { type: 'sawtooth' });
    this.sub = new OscillatorNode(ctx, { type: 'triangle' }); // octave below, adds body

    this.sineGain = new GainNode(ctx, { gain: 1 });
    this.sawGain = new GainNode(ctx, { gain: 0 });
    this.subGain = new GainNode(ctx, { gain: 0.25 });

    this.filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 800, Q: 0.7 });
    this.out = new GainNode(ctx, { gain: 0 });

    // Slow tremolo so a steady value is not a flat tone.
    this.lfo = new OscillatorNode(ctx, { type: 'sine', frequency: 0.18 });
    this.lfoDepth = new GainNode(ctx, { gain: 0.08 });
    this.tremolo = new GainNode(ctx, { gain: 1 });
    this.lfo.connect(this.lfoDepth).connect(this.tremolo.gain);

    this.sine.connect(this.sineGain).connect(this.filter);
    this.saw.connect(this.sawGain).connect(this.filter);
    this.sub.connect(this.subGain).connect(this.filter);
    this.filter.connect(this.tremolo).connect(this.out).connect(destination);

    for (const o of [this.sine, this.saw, this.sub, this.lfo]) o.start();
  }

  /** Smoothly move to new controls. Missing controls keep their last value. */
  set({ pitch, volume, timbre }, glide = GLIDE_S) {
    const now = this.ctx.currentTime;
    const tc = glide / 3; // setTargetAtTime reaches ~95% after 3 time constants
    const ramp = (param, value) => {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.setTargetAtTime(value, now, tc);
    };

    if (pitch != null) {
      const f = toFrequency(clamp(pitch), this.lowHz, this.highHz);
      this.frequency = f;
      ramp(this.sine.frequency, f);
      ramp(this.saw.frequency, f);
      ramp(this.sub.frequency, f / 2);
    }
    if (volume != null) {
      ramp(this.out.gain, MIN_GAIN + clamp(volume) * (MAX_GAIN - MIN_GAIN));
    }
    if (timbre != null) {
      const b = clamp(timbre);
      ramp(this.filter.frequency, toFrequency(b, 300, 6000));
      ramp(this.sawGain.gain, 0.05 + 0.6 * b);
      ramp(this.sineGain.gain, 1 - 0.6 * b);
    }
  }

  fadeOut(seconds = 0.6) {
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + seconds);
  }
}

export class Sonifier {
  constructor() {
    this.ctx = null;
    this.voices = new Map();
    this.pending = new Map(); // last controls received before audio started
  }

  get running() {
    return this.ctx?.state === 'running';
  }

  /** Must be called from a user gesture (click). */
  async start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = new GainNode(this.ctx, { gain: 0.9 });
      this.compressor = new DynamicsCompressorNode(this.ctx, { threshold: -18, ratio: 4 });
      this.master.connect(this.compressor).connect(this.ctx.destination);
    }
    await this.ctx.resume();
    for (const [id, controls] of this.pending) this.voice(id).set(controls, 1.5);
  }

  async stop() {
    if (!this.ctx) return;
    for (const v of this.voices.values()) v.fadeOut();
    await new Promise((r) => setTimeout(r, 650));
    await this.ctx.suspend();
  }

  voice(id) {
    if (!this.voices.has(id)) this.voices.set(id, new Voice(this.ctx, this.master));
    return this.voices.get(id);
  }

  /** Update the controls of the voice belonging to a source. */
  update(sourceId, controls) {
    this.pending.set(sourceId, { ...this.pending.get(sourceId), ...controls });
    if (this.running) this.voice(sourceId).set(controls);
  }

  frequencyOf(sourceId, lowHz = 110, highHz = 880) {
    const p = this.pending.get(sourceId)?.pitch;
    return p == null ? null : toFrequency(p, lowHz, highHz);
  }
}
