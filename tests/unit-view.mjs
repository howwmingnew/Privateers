// Unit tests for the screen-sized circles (js/view.js fillDisc / strokeRing / strokeArc): enough segments that no chord
// strays more than ARC_ERR device px from the circle, never more than Phaser's own 100, and the same path a Graphics
// arc would trace. Loaded into one node:vm context with a stand-in Graphics that records its calls.
// Usage: node --test tests/unit-view.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/view.js"];
const ctx = vm.createContext({ console, Math, localStorage: { getItem: () => null, setItem() {} }, navigator: { language: "en-US" } });
vm.runInContext("const document = new Proxy(function(){}, { get: () => document, apply: () => document });", ctx);
for (const f of FILES) vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);
const ERR = run("ARC_ERR"), TAU = Math.PI * 2;

// A Graphics stand-in: records the path commands and the points, at a given camera zoom.
function fakeG(zoom) {
  const g = { scene: { cameras: { main: { zoom } } }, cmds: [], pts: [] };
  for (const k of ["beginPath", "closePath", "fillPath", "strokePath"]) g[k] = () => { g.cmds.push(k); return g; };
  for (const k of ["moveTo", "lineTo"]) g[k] = (x, y) => { g.cmds.push(k); g.pts.push({ x, y }); return g; };
  return g;
}
const sag = (rs, span, n) => rs * (1 - Math.cos(span / n / 2));   // how far a chord's middle falls inside the circle
// The worst miss, in device px, of a recorded polygon round (cx, cy) against radius r: its corners and its chords' middles.
function miss(g, cx, cy, r, closed) {
  const z = g.scene.cameras.main.zoom, pts = closed ? [...g.pts, g.pts[0]] : g.pts;
  let worst = 0;
  pts.forEach((p, i) => {
    worst = Math.max(worst, Math.abs(Math.hypot(p.x - cx, p.y - cy) - r) * z);
    if (i) { const q = pts[i - 1]; worst = Math.max(worst, Math.abs(Math.hypot((p.x + q.x) / 2 - cx, (p.y + q.y) / 2 - cy) - r) * z); }
  });
  return worst;
}

test("arcSegs: every chord within ARC_ERR device px, from a 1-px dot to a 400-px ring", () => {
  for (const rs of [1.6, 2, 4, 9.6, 30, 100, 400]) for (const span of [0.2, 0.87, Math.PI, TAU]) {
    const n = run(`arcSegs(${span}, ${rs})`);
    if (n < 100) assert.ok(sag(rs, span, n) <= ERR + 1e-9, `r ${rs} span ${span}: ${n} segments sag ${sag(rs, span, n)}`);
  }
});

test("arcSegs: never more than Phaser's 100, a full circle never under 7, tiny dots stay round", () => {
  assert.equal(run("arcSegs(Math.PI * 2, 1e6)"), 100);
  assert.ok(run("arcSegs(Math.PI * 2, 0)") >= 7);
  assert.ok(run("arcSegs(Math.PI * 2, 1)") >= 7);
  assert.ok(run("arcSegs(0.2, 300)") >= 1);
  assert.equal(run("arcSegs(0, 50)"), 1);   // an empty progress arc: one zero-length segment, which Phaser skips
  assert.ok(run("arcSegs(Math.PI * 2, 9.6)") < 20, "a 4-px aim dot at zoom 2.4 is a handful of segments, not 100");
});

test("fillDisc: one closed polygon straddling the circle, sized by the on-screen radius", () => {
  const near = fakeG(1), far = fakeG(2.4);
  run("fillDisc")(near, 10, 20, 4); run("fillDisc")(far, 10, 20, 4);
  assert.deepEqual(near.cmds.slice(0, 2), ["beginPath", "moveTo"]);
  assert.equal(near.cmds.at(-1), "fillPath");
  assert.equal(near.pts.length, run("arcSegs(Math.PI * 2, 4)"));   // no repeated last point: the fill closes itself
  assert.ok(far.pts.length > near.pts.length, "zoomed in, the same dot gets more segments");
  for (const g of [near, far]) assert.ok(miss(g, 10, 20, 4, true) <= ERR * 0.55, `off the circle by ${miss(g, 10, 20, 4, true)} px`);
  // corners out, chord middles in: a 4-px dot keeps its area within 2% (with the corners on the circle it lost 6.5%)
  const area = near.pts.reduce((s, p, i) => { const q = near.pts[(i + 1) % near.pts.length]; return s + ((p.x - 10) * (q.y - 20) - (q.x - 10) * (p.y - 20)) / 2; }, 0);
  assert.ok(Math.abs(area / (Math.PI * 16) - 1) < 0.02, `area ratio ${area / (Math.PI * 16)}`);
});

test("strokeRing closes its path; strokeArc runs from a0 to a1 open", () => {
  const ring = fakeG(1);
  run("strokeRing")(ring, 0, 0, 50);
  assert.deepEqual(ring.cmds.slice(-2), ["closePath", "strokePath"]);
  const arc = fakeG(1), a0 = -Math.PI / 2, a1 = a0 + 0.6 * TAU;
  run("strokeArc")(arc, 5, 5, 30, a0, a1);
  assert.ok(!arc.cmds.includes("closePath"));
  assert.equal(arc.cmds.at(-1), "strokePath");
  const ang = p => Math.atan2(p.y - 5, p.x - 5), turn = a => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
  assert.ok(turn(ang(arc.pts[0]) - a0) < 1e-9 && turn(ang(arc.pts.at(-1)) - a1) < 1e-9, "starts at a0, ends at a1");
  assert.equal(arc.pts.length, run(`arcSegs(${a1 - a0}, 30)`) + 1);
  assert.ok(miss(arc, 5, 5, 30, false) <= ERR * 0.55);
  assert.ok(miss(ring, 0, 0, 50, true) <= ERR * 0.55);
});
