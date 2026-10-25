// Unit tests for the escort fleet (js/escorts.js): slot unlocks and prices, buying and assigning, the repair bill, the 80% firepower,
// guns built from the yard ship, the save's validation and old-save compatibility, strings in both languages.
// Usage: node --test tests/unit-escorts.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/save-campaign.js", "js/shipyard.js",
  "js/escorts.js", "js/archetypes.js", "js/fleet.js"];
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
  domReady.forEach(fn => fn());
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const YARD2 = [{ id: "s1", ship: "sloop", hull: 2, sails: 1, hold: 1 }, { id: "s3", ship: "brig", hull: 1, sails: 1, hold: 1 }, { id: "s4", ship: "frigate", hull: 3, sails: 2, hold: 1 }];
const withSave = (extra = {}) => boot({ [KEY]: JSON.stringify({ v: 2, gold: 10000, campaign: { bounty: 4 }, ship: "schooner", shipId: "s2", shipSeq: 5, fleet: YARD2, ...extra }) });

test("slots: four, priced 200 / 800 / 2000 / 5000, slot n opens with bounty n", () => {
  const g = boot();
  assert.deepEqual(g.json("ESCORT_PRICES"), [200, 800, 2000, 5000]);
  assert.equal(g.run("ESCORT_SLOTS"), 4);
  for (const [bounty, open] of [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 4]]) {
    assert.deepEqual(g.json(`[0, 1, 2, 3, 4].map(i => escortOpen({ campaign: { bounty: ${bounty} } }, i))`), [0, 1, 2, 3, 4].map(i => i < open), `bounty ${bounty}`);
  }
});

test("buying: costs the price, needs the bounty and the gold, goes in order, never past four", () => {
  const g = withSave({ campaign: { bounty: 2 }, gold: 1000 });
  g.run("var s0 = save");
  assert.equal(g.run("buyEscortSlot({ ...s0, gold: 199 })"), null);
  assert.equal(g.run("buyEscortSlot({ ...s0, campaign: { ...s0.campaign, bounty: 0 } })"), null);
  const s1 = g.json("buyEscortSlot(s0)");
  assert.equal(s1.gold, 800); assert.equal(s1.escorts.length, 1);
  assert.deepEqual(s1.escorts[0], { id: "", on: true, stance: "normal", gun: "six", owed: 0 });
  const s2 = g.json("buyEscortSlot(buyEscortSlot(s0))");
  assert.equal(s2.gold, 1000 - 200 - 800);
  assert.equal(g.run("buyEscortSlot(buyEscortSlot(buyEscortSlot(s0)))"), null, "slot 3 needs bounty 3");
  const full = withSave({ campaign: { bounty: 5 }, gold: 99999, escorts: [{}, {}, {}, {}] });
  assert.equal(full.run("buyEscortSlot(save)"), null);
});

test("assigning: only a spare yard ship, never the flagship, never one twice", () => {
  const g = withSave({ escorts: [{ id: "s1" }, { id: "" }] });
  assert.equal(g.run("save.escorts[0].id"), "s1");
  assert.equal(g.run("setEscort(save, 1, { id: 's1' })"), null, "already in slot 1");
  assert.equal(g.run("setEscort(save, 1, { id: 's2' })"), null, "s2 is the ship you sail");
  assert.equal(g.run("setEscort(save, 1, { id: 's9' })"), null, "no such ship");
  assert.equal(g.run("setEscort(save, 1, { id: 's3' }).escorts[1].id"), "s3");
  assert.equal(g.run("setEscort(save, 0, { id: '' }).escorts[0].id"), "");
  assert.deepEqual(g.json("escortCandidates(save, 1).map(x => x.id)"), ["s3", "s4"]);
  assert.deepEqual(g.json("escortCandidates(save, 0).map(x => x.id)"), ["s1", "s3", "s4"]);
  assert.equal(g.run("setEscort(save, 7, { on: false })"), null);
});

