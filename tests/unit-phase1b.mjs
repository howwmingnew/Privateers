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
