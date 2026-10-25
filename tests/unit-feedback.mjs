// Unit tests for the phase-1 feedback fixes (#68 gun bay moves + x5 upgrade, #69 grapple pull, #71 bosses left alone, #72 owned ships,
// #73 sticky ledger gold). Pure functions only; scripts load into one node:vm context, as in tests/unit-rematch.mjs.
// Usage: node --test tests/unit-feedback.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/save-campaign.js",
  "js/archetypes.js", "js/ledger-gold.js", "js/grapple.js", "js/boarding.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
const ctx = vm.createContext({
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
  console: { log() {}, warn() {}, error: (...a) => { throw new Error(a.join(" ")); } }, setTimeout, clearTimeout, performance,
});
vm.runInContext("const shipRadius = s => ((s.hl ?? 28) + (s.hw ?? 13)) / 2; var crates = [], enemies = [], player = null, tut = { target: null };", ctx);   // the game provides it (js/ships.js)
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

// ---------- #68: gun bay moves and Upgrade x5 (js/gunbay.js) ----------
// (the #34 tests that still apply, the upgrade label and the shortfall, stay in tests/unit-phase1b.mjs)
const BAY_FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/gunbay.js"];
const BAY_SRC = BAY_FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
// A fresh page load in `lang`; the save gets two guns on the bow and one in the store.
function bay(lang = "en") {
  const store = new Map([["privateers-lang", lang]]);
  const c = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }), console, setTimeout, clearTimeout,
  });
  for (const [f, code] of BAY_SRC) vm.runInContext(code, c, { filename: f });
  vm.runInContext(`var portMsg = null; var renderPort = () => {};`, c);   // js/harbor.js owns them
  vm.runInContext(`save = { ...save, gold: 100000, bow: [gunItem("six", 2), gunItem("long12", 1)], store: [gunItem("chain", 1)] }; deckSel = null; gunNote = null;`, c);
  return { run: code => vm.runInContext(code, c), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, c)) };
}
const bowIds = g => g.json("save.bow.map(x => x && x.g)");
const tap = (g, side, i) => g.run(`gunAct(${side === "store" ? '"store"' : '"slot"'}, { side: "${side}", i: "${i}" })`);

test("gun bay (#68): tap the source, then the destination: a second port swaps the two guns, with no mode button", () => {
  const g = bay();
  assert.equal(tap(g, "bow", 0), "uiClick");
  assert.deepEqual(g.json("deckSel"), { side: "bow", i: 0 });
  assert.equal(tap(g, "bow", 1), "reload");
  assert.deepEqual(bowIds(g), ["long12", "six"]);
  assert.equal(g.run("deckSel"), null, "the source is put down after the move");
  assert.deepEqual(g.json("gunNote.text"), ["movedSwap", { a: "Iron 6-pounder Lv 2", b: "Long 12-pounder Lv 1" }]);
  assert.equal(g.run(`gunAct("swap", {})`), null, "the old Swap position action is gone");
  assert.ok(!g.run("GUN_ACTS").includes("swap"));
});

test("gun bay (#68): a stored gun picked first mounts into an empty port; the store closes up", () => {
  const g = bay();
  g.run(`save = { ...save, left: [null], store: [gunItem("chain", 1), gunItem("six", 3)] }`);
  tap(g, "store", 1);
  assert.deepEqual(g.json("deckSel"), { side: "store", i: 1 });
  assert.equal(tap(g, "left", 0), "reload");
  assert.deepEqual(g.json("save.left.map(x => x && [x.g, x.lv])"), [["six", 3]]);
  assert.deepEqual(g.json("save.store.map(x => x.g)"), ["chain"]);
  assert.equal(g.json("gunNote.text[0]"), "movedMount");
});

test("gun bay (#68): a stored gun traded for a mounted one, in both directions", () => {
  const a = bay();
  tap(a, "bow", 1); tap(a, "store", 0);   // mounted first, then the stored one
  assert.deepEqual(bowIds(a), ["six", "chain"]);
  assert.deepEqual(a.json("save.store.map(x => x.g)"), ["long12"]);
  const b = bay();
  tap(b, "store", 0); tap(b, "bow", 1);   // stored first, then the mounted one
  assert.deepEqual(bowIds(b), ["six", "chain"]);
  assert.deepEqual(b.json("save.store.map(x => x.g)"), ["long12"]);
});