test("flagship swap: a slot whose ship became the flagship is not ready, and sails again once reassigned", () => {
  const g = withSave({ escorts: [{ id: "s1" }] });
  assert.equal(g.run("escortReady(save, 0)"), true);
  assert.equal(g.run("escortReady(switchShip(save, 's1'), 0)"), false);
  assert.equal(g.run("escortReady(setEscort(save, 0, { on: false }), 0)"), false);
  assert.equal(g.run("escortReady({ ...save, escorts: [{ ...save.escorts[0], owed: 5 }] }, 0)"), false);
});

test("stance and gun: only the three stances; a gun type you own", () => {
  const g = withSave({ escorts: [{ id: "s1" }], store: [{ g: "long12", lv: 4 }, { g: "long12", lv: 2 }], bow: [{ g: "carronade", lv: 3 }] });
  for (const st of ["active", "normal", "passive"]) assert.equal(g.run(`setEscort(save, 0, { stance: '${st}' }).escorts[0].stance`), st);
  assert.equal(g.run("setEscort(save, 0, { stance: 'berserk' })"), null);
  assert.deepEqual(g.json("escortGunTypes(save)"), ["six", "long12", "carronade"]);
  assert.equal(g.run("escortGunLv(save, 'long12')"), 4, "the best level of the type, in the store or on a port");
  assert.equal(g.run("setEscort(save, 0, { gun: 'fire' })"), null, "never bought");
  assert.equal(g.run("setEscort(save, 0, { gun: 'carronade' }).escorts[0].gun"), "carronade");
  assert.equal(g.run("escortGunOf(save, { gun: 'fire' })"), "six", "a type no longer owned falls back");
});

test("repair bill: up to 10% of the base price by hull lost; sunk 15% (min 30); the free sloop mends free", () => {
  const g = boot();
  near(g.run("escortFee(2000, 1, false)"), 0);
  near(g.run("escortFee(2000, 0.5, false)"), 100);
  near(g.run("escortFee(2000, 0.0001, false)"), 200, 1);
  assert.equal(g.run("escortFee(2000, 0, false)"), 200, "all hull gone but afloat is the 10% cap");
  assert.equal(g.run("escortFee(2000, 0, true)"), 300);
  assert.equal(g.run("escortFee(0, 0.2, false)"), 0, "the sloop costs 0 to mend");
  assert.equal(g.run("escortFee(0, 0, true)"), 30, "sunk: never less than 30");
  assert.equal(g.run("escortFee(100, 0, true)"), 30);
  assert.equal(g.run("escortFee(400, 0, true)"), 60);
  assert.equal(g.run("escortFee(16000, 0, false)"), 1600);
});

test("billing: paid from gold as far as it goes, the rest owed; paying clears it", () => {
  const g = withSave({ gold: 100, escorts: [{ id: "s3" }, { id: "s4" }] });   // brig 2000 -> sunk 300; frigate 6000 -> hurt
  const out = g.json("billEscorts(save, [{ slot: 0, hpFrac: 0, sunk: true }, { slot: 1, hpFrac: 0.5, sunk: false }])");
  assert.equal(out.paid, 100); assert.equal(out.save.gold, 0);
  assert.equal(out.save.escorts[0].owed + out.save.escorts[1].owed, 300 + 300 - 100);
  const rich = withSave({ gold: 1000, escorts: [{ id: "s3" }, { id: "s4" }] });
  const ok = rich.json("billEscorts(save, [{ slot: 0, hpFrac: 0.5, sunk: false }])");
  assert.equal(ok.paid, 100); assert.equal(ok.save.gold, 900); assert.equal(ok.save.escorts[0].owed, 0);
  assert.equal(g.run("payEscort(save, 0)"), null, "nothing owed");
  const owing = withSave({ gold: 500, escorts: [{ id: "s3", owed: 300 }] });
  assert.equal(owing.run("payEscort({ ...save, gold: 299 }, 0)"), null);
  const paid = owing.json("payEscort(save, 0)");
  assert.equal(paid.gold, 200); assert.equal(paid.escorts[0].owed, 0);
});

