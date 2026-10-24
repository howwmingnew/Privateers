"use strict";
// ---------- Save (per-browser convenience only) ----------
// v2 lives under its own key, so an older cached copy of the page can't overwrite it with a fresh v1 save.
const SAVE_KEY = "privateers-save-v2", SAVE_KEY_V1 = "privateers-save-v1";
const SAVE_KEY_CORRUPT = "privateers-save-corrupt";   // raw text of the last v2 save that could not be read
const MAX_WRECKS = 50;
Object.assign(STR.en, { saveFail: "Progress can't be saved in this browser." });
Object.assign(STR.zh, { saveFail: "這個瀏覽器無法儲存進度。" });
// Modules that own save fields push `() => ({ field: default })` here, so every new game starts with them.
// (Scripts loaded after this file register late; their SAVE_SANITIZERS check fills the fields in for that first load.)
const SAVE_DEFAULTS = [];
// Guns are items { g, lv } (js/data.js): each port holds one or null (empty), and `store` is the gun store under the
// gun deck. wrecks: the player's own sunken cargo [{ x, y, value }], kept across sessions.
const defaultSave = () => Object.assign({ v: 2, gold: 0, ship: "sloop", hull: 1, sails: 1, hold: 1,
  bow: [gunItem("six")], left: [gunItem("six")], right: [gunItem("six")], stern: [], store: [], sunk: 0,
  wrecks: [], salvage: [] }, ...SAVE_DEFAULTS.map(fn => fn()));
const MAX_STORE = 200;   // the armory and "to store" stop here, so a hand-edited save can't build thousands of buttons
// Loading cuts the store only past twice that: guns moved off a bigger ship (New Game+) can push a full store over
// MAX_STORE, and every one of them was paid for.
const MAX_STORE_SAVED = MAX_STORE * 2;
// A gun item from untrusted data, or null. A bare type name (an old save's port) becomes a gun at level `lv`.
function cleanGun(v, lv = 1) {
  if (typeof v === "string") return Object.hasOwn(GUNS, v) ? gunItem(v, lv) : null;
  return isObj(v) && typeof v.g === "string" && Object.hasOwn(GUNS, v.g) ? gunItem(v.g, toInt(v.lv, 1, GUN_MAX, 1)) : null;
}
// Give every mount exactly as many ports as the ship has. Ports past the end (a smaller ship: New Game+) send their
// guns to the store; new ports start empty.
function fitMounts(s) {
  const { unlocked, gunLv, ...rest } = s;   // the old one-unlock-per-type fields (sanitizeCore converts them)
  const ship = Object.hasOwn(SHIPS, s.ship) ? s.ship : "sloop", spill = [];
  const mounts = Object.fromEntries(MOUNTS.map(({ key }) => {
    const old = (Array.isArray(s[key]) ? s[key] : []).map(v => cleanGun(v)), n = SHIPS[ship].slots[key];
    spill.push(...old.slice(n).filter(Boolean));
    return [key, Array.from({ length: n }, (_, i) => old[i] || null)];
  }));
  const store = (Array.isArray(s.store) ? s.store : []).map(v => cleanGun(v)).filter(Boolean).slice(0, MAX_STORE_SAVED - spill.length).concat(spill);
  return { ...rest, ship, ...mounts, store };
}
// v1 sold extra gun ports instead of ships: move each captain onto the ship with as many guns per side.
// v1 yard levels scaled the sloop's base stats, so pick the levels that give the new ship the same hull, speed and
// hold, rather than letting the old levels multiply its bigger base stats (a free 3x on a frigate).
function migrateV1(s) {
  const { ports, ...rest } = s;
  const ship = SHIP_ORDER[Math.min(Math.max((ports | 0) - 1, 0), 3)];
  const yard = Object.fromEntries(Object.keys(YARD).map(k => {
    const was = YARD[k].val(toInt(rest[k], 1, YARD[k].max, 1), SHIPS.sloop);
    let best = 1;
    for (let l = 2; l <= YARD[k].max; l++) if (Math.abs(YARD[k].val(l, SHIPS[ship]) - was) < Math.abs(YARD[k].val(best, SHIPS[ship]) - was)) best = l;
    return [k, best];
  }));
  return { ...defaultSave(), ...rest, ...yard, v: 2, ship, store: undefined };   // no store: sanitizeCore converts the old guns
}

