"use strict";
// ---------- Gear in the save: where it lives, and the pure edits (each returns a new save, or null when it cannot be done) ----------
// save.gear = { worn: { prow, body, sail, supply, instr, flag } (an item or absent), bag: [items], mats: fittings }. The gun part is not here: guns stay
// in the mounts and save.store (js/data.js, js/save.js), now with the optional gear fields (js/gear-core.js). The gear follows the captain, not the
// ship: switching ships (js/shipyard.js boardShip) calls fitGear, which sends whatever the new hull cannot wear (item level above its tier) back to the
// bag, and the guns without a port to the store, so nothing is ever dropped. Old saves carry no gear: their guns are plain Lv N guns (common, item level 1)
// and the six parts are empty. A daily or seeded run plays on a default save (js/run.js), so it has no gear at all.
const GEAR_BAG_SAVED = GEAR_BAG_MAX * 2;   // loading cuts the bag only past twice the limit: parts moved off a smaller ship can push it over, and each was earned
SAVE_DEFAULTS.push(() => ({ gear: { worn: {}, bag: [], mats: 0 } }));

function cleanGear(g) {
  const x = isObj(g) ? g : {}, worn = {};
  for (const p of GEAR_PARTS) { const it = p !== "gun" && isObj(x.worn) ? cleanGearItem(x.worn[p]) : null; if (it && it.p === p) worn[p] = it; }
  return { worn, bag: (Array.isArray(x.bag) ? x.bag : []).map(cleanGearItem).filter(Boolean).slice(0, GEAR_BAG_SAVED), mats: toInt(x.mats, 0, 1e9, 0) };
}
// Items a smaller hull cannot use go back where spares live; a full gun store (past MAX_STORE_SAVED) keeps the rest mounted.
function fitGear(s) {
  const tier = gearTierOf(s.ship), g = s.gear || cleanGear(null), bag = g.bag.slice(), worn = { ...g.worn };
  for (const p of Object.keys(worn)) if (!gearWearable(worn[p], tier)) { bag.push(worn[p]); delete worn[p]; }
  let store = (s.store || []).slice();
  const mounts = Object.fromEntries(MOUNTS.map(({ key }) => [key, (s[key] || []).map(gun => {
    if (!gun || gearWearable(gun, tier) || store.length >= MAX_STORE_SAVED) return gun;
    store.push(gun); return null;
  })]));
  return { ...s, ...mounts, store, gear: { ...g, worn, bag: bag.slice(0, GEAR_BAG_SAVED) } };
}
SAVE_SANITIZERS.push(s => fitGear({ ...s, gear: cleanGear(s.gear) }));

// ---------- locations: { w: "bag", i } | { w: "worn", p } | { w: "store", i } | { w: "mount", side, i } ----------
const gearAt = (s, l) => (l.w === "bag" ? s.gear.bag[l.i] : l.w === "worn" ? s.gear.worn[l.p] : l.w === "store" ? s.store[l.i] : ((l.e != null ? ((s.escorts[l.e] || {}).guns || {}) : s)[l.side] || [])[l.i]) || null;   // l.e: a port of that escort (js/escorts.js)
function gearSet(s, l, it) {   // an item (or null to take it out: a spare closes up, a mount is left empty)
  const put = (arr, i) => { const a = arr.slice(); if (it) a[i] = it; else a.splice(i, 1); return a; };
  if (l.w === "bag") return { ...s, gear: { ...s.gear, bag: put(s.gear.bag, l.i) } };
  if (l.w === "store") return { ...s, store: put(s.store, l.i) };
  if (l.w === "mount" && l.e != null) return { ...s, escorts: s.escorts.map((e, k) => (k === l.e ? { ...e, guns: { ...e.guns, [l.side]: e.guns[l.side].map((g, j) => (j === l.i ? it : g)) } } : e)) };
  if (l.w === "mount") { const a = (s[l.side] || []).slice(); a[l.i] = it; return { ...s, [l.side]: a }; }
  const worn = { ...s.gear.worn }; if (it) worn[l.p] = it; else delete worn[l.p];
  return { ...s, gear: { ...s.gear, worn } };
}
const gearMats = (s, n) => ({ ...s, gear: { ...s.gear, mats: s.gear.mats + n } });
const gearHas = (s, it) => (gearPart(it) === "gun" ? s.store.length < MAX_STORE : s.gear.bag.length < GEAR_BAG_MAX);

