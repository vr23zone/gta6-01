// All sound is synthesized with Web Audio — no audio files ship with the game.
// A lazy AudioContext (created on the first user gesture, as browsers require), one master
// gain, and small builders for each voice: engine, siren, shots, crashes, pickups, jingles,
// and a slow sunset pad that loops under everything.

/** Create the sound engine. Every method is safe to call before unlock(): it stays silent. */
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineNodes = null;
  let sirenNodes = null;
  let musicTimer = null;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    startMusic();
  }

  function tone(freq, dur, type, gain, slideTo, delay = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp); amp.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, gain, freq, delay = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = freq;
    const amp = ctx.createGain();
    amp.gain.value = gain;
    src.connect(filter); filter.connect(amp); amp.connect(master);
    src.start(t0);
  }

  /** A slow four-chord sunset pad (Cmaj7 – Am7 – Fmaj7 – G6), one chord every six seconds. */
  function startMusic() {
    const chords = [
      [130.81, 196.0, 246.94, 329.63], [110.0, 164.81, 261.63, 329.63],
      [87.31, 174.61, 220.0, 261.63], [98.0, 196.0, 246.94, 293.66],
    ];
    let step = 0;
    const playChord = () => {
      if (!ctx) return;
      const chord = chords[step % chords.length];
      step += 1;
      for (const freq of chord) {
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        amp.gain.setValueAtTime(0.0001, ctx.currentTime);
        amp.gain.linearRampToValueAtTime(0.028, ctx.currentTime + 1.6);
        amp.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 6.2);
        osc.connect(amp); amp.connect(master);
        osc.start(); osc.stop(ctx.currentTime + 6.4);
      }
    };
    playChord();
    musicTimer = window.setInterval(playChord, 6000);
  }

  return {
    unlock,
    toggleMute() {
      muted = !muted;
      if (master && ctx) master.gain.linearRampToValueAtTime(muted ? 0 : 0.5, ctx.currentTime + 0.1);
      return muted;
    },
    isMuted() { return muted; },
    click() { tone(660, 0.07, 'square', 0.12); },
    shoot() { noise(0.13, 0.5, 2600); tone(150, 0.1, 'sawtooth', 0.25, 40); },
    enemyShoot() { noise(0.11, 0.3, 1900); tone(120, 0.09, 'sawtooth', 0.16, 45); },
    dryFire() { tone(1200, 0.04, 'square', 0.1); },
    reload() { tone(300, 0.06, 'square', 0.14); tone(210, 0.06, 'square', 0.14, 0, 0.14); tone(420, 0.05, 'square', 0.16, 0, 0.3); },
    hit() { tone(190, 0.08, 'square', 0.2, 120); },
    hurt() { tone(110, 0.16, 'sawtooth', 0.22, 60); },
    crash(strength) { noise(0.22, Math.min(0.6, 0.2 + strength * 0.05), 700); tone(70, 0.2, 'sine', 0.3, 35); },
    pickup() { tone(880, 0.09, 'sine', 0.2); tone(1318, 0.14, 'sine', 0.2, 0, 0.08); },
    cash() { tone(1046, 0.07, 'square', 0.12); tone(1568, 0.12, 'square', 0.12, 0, 0.06); },
    door() { tone(180, 0.09, 'sine', 0.2, 90); tone(240, 0.07, 'sine', 0.14, 120, 0.1); },
    missionPass() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.22, 0, i * 0.1)); },
    missionFail() { [392, 330, 262].forEach((f, i) => tone(f, 0.22, 'triangle', 0.2, 0, i * 0.13)); },
    busted() { [330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.14, 0, i * 0.16)); },
    checkpoint() { tone(988, 0.08, 'sine', 0.18); tone(1318, 0.1, 'sine', 0.18, 0, 0.07); },
    /** Start the engine voice; update() bends its pitch with the car's speed, stop() kills it. */
    engineStart() {
      if (!ctx || engineNodes) return;
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = 'sawtooth'; sub.type = 'square';
      osc.frequency.value = 55; sub.frequency.value = 28;
      amp.gain.value = 0.05;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 420;
      osc.connect(filter); sub.connect(filter); filter.connect(amp); amp.connect(master);
      osc.start(); sub.start();
      engineNodes = { osc, sub, filter };
    },
    engineUpdate(speedRatio, throttle) {
      if (!ctx || !engineNodes) return;
      const rpm = 55 + Math.abs(speedRatio) * 165 + (throttle ? 14 : 0);
      engineNodes.osc.frequency.setTargetAtTime(rpm, ctx.currentTime, 0.06);
      engineNodes.sub.frequency.setTargetAtTime(rpm / 2, ctx.currentTime, 0.06);
      engineNodes.filter.frequency.setTargetAtTime(380 + Math.abs(speedRatio) * 900, ctx.currentTime, 0.08);
    },
    engineStop() {
      if (!engineNodes) return;
      try { engineNodes.osc.stop(); engineNodes.sub.stop(); } catch { /* already stopped */ }
      engineNodes = null;
    },
    /** The two-tone police siren, audible while any star is lit. */
    sirenStart() {
      if (!ctx || sirenNodes) return;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = 800;
      lfo.frequency.value = 0.65; lfoGain.gain.value = 160;
      lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
      amp.gain.value = 0.045;
      osc.connect(amp); amp.connect(master);
      osc.start(); lfo.start();
      sirenNodes = { osc, lfo, amp };
    },
    sirenSetLevel(level) {
      if (sirenNodes && ctx) sirenNodes.amp.gain.setTargetAtTime(0.02 + level * 0.05, ctx.currentTime, 0.2);
    },
    sirenStop() {
      if (!sirenNodes) return;
      try { sirenNodes.osc.stop(); sirenNodes.lfo.stop(); } catch { /* already stopped */ }
      sirenNodes = null;
    },
  };
}
