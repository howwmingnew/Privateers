// Unit tests for the new-captain safety net: the novice rules (js/novice.js), the aground timer (js/aground.js), the hit-glowection
// sectors (js/hit-glow.js), the edge-marker limits (js/edge-math.js) and the touch-screen chart default (js/settings.js).
// Pure functions only, loaded into node:vm contexts. Usage: node --test tests/unit-safety.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
// a DOM that accepts anything: the modules build their elements at load time
const dom = new Proxy(function () {}, { get: (_, k) => (k === "length" ? 0 : dom), apply: () => dom, construct: () => dom, set: () => true });
function boot(files, extra = {}) {
  const store = new Map();
  const ctx = vm.createContext({
    console, Math, Map, Set, Array, Number, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) }, navigator: { language: "en-US" },
    onHook() {}, STR: { en: {}, zh: {} }, shipRating: () => 1, player: null, ...extra,
  });
  for (const f of files) vm.runInContext(src(f), ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}

test("novice: a low rating inside the Shallows is a novice, a deeper ring or a higher rating is not", () => {
  const g = boot(["js/novice.js"]);
  assert.equal(g.run("noviceAt(1, 1)"), true);
  assert.equal(g.run("noviceAt(NOVICE_LV - 1, NOVICE_RINGS)"), true);
  assert.equal(g.run("noviceAt(NOVICE_LV, 1)"), false, "rated Lv 4: no longer a novice");
  assert.equal(g.run("noviceAt(1, NOVICE_RINGS + 1)"), false, "the Reef Straits keep their crowd");
});

test("novice: a ship made in the Shallows fights at most one level above the captain", () => {
  const g = boot(["js/novice.js"]);
  assert.equal(g.run("noviceCap(2)"), 3);
  assert.equal(g.run("noviceCap(1)"), 2);
});

test("sea warning: only a sea three or more levels above the rating warns", () => {
  const g = boot(["js/novice.js"]);
  assert.equal(g.run("seaWarnGap(6, 2)"), true, "Navy Lanes (Lv 6) for a Lv 2 captain");
  assert.equal(g.run("seaWarnGap(3, 1)"), false, "Reef Straits (Lv 3) for a new captain stay a plain banner");
  assert.equal(g.run("seaWarnGap(9, 6)"), true);
  assert.equal(g.run("seaWarnGap(6, 5)"), false);
  assert.equal(g.run("seaWarnGap(3, 4)"), false, "a sea below the rating never warns");
});

test("novice start sea keeps a thinner crowd than the normal split, with the same total", () => {
  const g = boot(["js/config.js", "js/novice.js"]);
  assert.ok(g.run("NOVICE_NEAR_SHARE") < 0.6, "fewer ships near a novice than the usual 60% near-ring share");
  assert.ok(g.run("Math.round(ENEMY_COUNT * NOVICE_NEAR_SHARE) / NOVICE_RINGS") < g.run("Math.round(ENEMY_COUNT * 0.6) / 3"), "fewer per ring in the Shallows");
});

test("aground: a hull that asks for way and barely moves is aground after GROUND_T, and floats free once moving", () => {
  const g = boot(["js/config.js", "js/aground.js"]);
  g.run("var st = { t: 0, on: false }; const MAXS = 150, dt = 1 / 60;");
  assert.equal(g.run("(st = groundStep(st, 150, 2, MAXS, dt), st.on)"), false, "the first frame is not aground yet");
  g.run("for (let i = 0; i < 70; i++) st = groundStep(st, 150, 2, MAXS, dt);");
  assert.equal(g.run("st.on"), true, "over 1 s of pushing and not moving");
  g.run("for (let i = 0; i < 30; i++) st = groundStep(st, 150, 140, MAXS, dt);");
  assert.equal(g.run("st.on"), false, "moving freely again clears it");
});

