"use strict";
// ---------- Audio kit: Web Audio graph helpers and the synth instruments shared by effects, music and ambience ----------
// Snd (js/audio.js) binds the AudioContext once it exists: SndKit.bind(ctx). Everything here works on that context.
//   voice(t, dest, pan, lpHz, wet, wetDest) -> v   sources feed v.out; the voice unplugs itself when its last source ends
//   O(v, type, f, t0, t1) / N(v, t0, t1, brown)    an oscillator / a looping noise source owned by voice v
//   hiss, tone, chime, pluck, ks, reed, brass, ...  instruments: (v, t, ...) -> scheduled notes on voice v
const SndKit = (() => {
  let ctx = null, noiseW = null, noiseB = null;
  const Z = 0.0001;                               // "silent" for exponential ramps, which cannot reach 0
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- graph helpers ----------
  const G = (v = 0) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const F = (type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
  const wire = (...ns) => { for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]); return ns[0]; };
  function perc(prm, t, peak, a, d) { prm.setValueAtTime(Z, t); prm.exponentialRampToValueAtTime(Math.max(peak, 2 * Z), t + a); prm.exponentialRampToValueAtTime(Z, t + a + d); }
  function sweep(prm, t, f0, f1, d) { prm.setValueAtTime(f0, t); prm.exponentialRampToValueAtTime(f1, t + d); }
  function lfo(f, depth, prm, t) { const o = ctx.createOscillator(), g = G(depth); o.frequency.value = f; wire(o, g, prm); o.start(t); return o; }
  function panTo(pan, dest) { if (!ctx.createStereoPanner) return dest; const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(dest); return p; }

  // A voice: sources feeding one gain, routed out -> (low-pass) -> pan -> dest, plus a reverb send.
  function voice(t, dest, pan = 0, lpHz = 0, wet = 0, wetDest = null) {
    const v = { t, p: 1, n: 0, srcs: [], out: G(1), chain: [], end: t };
    let n = v.out; v.chain.push(n);
    if (lpHz) { const f = F("lowpass", lpHz, 0.5); n.connect(f); n = f; v.chain.push(f); }
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); n.connect(p); n = p; v.chain.push(p); }
    n.connect(dest);
    if (wet > 0 && wetDest) { const w = G(wet); n.connect(w); w.connect(wetDest); v.chain.push(w); }
    return v;
  }
  function release(v) { for (const n of v.chain) n.disconnect(); }
  function done(v) { if (!v.n) release(v); }
  function run(v, s, t0, t1, off) {
    off == null ? s.start(t0) : s.start(t0, off); s.stop(t1);
    v.n++; v.srcs.push(s); v.end = Math.max(v.end, t1);
    s.onended = () => { if (--v.n <= 0) release(v); };
  }
  function O(v, type, f, t0, t1) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; run(v, o, t0, t1); return o; }
  function N(v, t0, t1, brown) { const s = ctx.createBufferSource(); s.buffer = brown ? noiseB : noiseW; s.loop = true; run(v, s, t0, t1, Math.random() * (s.buffer.duration - 0.5)); return s; }
  function loopNoise(brown, t) { const s = ctx.createBufferSource(); s.buffer = brown ? noiseB : noiseW; s.loop = true; s.start(t, Math.random() * s.buffer.duration); return s; }
  // tanh saturation, one shared curve per drive: a low sine grows 2nd-4th harmonics that small speakers can play
  const driveCurves = new Map();
  function drive(k) {
    let c = driveCurves.get(k);
    if (!c) { c = new Float32Array(1025); for (let i = 0; i < c.length; i++) { const x = i / 512 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); } driveCurves.set(k, c); }
    const w = ctx.createWaveShaper(); w.curve = c; return w;
  }

  // ---------- instruments ----------
  // filtered noise burst; returns the filter so callers can sweep it
  function hiss(v, t, type, f, q, peak, a, d, brown, dest = v.out) {
    const s = N(v, t, t + a + d + 0.05, brown), fl = F(type, f, q), g = G(); perc(g.gain, t, peak, a, d); wire(s, fl, g, dest); return fl;
  }
  // pitched blip sliding f0 -> f1
  function tone(v, t, type, f0, f1, slide, peak, a, d, dest = v.out) {
    const o = O(v, type, f0, t, t + a + d + 0.05), g = G(); if (f1 !== f0) sweep(o.frequency, t, f0, f1, slide); perc(g.gain, t, peak, a, d); wire(o, g, dest); return o;
  }
  // struck metal: a sine plus an inharmonic partial
  function chime(v, t, f, peak, d = 0.28) { tone(v, t, "sine", f, f, 0, peak, 0.001, d); tone(v, t, "sine", f * 2.76, f * 2.76, 0, peak * 0.35, 0.001, d * 0.6); }
  // a bright synth pluck: square wave behind a closing low-pass
  function pluck(v, t, f, peak, d = 0.22) {
    const o = O(v, "square", f, t, t + d + 0.05), lp = F("lowpass", f * 8, 1), g = G();
    sweep(lp.frequency, t, Math.min(f * 8, 12000), f * 1.5, 0.12); perc(g.gain, t, peak, 0.002, d); wire(o, lp, g, v.out);
  }
  // timbers groaning: a wobbling sawtooth through a narrow band, chattering like wood that sticks and slips
  function creak(v, t, f, dur, peak, dest = v.out) {
    const o = O(v, "sawtooth", f, t, t + dur + 0.1), bp = F("bandpass", f * 7, 6), am = G(0.6), rat = O(v, "square", rand(22, 38), t, t + dur + 0.1), rd = G(0.4), g = G();
    o.frequency.setValueCurveAtTime(new Float32Array(8).map(() => f * rand(0.85, 1.2)), t, dur);
    g.gain.setValueAtTime(Z, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(Z, t + dur);
    wire(rat, rd, am.gain); wire(o, bp, am, g, dest);
  }
  // bubbles: one sine that blips upward again and again
  function bubbles(v, t, span, n) {
    const o = O(v, "sine", 400, t, t + span + 0.2), g = G(); wire(o, g, v.out);
    for (let i = 0; i < n; i++) {
      const ti = t + span * Math.pow(i / n, 1.3) + rand(0, 0.03), f = rand(260, 750) * v.p;
      o.frequency.setValueAtTime(f, ti); o.frequency.exponentialRampToValueAtTime(f * 1.9, ti + 0.045);
      perc(g.gain, ti, rand(0.05, 0.16) * (1 - i / n * 0.6), 0.004, 0.045);
    }
  }
  // a ship's bell: a hum note under a cluster of inharmonic partials
  function bellStrike(v, t, f, peak, dest = v.out) {
    for (const [k, a, d] of [[0.5, 0.35, 2.4], [1, 1, 1.8], [2, 0.45, 1.1], [2.4, 0.3, 0.9], [3, 0.22, 0.6], [4.4, 0.12, 0.35]]) tone(v, t, "sine", f * k, f * k, 0, peak * a, 0.002, d, dest);
  }
  function clank(v, t, peak) {
    hiss(v, t, "bandpass", 3400 * v.p, 6, peak, 0.001, 0.06);
    for (const [k, a, d] of [[1, 1, 0.3], [2.32, 0.5, 0.2], [3.71, 0.35, 0.14]]) tone(v, t, "sine", 520 * k * v.p, 520 * k * v.p, 0, peak * a * 0.5, 0.001, d);
  }
  function brass(v, t, f, d, peak) {
    const lp = F("lowpass", f * 1.2, 1.4), g = G(); wire(lp, g, v.out);
    for (const det of [-7, 6]) { const o = O(v, "sawtooth", f, t, t + d + 0.4); o.detune.value = det; o.connect(lp); }
    lp.frequency.setValueAtTime(f * 1.2, t); lp.frequency.linearRampToValueAtTime(Math.min(f * 5, 9000), t + 0.07); lp.frequency.exponentialRampToValueAtTime(f * 2.2, t + d);
    g.gain.setValueAtTime(Z, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.035); g.gain.exponentialRampToValueAtTime(peak * 0.65, t + d); g.gain.exponentialRampToValueAtTime(Z, t + d + 0.3);
  }
  // accordion reed: two detuned saws and a square an octave down, with vibrato that blooms in
  function reed(v, t, f, d, peak) {
    const lp = F("lowpass", Math.min(f * 4.5, 4800), 0.9), g = G(), vib = O(v, "sine", 5.3, t, t + d + 0.4), vd = G(0);
    vd.gain.setValueAtTime(0, t); vd.gain.linearRampToValueAtTime(10, t + Math.min(0.45, d)); vib.connect(vd); wire(lp, g, v.out);
    for (const [type, k, det, a] of [["sawtooth", 1, -6, 1], ["sawtooth", 1, 7, 1], ["square", 0.5, 0, 0.45]]) {
      const o = O(v, type, f * k, t, t + d + 0.4); o.detune.value = det; vd.connect(o.detune); wire(o, G(a), lp);
    }
    g.gain.setValueAtTime(Z, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.04); g.gain.setTargetAtTime(peak * 0.8, t + 0.06, 0.25); g.gain.setTargetAtTime(Z, t + d, 0.07);
  }
  // soft accordion chord, re-breathed every bar like a bellows; lp darkens it
  function pad(v, t, notes, dur, peak, lpHz = 1250) {
    const lp = F("lowpass", lpHz, 0.6), g = G(); wire(lp, g, v.out);
    for (const m of notes) for (const det of [-7, 8]) { const o = O(v, "sawtooth", hz(m), t, t + dur + 1); o.detune.value = det; o.connect(lp); }
    g.gain.setValueAtTime(Z, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.2); g.gain.setTargetAtTime(peak * 0.7, t + 0.3, 0.5); g.gain.setTargetAtTime(Z, t + dur, 0.18);
  }
  // a low reed drone that swells in and out over its length, its filter breathing slowly
  function drone(v, t, m, dur, peak) {
    const lp = F("lowpass", 420, 0.8), g = G(); wire(lp, g, v.out);
    lp.frequency.setValueAtTime(320, t); lp.frequency.linearRampToValueAtTime(620, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(340, t + dur);
    for (const [type, k, det, a] of [["sawtooth", 1, -5, 1], ["sawtooth", 1, 6, 0.8], ["square", 2, 3, 0.25]]) { const o = O(v, type, hz(m) * k, t, t + dur + 0.6); o.detune.value = det; wire(o, G(a), lp); }
    g.gain.setValueAtTime(Z, t); g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.6, dur * 0.3)); g.gain.setTargetAtTime(Z, t + dur - 0.1, 0.18);
  }
  // Karplus-Strong plucked string, rendered once per pitch. The buffer's own sample rate is chosen so the
  // whole-sample loop length lands exactly on pitch; the browser resamples on playback.
  const ksCache = new Map();
  function ksBuf(m) {
    let b = ksCache.get(m); if (b) return b;
    const f = hz(m), N = Math.max(8, Math.round(24000 / f - 0.5)), sr = f * (N + 0.5), low = m < 55;
    const rho = Math.pow(low ? 0.2 : 0.06, 1 / f), len = Math.ceil(sr * (low ? 2.2 : 1.6));   // level left after 1 s: 20% / 6%
    b = ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0), r = mulberry32(m * 7919 + 13);
    let lp = 0, mean = 0, peak = 0;
    for (let i = 0; i < N; i++) { lp += (r() * 2 - 1 - lp) * 0.42; d[i] = lp; mean += lp / N; }   // a softened pluck
    for (let i = 0; i < N; i++) d[i] -= mean;
    for (let i = N; i < len; i++) d[i] = rho * 0.5 * (d[i - N] + d[i - N - (i > N ? 1 : 0)]);
    for (let i = 0; i < N * 3; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < len; i++) d[i] *= 0.9 / peak;
    ksCache.set(m, b); return b;
  }
  function ks(v, t, m, peak, bright = 1, len = 0) {
    const s = ctx.createBufferSource(), lp = F("lowpass", Math.min(hz(m) * 5 * bright + 600, 11000), 0.5), g = G(peak);
    s.buffer = ksBuf(m); wire(s, lp, g, v.out);
    const end = t + (len || s.buffer.duration);
    if (len) { g.gain.setValueAtTime(peak, Math.max(t, end - 0.07)); g.gain.linearRampToValueAtTime(0, end); }   // a finger damps the string
    run(v, s, t, end + 0.01);
  }
  function frameDrum(v, t, vel, low) {
    const f = low ? 88 : 150;
    tone(v, t, "sine", f * 1.5, f, 0.05, 0.26 * vel, 0.002, low ? 0.3 : 0.14);
    hiss(v, t, "bandpass", low ? 650 : 1700, 0.9, 0.15 * vel, 0.001, low ? 0.05 : 0.035);
  }
  function tom(v, t, vel, f) {
    tone(v, t, "sine", f * 1.8, f, 0.1, 0.85 * vel, 0.002, 0.42); tone(v, t, "triangle", f * 2.7, f * 1.6, 0.06, 0.22 * vel, 0.002, 0.1);
    hiss(v, t, "lowpass", 1000, 0.7, 0.3 * vel, 0.001, 0.05);
  }
  function snare(v, t, vel) { hiss(v, t, "highpass", 1900, 0.7, 0.32 * vel, 0.001, 0.12); tone(v, t, "triangle", 250, 185, 0.04, 0.22 * vel, 0.001, 0.05); }
  // kettle drum: a tuned head that rings, with a felt-mallet thud
  function timp(v, t, m, vel) {
    const f = hz(m); tone(v, t, "sine", f * 1.04, f, 0.08, 0.5 * vel, 0.004, 0.9); tone(v, t, "sine", f * 1.5, f * 1.49, 0.08, 0.16 * vel, 0.004, 0.5);
    hiss(v, t, "lowpass", 700, 0.7, 0.18 * vel, 0.002, 0.06);
  }
  function bassNote(v, t, m, d, vel, lpHz = 1300) {
    const o = O(v, "sawtooth", hz(m), t, t + d + 0.12), lp = F("lowpass", lpHz, 4), g = G();
    sweep(lp.frequency, t, lpHz * 1.077, lpHz * 0.185, 0.15); perc(g.gain, t, 0.3 * vel, 0.004, d); wire(o, lp, g, v.out);
  }

  // ---------- buffers ----------
  function noiseBuf(sec, brown) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let y = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { y = (y + 0.02 * w) / 1.02; d[i] = y * 3.5; } else d[i] = w; }
    if (brown) { const k = (d[n - 1] - d[0]) / (n - 1); for (let i = 0; i < n; i++) d[i] -= k * i; }   // no step where the loop wraps
    return b;
  }
  function impulse(sec) {   // a generated room: decaying noise whose highs die first
    const sr = ctx.sampleRate, n = Math.floor(sr * sec), pre = Math.floor(sr * 0.02), b = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lp = 0;
      for (let i = pre; i < n; i++) { const k = (i - pre) / (n - pre); lp += (Math.random() * 2 - 1 - lp) * (0.85 - 0.7 * k); d[i] = lp * Math.exp(-6.5 * k); }
    }
    return b;
  }
  function bind(c) { ctx = c; noiseW = noiseBuf(3, false); noiseB = noiseBuf(5, true); }

  return Object.freeze({ bind, impulse, Z, hz, G, F, wire, perc, sweep, lfo, panTo, voice, release, done, O, N, loopNoise, drive,
    hiss, tone, chime, pluck, creak, bubbles, bellStrike, clank, brass, reed, pad, drone, ks, frameDrum, tom, snare, timp, bassNote,
    now: () => ctx.currentTime, strings: () => ksCache.size });
})();
