// Unit tests for #117 and #124: a bought gun never replaces one (buyTarget), the second tap on a gun upgrade, a gun purchase and a break-down, the bought-gun
// note, the plain-language gear strings, the sortie settlement title. Scripts load into one node:vm context, as in tests/unit-ledger110.mjs.
// Usage: node --test tests/unit-ledger117.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/gear-core.js", "js/gear-text.js", "js/save.js", "js/save-campaign.js",
  "js/shipyard.js", "js/escorts.js", "js/gear-save.js", "js/gunbay.js", "js/gear-ui.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
function boot(lang = "en") {
  const store = new Map([["privateers-lang", lang]]), domReady = [];
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() },
    navigator: { language: "en-US" }, document: { addEventListener: (type, fn) => { if (type === "DOMContentLoaded") domReady.push(fn); }, getElementById: () => null },
    window: dom, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, performance,
  });
  vm.runInContext("var portMsg = null; var renderPort = () => {};", ctx);
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  domReady.forEach(fn => fn());
  const run = code => vm.runInContext(code, ctx);
  return { run, json: code => JSON.parse(run(`JSON.stringify(${code})`)) };
}
// The game's two-tap confirm (js/escort-ui.js), reduced: the first tap on a key arms it, the second one confirms.
const TWO_TAP = `var armKey = null; var armAttrs = () => ' data-armed="1"'; var armedTap = k => armKey === k; var twoTap = k => { if (armKey === k) { armKey = null; return true; } armKey = k; return false; };`;
const ship = (g, over = "") => g.run(`save = { ...save, gold: 5000, ship: "brigantine", ${over} }; save = fitMounts(save);`);   // brigantine: bow 1, left 2, right 2, stern 1

test("buyTarget: the picked port when it is empty, else an empty port of the same ship, else the store; a bought gun never replaces one", () => {
  const g = boot();
  ship(g, `bow: [gunItem("six", 3)], left: [gunItem("long12", 2), null], right: [gunItem("six"), gunItem("six")], stern: [gunItem("six")], store: []`);
  assert.deepEqual(g.json(`buyTarget(save, { side: "left", i: 1 })`), { side: "left", i: 1 }, "an empty picked port is the target");
  assert.deepEqual(g.json(`buyTarget(save, { side: "bow", i: 0 })`), { side: "left", i: 1 }, "an occupied port: the empty one beside it, the picked gun stays");
  g.run(`save.left[1] = gunItem("six")`);
  assert.equal(g.run(`buyTarget(save, { side: "bow", i: 0 })`), null, "every port full: the store");
  assert.equal(g.run(`buyTarget(save, null)`), null, "nothing picked: the store");
  assert.equal(g.run(`buyTarget(save, { side: "store", i: 0 })`), null);
});

test("buyTarget: an escort's port looks for an empty port on that escort, never on the flagship", () => {
  const g = boot();
  ship(g, `bow: [null], escorts: [{ id: "s1", guns: { bow: [gunItem("six", 4)], left: [gunItem("six"), null], right: [], stern: [] } }]`);
  assert.deepEqual(g.json(`buyTarget(save, { side: "bow", i: 0, e: 0 })`), { side: "left", i: 1, e: 0 });
  assert.equal(g.run(`buyTarget(save, { side: "bow", i: 0, e: 0 })`) === null, false);
});

