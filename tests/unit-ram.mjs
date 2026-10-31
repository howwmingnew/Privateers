// Unit tests for the bow ram (#149, js/ram.js and the hitOf wiring in js/collision.js): the damage coefficients, the purchase rule, and the save
// (an old save loads without a ram, the field survives a round trip and a hand-edited value is cleaned). Usage: node --test tests/unit-ram.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/collision.js", "js/ram.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const KEY = "privateers-save-v2";
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

function boot(seed = {}) {
  const store = new Map(Object.entries(seed)), domReady = [];
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: { language: "en-US" }, Map, Math,
    document: { addEventListener: (type, fn) => { if (type === "DOMContentLoaded") domReady.push(fn); } },
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout,
  });
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  domReady.forEach(fn => fn());
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}
const oldSave = o => JSON.stringify({ v: 2, gold: 0, ship: "sloop", hull: 1, sails: 1, hold: 1,
  bow: [{ g: "six", lv: 1 }], left: [{ g: "six", lv: 1 }], right: [{ g: "six", lv: 1 }], stern: [], store: [], sunk: 0, wrecks: [], salvage: [], ...o });

test("coefficients: +50% outgoing, -30% incoming, both in js/config.js", () => {
  const g = boot();
  near(g.run("RAM_OUT_K"), 1.5);
  near(g.run("RAM_SELF_K"), 0.7);
  assert.deepEqual(g.json("ramPct()"), { o: 50, s: 30 });
});

test("ramHitK: with no ram every blow is unchanged", () => {
  const g = boot();
  assert.equal(g.run("ramHitK(false, { isPlayer: true }, {})"), 1);
  assert.equal(g.run("ramHitK(false, {}, { isPlayer: true })"), 1);
  assert.equal(g.run("ramHitK(false, { isPlayer: true }, null)"), 1);
});

test("ramHitK: the flagship takes 0.7x from a ship or an island, a ship it rams takes 1.5x, others are untouched", () => {
  const g = boot();
  near(g.run("ramHitK(true, { isPlayer: true }, {})"), 0.7);      // rammed by / ramming another ship: the flagship's own hull
  near(g.run("ramHitK(true, { isPlayer: true }, null)"), 0.7);    // an island
  near(g.run("ramHitK(true, {}, { isPlayer: true })"), 1.5);      // the other ship in a collision with the flagship
  assert.equal(g.run("ramHitK(true, {}, {})"), 1);                // two AI hulls: the ram is not theirs
  assert.equal(g.run("ramHitK(true, { ally: true }, {})"), 1);    // an escort never wears it
  assert.equal(g.run("ramHitK(true, {}, null)"), 1);              // an AI against a rock
});

test("hitOf reads save.ram: the real crash damage of one blow moves by exactly the coefficients", () => {
  const g = boot();
  const player = "{ isPlayer: true }", foe = "{}", base = 0.2, maxHp = 100;
  const dmg = (who, other) => g.run(`crashDamage(${base} * hitOf(${who}, ${other}), ${maxHp}, ${maxHp})`);
  g.run("save.ram = false");
  const plainOut = dmg(foe, player), plainSelf = dmg(player, foe), plainRock = g.run(`crashDamage(0.08 * hitOf(${player}, null), ${maxHp}, ${maxHp})`);
  g.run("save.ram = true");
  near(dmg(foe, player), plainOut * 1.5);     // what the ship you ram takes
  near(dmg(player, foe), plainSelf * 0.7);    // what your own hull takes from the same blow
  near(g.run(`crashDamage(0.08 * hitOf(${player}, null), ${maxHp}, ${maxHp})`), plainRock * 0.7);   // and from an island
});

test("the ram multiplies the CRASH_*_K blow and adds nothing from speed: a faster hull is still capped at CRASH_OVER_MAX", () => {
  const g = boot();
  g.run("save.ram = true");
  const slow = g.run("shipFrac(CRASH_FULL_V) * hitOf({}, { isPlayer: true })"), fast = g.run("shipFrac(9999) * hitOf({}, { isPlayer: true })");
  near(slow, g.run("CRASH_SHIP_K") * 1.5);
  near(fast, g.run("CRASH_SHIP_K * CRASH_OVER_MAX") * 1.5);   // no wind or speed bonus beyond the existing cap
});

test("buyRam: costs RAM_PRICE once, refuses without the gold or when already fitted, and does not mutate the save", () => {
  const g = boot();
  const price = g.run("RAM_PRICE");
  assert.ok(price > g.run("CONFIRM_GOLD"), "the price takes the second tap");
  assert.equal(g.run("buyRam({ gold: RAM_PRICE - 1, ram: false })"), null);
  assert.equal(g.run("buyRam({ gold: 9999, ram: true })"), null);
  const out = g.json("(() => { const s = { gold: RAM_PRICE + 5, ram: false }; const n = buyRam(s); return [n, s]; })()");
  assert.deepEqual(out[0], { gold: 5, ram: true });
  assert.deepEqual(out[1], { gold: price + 5, ram: false });
});

test("a fresh game has no ram", () => {
  assert.equal(boot().run("save.ram"), false);
});

test("an old save (no ram field) loads as having no ram, and the rest of it is untouched", () => {
  const g = boot({ [KEY]: oldSave({ gold: 321, hull: 3 }) });
  assert.equal(g.run("save.ram"), false);
  assert.deepEqual(g.json("[save.gold, save.hull]"), [321, 3]);
});

test("a save with a ram keeps it through load and persist", () => {
  const g = boot({ [KEY]: oldSave({ ram: true }) });
  assert.equal(g.run("save.ram"), true);
  g.run("persist()");
  const again = boot({ [KEY]: g.run("localStorage.getItem(SAVE_KEY)") });
  assert.equal(again.run("save.ram"), true);
});

test("a hand-edited ram value is cleaned: only a true boolean counts", () => {
  for (const bad of ["yes", 1, "true", {}, [], null]) assert.equal(boot({ [KEY]: oldSave({ ram: bad }) }).run("save.ram"), false, JSON.stringify(bad));
});

test("the ledger strings exist in both languages", () => {
  const g = boot();
  for (const k of ["ramName", "ramOwned", "ramFit", "ramNeed", "ramArm", "ramDs", "ramGain", "ramHave", "ramBought"]) {
    assert.equal(g.run(`typeof STR.en.${k}`), "string", "en " + k);
    assert.equal(g.run(`typeof STR.zh.${k}`), "string", "zh " + k);
  }
});
