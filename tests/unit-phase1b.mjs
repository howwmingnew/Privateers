// Unit tests for the phase 1 additions (#33 #34 #40 #41 #42): pure functions only, the scripts load into one node:vm context,
// as in tests/unit.mjs. Usage: node --test tests/unit-phase1b.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/ai-nav.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);

function boot() {
  const ctx = vm.createContext({ console });
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}

// ---------- #41: AI navigation around the outpost ----------
test("a wander point inside a circle is pushed out past its edge, a clear one is kept", () => {
  const g = boot();
  assert.deepEqual(g.json("clearOfCircle({ x: 900, y: 500 }, { x: 500, y: 500 }, 300)"), { x: 900, y: 500 });
  const p = g.json("clearOfCircle({ x: 600, y: 500 }, { x: 500, y: 500 }, 300)");
  assert.ok(Math.abs(Math.hypot(p.x - 500, p.y - 500) - 340) < 1e-9, "placed TRUCE_PAD past the edge");
  assert.ok(Math.abs(p.y - 500) < 1e-9 && p.x > 500, "straight out along the same bearing");
  const mid = g.json("clearOfCircle({ x: 500, y: 500 }, { x: 500, y: 500 }, 300)");
  assert.ok(Math.hypot(mid.x - 500, mid.y - 500) > 300, "the exact centre also gets out");
  assert.deepEqual(g.json("clearOfCircle({ x: 500, y: 500 }, null, 300)"), { x: 500, y: 500 }, "no outpost, no change");
});

const ship = (x, y, rot, extra = "") => `{ x: ${x}, y: ${y}, rot: ${rot}, ${extra} }`;
const rock = "{ x: 1000, y: 1000, r: 48 }";

test("a ship far from a rock, or heading away from it, keeps its course", () => {
  const g = boot();
  assert.equal(g.run(`slideOff(${ship(0, 1000, 0)}, ${rock}, 0.3)`), 0.3);
  assert.equal(g.run(`slideOff(${ship(900, 1000, Math.PI)}, ${rock}, 2)`), 2);
});

test("a ship about to touch a rock turns along its rim, on the side nearer its goal", () => {
  const g = boot();
  // 100 px west of the rock, bow at it; goal to the north-east (negative y is up) or south-east
  const north = g.run(`slideOff(${ship(900, 1000, 0)}, ${rock}, -0.6)`), south = g.run(`slideOff(${ship(900, 1000, 0)}, ${rock}, 0.6)`);
  assert.ok(north < -1 && south > 1, "turned well off the bow");
  assert.ok(Math.abs(Math.abs(north) - 1.8) < 1e-9 && Math.abs(south - 1.8) < 1e-9, "RIM_TURN from the line to the centre");
  assert.ok(Math.abs(g.run(`angDiff(${north}, 0)`)) > Math.PI / 2, "and more than a right angle, so it also draws off the rock");
});

test("a ship with no goal slides to the side its bow already leans to", () => {
  const g = boot();
  const left = g.run(`slideOff(${ship(900, 990, 0)}, ${rock}, null)`), right = g.run(`slideOff(${ship(900, 1010, 0)}, ${rock}, null)`);
  assert.ok(left < 0 && right > 0, "off-centre bow: turn away from the centre line");
});

test("a bigger hull starts sliding earlier than a small one", () => {
  const g = boot();
  const at = hull => g.run(`slideOff(${ship(850, 1000, 0, hull)}, ${rock}, 0.4) !== 0.4`);
  assert.equal(at("hl: 20, hw: 10"), false);
  assert.equal(at("hl: 60, hw: 25"), true);
});

test("slide turns never point back into the rock: a ship sliding off keeps leaving it", () => {
  const g = boot();
  for (const y of [960, 980, 1000, 1020, 1040]) for (const goal of [-1.5, 0, 1.5]) {
    const h = g.run(`slideOff(${ship(900, y, 0)}, ${rock}, ${goal})`);
    const toward = Math.cos(h) * (1000 - 900) + Math.sin(h) * (1000 - y);
    assert.ok(toward < 0, `heading ${h.toFixed(2)} from y=${y} goal ${goal} leaves the rock`);
  }
});

// ---------- #34: gun bay (js/gunbay.js) ----------
const BAY_FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/gunbay.js"];
const BAY_SRC = BAY_FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
// Any property or call on a stand-in DOM object is accepted: settings.js touches the page at load time.
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
// A fresh page load in `lang`; the save gets two guns on the bow and one in the store.
function bay(lang = "en") {
  const store = new Map([["privateers-lang", lang]]);
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }), console, setTimeout, clearTimeout,
  });
  for (const [f, code] of BAY_SRC) vm.runInContext(code, ctx, { filename: f });
  vm.runInContext(`var portMsg = null;`, ctx);   // js/harbor.js owns it
  vm.runInContext(`save = { ...save, gold: 100000, bow: [gunItem("six", 2), gunItem("long12", 1)], store: [gunItem("chain", 1)] }; deckSel = null; swapping = false;`, ctx);
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}
const bowIds = g => g.json("save.bow.map(x => x && x.g)");
const tap = (g, side, i) => g.run(`gunAct(${side === "store" ? '"store"' : '"slot"'}, { side: "${side}", i: "${i}" })`);

test("gun bay: tapping a second gun only moves the pick, it never swaps", () => {
  const g = bay();
  tap(g, "bow", 0); tap(g, "bow", 1);
  assert.deepEqual(bowIds(g), ["six", "long12"]);
  assert.deepEqual(g.json("deckSel"), { side: "bow", i: 1 });
  tap(g, "store", 0);
  assert.deepEqual(bowIds(g), ["six", "long12"]);
  assert.deepEqual(g.json("save.store.map(x => x.g)"), ["chain"]);
});

