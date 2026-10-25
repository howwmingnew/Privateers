// Unit tests for the escort fleet (js/escorts.js): slot unlocks and prices, buying and assigning, the repair bill, the 80% firepower,
// each escort's own gun items (migration, moves between the store, the flagship and an escort, fit-back when the ship changes, allGuns),
// the battery built from them, buying a ship straight into a slot, the save's validation and old-save compatibility, strings in both languages.
// Usage: node --test tests/unit-escorts.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/save-campaign.js", "js/shipyard.js",
  "js/escorts.js", "js/gunbay.js", "js/archetypes.js", "js/fleet.js"];
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
  vm.runInContext("var portMsg = null; var renderPort = () => {};", ctx);   // js/harbor.js owns them (js/gunbay.js calls them)
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
  assert.deepEqual(s1.escorts[0], { id: "", on: true, stance: "normal", guns: { bow: [], left: [], right: [], stern: [] }, owed: 0 });
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

test("stance: only the three stances; the old shared gun type is gone", () => {
  const g = withSave({ escorts: [{ id: "s1" }] });
  for (const st of ["active", "normal", "passive"]) assert.equal(g.run(`setEscort(save, 0, { stance: '${st}' }).escorts[0].stance`), st);
  assert.equal(g.run("setEscort(save, 0, { stance: 'berserk' })"), null);
  assert.equal(g.run("'gun' in save.escorts[0]"), false);
  assert.equal(g.run("typeof escortGunLv + typeof escortGunTypes + typeof escortGunOf"), "undefinedundefinedundefined");
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
  g.run(`var full = (ship, type, lv) => Object.fromEntries(MOUNTS.map(({ key }) => [key, Array.from({ length: SHIPS[ship].slots[key] }, () => gunItem(type, lv))]))`);
  g.run(`var e = { guns: escortBattery("brig", full("brig", "long12", 3)), aimSpread: 0.2, maxHp: 100, L: 6, vol: {} }; var before = e.aimSpread; fleetFirepower(e, ESCORT_FIRE)`);
  const rate = g.run("Object.values(e.guns).flat().reduce((a, x) => a + x.dmg / (x.interval + VOLLEY_WARN), 0)");
  const main = g.run('mainGunDps("brig", "long12", 3)');
  near(rate / main, Math.sqrt(0.8), 1e-9);                       // the reload half
  near(g.run("e.aimSpread / before"), 1 / Math.sqrt(0.8), 1e-9);  // the aim half
  assert.equal(g.run("e.fireMul"), 0.8);
  near(g.run("Math.sqrt(0.8) * (1 / (e.aimSpread / before))"), 0.8, 1e-9);
  assert.equal(g.run("ESCORT_FIRE"), g.run("FLEET_FIRE"), "the same 80% as an enemy fleet's wingmen");
});

test("battery: one gun per gun item, its own type and level, hull gunK applied; an empty port fires nothing", () => {
  const g = boot();
  g.run(`var full = (ship, type, lv) => Object.fromEntries(MOUNTS.map(({ key }) => [key, Array.from({ length: SHIPS[ship].slots[key] }, () => gunItem(type, lv))]))`);
  const b = g.json('escortBattery("frigate", full("frigate", "carronade", 5))');
  assert.deepEqual([b.bow.length, b.left.length, b.right.length, b.stern.length], [2, 7, 7, 1]);
  const gun = b.left[0];
  near(gun.dmg, 32 * 1.15 ** 4 * 0.81, 1e-9);
  assert.equal(gun.range, 200); assert.equal(gun.speed, 400);
  assert.ok(gun.interval >= 0.3);
  const fire = g.json('escortBattery("sloop", full("sloop", "fire", 2))');
  assert.ok(fire.left[0].burn > 0, "incendiary guns burn");
  assert.ok(g.json('escortBattery("sloop", full("sloop", "chain", 1))').left[0].chain);
  assert.equal(g.json('escortBattery("sloop", full("sloop", "chain", 1))').left[0].gt, "chain", "the gun type js/gun-art.js draws");
  // a mixed deck: each port its own gun, empty ports leave no gun
  const mix = g.json('escortBattery("brig", { bow: [gunItem("long12", 3)], left: [gunItem("six", 1), null, gunItem("carronade", 2)], right: [null, null, null], stern: [] })');
  assert.deepEqual([mix.bow.length, mix.left.length, mix.right.length, mix.stern.length], [1, 2, 0, 0]);
  assert.deepEqual(mix.left.map(x => x.gt), ["six", "carronade"]);
  near(mix.bow[0].dmg, 18 * 1.15 ** 2, 1e-9);
  near(mix.left[1].dmg, 32 * 1.15, 1e-9);
  const sixLv1 = g.run('escortBattery("sloop", { bow: [gunItem("six", 1)], left: [], right: [], stern: [] }).bow[0]');
  near(sixLv1.interval, Math.max(0.3, 60 / 36 - 0.6 * Math.sqrt(0.8)), 1e-9);
  // a flagship of low level, an escort of a higher ship and gun level
  assert.ok(g.run('mainGunDps("line", "long12", 8)') > g.run('mainGunDps("sloop", "six", 1)') * 20);
});

