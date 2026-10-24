"use strict";
// ---------- Cannon lab: candidate cannon-fire / hull-hit / splash patches, for tools/cannon-lab.html only ----------
// NOT loaded by the game. Joins the same SND_SFX table (load before js/audio.js), so Snd.play gives them the game's
// buses, reverb, distance filter, pan and crowd rules. Gun kind rides in opts.amount (1 six-pounder, 2 long 12,
// 3 carronade, 4 chain shot, 5 incendiary); ship size in opts.big. Fire: labFireA-D, hull: labHitA-D, water: labSplashA-D.
Object.assign(SND_SFX, (() => {
  const { G, F, wire, perc, sweep, O, N, drive, hiss, tone, creak, bubbles } = SndKit;
  function body(v, t, f0, f1, slide, peak, d, k = 3) { const o = O(v, "sine", f0, t, t + d + 0.1), g = G(); sweep(o.frequency, t, f0, f1, slide); perc(g.gain, t, peak, 0.003, d); wire(o, drive(k), g, v.out); }
  // a struck, damped resonance: noise excites a narrow band that rings briefly (the hull's planks answering the gun)
  function ring(v, t, f, q, peak, d) { const s = N(v, t, t + d + 0.05), bp = F("bandpass", f, q), g = G(); perc(g.gain, t, peak, 0.002, d); wire(s, bp, g, v.out); }
  // a dry wooden tock: a short sine blip, pitch falling a little
  function tock(v, t, f, peak, d = 0.035) { tone(v, t, "sine", f, f * 0.8, d, peak, 0.001, d); }
  // gun kind + ship size -> [pitch, power, tail, crack]
  const KINDS = [[1, 0.85, 1, 1], [0.85, 1, 1.25, 1.2], [0.7, 1.15, 0.7, 0.5], [1.05, 0.85, 1, 1], [0.95, 0.8, 1, 0.7]];
  function gun(v) {
    const [pf, pw, tl, ck] = KINDS[clamp((v.amount | 0) - 1, 0, 4)], big = v.big;
    return { p: v.p * pf * (big ? 0.85 : 1), pw: pw * (big ? 1.15 : 1), tl: tl * (big ? 1.2 : 1), ck, kind: clamp((v.amount | 0) - 1, 0, 4), big };
  }
  // the kind's own signature, laid over any version: chain shot screams, fire shot fizzes
  function flavour(v, t, g) {
    if (g.kind === 3) { const o = O(v, "sawtooth", 1500 * g.p, t + 0.02, t + 0.5), bp = F("bandpass", 1800, 3), gg = G(); sweep(o.frequency, t + 0.02, 1500 * g.p, 700 * g.p, 0.45); perc(gg.gain, t + 0.02, 0.14, 0.04, 0.4); wire(o, bp, gg, v.out); }
    if (g.kind === 4) { hiss(v, t + 0.02, "highpass", 3000, 0.8, 0.16, 0.06, 0.5); hiss(v, t + 0.05, "bandpass", 1400, 1.5, 0.1, 0.1, 0.7); }
  }

  return {
    // A · low, long-tailed rumble: a distant gun rolling over the water
    labFireA: { max: 8, gap: 0.02, pv: 0.05, gv: 0.1, gain: 1.0, wet: 0.5, far: 1900, duck: 6, hold: 0.3, fn(v) { const { t } = v, g = gun(v), p = g.p, L = g.tl;
      tone(v, t, "sine", 70 * p, 27 * p, 0.55, 0.95 * g.pw, 0.006, 0.9 * L);
      body(v, t, 120 * p, 64 * p, 0.3, 0.4 * g.pw, 0.4 * L, 2.5);
      sweep(hiss(v, t, "lowpass", 1800 * p, 0.8, 0.8 * g.pw, 0.01, 0.5 * L).frequency, t, 1800 * p, 260 * p, 0.6 * L);
      hiss(v, t, "bandpass", 300 * p, 0.7, 1.0 * g.pw, 0.006, 0.45 * L);
      hiss(v, t + 0.05, "lowpass", 380 * p, 0.7, 0.55 * g.pw, 0.2, 1.7 * L, true);
      hiss(v, t, "highpass", 1600, 0.7, 0.12 * g.ck, 0.002, 0.04);
      flavour(v, t, g); } },
    // B · short, crisp crack: a sharp pop with hardly any tail
    labFireB: { max: 8, gap: 0.02, pv: 0.06, gv: 0.1, gain: 1.0, wet: 0.2, far: 1900, duck: 6, hold: 0.18, fn(v) { const { t } = v, g = gun(v), p = g.p, L = g.tl;
      hiss(v, t, "highpass", 2200 * p, 0.7, 0.85 * g.ck, 0.001, 0.05);
      hiss(v, t, "bandpass", 1300 * p, 0.9, 1.0 * g.pw, 0.001, 0.07 * L);
      tone(v, t, "triangle", 420 * p, 150 * p, 0.06, 0.85 * g.pw, 0.001, 0.12);
      tone(v, t, "sine", 110 * p, 50 * p, 0.1, 0.8 * g.pw, 0.002, 0.2 * L);
      body(v, t, 190 * p, 100 * p, 0.08, 0.35 * g.pw, 0.1, 3);
      hiss(v, t + 0.01, "lowpass", 1400 * p, 0.7, 0.6 * g.pw, 0.002, 0.18 * L);
      flavour(v, t, g); } },
    // C · heavy gun: an air shock-wave and the hull's planks shuddering with the recoil
    labFireC: { max: 8, gap: 0.02, pv: 0.05, gv: 0.1, gain: 1.0, wet: 0.35, far: 1900, duck: 7, hold: 0.28, fn(v) { const { t } = v, g = gun(v), p = g.p, L = g.tl;
      tone(v, t, "sine", 95 * p, 38 * p, 0.2, 1.0 * g.pw, 0.002, 0.42 * L);                             // the shock's thump
      body(v, t, 150 * p, 80 * p, 0.12, 0.45 * g.pw, 0.22, 3.5);
      sweep(hiss(v, t, "lowpass", 6500 * p, 0.8, 0.9 * g.pw, 0.001, 0.3 * L).frequency, t, 6500 * p, 320 * p, 0.28 * L);   // the air hammered flat
      hiss(v, t, "highpass", 2400, 0.7, 0.4 * g.ck, 0.001, 0.035);
      ring(v, t + 0.01, 170 * p, 10, 1.4 * g.pw, 0.4 * L); ring(v, t + 0.015, 310 * p, 9, 1.0 * g.pw, 0.3 * L); ring(v, t + 0.02, 520 * p, 8, 0.6 * g.pw, 0.2);   // timbers ring
      creak(v, t + 0.05, 70 * p, 0.35 * L, 0.3);                                                          // the carriage groans back
      hiss(v, t + 0.03, "lowpass", 420 * p, 0.7, 0.35, 0.04, 0.6 * L, true);
      flavour(v, t, g); } },
    // D · my pick: crack + chest + thump with one medium tail and a slap-back off the water; the same low voice as hit D
    labFireD: { max: 8, gap: 0.02, pv: 0.05, gv: 0.1, gain: 1.0, wet: 0.35, far: 1900, duck: 6, hold: 0.26, fn(v) { const { t } = v, g = gun(v), p = g.p, L = g.tl;
      if (!v.crowd) hiss(v, t, "highpass", 2000 * p, 0.7, 0.4 * g.ck, 0.001, 0.05);
      tone(v, t, "sine", 85 * p, 32 * p, 0.25, 0.95 * g.pw, 0.003, 0.5 * L);
      body(v, t, 140 * p, 76 * p, 0.2, 0.42 * g.pw, 0.22, 3);
      tone(v, t, "triangle", 400 * p, 150 * p, 0.1, 0.65 * g.pw, 0.002, 0.18);
      sweep(hiss(v, t, "lowpass", 3800 * p, 0.8, 0.8 * g.pw, 0.003, 0.5 * L).frequency, t, 3800 * p, 480 * p, 0.4 * L);
      hiss(v, t, "bandpass", 560 * p, 0.6, 1.2 * g.pw, 0.002, 0.22);
      if (!v.crowd) {
        ring(v, t + 0.012, 190 * p, 9, 0.5 * g.pw, 0.22);                                                // a touch of wood
        hiss(v, t + 0.12, "bandpass", 330 * p, 0.8, 0.28, 0.01, 0.35 * L);                               // slap-back off the water
        hiss(v, t + 0.06, "lowpass", 300 * p, 0.7, 0.3, 0.1, 1.1 * L, true);
      }
      flavour(v, t, g); } },

    // hull hits: opts.big = our own ship (heard from inside), opts.amount unused
    // A · splintering wood: bursts of crunch over bright splinters
    labHitA: { max: 6, gap: 0.02, pv: 0.12, gv: 0.15, gain: 1.5, wet: 0.2, far: 1300, pri: 2, duck: 4, hold: 0.18, fn(v) { const { t, p } = v, k = v.big ? 1.2 : 1;
      tone(v, t, "triangle", 170 * p, 70 * p, 0.08, 0.35 * k, 0.001, 0.1);
      for (let i = 0, tc = t; i < 6; i++) { const d = rand(0.015, 0.035); hiss(v, tc, "bandpass", rand(800, 2500) * p, 1.6, rand(0.6, 1.2) * k, 0.001, d); tc += d + rand(0.003, 0.012); }
      for (let i = 0, ti = t + 0.004; i < 9; i++) { const d = rand(0.01, 0.025); hiss(v, ti, "highpass", rand(3200, 5200) * p, 0.8, rand(0.2, 0.5) * k, 0.001, d); ti += d + rand(0.004, 0.015); }
      hiss(v, t, "bandpass", 1200 * p, 1.2, 0.5 * k, 0.001, 0.14); } },
    // B · dull, heavy thud: a ball buried in the hull, with no splinters
    labHitB: { max: 6, gap: 0.02, pv: 0.1, gv: 0.15, gain: 1.05, wet: 0.25, far: 1300, pri: 2, duck: 4, hold: 0.2, fn(v) { const { t, p } = v, k = v.big ? 1.25 : 1;
      tone(v, t, "sine", 130 * p, 42 * p, 0.14, 1.0 * k, 0.002, 0.3);
      body(v, t, 210 * p, 110 * p, 0.1, 0.5 * k, 0.16, 3.5);
      hiss(v, t, "lowpass", 700 * p, 0.8, 1.1 * k, 0.001, 0.16);
      tone(v, t, "triangle", 330 * p, 140 * p, 0.05, 0.45 * k, 0.001, 0.07);
      hiss(v, t + 0.01, "lowpass", 260 * p, 0.7, 0.4 * k, 0.04, 0.5, true);
      if (v.big) creak(v, t + 0.05, rand(68, 82) * p, 0.5, 0.35); } },
    // C · crack, then debris: one hard split followed by pieces clattering down
    labHitC: { max: 6, gap: 0.02, pv: 0.12, gv: 0.15, gain: 1.05, wet: 0.2, far: 1300, pri: 2, duck: 4, hold: 0.2, fn(v) { const { t, p } = v, k = v.big ? 1.2 : 1;
      tone(v, t, "sine", 150 * p, 55 * p, 0.1, 0.8 * k, 0.001, 0.2);
      hiss(v, t, "bandpass", 1500 * p, 1.2, 1.1 * k, 0.001, 0.07);
      hiss(v, t, "highpass", 3000 * p, 0.8, 0.5 * k, 0.001, 0.05);
      ring(v, t, 240 * p, 8, 0.8 * k, 0.18);
      const n = v.crowd ? 6 : 13;
      for (let i = 0; i < n; i++) {                                                                         // wood pieces landing, thinning out
        const at = t + 0.06 + Math.pow(Math.random(), 1.6) * 0.5, a = rand(0.3, 0.7) * k * (1 - (at - t) * 0.9);
        tock(v, at, rand(700, 2600) * p, a * 0.5, rand(0.025, 0.05)); hiss(v, at, "bandpass", rand(1200, 3600) * p, 2, a * 0.6, 0.001, rand(0.012, 0.03));
      } } },
    // D · my pick: a heavy low note (matches fire D) + a short crunch + a few splinters; our own ship adds a groan
    labHitD: { max: 6, gap: 0.02, pv: 0.1, gv: 0.15, gain: 1.05, wet: 0.2, far: 1300, pri: 2, duck: 4, hold: 0.2, fn(v) { const { t, p } = v, k = v.big ? 1.2 : 1;
      tone(v, t, "sine", 120 * p, 40 * p, 0.14, 0.9 * k, 0.002, 0.3);
      body(v, t, 200 * p, 100 * p, 0.1, 0.4 * k, 0.15, 3);
      tone(v, t, "triangle", 300 * p, 120 * p, 0.06, 0.4 * k, 0.001, 0.09);
      hiss(v, t, "bandpass", 900 * p, 1.2, 0.9 * k, 0.001, 0.13);
      ring(v, t, 200 * p, 9, 0.6 * k, 0.2);
      for (let i = 0, tc = t + 0.01; i < 3; i++) { const d = rand(0.02, 0.035); hiss(v, tc, "bandpass", rand(900, 1800) * p, 1.5, rand(0.6, 1) * k, 0.001, d); tc += d + rand(0.006, 0.014); }
      if (!v.crowd) for (let i = 0, ti = t + 0.03; i < 5; i++) { const d = rand(0.01, 0.022); hiss(v, ti, "highpass", rand(3000, 4500) * p, 0.8, rand(0.15, 0.35) * k, 0.001, d); ti += d + rand(0.01, 0.03); }
      if (v.big) creak(v, t + 0.04, rand(68, 86) * p, 0.45, 0.4); } },

    // water: opts.big = a heavy ball
    // A · splash: a bright spray falling into the sea, then droplets
    labSplashA: { max: 6, gap: 0.02, pv: 0.15, gv: 0.2, gain: 0.6, wet: 0.15, far: 1200, pri: 3, fn(v) { const { t, p } = v, k = v.big ? 1.2 : 1;
      sweep(hiss(v, t, "bandpass", 3000 * p, 1.0, 0.7 * k, 0.01, 0.5).frequency, t, 3000 * p, 700 * p, 0.45);
      tone(v, t, "sine", 560 * p, 160 * p, 0.07, 0.4 * k, 0.002, 0.09);
      for (let i = 0; i < 5; i++) tone(v, t + rand(0.08, 0.4), "sine", rand(1300, 2800) * p, rand(1600, 3200) * p, 0.02, 0.06, 0.001, 0.03); } },
    // B · deep thump: the ball plunging under, a muffled boom and a low swell of water
    labSplashB: { max: 6, gap: 0.02, pv: 0.12, gv: 0.2, gain: 0.7, wet: 0.3, far: 1200, pri: 3, fn(v) { const { t, p } = v, k = v.big ? 1.2 : 1;
      tone(v, t, "sine", 150 * p, 48 * p, 0.2, 0.95 * k, 0.003, 0.45);
      body(v, t, 200 * p, 90 * p, 0.12, 0.3 * k, 0.2, 2.5);
      hiss(v, t, "lowpass", 600 * p, 0.7, 0.8 * k, 0.01, 0.55);
      hiss(v, t + 0.03, "lowpass", 300 * p, 0.7, 0.4 * k, 0.12, 0.9, true);
      bubbles(v, t + 0.12, 0.35, 5); } },
    // C · tall column: a sharp burst, then the column falling back as a long patter
    labSplashC: { max: 6, gap: 0.02, pv: 0.15, gv: 0.2, gain: 0.55, wet: 0.2, far: 1200, pri: 3, fn(v) { const { t, p } = v, k = v.big ? 1.2 : 1;
      hiss(v, t, "highpass", 2200 * p, 0.8, 0.5 * k, 0.003, 0.12);
      tone(v, t, "sine", 400 * p, 120 * p, 0.09, 0.5 * k, 0.002, 0.12);
      sweep(hiss(v, t + 0.05, "bandpass", 2000 * p, 0.9, 0.6 * k, 0.15, 0.8).frequency, t + 0.05, 2200 * p, 500 * p, 0.8);
      for (let i = 0; i < 14; i++) hiss(v, t + 0.12 + Math.pow(Math.random(), 1.4) * 0.8, "bandpass", rand(1500, 4200) * p, 2.5, rand(0.1, 0.3), 0.001, rand(0.012, 0.03));
      for (let i = 0; i < 4; i++) tone(v, t + rand(0.15, 0.7), "sine", rand(900, 2200) * p, rand(1200, 2800) * p, 0.03, 0.06, 0.001, 0.04); } },
    // D · my pick: a short plop and thump, a mid spray and a soft tail (the same low voice as fire D / hit D)
    labSplashD: { max: 6, gap: 0.02, pv: 0.12, gv: 0.2, gain: 0.65, wet: 0.2, far: 1200, pri: 3, fn(v) { const { t, p } = v, k = v.big ? 1.2 : 1;
      tone(v, t, "sine", 170 * p, 55 * p, 0.14, 0.8 * k, 0.003, 0.3);
      sweep(hiss(v, t, "bandpass", 2200 * p, 1.0, 0.65 * k, 0.008, 0.4).frequency, t, 2400 * p, 600 * p, 0.35);
      tone(v, t, "sine", 520 * p, 160 * p, 0.06, 0.3 * k, 0.002, 0.07);
      hiss(v, t + 0.04, "lowpass", 420 * p, 0.7, 0.35 * k, 0.08, 0.6, true);
      if (!v.crowd) for (let i = 0; i < 3; i++) tone(v, t + rand(0.1, 0.35), "sine", rand(1300, 2400) * p, rand(1600, 2800) * p, 0.02, 0.05, 0.001, 0.03); } },
  };
})());