test("gun bay (#68): tapping the source again, Esc or a blank spot puts it down with nothing moved", () => {
  const g = bay();
  tap(g, "bow", 0); tap(g, "bow", 0);
  assert.equal(g.run("deckSel"), null);
  assert.deepEqual(bowIds(g), ["six", "long12"]);
  tap(g, "bow", 0);
  assert.equal(g.run("cancelGunPick()"), true, "Esc / blank spot: a gun was picked");
  assert.equal(g.run("deckSel"), null);
  assert.equal(g.run("cancelGunPick()"), false, "nothing picked: Esc falls through to the ledger's own back");
  assert.deepEqual(bowIds(g), ["six", "long12"]);
});

test("gun bay (#68): an empty port with nothing to mount changes nothing and says what to do; two stored guns never trade", () => {
  const g = bay();
  g.run(`save = { ...save, left: [null], store: [gunItem("chain", 1), gunItem("six", 1)] }`);
  assert.equal(tap(g, "left", 0), "denied");   // nothing picked
  assert.equal(g.run("deckSel"), null);
  assert.equal(g.json("gunNote.tip"), "emptyTip");
  assert.deepEqual(bowIds(g), ["six", "long12"]);
  g.run("deckSel = null");
  tap(g, "store", 0); tap(g, "store", 1);   // the second stored gun only moves the pick
  assert.deepEqual(g.json("deckSel"), { side: "store", i: 1 });
  assert.deepEqual(g.json("save.store.map(x => x.g)"), ["chain", "six"]);
});

test("gun bay (#68): a mounted gun picked, then an empty port: it moves there, the old port is left empty, and Undo puts it back", () => {
  const g = bay();
  g.run(`save = { ...save, left: [null] }`);
  tap(g, "bow", 1);
  assert.equal(tap(g, "left", 0), "reload");
  assert.deepEqual(g.json("[save.bow.map(x => x && x.g), save.left.map(x => x && x.g), save.store.map(x => x.g)]"), [["six", null], ["long12"], ["chain"]]);
  assert.equal(g.json("gunNote.text[0]"), "movedShift");
  assert.equal(g.run("deckSel"), null);
  g.run(`gunAct("gundo", {})`);
  assert.deepEqual(g.json("[save.bow.map(x => x && x.g), save.left.map(x => x && x.g)]"), [["six", "long12"], [null]]);
});

test("gun bay (#68): Unload sends the gun to the store; a full store refuses and loses nothing", () => {
  const g = bay();
  tap(g, "bow", 1);
  assert.equal(g.run(`gunAct("unload", {})`), "uiClick");
  assert.deepEqual(g.json("save.bow.map(x => x && x.g)"), ["six", null]);
  assert.deepEqual(g.json("save.store.map(x => x.g)"), ["chain", "long12"]);
  assert.equal(g.json("gunNote.text[0]"), "movedUnload");
  const f = bay();
  f.run(`save = { ...save, store: Array.from({ length: MAX_STORE }, () => gunItem("six", 1)) }`);
  tap(f, "bow", 1);
  assert.equal(f.run(`gunAct("unload", {})`), null);
  assert.equal(f.run(`gunAct("tostore", {})`), null);
  assert.equal(f.run("save.store.length"), 200);
  assert.deepEqual(bowIds(f), ["six", "long12"], "nothing was dropped");
  assert.match(f.run("gunCardHtml()"), /data-act="unload" disabled/);
  assert.match(f.run("gunCardHtml()"), /store is full \(200\)/);
  assert.ok(!f.run("renderGunBay.toString()").includes("undefined"));
  // a full store still lets a mounted gun trade with a stored one: that does not grow the store
  assert.equal(tap(f, "store", 0), "reload");
  assert.equal(f.run("save.store.length"), 200);
});

test("gun bay (#68): Undo takes back only the latest move, and a purchase or upgrade clears it", () => {
  const g = bay();
  tap(g, "bow", 0); tap(g, "bow", 1);
  assert.deepEqual(bowIds(g), ["long12", "six"]);
  assert.equal(g.run(`gunAct("gundo", {})`), "uiClick");
  assert.deepEqual(bowIds(g), ["six", "long12"]);
  assert.deepEqual(g.json("save.store.map(x => x.g)"), ["chain"]);
  assert.equal(g.run(`gunAct("gundo", {})`), null, "one step only");
  tap(g, "store", 0); tap(g, "bow", 0);   // stored chain traded in
  assert.deepEqual(bowIds(g), ["chain", "long12"]);
  g.run(`gunAct("gundo", {})`);
  assert.deepEqual(g.json("[save.bow.map(x => x.g), save.store.map(x => x.g)]"), [["six", "long12"], ["chain"]], "the store comes back too");
  tap(g, "bow", 0); tap(g, "bow", 1);
  tap(g, "bow", 0); g.run(`gunAct("gup", {})`);
  assert.equal(g.run("gunNote"), null, "an upgrade spends gold: nothing left to undo");
  tap(g, "bow", 0); tap(g, "bow", 1); g.run(`gunAct("buy", { id: "six" })`);
  assert.equal(g.run("gunNote"), null, "a purchase is not a move");
});

