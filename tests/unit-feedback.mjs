// Unit tests for the phase-1 feedback fixes (#68 gun bay moves + x5 upgrade, #69 grapple pull, #71 bosses left alone, #72 owned ships,
// #73 sticky ledger gold). Pure functions only; scripts load into one node:vm context, as in tests/unit-rematch.mjs.
// Usage: node --test tests/unit-feedback.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/save-campaign.js",
  "js/archetypes.js", "js/ledger-gold.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
const ctx = vm.createContext({
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
  console: { log() {}, warn() {}, error: (...a) => { throw new Error(a.join(" ")); } }, setTimeout, clearTimeout, performance,
});
for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);

// ---------- #71: bosses and their guards are left to the player ----------
test("#71 bossFeud: other AI never target a boss or guard, and they pick no other AI", () => {
  const boss = "{ boss: 'ned' }", guard = "{ escortOf: 'ned' }", other = "{ faction: 'navy' }", rematch = "{ boss: 'ned', rematch: true }";
  for (const b of [boss, guard, rematch]) {
    assert.equal(run(`bossFeud(${other}, ${b})`), true, "an AI aiming at a boss-side ship is refused");
    assert.equal(run(`bossFeud(${b}, ${other})`), true, "a boss-side ship aiming at an AI is refused");
  }
});

test("#71 bossFeud: the player, the player's escorts and the boss's own side stay fair", () => {
  assert.equal(run("bossFeud({ boss: 'ned' }, { isPlayer: true })"), false);
  assert.equal(run("bossFeud({ isPlayer: true }, { boss: 'ned' })"), false);
  assert.equal(run("bossFeud({ boss: 'ned' }, { ally: true })"), false, "a boss may fight the player's escorts");
  assert.equal(run("bossFeud({ ally: true }, { escortOf: 'ned' })"), false, "and the escorts may fight the boss's guard");
  assert.equal(run("bossFeud({ boss: 'ned' }, { escortOf: 'ned' })"), false, "a boss and its guard are one side");
  assert.equal(run("bossFeud({ faction: 'navy' }, { faction: 'pirate' })"), false, "ordinary AI feuds are untouched");
  assert.equal(run("bossFeud(null, { boss: 'ned' })"), false);
});

// ---------- #72: every ship ever owned, the starter sloop included, is in the yard and switched to for free ----------
const KEY = "privateers-save-v2";
function bootYard(seed = {}) {
  const store = new Map(Object.entries(seed)), domReady = [];
  const c = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: { language: "en-US" }, document: { addEventListener: (type, fn) => { if (type === "DOMContentLoaded") domReady.push(fn); } },
    console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
  });
  for (const f of ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/data.js", "js/save.js", "js/shipyard.js"])
    vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), c, { filename: f });
  domReady.forEach(fn => fn());   // late sanitizers run once every script has loaded, as on the page
  return { run: code => vm.runInContext(code, c), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, c)) };
}
const oldSave = o => JSON.stringify({ v: 2, gold: 0, ship: "sloop", hull: 1, sails: 1, hold: 1, bow: [{ g: "six", lv: 1 }], left: [], right: [], stern: [], store: [], sunk: 0, wrecks: [], salvage: [], ...o });

test("#72 the starter sloop swaps back free after every kind of ship is bought", () => {
  const g = bootYard();
  const models = g.json("SHIP_ORDER.filter(forSale)");
  assert.ok(models.length >= 8, "the whole line-up (#64) is for sale: " + models);
  g.run("save = fitMounts({ ...defaultSave(), gold: 9999999 })");
  for (const m of models) g.run(`save = buyShip(save, ${JSON.stringify(m)})`);
  assert.equal(g.json("ownedShips().length"), models.length + 1);
  assert.ok(g.json("ownedShips().some(e => e.ship === 'sloop' && e.id === 's1')"), "the sloop is in the owned list");
  const gold = g.run("save.gold");
  for (const id of g.json("ownedShips().map(e => e.id)")) {   // every ship ever owned: one free switch each, the pay-nothing rule holds
    g.run(`save = switchShip(save, ${JSON.stringify(id)})`);
    assert.equal(g.run("save.shipId"), id);
    assert.equal(g.run("save.gold"), gold, "switching to " + id + " costs nothing");
  }
  assert.equal(g.json("save.ship"), g.json("ownedShips().at(-1).ship"));
});

