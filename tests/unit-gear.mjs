// Unit tests for the gear system (#38; js/gear-core.js, js/gear-save.js): rolls and rarity, affix counts, the item-level split, drops, the ship swap,
// break down and re-roll, the inventory limits, old-save migration, and the diminishing returns and caps. Scripts load into one node:vm context, as in
// tests/unit-boarding.mjs.
// Usage: node --test tests/unit-gear.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/gear-core.js", "js/gear-text.js", "js/save.js", "js/save-campaign.js",
  "js/shipyard.js", "js/gear-save.js", "js/strike.js", "js/boarding.js"];
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
const ctx = vm.createContext({
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
  console: { log() {}, warn() {}, error: (...a) => { throw new Error(a.join(" ")); } }, setTimeout, clearTimeout, performance,
});
vm.runInContext(`var crates = [], enemies = [], player = null, tut = { target: null };   // what the game provides around boarding.js
  const shipRadius = s => ((s.hl ?? 28) + (s.hw ?? 13)) / 2, addCrate = () => {}, refreshBadge = () => {}, onScreen = () => false, coachUp = () => false;`, ctx);
for (const f of FILES) vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);
const json = code => JSON.parse(run(`JSON.stringify(${code})`));
// a seeded 0..1 source for the rolls (inside the context, so the functions take it as `rnd`)
run(`var seeded = n => mulberry32(n);`);
const base = (over = "{}") => `sanitizeSave({ ...defaultSave(), ...${over} })`;

test("rolls: each rarity gets its affix count, distinct keys of its part, and the legendary effect only at 4", () => {
  const counts = json(`(() => { const out = {}, rnd = seeded(11);
    for (const part of GEAR_PARTS) for (let r = 0; r < 5; r++) for (let i = 0; i < 300; i++) {
      const it = gearRoll(part, r, 1 + (i % 5), rnd), keys = (it.af || []).map(a => a[0]);
      (out[r] ||= []).push([keys.length, new Set(keys).size === keys.length, keys.every(k => Object.hasOwn(GEAR_AFFIX[part], k)), !!it.lg, gearPart(it) === part]);
    } return out; })()`);
  const range = [[0, 0], [1, 2], [2, 3], [3, 4], [2, 3]];   // affixes per rarity: common 0, magic 1-2, rare 2-3, epic 3-4, legendary 2-3 plus its effect
  for (const r of [0, 1, 2, 3, 4]) {
    const ns = counts[r].map(c => c[0]);
    assert.ok(counts[r].every(c => c[1] && c[2] && c[4]), `distinct keys from the part's own pool at rarity ${r}`);
    assert.equal(Math.min(...ns), range[r][0], `fewest affixes at rarity ${r}`);
    assert.equal(Math.max(...ns), range[r][1], `most affixes at rarity ${r}`);
    assert.equal(counts[r].every(c => c[3] === (r === 4)), true, `legendary effect only at rarity 4 (${r})`);
  }
});

test("affix values: inside the part's range scaled by item level; a common has none", () => {
  const bad = json(`(() => { const rnd = seeded(5), bad = []; for (const part of GEAR_PARTS) for (let il = 1; il <= 5; il++) for (let i = 0; i < 60; i++) {
    const it = gearRoll(part, 3, il, rnd); for (const [k, v] of it.af) { const [a, b] = GEAR_AFFIX[part][k], K = GEAR_ILV_K[il - 1]; if (v < a * K - 0.001 || v > b * K + 0.001) bad.push([part, k, il, v]); } } return bad; })()`);
  assert.deepEqual(bad, []);
  assert.deepEqual(json(`gearRoll("prow", 0, 3, seeded(1))`), { p: "prow", lv: 1, il: 3 });
});

test("item level: ring to level, capped by the hull's tier, and an item wears only on a hull of at least its level", () => {
  assert.deepEqual(json(`[1,2,3,4,5,6,7,8,9,10,12].map(gearIlvAt)`), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5]);
  for (let ring = 1; ring <= 10; ring++) for (let tier = 1; tier <= 5; tier++) assert.equal(run(`gearDropIlv(${ring}, ${tier})`), Math.min(run(`gearIlvAt(${ring})`), tier));
  assert.equal(run(`gearDropIlv(10, 1)`), 1, "a sloop never finds better than item level 1");
  assert.equal(run(`gearWearable({ p: "sail", il: 3 }, 2)`), false);
  assert.equal(run(`gearWearable({ p: "sail", il: 3 }, 3)`), true);
  assert.equal(run(`gearWearable({ g: "six", lv: 1 }, 1)`), true, "an old gun is item level 1");
  assert.deepEqual(json(`Object.keys(SHIPS).map(id => SHIPS[id].tier)`).every(n => n >= 1 && n <= 5), true);
});