test("gun bay: after Swap position, the next tap on another port swaps the two guns and ends the swap", () => {
  const g = bay();
  tap(g, "bow", 0);
  assert.equal(g.run(`gunAct("swap", {})`), "uiClick");
  assert.equal(g.run("swapping"), true);
  assert.equal(tap(g, "bow", 1), "reload");
  assert.deepEqual(bowIds(g), ["long12", "six"]);
  assert.equal(g.run("swapping"), false);
  assert.equal(g.run("deckSel"), null);
});

test("gun bay: a swap with the store trades the gun for the stored one", () => {
  const g = bay();
  tap(g, "bow", 1); g.run(`gunAct("swap", {})`); tap(g, "store", 0);
  assert.deepEqual(bowIds(g), ["six", "chain"]);
  assert.deepEqual(g.json("save.store.map(x => x.g)"), ["long12"]);
});

test("gun bay: Swap position pressed again, or a tap on the picked gun, cancels with nothing moved", () => {
  const g = bay();
  tap(g, "bow", 0); g.run(`gunAct("swap", {})`); g.run(`gunAct("swap", {})`);
  assert.equal(g.run("swapping"), false);
  g.run(`gunAct("swap", {})`); tap(g, "bow", 0);
  assert.equal(g.run("swapping"), false);
  assert.deepEqual(g.json("deckSel"), { side: "bow", i: 0 }, "the gun stays picked");
  assert.deepEqual(bowIds(g), ["six", "long12"]);
});

test("gun bay: swapping never trades two stored guns or two empty ports, and needs a gun picked", () => {
  const g = bay();
  assert.equal(g.run(`gunAct("swap", {})`), null, "nothing picked");
  g.run(`save = { ...save, store: [gunItem("chain", 1), gunItem("six", 1)] }`);
  tap(g, "store", 0);
  assert.equal(g.run("swapPlaces(deckSel).some(p => p.side === 'store')"), false);
  g.run(`save = { ...save, ...Object.fromEntries(MOUNTS.map(({ key }) => [key, save[key].map(() => null)])), store: [] }; deckSel = { side: "bow", i: 0 }`);
  assert.equal(g.run("canSwap()"), false);
  assert.equal(g.run(`gunAct("swap", {})`), null);
});

test("gun bay: buying and unloading end a pending swap", () => {
  const g = bay();
  tap(g, "bow", 0); g.run(`gunAct("swap", {})`); g.run(`gunAct("unload", {})`);
  assert.equal(g.run("swapping"), false);
  g.run(`gunAct("swap", {})`); g.run(`gunAct("buy", { id: "six" })`);
  assert.equal(g.run("swapping"), false);
});

test("gun bay: the upgrade button names the next level and its price, in both languages", () => {
  const en = bay("en"), zh = bay("zh");
  en.run(`deckSel = { side: "bow", i: 0 }`); zh.run(`deckSel = { side: "bow", i: 0 }`);
  const cost = en.run("fmt(gunUpCost(save.bow[0]))");
  assert.ok(en.run("gunCardHtml()").includes(`Upgrade to Lv 3 (${cost} gold)`));
  assert.ok(zh.run("gunCardHtml()").includes(`升級到 Lv 3（${cost} 金幣）`));
  assert.doesNotMatch(en.run("gunCardHtml()"), /data-act="gup" disabled/);
});

test("gun bay: too little gold shows the shortfall and disables the button; max level says so and is disabled", () => {
  const g = bay();
  g.run(`deckSel = { side: "bow", i: 0 }; save.gold = gunUpCost(save.bow[0]) - 40`);
  assert.match(g.run("gunCardHtml()"), /data-act="gup" disabled>Upgrade to Lv 3 \(\d[\d,]* gold, 40 short\)/);
  g.run(`save.bow[0] = gunItem("six", GUN_MAX)`);
  assert.match(g.run("gunCardHtml()"), /class="btn max" type="button" disabled>Max level/);
  assert.match(bay("zh").run(`deckSel = { side: "bow", i: 0 }; save.bow[0] = gunItem("six", GUN_MAX); gunCardHtml()`), /disabled>已滿級/);
});

test("gun bay: the swap button, its on state and the hint show while swapping", () => {
  const g = bay();
  g.run(`deckSel = { side: "bow", i: 0 }`);
  assert.match(g.run("gunCardHtml()"), /data-act="swap" aria-pressed="false" >Swap position/);
  g.run("swapping = true");
  const html = g.run("gunCardHtml()");
  assert.match(html, /gcard swapping/); assert.match(html, /aria-pressed="true"[^>]*>Cancel swap/); assert.match(html, /Esc cancels/);
});

// ---------- #33: letter of marque, level warning (js/bounty-rec.js) ----------
test("letter of marque: only a ship level below the asked one is short, and both languages have the sentence", () => {
  const store = new Map([["privateers-lang", "zh"]]);
  const ctx = vm.createContext({ localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem() {}, removeItem() {} }, navigator: { language: "en-US" },
    document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }), console });
  for (const f of ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/bounty-rec.js"]) vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), ctx, { filename: f });
  const run = code => vm.runInContext(code, ctx);
  assert.deepEqual([run("recShort(4, 2)"), run("recShort(4, 3)"), run("recShort(4, 4)"), run("recShort(4, 9)")], [true, true, false, false]);
  assert.equal(run('t("pRecLow")'), "建議先升級再出戰");
  assert.equal(run('STR.en.pRecLow'), "Level up before you sail");
});
