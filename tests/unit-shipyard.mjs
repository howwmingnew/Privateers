// Unit tests for the shipyard (js/shipyard.js): one save entry per ship bought, switching keeps each ship's upgrades,
// guns move aboard and spill into the store, old saves migrate. Usage: node --test tests/unit-shipyard.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/data.js", "js/save.js", "js/shipyard.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const KEY = "privateers-save-v2";

function boot(seed = {}) {
  const store = new Map(Object.entries(seed)), domReady = [];
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: { language: "en-US" },
    document: { addEventListener: (type, fn) => { if (type === "DOMContentLoaded") domReady.push(fn); } },
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout,
  });
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  domReady.forEach(fn => fn());   // late modules' sanitizers run once every script has loaded, as on the page
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}
const G = (g, lv = 1) => ({ g, lv });
const oldSave = o => JSON.stringify({ v: 2, gold: 0, ship: "sloop", hull: 1, sails: 1, hold: 1,
  bow: [G("six")], left: [G("six")], right: [G("six")], stern: [], store: [], sunk: 0, wrecks: [], salvage: [], ...o });

test("an old save's ship and upgrades become the yard's first ship", () => {
  const g = boot({ [KEY]: oldSave({ ship: "brig", hull: 4, sails: 3, hold: 2, gold: 50 }) });
  assert.deepEqual(g.json("[save.shipId, save.ship, save.hull, save.sails, save.hold, save.fleet, save.shipSeq]"), ["s1", "brig", 4, 3, 2, [], 2]);
  assert.deepEqual(g.json("ownedShips()"), [{ id: "s1", ship: "brig", hull: 4, sails: 3, hold: 2 }]);
});

test("a fresh game starts with one sloop and an empty yard", () => {
  const g = boot();
  assert.deepEqual(g.json("[save.shipId, save.fleet, save.shipSeq]"), ["s1", [], 2]);
});

test("buying a ship costs full price, keeps the old ship and its upgrades, and the new one starts at Lv 1", () => {
  const g = boot();
  g.run(`save = fitMounts({ ...defaultSave(), gold: 9999, hull: 5, sails: 4, hold: 3 }); save = buyShip(save, "schooner")`);
  assert.equal(g.run("save.gold"), 9999 - g.run("SHIPS.schooner.cost"));
  assert.deepEqual(g.json("[save.ship, save.hull, save.sails, save.hold, save.shipId]"), ["schooner", 1, 1, 1, "s2"]);
  assert.deepEqual(g.json("save.fleet"), [{ id: "s1", ship: "sloop", hull: 5, sails: 4, hold: 3 }]);
});

test("buying the same model twice gives two ships, each with its own id and upgrades", () => {
  const g = boot();
  g.run(`save = fitMounts({ ...defaultSave(), gold: 99999 }); save = buyShip(save, "brig"); save = { ...save, hull: 6 };
    save = buyShip(save, "brig"); save = { ...save, sails: 3 }`);
  const owned = g.json("ownedShips()");
  assert.deepEqual(owned.map(e => [e.id, e.ship, e.hull, e.sails]), [["s1", "sloop", 1, 1], ["s2", "brig", 6, 1], ["s3", "brig", 1, 3]]);
  assert.equal(g.run("save.gold"), 99999 - 2 * g.run("SHIPS.brig.cost"), "the second brig is full price too");
  // switching to the first brig and back keeps both ships' own levels
  g.run(`save = switchShip(save, "s2")`);
  assert.deepEqual(g.json("[save.shipId, save.hull, save.sails]"), ["s2", 6, 1]);
  g.run(`save = switchShip(save, "s3")`);
  assert.deepEqual(g.json("[save.shipId, save.hull, save.sails]"), ["s3", 1, 3]);
  assert.deepEqual(g.json("ownedShips().map(e => [e.id, e.hull, e.sails])"), [["s1", 1, 1], ["s2", 6, 1], ["s3", 1, 3]]);
});

