"use strict";
// ---------- Sound effects: one synth patch per name, played by Snd.play (js/audio.js) ----------
// max: voices of this sound at once (the oldest is stolen) · gap: min seconds between triggers · pv / gv: random
// pitch / gain spread · far: silent beyond this many world px · pri >= 2: dropped when the mix is crowded ·
// duck: dB the music (and half that, the ambience) dips under it, scaled by how loud it lands; hold: seconds held ·
// stinger: [music level, seconds] the score is held under a musical cue · chord: the patch wants the score's chord (v.ch).
// Impacts carry layers in 250 Hz-1 kHz on purpose: laptop, phone and Steam Deck speakers roll off below ~200 Hz.
const SND_SFX = (() => {
  const { hz, G, F, wire, perc, sweep, O, N, drive, hiss, tone, chime, pluck, creak, bubbles, bellStrike, clank, brass, reed, ks, frameDrum, snare, timp } = SndKit;
  const into = (p, lo) => lo + ((p - lo) % 12 + 12) % 12;   // pitch class p placed in [lo, lo + 12)
  let combo = 0, lastPick = -9, killN = 0;
  const PENTA = [0, 2, 4, 7, 9, 12];
  // A sine falling f0 -> f1, squared off by tanh before its envelope, so it keeps its edge as it dies away: its odd
  // harmonics imply the low note on speakers that cannot play it.
  function body(v, t, f0, f1, slide, peak, d, k = 3) { const o = O(v, "sine", f0, t, t + d + 0.1), g = G(); sweep(o.frequency, t, f0, f1, slide); perc(g.gain, t, peak, 0.003, d); wire(o, drive(k), g, v.out); }
  return {
    cannon: { max: 6, gap: 0.03, pv: 0.06, gv: 0.1, gain: 1.15, wet: 0.3, duck: 6, hold: 0.24, fn(v) { const { t, p } = v;
      // v.crowd (js/audio.js): two more of these already ringing, so the fine detail below is masked; skip it and save
      // ~40% of the nodes in a broadside. A lone shot is unchanged.
      if (!v.crowd) hiss(v, t, "highpass", 1800 * p, 0.7, 0.45, 0.001, 0.07);                            // the crack
      sweep(hiss(v, t, "lowpass", 4000 * p, 0.8, 0.85, 0.003, 0.6).frequency, t, 4000 * p, 600 * p, 0.45);  // the blast, dying into the mids
      tone(v, t, "sine", 82 * p, 34 * p, 0.32, 0.85, 0.003, 0.5);                                         // the thump, for headphones
      body(v, t, 130 * p, 76 * p, 0.25, 0.42, 0.24);                                                      // its body, for small speakers
      tone(v, t, "triangle", 460 * p, 170 * p, 0.12, 0.8, 0.002, 0.2);                                   // the boom: a pitched mid punch
      hiss(v, t, "bandpass", 620 * p, 0.55, 1.5, 0.002, 0.22); hiss(v, t, "bandpass", 340 * p, 0.7, 0.9, 0.002, 0.24);   // the blast's chest
      if (v.crowd) return;
      const tc = t + rand(0.035, 0.055);                                                                  // the carriage recoils into its tackle
      tone(v, tc, "triangle", 260 * p, 190 * p, 0.05, 0.45, 0.001, 0.09); tone(v, tc, "sine", 610 * p, 590 * p, 0, 0.16, 0.001, 0.06);
      hiss(v, tc, "bandpass", 950 * p, 2, 0.3, 0.001, 0.03);
      hiss(v, t + 0.04, "bandpass", 260 * p, 0.9, 0.3, 0.06, 1.1, true); } },                            // its echo over the water
    // a broadside laid on the player: a fuse hiss swelling under a rising bosun's whistle, as long as the red fan shows
    volleyWarn: { max: 2, gap: 0.3, pv: 0.04, gv: 0.1, gain: 0.85, wet: 0.25, far: 1600, fn(v) { const { t, p } = v;
      hiss(v, t, "bandpass", 3400 * p, 3, 0.22, 0.32, 0.36);
      tone(v, t + 0.05, "triangle", 720 * p, 1180 * p, 0.45, 0.13, 0.12, 0.5); } },
    // gain was 0.65: enemy guns sat under the combat score
    cannonFar: { max: 6, gap: 0.04, pv: 0.08, gv: 0.15, gain: 0.8, wet: 0.45, far: 1900, pri: 2, duck: 3, hold: 0.18, fn(v) { const { t, p } = v;
      sweep(hiss(v, t, "lowpass", 1600 * p, 0.7, 0.8, 0.004, 0.9).frequency, t, 1600 * p, 300 * p, 0.5);
      tone(v, t, "sine", 64 * p, 30 * p, 0.3, 0.5, 0.004, 0.55);
      hiss(v, t, "bandpass", 420 * p, 0.6, 1.1, 0.003, 0.22);
      if (v.crowd) return;
      body(v, t, 105 * p, 62 * p, 0.25, 0.42, 0.22, 2.5);
      hiss(v, t + 0.05, "bandpass", 160 * p, 0.8, 0.25, 0.08, 1.4, true); } },
    hit: { max: 5, gap: 0.025, pv: 0.12, gv: 0.15, gain: 1.05, wet: 0.2, far: 1300, pri: 2, duck: 4, hold: 0.18, fn(v) { const { t, p } = v, k = v.big ? 1.25 : 1;
      tone(v, t, "triangle", 160 * p, 58 * p, 0.12, 0.5 * k, 0.002, 0.16);                                // hull thud
      if (!v.crowd) {
        body(v, t, 240 * p, 140 * p, 0.1, 0.35 * k, 0.12, 2.5);                                          // the thud's edge
        hiss(v, t, "bandpass", 1100 * p, 1.3, 0.7 * k, 0.002, 0.17);                                     // planks crunch
      }
      const c = N(v, t, t + 0.3), bp = F("bandpass", 600 * p, 0.6), cg = G(); wire(c, bp, cg, v.out);    // the crunch's body, in bursts
      let tc = t; for (let i = 0; i < 4; i++) { const d = rand(0.02, 0.04); perc(cg.gain, tc, rand(0.9, 1.3) * k, 0.001, d); tc += d + rand(0.004, 0.012); }
      const s = N(v, t, t + 0.4), hp = F("highpass", 3200 * p, 0.8), g = G(); wire(s, hp, g, v.out);   // splinters
      let ti = t + 0.005;
      for (let i = 0; i < 7; i++) { const d = rand(0.012, 0.03); perc(g.gain, ti, rand(0.15, 0.45) * k, 0.001, d); ti += d + rand(0.006, 0.02); }
      if (v.big) {   // our own ship: heard from inside the hull, a muffled boom and the timbers groaning
        const lp = F("lowpass", 700, 0.7); lp.connect(v.out);
        tone(v, t, "sine", 96 * p, 44 * p, 0.25, 0.35, 0.003, 0.4, lp); creak(v, t + 0.04, rand(68, 86) * p, 0.6, 0.5, lp);
      } } },
    // a hull driven into rock or another hull: a wooden crack and a long groan, heavier with v.amount (1 = a solid blow)
    crash: { max: 3, gap: 0.12, pv: 0.1, gv: 0.12, gain: 1.15, wet: 0.25, far: 1400, duck: 5, hold: 0.3, fn(v) { const { t, p } = v, a = Math.min(1.5, v.amount ?? 1), k = (v.big ? 1.2 : 1) * (0.7 + 0.4 * a);
      tone(v, t, "sine", 120 * p, 42 * p, 0.3, 0.7 * k, 0.003, 0.35);                                     // the impact's thump
      body(v, t, 260 * p, 120 * p, 0.12, 0.4 * k, 0.16, 2.5);                                              // its body, for small speakers
      hiss(v, t, "bandpass", 900 * p, 1.1, 1.0 * k, 0.001, 0.2);                                           // timbers cracking
      let tc = t + 0.01; for (let i = 0; i < 5 + Math.round(a * 3); i++) { const d = rand(0.015, 0.045), f = rand(500, 1800) * p;
        tone(v, tc, "triangle", f, f * 0.55, 0.12 * k, 0.4, 0.001, d + 0.03); hiss(v, tc, "bandpass", f * 1.6, 2.5, 0.35 * k, 0.001, d); tc += d + rand(0.01, 0.05); }   // planks splintering one by one
      if (!v.crowd) creak(v, t + 0.06, rand(80, 120) * p, 0.7, 0.45 * k); } },
    splash: { max: 6, gap: 0.03, pv: 0.15, gv: 0.2, gain: 0.55, wet: 0.15, far: 1200, pri: 3, fn(v) { const { t, p } = v;
      sweep(hiss(v, t, "bandpass", 2600 * p, 1.1, 0.6, 0.012, 0.45).frequency, t, 2600 * p, 650 * p, 0.4);
      tone(v, t, "sine", 520 * p, 150 * p, 0.07, 0.35, 0.002, 0.08);                                    // the plop
      for (let i = 0; i < 3; i++) tone(v, t + rand(0.08, 0.32), "sine", rand(1300, 2600) * p, rand(1600, 3000) * p, 0.02, 0.06, 0.001, 0.03); } },
    burn: { max: 4, gap: 0.06, pv: 0.2, gv: 0.3, gain: 0.35, far: 1000, pri: 3, fn(v) { const { t, p } = v;
      hiss(v, t, "lowpass", 500 * p, 0.7, 0.25, 0.08, 0.35, true);                                      // the roar of the flames
      const s = N(v, t, t + 0.5), hp = F("highpass", 2200 * p, 0.7), g = G(); wire(s, hp, g, v.out);
      let ti = t; for (let i = 0; i < 6; i++) { const d = rand(0.008, 0.02); perc(g.gain, ti, rand(0.1, 0.5), 0.001, d); ti += d + rand(0.01, 0.06); } } },
    sink: { max: 3, gap: 0.1, pv: 0.08, gv: 0.1, gain: 0.85, wet: 0.4, far: 2000, duck: 3, hold: 0.5, fn(v) { const { t, p } = v, L = v.big ? 3.4 : 2.5;
      tone(v, t, "sine", 110 * p, 55 * p, 0.6, 0.8, 0.005, 0.7);                                        // the keel gives
      const gr = O(v, "sawtooth", 130 * p, t + 0.05, t + 1.1), gb = F("bandpass", 300 * p, 2.5), gg = G();   // and groans
      sweep(gr.frequency, t + 0.05, 130 * p, 84 * p, 0.9); gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(0.5, t + 0.3); gg.gain.linearRampToValueAtTime(0, t + 1);
      wire(gr, gb, gg, v.out);
      hiss(v, t, "lowpass", 800 * p, 0.7, 0.5, 0.005, 0.5);
      creak(v, t + 0.1, rand(85, 110) * p, 0.9, 0.3); creak(v, t + 0.75, rand(110, 140) * p, 0.7, 0.22);
      const s = N(v, t + 0.15, t + L, true), lp = F("lowpass", 900 * p, 0.6), g = G(); wire(s, lp, g, v.out);   // water rushes in
      g.gain.setValueAtTime(SndKit.Z, t + 0.15); g.gain.exponentialRampToValueAtTime(0.55, t + 0.5); g.gain.exponentialRampToValueAtTime(SndKit.Z, t + L);
      for (let k = 0; k < 2; k++) bubbles(v, t + 0.4 + k * 0.06, L - 0.5, v.big ? 14 : 9); } },
    // an ordinary kill: one of four short cues, in turn, on the chord the score is playing right now
    kill: { max: 2, gap: 0.4, pv: 0, gv: 0.05, gain: 0.85, wet: 0.35, duck: 2, hold: 0.45, chord: true, fn(v) {
      const { t } = v, [a, b, c] = v.ch.pad, r = into(v.ch.bass % 12, 67);
      switch (killN++ % 4) {
        case 0: brass(v, t, hz(r - 5), 0.09, 0.2); brass(v, t + 0.11, hz(r), 0.34, 0.24); break;            // a two-note call
        case 1: [a, b, c].forEach((m, i) => chime(v, t + i * 0.07, hz(m + 24), 0.24 - i * 0.04, 0.45)); break; // the purser's till
        case 2: for (let i = 0; i < 5; i++) snare(v, t + i * 0.045, 0.15 + i * 0.08);                         // a ruffle into a low hit
          frameDrum(v, t + 0.24, 1.3, 1); break;
        default: [a, b, c, a + 12].forEach((m, i) => ks(v, t + i * 0.06, m + 12, 0.34, 1.2, 0.5));          // a plucked run up the chord
      } } },
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
    // the full fanfare: bounties, rank, the ending. Open fifths and octaves, no third, so it sits over any chord.
    victory: { max: 1, gap: 1.2, pv: 0, gv: 0, gain: 0.4, wet: 0.35, stinger: [0.4, 1.9], fn(v) { const { t } = v, t0 = t + 0.2;
      for (let i = 0; i < 7; i++) snare(v, t + i * 0.028, 0.12 + i * 0.05);                             // a ruffle into the call
      for (const [dt, f, d] of [[0, 440, 0.11], [0.12, 587, 0.11], [0.24, 880, 0.6]]) brass(v, t0 + dt, f, d, 0.4);
      brass(v, t0 + 0.24, 587, 0.6, 0.25); brass(v, t0 + 0.24, 1175, 0.6, 0.1); brass(v, t0 + 0.24, 294, 0.6, 0.16);
      timp(v, t0 + 0.24, 50, 1); timp(v, t0 + 0.62, 45, 0.55); timp(v, t0 + 0.78, 50, 0.8);
      hiss(v, t0 + 0.24, "highpass", 5200, 0.7, 0.1, 0.002, 1); } },                                     // a cymbal's shimmer
    defeat: { max: 1, gap: 3, pv: 0, gv: 0, gain: 0.42, wet: 0.45, stinger: [0.15, 3.5], fn(v) { const { t } = v;
      // a slow fall down the Dorian mode on a low reed, over a drone and a tolling bell
      for (const [dt, f, d] of [[0, 587, 0.42], [0.45, 523, 0.42], [0.9, 440, 0.42], [1.35, 349, 0.5], [1.9, 294, 1.3]]) reed(v, t + dt, f, d, 0.3);
      reed(v, t, 147, 3, 0.16); bellStrike(v, t + 1.9, 196, 0.3); } },
    sail: { max: 1, gap: 0.5, pv: 0.05, gv: 0.05, gain: 1, wet: 0.2, fn(v) { const { t, p } = v;   // canvas unfurls and fills
      const s = N(v, t, t + 1.1), bp = F("bandpass", 600 * p, 0.9), am = G(0.5), g = G(), flap = O(v, "square", 18, t, t + 1.1), depth = G(0.5);
      sweep(flap.frequency, t, 18, 6, 0.9); sweep(bp.frequency, t, 600 * p, 1600 * p, 0.7);
      g.gain.setValueAtTime(SndKit.Z, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.25); g.gain.exponentialRampToValueAtTime(SndKit.Z, t + 1.05);
      wire(flap, depth, am.gain); wire(s, bp, am, g, v.out);
      creak(v, t + 0.05, 150 * p, 0.45, 0.25); creak(v, t + 0.5, 120 * p, 0.4, 0.18); } },
    // a sail set or taken in (W / S): a short luff of canvas and a sheet running through its block
    rig: { max: 2, gap: 0.12, pv: 0.06, gv: 0.15, gain: 0.45, wet: 0.15, fn(v) { const { t, p } = v, up = v.big;
      const s = N(v, t, t + 0.45), bp = F("bandpass", (up ? 1000 : 750) * p, 1), am = G(0.5), g = G(), flap = O(v, "square", up ? 15 : 10, t, t + 0.45), dp = G(0.5);
      wire(flap, dp, am.gain); wire(s, bp, am, g, v.out);
      g.gain.setValueAtTime(SndKit.Z, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.05); g.gain.exponentialRampToValueAtTime(SndKit.Z, t + 0.4);
      const o = O(v, "sawtooth", 800 * p, t + 0.03, t + 0.25), bq = F("bandpass", 1900 * p, 5), g2 = G();
      sweep(o.frequency, t + 0.03, (up ? 640 : 960) * p, (up ? 960 : 620) * p, 0.17); perc(g2.gain, t + 0.03, 0.16, 0.02, 0.16); wire(o, bq, g2, v.out); } },
    bell: { max: 2, gap: 0.3, pv: 0.01, gv: 0.05, gain: 0.28, wet: 0.5, fn(v) { bellStrike(v, v.t, 523 * v.p, 0.6); bellStrike(v, v.t + 0.42, 523 * v.p, 0.45); } },
  };
})();
