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
  vm.runInContext(`var portMsg = null; var renderPort = () => {};`, ctx);   // js/harbor.js owns them
  vm.runInContext(`save = { ...save, gold: 100000, bow: [gunItem("six", 2), gunItem("long12", 1)], store: [gunItem("chain", 1)] }; deckSel = null; gunNote = null;`, ctx);
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}
const bowIds = g => g.json("save.bow.map(x => x && x.g)");
const tap = (g, side, i) => g.run(`gunAct(${side === "store" ? '"store"' : '"slot"'}, { side: "${side}", i: "${i}" })`);

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

// ---------- #42: chart marks (js/mini-marks.js) ----------
function marks() {
  const ctx = vm.createContext({ console });
  for (const f of ["js/config.js", "js/util.js", "js/mini-marks.js"]) vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}

test("chart marks: each ship kind has its own mark kind, from faction and class", () => {
  const g = marks();
  const kind = e => g.run(`shipKind(${JSON.stringify(e)})`);
  assert.equal(kind({ faction: "pirate" }), "pirate");
  assert.equal(kind({ faction: "navy" }), "navy");
  assert.equal(kind({ faction: "merchant" }), "trade");
  assert.equal(kind({ faction: "navy", merchant: true }), "trade", "an escort's flag does not matter once it is a merchantman");
  assert.equal(kind({ faction: "pirate", arch: "fireship" }), "fire");
  assert.equal(kind({ faction: "pirate", arch: "brig" }), "pirate");
});

test("chart marks: one solid part for ▼ ● ▲, two for ▲▲, so the inner detail sits inside every one", () => {
  const g = marks();
  for (const d of [-3, -1, 0, 1]) assert.equal(g.json(`threatCenters({ d: ${d} }, 10, 10, 4)`).length, 1, "d=" + d);
  const two = g.json("threatCenters({ d: 2 }, 10, 10, 4)");
  assert.equal(two.length, 2);
  assert.ok(two[0][0] < 10 && two[1][0] > 10 && two[0][1] === 10 && two[0][2] > 0, "left and right of the centre");
});

test("chart marks: ships in one cell merge into the scariest one with a count; far-apart ones stay", () => {
  const g = marks();
  const out = g.json(`clusterMarks([{ id: "a", x: 10, y: 10, rank: -1 }, { id: "b", x: 12, y: 11, rank: 2 }, { id: "c", x: 13, y: 12, rank: 0 }, { id: "d", x: 60, y: 10, rank: 1 }], 20)`);
  assert.equal(out.length, 2);
  const merged = out.find(o => o.n === 3);
  assert.equal(merged.id, "b", "the highest rank represents the group");
  assert.equal(out.find(o => o.n === 1).id, "d");
  assert.deepEqual(g.json("clusterMarks([], 20)"), []);
});

test("chart marks: a speck of island becomes a 4-5 sided chip, the same every time, around its centre", () => {
  const g = marks();
  const seen = new Set();
  for (let s = 0; s < 1; s += 0.037) {
    const poly = g.json(`smallIslandPoly(${s}, 100, 50, 3)`), again = g.json(`smallIslandPoly(${s}, 100, 50, 3)`);
    assert.deepEqual(poly, again);
    assert.ok(poly.length >= 4 && poly.length <= 5, `seed ${s}: ${poly.length} sides`);
    seen.add(poly.length);
    for (const [x, y] of poly) { const r = Math.hypot(x - 100, y - 50); assert.ok(r > 2.4 && r < 4, `radius ${r}`); }
  }
  assert.equal(seen.size, 2, "both 4 and 5 sides occur");
});