test("switching is free and buying fails without the gold or past the yard's limit", () => {
  const g = boot();
  g.run(`save = fitMounts({ ...defaultSave(), gold: 100 })`);
  assert.equal(g.run(`buyShip(save, "frigate")`), null, "not enough gold");
  assert.equal(g.run(`buyShip(save, "galleon")`), null, "no such model");
  assert.equal(g.run(`switchShip(save, "s9")`), null, "no such ship");
  g.run(`save = { ...save, gold: 1e9 }; for (let i = 0; i < FLEET_MAX - 1; i++) save = buyShip(save, "schooner")`);
  assert.equal(g.run("ownedShips().length"), g.run("FLEET_MAX"));
  assert.equal(g.run(`buyShip(save, "schooner")`), null, "yard full");
  g.run(`save = switchShip(save, "s1")`);
  assert.equal(g.run(`buyShip({ ...save, fleet: [], gold: 1e9 }, "sloop")`), null, "the free sloop is not for sale");
  const gold = g.run("save.gold");
  g.run(`save = switchShip(save, "s2")`);
  assert.equal(g.run("save.gold"), gold, "switching costs nothing");
});

test("cannons move aboard on a switch; the ones with no port go back to the store", () => {
  const g = boot();
  g.run(`save = fitMounts({ ...defaultSave(), gold: 99999, ship: "frigate", bow: [G("long12", 2), G("six")], left: [G("six"), G("six"), G("carronade", 3), G("six"), G("six")] })`.replace(/G\(/g, "gunItem("));
  const total = g.run("allGuns().length");
  g.run(`save = buyShip(save, "schooner")`);   // the schooner has fewer ports: the frigate's extra guns spill
  assert.equal(g.run("allGuns().length"), total, "no gun lost");
  assert.ok(g.run("save.store.length") > 0, "extras are in the store");
  assert.equal(g.run("save.left.length"), g.run("SHIPS.schooner.slots.left"));
  g.run(`save = switchShip(save, "s1")`);   // back on the frigate: more ports than guns, new ports empty
  assert.equal(g.run("allGuns().length"), total, "no gun lost on the way back either");
  assert.equal(g.run("save.left.length"), g.run("SHIPS.frigate.slots.left"));
  assert.ok(g.run("save.left.some(x => x === null) || save.bow.some(x => x === null) || save.right.some(x => x === null)"), "the added ports start empty");
});

test("a damaged yard in the save is cleaned: bad ids, duplicates, unknown models, wild levels, the active ship twice", () => {
  const g = boot({ [KEY]: oldSave({ ship: "brig", shipId: "s4", shipSeq: 1, fleet: [
    { id: "s4", ship: "sloop", hull: 2 }, { id: "s2", ship: "frigate", hull: 99, sails: -5, hold: "3" }, { id: "s2", ship: "sloop" },
    { id: "bad", ship: "sloop" }, { id: "s3", ship: "galleon" }, null, "x", { id: "__proto__", ship: "sloop" }] }) });
  assert.deepEqual(g.json("save.fleet"), [{ id: "s2", ship: "frigate", hull: 15, sails: 1, hold: 3 }]);
  assert.equal(g.run("save.shipId"), "s4");
  assert.equal(g.run("save.shipSeq"), 5, "the next id is past every id in use");
  assert.deepEqual(g.json("sanitizeSave(save)"), g.json("save"), "idempotent");
});

test("a save with a bad shipId gets s1; the yard never holds more than FLEET_MAX ships", () => {
  const fleet = Array.from({ length: 30 }, (_, i) => ({ id: "s" + (i + 2), ship: "sloop", hull: 1, sails: 1, hold: 1 }));
  const g = boot({ [KEY]: oldSave({ shipId: 7, fleet }) });
  assert.equal(g.run("save.shipId"), "s1");
  assert.equal(g.run("save.fleet.length + 1"), g.run("FLEET_MAX"));
});

test("shipyard strings exist in both languages", () => {
  const g = boot();
  const en = g.json("Object.keys(STR.en)"), zh = g.json("Object.keys(STR.zh)");
  assert.deepEqual(en.filter(k => !zh.includes(k)), []);
  assert.deepEqual(zh.filter(k => !en.includes(k)), []);
});
