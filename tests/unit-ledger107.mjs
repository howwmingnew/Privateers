// Unit tests for #107: what buying a ship or a gun does to Ship Lv, the empty-port count, the ledger's itemised charges, the bottom-notice stacker
// and the HUD's escort chips. Pure functions, loaded into one node:vm context (DOM and hooks stubbed).
// Usage: node --test tests/unit-ledger107.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/save-campaign.js", "js/shipyard.js", "js/escorts.js", "js/gunbay.js", "js/lv-path.js", "js/ledger-gold.js", "js/hud-stack.js", "js/escort-hud.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);

function boot(lang = "en") {
  const store = new Map([["privateers-lang", lang]]), domReady = [];
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() },
    navigator: { language: "en-US" }, document: { addEventListener: (type, fn) => { if (type === "DOMContentLoaded") domReady.push(fn); }, getElementById: () => null }, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
  });
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  vm.runInContext("var portMsg = null; var renderPort = () => {};", ctx);   // js/harbor.js owns them (js/gunbay.js calls them)
  domReady.forEach(fn => fn());
  const run = code => vm.runInContext(code, ctx);
  return { run, json: code => JSON.parse(run(`JSON.stringify(${code})`)) };
}

test("lvGainShip: a bigger hull with the guns carried over names its Ship Lv, the preview leaves the save alone and ignores the price", () => {
  const g = boot();
  g.run("save.gold = 0");
  const before = g.run("JSON.stringify(save)");
  const out = g.run("lvGainShip('brig')");
  assert.match(out, /^Ship Lv (→ \d+|progress [+−]\d+%|unchanged|falls to \d+)/, out);
  assert.equal(g.run("JSON.stringify(save)"), before, "the swapped-in preview save was put back");
  assert.equal(g.run("lvGainShip('nope')"), "", "an unknown model has no preview");
});

test("lvGainShip: the preview matches what buying really does to the rating", () => {
  const g = boot();
  for (const id of ["schooner", "brig", "frigate"]) {
    const a = g.json("lvProgress()"), b = g.json(`(() => { const real = save; save = buyShip({ ...save, gold: 1e9 }, '${id}'); try { return lvProgress(); } finally { save = real; } })()`);
    const text = g.run(`lvGainShip('${id}')`);
    if (b.lv > a.lv) assert.equal(text, `Ship Lv → ${b.lv}`);
    else if (b.lv < a.lv) assert.match(text, /^Ship Lv falls to/);
    else assert.ok(/progress|unchanged/.test(text), text);
  }
});

test("lvGainNewGun: an empty port counts the gun, a port with a gun swaps it, no flagship port says it goes to the store", () => {
  const g = boot();
  g.run("save.left[0] = null");
  const into = g.json("{ side: 'left', i: 0 }");
  assert.match(g.run(`lvGainNewGun('six', ${JSON.stringify(into)})`), /^Ship Lv progress \+\d+%$/, "filling the empty port adds firepower");
  assert.match(g.run("lvGainNewGun('six', null)"), /store/);
  assert.equal(g.run("typeof lvGainNewGun('six', { side: 'bow', i: 0 })"), "string");
});

test("lvGainNewGun: a Lv 1 gun bought over a high-level one is a loss, shown as such", () => {
  const g = boot();
  g.run("save.left[0] = { g: 'six', lv: 9 }");
  const into = JSON.stringify(g.json("{ side: 'left', i: 0 }"));
  const out = g.run(`lvGainNewGun('six', ${into})`);
  assert.match(out, /^Ship Lv (progress −\d+%|falls to \d+)$/, out);
  assert.equal(g.run("JSON.stringify(save.left[0])"), '{"g":"six","lv":9}', "the preview leaves the gun alone");
});

test("emptyPortsOf counts the empty ports of the flagship and of an escort's ship", () => {
  const g = boot();
  const total = g.run("MOUNTS.reduce((c, { key }) => c + save[key].length, 0)");
  g.run("for (const { key } of MOUNTS) save[key] = save[key].map(() => null)");
  assert.equal(g.run("emptyPortsOf(0)"), total);
  g.run("save.left[0] = { g: 'six', lv: 1 }");
  assert.equal(g.run("emptyPortsOf(0)"), total - 1);
  assert.equal(g.run("emptyPortsOf(1)"), 0, "no escort in slot 1: nothing to fill");
});

test("billLines keeps only the charges that happened, rounded", () => {
  const g = boot();
  assert.deepEqual(g.json("billLines(null, 0, 0)"), []);
  assert.deepEqual(g.json("billLines({ paid: 120 }, 0, 0)"), [{ key: "billEsc", n: 120 }]);
  assert.deepEqual(g.json("billLines({ paid: 0 }, 35.4, 80)"), [{ key: "billFee", n: 35 }, { key: "billOwed", n: 80 }]);
});

test("stackLift pushes a box clear of the touch pad and of each box already placed, and leaves a clear one alone", () => {
  const g = boot();
  const pad = { left: 200, right: 380, top: 640, bottom: 700 };
  assert.equal(g.run(`stackLift({ left: 10, right: 100, top: 600, bottom: 640 }, [${JSON.stringify(pad)}])`), 0, "off to the left of the pad");
  assert.equal(g.run(`stackLift({ left: 100, right: 380, top: 650, bottom: 690 }, [${JSON.stringify(pad)}])`), 690 - 640 + 8, "on the pad: up past its top edge plus the gap");
  const two = [pad, { left: 0, right: 390, top: 560, bottom: 632 }];
  const lift = g.run(`stackLift({ left: 100, right: 380, top: 650, bottom: 690 }, ${JSON.stringify(two)})`);
  assert.ok(690 - lift <= 560 - 8 + 1e-9, `clear of both (lift ${lift})`);
});

test("escHudRows: the share of hull left, at least 1% while afloat, 0 and sunk once down", () => {
  const g = boot();
  const rows = g.json("escHudRows([{ slot: 0, e: { alive: true, hp: 55.4, maxHp: 100 } }, { slot: 2, e: { alive: true, hp: 0.1, maxHp: 100 } }, { slot: 1, e: { alive: false, hp: 0, maxHp: 100 } }])");
  assert.deepEqual(rows, [{ n: 1, p: 55, sunk: false, hit: false }, { n: 3, p: 1, sunk: false, hit: false }, { n: 2, p: 0, sunk: true, hit: false }]);
});

test("the new strings exist in both languages", () => {
  const g = boot();
  for (const k of ["lvGainDown", "lvLossPct", "lvSame", "lvGainStore", "lvGainEsc", "emptyFirst", "billsHead", "billSep", "billEnd", "billEsc", "billFee", "billOwed", "escHudTag", "escHudSunk", "escHudAria", "shipArm", "escBuyArm"])
    assert.ok(g.run(`STR.en.${k} && STR.zh.${k}`), k);
  assert.equal(g.run("STR.zh.shipArm"), "確認購買？");
});

test("stackFit never lifts a box past the top of the screen", () => {
  const g = boot();
  assert.equal(g.run("stackFit(100, 500)"), 100, "room to spare");
  assert.equal(g.run("stackFit(300, 120)"), 120 - 8, "capped at the top margin");
  assert.equal(g.run("stackFit(50, 4)"), 0, "no room at all");
});
