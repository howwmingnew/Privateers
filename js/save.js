"use strict";
// ---------- Save (per-browser convenience only) ----------
// v2 lives under its own key, so an older cached copy of the page can't overwrite it with a fresh v1 save.
const SAVE_KEY = "privateers-save-v2", SAVE_KEY_V1 = "privateers-save-v1";
const defaultSave = () => ({ v: 2, gold: 0, ship: "sloop", hull: 1, sails: 1, hold: 1, unlocked: { six: true },
  gunLv: { six: 1, long12: 1, carronade: 1, fire: 1 }, bow: ["six"], left: ["six"], right: ["six"], stern: [], sunk: 0,
  wrecks: [] });   // the player's own sunken cargo: [{ x, y, value }], kept across sessions
// Give every mount exactly as many guns as the ship has ports, using only guns the captain owns.
function fitMounts(s) {
  const d = defaultSave(), ship = Object.hasOwn(SHIPS, s.ship) ? s.ship : "sloop";
  const unlocked = { ...d.unlocked, ...s.unlocked }, gunLv = { ...d.gunLv, ...s.gunLv };
  const owned = id => Object.hasOwn(GUNS, id) && unlocked[id];
  return { ...s, ship, unlocked, gunLv, ...Object.fromEntries(MOUNTS.map(({ key }) => {
    const old = Array.isArray(s[key]) ? s[key] : [];
    return [key, Array.from({ length: SHIPS[ship].slots[key] }, (_, i) => owned(old[i]) ? old[i] : "six")];
  })) };
}
// v1 sold extra gun ports instead of ships: move each captain onto the ship with as many guns per side,
// keeping their yard levels, so nothing they paid for is lost.
function migrateV1(s) {
  const { ports, ...rest } = s;
  return { ...defaultSave(), ...rest, v: 2, ship: SHIP_ORDER[Math.min(Math.max((ports | 0) - 1, 0), 3)] };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.v === 2) return fitMounts({ ...defaultSave(), ...s });
    const old = JSON.parse(localStorage.getItem(SAVE_KEY_V1));
    if (old && old.v === 1) return fitMounts(migrateV1(old));
  } catch (e) {}
  return defaultSave();
}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
let save = loadSave();
