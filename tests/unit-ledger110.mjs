// Unit tests for #110: the gear wear preview (js/gear-core.js gearWearStats), the "spread the upgrades" check (js/gunbay.js gunSpread), the "need N more"
// buy labels, the strings, and the two-tap bulk upgrade. Scripts load into one node:vm context, as in tests/unit-ledger107.mjs.
// Usage: node --test tests/unit-ledger110.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/gear-core.js", "js/gear-text.js", "js/save.js", "js/save-campaign.js",
  "js/shipyard.js", "js/escorts.js", "js/gear-save.js", "js/gunbay.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
function boot(lang = "en") {
  const store = new Map([["privateers-lang", lang]]), domReady = [];
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() },
    navigator: { language: "en-US" }, document: { addEventListener: (type, fn) => { if (type === "DOMContentLoaded") domReady.push(fn); }, getElementById: () => null },
    console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, performance,
  });
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  vm.runInContext("var portMsg = null; var renderPort = () => {};", ctx);
  domReady.forEach(fn => fn());
  const run = code => vm.runInContext(code, ctx);
  return { run, json: code => JSON.parse(run(`JSON.stringify(${code})`)) };
}
const BASE = "{ hull: 100, sails: 150, hold: 600 }";

test("gearWearStats: a supply hold adds to the hold only, rounded the way applyPlayerStats rounds it", () => {
  const g = boot();
  const out = g.json(`(() => { const it = { p: "supply", lv: 1, il: 3 }; return { stats: gearWearStats({}, it, ${BASE}), tot: gearTotals({ supply: it }) }; })()`);
  assert.ok(out.tot.cargo > 0, "a supply hold gives hold");
  assert.deepEqual(out.stats.map(r => r.k), ["hold"], "only what changes is listed");
  assert.equal(out.stats[0].now, 600);
  assert.equal(out.stats[0].next, Math.round(600 * (1 + out.tot.cargo)));
});

test("gearWearStats: wearing a lesser piece over a better one shows the drop; the same piece shows nothing", () => {
  const g = boot();
  const hi = `{ p: "body", lv: 5, il: 5 }`, lo = `{ p: "body", lv: 1, il: 1 }`;
  const drop = g.json(`gearWearStats({ body: ${hi} }, ${lo}, ${BASE})`);
  assert.ok(drop.length && drop.every(r => r.next < r.now), JSON.stringify(drop));
  assert.deepEqual(g.json(`gearWearStats({ body: ${hi} }, ${hi}, ${BASE})`), []);
});

test("gunSpread: a gun 2+ levels above the lowest on its ship names that gun; the lowest, a close pair and a lone gun say nothing", () => {
  const g = boot();
  g.run(`save.bow = [gunItem("six", 5)]; save.left = [gunItem("six", 2)]; save.right = [gunItem("six", 4)]; save.stern = [];`);
  const hint = g.json(`gunSpread(save, { side: "bow", i: 0 })`);
  assert.equal(hint.d, 3);
  assert.equal(hint.gun.lv, 2);
  assert.equal(g.json(`gunSpread(save, { side: "right", i: 0 })`).d, 2, "two above is enough");
  assert.equal(g.run(`gunSpread(save, { side: "left", i: 0 })`), null, "nothing lower than the lowest");
  g.run(`save.right = [gunItem("six", 3)]`);
  assert.equal(g.run(`gunSpread(save, { side: "right", i: 0 })`), null, "one level above is not worth a warning");
  g.run(`save.bow = [gunItem("six", 9)]; save.left = []; save.right = []`);
  assert.equal(g.run(`gunSpread(save, { side: "bow", i: 0 })`), null, "a lone gun has no one to spread to");
});

test("gunSpread: a stored gun is compared with the flagship's mounted guns; an escort's port with that escort's own", () => {
  const g = boot();
  g.run(`save.bow = [gunItem("six", 2)]; save.left = []; save.right = []; save.stern = []; save.store = [gunItem("six", 6)];`);
  assert.equal(g.json(`gunSpread(save, { side: "store", i: 0 })`).d, 4);
  g.run(`save.escorts = [{ id: "e1", ship: "sloop", guns: { bow: [gunItem("six", 7)], left: [gunItem("six", 1)], right: [], stern: [] } }]`);
  assert.equal(g.json(`gunSpread(save, { side: "bow", i: 0, e: 0 })`).d, 6, "the escort's own ports, not the flagship's Lv 2");
});

test("buy labels say how much gold is missing, in both languages", () => {
  for (const [lang, short, ok] of [["en", "Upgrade 50 (need 20 more)", "Upgrade 50"], ["zh", "升級 50（還差 20 金）", "升級 50"]]) {
    const g = boot(lang);
    assert.equal(g.run(`t("upgradeNeed", { n: 50, d: 20 })`), short);
    assert.equal(g.run(`t("upgrade", { n: 50 })`), ok);
    assert.match(g.run(`t("buyNeed", { n: 70, d: 30 })`), /70/);
    assert.match(g.run(`t("buyNeed", { n: 70, d: 30 })`), /30/);
  }
});

test("the new strings exist in both languages", () => {
  const g = boot();
  for (const k of ["upNArm", "spreadHint", "buyNeed", "upgradeNeed"]) assert.ok(g.run(`STR.en.${k} && STR.zh.${k}`), k);
});