test("gunAct buy: an epic in the picked port stays; the new gun goes to an empty port or the store and the note says which", () => {
  const g = boot();
  ship(g, `bow: [{ ...gunItem("long12", 5), r: 3 }], left: [gunItem("six"), null], right: [gunItem("six"), gunItem("six")], stern: [gunItem("six")], store: []`);
  g.run(`deckSel = { side: "bow", i: 0 }`);
  const gold = g.run("save.gold");
  assert.equal(g.run(`gunAct("buy", { id: "six" })`), "buy");
  assert.equal(g.run("save.bow[0].g + save.bow[0].lv + save.bow[0].r"), "long1253", "the epic is still in its port");
  assert.equal(g.run("save.left[1].g"), "six", "the new gun is in the empty port");
  assert.equal(g.run("save.store.length"), 0, "nothing was pushed to the store");
  assert.equal(g.run("save.gold"), gold - g.run("GUNS.six.cost"));
  assert.equal(g.run("gunNote.tip"), "boughtPort");
  assert.deepEqual(g.json("deckSel"), { side: "bow", i: 0 }, "the pick stays");
  assert.match(g.run("gunNoteHtml()"), /Six|6-pounder|Iron/i, "the note names the gun");
  // every port full now: the next one waits in the store
  g.run(`gunAct("buy", { id: "carronade" })`);
  assert.equal(g.run("save.store.map(x => x.g).join()"), "carronade");
  assert.equal(g.run("save.bow[0].g"), "long12");
  assert.equal(g.run("gunNote.tip"), "boughtStored");
  // a full store with no empty port: refused, gold kept
  g.run(`save.store = Array.from({ length: MAX_STORE }, () => gunItem("six"))`);
  const kept = g.run("save.gold");
  assert.equal(g.run(`gunAct("buy", { id: "six" })`), null);
  assert.equal(g.run("save.gold"), kept);
});

test("gunAct buy into the picked empty port mounts it there and says so", () => {
  const g = boot();
  ship(g, `bow: [null], store: []`);
  g.run(`deckSel = { side: "bow", i: 0 }`);
  assert.equal(g.run(`gunAct("buy", { id: "six" })`), "buy");
  assert.equal(g.run("save.bow[0].g"), "six");
  assert.equal(g.run("gunNote.tip"), "boughtMounted");
  assert.equal(g.run("portMsg"), null, "the ledger's top message is left alone: its height would move the deck");
});

test("a gun upgrade or purchase from CONFIRM_GOLD up needs a second tap; a cheap one goes through at once", () => {
  const g = boot();
  g.run(TWO_TAP);
  ship(g, `bow: [gunItem("six", 4)], left: [null, null], store: []`);   // Lv 4 -> 5 costs well over CONFIRM_GOLD
  g.run(`deckSel = { side: "bow", i: 0 }`);
  const cost = g.run("gunUpCost(save.bow[0])"), gold = g.run("save.gold");
  assert.ok(cost >= g.run("CONFIRM_GOLD"));
  assert.equal(g.run(`gunAct("gup", {})`), null, "the first tap only arms");
  assert.equal(g.run("save.bow[0].lv"), 4);
  assert.equal(g.run("save.gold"), gold);
  assert.match(g.run("gunCardHtml()"), /data-armed="1"[^>]*>Tap again to confirm: Lv 5/, "the button says what the second tap does");
  assert.equal(g.run(`gunAct("gup", {})`), "upgrade", "the second tap spends");
  assert.equal(g.run("save.bow[0].lv"), 5);
  assert.equal(g.run("save.gold"), gold - cost);
  // a cheap upgrade (Lv 1 -> 2 of a six costs 12)
  g.run(`save.bow = [gunItem("six", 1)]; armKey = null`);
  assert.ok(g.run("gunUpCost(save.bow[0])") < g.run("CONFIRM_GOLD"));
  assert.equal(g.run(`gunAct("gup", {})`), "upgrade");
  // purchases: every gun costs CONFIRM_GOLD or more here
  g.run(`deckSel = { side: "left", i: 0 }; armKey = null`);
  assert.equal(g.run(`gunAct("buy", { id: "long12" })`), null);
  assert.equal(g.run("save.left[0]"), null);
  assert.match(g.run("armoryHtml()"), /data-armed="1"[^>]*>Tap again to confirm: buy for 70 gold/);
  assert.equal(g.run(`gunAct("buy", { id: "long12" })`), "buy");
  assert.equal(g.run("save.left[0].g"), "long12");
});

test("another tap elsewhere puts the armed upgrade down: the second tap on a different key arms that one instead", () => {
  const g = boot();
  g.run(TWO_TAP);
  ship(g, `bow: [gunItem("six", 4)], left: [null, null], store: []`);
  g.run(`deckSel = { side: "bow", i: 0 }`);
  g.run(`gunAct("gup", {})`);
  assert.equal(g.run(`gunAct("buy", { id: "long12" })`), null, "a different button: arms itself, spends nothing");
  assert.equal(g.run("save.bow[0].lv"), 4);
  assert.equal(g.run("save.left[0]"), null);
});