test("save: bad data is cleaned, at most four slots, no duplicate ship, old saves load with none", () => {
  const junk = [{ id: "s1", on: "yes", stance: "x", gun: "nope", owed: -5 }, { id: "s1" }, "junk", null, { id: "../x", owed: 1e12 }, {}, {}, {}];
  const g = withSave({ escorts: junk });
  const e = g.json("save.escorts");
  assert.equal(e.length, 4);
  assert.deepEqual(e[0], { id: "s1", on: true, stance: "normal", owed: 0, guns: { bow: [{ g: "six", lv: 1 }], left: [{ g: "six", lv: 1 }], right: [{ g: "six", lv: 1 }], stern: [] } }, "the sloop: a new Lv 1 6-pounder in each of its three ports");
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

// ---------- each escort carries its own gun items ----------
const gunsOf = (g, expr) => g.json(`(${expr}).map(x => x && x.g + x.lv)`);
const place = (side, i, e) => `{ side: "${side}", i: ${i}${e === undefined ? "" : ", e: " + e} }`;

test("migration: an old escort with a ship and no guns gets a NEW Lv 1 6-pounder in every port; one without a ship gets none", () => {
  const g = withSave({ escorts: [{ id: "s4", stance: "active", gun: "carronade", owed: 7 }, { id: "s1", on: false }, { id: "" }] });   // frigate 2/7/7/1, sloop 1/1/1/0
  const e = g.json("save.escorts");
  assert.deepEqual([e[0].guns.bow.length, e[0].guns.left.length, e[0].guns.right.length, e[0].guns.stern.length], [2, 7, 7, 1]);
  assert.ok(Object.values(e[0].guns).flat().every(x => x.g === "six" && x.lv === 1), "Lv 1 6-pounders, not the old shared type");
  assert.equal(e[0].stance, "active"); assert.equal(e[0].owed, 7); assert.equal(e[1].on, false);
  assert.ok(!("gun" in e[0]), "the shared gun field is gone");
  assert.deepEqual(e[2].guns, { bow: [], left: [], right: [], stern: [] });
  assert.equal(g.run("allGuns().length"), 5 + 17 + 3, "the schooner's five (an old save fills every port), the frigate's 17 and the sloop's 3");
  assert.equal(g.run("new Set(save.escorts.flatMap(escortGuns)).size"), 20, "every item is its own object");
  assert.equal(g.run("escortReady({ ...save, escorts: save.escorts.map(e => ({ ...e, owed: 0 })) }, 0)"), true, "armed, so it sails once the debt is paid");
  // idempotent: the migrated save loads as it is, no second set of guns
  const again = boot({ [KEY]: g.run("JSON.stringify(save)") });
  assert.deepEqual(again.json("save.escorts"), e);
  assert.equal(again.run("save.store.length"), g.run("save.store.length"));
});

test("sanitize: guns are cut to the ship's ports, bad items dropped, and a gun with no port goes to the store", () => {
  const guns = { bow: [{ g: "long12", lv: 3 }, { g: "six", lv: 1 }, { g: "chain", lv: 2 }], left: [{ g: "nope", lv: 1 }, "six", null, { g: "fire", lv: 99 }], right: "junk", stern: [{ g: "six", lv: 1 }], turret: [{ g: "six", lv: 1 }] };
  const g = withSave({ escorts: [{ id: "s1", guns }], store: [{ g: "six", lv: 1 }] });   // sloop: bow 1, left 1, right 1, stern 0
  const e = g.json("save.escorts[0].guns");
  assert.deepEqual([e.bow.length, e.left.length, e.right.length, e.stern.length], [1, 1, 1, 0]);
  assert.deepEqual(gunsOf(g, "save.escorts[0].guns.bow"), ["long123"]);
  assert.deepEqual(gunsOf(g, "save.escorts[0].guns.left"), [null], "an unknown type is no gun");
  assert.deepEqual(gunsOf(g, "save.escorts[0].guns.right"), [null]);
  assert.deepEqual(g.json("save.store.map(x => x.g + x.lv)"), ["six1", "six1", "chain2", "six1", "fire10", "six1"], "the store first, then what had no port (bow, left, stern); levels are capped");
  assert.equal(g.run("save.escorts[0].guns.turret"), undefined);
  // a ship that is the flagship, or missing: no ports, every gun to the store
  const lost = withSave({ escorts: [{ id: "s2", guns: { bow: [{ g: "six", lv: 1 }], left: [], right: [], stern: [] } }, { id: "s77", guns: { bow: [{ g: "six", lv: 2 }], left: [], right: [], stern: [] } }] });
  assert.deepEqual(lost.json("save.escorts.map(e => Object.values(e.guns).flat().length)"), [0, 0]);
  assert.deepEqual(lost.json("save.store.map(x => x.g + x.lv)"), ["six1", "six2"]);
  assert.equal(lost.run("allGuns().length"), 5 + 2, "nothing lost: the schooner's five and the two that lost their ports");
});

test("moving a gun: store to an escort port, escort to the flagship, escort to escort, back to the store; always one place", () => {
  const g = withSave({ escorts: [{ id: "s1" }, { id: "s3" }], store: [{ g: "long12", lv: 4 }, { g: "chain", lv: 2 }], bow: [{ g: "carronade", lv: 3 }], left: [null, null], right: [null, null] });
  g.run("var s0 = save; var count = s => allGuns(s).length; var total = count(s0)");   // escort 0 is the sloop, escort 1 the brig, each with new sixes
  // the sloop's port holds a six; swap the stored long 12 into it: the six takes its place in the store
  g.run(`var s1 = swapGunsIn(s0, ${place("store", 0)}, ${place("bow", 0, 0)})`);
  assert.deepEqual(gunsOf(g, "s1.escorts[0].guns.bow"), ["long124"]);
  assert.deepEqual(g.json("s1.store.map(x => x.g + x.lv)"), ["six1", "chain2"]);
  assert.equal(g.run("count(s1) === total"), true);
  // escort -> the flagship's empty port: the escort's port is left empty
  g.run(`var s2 = swapGunsIn(s1, ${place("bow", 0, 0)}, ${place("left", 1)})`);
  assert.deepEqual(gunsOf(g, "s2.left"), [null, "long124"]);
  assert.deepEqual(gunsOf(g, "s2.escorts[0].guns.bow"), [null]);
  // flagship -> the brig's port: a full port trades with it
  g.run(`var s3 = swapGunsIn(s2, ${place("left", 1)}, ${place("left", 1, 1)})`);
  assert.deepEqual(gunsOf(g, "s3.escorts[1].guns.left"), ["six1", "long124", "six1"]);
  assert.deepEqual(gunsOf(g, "s3.left"), [null, "six1"]);
  // escort -> the same escort's other port: they trade
  g.run(`var s4 = swapGunsIn(s3, ${place("bow", 0, 1)}, ${place("left", 1, 1)})`);
  assert.deepEqual(g.json("[s4.escorts[1].guns.bow[0].g, s4.escorts[1].guns.left[1].g]"), ["long12", "six"]);
  // escort -> store (the Unload move): the gun lands in the store, the port is empty
  g.run(`var s5 = withGun(s4, ${place("bow", 0, 1)}, null); s5 = { ...s5, store: s5.store.concat([s4.escorts[1].guns.bow[0]]) }`);
  assert.equal(g.run("s5.escorts[1].guns.bow[0]"), null);
  assert.equal(g.run("s5.store[s5.store.length - 1].g"), "long12");
  assert.equal(g.run("count(s5) === total"), true, "still every gun, one place each");
  assert.equal(g.run("s0.escorts[0].guns.bow[0].g"), "six", "the first save is untouched (the edits are pure)");
});

test("gunbay actions on an escort's port: upgrade, upgrade x5, buy into the port, gfrom with Undo, Unload; the flagship's guns are other guns", () => {
  const g = withSave({ gold: 100000, escorts: [{ id: "s1" }], store: [{ g: "long12", lv: 4 }], bow: [{ g: "six", lv: 1 }] });
  g.run(`deckSel = ${place("bow", 0, 0)}`);
  assert.equal(g.run("gunAt(deckSel).g"), "six");
  assert.equal(g.run(`gunAct("gup", {})`), "upgrade");
  assert.equal(g.run("save.escorts[0].guns.bow[0].lv"), 2);
  assert.equal(g.run("save.bow[0].lv"), 1, "the flagship's six is another gun");
  assert.equal(g.run(`gunAct("gup5", {})`), "upgrade");
  assert.equal(g.run("save.escorts[0].guns.bow[0].lv"), 7);
  assert.match(g.run("gunCardHtml()"), /data-act="gup"/);
  // buy: mounted straight into the picked port; the gun it replaces goes to the store
  const storeBefore = g.run("save.store.length"), goldBefore = g.run("save.gold");
  assert.equal(g.run(`gunAct("buy", { id: "carronade" })`), "buy");
  assert.deepEqual(g.json("[save.escorts[0].guns.bow[0].g, save.escorts[0].guns.bow[0].lv, save.store.length, save.store[save.store.length - 1].g + save.store[save.store.length - 1].lv]"), ["carronade", 1, storeBefore + 1, "six7"]);
  assert.equal(g.run("save.gold"), goldBefore - g.run("GUNS.carronade.cost"));
  assert.deepEqual(g.json("deckSel"), { side: "bow", i: 0, e: 0 }, "the port stays picked");
  // gfrom: the stored long 12 goes into the port; the carronade takes its place in the store
  assert.equal(g.run(`gunAct("gfrom", { side: "store", i: "0" })`), "reload");
  assert.equal(g.run("save.escorts[0].guns.bow[0].g"), "long12");
  assert.ok(g.json("save.store.map(x => x.g)").includes("carronade"));
  assert.equal(g.run("gunNote.text[0]"), "movedSwap");
  g.run(`gunAct("gundo", {})`);
  assert.equal(g.run("save.escorts[0].guns.bow[0].g"), "carronade", "Undo puts the port back");
  assert.equal(g.run("save.store[0].g"), "long12", "...and the store");
  // Unload leaves an empty port; a gfrom then fills it and the store closes up
  g.run(`deckSel = ${place("bow", 0, 0)}`);
  assert.equal(g.run(`gunAct("unload", {})`), "uiClick");
  assert.equal(g.run("save.escorts[0].guns.bow[0]"), null);
  g.run(`deckSel = ${place("bow", 0, 0)}`);
  const n = g.run("save.store.length");
  assert.equal(g.run(`gunAct("gfrom", { side: "store", i: "0" })`), "reload");
  assert.equal(g.run("save.store.length"), n - 1);
  assert.equal(g.run("gunNote.text[0]"), "movedMount");
  assert.equal(g.run("allGuns().length"), g.run("save.store.length + [...save.bow, ...save.left, ...save.right, ...save.stern, ...escortGuns(save.escorts[0])].filter(Boolean).length"));
  // Undo is refused once an escort has another ship
  g.run(`gunAct("gundo", {})`);
  g.run(`deckSel = ${place("bow", 0, 0)}; gunAct("unload", {}); save = setEscort(save, 0, { id: "" })`);
  assert.equal(g.run(`gunAct("gundo", {})`), null, "the ports it would restore are gone");
});

test("fit-back: a new ship in the slot keeps the guns that fit and sends the rest to the store; unassigning or the flagship swap send all", () => {
  const g = withSave({ escorts: [{ id: "s4" }], store: [] });   // the frigate: bow 2, left 7, right 7, stern 1, all new sixes (17)
  g.run("var s0 = save; var total = allGuns(s0).length");
  assert.equal(g.run("total"), 17);
  // frigate -> sloop (1/1/1/0): 3 stay, 14 go to the store
  const toSloop = g.json("setEscort(s0, 0, { id: 's1' })");
  assert.deepEqual([toSloop.escorts[0].guns.bow.length, toSloop.escorts[0].guns.left.length, toSloop.escorts[0].guns.stern.length], [1, 1, 0]);
  assert.equal(toSloop.store.length, 14);
  assert.equal(g.run("allGuns(setEscort(s0, 0, { id: 's1' })).length === total"), true, "nothing lost");
  // unassign: every gun goes
  const none = g.json("setEscort(s0, 0, { id: '' })");
  assert.deepEqual(none.escorts[0].guns, { bow: [], left: [], right: [], stern: [] });
  assert.equal(none.store.length, 17);
  // the escort's ship becomes the flagship: its guns go to the store, the slot keeps its stance but has no ship
  const board = g.json("switchShip(s0, 's4')");
  assert.equal(board.store.length, 17);
  assert.deepEqual(board.escorts[0].guns, { bow: [], left: [], right: [], stern: [] });
  assert.equal(g.run("allGuns(switchShip(s0, 's4')).length === total"), true);
  assert.equal(g.run("escortReady(switchShip(s0, 's4'), 0)"), false);
  // a small ship to a bigger one: the guns stay where they are, the new ports are empty
  const up = withSave({ escorts: [{ id: "s1" }] }).json("setEscort(save, 0, { id: 's4' })");
  assert.deepEqual(up.escorts[0].guns.left.map(x => x && x.g), ["six", null, null, null, null, null, null]);
  // buying a ship for the flagship (boardShip) loses nothing either
  const bought = withSave({ escorts: [{ id: "s3" }] });
  assert.equal(bought.run("allGuns(buyShip(save, 'gunboat')).length === allGuns(save).length"), true);
});

test("allGuns counts every gun: the flagship, the store and each escort's ports", () => {
  const g = withSave({ escorts: [{ id: "s1" }, { id: "s3" }], store: [{ g: "six", lv: 1 }, { g: "long12", lv: 2 }], bow: [{ g: "six", lv: 1 }], left: [null, { g: "six", lv: 1 }], right: [null, null] });
  assert.equal(g.run("allGuns().length"), 2 + 2 + 3 + 7, "flagship 2, store 2, the sloop 3, the brig 1 + 3 + 3");
  assert.equal(g.run("allGuns().filter(x => x.g === 'long12').length"), 1);
  g.run("save = { ...save, escorts: save.escorts.map(e => ({ ...e, guns: { ...e.guns, bow: e.guns.bow.map(() => ({ g: 'fire', lv: 4 })) } })) }");
  assert.equal(g.run("allGuns().filter(x => x.g === 'fire').length"), 2, "a gun on an escort counts for the achievements, selling and the tutorial");
  assert.equal(g.run("allGuns({ ...save, escorts: undefined }).length"), 2 + 2, "a save with no escorts still counts the flagship's and the store's");
});

test("escortReady: no guns, no sailing; a gun on any port is enough", () => {
  const g = withSave({ escorts: [{ id: "s3" }] });   // the brig: 1 / 3 / 3 / 0
  assert.equal(g.run("escortReady(save, 0)"), true);
  g.run("var bare = { ...save, escorts: save.escorts.map(e => ({ ...e, guns: emptyGuns('brig') })) }");
  assert.equal(g.run("escortReady(bare, 0)"), false, "seven empty ports");
  assert.equal(g.run("escortGunCount(bare.escorts[0])"), 0);
  assert.throws(() => g.run("withGun(bare, { side: 'stern', i: 0, e: 0 }, gunItem('six'))"), /no escort port/, "a brig has no stern port: putting a gun there fails loudly instead of losing it");
  assert.equal(g.run("escortReady(withGun(bare, { side: 'right', i: 1, e: 0 }, gunItem('six')), 0)"), true);
  assert.ok(g.run("STR.en.escNoGuns && STR.zh.escNoGuns"));
});

test("buyShipForEscort: a new Lv 1 yard ship straight into the slot; the flagship stays; price, lock, yard cap, empty ports", () => {
  const g = withSave({ gold: 5000, campaign: { bounty: 3 }, escorts: [{ id: "" }, { id: "s1" }] });
  g.run("var s0 = save");
  const s = g.json("buyShipForEscort(s0, 0, 'brigantine')");
  assert.equal(s.gold, 5000 - 1800);
  assert.equal(s.shipId, "s2"); assert.equal(s.ship, "schooner", "the flagship is unchanged");
  assert.equal(s.fleet.length, 4);
  const nu = s.fleet[s.fleet.length - 1];
  assert.deepEqual([nu.ship, nu.hull, nu.sails, nu.hold], ["brigantine", 1, 1, 1]);
  assert.equal(s.escorts[0].id, nu.id);
  assert.deepEqual([s.escorts[0].guns.bow.length, s.escorts[0].guns.left.length, s.escorts[0].guns.right.length, s.escorts[0].guns.stern.length], [1, 2, 2, 1]);
  assert.ok(Object.values(s.escorts[0].guns).flat().every(x => x === null), "its ports start empty");
  assert.equal(g.run("escortReady(buyShipForEscort(s0, 0, 'brigantine'), 0)"), false, "an escort with no guns does not sail");
  assert.equal(g.run("buyShipForEscort(s0, 0, 'sloop')"), null, "the sloop is not for sale");
  assert.equal(g.run("buyShipForEscort(s0, 0, 'ship')"), null);
  assert.equal(g.run("buyShipForEscort(s0, 5, 'brigantine')"), null, "no such slot");
  assert.equal(g.run("buyShipForEscort({ ...s0, gold: 1799 }, 0, 'brigantine')"), null);
  assert.equal(g.run("buyShipForEscort({ ...s0, campaign: { ...s0.campaign, ships: ['schooner'] } }, 0, 'brigantine')"), null, "the Letter of Marque has not opened it");
  assert.equal(g.run("buyShipForEscort({ ...s0, fleet: Array.from({ length: FLEET_MAX - 1 }, (_, i) => ({ id: 's' + (i + 20), ship: 'sloop', hull: 1, sails: 1, hold: 1 })) }, 0, 'brigantine')"), null, "a full yard");
  // replacing an occupied slot: the old ship goes back to the yard idle, its guns that fit come along
  const swap = g.json("buyShipForEscort(s0, 1, 'gunboat')");   // sloop (1/1/1) -> gunboat (1/3/3)
  assert.equal(swap.escorts[1].id, swap.fleet[swap.fleet.length - 1].id);
  assert.ok(swap.fleet.some(x => x.id === "s1"), "the sloop is still in the yard");
  assert.equal(swap.escorts[1].guns.bow[0].g, "six");
  assert.equal(g.run("allGuns(buyShipForEscort(s0, 1, 'gunboat')).length === allGuns(s0).length"), true);
});

test("upgradeShipPart: the flagship's own level or a yard ship's, at that ship's price", () => {
  const g = withSave({ gold: 10000, escorts: [{ id: "s4" }] });
  g.run("var s0 = save");
  const cost = g.run("YARD.hull.cost(3, SHIPS.frigate)");
  const up = g.json("upgradeShipPart(s0, 's4', 'hull')");
  assert.equal(up.gold, 10000 - cost);
  assert.equal(up.fleet.find(x => x.id === "s4").hull, 4);
  assert.equal(up.hull, g.run("s0.hull"), "the flagship's hull is unchanged");
  const flag = g.json("upgradeShipPart(s0, s0.shipId, 'sails')");
  assert.equal(flag.sails, g.run("s0.sails + 1")); assert.equal(flag.gold, 10000 - g.run("YARD.sails.cost(s0.sails, SHIPS.schooner)"));
  assert.equal(g.run("upgradeShipPart({ ...s0, gold: 1 }, 's4', 'hull')"), null);
  assert.equal(g.run("upgradeShipPart(s0, 's99', 'hull')"), null);
  assert.equal(g.run("upgradeShipPart(s0, 's4', 'guns')"), null);
  assert.equal(g.run("upgradeShipPart({ ...s0, fleet: s0.fleet.map(x => x.id === 's4' ? { ...x, hull: YARD.hull.max } : x) }, 's4', 'hull')"), null, "at the cap");
});
