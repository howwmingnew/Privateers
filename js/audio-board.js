"use strict";
// ---------- Boarding sound (js/boarding.js): grapples thud in, a scramble of steel, a brass stab, a purse ----------
// Loaded after js/audio-juice.js and before js/audio.js, which reads SND_SFX once.
Object.assign(SND_SFX, (() => {
  const { hiss, tone, chime, bellStrike, clank } = SndKit;
  return {
    // two hooks bite the rail (thud), cutlasses clash, then a rising two-note stab; `amount` adds a purse, `gun` a prize bell
    board: { max: 1, gap: 0.8, pv: 0.03, gv: 0.05, gain: 0.8, wet: 0.25, far: 1800, duck: 4, hold: 0.8, fn(v) { const { t, p } = v;
      for (const d of [0, 0.11]) { tone(v, t + d, "sine", 150 * p, 70 * p, 0.14, 0.7, 0.002, 0.2); hiss(v, t + d, "bandpass", 700 * p, 1.2, 0.35, 0.002, 0.07); }
      for (let i = 0; i < 5; i++) clank(v, t + 0.3 + i * 0.09 + Math.random() * 0.04, 0.22 + Math.random() * 0.12);
      tone(v, t + 0.8, "triangle", 392 * p, 392 * p, 0.2, 0.3, 0.01, 0.25); tone(v, t + 0.95, "triangle", 587 * p, 587 * p, 0.35, 0.34, 0.01, 0.3);
      if (v.amount > 0) for (let i = 0; i < 5; i++) chime(v, t + 1.1 + i * 0.06, (1900 + Math.random() * 1300) * p, 0.3);
      if (v.gun) { bellStrike(v, t + 1.35, 1046 * p, 0.3); chime(v, t + 1.37, 2093 * p, 0.4, 0.7); } } },
    // the grapnels bite the rail: two quick thuds and a creak of rope taking the strain (#69)
    grapple: { max: 1, gap: 0.3, pv: 0.03, gv: 0.05, gain: 0.7, wet: 0.15, far: 1500, duck: 2, hold: 0.5, fn(v) { const { t, p } = v;
      for (const d of [0, 0.07]) { tone(v, t + d, "sine", 130 * p, 60 * p, 0.12, 0.7, 0.002, 0.16); hiss(v, t + d, "bandpass", 650 * p, 1.2, 0.3, 0.002, 0.06); }
      tone(v, t + 0.14, "sawtooth", 95 * p, 125 * p, 0.35, 0.05, 0.05, 0.25); } },
    // the rope parts under the strain: a sharp crack, a whip of noise and a short falling twang (#69)
    ropeSnap: { max: 1, gap: 0.5, pv: 0.04, gv: 0.06, gain: 0.9, wet: 0.2, far: 1800, duck: 3, hold: 0.7, fn(v) { const { t, p } = v;
      hiss(v, t, "highpass", 2400 * p, 0.8, 0.55, 0.001, 0.05); hiss(v, t + 0.02, "bandpass", 1200 * p, 1.4, 0.35, 0.002, 0.18);
      tone(v, t, "triangle", 520 * p, 130 * p, 0.3, 0.3, 0.001, 0.22); tone(v, t + 0.05, "sine", 90 * p, 45 * p, 0.2, 0.3, 0.002, 0.25); } },
  };
})());
