// Unit tests for the pure game logic, no browser: loads the classic scripts into one node:vm context, as the page does.
// Usage: node --test tests/unit.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/data.js", "js/save.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const SAVE_KEY = "privateers-save-v2", V1_KEY = "privateers-save-v1", CORRUPT_KEY = "privateers-save-corrupt";

// A fresh page load: storage seeded with `seed` ({ key: string }), then every file run in order.
function boot(seed = {}, { failWrites = false } = {}) {
  const store = new Map(Object.entries(seed));
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { if (failWrites) throw new Error("QuotaExceededError"); store.set(k, String(v)); },
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
  const domReady = [];
  const errors = [];
  const ctx = vm.createContext({
    localStorage, navigator: { language: "en-US" },
    document: { addEventListener: (type, fn) => { if (type === "DOMContentLoaded") domReady.push(fn); } },
    console: { log() {}, warn() {}, error: (...a) => errors.push(a.map(String).join(" ")) },
    setTimeout, clearTimeout,
  });
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  const run = code => vm.runInContext(code, ctx);
  // Values cross the realm boundary as JSON so deepEqual compares plain local objects.
  const json = code => JSON.parse(run(`JSON.stringify(${code})`));
  return { run, json, store, errors, domReady: () => domReady.forEach(fn => fn()) };
}
const G = (g, lv = 1) => ({ g, lv });   // a gun item (js/data.js)
const v2 = o => JSON.stringify({ v: 2, gold: 0, ship: "sloop", hull: 1, sails: 1, hold: 1,
  bow: [G("six")], left: [G("six")], right: [G("six")], stern: [], store: [], sunk: 0, wrecks: [], salvage: [], ...o });
// a v2 save from before per-gun items: one unlock and one level per type, ports hold type names, no store
const oldV2 = o => JSON.stringify({ v: 2, gold: 0, ship: "sloop", hull: 1, sails: 1, hold: 1, unlocked: { six: true },
  gunLv: { six: 1, long12: 1, carronade: 1, chain: 1, fire: 1 }, bow: ["six"], left: ["six"], right: ["six"], stern: [], sunk: 0, wrecks: [], salvage: [], ...o });
const loadWith = (o, opts) => boot({ [SAVE_KEY]: typeof o === "string" ? o : v2(o) }, opts);

test("fresh browser gets the default save", () => {
  const g = boot();
  assert.deepEqual(g.json("save"), g.json("defaultSave()"));
  assert.deepEqual(g.json("save"), JSON.parse(v2({})));   // module fields (tutorial, campaign) come via SAVE_DEFAULTS
  assert.equal(g.store.size, 0, "loading must not write anything");
});

test("sanitising is idempotent and keeps a valid save as it is", () => {
  const g = boot();
  const rich = { v: 2, gold: 1234, ship: "brig", hull: 4, sails: 3, hold: 5,
    bow: [G("long12", 2)], left: [G("six", 3), null, G("long12", 2)], right: [G("long12", 1), G("six", 3), G("fire", 4)], stern: [],
    store: [G("fire", 1), G("chain", 2)], sunk: 17, wrecks: [{ x: 3000, y: 1200, value: 80 }], salvage: [] };
  const once = g.json(`sanitizeSave(${JSON.stringify(rich)})`);
  assert.deepEqual(once, rich);
  assert.deepEqual(g.json(`sanitizeSave(sanitizeSave(${JSON.stringify(rich)}))`), once);
});