test("firepower: an escort's whole cut is 80% of the same ship's guns, reload and aim each taking half", () => {
  const g = boot();
  g.run(`var e = { guns: escortBattery("brig", "long12", 3), aimSpread: 0.2, maxHp: 100, L: 6, vol: {} }; var before = e.aimSpread; fleetFirepower(e, ESCORT_FIRE)`);
  const rate = g.run("Object.values(e.guns).flat().reduce((a, x) => a + x.dmg / (x.interval + VOLLEY_WARN), 0)");
  const main = g.run('mainGunDps("brig", "long12", 3)');
  near(rate / main, Math.sqrt(0.8), 1e-9);                       // the reload half
  near(g.run("e.aimSpread / before"), 1 / Math.sqrt(0.8), 1e-9);  // the aim half
  assert.equal(g.run("e.fireMul"), 0.8);
  near(g.run("Math.sqrt(0.8) * (1 / (e.aimSpread / before))"), 0.8, 1e-9);
  assert.equal(g.run("ESCORT_FIRE"), g.run("FLEET_FIRE"), "the same 80% as an enemy fleet's wingmen");
});

test("battery: every port of the yard ship holds the chosen gun at its level, hull gunK applied; level may exceed the flagship's", () => {
  const g = boot();
  const b = g.json('escortBattery("frigate", "carronade", 5)');
  assert.deepEqual([b.bow.length, b.left.length, b.right.length, b.stern.length], [2, 7, 7, 1]);
  const gun = b.left[0];
  near(gun.dmg, 32 * 1.15 ** 4 * 0.81, 1e-9);
  assert.equal(gun.range, 200); assert.equal(gun.speed, 400);
  assert.ok(gun.interval >= 0.3);
  const fire = g.json('escortBattery("sloop", "fire", 2)');
  assert.ok(fire.left[0].burn > 0, "incendiary guns burn");
  assert.ok(g.json('escortBattery("sloop", "chain", 1)').left[0].chain);
  // a flagship of low level, an escort of a higher ship and gun level
  assert.ok(g.run('mainGunDps("line", "long12", 8)') > g.run('mainGunDps("sloop", "six", 1)') * 20);
});

test("save: bad data is cleaned, at most four slots, no duplicate ship, old saves load with none", () => {
  const junk = [{ id: "s1", on: "yes", stance: "x", gun: "nope", owed: -5 }, { id: "s1" }, "junk", null, { id: "../x", owed: 1e12 }, {}, {}, {}];
  const g = withSave({ escorts: junk });
  const e = g.json("save.escorts");
  assert.equal(e.length, 4);
  assert.deepEqual(e[0], { id: "s1", on: true, stance: "normal", gun: "six", owed: 0 });
  assert.equal(e[1].id, "", "a second claim on s1 is dropped");
  assert.equal(e[2].id, "", "an id that is not a ship id");
  assert.ok(e.every(x => x.owed >= 0 && x.owed <= 1e7));
  const old = boot({ [KEY]: JSON.stringify({ v: 2, gold: 50, ship: "sloop", hull: 2, bow: ["six"], left: ["six"], right: ["six"] }) });
  assert.deepEqual(old.json("save.escorts"), []);
  assert.equal(old.run("save.gold"), 50);
  assert.deepEqual(boot().json("sanitizeSave(defaultSave()).escorts"), [], "a new game, and the daily sea's throwaway save, start with none");
  const asText = boot({ [KEY]: "{\"v\":2,\"escorts\":\"all of them\"}" });
  assert.deepEqual(asText.json("save.escorts"), []);
});

test("save: owning slots does not depend on the bounty count (a New Game+ keeps what was bought)", () => {
  const g = withSave({ campaign: { bounty: 0 }, escorts: [{ id: "s1" }, { id: "s3" }] });
  assert.equal(g.run("save.escorts.length"), 2);
  assert.equal(g.run("escortReady(save, 0)"), true);
});

test("escort strings exist in both languages", () => {
  const g = boot();
  const keys = g.json("Object.keys(STR.en).filter(k => /^(esc|st_|stn_)/.test(k))");
  assert.ok(keys.length >= 30);
  for (const k of keys) assert.ok(g.run(`Object.hasOwn(STR.zh, ${JSON.stringify(k)})`), "zh missing " + k);
  const zh = g.json("Object.keys(STR.zh).filter(k => /^(esc|st_|stn_)/.test(k))");
  for (const k of zh) assert.ok(g.run(`Object.hasOwn(STR.en, ${JSON.stringify(k)})`), "en missing " + k);
});
