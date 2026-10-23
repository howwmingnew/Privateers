"use strict";
// ---------- Music: the composed themes and how each one is arranged, bar by bar (sequenced by Snd, js/audio.js) ----------
// A theme is phrase data plus an arrangement. Melodies are strings of note.eighths, "|" between bars, 6 eighths a bar:
// "D5.2 A4.1 | ..." with one chord symbol per bar. A variant re-uses another theme's tune: pmap re-maps pitch classes
// (a change of mode), chmap / chords re-harmonise, and its own tempo, parts and drums re-orchestrate it.
//   family: themes of one family hand over at a phrase boundary and share their place in the tune (the four seas)
//   gain: trim so each theme sits near -25 dBFS RMS at default volume (measured with `node tests/audio.mjs --levels`)
//   form: the running order. lead: pluck | reed | brass | sparse (swapped every other pass, see swap) · oct: lead
//   transposition · pad / bass / arp / drum / drone / stab / timp: levels · once: first pass only · alt: every other
//   pass · rest: tacet (just the sea and any combat layer)
const SND_MUSIC = (() => {
  const { hz, pad, drone, ks, reed, brass, frameDrum, tom, snare, timp, bassNote } = SndKit;
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function pitchClass(s) { const m = /^([A-G])([#b]?)$/.exec(s); if (!m) throw new Error("Snd: bad pitch " + s); return (PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? 11 : 0)) % 12; }
  function midi(s) { const m = /^([A-G][#b]?)(\d)$/.exec(s); if (!m) throw new Error("Snd: bad note " + s); return 12 * (+m[2] + 1) + pitchClass(m[1]); }
  const near = (p, c) => c + ((p - c) % 12 + 18) % 12 - 6;   // pitch class p placed within a tritone of note c
  const into = (p, lo) => lo + ((p - lo) % 12 + 12) % 12;    // pitch class p placed in [lo, lo + 12)
  function chord(sym) {
    const m = /^([A-G][#b]?)(m?)$/.exec(sym); if (!m) throw new Error("Snd: bad chord " + sym);
    const r = pitchClass(m[1]), tones = [r, (r + (m[2] ? 3 : 4)) % 12, (r + 7) % 12];
    return { bass: near(r, 50), pad: tones.map(p => into(p, 55)).sort((a, b) => a - b) };
  }
  function bars(line) {
    return line.split("|").map((bar, i) => {
      let s = 0; const evs = [];
      for (const tok of bar.trim().split(/\s+/)) { const [n, d] = tok.split("."); if (n !== "r") evs.push({ s, m: midi(n), d: +d }); s += +d; }
      if (s !== 6) throw new Error(`Snd: bar ${i + 1} of "${line.slice(0, 24)}..." is ${s} eighths long, not 6`);
      return evs;
    });
  }
  const remap = (m, map) => { const pc = m % 12; return map && map[pc] != null ? m - pc + map[pc] : m; };
  const SWAP = { pluck: "reed", reed: "pluck" };
  function compile(name, d) {
    const th = { ...d, name, family: d.family || name, swap: d.swap || SWAP, pcs: new Set(d.scale), sec: {} };
    for (const k in d.sec) {
      const s = d.sec[k], mel = bars(s.mel).map(bar => bar.map(e => ({ ...e, m: remap(e.m, d.pmap) })));
      const syms = ((d.chords && d.chords[k]) || s.ch).split(/\s+/).map(c => (d.chmap && d.chmap[c]) || c);
      if (syms.length !== mel.length) throw new Error(`Snd: ${name} section ${k} has ${mel.length} bars but ${syms.length} chords`);
      th.sec[k] = { mel, chords: syms.map(chord) };
    }
    for (const f of th.form) if (!th.sec[f.sec]) throw new Error(`Snd: ${name} form uses missing section ${f.sec}`);
    return th;
  }

  // ---------- parts: each plays one bar. e = { t, st, b, f, sec, ch, last, r, L, cycle, th } ----------
  function upper(m, th) { for (let k = 1; k <= 2; k++) if (th.pcs.has((m + k) % 12)) return m + k; return m + 2; }
  function lead(v, e) {
    const { t, st, f, sec, b, r, th } = e, kind = e.cycle % 2 ? th.swap[f.lead] || f.lead : f.lead, oct = f.oct || 0;
    if (!kind) return;
    for (const n of sec.mel[b]) {
      const tt = t + n.s * st + (r() - 0.5) * 0.01, d = n.d * st, m = n.m + oct;
      if (kind === "reed") reed(v, tt, hz(m), d * 0.94, 0.035);
      else if (kind === "brass") brass(v, tt, hz(m), d * 0.88, 0.042);
      else if (kind === "sparse") { if (n.s % 3 === 0 || n.d >= 3) ks(v, tt, m, 0.27, 0.6); }   // only the strong beats ring on
      else {
        if (th.grace && d > st * 1.5 && r() < 0.16) ks(v, Math.max(tt - 0.05, SndKit.now()), upper(m, th), 0.13, 1, 0.06);   // a grace note
        ks(v, tt, m, 0.3, 1, d + 0.2);
      }
    }
  }
  const PARTS = {
    lead,
    pad(v, e) { if (e.f.pad) pad(v, e.t, e.ch.pad, e.st * 6, 0.032 * e.f.pad * (1 - 0.4 * e.L), e.th.padLp); },
    rollBass(v, { t, st, f, ch }) { if (f.bass) { ks(v, t, ch.bass, 0.3 * f.bass, 0.6, st * 3.1); ks(v, t + st * 3, ch.bass + (ch.bass + 7 <= 57 ? 7 : -5), 0.22 * f.bass, 0.6, st * 3.1); } },
    rollArp(v, { t, st, f, ch }) { if (f.arp) { const [a, b, c] = ch.pad; [a, b, c, a + 12, c, b].forEach((m, i) => ks(v, t + i * st, m, (i % 3 ? 0.11 : 0.15) * f.arp, 0.8, st * 2)); } },
    waltzBass(v, { t, st, f, ch }) { if (f.bass) ks(v, t, ch.bass, 0.32 * f.bass, 0.6, st * 2.2); },
    waltzArp(v, { t, st, f, ch }) { if (f.arp) for (const s of [2, 4]) ch.pad.forEach((m, i) => ks(v, t + s * st + i * 0.016, m, 0.16 * f.arp, 0.7, st * 1.8)); },
    // short, separated bass on the two beats of the bar, like a band on the march
    marchBass(v, { t, st, f, ch }) { if (f.bass) { ks(v, t, ch.bass, 0.32 * f.bass, 0.7, st * 1.5); ks(v, t + st * 3, ch.bass + (ch.bass + 7 <= 57 ? 7 : -5), 0.26 * f.bass, 0.7, st * 1.5); ks(v, t + st * 5, ch.bass, 0.12 * f.bass, 0.7, st * 0.8); } },
    // low strings galloping in eighths: the boss theme's engine
    gallop(v, { t, st, f, ch }) { if (f.bass) [0, 0, 7, 0, 0, 7].forEach((k, i) => ks(v, t + i * st, ch.bass + (ch.bass + k > 57 ? k - 12 : k), [1, 0.42, 0.62, 0.86, 0.42, 0.62][i] * 0.3 * f.bass, 0.75, st * 0.9)); },
    // a tonic pedal on D under everything: two low reeds, re-breathed each bar
    drone(v, { t, st, f }) { if (f.drone) { drone(v, t, 38, st * 6 + 0.35, 0.05 * f.drone); drone(v, t, 45, st * 6 + 0.35, 0.026 * f.drone); } },
    stab(v, { t, st, f, ch, b }) { if (f.stab && b % 4 === 0) for (const m of ch.pad) brass(v, t, hz(m), st * 1.6, 0.03 * f.stab); },
    timp(v, { t, st, f, ch, last }) {
      if (!f.timp) return;
      const m = into(ch.bass % 12, 41); timp(v, t, m, 0.8 * f.timp);
      if (last) for (let i = 0; i < 8; i++) timp(v, t + st * 3 + i * st * 0.36, m, (0.2 + i * 0.07) * f.timp);   // a roll into the next phrase
    },
    drum(v, e) { if (e.f.drum) DRUMS[e.th.drum](v, e, e.f.drum); },
  };
  const DRUMS = {
    frame(v, { t, st, last, r }, k) {   // the shanty's frame drum
      for (const [s, vel, low] of [[0, 1, 1], [2, 0.3, 0], [3, 0.65, 1], [5, 0.35, 0]]) frameDrum(v, t + s * st, vel * k * (0.9 + r() * 0.2), low);
      if (r() < 0.3) frameDrum(v, t + 4 * st, 0.15 * k, 0);
      if (last) for (const s of [3.5, 4, 4.5, 5, 5.5]) frameDrum(v, t + s * st, (0.25 + s * 0.04) * k, 0);   // a roll into the next phrase
    },
    sparse(v, { t, st, last, r }, k) {  // half the hits: the drum only marks the swell
      frameDrum(v, t, k, 1); frameDrum(v, t + 3 * st, 0.3 * k, 0);
      if (r() < 0.35) frameDrum(v, t + 5 * st, 0.18 * k, 0);
      if (last) { frameDrum(v, t + 3 * st, 0.6 * k, 1); frameDrum(v, t + 4.5 * st, 0.5 * k, 1); }
    },
    march(v, { t, st, last }, k) {      // a side drum: flams on the beats, a roll into each phrase
      [0.9, 0.25, 0.5, 0.75, 0.25, 0.5].forEach((vel, s) => { if (s % 3 === 0) snare(v, t + s * st - 0.022, 0.3 * k); snare(v, t + s * st, vel * k); });
      frameDrum(v, t, 0.8 * k, 1); frameDrum(v, t + 3 * st, 0.45 * k, 1);
      if (last) for (let i = 0; i < 10; i++) snare(v, t + st * 3 + i * st * 0.3, (0.18 + i * 0.05) * k);
    },
    heart(v, { t, b }, k) { if (b % 2 === 0) { frameDrum(v, t, 0.7 * k, 1); frameDrum(v, t + 0.17, 0.45 * k, 1); } },   // lub-dub, far off
    war(v, { t, st, last, L }, k) {     // toms on the beats, snare on the off-beats; harder when the boss bears down
      const q = k * (0.55 + 0.45 * L);
      tom(v, t, 0.75 * q, 105); tom(v, t + 3 * st, 0.6 * q, 98);
      snare(v, t + 2 * st, 0.45 * q); snare(v, t + 5 * st, 0.7 * q); frameDrum(v, t + st, 0.3 * q, 0); frameDrum(v, t + 4 * st, 0.3 * q, 0);
      if (last) for (let i = 0; i < 6; i++) tom(v, t + (3 + i * 0.5) * st, (0.35 + i * 0.08) * q, 115 + i * 9);
    },
    anthem(v, { t, st, last }, k) {
      frameDrum(v, t, k, 1); frameDrum(v, t + 3 * st, 0.6 * k, 1); frameDrum(v, t + 5 * st, 0.25 * k, 0);
      if (last) for (let i = 0; i < 8; i++) snare(v, t + st * 3 + i * st * 0.36, (0.1 + i * 0.04) * k);
    },
  };
  // The combat layer, locked to the same bar grid and high-passed by Snd at 120 Hz so it leaves the cannon its low end.
  // Drums come in first, the bass ostinato (an octave above the old one) only for a real fight, brass only at full
  // threat; each joins on a bar line.
  const LOW = [1, 0, 0, 0.85, 0, 0], SN = [0, 0.22, 0.32, 0, 0.28, 0.65], OST = [0, 0, 12, 0, 7, 12], VEL = [1, 0.55, 0.8, 0.9, 0.6, 0.8];
  function combat(v, { t, st, ch, b, last, L }) {
    const dk = clamp((L - 0.15) / 0.4, 0, 1), bk = clamp((L - 0.5) / 0.35, 0, 1), xk = clamp((L - 0.85) / 0.15, 0, 1);
    for (let i = 0; i < 6; i++) {
      if (LOW[i] && dk > 0.02) tom(v, t + i * st, LOW[i] * dk * 0.8, 112);
      if (SN[i] && dk > 0.02) snare(v, t + i * st, SN[i] * dk);
      if (bk > 0.02) bassNote(v, t + i * st, ch.bass + OST[i], st * 0.85, VEL[i] * bk * 0.7, 1800);
    }
    if (last && dk > 0.02) for (let i = 0; i < 6; i++) tom(v, t + (3 + i * 0.5) * st, (0.35 + i * 0.08) * dk, 120 + i * 10);
    if (xk > 0.02 && b % 4 === 0) for (const k of [12, 19, 24]) brass(v, t, hz(ch.bass + k), st * 5.5, 0.06 * xk);
  }

  // ---------- the tunes ----------
  // At sea: D Dorian in 6/8, a shanty-like tune.
  const SEA = {
    A:  { ch: "Dm Dm C C F C Am Dm", mel: "D5.2 A4.1 D5.2 E5.1 | F5.3 E5.2 D5.1 | C5.2 G4.1 C5.2 D5.1 | E5.3 D5.2 C5.1 | F5.2 A5.1 G5.2 F5.1 | E5.2 G5.1 F5.2 E5.1 | D5.2 E5.1 C5.2 A4.1 | D5.5 r.1" },
    A2: { ch: "Dm Dm G Am F C Am Dm", mel: "D5.2 A4.1 D5.2 E5.1 | F5.2 G5.1 A5.3 | G5.2 D5.1 B4.2 D5.1 | E5.3 C5.2 A4.1 | F5.2 E5.1 F5.2 A5.1 | G5.2 E5.1 C5.2 E5.1 | D5.2 C5.1 A4.2 C5.1 | D5.6" },
    B:  { ch: "F C Am G F C G Am", mel: "A5.3 G5.2 F5.1 | G5.3 E5.2 C5.1 | A5.2 G5.1 E5.2 D5.1 | D5.3 B4.3 | F5.2 G5.1 A5.2 C6.1 | C6.2 A5.1 G5.2 E5.1 | D5.2 G5.1 B5.2 A5.1 | A5.3 G5.1 F5.1 E5.1" },
  };
  // In harbour: a G major waltz with a Mixolydian F.
  const HARBOR = {
    A:  { ch: "G G C G Em Am D G", mel: "B4.2 D5.2 G5.2 | F#5.3 E5.1 D5.2 | E5.2 G5.2 E5.2 | D5.4 B4.2 | B4.2 E5.2 G5.2 | A5.3 G5.1 E5.2 | D5.2 E5.2 F#5.2 | G5.6" },
    A2: { ch: "G G C G C Em D G", mel: "B4.2 D5.2 G5.2 | F#5.3 E5.1 D5.2 | E5.2 G5.2 E5.2 | D5.4 B4.2 | C5.2 E5.2 G5.2 | B5.3 A5.1 G5.2 | A5.2 D5.2 F#5.2 | G5.6" },
    B:  { ch: "C G Am F C G D G", mel: "E5.3 D5.1 C5.2 | D5.3 C5.1 B4.2 | C5.3 B4.1 A4.2 | A4.2 C5.2 F5.2 | G5.3 E5.1 C5.2 | D5.3 B4.1 G4.2 | A4.2 D5.2 C5.2 | B4.4 r.2" },
  };
  // A bounty boss: D harmonic minor, a galloping 6/8 with brass over toms.
  const BOSS = {
    I: { ch: "Dm Dm Bb A", mel: "r.6 | r.6 | r.6 | r.3 A4.1 C#5.1 E5.1" },
    A: { ch: "Dm Dm A A Bb Gm A Dm", mel: "D5.3 A4.2 D5.1 | F5.3 E5.2 D5.1 | C#5.3 E5.2 A5.1 | A5.5 r.1 | Bb5.3 A5.2 G5.1 | G5.2 F5.1 E5.2 D5.1 | E5.2 F5.1 E5.2 C#5.1 | D5.5 r.1" },
    B: { ch: "F C Gm Dm Bb F Gm A", mel: "A5.2 C6.1 A5.2 F5.1 | G5.3 E5.2 C5.1 | D5.2 G5.1 Bb5.2 A5.1 | F5.3 D5.3 | D6.2 C6.1 Bb5.2 A5.1 | A5.2 G5.1 F5.2 C5.1 | D5.2 E5.1 F5.2 G5.1 | E5.3 C#5.3" },
  };
  const ROLL = ["pad", "rollBass", "rollArp", "drum", "lead"], WALTZ = ["pad", "waltzBass", "waltzArp", "lead"];
  const DEFS = {
    sea: { family: "sea", step: 0.21, gain: 4.5, scale: [2, 4, 5, 7, 9, 11, 0], combat: true, grace: true, parts: ROLL, drum: "frame", sec: SEA, form: [
      { sec: "A", pad: 0.8, bass: 1, arp: 0.7, once: true },
      { sec: "A", lead: "pluck", pad: 0.6, bass: 1, drum: 0.6 },
      { sec: "A2", lead: "pluck", pad: 0.6, bass: 1, drum: 0.7 },
      { sec: "B", lead: "reed", pad: 0.3, bass: 1, drum: 0.8, arp: 0.5 },
      { sec: "A2", lead: "reed", pad: 0.4, bass: 1, drum: 0.6, arp: 0.4 },
      { sec: "A", pad: 0.6, bass: 1, arp: 0.8, drum: 0.3 },
      { sec: "A", rest: true, alt: true }, { sec: "A2", rest: true, alt: true },
    ] },
    // The Reef Straits: the same tune in D Aeolian (B flat), slower, reed first, the drum only marking the swell.
    sea_reef: { family: "sea", step: 0.235, gain: 4.6, scale: [2, 4, 5, 7, 9, 10, 0], pmap: { 11: 10 }, chmap: { G: "Gm" }, combat: true, grace: true,
      parts: ROLL, drum: "sparse", padLp: 900, sec: SEA, form: [
      { sec: "A", pad: 0.9, bass: 1, once: true },
      { sec: "A", lead: "reed", pad: 0.55, bass: 1, drum: 0.6 },
      { sec: "A2", lead: "reed", pad: 0.5, bass: 1, drum: 0.7, arp: 0.4 },
      { sec: "B", lead: "pluck", pad: 0.5, bass: 1, drum: 0.8, arp: 0.5 },
      { sec: "A2", lead: "pluck", pad: 0.6, bass: 1, drum: 0.5 },
      { sec: "A", rest: true, alt: true }, { sec: "B", rest: true, alt: true },
    ] },
    // The Navy Lanes: Dorian still, but a march: side drum, short bass, a brass lead.
    sea_lanes: { family: "sea", step: 0.2, gain: 4.2, scale: [2, 4, 5, 7, 9, 11, 0], combat: true, grace: false, swap: { brass: "reed", reed: "brass", pluck: "brass" },
      parts: ["pad", "marchBass", "drum", "lead"], drum: "march", sec: SEA, form: [
      { sec: "A", pad: 0.5, bass: 1, drum: 0.6, once: true },
      { sec: "A", lead: "brass", pad: 0.4, bass: 1, drum: 0.7 },
      { sec: "A2", lead: "reed", pad: 0.4, bass: 1, drum: 0.7 },
      { sec: "B", lead: "brass", pad: 0.3, bass: 1, drum: 0.8 },
      { sec: "A", lead: "pluck", pad: 0.5, bass: 1, drum: 0.4 },
      { sec: "A2", rest: true, alt: true }, { sec: "B", rest: true, alt: true },
    ] },
    // The Maelstrom: D Phrygian (E and B flat) over a low reed drone, sparse plucks, a far-off heartbeat, long silences.
    sea_maelstrom: { family: "sea", step: 0.27, gain: 4.4, scale: [2, 3, 5, 7, 9, 10, 0], pmap: { 4: 3, 11: 10 }, chmap: { C: "Cm", Am: "F", G: "Gm" }, combat: true, grace: false,
      swap: { sparse: "reed", reed: "sparse" }, parts: ["drone", "pad", "rollArp", "drum", "lead"], drum: "heart", padLp: 760, sec: SEA, form: [
      { sec: "A", drone: 1, pad: 0.5, once: true },
      { sec: "A", lead: "sparse", drone: 1, pad: 0.3, drum: 0.5 },
      { sec: "A2", lead: "reed", oct: -12, drone: 0.8, pad: 0.25, drum: 0.5 },
      { sec: "B", lead: "sparse", drone: 1, arp: 0.3, drum: 0.6 },
      { sec: "A", drone: 1, pad: 0.45 },
      { sec: "A2", rest: true },
    ] },
    boss: { step: 0.19, gain: 4, scale: [2, 4, 5, 7, 9, 10, 1], combat: false, grace: false, swap: { brass: "reed", reed: "brass" },
      parts: ["pad", "gallop", "stab", "drum", "lead"], drum: "war", padLp: 1000, sec: BOSS, form: [
      { sec: "I", bass: 1, drum: 0.6, once: true },
      { sec: "A", lead: "brass", bass: 1, drum: 1, pad: 0.35, stab: 1 },
      { sec: "A", lead: "reed", bass: 1, drum: 0.85, pad: 0.45 },
      { sec: "B", lead: "brass", bass: 1, drum: 1, pad: 0.35, stab: 1 },
      { sec: "A", lead: "pluck", bass: 1, drum: 0.7, pad: 0.5 },
      { sec: "I", bass: 0.8, drum: 0.5, pad: 0.4 },
    ] },
    harbor: { step: 0.25, gain: 5, scale: [7, 9, 11, 0, 2, 4, 6], combat: false, grace: false, parts: WALTZ, sec: HARBOR, form: [
      { sec: "A", pad: 0.6, bass: 1, arp: 0.8, once: true },
      { sec: "A", lead: "reed", pad: 0.35, bass: 1, arp: 0.8 },
      { sec: "B", lead: "pluck", pad: 0.5, bass: 1, arp: 0.6 },
      { sec: "A2", lead: "reed", pad: 0.35, bass: 1, arp: 0.8 },
      { sec: "B", pad: 0.6, bass: 1, arp: 0.9 },
      { sec: "A", rest: true, alt: true },
    ] },
    // The title: the harbour waltz, slow, on a solo reed.
    title: { step: 0.31, gain: 6, scale: [7, 9, 11, 0, 2, 4, 6], combat: false, grace: false, swap: {}, parts: WALTZ, sec: HARBOR, form: [
      { sec: "A", lead: "reed", pad: 0.7 },
      { sec: "B", lead: "reed", pad: 0.55, arp: 0.35 },
      { sec: "A2", lead: "pluck", pad: 0.6, bass: 0.6 },
      { sec: "A", rest: true },
    ] },
    // The ending: the sea tune again, now in D major, a fanfare and the full band, then it settles down to loop gently.
    ending: { step: 0.25, gain: 4.3, scale: [2, 4, 6, 7, 9, 11, 1], pmap: { 5: 6, 0: 1 }, combat: false, grace: true, swap: { brass: "reed", reed: "pluck", pluck: "reed" },
      parts: ["pad", "rollBass", "rollArp", "timp", "drum", "lead"], drum: "anthem",
      chords: { A: "D D A A D Em A D", A2: "D D G A D A A D", B: "D A A G F#m A G A" },
      sec: { ...SEA, F: { ch: "D G A D", mel: "A4.1 D5.1 F#5.1 A5.3 | B5.2 A5.1 G5.2 F#5.1 | E5.2 F#5.1 G5.2 C#5.1 | D5.6" } }, form: [
      { sec: "F", lead: "brass", pad: 0.5, timp: 1, once: true },
      { sec: "A", lead: "brass", pad: 0.5, bass: 1, arp: 0.5, drum: 0.8, timp: 0.6, once: true },
      { sec: "B", lead: "reed", pad: 0.45, bass: 1, arp: 0.6, drum: 0.7, once: true },
      { sec: "A2", lead: "brass", pad: 0.5, bass: 1, arp: 0.5, drum: 0.9, timp: 0.8, once: true },
      { sec: "A", lead: "reed", pad: 0.6, bass: 1, arp: 0.6 },
      { sec: "B", lead: "pluck", pad: 0.5, bass: 1, arp: 0.7, drum: 0.3 },
      { sec: "A2", lead: "reed", pad: 0.6, bass: 1 },
      { sec: "A", rest: true, alt: true },
    ] },
  };
  const themes = Object.fromEntries(Object.entries(DEFS).map(([k, d]) => [k, compile(k, d)]));
  function arrange(v, e) { for (const p of e.th.parts) PARTS[p](v, e); }
  return { themes, arrange, combat, chord };
})();
