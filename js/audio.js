"use strict";
// ---------- Audio ----------
// Every sound in the game is synthesised here at runtime with the Web Audio API. There are no audio files.
// One global, Snd:
//   Snd.play(name, { x, y, pan, gain, pitch, big, amount, delay })   one-shot effect (x/y = world position)
//   Snd.setListener(x, y) · Snd.setMotion(0..1)                       ears on the player, own-ship speed
//   Snd.music("sea" | "harbor" | null) · Snd.setIntensity(0..1)       adaptive score, combat layer
//   Snd.ambience("sea" | "harbor" | null)
//   Snd.setVolume(bus, 0..1) · Snd.getVolume(bus)                     bus = master | music | sfx | ambient
//   Snd.setMuted(b) · Snd.toggleMute() · Snd.isMuted()
//   Snd.pauseAll(reason) · Snd.resumeAll(reason)                       the tab being hidden pauses on its own
// Signal flow: voices -> sfx / music / ambient buses (+ a shared reverb) -> mix -> limiter -> master -> soft clip.
// The AudioContext is created on the first user gesture (browsers block autoplay). Until then one-shot effects
// are dropped, and the music and ambience asked for are remembered and started on unlock.
const Snd = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  const SETTINGS_KEY = "privateers-settings";
  const DEFAULT_VOL = { master: 0.8, music: 0.5, sfx: 0.8, ambient: 0.6 };
  const BUSES = Object.keys(DEFAULT_VOL);
  const NEAR = 160, FAR = 1500, PAN_SPAN = 900;  // world px: full volume inside NEAR, silent past a sound's `far`
  const MAX_VOICES = 40;                          // all effects together; low-priority ones are dropped past this
  const LOOKAHEAD = 0.3, TICK_MS = 40;            // music scheduler: queue bars this far ahead, wake this often
  const HOLD = 5;                                 // seconds the combat layer holds on after the threat drops
  const Z = 0.0001;                               // "silent" for exponential ramps, which cannot reach 0
  const taper = v => v * v;                       // slider position -> gain, so halfway sounds about half as loud

  // ---------- settings: per-bus volume and mute, merged into a shared settings object ----------
  function readSettings() {
    try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)); return s && typeof s === "object" && !Array.isArray(s) ? s : {}; } catch (e) { return {}; }
  }
  function writeSettings(patch) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...patch })); } catch (e) {} }
  const unit = v => typeof v === "number" && Number.isFinite(v) ? clamp(v, 0, 1) : null;
  const saved = readSettings();
  const vol = Object.fromEntries(BUSES.map(b => [b, unit(saved.volume && saved.volume[b]) ?? DEFAULT_VOL[b]]));
  let muted = saved.muted === true;

  let ctx = null, bus = null, noiseW = null, noiseB = null, broken = !AC;
  const pauses = new Set(), listener = { x: 0, y: 0 }, voices = {}, lastAt = {};

  // ---------- graph helpers ----------
  const G = (v = 0) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const F = (type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
  const wire = (...ns) => { for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]); return ns[0]; };
  function perc(prm, t, peak, a, d) { prm.setValueAtTime(Z, t); prm.exponentialRampToValueAtTime(Math.max(peak, 2 * Z), t + a); prm.exponentialRampToValueAtTime(Z, t + a + d); }
  function sweep(prm, t, f0, f1, d) { prm.setValueAtTime(f0, t); prm.exponentialRampToValueAtTime(f1, t + d); }
  function lfo(f, depth, prm, t) { const o = ctx.createOscillator(), g = G(depth); o.frequency.value = f; wire(o, g, prm); o.start(t); }

  // A voice: sources feeding one gain, routed out -> (low-pass) -> pan -> dest, plus a reverb send.
  // When its last source ends it unplugs itself, so nothing lingers in the graph.
  function voice(t, dest, pan = 0, lpHz = 0, wet = 0, wetDest = null) {
    const v = { t, p: 1, n: 0, srcs: [], out: G(1), chain: [], end: t };
    let n = v.out; v.chain.push(n);
    if (lpHz) { const f = F("lowpass", lpHz, 0.5); n.connect(f); n = f; v.chain.push(f); }
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); n.connect(p); n = p; v.chain.push(p); }
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

  // ---------- instruments, shared by effects, ambience and music ----------
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
  function creak(v, t, f, dur, peak) {
    const o = O(v, "sawtooth", f, t, t + dur + 0.1), bp = F("bandpass", f * 7, 6), am = G(0.6), rat = O(v, "square", rand(22, 38), t, t + dur + 0.1), rd = G(0.4), g = G();
    o.frequency.setValueCurveAtTime(new Float32Array(8).map(() => f * rand(0.85, 1.2)), t, dur);
    g.gain.setValueAtTime(Z, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(Z, t + dur);
    wire(rat, rd, am.gain); wire(o, bp, am, g, v.out);
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
  // soft accordion chord, re-breathed every bar like a bellows
  function pad(v, t, notes, dur, peak) {
    const lp = F("lowpass", 1250, 0.6), g = G(); wire(lp, g, v.out);
    for (const m of notes) for (const det of [-7, 8]) { const o = O(v, "sawtooth", hz(m), t, t + dur + 1); o.detune.value = det; o.connect(lp); }
    g.gain.setValueAtTime(Z, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.2); g.gain.setTargetAtTime(peak * 0.7, t + 0.3, 0.5); g.gain.setTargetAtTime(Z, t + dur, 0.18);
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
  function bassNote(v, t, m, d, vel) {
    const o = O(v, "sawtooth", hz(m), t, t + d + 0.12), lp = F("lowpass", 1300, 4), g = G();
    sweep(lp.frequency, t, 1400, 240, 0.15); perc(g.gain, t, 0.3 * vel, 0.004, d); wire(o, lp, g, v.out);
  }

  // ---------- sound effects ----------
  // max: voices of this sound at once (the oldest is stolen) · gap: min seconds between triggers · pv / gv: random
  // pitch / gain spread · far: silent beyond this many world px · pri >= 2: dropped when the mix is crowded.
  let combo = 0, lastPick = -9;
  const PENTA = [0, 2, 4, 7, 9, 12];
  const SFX = {
    cannon: { max: 6, gap: 0.03, pv: 0.06, gv: 0.1, gain: 1, wet: 0.3, fn(v) { const { t, p } = v;
      hiss(v, t, "highpass", 1800 * p, 0.7, 0.5, 0.001, 0.07);                                         // the crack
      sweep(hiss(v, t, "lowpass", 4000 * p, 0.8, 0.95, 0.003, 0.8).frequency, t, 4000 * p, 220 * p, 0.6); // the blast
      tone(v, t, "sine", 82 * p, 34 * p, 0.32, 1, 0.003, 0.5);                                           // the thump
      hiss(v, t + 0.04, "bandpass", 170 * p, 0.9, 0.3, 0.06, 1.6, true); } },                          // its echo over the water
    cannonFar: { max: 6, gap: 0.04, pv: 0.08, gv: 0.15, gain: 0.65, wet: 0.45, far: 1900, pri: 2, fn(v) { const { t, p } = v;
      sweep(hiss(v, t, "lowpass", 1600 * p, 0.7, 0.8, 0.004, 0.9).frequency, t, 1600 * p, 180 * p, 0.5);
      tone(v, t, "sine", 64 * p, 30 * p, 0.3, 0.7, 0.004, 0.55);
      hiss(v, t + 0.05, "bandpass", 140 * p, 0.8, 0.25, 0.08, 1.4, true); } },
    hit: { max: 5, gap: 0.025, pv: 0.12, gv: 0.15, gain: 0.8, wet: 0.2, far: 1300, pri: 2, fn(v) { const { t, p } = v, k = v.big ? 1.25 : 1;
      tone(v, t, "triangle", 160 * p, 58 * p, 0.12, 0.8 * k, 0.002, 0.18);                              // hull thud
      hiss(v, t, "bandpass", 1100 * p, 1.3, 0.75 * k, 0.002, 0.17);                                     // planks crunch
      const s = N(v, t, t + 0.4), hp = F("highpass", 3200 * p, 0.8), g = G(); wire(s, hp, g, v.out);   // splinters
      let ti = t + 0.005;
      for (let i = 0; i < 7; i++) { const d = rand(0.012, 0.03); perc(g.gain, ti, rand(0.15, 0.45) * k, 0.001, d); ti += d + rand(0.006, 0.02); } } },
    splash: { max: 6, gap: 0.03, pv: 0.15, gv: 0.2, gain: 0.55, wet: 0.15, far: 1200, pri: 3, fn(v) { const { t, p } = v;
      sweep(hiss(v, t, "bandpass", 2600 * p, 1.1, 0.6, 0.012, 0.45).frequency, t, 2600 * p, 650 * p, 0.4);
      tone(v, t, "sine", 520 * p, 150 * p, 0.07, 0.35, 0.002, 0.08);                                    // the plop
      for (let i = 0; i < 3; i++) tone(v, t + rand(0.08, 0.32), "sine", rand(1300, 2600) * p, rand(1600, 3000) * p, 0.02, 0.06, 0.001, 0.03); } },
    burn: { max: 4, gap: 0.06, pv: 0.2, gv: 0.3, gain: 0.35, far: 1000, pri: 3, fn(v) { const { t, p } = v;
      hiss(v, t, "lowpass", 500 * p, 0.7, 0.25, 0.08, 0.35, true);                                      // the roar of the flames
      const s = N(v, t, t + 0.5), hp = F("highpass", 2200 * p, 0.7), g = G(); wire(s, hp, g, v.out);
      let ti = t; for (let i = 0; i < 6; i++) { const d = rand(0.008, 0.02); perc(g.gain, ti, rand(0.1, 0.5), 0.001, d); ti += d + rand(0.01, 0.06); } } },
    sink: { max: 3, gap: 0.1, pv: 0.08, gv: 0.1, gain: 0.85, wet: 0.4, far: 2000, fn(v) { const { t, p } = v, L = v.big ? 3.4 : 2.5;
      tone(v, t, "sine", 70 * p, 28 * p, 0.6, 0.8, 0.005, 0.7);                                         // the keel gives
      hiss(v, t, "lowpass", 800 * p, 0.7, 0.5, 0.005, 0.5);
      creak(v, t + 0.1, rand(85, 110) * p, 0.9, 0.3); creak(v, t + 0.75, rand(110, 140) * p, 0.7, 0.22);
      const s = N(v, t + 0.15, t + L, true), lp = F("lowpass", 900 * p, 0.6), g = G(); wire(s, lp, g, v.out);   // water rushes in
      g.gain.setValueAtTime(Z, t + 0.15); g.gain.exponentialRampToValueAtTime(0.55, t + 0.5); g.gain.exponentialRampToValueAtTime(Z, t + L);
      for (let k = 0; k < 2; k++) bubbles(v, t + 0.4 + k * 0.06, L - 0.5, v.big ? 14 : 9); } },
    pickup: { max: 3, gap: 0.05, pv: 0.02, gv: 0.1, gain: 0.6, fn(v) { const { t } = v;
      combo = t - lastPick < 1.4 ? Math.min(combo + 1, PENTA.length - 1) : 0; lastPick = t;   // quick pickups climb a scale
      const f = 660 * Math.pow(2, PENTA[combo] / 12) * v.p; pluck(v, t, f, 0.35); pluck(v, t + 0.055, f * 1.5, 0.3); } },
    coin: { max: 2, gap: 0.2, pv: 0.03, gv: 0.05, gain: 0.45, wet: 0.25, fn(v) {
      const n = clamp(Math.round(Math.log2(Math.max(1, v.amount || 40) / 20)) + 2, 2, 9);   // more gold, more coins
      let ti = v.t, gap = 0.085;
      for (let i = 0; i < n; i++) { chime(v, ti, rand(2300, 3300) * v.p, rand(0.25, 0.4)); ti += gap * rand(0.8, 1.15); gap *= 0.93; }
      chime(v, ti + 0.02, 2093 * v.p, 0.4, 0.6); chime(v, ti + 0.04, 2637 * v.p, 0.32, 0.6); } },         // the till rings
    buy: { max: 2, gap: 0.05, pv: 0.02, gv: 0.05, gain: 0.55, wet: 0.2, fn(v) { const { t, p } = v;
      tone(v, t, "sine", 210 * p, 110 * p, 0.08, 0.6, 0.002, 0.12); hiss(v, t, "lowpass", 1400, 0.7, 0.3, 0.002, 0.05);   // the ledger stamp
      chime(v, t + 0.05, 2700 * p, 0.25); chime(v, t + 0.11, 3150 * p, 0.22);
      pluck(v, t + 0.09, 784 * p, 0.3, 0.3); pluck(v, t + 0.19, 1175 * p, 0.3, 0.4);
      if (v.big) { pluck(v, t + 0.3, 1568 * p, 0.28, 0.5); bellStrike(v, t + 0.3, 330 * p, 0.35); } } },
    upgrade: { max: 2, gap: 0.05, pv: 0.02, gv: 0.05, gain: 0.55, wet: 0.25, fn(v) { const { t, p } = v;
      clank(v, t, 0.45); clank(v, t + 0.17, 0.35);                                                       // the shipwright's hammer
      [587, 740, 880, 1175].forEach((f, i) => pluck(v, t + 0.32 + i * 0.075, f * p, 0.26, 0.3)); } },
    denied: { max: 2, gap: 0.15, pv: 0.02, gv: 0.05, gain: 0.35, fn(v) { const { t, p } = v;
      for (const [dt, f] of [[0, 220], [0.11, 175]]) { const o = O(v, "square", f * p, t + dt, t + dt + 0.16), lp = F("lowpass", 900, 0.8), g = G();
        perc(g.gain, t + dt, 0.28, 0.004, 0.13); wire(o, lp, g, v.out); }
      tone(v, t, "sine", 150 * p, 90 * p, 0.06, 0.4, 0.002, 0.08); } },
    uiClick: { max: 3, gap: 0.03, pv: 0.08, gv: 0.1, gain: 0.45, fn(v) { const { t, p } = v;
      tone(v, t, "triangle", 1700 * p, 900 * p, 0.03, 0.3, 0.001, 0.04); hiss(v, t, "bandpass", 3800 * p, 1.5, 0.15, 0.001, 0.015); } },
    reload: { max: 3, gap: 0.05, pv: 0.05, gv: 0.1, gain: 0.38, fn(v) { const { t, p } = v;   // the rammer knocks twice
      for (const [dt, f] of [[0, 1000], [0.07, 1400]]) { tone(v, t + dt, "triangle", f * p, f * 0.68 * p, 0.03, 0.3, 0.001, 0.035); hiss(v, t + dt, "bandpass", f * 2.1 * p, 2, 0.2, 0.001, 0.02); } } },
    lowHull: { max: 1, gap: 7, pv: 0, gv: 0, gain: 0.2, wet: 0.2, fn(v) { const { t } = v;   // a muffled double toll of the ship's bell
      const lp = F("lowpass", 1500, 0.7); lp.connect(v.out); bellStrike(v, t, 311, 0.5, lp); bellStrike(v, t + 0.3, 311, 0.4, lp); } },
    victory: { max: 1, gap: 1.2, pv: 0, gv: 0, gain: 0.4, wet: 0.35, fn(v) { const { t } = v;
      duck(0.45, 1.6);   // open fifths and octaves, no third, so it sits over whatever chord the score is on
      for (const [dt, f, d] of [[0, 440, 0.11], [0.12, 587, 0.11], [0.24, 880, 0.55]]) brass(v, t + dt, f, d, 0.4);
      brass(v, t + 0.24, 587, 0.55, 0.25); brass(v, t + 0.24, 1175, 0.55, 0.1);
      tone(v, t + 0.24, "sine", 80, 72, 0.3, 0.7, 0.003, 0.8); hiss(v, t + 0.24, "lowpass", 400, 0.7, 0.3, 0.002, 0.12); } },
    defeat: { max: 1, gap: 3, pv: 0, gv: 0, gain: 0.42, wet: 0.45, fn(v) { const { t } = v;
      duck(0.15, 3.5);   // a slow fall down the Dorian mode on a low reed, over a drone and a tolling bell
      for (const [dt, f, d] of [[0, 587, 0.42], [0.45, 523, 0.42], [0.9, 440, 0.42], [1.35, 349, 0.5], [1.9, 294, 1.3]]) reed(v, t + dt, f, d, 0.3);
      reed(v, t, 147, 3, 0.16); bellStrike(v, t + 1.9, 196, 0.3); } },
    sail: { max: 1, gap: 0.5, pv: 0.05, gv: 0.05, gain: 1, wet: 0.2, fn(v) { const { t, p } = v;   // canvas unfurls and fills
      const s = N(v, t, t + 1.1), bp = F("bandpass", 600 * p, 0.9), am = G(0.5), g = G(), flap = O(v, "square", 18, t, t + 1.1), depth = G(0.5);
      sweep(flap.frequency, t, 18, 6, 0.9); sweep(bp.frequency, t, 600 * p, 1600 * p, 0.7);
      g.gain.setValueAtTime(Z, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.25); g.gain.exponentialRampToValueAtTime(Z, t + 1.05);
      wire(flap, depth, am.gain); wire(s, bp, am, g, v.out);
      creak(v, t + 0.05, 150 * p, 0.45, 0.25); creak(v, t + 0.5, 120 * p, 0.4, 0.18); } },
    bell: { max: 2, gap: 0.3, pv: 0.01, gv: 0.05, gain: 0.28, wet: 0.5, fn(v) { bellStrike(v, v.t, 523 * v.p, 0.6); bellStrike(v, v.t + 0.42, 523 * v.p, 0.45); } },
  };

  function activeCount(now) {
    let n = 0;
    for (const k in voices) { const l = voices[k]; for (let i = l.length - 1; i >= 0; i--) if (l[i].end <= now) l.splice(i, 1); n += l.length; }
    return n;
  }
  function steal(v, now) {
    v.out.gain.cancelScheduledValues(now); v.out.gain.setTargetAtTime(0, now, 0.015); v.end = now;
    for (const s of v.srcs) { try { s.stop(now + 0.1); } catch (e) {} }
  }
  function play(name, opts = {}) {
    const def = SFX[name];
    if (!def) { console.warn("Snd.play: unknown sound", name); return false; }
    if (!ctx || muted || pauses.size) return false;
    const now = ctx.currentTime, t = now + Math.max(0, +opts.delay || 0);
    if (now - (lastAt[name] ?? -1e9) < def.gap) return false;
    let att = 1, far = 0, pan = clamp(+opts.pan || 0, -1, 1);
    if (Number.isFinite(opts.x) && Number.isFinite(opts.y)) {
      const dx = opts.x - listener.x, dy = opts.y - listener.y, d = Math.hypot(dx, dy), max = def.far || FAR;
      if (d >= max) return false;
      far = clamp((d - NEAR) / (max - NEAR), 0, 1); att = Math.pow(1 - far, 1.6); pan = clamp(dx / PAN_SPAN, -1, 1) * 0.8;
    }
    const list = voices[name] || (voices[name] = []);
    if (activeCount(now) >= MAX_VOICES && (def.pri || 1) >= 2) return false;
    if (list.length >= def.max) steal(list.shift(), now);
    lastAt[name] = now;
    // distant sounds lose their highs to the air and carry relatively more echo
    const v = voice(t, bus.sfx, pan, far > 0.02 ? 16000 * Math.pow(0.08, far) : 0, (def.wet || 0) * (1 + 1.5 * far), bus.sfxWet);
    v.p = (+opts.pitch || 1) * rand(1 - def.pv, 1 + def.pv); v.big = !!opts.big; v.amount = +opts.amount || 0;
    v.out.gain.value = att * def.gain * (opts.gain == null ? 1 : clamp(+opts.gain || 0, 0, 2)) * rand(1 - def.gv, 1);
    def.fn(v); list.push(v); done(v);
    return true;
  }
  function duck(level, dur) {
    const g = bus.musicIn.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(level, t, 0.05); g.setTargetAtTime(1, t + dur, 0.6);
  }

  // ---------- music: composed themes, played by a look-ahead scheduler ----------
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function pitchClass(s) { const m = /^([A-G])([#b]?)$/.exec(s); if (!m) throw new Error("Snd: bad pitch " + s); return (PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? 11 : 0)) % 12; }
  function midi(s) { const m = /^([A-G][#b]?)(\d)$/.exec(s); if (!m) throw new Error("Snd: bad note " + s); return 12 * (+m[2] + 1) + pitchClass(m[1]); }
  const near = (p, c) => c + ((p - c) % 12 + 18) % 12 - 6;   // pitch class p placed within a tritone of note c
  const into = (p, lo) => lo + ((p - lo) % 12 + 12) % 12;    // pitch class p placed in [lo, lo + 12)
  function chord(sym) {
    const m = /^([A-G][#b]?)(m?)$/.exec(sym); if (!m) throw new Error("Snd: bad chord " + sym);
    const r = pitchClass(m[1]), tones = [r, (r + (m[2] ? 3 : 4)) % 12, (r + 7) % 12];
    return { bass: near(r, 50), pad: tones.map(p => into(p, 55)).sort((a, b) => a - b) };
  }
  // "D5.2 A4.1 | F5.3 ..." -> bars of { s: step in bar, m: midi, d: steps }. One step is an eighth; every bar has 6.
  function bars(line) {
    return line.split("|").map((bar, i) => {
      let s = 0; const evs = [];
      for (const tok of bar.trim().split(/\s+/)) { const [n, d] = tok.split("."); if (n !== "r") evs.push({ s, m: midi(n), d: +d }); s += +d; }
      if (s !== 6) throw new Error(`Snd: bar ${i + 1} of "${line.slice(0, 24)}..." is ${s} eighths long, not 6`);
      return evs;
    });
  }
  function compile(th) {
    for (const k in th.sec) {
      const s = th.sec[k]; s.mel = bars(s.mel); s.chords = s.ch.split(/\s+/).map(chord);
      if (s.chords.length !== s.mel.length) throw new Error(`Snd: section ${k} has ${s.mel.length} bars but ${s.chords.length} chords`);
    }
    th.pcs = new Set(th.scale); return th;
  }
  // gain: trim so each theme sits near -26 dBFS RMS at default volume (measured with `node tests/audio.mjs --levels`).
  // form: the running order. lead: pluck | reed (swapped every other pass) · pad / bass / arp / drum: levels ·
  // once: only on the first pass · alt: only every other pass (rest: tacet, just the sea and any combat layer).
  const THEMES = {
    // At sea: D Dorian in 6/8, a shanty-like tune over accordion, bass strings and a frame drum.
    sea: compile({ step: 0.21, gain: 4.5, scale: [2, 4, 5, 7, 9, 11, 0], combat: true, grace: true, accomp: "roll", sec: {
      A:  { ch: "Dm Dm C C F C Am Dm", mel: "D5.2 A4.1 D5.2 E5.1 | F5.3 E5.2 D5.1 | C5.2 G4.1 C5.2 D5.1 | E5.3 D5.2 C5.1 | F5.2 A5.1 G5.2 F5.1 | E5.2 G5.1 F5.2 E5.1 | D5.2 E5.1 C5.2 A4.1 | D5.5 r.1" },
      A2: { ch: "Dm Dm G Am F C Am Dm", mel: "D5.2 A4.1 D5.2 E5.1 | F5.2 G5.1 A5.3 | G5.2 D5.1 B4.2 D5.1 | E5.3 C5.2 A4.1 | F5.2 E5.1 F5.2 A5.1 | G5.2 E5.1 C5.2 E5.1 | D5.2 C5.1 A4.2 C5.1 | D5.6" },
      B:  { ch: "F C Am G F C G Am", mel: "A5.3 G5.2 F5.1 | G5.3 E5.2 C5.1 | A5.2 G5.1 E5.2 D5.1 | D5.3 B4.3 | F5.2 G5.1 A5.2 C6.1 | C6.2 A5.1 G5.2 E5.1 | D5.2 G5.1 B5.2 A5.1 | A5.3 G5.1 F5.1 E5.1" },
    }, form: [
      { sec: "A", pad: 0.8, bass: 1, arp: 0.7, once: true },
      { sec: "A", lead: "pluck", pad: 0.6, bass: 1, drum: 0.6 },
      { sec: "A2", lead: "pluck", pad: 0.6, bass: 1, drum: 0.7 },
      { sec: "B", lead: "reed", pad: 0.3, bass: 1, drum: 0.8, arp: 0.5 },
      { sec: "A2", lead: "reed", pad: 0.4, bass: 1, drum: 0.6, arp: 0.4 },
      { sec: "A", pad: 0.6, bass: 1, arp: 0.8, drum: 0.3 },
      { sec: "A", rest: true, alt: true }, { sec: "A2", rest: true, alt: true },
    ] }),
    // In harbour: a G major waltz with a Mixolydian F, accordion over oom-pah-pah strings.
    harbor: compile({ step: 0.25, gain: 5, scale: [7, 9, 11, 0, 2, 4, 6], combat: false, grace: false, accomp: "waltz", sec: {
      A:  { ch: "G G C G Em Am D G", mel: "B4.2 D5.2 G5.2 | F#5.3 E5.1 D5.2 | E5.2 G5.2 E5.2 | D5.4 B4.2 | B4.2 E5.2 G5.2 | A5.3 G5.1 E5.2 | D5.2 E5.2 F#5.2 | G5.6" },
      A2: { ch: "G G C G C Em D G", mel: "B4.2 D5.2 G5.2 | F#5.3 E5.1 D5.2 | E5.2 G5.2 E5.2 | D5.4 B4.2 | C5.2 E5.2 G5.2 | B5.3 A5.1 G5.2 | A5.2 D5.2 F#5.2 | G5.6" },
      B:  { ch: "C G Am F C G D G", mel: "E5.3 D5.1 C5.2 | D5.3 C5.1 B4.2 | C5.3 B4.1 A4.2 | A4.2 C5.2 F5.2 | G5.3 E5.1 C5.2 | D5.3 B4.1 G4.2 | A4.2 D5.2 C5.2 | B4.4 r.2" },
    }, form: [
      { sec: "A", pad: 0.6, bass: 1, arp: 0.8, once: true },
      { sec: "A", lead: "reed", pad: 0.35, bass: 1, arp: 0.8 },
      { sec: "B", lead: "pluck", pad: 0.5, bass: 1, arp: 0.6 },
      { sec: "A2", lead: "reed", pad: 0.35, bass: 1, arp: 0.8 },
      { sec: "B", pad: 0.6, bass: 1, arp: 0.9 },
      { sec: "A", rest: true, alt: true },
    ] }),
  };
  const SWAP = { pluck: "reed", reed: "pluck" };

  let players = [], theme = null, wantTheme = null, intWant = 0, intLevel = 0, intSeen = 0, lastTick = 0;
  const resumeAt = {};
  function newPlayer(name, t0) {
    const th = THEMES[name], out = G(0); out.connect(bus.musicIn);
    out.gain.setValueAtTime(0, t0); out.gain.linearRampToValueAtTime(th.gain, t0 + 2.5);
    const combat = th.combat ? G(0) : null; if (combat) combat.connect(out);
    const p = { name, th, out, combat, t: t0, fi: 0, bar: 0, cycle: 0, rng: mulberry32((Math.random() * 2 ** 31) | 0), endAt: 0, lastC: -1 };
    if (resumeAt[name]) { Object.assign(p, resumeAt[name]); nextSection(p); }   // pick the tune up where we left it
    return p;
  }
  function music(name) {
    if (name === "harbour") name = "harbor";
    if (name != null && !THEMES[name]) { console.warn("Snd.music: unknown theme", name); return; }
    wantTheme = name || null;
    if (!ctx || theme === wantTheme) return;
    theme = wantTheme;
    const now = ctx.currentTime; let t0 = now + 0.1;
    for (const p of players) if (!p.endAt) {   // the old theme finishes its bar while fading; the new one enters on that bar line
      t0 = Math.max(t0, p.t); p.endAt = p.t; resumeAt[p.name] = { fi: p.fi, cycle: p.cycle };
      const g = p.out.gain; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, Math.max(p.t, now + 1.2) + 0.8);
    }
    if (theme) players.push(newPlayer(theme, t0));
  }
  function nextSection(p) {
    const form = p.th.form;
    for (let k = 0; k < form.length * 2; k++) {
      if (++p.fi >= form.length) { p.fi = 0; p.cycle++; }
      const f = form[p.fi];
      if ((f.once && p.cycle > 0) || (f.alt && p.cycle % 2 === 0)) continue;
      p.bar = 0; return;
    }
  }
  function upper(m, th) { for (let k = 1; k <= 2; k++) if (th.pcs.has((m + k) % 12)) return m + k; return m + 2; }
  function leadNote(v, kind, t, m, d, r, th) {
    if (kind === "reed") { reed(v, t, hz(m), d * 0.94, 0.035); return; }
    if (th.grace && d > th.step * 1.5 && r() < 0.16) ks(v, Math.max(t - 0.05, ctx.currentTime), upper(m, th), 0.13, 1, 0.06);   // a grace note
    ks(v, t, m, 0.3, 1, d + 0.2);
  }
  function seaDrum(v, t, st, k, last, r) {
    for (const [s, vel, low] of [[0, 1, 1], [2, 0.3, 0], [3, 0.65, 1], [5, 0.35, 0]]) frameDrum(v, t + s * st, vel * k * (0.9 + r() * 0.2), low);
    if (r() < 0.3) frameDrum(v, t + 4 * st, 0.15 * k, 0);
    if (last) for (const s of [3.5, 4, 4.5, 5, 5.5]) frameDrum(v, t + s * st, (0.25 + s * 0.04) * k, 0);   // a roll into the next phrase
  }
  function playBar(p, t) {
    const th = p.th, f = th.form[p.fi], sec = th.sec[f.sec], b = p.bar, st = th.step, ch = sec.chords[b], r = p.rng;
    const last = b === sec.mel.length - 1;
    if (!f.rest) {
      const v = voice(t, p.out);
      if (f.pad) pad(v, t, ch.pad, st * 6, 0.032 * f.pad * (1 - 0.4 * intLevel));
      if (th.accomp === "waltz") {
        if (f.bass) ks(v, t, ch.bass, 0.32, 0.6, st * 2.2);
        if (f.arp) for (const s of [2, 4]) ch.pad.forEach((m, i) => ks(v, t + s * st + i * 0.016, m, 0.16 * f.arp, 0.7, st * 1.8));
      } else {
        if (f.bass) { ks(v, t, ch.bass, 0.3, 0.6, st * 3.1); ks(v, t + st * 3, ch.bass + (ch.bass + 7 <= 57 ? 7 : -5), 0.22, 0.6, st * 3.1); }
        if (f.arp) { const [a, b2, c] = ch.pad; [a, b2, c, a + 12, c, b2].forEach((m, i) => ks(v, t + i * st, m, (i % 3 ? 0.11 : 0.15) * f.arp, 0.8, st * 2)); }
        if (f.drum) seaDrum(v, t, st, f.drum, last, r);
      }
      const lead = p.cycle % 2 ? SWAP[f.lead] : f.lead;
      if (lead) for (const e of sec.mel[b]) leadNote(v, lead, t + e.s * st + (r() - 0.5) * 0.01, e.m, e.d * st, r, th);
      done(v);
    }
    if (p.combat && intLevel > 0.02) combatBar(p, t, ch, b, last);
    if (++p.bar >= sec.mel.length) nextSection(p);
  }
  // The combat layer is locked to the same bar grid. Drums come in first, the bass ostinato as the threat
  // grows, brass stabs only when it peaks; each joins on a bar line.
  function combatBar(p, t, ch, b, last) {
    const st = p.th.step, v = voice(t, p.combat), L = intLevel;
    const dk = clamp(L / 0.35, 0, 1), bk = clamp((L - 0.25) / 0.35, 0, 1), xk = clamp((L - 0.65) / 0.3, 0, 1);
    const LOW = [1, 0, 0, 0.85, 0, 0], SN = [0, 0.22, 0.32, 0, 0.28, 0.65], OST = [0, 0, 12, 0, 7, 12], VEL = [1, 0.55, 0.8, 0.9, 0.6, 0.8];
    for (let i = 0; i < 6; i++) {
      if (LOW[i]) tom(v, t + i * st, LOW[i] * dk, 68);
      if (SN[i]) snare(v, t + i * st, SN[i] * dk);
      if (bk > 0.02) bassNote(v, t + i * st, ch.bass - 12 + OST[i], st * 0.85, VEL[i] * bk);
    }
    if (last) for (let i = 0; i < 6; i++) tom(v, t + (3 + i * 0.5) * st, (0.4 + i * 0.1) * dk, 100 + i * 8);
    if (xk > 0.02 && b % 4 === 0) for (const k of [0, 7, 12]) brass(v, t, hz(ch.bass + k), st * 5.5, 0.07 * xk);
    done(v);
  }
  // Threat rises fast, then holds for a few seconds before it fades, so the drums do not pump on and off.
  function updateIntensity(now) {
    const dt = Math.min(0.25, Math.max(0, now - lastTick)); lastTick = now;
    if (intWant >= intLevel - 0.02) intSeen = now;
    const rate = intWant > intLevel ? 1.5 : now - intSeen > HOLD ? 0.25 : 0;
    intLevel += (intWant - intLevel) * Math.min(1, dt * rate);
    if (intWant === 0 && intLevel < 0.005) intLevel = 0;
    const g = 2.2 * Math.pow(intLevel, 0.7);
    for (const p of players) if (p.combat && Math.abs(g - p.lastC) > 0.004) { p.combat.gain.setTargetAtTime(g, now, 0.3); p.lastC = g; }
  }
  function tick() {
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    updateIntensity(now);
    for (const p of players) {
      if (p.endAt) continue;
      if (p.t < now - 0.1) p.t = now + 0.05;   // fell behind after a long stall: skip ahead rather than cram notes in
      while (p.t < now + LOOKAHEAD) { playBar(p, p.t); p.t += p.th.step * 6; }
    }
    players = players.filter(p => { const gone = p.endAt && now > p.endAt + 3; if (gone) p.out.disconnect(); return !gone; });
    ambTick(now);
  }

  // ---------- ambience: an endless sea bed, a harbour bed, and scattered events ----------
  let amb = null, ambKind = null, wantAmb = null, washK = -1;
  const nextAmb = { gull: 0, bell: 0, slap: 0, creak: 0 };
  function loopNoise(brown, t) { const s = ctx.createBufferSource(); s.buffer = brown ? noiseB : noiseW; s.loop = true; s.start(t, Math.random() * s.buffer.duration); return s; }
  function panTo(pan, dest) { if (!ctx.createStereoPanner) return dest; const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(dest); return p; }
  function buildAmb() {
    const t = ctx.currentTime, sea = G(0), harbor = G(0), wash = G(0); sea.connect(bus.ambient); harbor.connect(bus.ambient);
    // open sea: brown-noise swell rolling on slow, unrelated LFOs, decorrelated left and right
    for (const [pan, a, b] of [[-0.7, 0.071, 0.113], [0.7, 0.059, 0.097]]) {
      const lp = F("lowpass", 380, 0.5), g = G(0.3); lfo(a, 0.14, g.gain, t); lfo(b, 0.09, g.gain, t); lfo(a * 0.7, 110, lp.frequency, t);
      wire(loopNoise(true, t), lp, g, panTo(pan, sea));
    }
    const fb = F("bandpass", 2600, 0.5), fg = G(0.02); lfo(0.083, 0.016, fg.gain, t); wire(loopNoise(false, t), fb, fg, sea);    // foam on the crests
    const wb = F("bandpass", 620, 3.5), wg = G(0.05); lfo(0.043, 240, wb.frequency, t); lfo(0.029, 0.03, wg.gain, t); wire(loopNoise(false, t), wb, wg, sea);   // wind
    wire(loopNoise(false, t), F("bandpass", 950, 0.8), wash, sea);   // water rushing past our own hull (setMotion)
    const ll = F("lowpass", 600, 0.7), lg = G(0.22); lfo(0.29, 0.1, lg.gain, t); lfo(0.47, 0.07, lg.gain, t); wire(loopNoise(true, t), ll, lg, harbor);   // lapping at the quay
    amb = { sea, harbor, wash };
  }
  function ambience(kind) {
    if (kind === "harbour") kind = "harbor";
    if (kind != null && kind !== "sea" && kind !== "harbor") { console.warn("Snd.ambience: unknown kind", kind); return; }
    wantAmb = kind || null;
    if (!ctx) return;
    if (!amb) buildAmb();
    ambKind = wantAmb;
    const t = ctx.currentTime, [s, h] = ambKind === "sea" ? [1.6, 0] : ambKind === "harbor" ? [0.55, 1.6] : [0, 0];
    amb.sea.gain.setTargetAtTime(s, t, 1); amb.harbor.gain.setTargetAtTime(h, t, 1);
  }
  function setMotion(k) {
    const u = unit(k); if (!amb || u === null || Math.abs(u - washK) < 0.03) return;
    washK = u; amb.wash.gain.setTargetAtTime(0.09 * Math.pow(u, 1.5), ctx.currentTime, 0.4);
  }
  function gull(t, pan, k) {   // "kee-ow": a raspy glide up, then down
    const v = voice(t, amb.harbor, pan, 0, 0.9, bus.ambWet), f0 = rand(1250, 1500) * k;
    const o = O(v, "sawtooth", f0, t, t + 0.5), bp = F("bandpass", 1900, 2.2), am = G(0.65), rasp = O(v, "square", rand(55, 80), t, t + 0.5), rd = G(0.35), g = G();
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 1.5, t + 0.06); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + 0.36);
    g.gain.setValueAtTime(Z, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.05); g.gain.exponentialRampToValueAtTime(Z, t + 0.42);
    wire(rasp, rd, am.gain); wire(o, bp, am, g, v.out); done(v);
  }
  function ambTick(now) {
    if (!amb || !ambKind || muted) return;
    const due = (k, lo, hi) => { if (now < nextAmb[k]) return false; const first = !nextAmb[k]; nextAmb[k] = now + rand(lo, hi); return !first; };
    const ev = (pan, wet, lp) => voice(now + 0.05, ambKind === "harbor" ? amb.harbor : amb.sea, pan, lp, wet, bus.ambWet);
    if (ambKind === "harbor") {
      if (due("gull", 6, 15)) { const n = 1 + Math.floor(Math.random() * 3), pan = rand(-0.8, 0.8); for (let i = 0; i < n; i++) gull(now + 0.05 + i * rand(0.42, 0.6), pan, 1 - i * 0.06); }
      if (due("bell", 20, 42)) { const v = ev(rand(-0.5, 0.5), 0.8, 1500); bellStrike(v, v.t, 392, 0.12); if (Math.random() < 0.5) bellStrike(v, v.t + 0.5, 392, 0.09); done(v); }
      if (due("slap", 0.6, 2)) { const v = ev(rand(-0.7, 0.7), 0.1); hiss(v, v.t, "bandpass", rand(380, 900), 1.3, rand(0.05, 0.12), 0.012, rand(0.12, 0.26), true); done(v); }
      if (due("creak", 6, 13)) { const v = ev(rand(-0.6, 0.6), 0.2); creak(v, v.t, rand(70, 105), rand(0.6, 1.1), 0.05); done(v); }
    } else if (due("creak", 7, 15)) { const v = ev(rand(-0.3, 0.3), 0.1); creak(v, v.t, rand(85, 125), rand(0.5, 0.9), 0.035); done(v); }   // our own timbers
  }

  // ---------- context, buses, settings ----------
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
  function softClip() {   // linear to 0.8, then rounds off so the output never passes 1.0 (the stage before halves the signal)
    const n = 2049, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = (i / (n - 1) * 2 - 1) * 2, m = Math.abs(a); c[i] = Math.sign(a) * (m < 0.8 ? m : 0.8 + 0.2 * Math.tanh((m - 0.8) / 0.2)); }
    return c;
  }
  function build() {
    ctx = new AC({ latencyHint: "interactive" });
    const mix = G(1), master = G(muted ? 0 : taper(vol.master)), comp = ctx.createDynamicsCompressor(), clip = ctx.createWaveShaper(), meter = ctx.createAnalyser();
    comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.25;
    clip.curve = softClip(); meter.fftSize = 2048;
    wire(mix, comp, master, G(0.5), clip, ctx.destination); clip.connect(meter);
    bus = { mix, master, meter, musicIn: G(1) };
    for (const b of ["music", "sfx", "ambient"]) { bus[b] = G(taper(vol[b])); bus[b].connect(mix); }
    bus.musicIn.connect(bus.music);
    noiseW = noiseBuf(3, false); noiseB = noiseBuf(5, true);
    const verb = ctx.createConvolver(); verb.buffer = impulse(1.7); verb.connect(mix);
    bus.sfxWet = G(taper(vol.sfx)); bus.ambWet = G(taper(vol.ambient)); bus.sfxWet.connect(verb); bus.ambWet.connect(verb);
    const mWet = G(0.25); bus.music.connect(mWet); mWet.connect(verb);
    setInterval(tick, TICK_MS);
  }
  function unlock() {
    if (broken || pauses.size) return;
    if (!ctx) {
      try { build(); } catch (e) { broken = true; ctx = null; bus = null; console.warn("Snd: Web Audio is unavailable; the game will be silent.", e); return; }
      if (wantAmb) ambience(wantAmb);
      if (wantTheme) music(wantTheme);
    }
    if (ctx.state !== "running") ctx.resume().catch(() => {});
  }
  function pauseAll(reason = "user") { pauses.add(reason); if (ctx) ctx.suspend().catch(() => {}); }
  function resumeAll(reason = "user") { pauses.delete(reason); if (ctx && !pauses.size) ctx.resume().catch(() => {}); }
  function applyVol() {
    if (!bus) return;
    const t = ctx.currentTime, set = (n, v) => n.gain.setTargetAtTime(v, t, 0.04);
    set(bus.master, muted ? 0 : taper(vol.master)); set(bus.music, taper(vol.music));
    set(bus.sfx, taper(vol.sfx)); set(bus.sfxWet, taper(vol.sfx)); set(bus.ambient, taper(vol.ambient)); set(bus.ambWet, taper(vol.ambient));
  }
  function setVolume(name, v) {
    const u = unit(v);
    if (!BUSES.includes(name) || u === null) { console.warn(`Snd.setVolume: expected a bus (${BUSES.join(", ")}) and a number 0..1, got`, name, v); return false; }
    vol[name] = u; writeSettings({ volume: { ...vol } }); applyVol(); return true;
  }
  function setMuted(m) { muted = !!m; writeSettings({ muted }); applyVol(); return muted; }
  const meterBuf = new Float32Array(2048);
  function meter() {   // peak and RMS of the last ~43 ms of final output, 0..1
    if (!bus || !bus.meter.getFloatTimeDomainData) return { peak: 0, rms: 0 };
    bus.meter.getFloatTimeDomainData(meterBuf);
    let pk = 0, sq = 0; for (let i = 0; i < meterBuf.length; i++) { const x = meterBuf[i]; pk = Math.max(pk, Math.abs(x)); sq += x * x; }
    return { peak: pk, rms: Math.sqrt(sq / meterBuf.length) };
  }
  function debug() {
    const live = players.find(p => !p.endAt), f = live && live.th.form[live.fi];
    return { state: ctx ? ctx.state : broken ? "unavailable" : "locked", theme, ambience: ambKind, intensity: +intLevel.toFixed(3), voices: ctx ? activeCount(ctx.currentTime) : 0,
      muted, paused: [...pauses], section: f ? `${f.sec}${f.rest ? " (rest)" : ""} · bar ${live.bar + 1} · pass ${live.cycle + 1}` : null, strings: ksCache.size };
  }

  if (AC) {
    for (const ev of ["pointerdown", "keydown", "touchend", "click"]) window.addEventListener(ev, unlock, { capture: true, passive: true });
    document.addEventListener("visibilitychange", () => (document.hidden ? pauseAll("hidden") : resumeAll("hidden")));
  }
  return Object.freeze({
    names: Object.freeze(Object.keys(SFX)), themes: Object.freeze(Object.keys(THEMES)), buses: Object.freeze(BUSES.slice()),
    unlock, play, music, ambience, setMotion, pauseAll, resumeAll, setVolume, setMuted, meter, debug,
    setListener(x, y) { if (Number.isFinite(x) && Number.isFinite(y)) { listener.x = x; listener.y = y; } },
    setIntensity(v) { const u = unit(v); if (u !== null) intWant = u; },
    getVolume: name => vol[name],
    toggleMute: () => setMuted(!muted),
    isMuted: () => muted,
    state: () => (ctx ? ctx.state : broken ? "unavailable" : "locked"),
  });
})();