test("v1 saves migrate onto the ship matching their gun ports", () => {
  const ships = { 1: "sloop", 2: "schooner", 3: "brig", 4: "frigate", 5: "frigate", 0: "sloop", "-3": "sloop", "\"3\"": "brig", "\"junk\"": "sloop", "null": "sloop", "2.7": "schooner", "{}": "sloop" };
  for (const [ports, ship] of Object.entries(ships)) {
    const v1 = `{"v":1,"gold":321,"ports":${ports},"hull":2,"sails":1,"hold":1,"unlocked":{"six":true,"long12":true},"gunLv":{"six":2,"long12":1,"carronade":1,"fire":1},` +
      `"left":["long12","six","six","six"],"right":["six","long12"],"sunk":9,"wrecks":[{"x":2000,"y":2100,"value":40}]}`;
    const g = boot({ [V1_KEY]: v1 });
    const s = g.json("save");
    assert.equal(s.ship, ship, `ports ${ports}`);
    assert.equal(s.v, 2);
    assert.equal(s.gold, 321); assert.equal(s.sunk, 9);
    assert.deepEqual(s.wrecks, [{ x: 2000, y: 2100, value: 40 }]);
    assert.equal(s.ports, undefined);
    const slots = g.json(`SHIPS.${ship}.slots`);
    for (const k of ["bow", "left", "right", "stern"]) assert.equal(s[k].length, slots[k], `${ship} ${k}`);
    assert.deepEqual(s.left[0], G("long12"), "owned guns stay mounted");
    if (s.left.length > 1) assert.deepEqual(s.left[1], G("six", 2), "at their type's old level");
    assert.deepEqual(s.store, [], "every type owned was aboard");
  }
});

test("v1 migration keeps hull, speed and hold close to what the captain had", () => {
  const v1 = { v: 1, gold: 1234, hull: 15, sails: 10, hold: 12, ports: 4, unlocked: { six: true }, gunLv: { six: 5 }, left: [], right: [], sunk: 50, wrecks: [] };
  const g = boot({ [V1_KEY]: JSON.stringify(v1) });
  const s = g.json("save");
  assert.equal(s.ship, "frigate");
  for (const k of ["hull", "sails", "hold"]) {
    // v1 levels scaled the sloop's base stats; the frigate gets whichever level comes closest to the old value
    const was = g.run(`YARD.${k}.val(${v1[k]}, SHIPS.sloop)`), now = g.run(`yardVal("${k}")`);
    const options = g.json(`Array.from({ length: YARD.${k}.max }, (_, i) => YARD.${k}.val(i + 1, SHIPS.frigate))`);
    assert.equal(Math.abs(now - was), Math.min(...options.map(v => Math.abs(v - was))), `${k}: had ${was}, now ${now} at Lv ${s[k]}`);
    assert.ok(now < was * 1.25, `${k} is not inflated by the bigger ship (${was} -> ${now})`);
  }
  assert.equal(s.sails, 10, "same base speed, same level");
});

test("a garbled v2 save is set aside and a good v1 save still loads", () => {
  const bad = '{"v":2,"gold":5000,"ship":"brig"';
  const g = boot({ [SAVE_KEY]: bad, [V1_KEY]: JSON.stringify({ v: 1, gold: 999, ports: 2, hull: 1, sails: 1, hold: 1, sunk: 5, wrecks: [] }) });
  assert.equal(g.store.get(CORRUPT_KEY), bad);
  assert.equal(g.json("save").ship, "schooner");
  assert.equal(g.json("save").gold, 999);
  assert.ok(g.errors.length > 0, "the failure is reported in the console");
});

test("unreadable or non-save v2 data falls back to defaults and is kept", () => {
  for (const raw of ["{not json", "", "42", "[]", "\"text\"", "null", '{"v":3,"gold":9}', '{"gold":5}']) {
    const g = boot({ [SAVE_KEY]: raw });
    assert.deepEqual(g.json("save"), g.json("defaultSave()"), JSON.stringify(raw));
    assert.equal(g.store.get(CORRUPT_KEY), raw);
  }
});

