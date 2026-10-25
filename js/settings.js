"use strict";
// ---------- Settings (per browser, kept apart from the save so "new game" keeps them) ----------
// Several modules write their own fields into this one key (audio stores { volume }), so writes always merge
// into what is stored now instead of overwriting it with a stale copy.
const SETTINGS_KEY = "privateers-settings";
// Screen shake starts off for players whose system asks for reduced motion; their own choice wins once made.
const SETTINGS_DEFAULTS = { shake: !(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches), zoom: 1, autoFire: true, uiPct: SCALE_DEFAULT, miniPct: SCALE_DEFAULT, markPct: SCALE_DEFAULT, fxq: "auto" };
function readSettings() {
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)); return s && typeof s === "object" && !Array.isArray(s) ? s : {}; }
  catch (e) { return {}; }
}
// A size percentage: whole numbers snapped to the slider's step and held inside its range; anything else is null.
function scalePct(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(v / SCALE_STEP) * SCALE_STEP));
}
// Before the sliders, text size was 1 / 1.15 / 1.3 and chart size 0.8 / 1 / 1.25 (multipliers); old settings still load.
const legacyPct = (v, allowed) => (allowed.includes(v) ? Math.round(v * 100) : null);
// The chart's size in CSS pixels: the base (a share of the shorter side, clamped) times the slider, then held under the
// width and height caps so it never crowds the HUD bars on a phone or a short landscape screen. ts (the UI size as a
// multiplier) makes room in the chart's column for the gold and level labels and the hint line, which grow with it.
function miniSizePx(vw, vh, pct, ts = 0) {
  const base = Math.min(MINI_BASE_MAX, Math.max(MINI_BASE_MIN, MINI_BASE_FRAC * Math.min(vw, vh)));
  const cap = Math.min(MINI_MAX_VW * vw, MINI_MAX_VH * vh, vh - (MINI_HUD_FIXED + MINI_HUD_PER_TS * ts));
  return Math.round(Math.max(MINI_MIN_PX, Math.min(base * pct / 100, cap)));
}
// Backing-store size of the chart canvas for a CSS size: sharp on HiDPI screens, bounded for memory.
function miniCanvasPx(cssPx, dpr) {
  return Math.min(MINI_CANVAS_MAX, Math.max(MINI_CANVAS_MIN, Math.round(cssPx * (dpr > 0 ? dpr : 1))));
}
const SETTINGS = (() => {
  const stored = readSettings(), s = { ...SETTINGS_DEFAULTS, ...stored };
  if (typeof s.shake !== "boolean") s.shake = SETTINGS_DEFAULTS.shake;
  if (typeof s.autoFire !== "boolean") s.autoFire = SETTINGS_DEFAULTS.autoFire;
  if (!["auto", "low", "mid", "high"].includes(s.fxq)) s.fxq = "auto";   // effects quality; settings saved before it existed mean auto
  s.uiPct = scalePct(stored.uiPct) ?? legacyPct(stored.textScale, [1, 1.15, 1.3]) ?? SCALE_DEFAULT;
  s.miniPct = scalePct(stored.miniPct) ?? legacyPct(stored.miniScale, [0.8, 1, 1.25]) ?? SCALE_DEFAULT;
  s.markPct = scalePct(stored.markPct) ?? SCALE_DEFAULT;
  if (!(typeof s.zoom === "number" && s.zoom >= 0.75 && s.zoom <= 1.25)) s.zoom = SETTINGS_DEFAULTS.zoom;
  return s;
})();
// Text, HUD and menus scale by this one factor (the --ts custom property; world labels read it too).
const uiScale = () => SETTINGS.uiPct / 100;
function saveSettings(patch) {
  Object.assign(SETTINGS, patch);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...patch })); } catch (e) {}
}
// All camera shake goes through here so the "screen shake" setting is honoured everywhere.
function camShake(ms, amt) { if (SETTINGS.shake && S) S.cameras.main.shake(ms, amt); }
