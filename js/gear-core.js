"use strict";
// ---------- Gear core: the pure rules of the equipment system (#38) ----------
// An item is a plain object. A gun is still the { g, lv } of js/data.js; a worn part is { p, lv }. Both may carry (a field is left out when it is
// the default, so an old save's gun and a new common one look alike):
//   r  rarity 0-4 (GEAR_RARITY)   il  item level 1-5   af  affixes [[key, value], ...]   lg  1 = the legendary effect of its part
//   lk  1 = locked (never broken down, not even by the batch)   rr  affixes re-rolled so far (the price climbs)
// Everything here takes and returns plain data; the save edits are js/gear-save.js, the sea is js/gear-fx.js. Rolls take an `rnd` (a 0..1 source), so tests can fix them.
const gearPart = it => (it && (it.g ? "gun" : it.p)) || null;
const gearR = it => clamp((it && it.r) | 0, 0, 4);
const gearIl = it => clamp((it && it.il) | 0 || 1, 1, GEAR_ILV_K.length);
const gearLv = it => clamp((it && it.lv) | 0 || 1, 1, GEAR_LV_MAX);
const round3 = v => Math.round(v * 1000) / 1000;
const gearAffixes = it => (it && Array.isArray(it.af) ? it.af : []);

// ---------- item level: which ring drops what, and what a hull may wear ----------
const gearIlvAt = ring => GEAR_ILV_RING[clamp(Math.round(ring) || 1, 1, GEAR_ILV_RING.length) - 1];
const gearTierOf = ship => (Object.hasOwn(SHIPS, ship) ? SHIPS[ship].tier : 1);
const gearDropIlv = (ring, tier) => Math.min(gearIlvAt(ring), clamp(tier | 0 || 1, 1, GEAR_ILV_K.length));
const gearWearable = (it, tier) => gearIl(it) <= tier;

// ---------- rolling ----------
// A key of `w` (an array of weights gives its index) picked by r in 0..1; zero weights never win.
function gearPick(w, r) {
  const keys = Array.isArray(w) ? w.map((_, i) => i) : Object.keys(w), total = keys.reduce((a, k) => a + w[k], 0);
  let x = clamp(r, 0, 0.999999) * total, last = keys[0];
  for (const k of keys) { if (!(w[k] > 0)) continue; last = k; if ((x -= w[k]) < 0) return k; }
  return last;
}
const gearAffixValue = (part, key, il, r) => { const [lo, hi] = GEAR_AFFIX[part][key]; return round3((lo + (hi - lo) * clamp(r, 0, 1)) * GEAR_ILV_K[il - 1]); };
// Affixes for a new item of `part`: `n` distinct keys not in `skip`.
function gearAffixRoll(part, n, il, rnd, skip = []) {
  const pool = Object.keys(GEAR_AFFIX[part]).filter(k => !skip.includes(k)), out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out.map(k => [k, gearAffixValue(part, k, il, rnd())]);
}
// A fresh item. `gun`: the gun type when part is "gun". Rarity 0 has no affixes; rarity 4 has the legendary effect.
function gearRoll(part, rar, il, rnd, gun = "six") {
  const [lo, hi] = GEAR_RARITY[rar].af, n = lo + Math.floor(rnd() * (hi - lo + 1));
  const it = part === "gun" ? { g: gun, lv: 1 } : { p: part, lv: 1 };
  if (rar) it.r = rar;
  if (il > 1) it.il = il;
  const af = gearAffixRoll(part, n, il, rnd);
  if (af.length) it.af = af;
  if (rar === 4) it.lg = 1;
  return it;
}
// An ordinary drop from a ship of faction `faction` (or a bounty captain): the item, or null. `ring`: the ring it sank in; `tier`: your hull's tier.
function gearDropRoll({ faction = "pirate", boss = false, luck = 0, ring = 1, tier = 1 }, rnd) {
  const chance = boss ? 1 : (GEAR_DROP.chance[faction] ?? GEAR_DROP.chance.pirate) * (1 + luck);
  if (!(rnd() < chance)) return null;
  const rar = Number(gearPick(boss ? GEAR_DROP.boss : GEAR_DROP.weights, rnd())), part = gearPick(GEAR_DROP.part, rnd());
  return gearRoll(part, rar, gearDropIlv(ring, tier), rnd, part === "gun" ? gearPick(GEAR_DROP.gun, rnd()) : undefined);
}
// A prize gun with a rarity: `gun` is the plain { g, lv } of js/boarding.js, r (0..1) picks the rarity, rnd rolls the affixes.
function gearPrize(gun, faction, ring, tier, r, rnd = Math.random) {
  const rar = Number(gearPick(GEAR_DROP.board[Object.hasOwn(GEAR_DROP.board, faction) ? faction : "merchant"], r));
  return { ...gearRoll("gun", rar, gearDropIlv(ring, tier), rnd, gun.g), lv: gun.lv };
}