test("hostile numbers are coerced into range", () => {
  const cases = [
    [{ gold: "500" }, s => assert.equal(s.gold, 500)],
    [{ gold: "abc" }, s => assert.equal(s.gold, 0)],
    [{ gold: -40 }, s => assert.equal(s.gold, 0)],
    [{ gold: 12.9 }, s => assert.equal(s.gold, 12)],
    [{ gold: null }, s => assert.equal(s.gold, 0)],
    [{ gold: [7] }, s => assert.equal(s.gold, 0)],
    [{ hull: 99, sails: -3, hold: "7" }, s => { assert.equal(s.hull, 15); assert.equal(s.sails, 1); assert.equal(s.hold, 7); }],
    [{ hull: "NaN", sails: {}, hold: true }, s => { assert.equal(s.hull, 1); assert.equal(s.sails, 1); assert.equal(s.hold, 1); }],
    [{ store: [{ g: "six", lv: '1<img src=x onerror="alert(1)">' }, { g: "long12", lv: 50 }, { g: "carronade", lv: 0 }, { g: "chain", lv: -2 }, { g: "fire", lv: "3" }] },
      s => assert.deepEqual(s.store, [G("six", 1), G("long12", 10), G("carronade", 1), G("chain", 1), G("fire", 3)])],
    [{ store: "lots" }, s => assert.deepEqual(s.store, [])],
    [{ sunk: -5 }, s => assert.equal(s.sunk, 0)],
    [{ sunk: "12" }, s => assert.equal(s.sunk, 12)],
  ];
  for (const [o, check] of cases) check(loadWith(o).json("save"));
  // JSON can't hold NaN or Infinity, but 1e999 parses to Infinity
  const inf = loadWith('{"v":2,"gold":1e999,"hull":-1e999,"sunk":1e999}').json("save");
  assert.equal(inf.gold, 0); assert.equal(inf.hull, 1); assert.equal(inf.sunk, 0);
  // in-memory NaN (a module bug, not storage) is handled the same way
  assert.equal(boot().run("sanitizeSave({ v: 2, gold: NaN, hull: NaN }).gold"), 0);
});

test("unknown ships and guns are dropped", () => {
  const s = loadWith({ ship: "galleon", left: [{ g: "nuke" }, G("six")], right: [G("long12")], bow: [{}], stern: [G("fire")], store: [G("nuke"), "x", null, G("chain")] }).json("save");
  assert.equal(s.ship, "sloop");
  assert.deepEqual(s.left, [null], "an unknown gun leaves its port empty");
  assert.deepEqual(s.right, [G("long12")]); assert.deepEqual(s.bow, [null]); assert.deepEqual(s.stern, []);
  assert.deepEqual(s.store, [G("chain"), G("six"), G("fire")], "guns past the sloop's ports go to the store, after the good stored ones");
  for (const ship of ["__proto__", "constructor", "toString", 42, null]) assert.equal(loadWith({ ship }).json("save").ship, "sloop", String(ship));
  assert.equal(loadWith({ store: Array.from({ length: 500 }, () => G("six")) }).json("save").store.length, 400, "the store is capped (at twice the armory limit)");
});

test("wrecks: only finite, in-map, positive entries, at most 50", () => {
  for (const wrecks of [null, {}, "abc", 5, true]) assert.deepEqual(loadWith({ wrecks }).json("save").wrecks, [], JSON.stringify(wrecks));
  const s = loadWith({ wrecks: [
    { x: 100, y: 200, value: 30, extra: "<b>" }, { x: -5, y: 10, value: 3 }, { x: 99999, y: 10, value: 3 }, { x: 10, y: 8001, value: 3 },
    { x: "300", y: "400", value: "12" }, { x: null, y: 10, value: 3 }, { x: 10, y: 10, value: 0 }, { x: 10, y: 10, value: -4 },
    { x: 10, y: 10, value: "lots" }, null, "wreck", [1, 2, 3], { x: 8000, y: 0, value: 1 },
  ] }).json("save");
  assert.deepEqual(s.wrecks, [{ x: 100, y: 200, value: 30 }, { x: 300, y: 400, value: 12 }, { x: 8000, y: 0, value: 1 }]);
  const many = Array.from({ length: 5000 }, (_, i) => ({ x: 10 + (i % 4000), y: 20, value: i + 1 }));
  const capped = loadWith({ wrecks: many }).json("save").wrecks;
  assert.equal(capped.length, 50);
  assert.equal(capped.at(-1).value, 5000, "the newest wrecks are kept");
  assert.equal(loadWith('{"v":2,"wrecks":[{"x":1e999,"y":5,"value":5},{"x":5,"y":5,"value":1e999}]}').json("save").wrecks.length, 0);
});

