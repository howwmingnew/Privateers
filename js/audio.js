"use strict";
// ---------- Audio ----------
// Every sound in the game is synthesised at runtime with the Web Audio API. There are no audio files.
// js/audio-kit.js (graph helpers, instruments) · js/audio-sfx.js (effect patches) · js/audio-music.js (themes) load first.
// One global, Snd:
//   Snd.play(name, { x, y, pan, gain, pitch, big, amount, delay })   one-shot effect (x/y = world position)
//   Snd.setListener(x, y) · Snd.setMotion(0..1)                       ears on the player, own-ship speed
//   Snd.music("sea" | "harbor" | "title" | "ending" | null)           "sea" plays the current sea's variant, or the boss theme
//   Snd.setSea(id) · Snd.setBoss(bool) · Snd.setIntensity(0..1)       which sea, a bounty boss in the fight, combat layer
//   Snd.ambience("sea" | "harbor" | null) · Snd.setShore(0..1, pan)   ambience; how close land is (gulls, surf)
//   Snd.setVolume(bus, 0..1) · Snd.getVolume(bus)                     bus = master | music | sfx | ambient
//   Snd.setMuted(b) · Snd.toggleMute() · Snd.isMuted()
//   Snd.pauseAll(reason) · Snd.resumeAll(reason)                       the tab being hidden pauses on its own
// Signal flow: voices -> sfx / music / ambient buses (+ a shared reverb) -> mix -> limiter -> master -> soft clip.
// The music and ambience pass through sidechain gains that dip under the player's guns and nearby impacts, so the
// cannon is always the loudest thing in the mix; the music's low end also steps aside as a fight heats up.
// The AudioContext is created on the first user gesture (browsers block autoplay). Until then one-shot effects
// are dropped, and the music and ambience asked for are remembered and started on unlock.
const Snd = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  const { Z, G, F, wire, voice, done, O, loopNoise, lfo, panTo, hiss, creak, bellStrike, impulse } = SndKit;
  const SFX = SND_SFX, THEMES = SND_MUSIC.themes;
  const SETTINGS_KEY = "privateers-settings";
  const DEFAULT_VOL = { master: 0.8, music: 0.5, sfx: 0.8, ambient: 0.6 };
  const BUSES = Object.keys(DEFAULT_VOL);
  const NEAR = 160, FAR = 1500, PAN_SPAN = 900;  // world px: full volume inside NEAR, silent past a sound's `far`
  const MAX_VOICES = 40;                          // all effects together; low-priority ones are dropped past this
  const LOOKAHEAD = 0.3, TICK_MS = 40;            // music scheduler: queue bars this far ahead, wake this often
  const HOLD = 2.5;                               // seconds the combat layer holds on after the threat drops
  const MUSIC_TRIM = 0.87, COMBAT_MAX = 0.6;        // score level under the limiter; the combat layer at full threat
  const LIMIT = { thr: -4, knee: 3, ratio: 16, att: 0.002, rel: 0.1, pre: 0.7 };   // master limiter, and the gain into the soft clip
  const SEA_THEME = { shallows: "sea", reef: "sea_reef", lanes: "sea_lanes", maelstrom: "sea_maelstrom" };
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

  let ctx = null, bus = null, broken = !AC;
  const pauses = new Set(), listener = { x: 0, y: 0 }, voices = {}, lastAt = {};

  // ---------- one-shot effects ----------
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
    if (def.chord) v.ch = curChord();
    const k = opts.gain == null ? 1 : clamp(+opts.gain || 0, 0, 2);
    v.out.gain.value = att * def.gain * k * rand(1 - def.gv, 1);
    const dd = (def.duck || 0) * clamp((att - 0.4) / 0.6, 0, 1) * Math.min(k, 1);   // only what lands close dips the score
    if (dd >= 1) sidechain(dd, def.hold || 0.2, t);
    if (def.stinger) stinger(def.stinger[0], def.stinger[1], t);
    def.fn(v); list.push(v); done(v);
    return true;
  }
  // Sidechain: the music (and, half as deep, the ambience) dips fast under a loud effect, holds, then recovers in
  // ~0.3 s. A broadside re-triggers it every gun, so the dip lasts as long as the guns do and never stacks deeper.
  const sc = { lvl: 1, until: 0 };
  function sidechain(db, hold, t) {
    const now = ctx.currentTime, active = now < sc.until, want = Math.pow(10, -db / 20);
    const lvl = active ? Math.min(sc.lvl, want) : want, until = Math.max(active ? sc.until : 0, t + hold);
    if (active && lvl === sc.lvl && until - sc.until < 0.02) return;
    sc.lvl = lvl; sc.until = until;
    for (const [g, k] of [[bus.scMusic.gain, 1], [bus.scAmb.gain, 0.5]]) {
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.setTargetAtTime(Math.pow(lvl, k), t, 0.008); g.setTargetAtTime(1, until, 0.1);
    }
  }
  // A musical cue (fanfare, defeat) holds the score down for its length instead.
  function stinger(level, dur, t) {
    const g = bus.musicIn.gain, now = ctx.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.setTargetAtTime(level, t, 0.05); g.setTargetAtTime(1, t + dur, 0.6);
  }

  // ---------- music: the composed themes (js/audio-music.js), played by a look-ahead scheduler ----------
  let players = [], wantTheme = null, seaId = "shallows", boss = false, intWant = 0, intLevel = 0, intSeen = 0, lastTick = 0, lastEq = 0;
  const resumeAt = {}, DEFAULT_CH = SND_MUSIC.chord("Dm");
  const live = () => players.find(p => !p.endAt);
  const resolve = () => wantTheme === "sea" ? (boss ? "boss" : SEA_THEME[seaId]) : wantTheme;
  const allowed = (f, cycle) => !((f.once && cycle > 0) || (f.alt && cycle % 2 === 0));
  function newPlayer(name, t0, pos, fade) {
    const th = THEMES[name], out = G(0); out.connect(bus.musicIn);
    out.gain.setValueAtTime(0, t0); out.gain.linearRampToValueAtTime(th.gain * MUSIC_TRIM, t0 + fade);
    let combat = null;
    if (th.combat) { combat = G(0); wire(combat, F("highpass", 120, 0.7), out); }   // the combat layer leaves the guns their low end
    const p = { name, th, out, combat, t: t0, fi: 0, bar: 0, cycle: 0, rng: mulberry32((Math.random() * 2 ** 31) | 0), endAt: 0, lastC: -1, hist: [], handoff: null };
    if (pos) {   // pick the tune up where we left it
      p.fi = pos.fi % th.form.length; p.cycle = pos.cycle;
      if (pos.next || !allowed(th.form[p.fi], p.cycle)) nextSection(p);
    }
    return p;
  }
  function fadeOut(p, t) { const g = p.out.gain, now = ctx.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, t); }
  // Variants of one family (the four seas) hand over at the next phrase boundary, mid-tune; anything else crossfades
  // on the next bar line.
  function apply() {
    if (!ctx) return;
    const eff = resolve(), p = live();
    if (p && p.name === eff) { p.handoff = null; return; }
    if (p && eff && p.th.family === THEMES[eff].family) { p.handoff = eff; return; }
    const now = ctx.currentTime; let t0 = now + 0.1;
    for (const q of players) if (!q.endAt) {   // the old theme finishes its bar while fading; the new one enters on that bar line
      t0 = Math.max(t0, q.t); q.endAt = q.t; resumeAt[q.th.family] = { fi: q.fi, cycle: q.cycle, next: true };
      fadeOut(q, Math.max(q.t, now + 1.2) + 0.8);
    }
    if (eff) players.push(newPlayer(eff, t0, resumeAt[THEMES[eff].family], 2.5));
  }
  function music(name) {
    if (name === "harbour") name = "harbor";
    if (name != null && !THEMES[name]) { console.warn("Snd.music: unknown theme", name); return; }
    wantTheme = name || null; apply();
  }
  function setSea(id) { if (!SEA_THEME[id]) { console.warn("Snd.setSea: unknown sea", id); return; } if (id !== seaId) { seaId = id; apply(); ambColour(); } }
  function setBoss(b) { if (!!b !== boss) { boss = !!b; apply(); } }
  function nextSection(p) {
    const form = p.th.form;
    for (let k = 0; k < form.length * 2; k++) {
      if (++p.fi >= form.length) { p.fi = 0; p.cycle++; }
      if (!allowed(form[p.fi], p.cycle)) continue;
      p.bar = 0; return;
    }
  }
  function playBar(p, t) {
    const th = p.th, f = th.form[p.fi], sec = th.sec[f.sec], b = p.bar;
    const e = { t, st: th.step, b, f, sec, ch: sec.chords[b], last: b === sec.mel.length - 1, r: p.rng, L: intLevel, cycle: p.cycle, th };
    p.hist.push({ t, ch: e.ch }); if (p.hist.length > 4) p.hist.shift();
    if (!f.rest) { const v = voice(t, p.out); SND_MUSIC.arrange(v, e); done(v); }
    if (p.combat && intLevel > 0.02) { const v = voice(t, p.combat); SND_MUSIC.combat(v, e); done(v); }
    if (++p.bar < sec.mel.length) return;
    nextSection(p);
    if (p.handoff) {   // the next phrase belongs to the new variant: hand it over on the bar line
      const tn = t + th.step * 6, name = p.handoff;
      p.handoff = null; p.endAt = tn; fadeOut(p, tn + 1.5);
      players.push(newPlayer(name, tn, { fi: p.fi, cycle: p.cycle }, 0.15));
    }
  }
  // the chord sounding now, so a cue can play in tune with the score
  function curChord() {
    const p = live(), now = ctx.currentTime;
    if (!p || !p.hist.length) return DEFAULT_CH;
    for (let i = p.hist.length - 1; i >= 0; i--) if (p.hist[i].t <= now + 0.03) return p.hist[i].ch;
    return p.hist[0].ch;
  }
  // Threat rises fast, then holds a moment before it fades, so the drums do not pump on and off.
  function updateIntensity(now) {
    const dt = Math.min(0.25, Math.max(0, now - lastTick)); lastTick = now;
    if (intWant >= intLevel - 0.02) intSeen = now;
    const rate = intWant > intLevel ? 1.5 : now - intSeen > HOLD ? 0.45 : 0;
    intLevel += (intWant - intLevel) * Math.min(1, dt * rate);
    if (intWant === 0 && intLevel < 0.005) intLevel = 0;
    const g = COMBAT_MAX * Math.min(1, intLevel / 0.25);
    for (const p of players) if (p.combat && Math.abs(g - p.lastC) > 0.004) { p.combat.gain.setTargetAtTime(g, now, 0.3); p.lastC = g; }
    if (Math.abs(intLevel - lastEq) > 0.02) { bus.musicEq.gain.setTargetAtTime(-7 * intLevel, now, 0.4); lastEq = intLevel; }   // the score's lows step aside for the guns
  }
  function tick() {
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    updateIntensity(now);
    for (let i = 0; i < players.length; i++) {   // by index: a phrase handoff appends the next player mid-loop
      const p = players[i];
      if (p.endAt) continue;
      if (p.t < now - 0.1) p.t = now + 0.05;   // fell behind after a long stall: skip ahead rather than cram notes in
      while (!p.endAt && p.t < now + LOOKAHEAD) { const t = p.t; p.t += p.th.step * 6; playBar(p, t); }
    }
    players = players.filter(p => { const gone = p.endAt && now > p.endAt + 3; if (gone) p.out.disconnect(); return !gone; });
    ambTick(now);
  }

  // ---------- ambience: an endless sea bed coloured per sea, a harbour bed, and scattered events ----------
  let amb = null, ambKind = null, wantAmb = null, washK = -1, shore = 0, shorePan = 0;
  const nextAmb = { gull: 0, bell: 0, slap: 0, creak: 0, far: 0, surf: 0 };
  // per sea: swell low-pass Hz, swell level, foam on the crests, wind level, wind pitch Hz
  const SEA_AMB = { shallows: [380, 1, 0.02, 0.05, 620], reef: [470, 1.05, 0.034, 0.05, 690], lanes: [340, 0.95, 0.018, 0.068, 780], maelstrom: [255, 1.3, 0.012, 0.1, 470] };
  function buildAmb() {
    const t = ctx.currentTime, sea = G(0), harbor = G(0), wash = G(0), swell = G(1); sea.connect(bus.ambIn); harbor.connect(bus.ambIn); swell.connect(sea);
    // open sea: brown-noise swell rolling on slow, unrelated LFOs, decorrelated left and right
    const swellLp = [[-0.7, 0.071, 0.113], [0.7, 0.059, 0.097]].map(([pan, a, b]) => {
      const lp = F("lowpass", 380, 0.5), g = G(0.3); lfo(a, 0.14, g.gain, t); lfo(b, 0.09, g.gain, t); lfo(a * 0.7, 110, lp.frequency, t);
      wire(loopNoise(true, t), lp, g, panTo(pan, swell)); return lp;
    });
    const fb = F("bandpass", 2600, 0.5), foam = G(0.02); lfo(0.083, 0.016, foam.gain, t); wire(loopNoise(false, t), fb, foam, sea);    // foam on the crests
    const windBp = F("bandpass", 620, 3.5), wind = G(0.05); lfo(0.043, 240, windBp.frequency, t); lfo(0.029, 0.03, wind.gain, t); wire(loopNoise(false, t), windBp, wind, sea);   // wind
    wire(loopNoise(false, t), F("bandpass", 950, 0.8), wash, sea);   // water rushing past our own hull (setMotion)
    const ll = F("lowpass", 600, 0.7), lg = G(0.22); lfo(0.29, 0.1, lg.gain, t); lfo(0.47, 0.07, lg.gain, t); wire(loopNoise(true, t), ll, lg, harbor);   // lapping at the quay
    amb = { sea, harbor, wash, swell, swellLp, foam, wind, windBp };
    ambColour();
  }
  function ambColour() {
    if (!amb) return;
    const [lp, lvl, foam, wind, windHz] = SEA_AMB[seaId], t = ctx.currentTime, to = (prm, v) => prm.setTargetAtTime(v, t, 2.5);
    for (const f of amb.swellLp) to(f.frequency, lp);
    to(amb.swell.gain, lvl); to(amb.foam.gain, foam); to(amb.wind.gain, wind); to(amb.windBp.frequency, windHz);
  }
  function ambience(kind) {
    if (kind === "harbour") kind = "harbor";
    if (kind != null && kind !== "sea" && kind !== "harbor") { console.warn("Snd.ambience: unknown kind", kind); return; }
    wantAmb = kind || null;
    if (!ctx) return;
    if (!amb) buildAmb();
    ambKind = wantAmb;
    const t = ctx.currentTime, [s, h] = ambKind === "sea" ? [1.75, 0] : ambKind === "harbor" ? [0.6, 1.75] : [0, 0];
    amb.sea.gain.setTargetAtTime(s, t, 1); amb.harbor.gain.setTargetAtTime(h, t, 1);
  }
  function setMotion(k) {
    const u = unit(k); if (!amb || u === null || Math.abs(u - washK) < 0.03) return;
    washK = u; amb.wash.gain.setTargetAtTime(0.09 * Math.pow(u, 1.5), ctx.currentTime, 0.4);
  }
  function gull(t, pan, k, dest, lvl = 0.05) {   // "kee-ow": a raspy glide up, then down
    const v = voice(t, dest, pan, 0, 0.9, bus.ambWet), f0 = rand(1250, 1500) * k;
    const o = O(v, "sawtooth", f0, t, t + 0.5), bp = F("bandpass", 1900, 2.2), am = G(0.65), rasp = O(v, "square", rand(55, 80), t, t + 0.5), rd = G(0.35), g = G();
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 1.5, t + 0.06); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + 0.36);
    g.gain.setValueAtTime(Z, t); g.gain.exponentialRampToValueAtTime(lvl, t + 0.05); g.gain.exponentialRampToValueAtTime(Z, t + 0.42);
    wire(rasp, rd, am.gain); wire(o, bp, am, g, v.out); done(v);
  }
  function gulls(t, pan, dest, lvl) { const n = 1 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) gull(t + i * rand(0.42, 0.6), pan, 1 - i * 0.06, dest, lvl); }
  // the next bar line of the score, so the harbour bell rings on the beat
  function nextBarLine(now) {
    const p = live(); if (!p) return now + 0.05;
    const len = p.th.step * 6; let tb = p.t; while (tb - len >= now + 0.05) tb -= len; return Math.max(tb, now + 0.05);
  }
  function ambTick(now) {
    if (!amb || !ambKind || muted) return;
    const due = (k, lo, hi) => { if (now < nextAmb[k]) return false; const first = !nextAmb[k]; nextAmb[k] = now + rand(lo, hi); return !first; };
    const ev = (pan, wet, lp, t = now + 0.05) => voice(t, ambKind === "harbor" ? amb.harbor : amb.sea, pan, lp, wet, bus.ambWet);
    if (ambKind === "harbor") {
      if (due("gull", 6, 15)) gulls(now + 0.05, rand(-0.8, 0.8), amb.harbor, 0.05);
      if (due("bell", 20, 42) && now - (lastAt.bell ?? -1e9) > 12) {   // never on top of the dock bell; on the beat of the waltz
        const v = ev(rand(-0.5, 0.5), 0.8, 1500, nextBarLine(now)); bellStrike(v, v.t, 392, 0.12); if (Math.random() < 0.5) bellStrike(v, v.t + 0.5, 392, 0.09); done(v);
      }
      if (due("slap", 0.6, 2)) { const v = ev(rand(-0.7, 0.7), 0.1); hiss(v, v.t, "bandpass", rand(380, 900), 1.3, rand(0.05, 0.12), 0.012, rand(0.12, 0.26), true); done(v); }
      if (due("creak", 6, 13)) { const v = ev(rand(-0.6, 0.6), 0.2); creak(v, v.t, rand(70, 105), rand(0.6, 1.1), 0.05); done(v); }
      return;
    }
    if (due("creak", 7, 15)) { const v = ev(rand(-0.3, 0.3), 0.1); creak(v, v.t, rand(85, 125), rand(0.5, 0.9), 0.035); done(v); }   // our own timbers
    // near land: gulls over the shallows and reefs, surf breaking on the rocks
    if (shore > 0.15 && seaId !== "maelstrom" && due("gull", 5, 12)) gulls(now + 0.05, shorePan, amb.sea, 0.04 * shore);
    if (shore > 0.25 && due("surf", 2.5, 6)) {
      const v = ev(shorePan, 0.4, 0); hiss(v, v.t, "bandpass", rand(700, 1300), 0.7, 0.07 * shore, rand(0.25, 0.5), rand(0.8, 1.4), false); done(v);
    }
    if (seaId === "lanes" && due("far", 35, 70)) {   // a warship's watch bell, somewhere out of sight
      const v = ev(rand(-0.8, 0.8), 1, 900); bellStrike(v, v.t, 466, 0.06); bellStrike(v, v.t + 0.45, 466, 0.045); done(v);
    }
    if (seaId === "maelstrom" && due("far", 22, 50)) {   // thunder rolling round the edge of the chart
      const v = ev(rand(-0.6, 0.6), 0.6, 0); hiss(v, v.t, "lowpass", 900, 0.7, 0.05, 0.004, 0.18, true); hiss(v, v.t + 0.05, "lowpass", 190, 0.7, 0.28, 0.35, rand(2.2, 3.2), true); done(v);
    }
  }

  // ---------- context, buses, settings ----------
  function softClip() {   // x2, linear to 0.8, then rounds off so the output never passes 1.0
    const n = 2049, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = (i / (n - 1) * 2 - 1) * 2, m = Math.abs(a); c[i] = Math.sign(a) * (m < 0.8 ? m : 0.8 + 0.2 * Math.tanh((m - 0.8) / 0.2)); }
    return c;
  }
  function build() {
    ctx = new AC({ latencyHint: "interactive" });
    SndKit.bind(ctx);
    const mix = G(1), master = G(muted ? 0 : taper(vol.master)), comp = ctx.createDynamicsCompressor(), clip = ctx.createWaveShaper(), meter = ctx.createAnalyser();
    // a peak limiter, not a squasher: normal play passes through it linearly, so a gun keeps its punch over the score
    comp.threshold.value = LIMIT.thr; comp.knee.value = LIMIT.knee; comp.ratio.value = LIMIT.ratio; comp.attack.value = LIMIT.att; comp.release.value = LIMIT.rel;
    clip.curve = softClip(); meter.fftSize = 2048;
    wire(mix, comp, master, G(LIMIT.pre), clip, ctx.destination); clip.connect(meter);
    bus = { mix, master, meter, musicIn: G(1), scMusic: G(1), musicEq: F("lowshelf", 180, 0.7), ambIn: G(1), scAmb: G(1) };
    bus.musicEq.gain.value = 0;
    for (const b of ["music", "sfx", "ambient"]) { bus[b] = G(taper(vol[b])); bus[b].connect(mix); }
    wire(bus.musicIn, bus.scMusic, bus.musicEq, bus.music); wire(bus.ambIn, bus.scAmb, bus.ambient);
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
      apply();
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
    const p = live(), f = p && p.th.form[p.fi];
    return { state: ctx ? ctx.state : broken ? "unavailable" : "locked", theme: wantTheme, playing: p ? p.name : null, sea: seaId, boss, ambience: ambKind,
      intensity: +intLevel.toFixed(3), voices: ctx ? activeCount(ctx.currentTime) : 0, muted, paused: [...pauses],
      duck: bus ? +(20 * Math.log10(Math.max(1e-4, bus.scMusic.gain.value))).toFixed(1) : 0,
      section: f ? `${f.sec}${f.rest ? " (rest)" : ""} · bar ${p.bar + 1} · pass ${p.cycle + 1}` : null, strings: SndKit.strings() };
  }

  if (AC) {
    for (const ev of ["pointerdown", "keydown", "touchend", "click"]) window.addEventListener(ev, unlock, { capture: true, passive: true });
    document.addEventListener("visibilitychange", () => (document.hidden ? pauseAll("hidden") : resumeAll("hidden")));
  }
  return Object.freeze({
    names: Object.freeze(Object.keys(SFX)), themes: Object.freeze(Object.keys(THEMES)), seas: Object.freeze(Object.keys(SEA_THEME)), buses: Object.freeze(BUSES.slice()),
    unlock, play, music, ambience, setMotion, setSea, setBoss, pauseAll, resumeAll, setVolume, setMuted, meter, debug,
    setListener(x, y) { if (Number.isFinite(x) && Number.isFinite(y)) { listener.x = x; listener.y = y; } },
    setIntensity(v) { const u = unit(v); if (u !== null) intWant = u; },
    setShore(k, pan) { const u = unit(k); if (u !== null) { shore = u; shorePan = clamp(+pan || 0, -1, 1); } },
    getVolume: name => vol[name],
    toggleMute: () => setMuted(!muted),
    isMuted: () => muted,
    state: () => (ctx ? ctx.state : broken ? "unavailable" : "locked"),
  });
})();
