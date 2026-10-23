"use strict";
// ---------- Settings (per browser, kept apart from the save so "new game" keeps them) ----------
// Several modules write their own fields into this one key (audio stores { volume }), so writes always merge
// into what is stored now instead of overwriting it with a stale copy.
const SETTINGS_KEY = "privateers-settings";
// Screen shake starts off for players whose system asks for reduced motion; their own choice wins once made.
const SETTINGS_DEFAULTS = { shake: !(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches), textScale: 1 };
function readSettings() {
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)); return s && typeof s === "object" && !Array.isArray(s) ? s : {}; }
  catch (e) { return {}; }
}
const SETTINGS = (() => {
  const s = { ...SETTINGS_DEFAULTS, ...readSettings() };
  if (typeof s.shake !== "boolean") s.shake = SETTINGS_DEFAULTS.shake;
  if (![1, 1.15, 1.3].includes(s.textScale)) s.textScale = SETTINGS_DEFAULTS.textScale;
  return s;
})();
function saveSettings(patch) {
  Object.assign(SETTINGS, patch);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...patch })); } catch (e) {}
}
// All camera shake goes through here so the "screen shake" setting is honoured everywhere.
function camShake(ms, amt) { if (SETTINGS.shake && S) S.cameras.main.shake(ms, amt); }