// ---------- values ----------
const gearLvMul = it => 1 + GEAR_LV_STEP * (gearLv(it) - 1);
// What an item gives: its own base effect (x item level) and each affix, as [key, value]. A worn part's values grow with its Lv; a gun's do not
// (its Lv already scales its damage).
function gearSources(it) {
  const part = gearPart(it); if (!part) return [];
  const [bk, bv] = GEAR_BASE[part], k = part === "gun" ? 1 : gearLvMul(it);
  return [[bk, bv * (part === "gun" ? gearIl(it) - 1 : gearIl(it)) * k], ...gearAffixes(it).map(([key, v]) => [key, v * k])].filter(([, v]) => v > 0);
}
// The best piece counts in full, the others at GEAR_REST, and the sum stops at the key's cap.
const gearStack = (vals, cap = Infinity) => { const v = vals.slice().sort((a, b) => b - a); return Math.min(cap, v.length ? v[0] + GEAR_REST * v.slice(1).reduce((a, b) => a + b, 0) : 0); };
// The totals of the worn parts (not the guns): { key: value }.
function gearTotals(worn) {
  const by = {};
  for (const part of GEAR_PARTS) {
    const own = {};   // one piece's base and affixes on the same effect add up in full; it is across pieces that they diminish
    for (const [k, v] of gearSources(worn && part !== "gun" ? worn[part] : null)) own[k] = (own[k] || 0) + v;
    for (const k in own) (by[k] ||= []).push(own[k]);
  }
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, round3(gearStack(v, GEAR_CAP[k]))]));
}
// One gun's own effects: { gdmg, grange, greload, gtype } (0 when it has none).
function gunMods(gun) {
  const m = { gdmg: 0, grange: 0, greload: 0, gtype: 0 };
  for (const [k, v] of gearSources(gun)) if (k in m) m[k] += v;
  return m;
}
// Legendary effect active on a worn piece?
const gearLegend = (worn, part) => !!(worn && worn[part] && worn[part].lg);

// ---------- prices ----------
const gearScrapValue = it => Math.max(1, Math.round(GEAR_SCRAP[gearR(it)] * (1 + 0.25 * (gearIl(it) - 1))));
const gearUpCost = it => Math.round(GEAR_UP_BASE * gearIl(it) * 1.5 ** (gearLv(it) - 1));
// Pure: `n` levels of a worn part at once, like gunUpPlan (js/gunbay.js): how many it really is, what it costs, and the gold missing.
function gearUpPlan(it, gold, n = GUN_UP_BATCH) {
  const k = Math.max(0, Math.min(n, GEAR_LV_MAX - gearLv(it)));
  let cost = 0;
  for (let j = 0; j < k; j++) cost += gearUpCost({ ...it, lv: gearLv(it) + j });
  return { n: k, cost, short: Math.max(0, cost - gold) };
}
const gearRerollCost = it => ({ mats: Math.round(GEAR_REROLL.mats[gearR(it)] * (1 + GEAR_REROLL.step * (it.rr | 0))),
  gold: Math.round(GEAR_REROLL.gold * gearIl(it) * (1 + (it.rr | 0))) });
// Pure: the item with affix `idx` re-rolled to another key of its part (the old key stays out), or null when it has nothing to roll.
function gearReroll(it, idx, rnd) {
  const af = gearAffixes(it), part = gearPart(it);
  if (!part || !af[idx] || gearR(it) === 0) return null;
  const others = af.filter((_, i) => i !== idx).map(a => a[0]), next = gearAffixRoll(part, 1, gearIl(it), rnd, others.concat(af[idx][0]));
  const pick = next[0] || gearAffixRoll(part, 1, gearIl(it), rnd, others)[0];   // a part whose pool is used up may roll the same key again
  return { ...it, af: af.map((a, i) => (i === idx ? pick : a)), rr: (it.rr | 0) + 1 };
}

// ---------- reading untrusted data ----------
const gearInt = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };
// The gear fields of a raw item for `part`, cleaned: only what the rules allow, nothing past what a roll could give.
function cleanGearX(v, part) {
  if (!v || typeof v !== "object" || !Object.hasOwn(GEAR_AFFIX, part)) return {};
  const r = clamp(gearInt(v.r), 0, 4), il = clamp(gearInt(v.il) || 1, 1, GEAR_ILV_K.length), out = {}, seen = new Set();
  const af = r && Array.isArray(v.af) ? v.af.filter(a => Array.isArray(a) && typeof a[0] === "string" && Object.hasOwn(GEAR_AFFIX[part], a[0]) && !seen.has(a[0]) && seen.add(a[0])
    && Number.isFinite(Number(a[1])) && Number(a[1]) > 0).slice(0, GEAR_RARITY[r].af[1]).map(([k, x]) => [k, Math.min(round3(Number(x)), round3(GEAR_AFFIX[part][k][1] * GEAR_ILV_K[il - 1]))]) : [];
  if (r) out.r = r;
  if (il > 1) out.il = il;
  if (af.length) out.af = af;
  if (r === 4 && v.lg) out.lg = 1;
  if (v.lk) out.lk = 1;
  if (gearInt(v.rr) > 0) out.rr = Math.min(gearInt(v.rr), 99);
  return out;
}
// A worn or spare part from untrusted data, or null.
function cleanGearItem(v) {
  if (!v || typeof v !== "object" || typeof v.p !== "string" || v.p === "gun" || !Object.hasOwn(GEAR_AFFIX, v.p)) return null;
  return { p: v.p, lv: clamp(gearInt(v.lv) || 1, 1, GEAR_LV_MAX), ...cleanGearX(v, v.p) };
}