// ---------- Validation ----------
// Storage is untrusted (hand edits, old builds, half-written data): every field the game relies on is coerced to a
// safe value, and fields this file doesn't know (added by other modules) pass through untouched.
// Other modules push `s => s` checks for the fields they own (return a new object, don't mutate). They run on every
// loadSave(), and once more just before the game boots, so a check pushed at script load always applies.
const SAVE_SANITIZERS = [];
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const toNum = v => typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;   // numeric strings count
function toInt(v, lo, hi, def) { const n = Math.floor(toNum(v)); return Number.isFinite(n) ? clamp(n, lo, hi) : def; }
function cleanWreck(w) {
  if (!isObj(w)) return null;
  const x = toNum(w.x), y = toNum(w.y), value = Math.round(toNum(w.value));
  const ok = x >= 0 && x <= W && y >= 0 && y <= H && Number.isFinite(value) && value > 0;   // NaN fails every comparison
  return ok ? { x: Math.round(x), y: Math.round(y), value: Math.min(value, Number.MAX_SAFE_INTEGER) } : null;
}
function sanitizeCore(raw) {
  const keep = Object.fromEntries(Object.keys(raw).filter(k => !UNSAFE_KEYS.has(k)).map(k => [k, raw[k]]));
  const has = (o, k) => isObj(o) && Object.hasOwn(o, k);
  // Saves from before per-gun items unlocked a type once and levelled it for every port (unlocked, gunLv). Each mounted
  // gun becomes its own item at its type's level (a port holding a type never bought, the 6-pounder), and each type
  // bought but mounted nowhere puts one gun in the store, so nothing paid for is lost.
  const lvOf = id => toInt(has(raw.gunLv, id) ? raw.gunLv[id] : 1, 1, GUN_MAX, 1);
  const owned = id => id === "six" || (has(raw.unlocked, id) && raw.unlocked[id] === true);
  // Old saves had a gun in every port, so a port the save leaves out was a 6-pounder too.
  const legacy = !Array.isArray(raw.store), ship = typeof raw.ship === "string" && Object.hasOwn(SHIPS, raw.ship) ? raw.ship : "sloop";
  const port = v => typeof v === "string" && Object.hasOwn(GUNS, v) && owned(v) ? gunItem(v, lvOf(v)) : gunItem("six", lvOf("six"));
  const mounts = Object.fromEntries(MOUNTS.map(({ key }) => {
    const arr = Array.isArray(raw[key]) ? raw[key] : [];
    return [key, legacy ? Array.from({ length: SHIPS[ship].slots[key] }, (_, i) => port(arr[i])) : arr];
  }));
  const aboard = new Set(Object.values(mounts).flat().map(v => cleanGun(v)?.g));
  const store = legacy ? GUN_ORDER.filter(id => id !== "six" && owned(id) && !aboard.has(id)).map(id => gunItem(id, lvOf(id))) : raw.store;
  const yard = Object.fromEntries(Object.keys(YARD).map(k => [k, toInt(raw[k], 1, YARD[k].max, 1)]));
  // salvage: wreck cargo scooped up but not yet sold. The hold isn't saved, so if the game closed before docking it goes
  // back into the sea where it was found instead of vanishing.
  const salvage = (Array.isArray(raw.salvage) ? raw.salvage : []).map(cleanWreck).filter(Boolean);
  const wrecks = (Array.isArray(raw.wrecks) ? raw.wrecks : []).map(cleanWreck).filter(Boolean).concat(salvage).slice(-MAX_WRECKS);   // newest last
  return fitMounts({ ...keep, v: 2, gold: toInt(raw.gold, 0, Number.MAX_SAFE_INTEGER, 0),
    ship,
    ...yard, ...mounts, store, sunk: toInt(raw.sunk, 0, Number.MAX_SAFE_INTEGER, 0), wrecks, salvage: [] });
}
// Core fields first, then each module's own. A module check that throws is skipped and reported, never fatal.
// Quitting to the title drops the hold without a reload, so put any unsold salvage back at sea there too.
function restoreSalvage() {
  const back = Array.isArray(save.salvage) ? save.salvage : [];
  if (!back.length) return;
  save = { ...save, salvage: [], wrecks: save.wrecks.concat(back).slice(-MAX_WRECKS) };
  if (S && typeof addCrate === "function") for (const w of back) addCrate(w.x, w.y, w.value, w);
  persist();
}
function sanitizeSave(raw) {
  let s = sanitizeCore(isObj(raw) ? raw : {});
  for (const fn of SAVE_SANITIZERS) {
    try { const out = fn(s); if (isObj(out)) s = out; else console.error("Save sanitizer returned no object; ignored:", fn); }
    catch (e) { console.error("Save sanitizer failed; skipped:", e); }
  }
  return s;
}

function readStored(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
// The next persist() overwrites the v2 key, so keep the unreadable text where it can still be recovered by hand.
function setAsideCorrupt(txt, err) {
  console.error(`Save could not be read; starting from a fresh save. The old one is kept under "${SAVE_KEY_CORRUPT}".`, err);
  try { localStorage.setItem(SAVE_KEY_CORRUPT, txt); } catch (e) {}
}
function loadSave() {
  // each key on its own: a broken v2 save must not hide a good v1 one
  const txt = readStored(SAVE_KEY);
  if (txt != null) {
    try {
      const s = JSON.parse(txt);
      if (!isObj(s) || s.v !== 2) throw new Error("not a v2 save");
      return sanitizeSave(s);
    } catch (e) { setAsideCorrupt(txt, e); }
  }
  const old = readStored(SAVE_KEY_V1);   // never written by this version, so it needs no backup
  if (old != null) {
    try { const s = JSON.parse(old); if (isObj(s) && s.v === 1) return sanitizeSave(migrateV1(s)); }
    catch (e) { console.error("The v1 save could not be read; starting from a fresh save.", e); }
  }
  return sanitizeSave(defaultSave());
}
let saveFailWarned = false;
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
  catch (e) { if (!saveFailWarned) { saveFailWarned = true; console.error("Could not save progress:", e); warnSaveFailed(); } }
}
// Tell the player once. The harbor sheet covers the toast, so wait until the ship is at sea.
function warnSaveFailed() {
  if (typeof toast !== "function") return;
  if (typeof docked !== "undefined" && docked) { setTimeout(warnSaveFailed, 1000); return; }
  toast(t("saveFail"));
}
let save = loadSave();
// Modules loaded after this file push their checks too late for the load above, so run them once more when every
// script has run. Phaser also waits for DOMContentLoaded and registers later, so this runs before the scene is built.
document.addEventListener("DOMContentLoaded", () => { if (typeof S === "undefined" || !S) save = sanitizeSave(save); }, true);
