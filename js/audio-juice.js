"use strict";
// ---------- Payoff sounds: the player's kill, bounty gold, the sale tally, a Ship Lv rise ----------
// Loaded after js/audio-sfx.js and before js/audio.js, which reads SND_SFX once: these join the same patch table.
Object.assign(SND_SFX, (() => {
  const { G, O, wire, perc, sweep, drive, hiss, tone, chime, pluck, bellStrike, timp, clank } = SndKit;
  // a low sine squared off by tanh: its harmonics imply the note on speakers that cannot play it
  function body(v, t, f0, f1, slide, peak, d, k = 3) { const o = O(v, "sine", f0, t, t + d + 0.1), g = G(); sweep(o.frequency, t, f0, f1, slide); perc(g.gain, t, peak, 0.003, d); wire(o, drive(k), g, v.out); }
  return {
    // the powder magazine going up under the player's last ball: a blast rolling 2 kHz -> 200 Hz over a 70 Hz body.
    // duck 8 / hold 0.4: the score drops out for the moment so the boom owns it.
    magazine: { max: 2, gap: 0.12, pv: 0.06, gv: 0.08, gain: 1.05, wet: 0.45, far: 2200, duck: 8, hold: 0.4, fn(v) { const { t, p } = v;
      sweep(hiss(v, t, "lowpass", 2000 * p, 0.9, 1.1, 0.002, 0.95).frequency, t, 2000 * p, 200 * p, 0.6);
      hiss(v, t, "highpass", 2400 * p, 0.7, 0.5, 0.001, 0.06);                                            // the crack
      body(v, t, 140 * p, 70 * p, 0.35, 0.55, 0.6);
      tone(v, t, "sine", 90 * p, 36 * p, 0.6, 0.9, 0.003, 0.9);
      hiss(v, t, "bandpass", 480 * p, 0.6, 1.1, 0.002, 0.32);                                             // its chest, for laptop speakers
      timp(v, t + 0.02, 31, 0.9);
      for (let i = 0; i < 6; i++) hiss(v, t + 0.12 + rand(0, 0.5), "highpass", rand(2500, 4200) * p, 1, rand(0.12, 0.3), 0.001, 0.02);   // burning powder crackles
      hiss(v, t + 0.06, "bandpass", 220 * p, 0.8, 0.35, 0.08, 1.4, true); } },                           // its echo over the water
    // bounty gold: a fuller purse than a crate's blip, ending in the till's bell
    bounty: { max: 2, gap: 0.2, pv: 0.02, gv: 0.05, gain: 0.62, wet: 0.25, fn(v) { const { t, p } = v;
      const n = clamp(Math.round(Math.log2(Math.max(1, v.amount || 40) / 15)) + 4, 4, 11);
      tone(v, t, "sine", 230 * p, 120 * p, 0.08, 0.5, 0.002, 0.12); hiss(v, t, "lowpass", 1600, 0.7, 0.3, 0.002, 0.06);   // the purse lands
      let ti = t + 0.03, gap = 0.07;
      for (let i = 0; i < n; i++) { chime(v, ti, rand(1900, 3200) * p, rand(0.25, 0.42)); ti += gap * rand(0.8, 1.15); gap *= 0.92; }
      bellStrike(v, ti + 0.02, 1046 * p, 0.32); chime(v, ti + 0.03, 2093 * p, 0.42, 0.7); chime(v, ti + 0.05, 2637 * p, 0.34, 0.7); } },
    // the sale tally counting up: coins rolling for ~1.1 s, quickening and climbing, then the till
    coinRoll: { max: 1, gap: 0.5, pv: 0.01, gv: 0.03, gain: 0.5, wet: 0.2, fn(v) { const { t, p } = v;
      let ti = t, gap = 0.075, f = 1700;
      while (ti < t + 1.05) { chime(v, ti, f * rand(0.95, 1.05) * p, rand(0.18, 0.3), 0.12); ti += gap; gap = Math.max(0.032, gap * 0.95); f *= 1.012; }
      clank(v, ti + 0.02, 0.18); chime(v, ti + 0.04, 2093 * p, 0.42, 0.7); chime(v, ti + 0.06, 2794 * p, 0.32, 0.7); } },
    // Ship Lv rise: a bright climb into a bell
    lvUp: { max: 1, gap: 0.6, pv: 0, gv: 0, gain: 0.5, wet: 0.3, fn(v) { const { t } = v;
      [523, 659, 784, 1046, 1318].forEach((f, i) => pluck(v, t + i * 0.065, f, 0.28, 0.35));
      bellStrike(v, t + 0.33, 784, 0.35); chime(v, t + 0.34, 2093, 0.3, 0.8); } },
  };
})());