test("drops: the faction chance, luck, rarity weights, a boss's guaranteed rare-or-better, and the item level cap", () => {
  const n = 6000, r = json(`(() => { const rnd = seeded(3), rar = [0, 0, 0, 0, 0], boss = [0, 0, 0, 0, 0]; let got = 0, cap = 0;
    for (let i = 0; i < ${n}; i++) { const it = gearDropRoll({ faction: "pirate", ring: 10, tier: 2 }, rnd); if (it) { got++; rar[it.r | 0]++; if ((it.il | 0 || 1) > 2) cap++; } }
    for (let i = 0; i < ${n}; i++) boss[gearDropRoll({ boss: true, ring: 6, tier: 4 }, rnd).r | 0]++;
    let lucky = 0; for (let i = 0; i < ${n}; i++) if (gearDropRoll({ faction: "pirate", luck: 0.5 }, rnd)) lucky++;
    return { got, rar, boss, cap, lucky }; })()`);
  assert.ok(Math.abs(r.got / n - 0.22) < 0.03, `pirate chance ${r.got / n}`);
  assert.equal(r.rar[3] + r.rar[4], 0, "an ordinary drop is never epic or legendary");
  assert.ok(Math.abs(r.rar[0] / r.got - 0.62) < 0.05 && Math.abs(r.rar[2] / r.got - 0.1) < 0.04, JSON.stringify(r.rar));
  assert.equal(r.boss[0] + r.boss[1], 0, "a bounty captain always drops rare or better");
  assert.ok(r.boss[3] > r.boss[4] && r.boss[2] > r.boss[3], JSON.stringify(r.boss));
  assert.equal(r.cap, 0, "item level never above the hull's tier");
  assert.ok(Math.abs(r.lucky / n - 0.33) < 0.03, "luck 50% lifts the chance 22% to 33%");
  assert.equal(run(`gearDropRoll({ faction: "pirate" }, () => 0.99)`), null);
});

test("prize guns carry a rarity by faction weights; a common prize is the plain gun", () => {
  assert.deepEqual(json(`gearPrize({ g: "six", lv: 2 }, "merchant", 1, 1, 0)`), { g: "six", lv: 2 });
  const rar = json(`(() => { const out = [0,0,0,0,0], rnd = seeded(8); for (let i = 0; i < 3000; i++) out[gearPrize({ g: "long12", lv: 1 }, "navy", 6, 4, rnd()).r | 0]++; return out; })()`);
  assert.ok(rar[0] > 400 && rar[2] > 600 && rar[3] > 150 && rar[4] > 10 && rar[4] < 150, JSON.stringify(rar));
  assert.equal(run(`prizeGun({ faction: "pirate", L: 3 }, 0, 0)`) && json(`prizeGun({ faction: "pirate", L: 3 }, 0, 0)`).r, undefined, "no third roll: the plain gun");
});

test("diminishing returns and caps: the best source in full, the rest at half, never past the cap", () => {
  const worn = (o) => `{ body: { p: "body", lv: 1, r: 1, af: [["fire", ${o.a}]] }, supply: { p: "supply", lv: 1, r: 1, af: [["fire", ${o.b}]] } }`;
  const base0 = json(`gearTotals({ body: { p: "body", lv: 1, r: 1, af: [["fire", 0.2]] } })`).fire;
  assert.equal(base0, 0.2);
  assert.equal(json(`gearTotals(${worn({ a: 0.2, b: 0.1 })})`).fire, 0.25);
  assert.equal(json(`gearTotals(${worn({ a: 0.1, b: 0.2 })})`).fire, 0.25, "order does not matter");
  assert.equal(json(`gearTotals(${worn({ a: 0.5, b: 0.5 })})`).fire, 0.6, "capped at GEAR_CAP");
  assert.ok(run(`gearStack([0.3, 0.3, 0.3], 1)`) < 0.9);
  const hp = json(`gearTotals({ body: { p: "body", lv: 1, il: 5 } })`).hp;
  assert.equal(hp, 0.15, "the base effect of a common item level 5 body: 3% x 5");
  assert.equal(json(`gearTotals({})`).hp, undefined);
});

