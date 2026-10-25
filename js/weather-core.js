"use strict";
// ---------- Wind and weather: pure maths, no scene ----------
// One seed and one clock (seconds of sailing) decide everything, so weatherAt(seed, t) gives the same sky on every device:
// the daily sea passes its seed and its run clock (js/run.js), an ordinary sortie draws a seed when it sails (js/weather.js).
// Weather runs in spells (clear, rain, storm) that fade into one another; rain and storm are 0..1 levels so nothing jumps.
// The wind wanders on slow sine waves of its own, stronger and twitchier in a storm. All of it reads WIND / WEATHER (js/config.js).
const WX_KINDS = ["clear", "rain", "storm"], WX_HOURS = ["day", "dusk", "night"];
const WX_LEVEL = { clear: [0, 0], rain: [1, 0], storm: [1, 1] };   // [rain, storm] at full strength

function wxPick(table, r) {
  let acc = 0, last = null;
  for (const [k, w] of Object.entries(table)) { acc += w; last = k; if (r < acc) return k; }
  return last;
}
// The hour of day this seed sails in.
function hourOf(seed) { return wxPick(WEATHER.hour, mulberry32((seed ^ 0x7a11) >>> 0)()); }
// Spell k of a sea: its weather and when it ends (seconds). The chain is replayed from spell 0 and kept for the current seed.
let wxChain = { seed: null, r: null, spells: [] };
function wxSpell(seed, k) {
  if (wxChain.seed !== seed) {
    const r = mulberry32((seed ^ 0x3c0de) >>> 0);
    wxChain = { seed, r, spells: [], kind: wxPick(WEATHER.first, r()), end: 0 };
  }
  const c = wxChain;
  while (c.spells.length <= k) {
    c.end += WEATHER.seg[0] + c.r() * (WEATHER.seg[1] - WEATHER.seg[0]);
    c.spells.push({ kind: c.kind, end: c.end });
    c.kind = wxPick(WEATHER.next[c.kind], c.r());
  }
  return c.spells[k];
}
// The weather at second t: { kind (the dominant one), rain, storm (0..1), hour }.
function weatherAt(seed, t) {
  t = Math.max(0, +t || 0);
  let k = 0, sp = wxSpell(seed, 0);
  while (sp.end <= t && k < 400) sp = wxSpell(seed, ++k);   // each call replays the chain: fine at a few dozen spells
  const nx = wxSpell(seed, k + 1), left = sp.end - t, u = left < WEATHER.blend ? 1 - left / WEATHER.blend : 0, e = u * u * (3 - 2 * u);
  const a = WX_LEVEL[sp.kind], b = WX_LEVEL[nx.kind];
  const rain = a[0] + (b[0] - a[0]) * e, storm = a[1] + (b[1] - a[1]) * e;
  return { kind: storm > 0.5 ? "storm" : rain > 0.5 ? "rain" : "clear", rain, storm, hour: hourOf(seed), spell: k };
}
// The wind at second t: dir is where it blows TOWARD (radians), strength 0..1.
function windAt(seed, t, wx = weatherAt(seed, t)) {
  const r = mulberry32((seed ^ 0x91d5) >>> 0), P = () => r() * TAU, d0 = P(), p = [P(), P(), P(), P(), P(), P()];
  const dir = d0 + 0.9 * Math.sin(t / 97 * TAU + p[0]) + 0.5 * Math.sin(t / 41 * TAU + p[1]) + wx.storm * 0.35 * Math.sin(t / 23 * TAU + p[2]);
  const base = 0.3 + 0.2 * Math.sin(t / 70 * TAU + p[3]) + 0.1 * Math.sin(t / 29 * TAU + p[4]) + wx.storm * 0.08 * Math.sin(t / 13 * TAU + p[5]);
  const strength = clamp(Math.max(WEATHER.windMin, base) + wx.rain * WEATHER.windRain + wx.storm * WEATHER.windStorm, WEATHER.windMin, 1);
  return { dir, strength };
}
const windKnots = w => Math.round(WEATHER.knots[0] + w.strength * (WEATHER.knots[1] - WEATHER.knots[0]));
// Speed factor for a hull on heading rot: 1 + gain for running before the wind, 1 - loss for beating into it, 1 across it.
// tailK / headK: the sails' gear scales the gain and the loss (js/gear-core.js), 1 for every other hull.
function windFactor(rot, w, tailK = 1, headK = 1) {
  const a = Math.cos(rot - w.dir), k = clamp(w.strength / WIND.full, 0, 1);
  return 1 + (a >= 0 ? WIND.tail * tailK : WIND.head * headK) * a * k;
}
// Storm yaw (rad/s) with the helm let go: the hull broaches, slowly slewing beam-on to the wind (a wind dead ahead or astern
// is an unstable balance, so `sway` -1..1, a slow wave from the sea, tips it one way). 0 in fair weather.
function stormYaw(rot, w, storm, sway = 0) {
  return WEATHER.yaw * storm * clamp(w.strength / WIND.full, 0, 1) * (0.5 * Math.sin(2 * (rot - w.dir)) + 0.35 * sway);
}
// Storm leeway: where a hull is pushed (px/s) by wind and sea.
function stormLeeway(w, storm) {
  const k = WEATHER.leeway * storm * clamp(w.strength / WIND.full, 0, 1);
  return { x: Math.cos(w.dir) * k, y: Math.sin(w.dir) * k };
}
// The wind drift on a cannonball (px/s), storms only.
function ballDrift(w, storm) {
  const k = WEATHER.ballDrift * storm * clamp(w.strength / WIND.full, 0, 1);
  return { x: Math.cos(w.dir) * k, y: Math.sin(w.dir) * k };
}
// A fresh seed for an ordinary sortie.
const wxNewSeed = () => (Math.random() * 2147483646 + 1) | 0;
