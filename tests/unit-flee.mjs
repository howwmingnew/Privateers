// Unit tests for fleeing enemies (js/flee.js): who runs and why (gap / hurt, by faction), who never does, how the runner picks
// its heading (away, edge-bent, wind-bent). Pure functions only; scripts load into one node:vm context.
// Usage: node --test tests/unit-flee.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/flee.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
const ctx = vm.createContext({
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
  console: { log() {}, warn() {}, error: (...a) => { throw new Error(a.join(" ")); } }, setTimeout, clearTimeout, performance,
});
for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);
const trig = (...a) => run(`fleeTrigger(${a.map(x => JSON.stringify(x)).join(",")})`);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("gap: a big rating lead sends a ship running on sight, later for the Navy than for merchants", () => {
  assert.equal(trig("merchant", 2, 1, 600, false), "gap");
  assert.equal(trig("pirate", 2, 1, 600, false), null);
  assert.equal(trig("pirate", 4, 1, 600, false), "gap");
  assert.equal(trig("navy", 4, 1, 600, false), null);
  assert.equal(trig("navy", 7, 1, 600, false), "gap");
});

test("gap: only once the player is inside sight", () => {
  assert.equal(trig("pirate", 5, 1, 699, false), "gap");
  assert.equal(trig("pirate", 5, 1, 701, false), null);
});

test("hurt: half-hull pirate retreats from a stronger or equal captain, not from a clearly weaker one", () => {
  assert.equal(trig("pirate", 0, 0.4, 0, true), "hurt");
  assert.equal(trig("pirate", -1, 0.4, 0, true), "hurt");
  assert.equal(trig("pirate", -2, 0.4, 0, true), null);
  assert.equal(trig("pirate", 0, 0.6, 0, true), null);
});

test("hurt: merchants run from anyone, the Navy only from the stronger, and only while being hit", () => {
  assert.equal(trig("merchant", -9, 0.6, 0, true), "hurt");
  assert.equal(trig("merchant", -9, 0.7, 0, true), null);
  assert.equal(trig("navy", 0, 0.3, 0, true), null);
  assert.equal(trig("navy", 1, 0.3, 0, true), "hurt");
  assert.equal(trig("navy", 1, 0.5, 0, true), null);
  assert.equal(trig("pirate", 3, 0.1, 0, false), null);
});

test("unknown kind never runs", () => assert.equal(trig("fort", 99, 0.01, 0, true), null));

test("never runs: bosses, guards, hunters, the Admiral's fleet, escorts, fireships, struck ships, forts, the player", () => {
  const base = "{ alive: true, faction: 'pirate', merchant: false }";
  assert.equal(run(`fleeCan(${base})`), true);
  for (const extra of ["boss: 'b1'", "escortOf: 'b1'", "ally: true", "hunter: true", "admiral: true", "holdSea: true", "struck: true", "fixed: true",
    "isPlayer: true", "A: { boom: true }", "fleeDone: true", "escort: true"])
    assert.equal(run(`fleeCan(Object.assign(${base}, { ${extra} }))`), false, extra);
  assert.equal(run("fleeCan({ alive: false, faction: 'pirate' })"), false);
});

test("a convoy's escort brig does not pick running itself but follows its lead", () => {
  assert.equal(run("fleeFollows({ alive: true, faction: 'merchant', escort: true })"), true);
  assert.equal(run("fleeFollows({ alive: true, faction: 'navy', boss: 'x' })"), false);
});

test("kinds: a fluyt is a merchant whatever its flag", () => {
  assert.equal(run("fleeKind({ merchant: true, faction: 'merchant' })"), "merchant");
  assert.equal(run("fleeKind({ merchant: false, faction: 'navy' })"), "navy");
});

test("heading: straight away from the threat", () => {
  near(run("fleeAway({ x: 4000, y: 4000 }, { x: 3000, y: 4000 })"), 0);
  near(run("fleeAway({ x: 4000, y: 4000 }, { x: 4000, y: 5000 })"), -Math.PI / 2);
});

test("heading: near the map edge it bends inward instead of into the corner", () => {
  const a = run("fleeAway({ x: 100, y: 4000 }, { x: 1100, y: 4000 })");   // fleeing west from a ship to the east, 100 px off the west edge
  assert.ok(Math.cos(a) > -0.5, `heading ${a} should no longer run into the edge`);
});

test("wind: calm sea (flat factor) keeps the straight-away course", () => {
  near(run("fleeHeading(1.2, () => 1)"), 1.2);
});

test("wind: a fair wind off to one side pulls the course into it, within the span", () => {
  const h = run("fleeHeading(1.2, a => 1 + 3 * Math.max(0, Math.cos(a - 1.7)) ** 8, FLEE.windSpan, FLEE.windStep)");
  assert.ok(h > 1.2 && h <= 1.2 + 1 + 1e-9, `${h}`);
  near(run("fleeHeading(1.2, a => a > 3 ? 9 : 1)"), 1.2);   // a rich wind out of reach is not chased
});

test("wind: never bends beyond the span even in a gale from the threat's side", () => {
  const h = run("fleeHeading(0, a => 1 + 5 * Math.max(0, Math.cos(a - 3)))");
  assert.ok(Math.abs(h) <= 1 + 1e-9);
});

test("config: courage ordering merchant < pirate < navy", () => {
  const F = JSON.parse(run("JSON.stringify(FLEE)"));
  assert.ok(F.merchant.gap < F.pirate.gap && F.pirate.gap < F.navy.gap);
  assert.ok(F.merchant.hp > F.pirate.hp && F.pirate.hp > F.navy.hp);
  assert.ok(F.escape > F.sight);
});

test("strings in both languages", () => {
  assert.equal(run("STR.en.fleeTag"), "Fleeing");
  assert.equal(run("STR.zh.fleeTag"), "逃跑中");
  assert.ok(run("STR.en.fleeCall") && run("STR.zh.fleeCall"));
});
