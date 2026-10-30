// Unit tests for #118 (notices queue by priority, the top lane keeps clear of the ship / tutorial card) and #114 (sea warning by time, way home, map edge).
// Pure functions only, loaded into node:vm contexts. Usage: node --test tests/unit-hud118.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const dom = new Proxy(function () {}, { get: (_, k) => (k === "length" ? 0 : dom), apply: () => dom, construct: () => dom, set: () => true });
function boot(files, pre = "") {
  const ctx = vm.createContext({
    console, Math, Map, Set, Array, Number, JSON, Object, WeakSet, document: dom, window: dom, performance: { now: () => 0 },
    localStorage: { getItem: () => null, setItem() {} }, onHook() {}, STR: { en: {}, zh: {} }, t: k => k, shipRating: () => 1,
  });
  vm.runInContext(pre, ctx);
  for (const f of files) vm.runInContext(src(f), ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}
const WORLD = "const W = 8000, H = 8000, PORT = { x: 4000, y: 4000 }, SAFE_R = 620, ZONE_STEP = 320; const clamp = (v, a, b) => Math.min(b, Math.max(a, v));" +
  "const SEAS = [{ id: 'shallows', L0: 1 }, { id: 'reef', L0: 3 }, { id: 'lanes', L0: 6 }, { id: 'maelstrom', L0: 9 }]; const ringEdge = L => SAFE_R + (L - 1) * ZONE_STEP;";

test("#118 toast queue: warnings jump tips, repeats fold, the weakest fall off the end", () => {
  const g = boot(["js/notices.js"]);
  const q = g.json(`(() => {
    let q = [];
    const add = (msg, pri, front) => { q = toastQueued(q, { msg, at: 0, pri }, front); };
    add("tip1", TOAST_TIP); add("news1", 0); add("tip1", TOAST_TIP); add("warn", TOAST_WARN);
    return q.map(x => x.msg);
  })()`);
  assert.deepEqual(q, ["warn", "news1", "tip1"], "warn first, then news, then the tip, and tip1 appears once");
  const full = g.json(`(() => {
    let q = [];
    for (const m of ["a", "b", "c", "d"]) q = toastQueued(q, { msg: m, at: 0, pri: 0 }, false);
    q = toastQueued(q, { msg: "tip", at: 0, pri: TOAST_TIP }, false);
    q = toastQueued(q, { msg: "warn", at: 0, pri: TOAST_WARN }, false);
    return q.map(x => x.msg);
  })()`);
  assert.deepEqual(full, ["warn", "a", "b", "c"], "a full queue drops the tip, keeps the warning, and the order of equals");
});

test("#118 lane: a notice that meets the ship is lifted clear; with no room above it is not (it shrinks)", () => {
  const g = boot(["js/hud-stack.js"]);
  const ship = "{ left: 400, right: 500, top: 300, bottom: 400 }";
  assert.equal(g.run(`laneTop({ left: 380, right: 520, top: 100, bottom: 160 }, [${ship}])`), 100, "clear of the ship: stays put");
  const top = g.run(`laneTop({ left: 380, right: 520, top: 270, bottom: 330 }, [${ship}])`);
  assert.ok(top <= 300 - 60 - 8 + 1 && top >= 6, "lifted so its bottom is above the ship's top (with the gap): " + top);
  assert.equal(g.run(`laneTop({ left: 380, right: 520, top: 270, bottom: 330 }, [${ship}], 250)`), null, "the floor stops the lift: no fit");
  assert.equal(g.run(`laneTop({ left: 0, right: 50, top: 270, bottom: 330 }, [${ship}])`), 270, "beside the ship: no overlap");
});

test("#114 sea ahead: the first dangerous sea outward, warned about 15 s before the line", () => {
  const g = boot(["js/novice.js"], WORLD);
  const lanes = g.run("ringEdge(6)");
  const a = g.json("seaAheadOf(1000, id => id === 'lanes' || id === 'maelstrom')");
  assert.equal(a.sea.id, "lanes", "the Navy Lanes come first");
  assert.equal(a.dEdge, lanes - 1000);
  assert.equal(g.run("seaAheadOf(lanesPast = ringEdge(6) + 10, id => id === 'lanes')"), null, "already inside it: the red banner has it");
  assert.equal(g.json("seaAheadOf(1000, id => id === 'maelstrom')").sea.id, "maelstrom");
  assert.equal(g.run("seaAheadOf(1000, () => false)"), null, "a strong captain is not warned");
  // 1000 px short of a sea at 70 px/s is 14 s away: due; at 40 px/s it is 25 s: not yet
  assert.equal(g.run(`seaAheadDue(1000, 70, true, false)`), true);
  assert.equal(g.run(`seaAheadDue(1000, 40, true, false)`), false);
});

test("#114 safety hints: way-home chip under 40% hull, the lesson's stray radius, the edge of the chart", () => {
  const g = boot(["js/safety-hints.js"], WORLD + "const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y); const edgeMeters = px => px / 2;");
  assert.equal(g.run("homeChipOn(0.39, 1200)"), true);
  assert.equal(g.run("homeChipOn(0.41, 1200)"), false, "a healthy hull needs no chip");
  assert.equal(g.run("homeChipOn(0.1, 100)"), false, "in sight of the harbor: no chip");
  assert.ok(Math.abs(g.run("homeHeading({ x: 0, y: 0 }, { x: 0, y: 10 })") - Math.PI / 2) < 1e-9, "harbor to the south: the arrow points down the screen");
  assert.deepEqual(g.json("chartEdgeInfo(7900, 4000, 50, 0)"), { d: 100, out: true }, "100 px off the east border, still sailing east");
  assert.equal(g.json("chartEdgeInfo(7900, 4000, -50, 0)").out, false, "sailing away from the border");
  assert.equal(g.json("chartEdgeInfo(4000, 30, 0, -5)").out, true, "north border");
  assert.ok(g.run("TUT_STRAY_R") < g.run("2400"), "inside the practice waters");
});
