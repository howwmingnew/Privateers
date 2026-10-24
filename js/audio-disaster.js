"use strict";
// ---------- Disaster sounds: the warning horn, a surge of water, a whirl ----------
// Loaded after js/audio-juice.js and before js/audio.js, which reads SND_SFX once: these join the same patch table. Mids on purpose:
// small speakers must hear a warning.
Object.assign(SND_SFX, (() => {
  const { sweep, hiss, tone } = SndKit;
  return {
    // two long falling horn blasts, the second lower: "something is coming"
    disWarn: { max: 1, gap: 2, pv: 0.02, gv: 0.05, gain: 0.8, wet: 0.35, duck: 4, hold: 0.8, fn(v) { const { t, p } = v;
      for (let i = 0; i < 2; i++) { const s = t + i * 0.7, f = (i ? 196 : 233) * p;
        tone(v, s, "sawtooth", f, f * 0.94, 0.55, 0.22, 0.04, 0.55); tone(v, s, "square", f * 2, f * 1.9, 0.5, 0.07, 0.04, 0.5); } } },
    // a wall of water arriving: a rising roar, then it falls away
    disSurge: { max: 1, gap: 1, pv: 0.05, gv: 0.1, gain: 1, wet: 0.5, duck: 5, hold: 0.8, fn(v) { const { t, p } = v;
      sweep(hiss(v, t, "bandpass", 300 * p, 0.8, 1.0, 0.5, 1.8, true).frequency, t, 300 * p, 1500 * p, 0.9);
      tone(v, t, "sine", 55 * p, 38 * p, 1.8, 0.7, 0.4, 1.6);
      hiss(v, t + 0.9, "lowpass", 900 * p, 0.7, 0.8, 0.1, 1.6, true); } },
    // a spout or whirlpool forming: a hollow turning rumble
    disWhirlBurst: { max: 1, gap: 1, pv: 0.05, gv: 0.1, gain: 0.9, wet: 0.45, duck: 4, hold: 0.6, fn(v) { const { t, p } = v;
      sweep(hiss(v, t, "bandpass", 700 * p, 2.2, 0.8, 0.2, 1.5, true).frequency, t, 500 * p, 1300 * p, 1.2);
      tone(v, t, "sine", 70 * p, 45 * p, 1.4, 0.6, 0.2, 1.3); } },
    // the whirl heard while near it: a slow swish
    disWhirl: { max: 1, gap: 2, pv: 0.08, gv: 0.1, gain: 0.55, wet: 0.4, fn(v) { const { t, p } = v;
      sweep(hiss(v, t, "bandpass", 600 * p, 2, 0.6, 0.6, 1.6, true).frequency, t, 450 * p, 1100 * p, 1.5); } },
  };
})());