test("prototype keys in a save don't pollute anything", () => {
  const raw = '{"v":2,"gold":10,"__proto__":{"polluted":1,"gold":999},"constructor":{"prototype":{"bad":1}},"prototype":{"x":1},' +
    '"unlocked":{"__proto__":{"long12":true}},"gunLv":{"__proto__":{"six":9},"constructor":5},"wrecks":[{"__proto__":{"x":5},"x":1,"y":2,"value":3}]}';
  const g = loadWith(raw);
  const s = g.json("save");
  assert.equal(s.gold, 10);
  assert.deepEqual([s.bow, s.left, s.right, s.store], [[G("six")], [G("six")], [G("six")], []], "the inherited unlock and level count for nothing");
  assert.equal(s.unlocked, undefined); assert.equal(s.gunLv, undefined);
  assert.deepEqual(s.wrecks, [{ x: 1, y: 2, value: 3 }]);
  assert.equal(g.run("Object.getPrototypeOf(save) === Object.prototype"), true);
  assert.equal(g.run("['__proto__', 'constructor', 'prototype'].some(k => Object.hasOwn(save, k))"), false);
  assert.equal(g.run("({}).polluted === undefined && ({}).bad === undefined && Object.prototype.gold === undefined"), true);
  assert.equal(g.run("typeof save.constructor"), "function", "constructor is still Object's");
});

test("unknown fields from other modules survive load and sanitising", () => {
  const extra = { tutorialDone: true, campaign: { chapter: 3, flags: ["metFleet", "lostBrig"], log: [{ day: 1 }] }, futureThing: "x" };
  const g = loadWith(extra);
  const s = g.json("save");
  for (const [k, v] of Object.entries(extra)) assert.deepEqual(s[k], v, k);
  assert.deepEqual(g.json(`fitMounts({ ...save, ship: "brig" })`).campaign, extra.campaign);
  g.run("persist()");
  assert.deepEqual(JSON.parse(g.store.get(SAVE_KEY)).campaign, extra.campaign);
});

test("SAVE_SANITIZERS: module checks run on load and again before boot; a broken one is skipped", () => {
  const g = loadWith({ gold: 50, campaign: { chapter: "9" } });
  // pushed after save.js ran, as a later script would: applies at DOMContentLoaded
  g.run(`SAVE_SANITIZERS.push(s => ({ ...s, campaign: { chapter: Math.min(Number(s.campaign?.chapter) || 1, 5) } }));
         SAVE_SANITIZERS.push(() => { throw new Error("buggy module"); });
         SAVE_SANITIZERS.push(() => 42);`);
  assert.equal(g.json("save").campaign.chapter, "9");
  g.domReady();
  const s = g.json("save");
  assert.deepEqual(s.campaign, { chapter: 5 });
  assert.equal(s.gold, 50, "core fields survive a broken module check");
  assert.ok(g.errors.some(e => /buggy module/.test(e)));
  assert.ok(g.errors.some(e => /no object/.test(e)));
  assert.deepEqual(g.json("loadSave()").campaign, { chapter: 5 }, "loadSave applies them too");
});

test("a failed write is reported once, not silently dropped", () => {
  const g = boot({}, { failWrites: true });
  g.run("var toasts = []; var toast = m => toasts.push(m);");
  g.run("persist(); persist(); persist();");
  assert.deepEqual(g.json("toasts"), [g.run('t("saveFail")')]);
  assert.equal(g.errors.filter(e => /Could not save/.test(e)).length, 1);
});

test("yard values and costs rise with level, and ships get pricier", () => {
  const g = boot();
  const ships = g.json("SHIP_ORDER");
  for (const k of ["hull", "sails", "hold"]) {
    const max = g.run(`YARD.${k}.max`);
    for (const ship of ships) for (let l = 1; l < max; l++)
      assert.ok(g.run(`yardVal("${k}", ${l + 1}, SHIPS.${ship})`) > g.run(`yardVal("${k}", ${l}, SHIPS.${ship})`), `${k} ${ship} Lv ${l}`);
    for (let l = 1; l < max; l++) assert.ok(g.run(`YARD.${k}.cost(${l + 1})`) > g.run(`YARD.${k}.cost(${l})`), `${k} cost Lv ${l}`);
  }
  for (let i = 1; i < ships.length; i++) {
    const [a, b] = [g.json(`SHIPS.${ships[i - 1]}`), g.json(`SHIPS.${ships[i]}`)];
    assert.ok(b.cost > a.cost, `${ships[i]} costs more than ${ships[i - 1]}`);
    assert.ok(b.hp >= a.hp && b.hold >= a.hold, `${ships[i]} is no weaker than ${ships[i - 1]}`);
  }
  for (const id of g.json("GUN_ORDER")) for (let l = 1; l < g.run("GUN_MAX"); l++)
    assert.ok(g.run(`gunUpCost(gunItem("${id}", ${l + 1}))`) > g.run(`gunUpCost(gunItem("${id}", ${l}))`), `${id} upgrade Lv ${l}`);
});

