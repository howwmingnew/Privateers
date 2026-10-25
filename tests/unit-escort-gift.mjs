// Unit tests for the first-escort gift (js/escort-gift.js, #101): what the first bounty hands over, idempotence, the full yard, old saves,
// the save flag's validation, the slot's total cost, the escort's estimated output and the strings in both languages.
// Usage: node --test tests/unit-escort-gift.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/save-campaign.js", "js/shipyard.js",
  "js/escorts.js", "js/escort-gift.js", "js/gunbay.js", "js/archetypes.js", "js/fleet.js"];
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
  vm.runInContext("var portMsg = null; var renderPort = () => {};", ctx);
  domReady.forEach(fn => fn());
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}
const withSave = (extra = {}) => boot({ [KEY]: JSON.stringify({ v: 2, gold: 100, campaign: { bounty: 1 }, ...extra }) });

test("bounty 1 on a new save: slot 1 free, a Lv 1 sloop in it, a new Lv 1 6-pounder in every port, deployed on Normal", () => {
  const g = withSave();
  const r = g.json("giftEscort(save)");
  assert.equal(r.outcome, "given");
  const s = r.save;
  assert.equal(s.escortGift, "given");
  assert.equal(s.gold, 100, "free: no gold spent");
  assert.equal(s.escorts.length, 1);
  const e = s.escorts[0], ship = s.fleet.find(x => x.id === e.id);
  assert.ok(ship && ship.ship === "sloop" && ship.hull === 1 && ship.sails === 1 && ship.hold === 1);
  assert.equal(e.on, true); assert.equal(e.stance, "normal"); assert.equal(e.owed, 0);
  assert.deepEqual(e.guns, { bow: [{ g: "six", lv: 1 }], left: [{ g: "six", lv: 1 }], right: [{ g: "six", lv: 1 }], stern: [] });
  assert.ok(s.shipSeq > Number(e.id.slice(1)), "the id counter moved past the gift");
  assert.equal(g.run("escortReady(giftEscort(save).save, 0)"), true);
});

test("the gift is new guns: the flagship's and the store's are untouched, and allGuns counts them", () => {
  const g = withSave({ store: [{ g: "long12", lv: 3 }] });
  const before = g.run("allGuns(save).length"), after = g.run("allGuns(giftEscort(save).save).length");
  assert.equal(after, before + 3);
  assert.deepEqual(g.json("giftEscort(save).save.store"), [{ g: "long12", lv: 3 }]);
  assert.deepEqual(g.json("giftEscort(save).save.bow"), g.json("save.bow"));
});

test("pure and idempotent: the old save is untouched, a second call changes nothing", () => {
  const g = withSave();
  const old = g.run("JSON.stringify(save)");
  g.run("var r1 = giftEscort(save)");
  assert.equal(g.run("JSON.stringify(save)"), old, "save not mutated");
  assert.equal(g.run("r1.save !== save"), true);
  assert.equal(g.run("giftEscort(r1.save).outcome"), "");
  assert.equal(g.run("giftEscort(r1.save).save === r1.save"), true);
  assert.equal(g.run("giftEscort(giftEscort(r1.save).save).save.escorts.length"), 1);
});

test("nothing before bounty 1", () => {
  const g = withSave({ campaign: { bounty: 0 } });
  assert.equal(g.run("giftEscort(save).outcome"), "");
  assert.equal(g.run("giftEscort(save).save.escorts.length"), 0);
});

test("an old save that already bought a slot: flag only, no ship, no free second slot", () => {
  const g = withSave({ escorts: [{ id: "" }] });
  const r = g.json("giftEscort(save)");
  assert.equal(r.outcome, "had");
  assert.equal(r.save.escortGift, "had");
  assert.equal(r.save.escorts.length, 1);
  assert.equal(r.save.fleet.length, g.run("save.fleet.length"));
});