test("aground: nothing asked, a gentle sail step that is met, or a ship making way never counts", () => {
  const g = boot(["js/config.js", "js/aground.js"]);
  const run = (ask, moved, n = 600) => g.run(`(() => { let st = { t: 0, on: false }; for (let i = 0; i < ${n}; i++) st = groundStep(st, ${ask}, ${moved}, 150, 1 / 60); return st.on; })()`);
  assert.equal(run(0, 0), false, "stopped on purpose (sail furled)");
  assert.equal(run(10, 0), false, "an ask below GROUND_ASK of top speed is no push");
  assert.equal(run(52, 40), false, "a slow sail that is met");
  assert.equal(run(150, 5), true);
});

test("aground: pinned with no rock within reach (an enemy hull, the map edge, a grapple) is not aground; nearRock sees islands", () => {
  const g = boot(["js/config.js", "js/aground.js"]);
  assert.equal(g.run("(() => { let st = { t: 0, on: false }; for (let i = 0; i < 600; i++) st = groundStep(st, 150, 0, 150, 1 / 60, false); return st.on; })()"), false);
  g.run("var islandsNear = () => [{ x: 100, y: 100, r: 50 }];");
  assert.equal(g.run("nearRock(100, 150)"), true, "touching the rock");
  assert.equal(g.run("nearRock(100, 400)"), false, "open water");
});

test("aground: the speed readout uses the ship yard's knots", () => {
  const g = boot(["js/config.js", "js/aground.js"]);
  assert.equal(g.run("SPEED_KN_PX"), 15);
});

test("hit direction: bearings fall on sixteen marks, 0 = east, clockwise on screen, wrapping at the turn", () => {
  const g = boot(["js/config.js", "js/util.js", "js/hit-glow.js"]);
  assert.equal(g.run("glowSector(0)"), 0);
  assert.equal(g.run("glowSector(Math.PI / 2)"), 4, "south (+y is down)");
  assert.equal(g.run("glowSector(Math.PI)"), 8);
  assert.equal(g.run("glowSector(-Math.PI / 2)"), 12, "north");
  assert.equal(g.run("glowSector(-0.01)"), 0, "just under east is still the east mark");
  assert.equal(g.run("glowSector(TAU - 0.01)"), 0);
  assert.equal(g.run("glowSector(-Math.PI)"), 8);
});

test("edge markers: a touch screen or a narrow window gets three boxes, a wide desktop five", () => {
  const g = boot(["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/edge-math.js"]);
  assert.equal(g.run("edgeMax(true, 1280)"), 3);
  assert.equal(g.run("edgeMax(false, 600)"), 3);
  assert.equal(g.run("edgeMax(false, 1280)"), 5);
  const ids = g.json(`edgePick([{ id: "a", kind: "ship", d: 0, px: 900 }, { id: "b", kind: "ship", d: 2, px: 1500 }, { id: "c", kind: "ship", d: 0, px: 300 }, { id: "d", kind: "ship", d: -1, px: 200 }], 3).map(i => i.id)`);
  assert.deepEqual(ids, ["b", "d", "c"], "the stronger ship first, then the nearest ones; the farthest drops out");
});

test("edge markers: the threat step is clamped to the chart's four tiers", () => {
  const g = boot(["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/edge-math.js"]);
  assert.deepEqual([5, 2, 1, 0, -1, -4].map(d => g.run(`edgeThreat(${d})`)), [2, 2, 1, 0, -1, -1]);
});

test("chart size: a touch screen starts at MINI_COARSE_PCT, a mouse screen at 100%, and a stored choice always wins", () => {
  const coarse = { matchMedia: q => ({ matches: /coarse/.test(q) }) };
  assert.equal(boot(["js/config.js", "js/settings.js"], coarse).run("SETTINGS.miniPct"), 150);
  assert.equal(boot(["js/config.js", "js/settings.js"]).run("SETTINGS.miniPct"), 100);
  const keep = boot(["js/config.js", "js/settings.js"], { ...coarse, localStorage: { getItem: () => JSON.stringify({ miniPct: 80 }), setItem() {} } });
  assert.equal(keep.run("SETTINGS.miniPct"), 80);
  assert.equal(boot(["js/config.js", "js/settings.js"], coarse).run("SETTINGS.uiPct"), 100, "only the chart changes");
});