test("enemies get stronger and richer with level", () => {
  const g = boot();
  for (const merchant of [false, true]) for (let L = 1; L < 20; L++) {
    const [a, b] = [g.json(`enemyStats(${L}, ${merchant})`), g.json(`enemyStats(${L + 1}, ${merchant})`)];
    for (const k of ["hp", "dmg", "range", "speed", "loot"]) assert.ok(b[k] > a[k], `${k} L${L} merchant=${merchant}`);
    for (const k of ["per", "lead"]) assert.ok(b[k] >= a[k], `${k} L${L}`);
    assert.ok(b.spread <= a.spread, `spread L${L}`);
    assert.ok(b.interval === a.interval);
  }
  for (let L = 1; L < 40; L++) assert.ok(g.run(`enemyPower(${L + 1}) > enemyPower(${L})`), `power L${L}`);
});

test("every string exists in both languages", () => {
  const g = boot();
  const en = g.json("Object.keys(STR.en)"), zh = g.json("Object.keys(STR.zh)");
  assert.deepEqual(en.filter(k => !zh.includes(k)), [], "missing in zh");
  assert.deepEqual(zh.filter(k => !en.includes(k)), [], "missing in en");
  assert.ok(g.run("Object.values(STR.zh).every(v => typeof v === 'string' && v.trim() !== '')"));
});

test("saves from before per-gun items: each mounted gun keeps its level, unmounted purchases wait in the store", () => {
  const s = loadWith(oldV2({ ship: "schooner", unlocked: { six: true, long12: true, carronade: true, fire: "yes" }, gunLv: { six: 3, long12: 2, carronade: 4, fire: 9 },
    bow: ["long12"], left: ["six", "fire"], right: ["carronade"] })).json("save");
  assert.deepEqual(s.bow, [G("long12", 2)]);
  assert.deepEqual(s.left, [G("six", 3), G("six", 3)], "a type never bought (fire: 'yes') becomes a 6-pounder");
  assert.deepEqual(s.right, [G("carronade", 4), G("six", 3)], "a port the old save left out was a 6-pounder");
  assert.deepEqual(s.store, [], "every type bought is aboard");
  const spare = loadWith(oldV2({ unlocked: { six: true, long12: true, chain: true }, gunLv: { six: 1, long12: 5, chain: 2 } })).json("save");
  assert.deepEqual(spare.store, [G("long12", 5), G("chain", 2)], "bought, never mounted: one of each in the store");
  assert.equal(spare.unlocked, undefined);
  const g = loadWith(oldV2({ unlocked: { six: true, long12: true } }));
  assert.deepEqual(g.json("sanitizeSave(save)"), g.json("save"), "converting once is enough: a second load adds nothing");
});

// ---------- Combat, guns and economy tables (js/data.js, js/arsenal.js, js/plunder.js) ----------
const COMBAT_SRC = ["js/volley.js", "js/arsenal.js", "js/plunder.js"].map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);

test("chain shot is a full gun: armoury order, save defaults, sanitiser, old saves", () => {
  const g = boot();
  assert.ok(g.json("GUN_ORDER").includes("chain"));
  const old = loadWith(oldV2({ gunLv: { six: 2, long12: 1, carronade: 1, fire: 1 }, unlocked: { six: true, chain: true }, left: ["chain"] })).json("save");
  assert.deepEqual(old.left, [G("chain", 1)], "a save from before chain shot: its chain gun stays mounted at Lv 1");
  assert.deepEqual(loadWith(oldV2({ unlocked: { six: true }, left: ["chain"] })).json("save").left, [G("six")], "not owned: back to the 6-pounder");
  const gun = g.json("GUNS.chain");
  for (const k of ["dmg", "range", "rpm", "speed", "cost", "upBase"]) assert.ok(gun[k] > 0, k);
});

