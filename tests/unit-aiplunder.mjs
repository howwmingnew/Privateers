// Unit tests for AI plunder (js/ai-plunder.js): the level price, what a level adds, who may plunder, how a ship picks a crate
// and gives up on one. Scripts load into one node:vm context with the few game globals the module reads stubbed.
// Usage: node --test tests/unit-aiplunder.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/ai-plunder.js"];
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
const ctx = vm.createContext({
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: { language: "en-US" }, document: dom, window: dom,
  matchMedia: () => ({ matches: false, addEventListener() {} }), console, setTimeout, clearTimeout, performance,
});
vm.runInContext(`var S = { time: { now: 0, delayedCall() {} }, tweens: { killTweensOf() {}, add() {} } }, crates = [], enemies = [], paused = false, docked = false;
  var run = null; function runActive() { return run !== null; } function runKind() { return run; }
  function onScreen() { return false; } function floatText() {} function sfx() {} function threatLevelOf(e) { return e.L; }`, ctx);
for (const f of FILES) vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);
const ship = (over = "") => run(`({ alive: true, faction: "pirate", L: 3, x: 0, y: 0, maxHp: 100, hp: 100, guns: { left: [{ dmg: 10 }], right: [{ dmg: 10 }] }, up: 0, ${over} })`);

test("price: grows with the ship's level and with levels already gained", () => {
  assert.ok(run("aipCost(4, 0)") > run("aipCost(3, 0)"));
  assert.ok(run("aipCost(3, 1)") > run("aipCost(3, 0)"));
  assert.equal(run("aipCost(3, 2)"), Math.round(run("enemyStats(3, false).loot") * run("AIP_COST_K * (1 + AIP_COST_GROW * 2)")));
});

test("a level adds hull and gun damage, and the badge reads a level higher", () => {
  const e = ship(); ctx.e = e;
  run("aipLevelUp(e)");
  assert.equal(e.up, 1);
  assert.ok(Math.abs(e.maxHp - 100 * run("AIP_HP")) < 1e-9 && e.hp > 100);
  assert.ok(Math.abs(e.guns.left[0].dmg - 10 * run("AIP_DMG")) < 1e-9);
  assert.equal(e.threatL, 4);
});

test("loot below the price buys nothing; reaching it buys one level and keeps the remainder", () => {
  const e = ship(); ctx.e = e; const cost = run("aipCost(3, 0)");
  e.stolen = cost - 1; run("aipGrow(e)"); assert.equal(e.up, 0);
  e.stolen = cost + 1; run("aipGrow(e)"); assert.equal(e.up, 1);
  assert.equal(e.stolen - e.spent, 1);
});

test("a huge haul stops at AIP_MAX_UP", () => {
  const e = ship(); ctx.e = e; e.stolen = 1e9; run("aipGrow(e)");
  assert.equal(e.up, run("AIP_MAX_UP"));
});

test("who plunders: pirates and navy only, never bosses, escorts, merchants, forts, fireships, the dead, or a daily run", () => {
  for (const [over, want] of [["", true], ['faction: "navy"', true], ['faction: "merchant"', false], ["boss: 'ned'", false], ["escortOf: 'ned'", false],
    ["merchant: true", false], ["fixed: true", false], ["A: { boom: 1 }", false], ["alive: false", false]]) {
    ctx.e = ship(over); assert.equal(run("aipOn(e)"), want, over || "plain pirate");
  }
  ctx.e = ship(); run('run = "daily"'); assert.equal(run("aipOn(e)"), false, "daily"); run('run = "seed"'); assert.equal(run("aipOn(e)"), true, "seed run"); run("run = null");
});

const crate = (x, y, v, over = "") => run(`({ x: ${x}, y: ${y}, value: ${v}, t: 0, wreck: null, ${over} })`);
const far = 3000;   // well outside the harbor's safe waters
test("seek: heads for the richest near crate, ignores far ones, wrecks and the safe harbor", () => {
  const e = ship(`x: ${far}, y: ${far}`); ctx.e = e;
  ctx.crates.length = 0;
  assert.equal(run("aipSeek(e, 0, 0.1)"), null, "nothing to seek");
  ctx.crates.push(crate(far + 1000, far, 99));            // too far
  ctx.crates.push(crate(far + 100, far, 10, "wreck: {}"));   // a captain's wreck
  assert.equal(run("aipSeek(e, 0, 0.1)"), null);
  ctx.crates.push(crate(far + 100, far, 10), crate(far, far + 200, 60));
  const s = run("aipSeek(e, 0, 0.1)");
  assert.ok(s && Math.abs(s.desired - Math.PI / 2) < 1e-9, "the 60-value crate to the south");
});

test("seek: a ship fighting a near target ignores loot; a far target does not hold it", () => {
  const e = ship(`x: ${far}, y: ${far}, target: {}`); ctx.e = e;
  ctx.crates.length = 0; ctx.crates.push(crate(far + 100, far, 10));
  assert.equal(run("aipSeek(e, 300, 0.1)"), null);
  assert.ok(run("aipSeek(e, AIP_BREAK + 50, 0.1)"));
});

test("seek: gives up on a crate after AIP_PATIENCE seconds and tries it again later", () => {
  const e = ship(`x: ${far}, y: ${far}`); ctx.e = e;
  ctx.crates.length = 0; ctx.crates.push(crate(far + 100, far, 10));
  assert.ok(run("aipSeek(e, 0, 0.1)"));
  assert.equal(run("aipSeek(e, 0, AIP_PATIENCE + 1)"), null);
  assert.equal(run("aipSeek(e, 0, 0.1)"), null, "still skipped");
  run("S.time.now = 31000");
  assert.ok(run("aipSeek(e, 0, 0.1)"), "tries again after the pause");
});

test("scoop: a ship on a crate takes all of it and may level", () => {
  const e = ship(`x: ${far}, y: ${far}`); ctx.e = e;
  ctx.crates.length = 0; ctx.enemies.length = 0; ctx.enemies.push(e);
  const c = crate(far + 10, far, run("aipCost(3, 0)") + 5); ctx.crates.push(c);
  run("aipScoop()");
  assert.equal(c.value, 0); assert.equal(e.up, 1); assert.equal(e.stolen, run("aipCost(3, 0)") + 5);
});
