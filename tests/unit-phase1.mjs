// Unit tests for phase 1 logic (out-of-combat repair, powder-magazine crits, first-voyage ambush): pure functions only,
// the scripts load into one node:vm context, as in tests/unit.mjs. Usage: node --test tests/unit-phase1.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/repair.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);

// A fresh page load. `extra` = more globals the scripts may touch at load time.
function boot(extra = {}) {
  const store = new Map();
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: { language: "en-US" }, document: { addEventListener() {} },
    console: { log() {}, warn() {}, error: (...a) => { throw new Error(a.join(" ")); } }, setTimeout, clearTimeout, ...extra,
  });
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}

test("repair: nothing mends until REPAIR_DELAY seconds after the last hit", () => {
  const g = boot();
  assert.equal(g.run("REPAIR_DELAY"), 3);
  const early = g.json("repairStep(2.5, 50, 100, 0.4, false)");   // 2.9 s idle: still waiting
  assert.deepEqual(early, { idle: 2.9, hp: 50 });
  const after = g.json("repairStep(3, 50, 100, 1, false)");
  assert.equal(after.hp, 51);                                    // 1% of max hull per second
  assert.equal(after.idle, 4);
});

test("repair: a hull at full stays full, and mending never overshoots", () => {
  const g = boot();
  assert.equal(g.json("repairStep(9, 100, 100, 1, false)").hp, 100);
  assert.equal(g.json("repairStep(9, 99.8, 100, 1, false)").hp, 100);
});

test("repair: fire or a gun-port warning blocks it and restarts the clock", () => {
  const g = boot();
  assert.deepEqual(g.json("repairStep(20, 40, 100, 1, true)"), { idle: 0, hp: 40 });
});

test("repair: empty to full takes about 100 s of calm", () => {
  const g = boot();
  const t = g.run(`(() => { let s = { idle: 3, hp: 0 }, n = 0; while (s.hp < 100 && n < 1e5) { s = repairStep(s.idle, s.hp, 100, 0.05, false); n++; } return n * 0.05; })()`);
  assert.ok(t > 99 && t < 101.5, `took ${t} s`);
});