test("a worn part's Lv scales its values; a gun's affixes ignore its Lv; an old gun has no gear effects", () => {
  const lv1 = json(`gearTotals({ sail: { p: "sail", lv: 1, r: 1, af: [["turn", 0.1]] } })`).turn, lv10 = json(`gearTotals({ sail: { p: "sail", lv: 10, r: 1, af: [["turn", 0.1]] } })`).turn;
  assert.ok(Math.abs(lv10 / lv1 - 1.36) < 0.01);
  assert.deepEqual(json(`gunMods({ g: "six", lv: 7 })`), { gdmg: 0, grange: 0, greload: 0, gtype: 0 });
  assert.equal(json(`gunMods({ g: "six", lv: 7, r: 1, af: [["gdmg", 0.1]] })`).gdmg, 0.1);
  assert.ok(json(`gunMods({ g: "six", lv: 1, il: 3 })`).gdmg > 0, "a higher item level gun has a small base bonus");
});

test("equip: wearing swaps with the worn piece and refuses a hull too small; take off needs bag room", () => {
  let s = json(base(`{ ship: "sloop", gear: { worn: { prow: { p: "prow", il: 1 } }, bag: [{ p: "prow", il: 1, r: 1, af: [["ram", 0.1]] }, { p: "sail", il: 3 }], mats: 0 } }`));
  assert.equal(s.gear.bag.length, 2);
  const out = json(`gearEquip(${JSON.stringify(s)}, 0)`);
  assert.equal(out.gear.worn.prow.r, 1);
  assert.equal(out.gear.bag[0].p, "prow", "the old piece took its place in the bag");
  assert.equal(out.gear.bag.length, 2);
  assert.equal(run(`gearEquip(${JSON.stringify(s)}, 1)`), null, "item level 3 on a sloop");
  const full = { ...s, gear: { ...s.gear, bag: Array.from({ length: 60 }, () => ({ p: "flag", lv: 1 })) } };
  assert.equal(run(`gearUnequip(${JSON.stringify(full)}, "prow")`), null);
  assert.equal(json(`gearUnequip(${JSON.stringify(s)}, "prow")`).gear.bag.length, 3);
});

test("ship swap: the gear follows the captain; what the new hull cannot wear goes to the bag, guns without a port or level to the store", () => {
  const s = json(base(`{ ship: "brig", hull: 1, sails: 1, hold: 1, left: [{ g: "long12", lv: 2, r: 2, il: 3, af: [["gdmg", 0.1], ["grange", 0.1]] }, { g: "six", lv: 1 }, null],
    gear: { worn: { prow: { p: "prow", il: 3, r: 1, af: [["ram", 0.1]] }, flag: { p: "flag", il: 1 } }, bag: [], mats: 4 } }`));
  assert.equal(s.gear.worn.prow.il, 3, "brig is tier 3");
  const toSloop = json(`switchShip(${JSON.stringify(s)}, ${JSON.stringify(s.fleet.find(e => e.ship === "sloop").id)})`);
  assert.equal(toSloop.ship, "sloop");
  assert.equal(toSloop.gear.worn.prow, undefined, "item level 3 does not wear on a sloop");
  assert.equal(toSloop.gear.worn.flag.p, "flag", "item level 1 stays worn");
  assert.equal(toSloop.gear.bag.some(it => it.p === "prow" && it.il === 3), true);
  assert.equal(toSloop.store.some(g => g.g === "long12" && g.r === 2), true, "the rare Long 12 is back in the store with its affixes");
  assert.equal(toSloop.gear.mats, 4);
  const back = json(`switchShip(${JSON.stringify(toSloop)}, ${JSON.stringify(toSloop.fleet.find(e => e.ship === "brig").id)})`);
  assert.equal(back.gear.bag.some(it => it.il === 3), true, "nothing is lost on the way");
});