test("a full yard: no ship, but slot 1 opens free and empty, once", () => {
  const fleet = Array.from({ length: 11 }, (_, i) => ({ id: "s" + (i + 2), ship: "sloop", hull: 1, sails: 1, hold: 1 }));
  const g = withSave({ fleet, shipSeq: 20 });
  const r = g.json("giftEscort(save)");
  assert.equal(r.outcome, "full");
  assert.equal(r.save.escortGift, "full");
  assert.equal(r.save.fleet.length, 11, "no ship added");
  assert.equal(r.save.escorts.length, 1);
  assert.equal(r.save.escorts[0].id, "");
  assert.equal(g.run("giftEscort(giftEscort(save).save).outcome"), "");
});

test("a flagship that is not the sloop still gets a sloop escort with a fresh id", () => {
  const g = withSave({ ship: "schooner", shipId: "s2", shipSeq: 3, fleet: [{ id: "s1", ship: "sloop", hull: 2, sails: 1, hold: 1 }] });
  const s = g.json("giftEscort(save).save");
  assert.equal(s.escorts[0].id, "s3");
  assert.deepEqual(s.fleet.map(x => x.id).sort(), ["s1", "s3"]);
  assert.equal(new Set([s.shipId, ...s.fleet.map(x => x.id)]).size, 3, "ids are unique");
});

test("the save flag: kept when valid, cleaned when not, empty by default; the fields survive a reload", () => {
  for (const v of ["given", "full", "had"]) assert.equal(withSave({ escortGift: v }).run("save.escortGift"), v);
  for (const v of ["yes", 5, null, {}, "__proto__"]) assert.equal(withSave({ escortGift: v }).run("save.escortGift"), "");
  assert.equal(boot().run("defaultSave().escortGift"), "");
  const g = withSave();
  g.run("save = giftEscort(save).save");
  assert.equal(g.run("sanitizeSave(JSON.parse(JSON.stringify(save))).escorts[0].guns.bow.length"), 1);
  assert.equal(g.run("sanitizeSave(JSON.parse(JSON.stringify(save))).escortGift"), "given");
});

test("the slot's total cost line: slot + the cheapest ship the yard sells + the gun price", () => {
  const g = withSave({ campaign: { bounty: 1, ships: ["schooner"] } });
  const c = g.json("escortStartCost(1)");
  const price = g.run("escortPrice(1)"), cost = g.run("SHIPS[cheapestShip()].cost");
  assert.ok(cost > 0);
  assert.equal(c.t, String(price + cost).replace(/\B(?=(\d{3})+(?!\d))/g, ","), "total is the slot plus the ship");
  assert.equal(g.run("SHIPS[cheapestShip()].cost <= Math.min(...Object.keys(SHIPS).filter(forSale).map(id => SHIPS[id].cost))"), true);
});

test("estimated output: the escort's is 80% of the same guns on the flagship, and an empty escort is zero", () => {
  const g = withSave();
  const main = g.run("flagshipDps()"), esc = g.run("escortDps('sloop', giftEscort(save).save.escorts[0].guns)");
  assert.ok(main > 0);
  assert.ok(Math.abs(esc / main - g.run("ESCORT_FIRE")) < 1e-6, `${esc} / ${main}`);
  assert.equal(g.run("escortDps('sloop', emptyGuns('sloop'))"), 0);
  // 3 x 6-pounder: 10 dmg x 36 rpm / 60 = 6 damage/s per gun
  assert.ok(Math.abs(main - 18) < 1e-6, `flagship ${main}`);
});

test("strings: every key in English and Traditional Chinese", () => {
  const g = boot();
  for (const k of ["pBonus", "pGift", "giftDone", "giftFull", "giftToast", "giftToastFull", "giftGo", "escCost", "escDps", "buyShort"]) {
    assert.equal(typeof g.run(`STR.en.${k}`), "string", "en " + k);
    assert.equal(typeof g.run(`STR.zh.${k}`), "string", "zh " + k);
    assert.ok(/[一-鿿]/.test(g.run(`STR.zh.${k}`)), "zh " + k + " is Chinese");
  }
});