test("#72 a sloop that was upgraded keeps its levels on the round trip", () => {
  const g = bootYard();
  g.run(`save = fitMounts({ ...defaultSave(), gold: 99999, hull: 5, sails: 4, hold: 3 }); save = buyShip(save, "schooner"); save = switchShip(save, "s1")`);
  assert.deepEqual(g.json("[save.ship, save.hull, save.sails, save.hold]"), ["sloop", 5, 4, 3]);
});

test("#72 an old save that lost its starter gets a free sloop in the yard, once", () => {
  const g = bootYard({ [KEY]: oldSave({ ship: "brig", hull: 4, sails: 3, hold: 2 }) });
  assert.deepEqual(g.json("ownedShips().map(e => [e.id, e.ship])"), [["s1", "brig"], ["s2", "sloop"]]);
  assert.equal(g.run("save.gold"), 0);
  g.run(`save = switchShip(save, "s2")`);
  assert.deepEqual(g.json("[save.ship, save.shipId, save.gold]"), ["sloop", "s2", 0], "free, with no gold in the purse");
  assert.deepEqual(g.json("sanitizeSave(save)"), g.json("save"), "idempotent: reloading adds no second sloop");
  assert.equal(g.json("ownedShips().filter(e => e.ship === 'sloop').length"), 1);
});

test("#72 a save whose yard is full still gets its sloop back; a sloop already owned is never duplicated", () => {
  const fleet = Array.from({ length: 30 }, (_, i) => ({ id: "s" + (i + 2), ship: "brig", hull: 1, sails: 1, hold: 1 }));
  const g = bootYard({ [KEY]: oldSave({ ship: "frigate", fleet }) });
  assert.ok(g.json("ownedShips().some(e => e.ship === 'sloop')"));
  const h = bootYard({ [KEY]: oldSave({ ship: "brig", fleet: [{ id: "s2", ship: "sloop", hull: 3, sails: 1, hold: 1 }], shipSeq: 3 }) });
  assert.deepEqual(h.json("ownedShips().map(e => [e.id, e.ship, e.hull])"), [["s1", "brig", 1], ["s2", "sloop", 3]]);
});

test("#72 the sloop is not for sale, and the owned-model strings exist in both languages", () => {
  const g = bootYard();
  assert.equal(g.run("forSale('sloop')"), false);
  for (const k of ["ownedHint", "buyAnother"]) assert.ok(g.run(`STR.en.${k} && STR.zh.${k}`), k);
});

// ---------- #73: the purse number rolls to its new value ----------
test("#73 goldRoll eases from the old figure to the new one, spending or earning, and clamps its input", () => {
  assert.equal(run("goldRoll(5000, 4600, 0)"), 5000);
  assert.equal(run("goldRoll(5000, 4600, 1)"), 4600);
  assert.equal(run("goldRoll(100, 900, 1.7)"), 900, "past the end stays on the new figure");
  assert.equal(run("goldRoll(100, 900, -3)"), 100, "before the start stays on the old figure");
  const mid = run("goldRoll(0, 1000, 0.5)");
  assert.ok(mid > 500 && mid < 1000, "eases out: more than halfway at the halfway mark (" + mid + ")");
  const down = run("goldRoll(1000, 0, 0.5)");
  assert.ok(down < 500 && down > 0, "and the same going down (" + down + ")");
  assert.equal(run("Number.isInteger(goldRoll(7, 12, 0.33))"), true);
});