// A drop or prize into the save: the bag or the gun store, or broken down at once when full. Returns { save, kind: "bag" | "store" | "scrap", mats }.
function gearDrop(s, it) {
  if (gearHas(s, it)) return gearPart(it) === "gun" ? { save: { ...s, store: s.store.concat([it]) }, kind: "store", mats: 0 }
    : { save: { ...s, gear: { ...s.gear, bag: s.gear.bag.concat([it]) } }, kind: "bag", mats: 0 };
  const mats = gearScrapValue(it);
  return { save: gearMats(s, mats), kind: "scrap", mats };
}
// Wear spare `i`: the piece in that part goes into its place in the bag. Null when the hull is too small for it.
function gearEquip(s, i) {
  const it = s.gear.bag[i];
  if (!it || !gearWearable(it, gearTierOf(s.ship))) return null;
  const old = s.gear.worn[it.p] || null, bag = s.gear.bag.slice(), worn = { ...s.gear.worn, [it.p]: it };
  if (old) bag[i] = old; else bag.splice(i, 1);
  return { ...s, gear: { ...s.gear, worn, bag } };
}
function gearUnequip(s, part) {
  const it = s.gear.worn[part];
  if (!it || s.gear.bag.length >= GEAR_BAG_MAX) return null;
  return gearSet({ ...s, gear: { ...s.gear, bag: s.gear.bag.concat([it]) } }, { w: "worn", p: part }, null);
}
function gearToggleLock(s, l) {
  const it = gearAt(s, l); if (!it) return null;
  const { lk, ...rest } = it;
  return gearSet(s, l, lk ? rest : { ...rest, lk: 1 });
}
// Break one down into fittings: not a locked one, and not a gun still mounted.
function gearScrapAt(s, l) {
  const it = gearAt(s, l);
  if (!it || it.lk || l.w === "mount" || l.w === "worn") return null;
  return gearMats(gearSet(s, l, null), gearScrapValue(it));
}
// The batch: every unlocked spare and stored gun of rarity <= maxR. Returns { save, n, mats }.
function gearScrapBelow(s, maxR) {
  const dead = it => !it.lk && gearR(it) <= maxR, gone = [...s.gear.bag, ...s.store].filter(dead);
  const mats = gone.reduce((a, it) => a + gearScrapValue(it), 0);
  return { save: gearMats({ ...s, store: s.store.filter(it => !dead(it)), gear: { ...s.gear, bag: s.gear.bag.filter(it => !dead(it)) } }, mats), n: gone.length, mats };
}
// Re-roll affix `idx` of the item at `l`: pays its price (fittings and gold, climbing with each re-roll).
function gearRerollAt(s, l, idx, rnd = Math.random) {
  const it = gearAt(s, l), next = it && gearReroll(it, idx, rnd);
  if (!next) return null;
  const c = gearRerollCost(it);
  if (s.gear.mats < c.mats || s.gold < c.gold) return null;
  const paid = { ...gearMats(s, -c.mats), gold: s.gold - c.gold };
  return gearSet(paid, l, next);
}
// Raise a worn or spare part `n` levels for gold (a gun levels in js/gunbay.js).
function gearUpAt(s, l, n) {
  const it = gearAt(s, l); if (!it || it.g) return null;
  const plan = gearUpPlan(it, s.gold, n);
  if (!plan.n || plan.short > 0) return null;
  return gearSet({ ...s, gold: s.gold - plan.cost }, l, { ...it, lv: gearLv(it) + plan.n });
}
