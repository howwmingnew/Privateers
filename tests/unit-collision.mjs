// Unit tests for collision damage (js/collision.js): speed threshold, normal component, hull-size weighting, cooldown,
// the harbor exception and the never-one-shot rule. Pure functions only, loaded into one node:vm context.
// Usage: node --test tests/unit-collision.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/i18n.js", "js/collision.js"];
const ctx = vm.createContext({ console, Math, Map, localStorage: { getItem: () => null, setItem() {} }, navigator: { language: "en-US" } });
vm.runInContext("const document = new Proxy(function(){}, { get: () => document, apply: () => document });", ctx);
for (const f of FILES) vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("crashFrac: nothing at or under the speed threshold", () => {
  assert.equal(run("crashFrac(0, CRASH_ISLAND_K)"), 0);
  assert.equal(run("crashFrac(CRASH_MIN_V, CRASH_ISLAND_K)"), 0);
  assert.equal(run("crashFrac(-200, CRASH_ISLAND_K)"), 0);   // sailing away
  assert.ok(run("crashFrac(CRASH_MIN_V + 1, CRASH_ISLAND_K)") > 0);
});

test("crashFrac: grows with speed, full K at CRASH_FULL_V, capped above", () => {
  near(run("crashFrac(CRASH_FULL_V, CRASH_ISLAND_K)"), run("CRASH_ISLAND_K"));
  assert.ok(run("crashFrac(100, 0.3)") < run("crashFrac(140, 0.3)"));
  near(run("crashFrac(9999, 0.3)"), run("0.3 * CRASH_OVER_MAX"));
});

test("normal component: a graze along the coast is far gentler than a head-on hit", () => {
  // speed 150 at 75 degrees to the shore normal: component 39 (under the threshold) vs 150 head-on
  const head = run("crashFrac(150, CRASH_ISLAND_K)"), graze = run("crashFrac(150 * Math.cos((75 * Math.PI / 180)), CRASH_ISLAND_K)");
  assert.equal(graze, 0);
  assert.ok(head >= 0.2);
});

test("hull mass share: the heavy hull takes less, the light one more, both bounded", () => {
  const heavy = run("massShare(3, 1)"), light = run("massShare(1, 3)");
  assert.ok(light > 1 && heavy < 1);
  near(run("massShare(2, 2)"), 1);
  assert.equal(run("massShare(1, 1000)"), run("CRASH_MASS_MAX"));
  assert.equal(run("massShare(1000, 1)"), run("CRASH_MASS_MIN"));
  // real hulls: a ship of the line outweighs a sloop, so the sloop is hurt more
  assert.ok(run("hullMass({ hl: 120 / 2 - 21, hw: 21 })") > run("hullMass({ hl: 64 / 2 - 12, hw: 12 })"));
});

test("full-speed island hit: clearly hurts, never a one-hit kill above the spare line", () => {
  const frac = run("crashFrac(CRASH_FULL_V * 2, CRASH_ISLAND_K)");
  const dmg = run(`crashDamage(${frac}, 100, 100, true)`);
  assert.ok(dmg >= 20 && dmg < 100);
  assert.equal(run(`crashDamage(5, 100, 100, true)`), 99);   // an absurd blow still leaves 1 hp
  assert.equal(run(`crashDamage(5, 100, 40, true)`), 39);
  assert.equal(run(`crashDamage(0.3, 100, 10, true)`), 30);  // already crippled: it can kill
});

test("an AI is never killed by rock, whatever its hull", () => {
  assert.equal(run("crashDamage(0.4, 100, 10, false)"), 9);
  assert.equal(run("crashDamage(0.4, 100, 1, false)"), 0);
});

test("contact: only a fresh impact counts; pressing on or scraping the same rock is one blow", () => {
  run("var book = new Map(); var isl = {}, isl2 = {};");
  assert.equal(run("crashContact(book, isl, 10)"), true);        // first touch
  assert.equal(run("var more = 0; for (let t = 10.016; t < 11.5; t += 0.016) if (crashContact(book, isl, t)) more++; more"), 0);   // touching every frame for 1.5 s
  assert.equal(run("crashContact(book, isl, 11.6 + CRASH_GAP)"), true);   // came away and hit again
  assert.equal(run("crashContact(book, isl2, 11.7)"), true);     // another rock is its own contact
});

test("cooldown: a pair is hurt once per CRASH_COOLDOWN", () => {
  run("var b2 = new Map(), k = {}; crashContact(b2, k, 20);");
  assert.equal(run("crashDue(b2, k, 20)"), true);
  assert.equal(run("crashDue(b2, k, 20.1)"), false);
  assert.equal(run("crashDue(b2, k, 20 + CRASH_COOLDOWN + 0.01)"), true);
});

test("harbor island, safe waters, outpost and a docked player are harmless", () => {
  assert.equal(run("crashSafe({}, { harbor: true })"), true);
  assert.equal(run("crashSafe({}, { outpost: true })"), true);
  assert.equal(run("var docked = true; crashSafe({ isPlayer: true }, {})"), true);
  assert.equal(run("docked = false; crashSafe({ isPlayer: true }, {})"), false);
  assert.equal(run("globalThis.inSafe = s => s.safe; crashSafe({ safe: true }, {})"), true);
});
