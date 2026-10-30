"use strict";
// ---------- Shot-away masts: the crack of a breaking mast, and the hammering that steps one again (#43, js/masts.js) ----------
// Loaded after js/audio-sfx.js and before js/audio.js, which reads SND_SFX once: these join the same patch table.
Object.assign(SND_SFX, (() => {
  const { O, G, wire, perc, sweep, drive, hiss, tone, creak, clank } = SndKit;
  return {
    // A mast going: a gun-sharp crack, the long split of green timber, the whole rig groaning over, then canvas tearing and a heavy fall. duck 5: the score gives way for a moment.
    mastBreak: { max: 3, gap: 0.15, pv: 0.08, gv: 0.1, gain: 1.1, wet: 0.3, far: 1500, pri: 2, duck: 5, hold: 0.35, fn(v) { const { t, p } = v, k = v.big ? 1.15 : 1;
      hiss(v, t, "highpass", 2600 * p, 0.8, 0.5 * k, 0.001, 0.05);                                         // the first sharp crack
      tone(v, t, "triangle", 240 * p, 90 * p, 0.2, 0.55 * k, 0.001, 0.22);                                 // the timber's body, for small speakers
      let tc = t + 0.02; for (let i = 0; i < (v.crowd ? 4 : 8); i++) { const d = rand(0.02, 0.05), f = rand(500, 1900) * p;   // the grain splitting, one fibre after another
        tone(v, tc, "triangle", f, f * 0.5, 0.15 * k, 0.35, 0.001, d + 0.03); hiss(v, tc, "bandpass", f * 1.5, 2.2, 0.4 * k, 0.001, d); tc += d + rand(0.01, 0.04); }
      creak(v, t + 0.08, rand(70, 95) * p, 0.8, 0.5 * k);                                                  // the rig groaning as it leans
      sweep(hiss(v, t + 0.22, "bandpass", 2400 * p, 1.2, 0.45 * k, 0.02, 0.45).frequency, t + 0.22, 2400 * p, 700 * p, 0.45);   // canvas ripping
      const o = O(v, "sine", 110 * p, t + 0.3, t + 0.9), g = G(); sweep(o.frequency, t + 0.3, 110 * p, 48 * p, 0.4); perc(g.gain, t + 0.3, 0.8 * k, 0.004, 0.45); wire(o, drive(2.5), g, v.out);   // it lands
      hiss(v, t + 0.3, "lowpass", 900 * p, 0.7, 0.5 * k, 0.005, 0.35); } },
    // a mast stepped again at the dock: two knocks of a maul on a wedge and a bright clink
    mastFix: { max: 2, gap: 0.3, pv: 0.05, gv: 0.08, gain: 0.7, wet: 0.2, far: 1000, fn(v) { const { t, p } = v;
      for (const dt of [0, 0.16]) { tone(v, t + dt, "triangle", 180 * p, 90 * p, 0.1, 0.5, 0.001, 0.1); hiss(v, t + dt, "bandpass", 1100 * p, 1.4, 0.5, 0.001, 0.05); }
      clank(v, t + 0.3, 0.3); } },
  };
})());