test("no damage gun beats the next best by more than 40% in DPS for the same gold", () => {
  const g = boot();
  const worst = g.run(`(() => {
    const ids = GUN_ORDER.filter(id => !GUNS[id].chain), invest = (id, L) => { let c = GUNS[id].cost; for (let l = 1; l < L; l++) c += Math.round(GUNS[id].upBase * 1.55 ** (l - 1)); return c; };
    const dps = (id, L) => { const g = GUNS[id], r = g.rpm / 60; return (g.dmg * r + (g.burn ? Math.min(BURN_MAX, r * BURN_T) * g.burn : 0)) * gunLvMul(L); };
    let w = 0;
    for (let B = 300; B <= 40000; B *= 1.25) {
      const d = ids.map(id => { let L = 0; for (let l = 1; l <= GUN_MAX; l++) if (invest(id, l) <= B) L = l; return L ? dps(id, L) : 0; }).filter(Boolean).sort((a, b) => b - a);
      if (d.length > 1) w = Math.max(w, d[0] / d[1]);
    }
    return w; })()`);
  assert.ok(worst <= 1.4, `best/next-best DPS at equal spend ${worst.toFixed(2)}`);
});

test("a new ship is never a downgrade from the previous one at a typical refit", () => {
  const g = boot();
  const ships = g.json("SHIP_ORDER");
  const at = (ship, hull, hold) => g.json(`(() => { save = fitMounts({ ...defaultSave(), ship: "${ship}", hull: ${hull}, hold: ${hold} });
    return { p: playerPower(), hp: yardVal("hull"), hold: yardVal("hold") }; })()`);
  for (let i = 1; i < ships.length; i++) {
    const old = at(ships[i - 1], 5, 4), nw = at(ships[i], 1, 1);
    for (const k of ["p", "hp", "hold"]) assert.ok(nw[k] >= old[k], `${ships[i]} Lv1 ${k} ${nw[k]} vs ${ships[i - 1]} hull 5 / hold 4 ${old[k]}`);
  }
});

test("ship rating: a fresh sloop is Lv 2, and fires are counted once however many incendiaries", () => {
  const g = boot();
  assert.equal(g.run("shipRating()"), 2);
  // 14 incendiaries on a ship of the line: impact for each gun at its uptime, but burning only BURN_MAX fires at once
  const dps = g.run(`save = fitMounts({ ...defaultSave(), ship: "line", unlocked: { six: true, fire: true }, left: Array(5).fill("fire"), right: Array(5).fill("fire"), bow: ["fire", "fire"], stern: ["fire", "fire"] }),
    playerPower() ** 2 / yardVal("hull")`);
  const g1 = g.json("GUNS.fire"), impact = 14 * g1.dmg * g1.rpm / 60 * g.run("MOUNT_UPTIME");
  assert.ok(Math.abs(dps - (impact + g.run("BURN_MAX") * g1.burn)) < 1e-6, `dps ${dps}`);
});

test("combat strings exist in both languages", () => {
  const g = boot();
  for (const [f, code] of COMBAT_SRC) g.run(code);
  const en = g.json("Object.keys(STR.en)"), zh = g.json("Object.keys(STR.zh)");
  assert.deepEqual(en.filter(k => !zh.includes(k)), [], "missing in zh");
  assert.deepEqual(zh.filter(k => !en.includes(k)), [], "missing in en");
});

test("salvage scooped from a wreck but never sold goes back to sea on the next load", () => {
  const g = loadWith({ wrecks: [{ x: 100, y: 100, value: 5 }], salvage: [{ x: 200, y: 300, value: 80 }, { x: "bad" }] });
  assert.deepEqual(g.json("save.wrecks"), [{ x: 100, y: 100, value: 5 }, { x: 200, y: 300, value: 80 }]);
  assert.deepEqual(g.json("save.salvage"), []);
});