test("gun bay (#68): Undo is for the ship it was made on", () => {
  const g = bay();
  tap(g, "bow", 0); tap(g, "bow", 1);
  g.run(`save = { ...save, shipId: "s9" }`);
  assert.equal(g.run(`gunAct("gundo", {})`), null);
  assert.deepEqual(bowIds(g), ["long12", "six"]);
});

test("gun bay (#68): the places a picked gun can go are exactly the outlined ones", () => {
  const g = bay();
  g.run(`save = { ...save, left: [null, gunItem("six", 1)], store: [gunItem("chain", 1), gunItem("six", 2)] }`);
  const places = "[...MOUNTS.flatMap(({ key }) => save[key].map((_, i) => [key, i])), ...save.store.map((_, i) => ['store', i])]";
  const dest = () => g.json(`${places}.filter(([s, i]) => isDest(s, i))`), all = g.json(places);
  tap(g, "store", 0);
  assert.deepEqual(dest(), all.filter(([s]) => s !== "store"), "stored gun: every port, empty or not, and no stored gun");
  tap(g, "store", 0); tap(g, "bow", 0);
  const empty = g.json(`${places}.filter(([s, i]) => s !== 'store' && !save[s][i])`);
  assert.deepEqual(dest(), all.filter(([s, i]) => !(s === "bow" && i === 0)), "a mounted gun: every other port, empty ones too, and every stored gun");
  assert.ok(empty.length >= 1, "(the save has an empty port to test with)");
});

test("gun bay (#68): the picked gun's card has no Swap position button, only upgrade, upgrade x5 and Unload", () => {
  const g = bay();
  g.run(`deckSel = { side: "bow", i: 0 }`);
  const html = g.run("gunCardHtml()");
  assert.doesNotMatch(html, /data-act="swap"/); assert.doesNotMatch(html, /Swap position/);
  assert.match(html, /data-act="gup"/); assert.match(html, /data-act="gup5"/); assert.match(html, /data-act="unload"/);
  g.run(`deckSel = { side: "store", i: 0 }`);
  assert.doesNotMatch(g.run("gunCardHtml()"), /data-act="unload"/, "a stored gun has nothing to unload");
});

test("gun bay (#68): Upgrade x5 prices the five levels in all, in both languages", () => {
  const en = bay("en"), zh = bay("zh");
  for (const g of [en, zh]) g.run(`deckSel = { side: "bow", i: 0 }; save.bow[0] = gunItem("six", 2)`);
  const total = en.run("[0,1,2,3,4].reduce((n, j) => n + gunUpCost(gunItem('six', 2 + j)), 0)");
  assert.deepEqual(en.json("gunUpPlan(save.bow[0], 1e9)"), { n: 5, cost: total, short: 0 });
  assert.ok(en.run("gunCardHtml()").includes(`Upgrade 5 levels (${en.run("fmt")(total)} gold total)`));
  assert.ok(zh.run("gunCardHtml()").includes(`升級 5 級（總價 ${en.run("fmt")(total)} 金幣）`));
  en.run(`gunAct("gup5", {})`);
  assert.deepEqual(en.json("[save.bow[0].lv, save.gold]"), [7, 100000 - total]);
});

