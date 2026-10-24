// Unit tests for phase 1 logic (out-of-combat repair, powder-magazine crits, first-voyage ambush): pure functions only,
// the scripts load into one node:vm context, as in tests/unit.mjs. Usage: node --test tests/unit-phase1.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/repair.js", "js/powder.js"];
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

// ---------- powder-magazine crits ----------
const trig = (o, roll) => ({ rake: true, byPlayer: true, fixed: false, tutorial: false, roll, ...o });

test("powder: only a rake from the player, outside the tutorial, on a roll under 1 in 12", () => {
  const g = boot();
  const t = o => g.run(`powderTrigger(${JSON.stringify(trig(o, o.roll ?? 0.01))})`);
  assert.equal(t({}), true);
  assert.equal(t({ roll: 0.09 }), false, "1/12 is 0.0833");
  assert.equal(t({ rake: false }), false);
  assert.equal(t({ byPlayer: false }), false);
  assert.equal(t({ tutorial: true }), false, "never during the tutorial");
  assert.equal(t({ fixed: true }), false, "shore batteries do not blow up");
});

test("powder: about 1 rake in 12 blows the magazine over many rolls", () => {
  const g = boot();
  const n = g.run(`(() => { let k = 0; for (let i = 0; i < 120000; i++) if (powderTrigger({ rake: true, byPlayer: true, fixed: false, tutorial: false, roll: (i * 0.6180339887) % 1 })) k++; return k / 120000; })()`);
  assert.ok(Math.abs(n - 1 / 12) < 0.003, `rate ${n}`);
});

test("powder: an ordinary ship is finished, a boss is hurt hard but never killed", () => {
  const g = boot();
  assert.equal(g.run("powderSelfDmg({ hp: 80, maxHp: 100 }, 10)"), 80);
  assert.equal(g.run("powderSelfDmg({ boss: 'x', hp: 300, maxHp: 1000 }, 10)"), 250, "25% of max hull");
  assert.equal(g.run("powderSelfDmg({ boss: 'x', hp: 100, maxHp: 1000 }, 10)"), 99, "a wounded boss is left on 1 hp");
});

test("powder: the blast fades with distance, and never kills the player or a boss", () => {
  const g = boot();
  assert.equal(g.run("powderSplash({ maxHp: 100, hp: 100 }, 0)"), 30);
  assert.ok(Math.abs(g.run("powderSplash({ maxHp: 100, hp: 100 }, POWDER_R)") - 12) < 1e-9, "40% at the rim");
  assert.equal(g.run("powderSplash({ isPlayer: true, maxHp: 100, hp: 100 }, 0)"), 15, "the player is hurt");
  assert.equal(g.run("powderSplash({ isPlayer: true, maxHp: 100, hp: 5 }, 0)"), 4, "but left alive");
  assert.equal(g.run("powderSplash({ boss: 'x', maxHp: 1000, hp: 30 }, 0)"), 29);
});