test("break down and re-roll: values, locks, climbing prices, payment", () => {
  assert.equal(run(`gearScrapValue({ p: "prow", r: 4, il: 5 })`), 90);
  assert.equal(run(`gearScrapValue({ p: "prow" })`), 1);
  const s = json(base(`{ gold: 1000, gear: { worn: {}, bag: [{ p: "prow", r: 2, il: 2, af: [["ram", 0.1], ["keep", 0.1]] }, { p: "body", r: 1, lk: 1 }, { p: "sail" }], mats: 50 }, store: [{ g: "six", lv: 1, r: 1 }, { g: "six", lv: 1, r: 3, lk: 1 }] }`));
  assert.equal(run(`gearScrapAt(${JSON.stringify(s)}, { w: "bag", i: 1 })`), null, "a locked piece is never broken down");
  const one = json(`gearScrapAt(${JSON.stringify(s)}, { w: "bag", i: 0 })`);
  assert.equal(one.gear.mats, 50 + 10 + 0, "a rare, item level 2: 8 x 1.25");
  assert.equal(one.gear.bag.length, 2);
  const b = json(`gearScrapBelow(${JSON.stringify(s)}, 2)`);
  assert.equal(b.n, 3, "bag: the rare and the plain sail; store: the magic gun; both locked ones stay");
  assert.equal(b.save.gear.bag.length, 1);
  assert.equal(b.save.store.length, 1);
  assert.equal(b.save.store[0].lk, 1);
  // re-roll
  const it = s.gear.bag[0], c0 = json(`gearRerollCost(${JSON.stringify(it)})`), c1 = json(`gearRerollCost({ ...${JSON.stringify(it)}, rr: 1 })`), c2 = json(`gearRerollCost({ ...${JSON.stringify(it)}, rr: 2 })`);
  assert.ok(c1.mats > c0.mats && c2.mats > c1.mats && c2.gold > c1.gold && c1.gold > c0.gold, "the price climbs with every re-roll");
  const rr = json(`gearRerollAt(${JSON.stringify(s)}, { w: "bag", i: 0 }, 1, seeded(2))`), item = rr.gear.bag[0];
  assert.equal(item.rr, 1);
  assert.equal(item.af[0][0], "ram", "the other affix is untouched");
  assert.notEqual(item.af[1][0], "keep", "the re-rolled affix changes key");
  assert.equal(new Set(item.af.map(a => a[0])).size, 2);
  assert.equal(rr.gear.mats, 50 - c0.mats);
  assert.equal(rr.gold, 1000 - c0.gold);
  assert.equal(run(`gearRerollAt(${JSON.stringify({ ...s, gear: { ...s.gear, mats: 0 } })}, { w: "bag", i: 0 }, 0)`), null, "not enough fittings");
  assert.equal(run(`gearRerollAt(${JSON.stringify(s)}, { w: "bag", i: 2 }, 0)`), null, "a common has no affix");
});

test("worn parts level up with gold like a gun, five levels at a time with the total price", () => {
  const it = { p: "body", lv: 8, il: 2 };
  assert.equal(run(`gearUpCost(${JSON.stringify(it)})`), Math.round(40 * 2 * 1.5 ** 7));
  const plan = json(`gearUpPlan(${JSON.stringify(it)}, 100000)`);
  assert.equal(plan.n, 2, "the cap stops it at Lv 10");
  assert.equal(plan.cost, run(`gearUpCost({ p: "body", lv: 8, il: 2 }) + gearUpCost({ p: "body", lv: 9, il: 2 })`));
  const s = json(base(`{ gold: 50, gear: { worn: {}, bag: [{ p: "body", lv: 1 }], mats: 0 } }`));
  assert.equal(run(`gearUpAt(${JSON.stringify({ ...s, gold: 5 })}, { w: "bag", i: 0 }, 1)`), null, "not enough gold");
  assert.equal(json(`gearUpAt(${JSON.stringify(s)}, { w: "bag", i: 0 }, 1)`).gear.bag[0].lv, 2);
});

test("inventory limits: a full bag or gun store breaks a drop down at once; nothing is ever dropped silently", () => {
  const full = json(base(`{ gear: { worn: {}, bag: Array.from({ length: 60 }, () => ({ p: "flag" })), mats: 0 } }`));
  const out = json(`gearDrop(${JSON.stringify(full)}, { p: "prow", r: 2, il: 2 })`);
  assert.equal(out.kind, "scrap");
  assert.equal(out.save.gear.bag.length, 60);
  assert.equal(out.save.gear.mats, 10);
  const roomy = json(`gearDrop(${JSON.stringify(full)}, { g: "six", lv: 1, r: 1 })`);
  assert.equal(roomy.kind, "store", "guns have their own store");
  const gunFull = { ...full, store: Array.from({ length: 200 }, () => ({ g: "six", lv: 1 })) };
  assert.equal(json(`gearDrop(${JSON.stringify(gunFull)}, { g: "six", lv: 1, r: 1 })`).kind, "scrap");
  assert.equal(json(`gearDrop(${JSON.stringify(json(base()))}, { p: "sail" })`).kind, "bag");
});

