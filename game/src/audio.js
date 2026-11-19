// audio.js — every sound in Solara Heat is synthesized with Web Audio: there is not
// one audio file in the game. A two-oscillator engine whose pitch follows the car's
// speed, a two-tone siren that fades with distance, noise-burst gunshots, soft UI
// blips, pickup chimes, a mission jingle, and underneath it all a slow sunset pad —
// four detuned triangles breathing through the same chords a beach bar would play.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.padTimer = 0;
    this.started = false;
  }

  // Browsers only let audio start after a gesture; the start screen's button calls
  // this, and screenshot staging calls it too (muted by the capture anyway).
  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngine();
    this.startSiren();
    this.started = true;
  }

  startEngine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 28;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    sub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    sub.start();
    this.engineSub = sub;
  }

  // speedRatio 0..1, throttle 0..1; silent on foot.
  engine(speedRatio, throttle, dt) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const target = throttle > 0.02 ? 0.05 + speedRatio * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.09);
    const freq = 52 + speedRatio * 165 + throttle * 12;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.06);
    this.engineSub.frequency.setTargetAtTime(freq / 2, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(280 + speedRatio * 900, t, 0.1);
    void dt;
  }

  startSiren() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenPhase = 0;
  }

  // nearestCop: metres to the closest police unit, or Infinity when the coast is clear.
  siren(nearestCop, dt) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    if (!Number.isFinite(nearestCop)) {
      this.sirenGain.gain.setTargetAtTime(0, t, 0.2);
      return;
    }
    const closeness = Math.max(0, 1 - nearestCop / 90);
    this.sirenGain.gain.setTargetAtTime(closeness * 0.055, t, 0.15);
    this.sirenPhase += dt * 2.4;
    const tone = this.sirenPhase % 1 < 0.5 ? 660 : 880;
    this.sirenOsc.frequency.setTargetAtTime(tone, t, 0.03);
  }

  blip(freq, dur, gain, type = 'sine', when = 0) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  gunshot(friendly) {
    if (!this.started) return;
    const ctx = this.ctx;
    const dur = 0.16;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = friendly ? 2600 : 1700;
    const g = ctx.createGain();
    g.gain.value = friendly ? 0.5 : 0.3;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
  }

  pickup() {
    this.blip(880, 0.12, 0.18);
    this.blip(1318, 0.18, 0.16, 'sine', 0.07);
  }

  cashRegister() {
    this.blip(1046, 0.1, 0.16, 'triangle');
    this.blip(1568, 0.22, 0.16, 'triangle', 0.08);
  }

  missionDone() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this.blip(n, 0.24, 0.16, 'triangle', i * 0.11));
  }

  busted() {
    const notes = [392, 330, 262];
    notes.forEach((n, i) => this.blip(n, 0.3, 0.18, 'sawtooth', i * 0.16));
  }

  uiClick() {
    this.blip(660, 0.06, 0.1, 'square');
  }

  // The sunset pad: a slow I–vi–IV–V in A major, re-voiced every eight seconds.
  pad(dt) {
    if (!this.started) return;
    this.padTimer -= dt;
    if (this.padTimer > 0) return;
    this.padTimer = 8;
    const chords = [
      [220, 277, 330],
      [175, 220, 262],
      [147, 185, 220],
      [165, 208, 247],
    ];
    this.padChord = ((this.padChord || 0) + 1) % chords.length;
    const ctx = this.ctx;
    for (const freq of chords[this.padChord]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.004);
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.028, t + 2.2);
      g.gain.linearRampToValueAtTime(0, t + 7.8);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 8);
    }
  }
}
