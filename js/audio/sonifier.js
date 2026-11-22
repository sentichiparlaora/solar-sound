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

export const DEFAULT_VOICE = { lowHz: 110, highHz: 880, wave: 'sine', sub: 0.25 };

class Voice {
  constructor(ctx, destination, options = {}) {
    const { lowHz, highHz, wave, sub } = { ...DEFAULT_VOICE, ...options };
    this.ctx = ctx;
    this.lowHz = lowHz;
    this.highHz = highHz;
    this.enabled = true;
    this.volume = MIN_GAIN;

    this.sine = new OscillatorNode(ctx, { type: wave }); // the soft, "dark" wave
    this.saw = new OscillatorNode(ctx, { type: 'sawtooth' });
    this.sub = new OscillatorNode(ctx, { type: 'triangle' }); // octave below, adds body

    this.sineGain = new GainNode(ctx, { gain: 1 });
    this.sawGain = new GainNode(ctx, { gain: 0 });
    this.subGain = new GainNode(ctx, { gain: sub });

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
    const ramp = (param, value) => this.ramp(param, value, glide);

    if (pitch != null) {
      const f = toFrequency(clamp(pitch), this.lowHz, this.highHz);
      ramp(this.sine.frequency, f);
      ramp(this.saw.frequency, f);
      ramp(this.sub.frequency, f / 2);
    }
    if (volume != null) {
      this.volume = MIN_GAIN + clamp(volume) * (MAX_GAIN - MIN_GAIN);
      if (this.enabled) ramp(this.out.gain, this.volume);
    }
    if (timbre != null) {
      const b = clamp(timbre);
      ramp(this.filter.frequency, toFrequency(b, 300, 6000));
      ramp(this.sawGain.gain, 0.05 + 0.6 * b);
      ramp(this.sineGain.gain, 1 - 0.6 * b);
    }
  }

  ramp(param, value, glide) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.setTargetAtTime(value, now, glide / 3); // ~95% after 3 time constants
  }

  /** Mute or unmute this voice without losing its state. */
  setEnabled(on) {
    this.enabled = on;
    this.ramp(this.out.gain, on ? this.volume : 0, 0.6);
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
    this.options = new Map();  // voice options per source
    this.enabled = new Map();  // mix on/off per source
    this.pending = new Map();  // last controls received, replayed on start
  }

  /** Declare a source's voice options before audio starts. */
  register(sourceId, voiceOptions = {}) {
    this.options.set(sourceId, { ...DEFAULT_VOICE, ...voiceOptions });
    this.enabled.set(sourceId, true);
  }

  setEnabled(sourceId, on) {
    this.enabled.set(sourceId, on);
    if (this.running && this.voices.has(sourceId)) this.voices.get(sourceId).setEnabled(on);
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
    for (const [id, controls] of this.pending) {
      const v = this.voice(id);
      v.enabled = this.enabled.get(id) ?? true;
      v.set(controls, 1.5);
    }
  }

  async stop() {
    if (!this.ctx) return;
    for (const v of this.voices.values()) v.fadeOut();
    await new Promise((r) => setTimeout(r, 650));
    await this.ctx.suspend();
  }

  voice(id) {
    if (!this.voices.has(id)) this.voices.set(id, new Voice(this.ctx, this.master, this.options.get(id)));
    return this.voices.get(id);
  }

  /** Update the controls of the voice belonging to a source. */
  update(sourceId, controls) {
    this.pending.set(sourceId, { ...this.pending.get(sourceId), ...controls });
    if (this.running) this.voice(sourceId).set(controls);
  }

  frequencyOf(sourceId) {
    const p = this.pending.get(sourceId)?.pitch;
    const { lowHz, highHz } = this.options.get(sourceId) ?? DEFAULT_VOICE;
    return p == null ? null : toFrequency(p, lowHz, highHz);
  }
}