// ---------- #40: edge markers (js/edge-math.js) ----------
function edge(lang = "en") {
  const store = new Map([["privateers-lang", lang]]);
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem() {}, removeItem() {} }, navigator: { language: "en-US" },
    document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }), console,
  });
  for (const f of ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/edge-math.js"]) vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}

test("edge markers: world pixels become metres rounded to 10, never 0", () => {
  const g = edge();
  const m = px => g.run(`edgeMeters(${px})`);
  assert.equal(m(640), 320);               // 0.5 m per px
  assert.equal(m(643), 320);               // 321.5 -> 320
  assert.equal(m(647), 320);               // 323.5 -> 320
  assert.equal(m(650), 330);               // 325 -> 330
  assert.equal(m(1), 10);
  assert.equal(m(0), 10);
  assert.equal(m(2300), 1150);
});

test("edge markers: the distance reads '~320 m' / '約 320 公尺'", () => {
  assert.equal(edge("en").run("edgeLabel(640)"), "~320 m");
  assert.equal(edge("zh").run("edgeLabel(640)"), "約 320 公尺");
});

test("edge markers: the ray from the middle meets the rectangle on the side it points to", () => {
  const g = edge(), R = "{ l: 10, t: 50, r: 410, b: 250 }";   // centre (210, 150), half 200 x 100
  const at = (dx, dy) => g.json(`edgePoint(${R}, ${dx}, ${dy})`);
  assert.deepEqual(at(1000, 0), { x: 410, y: 150, side: "right" });
  assert.deepEqual(at(-1000, 0), { x: 10, y: 150, side: "left" });
  assert.deepEqual(at(0, -500), { x: 210, y: 50, side: "top" });
  assert.deepEqual(at(0, 500), { x: 210, y: 250, side: "bottom" });
  const diag = at(400, 100);   // shallow angle: leaves through the right side, a quarter of the way down
  assert.equal(diag.side, "right"); assert.ok(Math.abs(diag.x - 410) < 1e-6 && Math.abs(diag.y - 200) < 1e-6);
  const steep = at(100, -400);
  assert.equal(steep.side, "top"); assert.ok(Math.abs(steep.y - 50) < 1e-6 && Math.abs(steep.x - 235) < 1e-6);
  const same = at(0, 0); assert.ok(Number.isFinite(same.x) && Number.isFinite(same.y), "a target right at the centre does not blow up");
});

test("edge markers: boxes on one edge keep their order and a gap, inside the edge", () => {
  const g = edge();
  const s = (pos, gap, lo, hi) => g.json(`spreadAlong(${JSON.stringify(pos)}, ${gap}, ${lo}, ${hi})`);
  assert.deepEqual(s([100], 30, 0, 500), [100]);
  assert.deepEqual(s([100, 400], 30, 0, 500), [100, 400], "already apart: untouched");
  const t = s([100, 105, 110], 30, 0, 500);
  assert.ok(t[1] - t[0] >= 30 - 1e-9 && t[2] - t[1] >= 30 - 1e-9, JSON.stringify(t));
  const edgeCase = s([490, 495, 500], 30, 0, 500);   // piled at the far end: pushed back in
  assert.ok(edgeCase[2] <= 500 && edgeCase[1] <= edgeCase[2] - 30 + 1e-9 && edgeCase[0] <= edgeCase[1] - 30 + 1e-9, JSON.stringify(edgeCase));
  const order = s([300, 100, 200], 30, 0, 500);   // the input order is kept in the output
  assert.ok(order[1] < order[2] && order[2] < order[0]);
  const crowd = s([10, 11, 12, 13, 14], 100, 0, 200);   // cannot fit: spread evenly
  assert.deepEqual(crowd, [0, 50, 100, 150, 200]);
  assert.ok(s([-50, 700], 30, 0, 500).every(v => v >= 0 && v <= 500), "clamped into the edge");
});

test("edge markers: a box slides along its edge clear of blocked spans, and stays inside the edge", () => {
  const g = edge();
  const d = (pos, half, spans, lo, hi) => g.run(`dodgeAlong(${pos}, ${half}, ${JSON.stringify(spans)}, ${lo}, ${hi})`);
  assert.equal(d(100, 20, [], 0, 500), 100);
  assert.equal(d(100, 20, [[300, 400]], 0, 500), 100, "span elsewhere: untouched");
  assert.equal(d(340, 20, [[300, 400]], 0, 500), 280, "nearer the low end of the span: slides down");
  assert.equal(d(370, 20, [[300, 400]], 0, 500), 420, "nearer the high end: slides up");
  assert.equal(d(340, 20, [[300, 400]], 290, 500), 420, "no room below: slides up");
  assert.equal(d(340, 20, [[300, 400]], 0, 410), 280, "no room above: slides down");
  const two = d(310, 20, [[300, 340], [350, 400]], 0, 500);   // pushing past one span lands in the next: ends clear of both
  assert.ok(two + 20 <= 300 || two - 20 >= 400, String(two));
});

test("edge markers: the bounty comes first, then stronger ships, then places, nearer before farther; at most five", () => {
  const g = edge();
  const items = [
    { id: "near-weak", kind: "ship", boss: false, d: -1, px: 300 }, { id: "far-boss", kind: "ship", boss: true, d: 0, px: 2300 },
    { id: "far-scary", kind: "ship", boss: false, d: 2, px: 2000 }, { id: "harbor", kind: "place", boss: false, d: 0, px: 800 },
    { id: "near-even", kind: "ship", boss: false, d: 0, px: 400 }, { id: "mid-strong", kind: "ship", boss: false, d: 1, px: 1200 },
    { id: "far-weak", kind: "ship", boss: false, d: -1, px: 2200 },
  ];
  const ids = g.json(`edgePick(${JSON.stringify(items)}).map(i => i.id)`);
  assert.equal(ids.length, 5);
  assert.deepEqual(ids.slice(0, 3), ["far-boss", "far-scary", "mid-strong"]);
  assert.ok(ids.includes("harbor") && !ids.includes("far-weak"), ids.join());
  const pair = g.json(`edgePick([{ id: "a", kind: "ship", d: 0, px: 900 }, { id: "b", kind: "ship", d: 0, px: 300 }]).map(i => i.id)`);
  assert.deepEqual(pair, ["b", "a"], "same danger: the nearer first");
  assert.deepEqual(g.json("edgePick([])"), []);
});