test("old saves: guns are plain (common, item level 1), the six parts are empty, the save still loads", () => {
  const raw = { v: 2, gold: 90, sunk: 3, ship: "brig", bow: [{ g: "six", lv: 3 }], left: [{ g: "long12", lv: 2 }, "six", null], right: [], stern: [], store: [{ g: "fire", lv: 5 }], hull: 2, sails: 2, hold: 2 };
  const s = json(`sanitizeSave(${JSON.stringify(raw)})`);
  assert.deepEqual(s.gear, { worn: {}, bag: [], mats: 0 });
  assert.deepEqual(s.bow[0], { g: "six", lv: 3 });
  assert.deepEqual(s.left[0], { g: "long12", lv: 2 });
  assert.deepEqual(s.store[0], { g: "fire", lv: 5 });
  assert.equal(JSON.stringify(s.left[1]).includes('"r"'), false);
  // loading is idempotent, and new saves round-trip with their gear
  const again = json(`sanitizeSave(${JSON.stringify(s)})`);
  assert.deepEqual(again, s);
  const withGear = json(base(`{ gear: { worn: { prow: { p: "prow", lv: 3, r: 4, il: 1, af: [["ram", 0.05], ["keep", 0.05]], lg: 1, lk: 1, rr: 2 } }, bag: [], mats: 7 } }`));
  assert.deepEqual(json(`sanitizeSave(${JSON.stringify(withGear)})`).gear, withGear.gear);
  assert.equal(withGear.gear.worn.prow.lg, 1);
});

test("hostile data: unknown parts and affixes, huge values, too many affixes and a forged legendary are cut down", () => {
  const raw = json(`sanitizeSave({ v: 2, ship: "line", gear: { worn: { prow: { p: "sail" }, body: { p: "body", lv: 99, r: 9, il: 9, af: [["hp", 99], ["bogus", 1], ["hp", 0.1], ["fire", 0.1], ["armor", 0.05], ["brace", 0.05], ["x"]], lg: 1 },
    gun: { p: "gun" }, junk: 5 }, bag: [null, 5, { p: "flag", r: 2, af: [["loot", 0.1], ["heat", 0.1], ["luck", 0.1], ["escDef", 0.1]], lg: 1 }, { p: "nope" }], mats: -5 } })`);
  assert.equal(raw.gear.worn.prow, undefined, "a sail cannot sit in the prow slot");
  assert.equal(raw.gear.worn.gun, undefined);
  const body = raw.gear.worn.body;
  assert.equal(body.lv, 10); assert.equal(body.r, 4); assert.equal(body.il, 5);
  assert.ok(body.af.length <= 3 && body.af.every(([k, v]) => Object.hasOwn(run("GEAR_AFFIX.body"), k) && v <= 0.14 * 1.5 + 0.001), JSON.stringify(body.af));
  assert.equal(raw.gear.bag.length, 1);
  assert.equal(raw.gear.bag[0].af.length, 3, "a rare keeps at most three affixes");
  assert.equal(raw.gear.bag[0].lg, undefined, "only a legendary carries the effect");
  assert.equal(raw.gear.mats, 0);
});

test("every part has a legendary effect, a base effect and at least four affixes with caps", () => {
  assert.deepEqual(json(`Object.keys(GEAR_LEG).sort()`), json(`[...GEAR_PARTS].sort()`));
  assert.deepEqual(json(`Object.keys(GEAR_BASE).sort()`), json(`[...GEAR_PARTS].sort()`));
  for (const part of run("GEAR_PARTS")) {
    const keys = json(`Object.keys(GEAR_AFFIX.${part})`);
    assert.ok(keys.length >= 4, part);
    for (const k of keys) {
      if (part !== "gun") assert.ok(run(`GEAR_CAP.${k}`) > 0, "cap for " + k);   // a gun's own affixes stack on no other piece
      assert.ok(run(`!!STR.en.ga_${k} && !!STR.zh.ga_${k}`), "text for " + k);
    }
    assert.ok(run(`!!STR.en.gleg_${run(`GEAR_LEG.${part}`)} && !!STR.zh.gleg_${run(`GEAR_LEG.${part}`)} && !!STR.zh.gln_${part} && !!STR.zh.gp_${part}`), "legendary text for " + part);
  }
});