test("breaking down: a single piece and each bulk button take a second tap; a locked piece is never broken", () => {
  const g = boot();
  g.run(TWO_TAP);
  ship(g, `store: [gunItem("six", 1), gunItem("six", 1)]`);
  g.run(`save.gear = { ...save.gear, bag: [{ p: "prow", lv: 1, il: 1 }], mats: 0 }`);
  const mats0 = g.run("save.gear.mats");
  assert.equal(g.run(`gearAct("gbatch", { r: "0" })`), null, "first tap arms");
  assert.equal(g.run("save.gear.mats"), mats0);
  assert.equal(g.run("save.store.length"), 2);
  assert.match(g.run("bagHtml()"), /data-r="0"[^>]*data-armed="1">Tap again to confirm: break down 3/);
  assert.equal(g.run(`gearAct("gbatch", { r: "0" })`), "buy", "second tap breaks them down");
  assert.equal(g.run("save.store.length + save.gear.bag.length"), 0);
  assert.ok(g.run("save.gear.mats") > mats0);
  // single scrap
  g.run(`save.gear = { ...save.gear, bag: [{ p: "prow", lv: 1, il: 1 }] }; gearSel = { w: "bag", i: 0 }; armKey = null`);
  assert.equal(g.run(`gearAct("gscrap", { w: "gear" })`), null);
  assert.equal(g.run("save.gear.bag.length"), 1);
  assert.match(g.run("cardHtml()"), /data-act="gscrap"[^>]*data-armed="1">Tap again to confirm: break down/);
  assert.equal(g.run(`gearAct("gscrap", { w: "gear" })`), "buy");
  assert.equal(g.run("save.gear.bag.length"), 0);
});

test("the bulk break-down is a block of its own with a warning, apart from the spares", () => {
  const g = boot();
  const html = g.run("bagHtml()");
  assert.match(html, /class="gbulk"/);
  assert.match(html, /Break down in bulk/);
  assert.match(html, /cannot be undone/);
  assert.ok(html.indexOf('class="gbulk"') > html.indexOf('class="hint-s"'), "after the spares and their hint");
  const z = boot("zh");
  assert.match(z.run("bagHtml()"), /批次拆解[\s\S]*拆了就回不來/);
});

test("gear jargon is explained in plain words in both languages: affix, fittings, break down", () => {
  for (const lang of ["en", "zh"]) {
    const g = boot(lang), s = k => g.run(`t("${k}")`);
    for (const k of ["gFitHint", "gAffixHint", "gBulkHint", "gScrapTip", "gScrapArm", "gBatchArm", "gearHint", "gBulkHead"]) assert.ok(s(k) && s(k) !== k, `${lang} ${k}`);
  }
  const en = boot("en");
  assert.match(en.run(`t("gFitHint")`), /Fittings are scrap/);
  assert.match(en.run(`t("gFitHint")`), /affix is an extra bonus line/i);
  const zh = boot("zh");
  assert.match(zh.run(`t("gFitHint")`), /詞綴是裝備上額外多出來的加成/);
  assert.match(zh.run(`t("gearHint")`), /詞綴 = /);
});

test("the sortie settlement card has its own title; the sunk row is a labelled count, not a title", () => {
  const src = readFileSync(new URL("../js/juice-ui.js", import.meta.url), "utf8");   // juice-ui.js needs the whole page: read its strings and its markup from the source
  assert.match(src, /tallyTitle: "Sortie settlement", tallySunk: "Ships sunk"/);
  assert.match(src, /tallyTitle: "出航結算", tallySunk: "擊沉艘數"/);
  assert.match(src, /class="t-title">\$\{t\("tallyTitle"\)\}[\s\S]*class="t-sunk"[\s\S]*class="t-n">×\$\{sunk\}/, "the title comes first, over the sunk row with its count");
});