test("gun bay (#68): near the cap Upgrade x5 shows the real number of levels; one level left hides it; the cap stops at Max", () => {
  const g = bay();
  g.run(`deckSel = { side: "bow", i: 0 }; save.bow[0] = gunItem("six", GUN_MAX - 3)`);
  assert.equal(g.json("gunUpPlan(save.bow[0], 1e9).n"), 3);
  assert.match(g.run("gunCardHtml()"), /data-act="gup5" >Upgrade 3 levels \(/);
  g.run(`gunAct("gup5", {})`);
  assert.equal(g.run("save.bow[0].lv"), g.run("GUN_MAX"));
  g.run(`save.bow[0] = gunItem("six", GUN_MAX - 1)`);
  assert.doesNotMatch(g.run("gunCardHtml()"), /data-act="gup5"/);
  g.run(`save.bow[0] = gunItem("six", GUN_MAX)`);
  assert.doesNotMatch(g.run("gunCardHtml()"), /data-act="gup5"/);
  assert.equal(g.run(`gunAct("gup5", {})`), null);
});

test("gun bay (#68): too little gold disables Upgrade x5 and shows the shortfall; no partial upgrade is made", () => {
  const g = bay();
  g.run(`deckSel = { side: "bow", i: 0 }; save.bow[0] = gunItem("six", 2)`);
  const plan = g.json("gunUpPlan(save.bow[0], 0)");
  g.run(`save.gold = ${plan.cost - 25}`);
  assert.match(g.run("gunCardHtml()"), /data-act="gup5" disabled>Upgrade 5 levels \(\d[\d,]* gold total, need 25 more\)/);
  assert.equal(g.run(`gunAct("gup5", {})`), null);
  assert.deepEqual(g.json("[save.bow[0].lv, save.gold]"), [2, plan.cost - 25], "no levels bought, no gold taken");
  assert.match(bay("zh").run(`deckSel = { side: "bow", i: 0 }; save.bow[0] = gunItem("six", 2); save.gold = 0; gunCardHtml()`), /disabled>升級 5 級（總價 [\d,]+ 金幣，還差 [\d,]+）/);
});

test("gun bay (#68): the guns' strings exist in both languages and the old swap strings are gone", () => {
  const g = bay();
  for (const k of ["toStoreDest", "pickHintPort", "pickHintStore", "emptyTip", "storeFullWhy", "movedMount", "movedShift", "movedSwap", "movedUnload", "gunUndo", "gunUndone", "upN", "upNShort", "toStore"])
    assert.ok(g.run(`STR.en.${k} && STR.zh.${k}`), k);
  for (const k of ["swapGun", "swapCancel", "swapHint", "selHint", "selEmpty"]) assert.equal(g.run(`STR.en.${k} === undefined && STR.zh.${k} === undefined`), true, k);
  assert.equal(g.run("STR.zh.toStore"), "卸下");
});

// ---------- #69: the grapple's spring (js/grapple.js) ----------
// The flagship (hull circle radius 20.5) and a prize at the origin; shipRadius of both = 20.5, so gap = distance - 41.
const GR = "({ hl: 28, hw: 13 })";
const sim = (setup, secs, { steer, dt = 1 / 60 } = {}) => run(`(() => {
  const e = { ...${GR}, x: 0, y: 0, vx: 0, vy: 0 }, p = { ...${GR}, maxSpeed: 150, ...${setup} };
  let pv = { x: 0, y: 0 }, strain = 0, board = 0, snapped = null, t = 0, minGap = 1e9;
  while (t < ${secs} && snapped === null) {
    ${steer || ""}
    pv = grapplePull(pv, p, e, ${dt}); strain = grappleStrain(strain, p, e, ${dt});
    p.x += (p.vx + pv.x) * ${dt}; p.y += (p.vy + pv.y) * ${dt};
    if (grappleParts(strain, p, e)) snapped = t;
    const near = dist(p, e) < shipRadius(p) + shipRadius(e) + BOARD_GAP && Math.hypot(p.vx + pv.x - e.vx, p.vy + pv.y - e.vy) < BOARD_REL_V;
    board = near ? board + ${dt} : Math.max(0, board - ${dt} * BOARD_DECAY);
    minGap = Math.min(minGap, grappleGap(p, e));
    t += ${dt};
  }
  return { snapped, board, strain, gap: grappleGap(p, e), pv, t, minGap };
})()`);

test("#69 canHook: near and not racing past hooks; far or fast does not", () => {
  assert.equal(run(`canHook({ ...${GR}, x: 80, y: 0, vx: 0, vy: 0 }, { ...${GR}, x: 0, y: 0, vx: 0, vy: 0 })`), true, "gap 39 at rest");
  assert.equal(run(`canHook({ ...${GR}, x: 400, y: 0, vx: 0, vy: 0 }, { ...${GR}, x: 0, y: 0, vx: 0, vy: 0 })`), false, "far");
  assert.equal(run(`canHook({ ...${GR}, x: 80, y: 0, vx: 0, vy: 400 }, { ...${GR}, x: 0, y: 0, vx: 0, vy: 0 })`), false, "racing past");
});

test("#69 the pull points at the prize, grows with the stretch, and never passes BOARD_PULL_MAX", () => {
  const at = d => run(`(() => { let pv = { x: 0, y: 0 }; const e = { ...${GR}, x: 0, y: 0, vx: 0, vy: 0 }, p = { ...${GR}, x: ${d}, y: 0, vx: 0, vy: 0, maxSpeed: 150 };
    for (let i = 0; i < 300; i++) pv = grapplePull(pv, p, e, 1 / 60); return pv.x; })()`);
  assert.ok(at(100) < 0, "toward the prize (it is at x = 0)");
  assert.ok(Math.abs(at(120)) > Math.abs(at(80)), "more stretch, more pull");
  assert.ok(Math.abs(at(5000)) <= run("BOARD_PULL_MAX") + 1e-9, "capped");
  assert.ok(Math.abs(at(41 + run("BOARD_REST"))) < 1e-6, "no pull at the slack length");
  assert.equal(run("grapplePull({ x: 0, y: 0 }, { x: 5000, y: 0, vx: 0, vy: 0, hl: 28, hw: 13 }, { x: 0, y: 0, vx: 0, vy: 0, hl: 28, hw: 13 }, 1 / 60).y"), 0);
});

test("#69 the pull eases in: one frame never jumps to the cap", () => {
  const first = run(`grapplePull({ x: 0, y: 0 }, { ...${GR}, x: 5000, y: 0, vx: 0, vy: 0 }, { ...${GR}, x: 0, y: 0, vx: 0, vy: 0 }, 1 / 60).x`);
  assert.ok(Math.abs(first) < run("BOARD_PULL_MAX") * 0.2, "eased: " + first);
});

test("#69 a ship sailing slowly past the prize is pulled alongside and finishes the 2 s boarding without steering", () => {
  const r = sim("{ x: 100, y: 60, vx: 0, vy: -60 }", 8);   // starts 59 px off her beam, drifting past at 60 px/s
  assert.equal(r.snapped, null, "the rope holds");
  assert.ok(r.board >= run("BOARD_T"), "progress reached " + r.board.toFixed(2) + " s");
});

test("#69 a ship that drifts straight at the prize is reeled in and held at the slack length", () => {
  const r = sim("{ x: 90, y: 0, vx: -30, vy: 0 }", 8, { steer: "p.vx *= 0.96;" });   // she coasts to a stop
  assert.ok(Math.abs(r.gap - run("BOARD_REST")) < 8, "settles near the slack length: " + r.gap.toFixed(1));
  assert.ok(r.board >= run("BOARD_T"));
});

test("#69 full speed straight away parts the rope after about BOARD_SNAP_T seconds, and the cut is not instant", () => {
  const steer = "p.vx = 150; p.vy = 0;";   // dead away at full speed (150 of maxSpeed 150)
  const r = sim("{ x: 60, y: 0, vx: 150, vy: 0 }", 10, { steer });
  assert.ok(r.snapped !== null, "it parts");
  assert.ok(r.snapped >= run("BOARD_SNAP_T") - 0.05 && r.snapped < run("BOARD_SNAP_T") + 0.4, "after ~" + run("BOARD_SNAP_T") + " s, here " + r.snapped.toFixed(2));
});

test("#69 slow sails never part the rope: the flagship is reeled back instead", () => {
  const steer = "p.vx = 60; p.vy = 0;";   // 40% of full speed, dead away
  const r = sim("{ x: 60, y: 0, vx: 60, vy: 0 }", 30, { steer });
  assert.equal(r.snapped, null, "still hooked after 30 s");
  assert.ok(r.gap < run("BOARD_ROPE_MAX"), "held inside the rope: gap " + r.gap.toFixed(0));
});

test("#69 sailing away at 70% (below the strain share) builds no strain and holds for a good while; 85% parts it", () => {
  const slow = sim(`{ x: 60, y: 0, vx: 105, vy: 0 }`, 6, { steer: "p.vx = 105; p.vy = 0;" });
  assert.equal(slow.snapped, null, "70% of full speed: still hooked after 6 s");
  assert.equal(slow.strain, 0, "and no strain at all");
  const fast = sim(`{ x: 60, y: 0, vx: 127.5, vy: 0 }`, 6, { steer: "p.vx = 127.5; p.vy = 0;" });
  assert.ok(fast.snapped !== null, "85% of full speed parts it");
});

test("#69 even a slow retreat parts the rope in the end, once it has stretched past BOARD_ROPE_MAX", () => {
  const r = sim(`{ x: 60, y: 0, vx: 105, vy: 0 }`, 30, { steer: "p.vx = 105; p.vy = 0;" });
  assert.ok(r.snapped !== null && r.strain === 0, "parted by length, not by strain: " + JSON.stringify({ at: r.snapped, strain: r.strain }));
});

test("#69 strain eases off when she stops pulling away, so short bursts do not add up", () => {
  const strained = run(`(() => { const e = { ...${GR}, x: 0, y: 0, vx: 0, vy: 0 }, away = { ...${GR}, x: 60, y: 0, vx: 150, vy: 0, maxSpeed: 150 }, calm = { ...away, vx: 0 };
    let s = 0; for (let i = 0; i < 60; i++) s = grappleStrain(s, away, e, 1 / 60);   // one second of full speed away
    const peak = s; for (let i = 0; i < 60; i++) s = grappleStrain(s, calm, e, 1 / 60); return [peak, s]; })()`);
  assert.ok(Math.abs(strained[0] - 1) < 1e-6 && strained[1] === 0, JSON.stringify(strained));
});

test("#69 a rope stretched past BOARD_ROPE_MAX parts at any speed", () => {
  assert.equal(run(`grappleParts(0, { ...${GR}, x: ${41 + 421}, y: 0, vx: 0, vy: 0 }, { ...${GR}, x: 0, y: 0, vx: 0, vy: 0 })`), true);
  assert.equal(run(`grappleParts(0, { ...${GR}, x: 300, y: 0, vx: 0, vy: 0 }, { ...${GR}, x: 0, y: 0, vx: 0, vy: 0 })`), false);
});

test("#69 the pull counts toward alongside's relative speed, and the old two-argument form is unchanged", () => {
  const near = `{ ...${GR}, x: 41, y: 0, vx: 100, vy: 0 }`, prize = `{ ...${GR}, x: 0, y: 0, vx: 0, vy: 0 }`;
  assert.equal(run(`alongside(${near}, ${prize})`), false, "drifting past at 100 px/s: too fast");
  assert.equal(run(`alongside(${near}, ${prize}, { x: -40, y: 0 })`), true, "the rope slows her to 60 px/s: boarding counts");
});

test("#69 the grapple's strings, sounds and constants exist", () => {
  assert.ok(run("STR.en.fHook && STR.zh.fHook && STR.en.fSnap && STR.zh.fSnap"));
  for (const k of ["BOARD_HOOK_GAP", "BOARD_HOOK_V", "BOARD_REST", "BOARD_PULL_K", "BOARD_PULL_MAX", "BOARD_PULL_MATCH", "BOARD_PULL_RESP", "BOARD_SNAP_FRAC", "BOARD_SNAP_T", "BOARD_STRAIN_DECAY", "BOARD_ROPE_MAX", "BOARD_REHOOK_S"])
    assert.ok(run(`typeof ${k} === "number" && ${k} > 0`), k);
});


// ---------- #88: the upgrade preview shows before and after for every figure the gun states ----------
test("#88 gunStats: the incendiary's upgrade preview carries the damage AND the burn, before and after; a plain gun only the damage", () => {
  const g = bay();
  const dmg = (id, lv) => g.run(`Math.round(GUNS.${id}.dmg * gunLvMul(${lv}) * shipGunK(save.ship))`);
  const burn = (id, lv) => g.run(`Math.round(GUNS.${id}.burn * gunLvMul(${lv}) * shipGunK(save.ship) * BURN_T)`);
  const strip = h => h.replace(/<[^>]+>/g, "");
  const fire = strip(g.run(`gunStats("fire", 3, save.ship, 4)`));
  assert.equal(fire, `${dmg("fire", 3)} dmg → ${dmg("fire", 4)} + ${burn("fire", 3)} burn → ${burn("fire", 4)}`);
  assert.notEqual(burn("fire", 3), burn("fire", 4), "the burn really rises with the level");
  assert.equal(strip(g.run(`gunStats("six", 2, save.ship, 3)`)), `${dmg("six", 2)} dmg → ${dmg("six", 3)}`);
  assert.equal(strip(g.run(`gunStats("fire", 3)`)), `${dmg("fire", 3)} dmg + ${burn("fire", 3)} burn`, "no preview without a next level");
  const zh = bay("zh");
  assert.match(strip(zh.run(`gunStats("fire", 1, save.ship, 2)`)), /^傷害 \d+ → \d+ \+ 燃燒 \d+ → \d+$/);
});
